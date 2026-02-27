import React, { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { IconLayer, PolygonLayer } from "@deck.gl/layers";

const FALLBACK_COLORS = [
  { min: 0.8, color: "#16a34a" },
  { min: 0.6, color: "#65a30d" },
  { min: 0.4, color: "#ca8a04" },
  { min: 0.2, color: "#ea580c" },
  { min: 0.0, color: "#dc2626" },
];

const AGGREGATION_METHODS = {
  median: (values) => {
    if (!Array.isArray(values) || values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  },
  mean: (values) => {
    if (!Array.isArray(values) || values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  },
  avg: (values) => {
    if (!Array.isArray(values) || values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  },
  min: (values) => (Array.isArray(values) && values.length ? Math.min(...values) : null),
  max: (values) => (Array.isArray(values) && values.length ? Math.max(...values) : null),
};

const toRgbaArray = (hexOrCss, alpha = 220) => {
  if (!hexOrCss || typeof hexOrCss !== "string") return [107, 114, 128, alpha];
  const hex = hexOrCss.trim().replace("#", "");
  if (hex.length === 6) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      alpha,
    ];
  }
  return [107, 114, 128, alpha];
};

const getThresholdKey = (metric) => {
  if (metric === "dl_tpt") return "dl_thpt";
  if (metric === "ul_tpt") return "ul_thpt";
  return metric;
};

const getColorFromThresholds = (value, selectedMetric, thresholds) => {
  const ranges = thresholds?.[getThresholdKey(selectedMetric)];
  if (!Array.isArray(ranges) || ranges.length === 0 || value == null || Number.isNaN(value)) {
    return null;
  }

  const sorted = [...ranges].sort((a, b) => Number(a.min) - Number(b.min));
  for (const range of sorted) {
    const min = Number(range.min);
    const max = Number(range.max);
    if (Number.isFinite(min) && Number.isFinite(max) && value >= min && value <= max) {
      return range.color || null;
    }
  }
  return null;
};

const getFallbackColor = (value, selectedMetric) => {
  if (value == null || Number.isNaN(value)) return "#6b7280";
  const metric = String(selectedMetric || "rsrp").toLowerCase();

  let min = -140;
  let max = -44;
  if (metric === "rsrq") {
    min = -20;
    max = -3;
  } else if (metric === "sinr") {
    min = -10;
    max = 30;
  }

  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  for (const step of FALLBACK_COLORS) {
    if (normalized >= step.min) return step.color;
  }
  return "#dc2626";
};

const getCoordValue = (coord, fallbackCoord, keyA, keyB, keyC) => {
  const direct = coord?.[keyA] ?? coord?.[keyB] ?? coord?.[keyC];
  const fallback = fallbackCoord?.[keyA] ?? fallbackCoord?.[keyB] ?? fallbackCoord?.[keyC];
  const value = direct ?? fallback;
  if (typeof value === "function") {
    const fnVal = value();
    const num = Number(fnVal);
    return Number.isFinite(num) ? num : null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizePathPoint = (p) => {
  if (!p) return null;
  const lat = getCoordValue(p, p, "lat", "Lat", "latitude");
  const lng = getCoordValue(p, p, "lng", "Lng", "lon") ?? getCoordValue(p, p, "longitude", "Lon", "LONGITUDE");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const normalizePath = (poly) => {
  const rawPath = Array.isArray(poly?.paths?.[0])
    ? poly.paths[0]
    : Array.isArray(poly?.paths)
      ? poly.paths
      : Array.isArray(poly?.path)
        ? poly.path
        : [];
  if (!Array.isArray(rawPath) || rawPath.length === 0) return [];
  return rawPath.map((p) => normalizePathPoint(p)).filter(Boolean);
};

const getPathBounds = (path) => {
  if (!Array.isArray(path) || path.length === 0) return null;
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  for (const point of path) {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    north = Math.max(north, lat);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    west = Math.min(west, lng);
  }
  if (![north, south, east, west].every(Number.isFinite)) return null;
  return { north, south, east, west };
};

const mergeBounds = (boundsList = []) => {
  if (!Array.isArray(boundsList) || boundsList.length === 0) return null;
  let merged = null;
  for (const bounds of boundsList) {
    if (!bounds) continue;
    if (!merged) {
      merged = { ...bounds };
      continue;
    }
    merged.north = Math.max(merged.north, bounds.north);
    merged.south = Math.min(merged.south, bounds.south);
    merged.east = Math.max(merged.east, bounds.east);
    merged.west = Math.min(merged.west, bounds.west);
  }
  return merged;
};

const getBoundsFromPoints = (points = []) => {
  if (!Array.isArray(points) || points.length === 0) return null;
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  for (const point of points) {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    north = Math.max(north, lat);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    west = Math.min(west, lng);
  }
  if (![north, south, east, west].every(Number.isFinite)) return null;
  return { north, south, east, west };
};

const isPointInPolygon = (point, path) => {
  if (!Array.isArray(path) || path.length < 3) return false;
  const lat = point.lat;
  const lng = point.lng;
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const xi = path[i].lng;
    const yi = path[i].lat;
    const xj = path[j].lng;
    const yj = path[j].lat;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

const makeSquareAtlas = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 64, 64);
  return canvas.toDataURL("image/png");
};

const LtePredictionLocationLayer = ({
  enabled = false,
  map = null,
  locations = [],
  selectedMetric = "rsrp",
  thresholds = {},
  getMetricColor = null,
  filterPolygons = [],
  filterInsidePolygons = true,
  maxPoints = 20000,
  enableGrid = false,
  gridSizeMeters = 50,
  gridAggregationMethod = "median",
}) => {
  const overlayRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(13);
  const [hovered, setHovered] = useState(null);

  const squareAtlas = useMemo(() => makeSquareAtlas(), []);
  const squareIconMapping = useMemo(
    () => ({
      square: { x: 0, y: 0, width: 64, height: 64, mask: true },
    }),
    [],
  );

  const polygonPaths = useMemo(() => {
    if (!Array.isArray(filterPolygons) || filterPolygons.length === 0) return [];
    return filterPolygons
      .map(normalizePath)
      .filter((path) => Array.isArray(path) && path.length >= 3);
  }, [filterPolygons]);

  const parsedPoints = useMemo(() => {
    if (!enabled || !Array.isArray(locations) || locations.length === 0) return [];

    return locations
      .map((p) => {
        const lat = Number(p.lat ?? p.latitude);
        const lng = Number(p.lng ?? p.lon ?? p.longitude);
        const value = Number(p.value);
        const sampleCount = Number(p.sampleCount ?? 0);
        const siteId = String(p.siteId ?? p.site_id ?? "").trim();
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          lat,
          lng,
          value: Number.isFinite(value) ? value : null,
          sampleCount: Number.isFinite(sampleCount) ? sampleCount : 0,
          siteId,
        };
      })
      .filter(Boolean);
  }, [enabled, locations]);

  const filteredPoints = useMemo(() => {
    if (!Array.isArray(parsedPoints) || parsedPoints.length === 0) return [];
    if (!(filterInsidePolygons && polygonPaths.length > 0)) return parsedPoints;
    return parsedPoints.filter((point) =>
      polygonPaths.some((path) => isPointInPolygon(point, path)),
    );
  }, [parsedPoints, filterInsidePolygons, polygonPaths]);

  const sampledPoints = useMemo(() => {
    if (!Array.isArray(filteredPoints) || filteredPoints.length === 0) return [];
    if (filteredPoints.length <= maxPoints) return filteredPoints;
    const step = Math.ceil(filteredPoints.length / maxPoints);
    const sampled = [];
    for (let i = 0; i < filteredPoints.length; i += step) sampled.push(filteredPoints[i]);
    return sampled;
  }, [filteredPoints, maxPoints]);

  const resolveMetricColor = useCallback(
    (value) => {
      const hookColor =
        typeof getMetricColor === "function"
          ? getMetricColor(value, selectedMetric)
          : null;
      if (hookColor && hookColor !== "#808080") return hookColor;
      return (
        getColorFromThresholds(value, selectedMetric, thresholds) ||
        getFallbackColor(value, selectedMetric)
      );
    },
    [getMetricColor, selectedMetric, thresholds],
  );

  const pointLayerData = useMemo(() => {
    return sampledPoints.map((point) => {
      const colorHex = resolveMetricColor(point.value);

      return {
        kind: "point",
        ...point,
        position: [point.lng, point.lat],
        color: toRgbaArray(colorHex, 220),
        size: Math.max(1, Math.log2((point.sampleCount || 1) + 1)),
      };
    });
  }, [sampledPoints, resolveMetricColor]);

  const gridLayerData = useMemo(() => {
    if (!enabled || !enableGrid || !Array.isArray(filteredPoints) || filteredPoints.length === 0) {
      return [];
    }

    const safeGridSizeMeters = Math.max(5, Number(gridSizeMeters) || 50);
    const polygonBounds = polygonPaths.map((path) => getPathBounds(path)).filter(Boolean);
    const pointBounds = getBoundsFromPoints(filteredPoints);
    const globalBounds = polygonBounds.length > 0 ? mergeBounds(polygonBounds) : pointBounds;
    if (!globalBounds) return [];

    const avgLat = (globalBounds.north + globalBounds.south) * 0.5;
    const latDegPerMeter = 1 / 111320;
    const cosLat = Math.cos((avgLat * Math.PI) / 180);
    const lngDegPerMeter = 1 / (111320 * Math.max(Math.abs(cosLat), 1e-6));

    const cellHeight = safeGridSizeMeters * latDegPerMeter;
    const cellWidth = safeGridSizeMeters * lngDegPerMeter;
    if (!Number.isFinite(cellHeight) || !Number.isFinite(cellWidth) || cellHeight <= 0 || cellWidth <= 0) {
      return [];
    }

    const aggregateFn =
      AGGREGATION_METHODS[gridAggregationMethod] || AGGREGATION_METHODS.median;

    const cellBuckets = new Map();
    for (const point of filteredPoints) {
      const row = Math.floor((point.lat - globalBounds.south) / cellHeight);
      const col = Math.floor((point.lng - globalBounds.west) / cellWidth);
      if (!Number.isFinite(row) || !Number.isFinite(col)) continue;

      const key = `${row}|${col}`;
      let bucket = cellBuckets.get(key);
      if (!bucket) {
        bucket = { row, col, values: [], pointCount: 0, sampleCount: 0 };
        cellBuckets.set(key, bucket);
      }

      bucket.pointCount += 1;
      bucket.sampleCount += Number.isFinite(point.sampleCount) ? point.sampleCount : 0;
      if (Number.isFinite(point.value)) {
        bucket.values.push(point.value);
      }
    }

    const cells = [];
    cellBuckets.forEach((bucket) => {
      const south = globalBounds.south + bucket.row * cellHeight;
      const north = south + cellHeight;
      const west = globalBounds.west + bucket.col * cellWidth;
      const east = west + cellWidth;
      const center = { lat: (south + north) * 0.5, lng: (west + east) * 0.5 };

      if (
        polygonPaths.length > 0 &&
        !polygonPaths.some((path) => isPointInPolygon(center, path))
      ) {
        return;
      }

      const aggregatedValue = aggregateFn(bucket.values);
      const colorHex = Number.isFinite(aggregatedValue)
        ? resolveMetricColor(aggregatedValue)
        : "#6b7280";

      cells.push({
        kind: "grid",
        id: `${bucket.row}-${bucket.col}`,
        polygon: [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
        ],
        value: Number.isFinite(aggregatedValue) ? aggregatedValue : null,
        pointCount: bucket.pointCount,
        sampleCount: bucket.sampleCount,
        lat: center.lat,
        lng: center.lng,
        color: toRgbaArray(colorHex, 190),
      });
    });

    return cells;
  }, [
    enabled,
    enableGrid,
    filteredPoints,
    gridSizeMeters,
    gridAggregationMethod,
    polygonPaths,
    selectedMetric,
    thresholds,
    getMetricColor,
    resolveMetricColor,
  ]);

  const isGridMode = enableGrid && gridLayerData.length > 0;

  const sizeScale = useMemo(() => {
    return Math.max(8, Math.min(28, zoomLevel * 1.6));
  }, [zoomLevel]);

  const validMap = useMemo(() => {
    return map && typeof map.getDiv === "function";
  }, [map]);

  useEffect(() => {
    if (!enabled || !validMap) return;

    if (!overlayRef.current) {
      overlayRef.current = new GoogleMapsOverlay({
        interleaved: true,
        glOptions: { preserveDrawingBuffer: false },
      });
    }

    overlayRef.current.setMap(map);
    setZoomLevel(map.getZoom?.() ?? 13);

    const listener = map.addListener("zoom_changed", () => {
      setZoomLevel(map.getZoom?.() ?? 13);
    });

    return () => {
      if (listener) window.google.maps.event.removeListener(listener);
      if (overlayRef.current) {
        overlayRef.current.setProps({ layers: [] });
        overlayRef.current.setMap(null);
      }
    };
  }, [enabled, validMap, map]);

  const handleHover = useCallback((info) => {
    if (!info?.object) {
      setHovered(null);
      return;
    }
    setHovered({
      x: info.x,
      y: info.y,
      object: info.object,
    });
  }, []);

  useEffect(() => {
    if (!enabled || !overlayRef.current || !validMap) return;

    const layer = isGridMode
      ? new PolygonLayer({
          id: "lte-prediction-grid-layer",
          data: gridLayerData,
          pickable: true,
          autoHighlight: true,
          filled: true,
          stroked: false,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => d.color,
          onHover: handleHover,
          updateTriggers: {
            getFillColor: [selectedMetric, thresholds, gridAggregationMethod],
          },
        })
      : squareAtlas
        ? new IconLayer({
            id: "lte-prediction-square-layer",
            data: pointLayerData,
            pickable: true,
            autoHighlight: true,
            getPosition: (d) => d.position,
            iconAtlas: squareAtlas,
            iconMapping: squareIconMapping,
            getIcon: () => "square",
            sizeUnits: "pixels",
            sizeScale,
            sizeMinPixels: 3,
            sizeMaxPixels: 42,
            getSize: (d) => d.size,
            getColor: (d) => d.color,
            onHover: handleHover,
            updateTriggers: {
              getColor: [selectedMetric, thresholds],
              getSize: [zoomLevel],
            },
          })
        : null;

    overlayRef.current.setProps({ layers: layer ? [layer] : [] });
  }, [
    enabled,
    validMap,
    isGridMode,
    gridLayerData,
    pointLayerData,
    selectedMetric,
    thresholds,
    gridAggregationMethod,
    sizeScale,
    zoomLevel,
    squareAtlas,
    squareIconMapping,
    handleHover,
  ]);

  useEffect(() => {
    return () => {
      if (!overlayRef.current) return;
      overlayRef.current.setProps({ layers: [] });
      overlayRef.current.setMap(null);
      overlayRef.current.finalize();
      overlayRef.current = null;
    };
  }, []);

  if (!enabled) return null;

  const isHoveredGrid = hovered?.object?.kind === "grid";
  const hoveredMetricLabel = String(selectedMetric || "rsrp").toUpperCase();
  const hoveredValue = Number.isFinite(hovered?.object?.value)
    ? hovered.object.value.toFixed(2)
    : "N/A";

  return hovered?.object ? (
    <div
      className="pointer-events-none absolute z-[1200] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow-lg"
      style={{
        left: `${(hovered.x || 0) + 12}px`,
        top: `${(hovered.y || 0) + 12}px`,
      }}
    >
      <div className="font-semibold">
        {isHoveredGrid ? "LTE Prediction Grid" : "LTE Prediction"}
      </div>
      <div>Metric: {hoveredMetricLabel}</div>
      <div>Value: {hoveredValue}</div>
      {isHoveredGrid ? (
        <div>Grid Points: {hovered.object.pointCount ?? 0}</div>
      ) : (
        <div>Samples: {hovered.object.sampleCount ?? 0}</div>
      )}
      <div>Site ID: {hovered.object.siteId || "N/A"}</div>
      <div className="text-[10px] text-slate-500">
        {hovered.object.lat?.toFixed?.(6)}, {hovered.object.lng?.toFixed?.(6)}
      </div>
    </div>
  ) : null;
};

export default React.memo(LtePredictionLocationLayer);
