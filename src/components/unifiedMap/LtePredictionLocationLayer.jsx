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
  filterPolygons = [],
  filterInsidePolygons = true,
  maxPoints = 20000,
  aggregateOverlaps = false,
  mlGridEnabled = false,
  mlGridSize = 50,
  mlGridAggregation = "mean",
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

  const filteredAndSampledPoints = useMemo(() => {
    if (!enabled || !Array.isArray(locations) || locations.length === 0) return [];

    let points = locations
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

    if (mlGridEnabled || aggregateOverlaps) {
      const grouped = new Map();
      const metersPerDegLat = 111320;

      for (const p of points) {
        let key, bounds, cellLat, cellLng;

        if (mlGridEnabled) {
          const stepLat = mlGridSize / metersPerDegLat;
          const stepLng = mlGridSize / (metersPerDegLat * Math.cos((p.lat * Math.PI) / 180));
          const row = Math.floor(p.lat / stepLat);
          const col = Math.floor(p.lng / stepLng);
          key = `grid-${row},${col}`;

          const s = row * stepLat;
          const w = col * stepLng;
          const n = s + stepLat;
          const e = w + stepLng;
          bounds = [[w, s], [e, s], [e, n], [w, n]];
          cellLat = (s + n) / 2;
          cellLng = (w + e) / 2;
        } else {
          key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
          cellLat = p.lat;
          cellLng = p.lng;
        }

        if (!grouped.has(key)) {
          grouped.set(key, { points: [], bounds, cellLat, cellLng });
        }
        grouped.get(key).points.push(p);
      }

      points = Array.from(grouped.values()).map(cell => {
        if (cell.points.length === 1 && !mlGridEnabled) return cell.points[0];

        const values = cell.points.map(g => g.value).filter(v => typeof v === 'number');
        if (values.length === 0) return { ...cell.points[0], polygon: cell.bounds };

        const mean = values.reduce((a, b) => a + b, 0) / values.length;

        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

        const counts = {};
        let mode = values[0];
        let maxCount = 0;
        for (const v of values) {
          counts[v] = (counts[v] || 0) + 1;
          if (counts[v] > maxCount) {
            maxCount = counts[v];
            mode = v;
          }
        }

        const sites = [...new Set(cell.points.map(g => g.siteId).filter(Boolean))];

        let aggValue = mean;
        if (mlGridEnabled) {
          if (mlGridAggregation === "median") aggValue = median;
          if (mlGridAggregation === "mode") aggValue = mode;
        }

        return {
          ...cell.points[0],
          lat: cell.cellLat,
          lng: cell.cellLng,
          value: aggValue,
          mean,
          median,
          mode,
          isAggregated: true,
          isGridCell: mlGridEnabled,
          overlapCount: cell.points.length,
          aggregatedSites: sites,
          polygon: cell.bounds,
          sampleCount: cell.points.reduce((sum, p) => sum + (p.sampleCount || 0), 0)
        };
      });
    }

    if (filterInsidePolygons && polygonPaths.length > 0) {
      points = points.filter((point) => polygonPaths.some((path) => isPointInPolygon(point, path)));
    }

    if (points.length <= maxPoints) return points;

    const step = Math.ceil(points.length / maxPoints);
    const sampled = [];
    for (let i = 0; i < points.length; i += step) sampled.push(points[i]);
    return sampled;
  }, [enabled, locations, maxPoints, filterInsidePolygons, polygonPaths, aggregateOverlaps, mlGridEnabled, mlGridSize, mlGridAggregation]);

  const layerData = useMemo(() => {
    return filteredAndSampledPoints.map((point) => {
      const colorHex =
        getColorFromThresholds(point.value, selectedMetric, thresholds) ||
        getFallbackColor(point.value, selectedMetric);

      return {
        ...point,
        position: [point.lng, point.lat],
        polygon: point.polygon,
        color: toRgbaArray(colorHex, mlGridEnabled ? 180 : 220),
        size: Math.max(1, Math.log2((point.sampleCount || 1) + 1)),
      };
    });
  }, [filteredAndSampledPoints, selectedMetric, thresholds, mlGridEnabled]);

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
    if (!enabled || !overlayRef.current || !validMap || !squareAtlas) return;

    const layers = [];

    if (mlGridEnabled) {
      layers.push(
        new PolygonLayer({
          id: "lte-prediction-grid-layer",
          data: layerData,
          pickable: true,
          stroked: false,
          filled: true,
          extruded: false,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => d.color,
          onHover: handleHover,
          updateTriggers: {
            getFillColor: [selectedMetric, thresholds, mlGridAggregation],
          },
        })
      );
    } else {
      layers.push(
        new IconLayer({
          id: "lte-prediction-square-layer",
          data: layerData,
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
      );
    }

    overlayRef.current.setProps({ layers });
  }, [
    enabled,
    validMap,
    layerData,
    selectedMetric,
    thresholds,
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

  return hovered?.object ? (
    <div
      className="pointer-events-none absolute z-[1200] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow-lg"
      style={{
        left: `${(hovered.x || 0) + 12}px`,
        top: `${(hovered.y || 0) + 12}px`,
      }}
    >
      <div className="font-semibold">LTE Prediction</div>
      <div>Metric: {String(selectedMetric || "rsrp").toUpperCase()}</div>
      
      {hovered.object.isGridCell ? (
        <>
          <div className="mt-1 font-semibold text-[11px] text-blue-600 border-b pb-0.5 mb-0.5">Cell ({hovered.object.overlapCount} samples)</div>
          <div>Aggregated ({mlGridAggregation}): {Number.isFinite(hovered.object.value) ? hovered.object.value.toFixed(2) : "N/A"}</div>
          <div className="text-[10px] text-slate-500">Mean: {hovered.object.mean?.toFixed(2)} | Median: {hovered.object.median?.toFixed(2)}</div>
        </>
      ) : hovered.object.isAggregated ? (
        <>
          <div className="mt-1 font-semibold text-[11px] text-blue-600 border-b pb-0.5 mb-0.5">Aggregated ({hovered.object.overlapCount} overlaps)</div>
          <div>Mean: {hovered.object.mean?.toFixed(2)}</div>
          <div>Median: {hovered.object.median?.toFixed(2)}</div>
          <div>Mode: {hovered.object.mode?.toFixed(2)}</div>
          <div className="text-[10px] italic text-slate-500 max-w-[150px] truncate" title={hovered.object.aggregatedSites?.join(", ")}>
            Sites: {hovered.object.aggregatedSites?.join(", ") || "N/A"}
          </div>
        </>
      ) : (
        <>
          <div>Value: {Number.isFinite(hovered.object.value) ? hovered.object.value.toFixed(2) : "N/A"}</div>
          <div>Samples: {hovered.object.sampleCount ?? 0}</div>
          <div>Site ID: {hovered.object.siteId || "N/A"}</div>
        </>
      )}

      <div className="text-[10px] text-slate-500 mt-1">
        {hovered.object.lat?.toFixed?.(6)}, {hovered.object.lng?.toFixed?.(6)}
      </div>
    </div>
  ) : null;
};

export default React.memo(LtePredictionLocationLayer);
