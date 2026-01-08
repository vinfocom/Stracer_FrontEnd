import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { GoogleMap, PolygonF, RectangleF } from "@react-google-maps/api";
import { getColorForMetric } from "../utils/metrics";
import { mapViewApi } from "../api/apiEndpoints";
import DeckGLOverlay from "./maps/DeckGLOverlay";
import { Zap, Layers } from "lucide-react";
import { getLogColor } from "../utils/colorUtils";
import TechHandoverMarkers from "./maps/TechHandoverMarkers";

const DEFAULT_CENTER = { lat: 28.64453086, lng: 77.37324242 };

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
  sum: (values) => {
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += values[i];
    return sum;
  },
  count: (values) => values.length,
};

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

const generateGridCellsOptimized = (
  polygonData, 
  gridSizeMeters, 
  locations, 
  metric, 
  thresholds,
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
  const thresholdKey = { dl_tpt: "dl_thpt", ul_tpt: "ul_thpt" }[metric] || metric;
  const metricThresholds = thresholds?.[thresholdKey];

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
          
          if (metricThresholds?.length && aggregatedValue !== null) {
            for (const t of metricThresholds) {
              if (aggregatedValue >= parseFloat(t.min) && aggregatedValue <= parseFloat(t.max)) {
                fillColor = t.color;
                break;
              }
            }
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

const containerStyle = { width: "100%", height: "100%" };

const MapWithMultipleCircles = ({
  isLoaded,
  loadError,
  locations = [],
  thresholds = {},
  selectedMetric = "rsrp",
  colorBy = null,
  activeMarkerIndex,
  onMarkerClick,
  options,
  center = DEFAULT_CENTER,
  defaultZoom = 14,
  fitToLocations = true,
  onLoad: onLoadProp,
  pointRadius = 8,
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
}) => {
  const [map, setMap] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [polygonData, setPolygonData] = useState([]);
  const [polygonsFetched, setPolygonsFetched] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  
  const onFilteredLocationsChangeRef = useRef(onFilteredLocationsChange);
  const polygonCheckerRef = useRef(null);
  const spatialIndexRef = useRef(null);

  useEffect(() => {
    onFilteredLocationsChangeRef.current = onFilteredLocationsChange;
  }, [onFilteredLocationsChange]);

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

  const locationsToRender = useMemo(() => {
    if (!locations?.length) return [];
    if (!enablePolygonFilter) return locations;
    if (!polygonsFetched) return [];
    if (polygonData.length === 0) return locations;

    const checker = polygonCheckerRef.current || new PolygonChecker(polygonData);
    return checker.filterLocations(locations);
  }, [locations, polygonData, polygonsFetched, enablePolygonFilter]);

  useEffect(() => {
    if (locationsToRender.length > 1000) {
      const index = new SpatialHashGrid(0.001);
      index.build(locationsToRender);
      spatialIndexRef.current = index;
    } else {
      spatialIndexRef.current = null;
    }
  }, [locationsToRender]);

  useEffect(() => {
    const callback = onFilteredLocationsChangeRef.current;
    if (callback) callback(locationsToRender);
  }, [locationsToRender]);

  const gridCells = useMemo(() => {
    if (!enableGrid || !polygonData.length || !locationsToRender.length) return [];
    
    return generateGridCellsOptimized(
      polygonData, 
      gridSizeMeters, 
      locationsToRender, 
      selectedMetric, 
      thresholds,
      gridAggregationMethod,
      spatialIndexRef.current
    );
  }, [enableGrid, gridSizeMeters, polygonData, locationsToRender, selectedMetric, thresholds, gridAggregationMethod]);

  const getLocationColor = useCallback((loc) => {
    if (colorBy && colorBy !== 'metric') {
      let schemeKey = colorBy; 
      let value = null;
      const mode = colorBy.toLowerCase();

      if (mode.includes('provider') || mode.includes('operator')) {
        schemeKey = 'provider';
        value = loc.operator || loc.Operator || loc.provider || loc.Provider || loc.operatorName || loc.name; 
      } else if (mode.includes('tech') || mode.includes('rat')) {
        schemeKey = 'technology';
        value = loc.technology || loc.Technology || loc.tech || loc.Tech || loc.networkType;
      } else if (mode.includes('band') || mode.includes('freq')) {
        schemeKey = 'band';
        value = loc.band || loc.Band || loc.frequency; 
      } else {
        value = loc[colorBy];
      }

      return getLogColor(schemeKey, value);
    }
    
    return getColorForMetric(selectedMetric, loc?.[selectedMetric], thresholds);
  }, [colorBy, selectedMetric, thresholds]);

  const computedCenter = useMemo(() => {
    const locs = locationsToRender.length > 0 ? locationsToRender : 
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
  }, [locationsToRender, locations, center]);

  const handleMapLoad = useCallback((mapInstance) => {
    setMap(mapInstance);
    
    const locs = locationsToRender.length > 0 ? locationsToRender : locations;
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
  }, [locationsToRender, locations, fitToLocations, computedCenter, defaultZoom, onLoadProp]);

  const handleLocationClick = useCallback((index, loc) => {
    onMarkerClick?.(index, loc);
  }, [onMarkerClick]);

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

        {showPoints && map && locationsToRender.length > 0 && (
          <DeckGLOverlay
            map={map}
            locations={locationsToRender}
            getColor={getLocationColor}
            radius={pointRadius}
            opacity={opacity}
            selectedIndex={activeMarkerIndex}
            onClick={handleLocationClick}
            radiusMinPixels={2}
            radiusMaxPixels={40}
          />
        )}

        <TechHandoverMarkers
          transitions={technologyTransitions}
          show={techHandOver}
          compactMode={technologyTransitions.length > 30}
          showConnections={technologyTransitions.length < 50}
          onTransitionClick={(transition) => {}}
        />

        {children}
      </GoogleMap>

      {isLoadingPolygons && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-20 text-sm">
          <span className="animate-pulse">Loading polygon boundaries...</span>
        </div>
      )}

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

      {showStats && (
        <div className="absolute bottom-4 right-4 bg-white/90 px-3 py-1.5 rounded-lg shadow text-xs text-gray-600 z-10">
          {isLoadingPolygons ? (
            <span className="animate-pulse">Loading...</span>
          ) : enableGrid ? (
            <span>{gridCells.filter(c => c.count > 0).length} cells with data</span>
          ) : (
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-green-600">
                {locationsToRender.length.toLocaleString()} points
              </span>
              <span className="text-[10px] text-blue-500 flex items-center gap-1">
                <Layers className="h-3 w-3" />
                WebGL Rendering
              </span>
              {enablePolygonFilter && locations.length !== locationsToRender.length && (
                <span className="text-[10px] text-gray-400">
                  ({(locations.length - locationsToRender.length).toLocaleString()} outside polygon)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {showControls && enableGrid && (
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-3 z-10 space-y-2 min-w-[140px]">
          <div className="text-xs font-semibold text-gray-700 mb-2">Grid Info</div>
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Size:</span>
              <span className="font-medium">{gridSizeMeters}m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Method:</span>
              <span className="font-medium capitalize">{gridAggregationMethod}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Cells:</span>
              <span className="font-medium">{gridCells.length}</span>
            </div>
          </div>
        </div>
      )}

      {techHandOver && technologyTransitions.length > 0 && (
        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 z-20 min-w-[180px]">
          <div className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-500" />
            Tech Handovers
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Total:</span>
              <span className="font-bold text-orange-600">
                {technologyTransitions.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(MapWithMultipleCircles);