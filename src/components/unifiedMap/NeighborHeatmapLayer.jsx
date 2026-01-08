// src/components/unifiedMap/NeighborHeatmapLayer.jsx
import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { Rectangle, InfoWindow, useGoogleMap } from '@react-google-maps/api';

const getRSRPColor = (rsrp) => {
  if (rsrp === null || rsrp === undefined) return '#9CA3AF';
  if (rsrp >= -80) return '#10B981';
  if (rsrp >= -90) return '#34D399';
  if (rsrp >= -100) return '#FBBF24';
  if (rsrp >= -110) return '#F97316';
  return '#EF4444';
};

const getRSRPQuality = (rsrp) => {
  if (rsrp === null || rsrp === undefined) return 'Unknown';
  if (rsrp >= -80) return 'Excellent';
  if (rsrp >= -90) return 'Good';
  if (rsrp >= -100) return 'Fair';
  if (rsrp >= -110) return 'Poor';
  return 'Very Poor';
};

const PCI_COLORS = [
  '#3B82F6',
  '#EF4444',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
  '#F43F5E',
  '#6366F1',
  '#14B8A6',
  '#F97316',
];

const getPCIColor = (pci) => {
  const index = Math.abs(parseInt(pci || 0)) % PCI_COLORS.length;
  return PCI_COLORS[index];
};

const getSquareBounds = (lat, lng, radiusMeters) => {
  const earthRadius = 6378137;
  const dLat = (radiusMeters / earthRadius) * (180 / Math.PI);
  const dLng = (radiusMeters / earthRadius) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

  return {
    north: lat + dLat,
    south: lat - dLat,
    east: lng + dLng,
    west: lng - dLng
  };
};

const NeighborHeatmapLayer = React.memo(({
  allNeighbors = [],
  showNeighbors = false,
  selectedMetric = 'rsrp',
  radius = 30,
  opacity = 0.7,
  useHeatmap = true,
  onNeighborClick,
}) => {
  const map = useGoogleMap();
  const heatmapRef = useRef(null);
  const isCleanedUpRef = useRef(false);
  
  const [isVisualizationReady, setIsVisualizationReady] = useState(false);
  const [selectedNeighbor, setSelectedNeighbor] = useState(null);

  useEffect(() => {
    const checkVisualization = () => {
      if (window.google?.maps?.visualization) {
        setIsVisualizationReady(true);
        return true;
      }
      return false;
    };

    if (checkVisualization()) return;

    const interval = setInterval(() => {
      if (checkVisualization()) {
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, []);

  const neighbors = useMemo(() => {
    if (!showNeighbors || !allNeighbors?.length) {
      return [];
    }
    
    return allNeighbors
      .filter(n => {
        const lat = parseFloat(n.lat ?? n.latitude ?? n.Lat);
        const lng = parseFloat(n.lng ?? n.longitude ?? n.Lng ?? n.lon);
        return !isNaN(lat) && !isNaN(lng) && 
               lat >= -90 && lat <= 90 && 
               lng >= -180 && lng <= 180;
      })
      .map((n) => {
        const lat = parseFloat(n.lat ?? n.latitude ?? n.Lat);
        const lng = parseFloat(n.lng ?? n.longitude ?? n.Lng ?? n.lon);
        const rsrp = n.rsrp !== null && n.rsrp !== undefined ? parseFloat(n.rsrp) : null;
        
        return {
          ...n,
          lat,
          lng,
          rsrp: isNaN(rsrp) ? null : rsrp,
          color: rsrp !== null ? getRSRPColor(rsrp) : getPCIColor(n.pci),
          quality: rsrp !== null ? getRSRPQuality(rsrp) : null,
        };
      });
  }, [allNeighbors, showNeighbors]);

  const gradient = useMemo(() => [
    'rgba(0, 0, 0, 0)',
    'rgba(0, 255, 255, 0.3)',
    'rgba(0, 200, 255, 0.4)',
    'rgba(0, 150, 255, 0.5)',
    'rgba(0, 100, 255, 0.6)',
    'rgba(0, 50, 255, 0.65)',
    'rgba(50, 0, 255, 0.7)',
    'rgba(100, 0, 200, 0.75)',
    'rgba(150, 0, 150, 0.8)',
    'rgba(200, 0, 100, 0.85)',
    'rgba(255, 0, 50, 0.9)',
    'rgba(255, 0, 0, 1)',
  ], []);

  const cleanupHeatmap = useCallback(() => {
    if (heatmapRef.current) {
      try {
        heatmapRef.current.setMap(null);
        heatmapRef.current.setData([]);
      } catch (error) {
        console.warn('Heatmap cleanup warning:', error);
      }
      heatmapRef.current = null;
    }
    isCleanedUpRef.current = true;
  }, []);

  useEffect(() => {
    isCleanedUpRef.current = false;

    if (!showNeighbors) {
      cleanupHeatmap();
      return cleanupHeatmap;
    }

    if (!map) {
      return cleanupHeatmap;
    }

    if (!useHeatmap) {
      cleanupHeatmap();
      return cleanupHeatmap;
    }

    if (!isVisualizationReady) {
      return cleanupHeatmap;
    }

    if (neighbors.length === 0) {
      cleanupHeatmap();
      return cleanupHeatmap;
    }

    const heatmapData = neighbors.map((n) => {
      let weight = 0.5;
      const value = n[selectedMetric];
      
      if (value !== null && value !== undefined && !isNaN(value)) {
        if (selectedMetric === 'rsrp') {
          weight = Math.max(0.1, Math.min(1, (value + 140) / 100));
        } else if (selectedMetric === 'rsrq') {
          weight = Math.max(0.1, Math.min(1, (value + 20) / 20));
        } else if (selectedMetric === 'sinr') {
          weight = Math.max(0.1, Math.min(1, (value + 10) / 40));
        }
      }

      return {
        location: new window.google.maps.LatLng(n.lat, n.lng),
        weight: weight,
      };
    });

    cleanupHeatmap();

    try {
      heatmapRef.current = new window.google.maps.visualization.HeatmapLayer({
        data: heatmapData,
        map: map,
        radius: radius,
        opacity: opacity,
        dissipating: true,
        gradient: gradient,
        maxIntensity: 10,
      });
      
      isCleanedUpRef.current = false;
    } catch (error) {
      console.error('Heatmap creation error:', error);
      cleanupHeatmap();
    }

    return () => {
      if (!isCleanedUpRef.current) {
        cleanupHeatmap();
      }
    };
  }, [
    map, 
    showNeighbors, 
    neighbors, 
    useHeatmap, 
    isVisualizationReady, 
    selectedMetric, 
    radius, 
    opacity, 
    gradient,
    cleanupHeatmap
  ]);

  useEffect(() => {
    return () => {
      if (heatmapRef.current) {
        try {
          heatmapRef.current.setMap(null);
          heatmapRef.current.setData([]);
        } catch (e) {
        }
        heatmapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (heatmapRef.current && showNeighbors && useHeatmap) {
      try {
        heatmapRef.current.setOptions({
          radius: radius,
          opacity: opacity,
        });
      } catch (e) {
      }
    }
  }, [radius, opacity, showNeighbors, useHeatmap]);

  const handleCircleClick = useCallback((neighbor) => {
    setSelectedNeighbor(neighbor);
    onNeighborClick?.(neighbor);
  }, [onNeighborClick]);

  useEffect(() => {
    if (!showNeighbors) {
      setSelectedNeighbor(null);
    }
  }, [showNeighbors]);

  if (!showNeighbors || neighbors.length === 0) {
    return null;
  }

  return (
    <>
      {!useHeatmap && neighbors.map((n, idx) => {
        const bounds = getSquareBounds(n.lat, n.lng, n.isCollision ? 40 : 25);
        
        return (
          <Rectangle
            key={`neighbor-sq-${n.id || n.pci || idx}-${n.lat}-${n.lng}`}
            bounds={bounds}
            options={{
              fillColor: n.isCollision ? '#DC2626' : n.color,
              fillOpacity: n.isCollision ? 0.65 : 0.7,
              strokeColor: n.isCollision ? '#991B1B' : n.color,
              strokeWeight: n.isCollision ? 2.5 : 1.5,
              strokeOpacity: 0.9,
              clickable: true,
              zIndex: n.isCollision ? 300 : 200,
            }}
            onClick={() => handleCircleClick(n)}
          />
        );
      })}

      {selectedNeighbor && (
        <InfoWindow
          position={{ lat: selectedNeighbor.lat, lng: selectedNeighbor.lng }}
          onCloseClick={() => setSelectedNeighbor(null)}
          options={{
            pixelOffset: new window.google.maps.Size(0, -15),
            maxWidth: 240,
            disableAutoPan: false,
          }}
        >
          <div className="p-2 min-w-[200px] font-sans">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <span 
                  className="w-4 h-4 rounded-full shadow-sm border border-white/50"
                  style={{ backgroundColor: selectedNeighbor.color }}
                />
                <span className="font-bold text-gray-800 text-sm">
                  PCI: {selectedNeighbor.pci ?? 'N/A'}
                </span>
              </div>
              {selectedNeighbor.isCollision && (
                <span className="text-[9px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
                  COLLISION
                </span>
              )}
            </div>
            
            {selectedNeighbor.quality && (
              <div className="mb-2">
                <span 
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ 
                    backgroundColor: `${selectedNeighbor.color}20`,
                    color: selectedNeighbor.color,
                    border: `1px solid ${selectedNeighbor.color}40`
                  }}
                >
                  {selectedNeighbor.quality} Signal
                </span>
              </div>
            )}
            
            <div className="space-y-1.5">
              {selectedNeighbor.cell_id && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Cell ID</span>
                  <span className="font-medium text-gray-700 font-mono">
                    {selectedNeighbor.cell_id}
                  </span>
                </div>
              )}
              
              {selectedNeighbor.rsrp !== null && (
                <div className="flex justify-between text-xs items-center">
                  <span className="text-gray-500">RSRP</span>
                  <div className="flex items-center gap-1.5">
                    <span 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getRSRPColor(selectedNeighbor.rsrp) }}
                    />
                    <span 
                      className="font-semibold"
                      style={{ color: getRSRPColor(selectedNeighbor.rsrp) }}
                    >
                      {selectedNeighbor.rsrp?.toFixed?.(1) ?? selectedNeighbor.rsrp} dBm
                    </span>
                  </div>
                </div>
              )}
              
              {selectedNeighbor.rsrq !== null && selectedNeighbor.rsrq !== undefined && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">RSRQ</span>
                  <span className="font-medium text-gray-700">
                    {typeof selectedNeighbor.rsrq === 'number' 
                      ? selectedNeighbor.rsrq.toFixed(1) 
                      : selectedNeighbor.rsrq} dB
                  </span>
                </div>
              )}
              
              {selectedNeighbor.sinr !== null && selectedNeighbor.sinr !== undefined && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">SINR</span>
                  <span className="font-medium text-gray-700">
                    {typeof selectedNeighbor.sinr === 'number' 
                      ? selectedNeighbor.sinr.toFixed(1) 
                      : selectedNeighbor.sinr} dB
                  </span>
                </div>
              )}
              
              {selectedNeighbor.band && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Band</span>
                  <span className="font-semibold text-blue-600">
                    B{selectedNeighbor.band}
                  </span>
                </div>
              )}

              {selectedNeighbor.earfcn && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">EARFCN</span>
                  <span className="font-medium text-gray-700 font-mono">
                    {selectedNeighbor.earfcn}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-2 pt-2 border-t border-gray-100">
              <div className="text-[10px] text-gray-400 font-mono">
                {selectedNeighbor.lat.toFixed(6)}, {selectedNeighbor.lng.toFixed(6)}
              </div>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
});

NeighborHeatmapLayer.displayName = 'NeighborHeatmapLayer';

export default NeighborHeatmapLayer;