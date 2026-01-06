// src/components/unifiedMap/NeighborHeatmapLayer.jsx
import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { Circle, InfoWindow, useGoogleMap } from '@react-google-maps/api';

// ============================================
// COLOR UTILITIES
// ============================================

// Enhanced RSRP colors with better contrast
const getRSRPColor = (rsrp) => {
  if (rsrp === null || rsrp === undefined) return '#9CA3AF';
  if (rsrp >= -80) return '#10B981';  // Excellent - Emerald
  if (rsrp >= -90) return '#34D399';  // Good - Green
  if (rsrp >= -100) return '#FBBF24'; // Fair - Amber
  if (rsrp >= -110) return '#F97316'; // Poor - Orange
  return '#EF4444';                    // Very Poor - Red
};

// Get RSRP quality label
const getRSRPQuality = (rsrp) => {
  if (rsrp === null || rsrp === undefined) return 'Unknown';
  if (rsrp >= -80) return 'Excellent';
  if (rsrp >= -90) return 'Good';
  if (rsrp >= -100) return 'Fair';
  if (rsrp >= -110) return 'Poor';
  return 'Very Poor';
};

// Enhanced PCI colors for better distinction
const PCI_COLORS = [
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F43F5E', // Rose
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#F97316', // Orange
];

const getPCIColor = (pci) => {
  const index = Math.abs(parseInt(pci || 0)) % PCI_COLORS.length;
  return PCI_COLORS[index];
};

// ============================================
// MAIN COMPONENT
// ============================================

const NeighborHeatmapLayer = React.memo(({
  allNeighbors = [],
  showNeighbors = false,
  selectedMetric = 'rsrp',
  radius = 30,
  opacity = 0.7,
  useHeatmap = true,
  onNeighborClick,
}) => {
  // Get map instance from context
  const map = useGoogleMap();
  
  // Refs for cleanup
  const heatmapRef = useRef(null);
  const isCleanedUpRef = useRef(false);
  
  // State
  const [isVisualizationReady, setIsVisualizationReady] = useState(false);
  const [selectedNeighbor, setSelectedNeighbor] = useState(null);

  // ============================================
  // CHECK VISUALIZATION LIBRARY
  // ============================================
  useEffect(() => {
    const checkVisualization = () => {
      if (window.google?.maps?.visualization) {
        console.log('✅ Google Maps Visualization library ready');
        setIsVisualizationReady(true);
        return true;
      }
      return false;
    };

    // Check immediately
    if (checkVisualization()) return;

    // Poll for library
    const interval = setInterval(() => {
      if (checkVisualization()) {
        clearInterval(interval);
      }
    }, 200);

    // Cleanup interval
    return () => clearInterval(interval);
  }, []);

  // ============================================
  // PROCESS NEIGHBORS DATA
  // ============================================
  const neighbors = useMemo(() => {
    if (!showNeighbors || !allNeighbors?.length) {
      return [];
    }
    
    return allNeighbors
      .filter(n => {
        // Validate coordinates
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

  // ============================================
  // ENHANCED HEATMAP GRADIENT
  // ============================================
  const gradient = useMemo(() => [
    'rgba(0, 0, 0, 0)',        // Transparent
    'rgba(0, 255, 255, 0.3)',  // Cyan (low intensity)
    'rgba(0, 200, 255, 0.4)',
    'rgba(0, 150, 255, 0.5)',
    'rgba(0, 100, 255, 0.6)',
    'rgba(0, 50, 255, 0.65)',
    'rgba(50, 0, 255, 0.7)',   // Blue-violet
    'rgba(100, 0, 200, 0.75)',
    'rgba(150, 0, 150, 0.8)',  // Purple
    'rgba(200, 0, 100, 0.85)',
    'rgba(255, 0, 50, 0.9)',   // Red-orange
    'rgba(255, 0, 0, 1)',      // Red (high intensity)
  ], []);

  // ============================================
  // CLEANUP FUNCTION
  // ============================================
  const cleanupHeatmap = useCallback(() => {
    if (heatmapRef.current) {
      console.log('🧹 Cleaning up heatmap layer');
      try {
        // Remove from map
        heatmapRef.current.setMap(null);
        // Clear data
        heatmapRef.current.setData([]);
      } catch (error) {
        console.warn('Heatmap cleanup warning:', error);
      }
      heatmapRef.current = null;
    }
    isCleanedUpRef.current = true;
  }, []);

  // ============================================
  // MAIN HEATMAP EFFECT
  // ============================================
  useEffect(() => {
    // Reset cleanup flag
    isCleanedUpRef.current = false;

    // Early exit conditions - cleanup and return
    if (!showNeighbors) {
      console.log('👁️ showNeighbors is false, cleaning up');
      cleanupHeatmap();
      return cleanupHeatmap;
    }

    if (!map) {
      console.log('⏳ Waiting for map instance');
      return cleanupHeatmap;
    }

    if (!useHeatmap) {
      console.log('🔵 Heatmap mode disabled, using circles');
      cleanupHeatmap();
      return cleanupHeatmap;
    }

    if (!isVisualizationReady) {
      console.log('⏳ Waiting for visualization library');
      return cleanupHeatmap;
    }

    if (neighbors.length === 0) {
      console.log('📭 No neighbor data available');
      cleanupHeatmap();
      return cleanupHeatmap;
    }

    // Create heatmap data with weights
    const heatmapData = neighbors.map((n) => {
      let weight = 0.5; // Default weight
      const value = n[selectedMetric];
      
      if (value !== null && value !== undefined && !isNaN(value)) {
        // Normalize weight based on metric type
        if (selectedMetric === 'rsrp') {
          // RSRP: -140 to -40 dBm → 0 to 1
          weight = Math.max(0.1, Math.min(1, (value + 140) / 100));
        } else if (selectedMetric === 'rsrq') {
          // RSRQ: -20 to 0 dB → 0 to 1
          weight = Math.max(0.1, Math.min(1, (value + 20) / 20));
        } else if (selectedMetric === 'sinr') {
          // SINR: -10 to 30 dB → 0 to 1
          weight = Math.max(0.1, Math.min(1, (value + 10) / 40));
        }
      }

      return {
        location: new window.google.maps.LatLng(n.lat, n.lng),
        weight: weight,
      };
    });

    // Cleanup existing heatmap before creating new one
    cleanupHeatmap();

    // Create new heatmap layer
    try {
      console.log(`🔥 Creating heatmap with ${heatmapData.length} points`);
      
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
      console.error('❌ Heatmap creation error:', error);
      cleanupHeatmap();
    }

    // Return cleanup function
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

  // ============================================
  // GUARANTEED CLEANUP ON UNMOUNT
  // ============================================
  useEffect(() => {
    return () => {
      console.log('🔌 NeighborHeatmapLayer unmounting, final cleanup');
      if (heatmapRef.current) {
        try {
          heatmapRef.current.setMap(null);
          heatmapRef.current.setData([]);
        } catch (e) {
          // Ignore errors during unmount
        }
        heatmapRef.current = null;
      }
    };
  }, []);

  // ============================================
  // UPDATE HEATMAP OPTIONS (without recreating)
  // ============================================
  useEffect(() => {
    if (heatmapRef.current && showNeighbors && useHeatmap) {
      try {
        heatmapRef.current.setOptions({
          radius: radius,
          opacity: opacity,
        });
      } catch (e) {
        // Ignore errors
      }
    }
  }, [radius, opacity, showNeighbors, useHeatmap]);

  // ============================================
  // CLICK HANDLER
  // ============================================
  const handleCircleClick = useCallback((neighbor) => {
    setSelectedNeighbor(neighbor);
    onNeighborClick?.(neighbor);
  }, [onNeighborClick]);

  // ============================================
  // CLEAR SELECTION WHEN HIDING
  // ============================================
  useEffect(() => {
    if (!showNeighbors) {
      setSelectedNeighbor(null);
    }
  }, [showNeighbors]);

  // ============================================
  // RENDER
  // ============================================
  
  // Don't render anything if disabled or no data
  if (!showNeighbors || neighbors.length === 0) {
    return null;
  }

  return (
    <>
      {/* ============================================
          CIRCLES (when heatmap mode is off)
          ============================================ */}
      {!useHeatmap && neighbors.map((n, idx) => (
        <Circle
          key={`neighbor-circle-${n.id || n.pci || idx}-${n.lat}-${n.lng}`}
          center={{ lat: n.lat, lng: n.lng }}
          radius={n.isCollision ? 40 : 25}
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
      ))}

      {/* ============================================
          INFO WINDOW (for selected neighbor)
          ============================================ */}
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
            {/* Header */}
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
                  ⚠️ COLLISION
                </span>
              )}
            </div>
            
            {/* Quality Badge */}
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
            
            {/* Metrics Table */}
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

            {/* Coordinates (small, at bottom) */}
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

// Display name for debugging
NeighborHeatmapLayer.displayName = 'NeighborHeatmapLayer';

export default NeighborHeatmapLayer;