// src/components/MapWithMultipleCircles.jsx
import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { GoogleMap, PolygonF, RectangleF, InfoWindow } from "@react-google-maps/api";
import { mapViewApi } from "../api/apiEndpoints";
import DeckGLOverlay from "./maps/DeckGLOverlay";
import { Zap, Layers, Radio, Square, Circle } from "lucide-react";
import TechHandoverMarkers from "./maps/TechHandoverMarkers";
import useColorForLog from "@/hooks/useColorForLog";

const DEFAULT_CENTER = { lat: 28.64453086, lng: 77.37324242 };

// ============== Spatial Hash Grid ==============
class SpatialHashGrid {
  constructor(cellSize = 0.001) {
    this.cellSize = cellSize;
    this.grid = new Map();
    this.bounds = null;
  }

  getCellKey(lat, lng) {
    return `${Math.floor(lng / this.cellSize)},${Math.floor(lat / this.cellSize)}`;
  }

  build(locations) {
    this.grid.clear();
    if (!locations?.length) return this;

    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') continue;
      
      const key = this.getCellKey(loc.lat, loc.lng);
      if (!this.grid.has(key)) {
        this.grid.set(key, []);
      }
      this.grid.get(key).push(i);

      minLat = Math.min(minLat, loc.lat);
      maxLat = Math.max(maxLat, loc.lat);
      minLng = Math.min(minLng, loc.lng);
      maxLng = Math.max(maxLng, loc.lng);
    }

    this.bounds = { north: maxLat, south: minLat, east: maxLng, west: minLng };
    return this;
  }

  queryBounds(bounds, locations) {
    const results = [];
    const startX = Math.floor(bounds.west / this.cellSize);
    const endX = Math.floor(bounds.east / this.cellSize);
    const startY = Math.floor(bounds.south / this.cellSize);
    const endY = Math.floor(bounds.north / this.cellSize);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const indices = this.grid.get(`${x},${y}`);
        if (indices) {
          for (const idx of indices) {
            const loc = locations[idx];
            if (loc.lat >= bounds.south && loc.lat <= bounds.north &&
                loc.lng >= bounds.west && loc.lng <= bounds.east) {
              results.push(idx);
            }
          }
        }
      }
    }
    return results;
  }
}

// ============== Polygon Checker ==============
class PolygonChecker {
  constructor(polygonData) {
    this.polygons = [];
    this.hasPolygons = false;
    
    if (polygonData?.length) {
      this.hasPolygons = true;
      this.polygons = polygonData.map(({ path, bbox }) => ({
        bbox,
        edges: path.map((p, i, arr) => {
          const next = arr[(i + 1) % arr.length];
          return {
            x1: p.lng, y1: p.lat,
            x2: next.lng, y2: next.lat,
            minY: Math.min(p.lat, next.lat),
            maxY: Math.max(p.lat, next.lat),
          };
        })
      }));
    }
  }

  isInside(lat, lng) {
    if (!this.hasPolygons) return true;
    
    for (const { edges, bbox } of this.polygons) {
      if (bbox && (lat < bbox.south || lat > bbox.north || 
                   lng < bbox.west || lng > bbox.east)) {
        continue;
      }

      let inside = false;
      for (const e of edges) {
        if (lat < e.minY || lat > e.maxY) continue;
        if (e.y1 > lat !== e.y2 > lat) {
          if (lng < ((e.x2 - e.x1) * (lat - e.y1)) / (e.y2 - e.y1) + e.x1) {
            inside = !inside;
          }
        }
      }
      if (inside) return true;
    }
    return false;
  }

  filterLocations(locations) {
    if (!this.hasPolygons) return locations;
    if (!locations?.length) return [];
    
    const result = new Array(locations.length);
    let count = 0;
    
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      if (typeof loc.lat === 'number' && typeof loc.lng === 'number' &&
          this.isInside(loc.lat, loc.lng)) {
        result[count++] = loc;
      }
    }
    
    result.length = count;
    return result;
  }
}

// ============== Aggregation Methods ==============
const AGGREGATION_METHODS = {
  median: (values) => {
    if (!values.length) return null;
    const sorted = Float64Array.from(values).sort();
    const mid = sorted.length >> 1;
    return sorted.length & 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) * 0.5;
  },
  mean: (values) => {
    if (!values.length) return null;
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += values[i];
    return sum / values.length;
  },
  min: (values) => values.length ? Math.min(...values) : null,
  max: (values) => values.length ? Math.max(...values) : null,
};

// ============== WKT Parser ==============
const parseWKTToPolygons = (wkt) => {
  if (!wkt?.trim()) return [];
  try {
    const match = wkt.trim().match(/POLYGON\s*\(\(([^)]+)\)\)/i);
    if (!match) return [];
    const coords = match[1].split(",");
    const points = new Array(coords.length);
    let count = 0;
    
    for (let i = 0; i < coords.length; i++) {
      const parts = coords[i].trim().split(/\s+/);
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng)) {
        points[count++] = { lat, lng };
      }
    }
    
    points.length = count;
    return count >= 3 ? [points] : [];
  } catch {
    return [];
  }
};

const getPolygonBounds = (path) => {
  if (!path?.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of path) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { north: maxLat, south: minLat, east: maxLng, west: minLng };
};

// ============== Grid Generator ==============
const generateGridCellsOptimized = (
  polygonData, 
  gridSizeMeters, 
  locations, 
  metric, 
  getMetricColor,
  aggregationMethod = 'median',
  spatialIndex
) => {
  if (!polygonData?.length || !locations?.length) return [];

  let globalBounds = null;
  for (const { bbox } of polygonData) {
    if (!bbox) continue;
    if (!globalBounds) {
      globalBounds = { ...bbox };
    } else {
      globalBounds.north = Math.max(globalBounds.north, bbox.north);
      globalBounds.south = Math.min(globalBounds.south, bbox.south);
      globalBounds.east = Math.max(globalBounds.east, bbox.east);
      globalBounds.west = Math.min(globalBounds.west, bbox.west);
    }
  }
  if (!globalBounds) return [];

  const latDegPerMeter = 1 / 111320;
  const avgLat = (globalBounds.north + globalBounds.south) * 0.5;
  const lngDegPerMeter = 1 / (111320 * Math.cos(avgLat * Math.PI / 180));
  const cellHeight = gridSizeMeters * latDegPerMeter;
  const cellWidth = gridSizeMeters * lngDegPerMeter;

  const checker = new PolygonChecker(polygonData);
  const aggregateFn = AGGREGATION_METHODS[aggregationMethod] || AGGREGATION_METHODS.median;

  const cells = [];
  let cellId = 0;
  const valuesBuffer = new Float64Array(1000);

  for (let lat = globalBounds.south; lat < globalBounds.north; lat += cellHeight) {
    for (let lng = globalBounds.west; lng < globalBounds.east; lng += cellWidth) {
      const cellBounds = { 
        north: lat + cellHeight, 
        south: lat, 
        east: lng + cellWidth, 
        west: lng 
      };
      
      const centerLat = (cellBounds.north + cellBounds.south) * 0.5;
      const centerLng = (cellBounds.east + cellBounds.west) * 0.5;

      if (!checker.isInside(centerLat, centerLng)) continue;

      let cellLocationIndices;
      if (spatialIndex) {
        cellLocationIndices = spatialIndex.queryBounds(cellBounds, locations);
      } else {
        cellLocationIndices = [];
        for (let i = 0; i < locations.length; i++) {
          const loc = locations[i];
          if (loc.lat >= cellBounds.south && loc.lat < cellBounds.north &&
              loc.lng >= cellBounds.west && loc.lng < cellBounds.east) {
            cellLocationIndices.push(i);
          }
        }
      }

      const count = cellLocationIndices.length;
      let aggregatedValue = null;
      let fillColor = "#E5E7EB";

      if (count > 0) {
        let validCount = 0;
        for (const idx of cellLocationIndices) {
          const v = locations[idx][metric];
          if (v != null && !isNaN(v)) {
            if (validCount < valuesBuffer.length) {
              valuesBuffer[validCount++] = v;
            }
          }
        }
        
        if (validCount > 0) {
          const values = valuesBuffer.subarray(0, validCount);
          aggregatedValue = aggregateFn(Array.from(values));
          
          if (getMetricColor && aggregatedValue !== null) {
            fillColor = getMetricColor(aggregatedValue, metric);
          }
        }
      }

      cells.push({
        id: cellId++,
        bounds: cellBounds,
        count,
        aggregatedValue,
        fillColor,
      });
    }
  }

  return cells;
};

// ============== Neighbor InfoWindow Component ==============
const NeighborInfoWindow = React.memo(({ neighbor, onClose, getMetricColor }) => {
  if (!neighbor) return null;

  const rsrpColor = getMetricColor?.(neighbor.rsrp, 'rsrp') || '#808080';
  const rsrqColor = getMetricColor?.(neighbor.rsrq, 'rsrq') || '#808080';
  const sinrColor = getMetricColor?.(neighbor.sinr, 'sinr') || '#808080';

  return (
    <InfoWindow
      position={{ lat: neighbor.lat, lng: neighbor.lng }}
      onCloseClick={onClose}
      options={{
        pixelOffset: new window.google.maps.Size(0, -15),
        maxWidth: 320,
        disableAutoPan: false,
      }}
    >
      <div className="p-2 min-w-[280px] font-sans text-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Square 
              className="w-4 h-4"
              style={{ color: neighbor.displayColor || rsrpColor }}
              fill={neighbor.displayColor || rsrpColor}
            />
            <span className="font-bold text-sm">
              PCI: {neighbor.pci ?? 'N/A'}
            </span>
          </div>
          <span 
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ 
              backgroundColor: `${rsrpColor}20`,
              color: rsrpColor,
              border: `1px solid ${rsrpColor}40`
            }}
          >
            {neighbor.quality || 'Unknown'}
          </span>
        </div>
        
        {/* Primary Cell Info */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">
            📡 Primary Cell
          </div>
          
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {neighbor.band && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Band</span>
                <span className="font-semibold text-blue-600">{neighbor.band}</span>
              </div>
            )}
            {neighbor.pci && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">PCI</span>
                <span className="font-medium">{neighbor.pci}</span>
              </div>
            )}
          </div>

          {neighbor.rsrp !== null && (
            <div className="flex justify-between text-xs items-center">
              <span className="text-gray-500">RSRP</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: rsrpColor }} />
                <span className="font-semibold" style={{ color: rsrpColor }}>
                  {neighbor.rsrp?.toFixed?.(1)} dBm
                </span>
              </div>
            </div>
          )}
          
          {neighbor.rsrq !== null && (
            <div className="flex justify-between text-xs items-center">
              <span className="text-gray-500">RSRQ</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: rsrqColor }} />
                <span className="font-medium">{neighbor.rsrq?.toFixed?.(1)} dB</span>
              </div>
            </div>
          )}
          
          {neighbor.sinr !== null && (
            <div className="flex justify-between text-xs items-center">
              <span className="text-gray-500">SINR</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sinrColor }} />
                <span className="font-medium">{neighbor.sinr?.toFixed?.(1)} dB</span>
              </div>
            </div>
          )}
        </div>

        {/* Neighbour Cell Info */}
        {(neighbor.neighbourRsrp !== null || neighbor.neighbourBand) && (
          <div className="space-y-1.5 mt-3 pt-2 border-t border-gray-100">
            <div className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide">
              📶 Neighbour Cell
            </div>
            
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {neighbor.neighbourBand && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Band</span>
                  <span className="font-semibold text-purple-600">{neighbor.neighbourBand}</span>
                </div>
              )}
              {neighbor.neighbourPci && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">PCI</span>
                  <span className="font-medium">{neighbor.neighbourPci}</span>
                </div>
              )}
            </div>
            
            {neighbor.neighbourRsrp !== null && (
              <div className="flex justify-between text-xs items-center">
                <span className="text-gray-500">RSRP</span>
                <span className="font-semibold" style={{ color: getMetricColor?.(neighbor.neighbourRsrp, 'rsrp') }}>
                  {neighbor.neighbourRsrp?.toFixed?.(1)} dBm
                </span>
              </div>
            )}
          </div>
        )}

        {/* Session & Coordinates */}
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
          {neighbor.sessionId && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Session</span>
              <span className="font-medium">{neighbor.sessionId}</span>
            </div>
          )}
          <div className="text-[10px] text-gray-400 font-mono text-center">
            📍 {neighbor.lat.toFixed(6)}, {neighbor.lng.toFixed(6)}
          </div>
        </div>
      </div>
    </InfoWindow>
  );
});

NeighborInfoWindow.displayName = 'NeighborInfoWindow';

// ============== Primary Log InfoWindow ==============
const PrimaryLogInfoWindow = React.memo(({ log, onClose, getMetricColor, selectedMetric }) => {
  if (!log) return null;

  const metricValue = log[selectedMetric];
  const metricColor = getMetricColor?.(metricValue, selectedMetric) || '#808080';

  return (
    <InfoWindow
      position={{ lat: log.lat, lng: log.lng }}
      onCloseClick={onClose}
      options={{
        pixelOffset: new window.google.maps.Size(0, -15),
        maxWidth: 320,
      }}
    >
      <div className="p-2 min-w-[260px] font-sans text-gray-800">
        <div className="flex items-center gap-2 pb-2 mb-2 border-b border-gray-200">
          <Circle 
            className="w-4 h-4"
            style={{ color: metricColor }}
            fill={metricColor}
          />
          <span className="font-bold text-sm">Primary Log</span>
        </div>

        <div className="space-y-1.5">
          {log.provider && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Provider</span>
              <span className="font-medium">{log.provider}</span>
            </div>
          )}
          {log.technology && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Technology</span>
              <span className="font-medium">{log.technology}</span>
            </div>
          )}
          {log.band && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Band</span>
              <span className="font-semibold text-blue-600">{log.band}</span>
            </div>
          )}
          
          {log.rsrp !== null && log.rsrp !== undefined && (
            <div className="flex justify-between text-xs items-center">
              <span className="text-gray-500">RSRP</span>
              <span className="font-semibold" style={{ color: getMetricColor?.(log.rsrp, 'rsrp') }}>
                {log.rsrp?.toFixed?.(1)} dBm
              </span>
            </div>
          )}
          
          {log.rsrq !== null && log.rsrq !== undefined && (
            <div className="flex justify-between text-xs items-center">
              <span className="text-gray-500">RSRQ</span>
              <span className="font-medium" style={{ color: getMetricColor?.(log.rsrq, 'rsrq') }}>
                {log.rsrq?.toFixed?.(1)} dB
              </span>
            </div>
          )}
          
          {log.sinr !== null && log.sinr !== undefined && (
            <div className="flex justify-between text-xs items-center">
              <span className="text-gray-500">SINR</span>
              <span className="font-medium" style={{ color: getMetricColor?.(log.sinr, 'sinr') }}>
                {log.sinr?.toFixed?.(1)} dB
              </span>
            </div>
          )}

          {log.dl_tpt !== null && log.dl_tpt !== undefined && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">DL Throughput</span>
              <span className="font-medium">{log.dl_tpt?.toFixed?.(2)} Mbps</span>
            </div>
          )}

          {log.ul_tpt !== null && log.ul_tpt !== undefined && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">UL Throughput</span>
              <span className="font-medium">{log.ul_tpt?.toFixed?.(2)} Mbps</span>
            </div>
          )}
        </div>

        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="text-[10px] text-gray-400 font-mono text-center">
            📍 {log.lat.toFixed(6)}, {log.lng.toFixed(6)}
          </div>
        </div>
      </div>
    </InfoWindow>
  );
});

PrimaryLogInfoWindow.displayName = 'PrimaryLogInfoWindow';

// ============== Main Component ==============
const containerStyle = { width: "100%", height: "100%" };

const MapWithMultipleCircles = ({
  isLoaded,
  loadError,
  locations = [],
  selectedMetric = "rsrp",
  colorBy = null,
  activeMarkerIndex,
  onMarkerClick,
  options,
  center = DEFAULT_CENTER,
  defaultZoom = 14,
  fitToLocations = true,
  onLoad: onLoadProp,
  pointRadius = 20,
  children,
  projectId = null,
  polygonSource = "map",
  enablePolygonFilter = true,
  showPolygonBoundary = true,
  enableGrid = false,
  gridSizeMeters = 50,
  gridAggregationMethod = 'median',
  areaEnabled = false,
  showControls = true,
  showStats = true,
  technologyTransitions = [],
  techHandOver = false,
  onFilteredLocationsChange,
  opacity = 1,
  showPoints: showPointsProp = true,
  
  // Neighbor Props
  neighborData = [],
  showNeighbors = false,
  neighborSquareSize = 10,
  neighborOpacity = 0.7,
  onNeighborClick,
  onFilteredNeighborsChange,
  debugMode = false,
}) => {
  // Use the color hook
  const { 
    getMetricColor, 
    getThresholdInfo, 
    thresholds, 
    loading: thresholdsLoading, 
    isReady: thresholdsReady 
  } = useColorForLog();

  const [map, setMap] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [polygonData, setPolygonData] = useState([]);
  const [polygonsFetched, setPolygonsFetched] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [selectedNeighbor, setSelectedNeighbor] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  
  const onFilteredLocationsChangeRef = useRef(onFilteredLocationsChange);
  const onFilteredNeighborsChangeRef = useRef(onFilteredNeighborsChange);
  const polygonCheckerRef = useRef(null);
  const spatialIndexRef = useRef(null);

  useEffect(() => {
    onFilteredLocationsChangeRef.current = onFilteredLocationsChange;
  }, [onFilteredLocationsChange]);

  useEffect(() => {
    onFilteredNeighborsChangeRef.current = onFilteredNeighborsChange;
  }, [onFilteredNeighborsChange]);

  // Fetch polygons
  useEffect(() => {
    const fetchPolygons = async () => {
      if (!projectId || !enablePolygonFilter) {
        setPolygonData([]);
        setPolygonsFetched(true);
        return;
      }

      try {
        const res = await mapViewApi.getProjectPolygonsV2(projectId, polygonSource);
        const items = res?.Data || res?.data?.Data || (Array.isArray(res) ? res : []);
        
        const allPaths = [];
        for (const item of items) {
          const wkt = item.Wkt || item.wkt;
          if (wkt) {
            const paths = parseWKTToPolygons(wkt);
            for (const path of paths) {
              if (path.length >= 3) {
                allPaths.push({ 
                  path, 
                  bbox: getPolygonBounds(path),
                  id: item.Id || item.id 
                });
              }
            }
          }
        }
        
        setPolygonData(allPaths);
        polygonCheckerRef.current = new PolygonChecker(allPaths);
        setPolygonsFetched(true);
        setFetchError(null);
      } catch (err) {
        setPolygonData([]);
        setPolygonsFetched(true);
        setFetchError(err.message);
      }
    };
    
    fetchPolygons();
  }, [projectId, polygonSource, enablePolygonFilter]);

  // Filter primary locations by polygon
  const locationsToRender = useMemo(() => {
    if (!locations?.length) return [];
    if (!enablePolygonFilter) return locations;
    if (!polygonsFetched) return [];
    if (polygonData.length === 0) return locations;

    const checker = polygonCheckerRef.current || new PolygonChecker(polygonData);
    return checker.filterLocations(locations);
  }, [locations, polygonData, polygonsFetched, enablePolygonFilter]);

  // Process and filter neighbor data by polygon
  const processedNeighbors = useMemo(() => {
    if (!showNeighbors || !neighborData?.length) return [];

    const parsed = neighborData
      .filter(n => {
        const lat = parseFloat(n.lat ?? n.latitude ?? n.Lat);
        const lng = parseFloat(n.lng ?? n.longitude ?? n.Lng ?? n.lon);
        return !isNaN(lat) && !isNaN(lng) && 
               lat >= -90 && lat <= 90 && 
               lng >= -180 && lng <= 180;
      })
      .map((n, idx) => {
        const lat = parseFloat(n.lat ?? n.latitude ?? n.Lat);
        const lng = parseFloat(n.lng ?? n.longitude ?? n.Lng ?? n.lon);
        
        const rsrp = parseFloat(n.primaryRsrp ?? n.primary_rsrp ?? n.rsrp) || null;
        const rsrq = parseFloat(n.primaryRsrq ?? n.primary_rsrq ?? n.rsrq) || null;
        const sinr = parseFloat(n.primarySinr ?? n.primary_sinr ?? n.sinr) || null;
        const pci = n.primaryPci ?? n.primary_pci ?? n.pci;
        const band = n.primaryBand ?? n.primary_band ?? n.band;
        const neighbourRsrp = n.neighbourRsrp ?? n.neighbour_rsrp;
        const neighbourRsrq = n.neighbourRsrq ?? n.neighbour_rsrq;
        const neighbourPci = n.neighbourPci ?? n.neighbour_pci;
        const neighbourBand = n.neighbourBand ?? n.neighbour_band;

        // Get metric value for coloring
        let metricValue = rsrp;
        if (selectedMetric === 'rsrq') metricValue = rsrq;
        if (selectedMetric === 'sinr') metricValue = sinr;

        // Get quality label from threshold info
        const thresholdInfo = getThresholdInfo?.(rsrp, 'rsrp');
        const quality = thresholdInfo?.label || 'Unknown';
        
        return {
          ...n,
          id: n.id || idx,
          lat,
          lng,
          rsrp: isNaN(rsrp) ? null : rsrp,
          rsrq: isNaN(rsrq) ? null : rsrq,
          sinr: isNaN(sinr) ? null : sinr,
          pci,
          band,
          neighbourRsrp: neighbourRsrp !== null ? parseFloat(neighbourRsrp) : null,
          neighbourRsrq: neighbourRsrq !== null ? parseFloat(neighbourRsrq) : null,
          neighbourPci,
          neighbourBand,
          metricValue,
          quality,
        };
      });

    // Apply polygon filter
    if (enablePolygonFilter && polygonsFetched && polygonData.length > 0) {
      const checker = polygonCheckerRef.current || new PolygonChecker(polygonData);
      return checker.filterLocations(parsed);
    }

    return parsed;
  }, [neighborData, showNeighbors, enablePolygonFilter, polygonsFetched, polygonData, selectedMetric, getThresholdInfo]);

  // Build spatial index
  useEffect(() => {
    if (locationsToRender.length > 1000) {
      const index = new SpatialHashGrid(0.001);
      index.build(locationsToRender);
      spatialIndexRef.current = index;
    } else {
      spatialIndexRef.current = null;
    }
  }, [locationsToRender]);

  // Notify parent of filtered locations
  useEffect(() => {
    const callback = onFilteredLocationsChangeRef.current;
    if (callback) callback(locationsToRender);
  }, [locationsToRender]);

  // Notify parent of filtered neighbors
  useEffect(() => {
    const callback = onFilteredNeighborsChangeRef.current;
    if (callback) callback(processedNeighbors);
  }, [processedNeighbors]);

  // Grid cells with hook-based coloring
  const gridCells = useMemo(() => {
    if (!enableGrid || !polygonData.length || !locationsToRender.length || !thresholdsReady) return [];
    
    return generateGridCellsOptimized(
      polygonData, 
      gridSizeMeters, 
      locationsToRender, 
      selectedMetric, 
      getMetricColor,
      gridAggregationMethod,
      spatialIndexRef.current
    );
  }, [enableGrid, gridSizeMeters, polygonData, locationsToRender, selectedMetric, gridAggregationMethod, getMetricColor, thresholdsReady]);

  // ✅ UPDATED: Color getter for primary locations to respect colorBy
  const getPrimaryColor = useCallback((loc) => {
    if (!thresholdsReady) return '#808080';
    
    // 1. Check if coloring by a specific Category (Provider, Band, Technology)
    if (colorBy && colorBy !== 'metric') {
        const key = colorBy.toLowerCase();
        // loc fields typically: provider, technology, band
        const value = loc?.[key];
        return getMetricColor(value, colorBy);
    }
    
    // 2. Default: Color by the selected Numeric Metric
    const value = loc?.[selectedMetric];
    return getMetricColor(value, selectedMetric);
  }, [selectedMetric, colorBy, getMetricColor, thresholdsReady]);

  // ✅ UPDATED: Color getter for neighbors to respect colorBy
  const getNeighborColor = useCallback((neighbor) => {
    if (!thresholdsReady) return '#808080';
    
    // 1. Check if coloring by a specific Category
    if (colorBy && colorBy !== 'metric') {
        const key = colorBy.toLowerCase();
        const value = neighbor?.[key];
        return getMetricColor(value, colorBy);
    }
    
    // 2. Default
    const value = neighbor?.metricValue ?? neighbor?.[selectedMetric];
    return getMetricColor(value, selectedMetric);
  }, [selectedMetric, colorBy, getMetricColor, thresholdsReady]);

  // Compute center
  const computedCenter = useMemo(() => {
    const allPoints = [...locationsToRender, ...processedNeighbors];
    const locs = allPoints.length > 0 ? allPoints : 
                 locations.length > 0 ? locations : null;
    
    if (!locs?.length) return center;
    
    const sampleSize = Math.min(locs.length, 1000);
    const step = Math.max(1, Math.floor(locs.length / sampleSize));
    
    let sumLat = 0, sumLng = 0, count = 0;
    for (let i = 0; i < locs.length; i += step) {
      sumLat += locs[i].lat;
      sumLng += locs[i].lng;
      count++;
    }
    
    return { lat: sumLat / count, lng: sumLng / count };
  }, [locationsToRender, processedNeighbors, locations, center]);

  // Map load handler
  const handleMapLoad = useCallback((mapInstance) => {
    setMap(mapInstance);
    
    const allPoints = [...locationsToRender, ...processedNeighbors];
    const locs = allPoints.length > 0 ? allPoints : locations;
    
    if (fitToLocations && locs?.length && window.google) {
      const bounds = new window.google.maps.LatLngBounds();
      const sampleSize = Math.min(locs.length, 500);
      const step = Math.max(1, Math.floor(locs.length / sampleSize));
      
      for (let i = 0; i < locs.length; i += step) {
        bounds.extend({ lat: locs[i].lat, lng: locs[i].lng });
      }
      mapInstance.fitBounds(bounds, 50);
    } else {
      mapInstance.setCenter(computedCenter);
      mapInstance.setZoom(defaultZoom);
    }
    
    onLoadProp?.(mapInstance);
  }, [locationsToRender, processedNeighbors, locations, fitToLocations, computedCenter, defaultZoom, onLoadProp]);

  // Click handlers
  const handlePrimaryClick = useCallback((index, loc) => {
    setSelectedLog(loc);
    setSelectedNeighbor(null);
    onMarkerClick?.(index, loc);
  }, [onMarkerClick]);

  const handleNeighborClick = useCallback((neighbor) => {
    setSelectedNeighbor(neighbor);
    setSelectedLog(null);
    onNeighborClick?.(neighbor);
  }, [onNeighborClick]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center w-full h-full text-red-500">
        Failed to load Google Maps
      </div>
    );
  }
  
  if (!isLoaded) return null;

  const showPoints = showPointsProp && !enableGrid && !areaEnabled;
  const isLoadingPolygons = enablePolygonFilter && !polygonsFetched && projectId;

  return (
    <div className="relative w-full h-full">
      <GoogleMap
        mapContainerStyle={containerStyle}
        onLoad={handleMapLoad}
        options={{
          ...options,
          gestureHandling: 'greedy',
          disableDefaultUI: false,
          maxZoom: 20,
        }}
        center={computedCenter}
        zoom={defaultZoom}
      >
        {/* Polygon boundaries */}
        {showPolygonBoundary && polygonData.map(({ path }, idx) => (
          <PolygonF
            key={`polygon-${idx}`}
            paths={path}
            options={{
              fillColor: "transparent",
              fillOpacity: 0,
              strokeColor: "#2563eb",
              strokeWeight: 2,
              strokeOpacity: 0.8,
              zIndex: 1,
            }}
          />
        ))}

        {/* Grid cells */}
        {enableGrid && gridCells.map((cell) => (
          <RectangleF
            key={`grid-${cell.id}`}
            bounds={cell.bounds}
            options={{
              fillColor: cell.fillColor,
              fillOpacity: cell.count > 0 ? 0.7 : 0.2,
              strokeColor: "transparent",
              strokeWeight: 0,
              zIndex: 2,
              clickable: true,
            }}
            onMouseOver={() => setHoveredCell(cell)}
            onMouseOut={() => setHoveredCell(null)}
          />
        ))}

        {/* WebGL Layer for BOTH primary logs (circles) and neighbors (squares) */}
        {map && thresholdsReady && (
          <DeckGLOverlay
            map={map}
            // Primary logs (circles)
            locations={showPoints ? locationsToRender : []}
            getColor={getPrimaryColor}
            radius={pointRadius}
            opacity={1} // ✅ CHANGED: Hardcoded to 1 for solid visibility
            selectedIndex={activeMarkerIndex}
            onClick={handlePrimaryClick}
            radiusMinPixels={2}
            radiusMaxPixels={40}
            showPrimaryLogs={showPoints}
            // Neighbors (squares)
            neighbors={processedNeighbors}
            getNeighborColor={getNeighborColor}
            neighborSquareSize={neighborSquareSize}
            neighborOpacity={neighborOpacity}
            onNeighborClick={handleNeighborClick}
            showNeighbors={showNeighbors}
          />
        )}

        {/* Neighbor InfoWindow */}
        {selectedNeighbor && (
          <NeighborInfoWindow
            neighbor={selectedNeighbor}
            onClose={() => setSelectedNeighbor(null)}
            getMetricColor={getMetricColor}
          />
        )}

        {/* Primary Log InfoWindow */}
        {selectedLog && (
          <PrimaryLogInfoWindow
            log={selectedLog}
            onClose={() => setSelectedLog(null)}
            getMetricColor={getMetricColor}
            selectedMetric={selectedMetric}
          />
        )}

        {/* Tech handover markers */}
        <TechHandoverMarkers
          transitions={technologyTransitions}
          show={techHandOver}
          compactMode={technologyTransitions.length > 30}
          showConnections={technologyTransitions.length < 50}
          onTransitionClick={() => {}}
        />

        {children}
      </GoogleMap>

      {/* Loading indicators */}
      {(isLoadingPolygons || thresholdsLoading) && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-20 text-sm">
          <span className="animate-pulse">
            {thresholdsLoading ? 'Loading color thresholds...' : 'Loading polygon boundaries...'}
          </span>
        </div>
      )}

      {/* Grid cell hover info */}
      {enableGrid && hoveredCell && (
        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 z-20 min-w-[160px] text-xs">
          <div className="font-semibold text-gray-800 mb-2">Grid Cell</div>
          <div className="space-y-1">
            <div className="flex justify-between text-blue-600">
              <span>Logs:</span>
              <span className="font-bold">{hoveredCell.count}</span>
            </div>
            {hoveredCell.aggregatedValue !== null && (
              <div className="flex justify-between text-gray-600">
                <span>{gridAggregationMethod.charAt(0).toUpperCase() + gridAggregationMethod.slice(1)} {selectedMetric.toUpperCase()}:</span>
                <span className="font-medium">{hoveredCell.aggregatedValue.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats panel */}
      {showStats && (
        <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg text-xs text-gray-600 z-10">
          {isLoadingPolygons || thresholdsLoading ? (
            <span className="animate-pulse">Loading...</span>
          ) : enableGrid ? (
            <span>{gridCells.filter(c => c.count > 0).length} cells with data</span>
          ) : (
            <div className="flex flex-col gap-1.5">
              {/* Primary points */}
              <div className="flex items-center gap-2">
                <Circle className="w-3 h-3 text-green-500" fill="#22C55E" />
                <span className="font-medium text-green-600">
                  {locationsToRender.length.toLocaleString()} primary logs
                </span>
              </div>
              
              {/* Neighbor points */}
              {showNeighbors && processedNeighbors.length > 0 && (
                <div className="flex items-center gap-2">
                  <Square className="w-3 h-3 text-purple-500" fill="#8B5CF6" />
                  <span className="font-medium text-purple-600">
                    {processedNeighbors.length.toLocaleString()} neighbor logs
                  </span>
                </div>
              )}
              
              <div className="flex items-center gap-1 text-[10px] text-blue-500">
                <Layers className="h-3 w-3" />
                <span>WebGL Accelerated</span>
              </div>
              
              {/* Filtered counts */}
              {enablePolygonFilter && polygonData.length > 0 && (
                <div className="text-[10px] text-gray-400 space-y-0.5">
                  {locations.length !== locationsToRender.length && (
                    <div>({(locations.length - locationsToRender.length).toLocaleString()} primary outside)</div>
                  )}
                  {showNeighbors && neighborData.length !== processedNeighbors.length && (
                    <div>({(neighborData.length - processedNeighbors.length).toLocaleString()} neighbors outside)</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )} 

      {/* Tech handover panel */}
      {techHandOver && technologyTransitions.length > 0 && (
        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 z-20 min-w-[180px]">
          <div className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-500" />
            Tech Handovers
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Total:</span>
              <span className="font-bold text-orange-600">{technologyTransitions.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(MapWithMultipleCircles);