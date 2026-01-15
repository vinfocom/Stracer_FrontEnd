// src/pages/SessionMapDebug.jsx
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import { mapViewApi } from "../api/apiEndpoints";
import Spinner from "../components/common/Spinner";
import { ArrowLeft, Download, Save, X, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";
import { toast } from "react-toastify";
import { useMapContext } from "../context/MapContext";
import DrawingToolsLayer from "@/components/map/tools/DrawingToolsLayer";
import AllLogsPanelToggle from "@/components/map/layout/AllLogsPanelToggle";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import useColorForLog from "@/hooks/useColorForLog.js";
import { useNetworkSamples } from "@/hooks/useNetworkSamples";

// ============================================
// CONSTANTS & HELPERS
// ============================================
const containerStyle = {
  width: "100%",
  height: "100%",
  position: "absolute",
  top: 0,
  left: 0,
};

const DEFAULT_CENTER = { lat: 28.6139, lng: 77.209 };

const MAP_OPTIONS = {
  mapTypeControl: true,
  streetViewControl: false,
  fullscreenControl: true,
  zoomControl: true,
  gestureHandling: "greedy",
};

const getMetricUnit = (metric) => {
  switch (metric?.toUpperCase()) {
    case "RSRP":
      return "dBm";
    case "RSRQ":
      return "dB";
    case "SINR":
      return "dB";
    case "MOS":
      return "";
    case "DL_THPT":
    case "UL_THPT":
    case "DL_TPT":
    case "UL_TPT":
      return "Mbps";
    default:
      return "dBm";
  }
};

const getMetricValue = (log, metric) => {
  const metricKey = metric?.toLowerCase() || "rsrp";
  return log[metricKey] ?? log.rsrp ?? -120;
};

// Enhanced WKT conversion that supports polygon, rectangle, and circle
const geometryToWktPolygon = (geometry) => {
  if (!geometry) return null;

  if (geometry.type === "polygon" && geometry.polygon?.length >= 3) {
    const pointsString = geometry.polygon
      .map((p) => `${p.lng} ${p.lat}`)
      .join(", ");
    const first = `${geometry.polygon[0].lng} ${geometry.polygon[0].lat}`;
    return `POLYGON((${pointsString}, ${first}))`;
  }

  if (geometry.type === "rectangle" && geometry.rectangle) {
    const { ne, sw } = geometry.rectangle;
    const coords = [
      { lng: sw.lng, lat: ne.lat },
      { lng: ne.lng, lat: ne.lat },
      { lng: ne.lng, lat: sw.lat },
      { lng: sw.lng, lat: sw.lat },
      { lng: sw.lng, lat: ne.lat },
    ];
    const pointsString = coords.map((p) => `${p.lng} ${p.lat}`).join(", ");
    return `POLYGON((${pointsString}))`;
  }

  if (geometry.type === "circle" && geometry.circle) {
    const { center, radius } = geometry.circle;
    const points = [];
    const numPoints = 64;
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const latOffset = (radius / 111111) * Math.cos(angle);
      const lngOffset =
        (radius / (111111 * Math.cos((center.lat * Math.PI) / 180))) *
        Math.sin(angle);
      points.push({
        lat: center.lat + latOffset,
        lng: center.lng + lngOffset,
      });
    }
    points.push(points[0]);
    const pointsString = points.map((p) => `${p.lng} ${p.lat}`).join(", ");
    return `POLYGON((${pointsString}))`;
  }

  return null;
};

// ============================================
// CANVAS CIRCLES OVERLAY COMPONENT
// ============================================
function CanvasCirclesOverlay({ map, logs, metric = "RSRP", getMetricColor }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!map || !logs.length || !window.google) return;

    class CirclesOverlay extends window.google.maps.OverlayView {
      constructor() {
        super();
        this.canvas = null;
      }

      onAdd() {
        this.canvas = document.createElement("canvas");
        this.canvas.style.position = "absolute";
        this.canvas.style.pointerEvents = "none";
        const panes = this.getPanes();
        if (panes) panes.overlayLayer.appendChild(this.canvas);
      }

      draw() {
        if (!this.canvas) return;
        const projection = this.getProjection();
        if (!projection) return;

        const bounds = map.getBounds();
        if (!bounds) return;

        const ne = projection.fromLatLngToDivPixel(bounds.getNorthEast());
        const sw = projection.fromLatLngToDivPixel(bounds.getSouthWest());

        if (!ne || !sw) return;

        const width = Math.abs(ne.x - sw.x);
        const height = Math.abs(ne.y - sw.y);

        this.canvas.width = width;
        this.canvas.height = height;
        this.canvas.style.left = sw.x + "px";
        this.canvas.style.top = ne.y + "px";

        const ctx = this.canvas.getContext("2d");
        ctx.clearRect(0, 0, width, height);

        const zoom = map.getZoom() || 12;
        const radius = Math.max(3, Math.min(8, zoom - 10));

        logs.forEach((pt) => {
          try {
            const latLng = new window.google.maps.LatLng(pt.lat, pt.lng);
            const pixel = projection.fromLatLngToDivPixel(latLng);
            if (pixel) {
              const x = pixel.x - sw.x;
              const y = pixel.y - ne.y;

              const metricValue = getMetricValue(pt, metric);
              const color = getMetricColor(metricValue, metric);

              ctx.beginPath();
              ctx.arc(x, y, radius, 0, Math.PI * 2);
              ctx.fillStyle = color;
              ctx.globalAlpha = 0.6;
              ctx.fill();
              ctx.globalAlpha = 1;
            }
          } catch (e) {
            // Silent error
          }
        });
      }

      onRemove() {
        if (this.canvas && this.canvas.parentNode) {
          this.canvas.parentNode.removeChild(this.canvas);
        }
        this.canvas = null;
      }
    }

    const overlay = new CirclesOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;

    const idleListener = map.addListener("idle", () => {
      if (overlayRef.current) overlayRef.current.draw();
    });

    return () => {
      if (idleListener) window.google.maps.event.removeListener(idleListener);
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
        overlayRef.current = null;
      }
    };
  }, [map, logs, metric, getMetricColor]);

  return null;
}

// ============================================
// ACTIVE FILTERS BAR COMPONENT
// ============================================
function ActiveFiltersBar({
  filters,
  onClearFilter,
  onClearAll,
  className = "",
}) {
  const activeFilters = [];

  if (filters.technology && filters.technology !== "ALL") {
    activeFilters.push({
      key: "technology",
      label: `Tech: ${filters.technology}`,
      color: "bg-purple-100 text-purple-700 hover:bg-purple-200",
    });
  }
  if (filters.band) {
    activeFilters.push({
      key: "band",
      label: `Band: ${filters.band} MHz`,
      color: "bg-blue-100 text-blue-700 hover:bg-blue-200",
    });
  }
  if (filters.minSignal) {
    activeFilters.push({
      key: "minSignal",
      label: `Min: ${filters.minSignal} dBm`,
      color: "bg-orange-100 text-orange-700 hover:bg-orange-200",
    });
  }
  if (filters.maxSignal) {
    activeFilters.push({
      key: "maxSignal",
      label: `Max: ${filters.maxSignal} dBm`,
      color: "bg-red-100 text-red-700 hover:bg-red-200",
    });
  }
  if (filters.startDate) {
    activeFilters.push({
      key: "startDate",
      label: `From: ${format(filters.startDate, "MMM dd")}`,
      color: "bg-green-100 text-green-700 hover:bg-green-200",
    });
  }
  if (filters.endDate) {
    activeFilters.push({
      key: "endDate",
      label: `To: ${format(filters.endDate, "MMM dd")}`,
      color: "bg-green-100 text-green-700 hover:bg-green-200",
    });
  }
  if (filters.dataSource && filters.dataSource !== "all") {
    activeFilters.push({
      key: "dataSource",
      label: `Source: ${filters.dataSource}`,
      color: "bg-cyan-100 text-cyan-700 hover:bg-cyan-200",
    });
  }

  if (activeFilters.length === 0) return null;

  return (
    <div
      className={`bg-white/95 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 flex items-center gap-2 flex-wrap ${className}`}
    >
      <div className="flex items-center gap-1.5 text-gray-500">
        <Filter className="h-4 w-4" />
        <span className="text-xs font-medium">Filters:</span>
      </div>

      {activeFilters.map((filter) => (
        <Badge
          key={filter.key}
          variant="secondary"
          className={`${filter.color} cursor-pointer flex items-center gap-1 text-xs font-medium transition-colors`}
          onClick={() => onClearFilter(filter.key)}
        >
          {filter.label}
          <X className="h-3 w-3" />
        </Badge>
      ))}

      {activeFilters.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700"
          onClick={onClearAll}
        >
          Clear All
        </Button>
      )}
    </div>
  );
}

// ============================================
// MAP LEGEND COMPONENT
// ============================================
function MapLegend({ metric = "RSRP", thresholds = null }) {
  const unit = getMetricUnit(metric);

  const legendItems = useMemo(() => {
    if (!thresholds || !Array.isArray(thresholds) || thresholds.length === 0) {
      const defaultLegends = {
        RSRP: [
          { color: "#00FF00", label: ">= -80 dBm (Excellent)" },
          { color: "#7FFF00", label: "-80 to -90 dBm (Good)" },
          { color: "#FFFF00", label: "-90 to -100 dBm (Fair)" },
          { color: "#FFA500", label: "-100 to -110 dBm (Poor)" },
          { color: "#FF0000", label: "< -110 dBm (No Signal)" },
        ],
        RSRQ: [
          { color: "#00FF00", label: ">= -10 dB (Excellent)" },
          { color: "#7FFF00", label: "-10 to -15 dB (Good)" },
          { color: "#FFFF00", label: "-15 to -20 dB (Fair)" },
          { color: "#FFA500", label: "-20 to -25 dB (Poor)" },
          { color: "#FF0000", label: "< -25 dB (Bad)" },
        ],
        SINR: [
          { color: "#00FF00", label: ">= 20 dB (Excellent)" },
          { color: "#7FFF00", label: "13 to 20 dB (Good)" },
          { color: "#FFFF00", label: "0 to 13 dB (Fair)" },
          { color: "#FFA500", label: "-5 to 0 dB (Poor)" },
          { color: "#FF0000", label: "< -5 dB (Bad)" },
        ],
        DL_THPT: [
          { color: "#00FF00", label: ">= 50 Mbps (Excellent)" },
          { color: "#7FFF00", label: "20-50 Mbps (Good)" },
          { color: "#FFFF00", label: "10-20 Mbps (Fair)" },
          { color: "#FFA500", label: "5-10 Mbps (Poor)" },
          { color: "#FF0000", label: "< 5 Mbps (Bad)" },
        ],
        UL_THPT: [
          { color: "#00FF00", label: ">= 50 Mbps (Excellent)" },
          { color: "#7FFF00", label: "20-50 Mbps (Good)" },
          { color: "#FFFF00", label: "10-20 Mbps (Fair)" },
          { color: "#FFA500", label: "5-10 Mbps (Poor)" },
          { color: "#FF0000", label: "< 5 Mbps (Bad)" },
        ],
        DL_TPT: [
          { color: "#00FF00", label: ">= 50 Mbps (Excellent)" },
          { color: "#7FFF00", label: "20-50 Mbps (Good)" },
          { color: "#FFFF00", label: "10-20 Mbps (Fair)" },
          { color: "#FFA500", label: "5-10 Mbps (Poor)" },
          { color: "#FF0000", label: "< 5 Mbps (Bad)" },
        ],
        UL_TPT: [
          { color: "#00FF00", label: ">= 50 Mbps (Excellent)" },
          { color: "#7FFF00", label: "20-50 Mbps (Good)" },
          { color: "#FFFF00", label: "10-20 Mbps (Fair)" },
          { color: "#FFA500", label: "5-10 Mbps (Poor)" },
          { color: "#FF0000", label: "< 5 Mbps (Bad)" },
        ],
      };
      return defaultLegends[metric?.toUpperCase()] || defaultLegends.RSRP;
    }

    const isNegativeMetric = ["RSRP", "RSRQ"].includes(metric?.toUpperCase());
    const sorted = [...thresholds].sort((a, b) => {
      return isNegativeMetric
        ? parseFloat(b.min) - parseFloat(a.min)
        : parseFloat(b.min) - parseFloat(a.min);
    });

    return sorted.map((t) => ({
      color: t.color,
      label: t.label || `${t.range || `${t.min} to ${t.max}`} ${unit}`.trim(),
    }));
  }, [thresholds, metric, unit]);

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3">
      <h4 className="text-xs font-semibold text-gray-700 mb-2">
        {metric || "RSRP"} Legend {unit && `(${unit})`}
      </h4>
      <div className="space-y-1">
        {legendItems.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-sm border border-gray-300"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-gray-600">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
function SessionMapDebug() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Map State
  const [map, setMap] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [polygonName, setPolygonName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [sessionMarkers, setSessionMarkers] = useState([]);

  // Use the color hook
  const {
    getMetricColor,
    getThresholdsForMetric,
    thresholds: allThresholds,
    loading: thresholdsLoading,
  } = useColorForLog();

  // Map context
  const {
    ui,
    setDownloadHandlers,
    setPolygonStats,
    setHasLogs,
    filters,
    resetFilter,
    clearFilters,
    hasActiveFilters,
    updateAvailableFilters,
  } = useMapContext();

  // Parse session IDs
  const sessionIdParam =
    searchParams.get("sessionId") || searchParams.get("sessionIds");
  const sessionIds = useMemo(() => {
    if (!sessionIdParam) return [];
    return sessionIdParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }, [sessionIdParam]);

  // Google Maps loader
  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  // Safe UI defaults
  const safeUi = useMemo(
    () => ({
      drawEnabled: false,
      shapeMode: "polygon",
      drawPixelateRect: false,
      drawCellSizeMeters: 5,
      drawClearSignal: 0,
      colorizeCells: true,
      ...ui,
    }),
    [ui]
  );

  // Use the Network Samples Hook
  const {
    locations: logs,
    loading,
    error,
    progress: fetchProgress,
    appSummary,
  } = useNetworkSamples(sessionIds, true);

  // Update Available Filters and Markers when logs change
  useEffect(() => {
    if (!logs || logs.length === 0) return;

    const allProviders = new Set();
    const allBands = new Set();
    const allNetworkTypes = new Set();
    const markersMap = new Map();

    logs.forEach((log) => {
      if (log.provider) allProviders.add(log.provider);
      if (log.band) allBands.add(String(log.band));
      if (log.technology) allNetworkTypes.add(log.technology);

      if (!markersMap.has(log.session_id)) {
        markersMap.set(log.session_id, {
          id: log.session_id,
          session_id: log.session_id,
          lat: log.lat,
          lng: log.lng,
          position: { lat: log.lat, lng: log.lng },
          logsCount: 1,
        });
      } else {
        markersMap.get(log.session_id).logsCount++;
      }
    });

    updateAvailableFilters({
      providers: Array.from(allProviders).filter(Boolean),
      bands: Array.from(allBands).filter(Boolean),
      technologies: Array.from(allNetworkTypes).filter(Boolean),
    });

    setSessionMarkers(Array.from(markersMap.values()));
  }, [logs, updateAvailableFilters]);

  // Current thresholds
  const currentThresholds = useMemo(() => {
    return getThresholdsForMetric(filters.metric || "RSRP");
  }, [getThresholdsForMetric, filters.metric]);

  // Filter logs logic
  const filteredLogs = useMemo(() => {
    if (!logs.length) return [];

    return logs.filter((log) => {
      const metricValue = getMetricValue(log, filters.metric);

      if (filters.minSignal !== "" && !isNaN(parseFloat(filters.minSignal))) {
        if (metricValue < parseFloat(filters.minSignal)) return false;
      }
      if (filters.maxSignal !== "" && !isNaN(parseFloat(filters.maxSignal))) {
        if (metricValue > parseFloat(filters.maxSignal)) return false;
      }
      if (filters.technology && filters.technology !== "ALL") {
        if (
          log.technology?.toUpperCase() !== filters.technology.toUpperCase()
        )
          return false;
      }
      if (filters.band && filters.band !== "" && filters.band !== "all") {
        if (log.band?.toString() !== filters.band) return false;
      }
      if (filters.provider && filters.provider !== "all") {
        if (log.provider?.toLowerCase() !== filters.provider.toLowerCase())
          return false;
      }
      if (filters.dataSource && filters.dataSource !== "all") {
        if (log.source?.toLowerCase() !== filters.dataSource.toLowerCase())
          return false;
      }
      if (filters.startDate || filters.endDate) {
        if (log.timestamp) {
          const logDate = new Date(log.timestamp);
          if (filters.startDate && logDate < filters.startDate) return false;
          if (filters.endDate) {
            const endOfDay = new Date(filters.endDate);
            endOfDay.setHours(23, 59, 59, 999);
            if (logDate > endOfDay) return false;
          }
        }
      }
      return true;
    });
  }, [logs, filters]);

  // Fit map bounds when filtered logs change
  useEffect(() => {
    if (map && filteredLogs.length > 0 && window.google) {
      const bounds = new window.google.maps.LatLngBounds();
      filteredLogs.forEach((pt) => bounds.extend({ lat: pt.lat, lng: pt.lng }));
      map.fitBounds(bounds, { padding: 80 });
    }
  }, [map, filteredLogs]);

  // Show toast when filtered count changes
  const prevFilteredCountRef = useRef(0);
  useEffect(() => {
    if (
      logs.length > 0 &&
      filteredLogs.length !== prevFilteredCountRef.current
    ) {
      if (
        prevFilteredCountRef.current > 0 &&
        filteredLogs.length !== logs.length
      ) {
        toast.info(`Showing ${filteredLogs.length} of ${logs.length} points`, {
          autoClose: 2000,
          toastId: "filter-toast",
        });
      }
      prevFilteredCountRef.current = filteredLogs.length;
    }
  }, [filteredLogs.length, logs.length]);

  const handleClearFilter = useCallback(
    (key) => resetFilter(key),
    [resetFilter]
  );

  // Enhanced Save Polygon with full support for polygon/rectangle/circle
  const handleSavePolygon = async () => {
    if (!analysis || !analysis.geometry) {
      toast.warn("No analysis geometry found to save.");
      return;
    }
    if (!polygonName.trim()) {
      toast.warn("Please provide a name for the polygon.");
      return;
    }

    const wktString = geometryToWktPolygon(analysis.geometry);
    if (!wktString) {
      toast.error("Failed to convert geometry to WKT format.");
      return;
    }

    const payload = {
      Name: polygonName,
      WKT: wktString,
      SessionIds: sessionIds,
    };

    setIsSaving(true);
    try {
      const response = await mapViewApi.savePolygon(payload);
      if (response?.Status === 1) {
        toast.success(`Polygon "${polygonName}" saved successfully!`);
        setIsSaveDialogOpen(false);
        setPolygonName("");
        setAnalysis(null);
        setPolygonStats(null);
      } else {
        toast.error(response?.Message || "Failed to save polygon.");
      }
    } catch (err) {
      toast.error(`Error saving polygon: ${err.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Stats CSV download
  const handleStatsDownload = useCallback(() => {
    if (filteredLogs.length === 0) {
      toast.error("No data to download");
      return;
    }

    const values = filteredLogs
      .map((log) => getMetricValue(log, filters.metric))
      .filter((v) => v !== null && !isNaN(v));
    const sortedValues = [...values].sort((a, b) => a - b);

    const activeFiltersStr =
      Object.entries(filters)
        .filter(([_, v]) => v && v !== "ALL" && v !== "all" && v !== "")
        .map(([k, v]) => {
          if (v instanceof Date) return `${k}: ${format(v, "yyyy-MM-dd")}`;
          return `${k}: ${v}`;
        })
        .join("; ") || "None";

    const csvRows = [
      ["Metric", "Value"],
      ["Session IDs", sessionIds.join("; ")],
      ["Total Points (Filtered)", filteredLogs.length],
      ["Total Points (Original)", logs.length],
      ["Active Filters", activeFiltersStr],
      [
        `${filters.metric || "RSRP"} Mean`,
        values.length > 0
          ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
          : "N/A",
      ],
      [
        `${filters.metric || "RSRP"} Min`,
        values.length > 0 ? Math.min(...values).toFixed(2) : "N/A",
      ],
      [
        `${filters.metric || "RSRP"} Max`,
        values.length > 0 ? Math.max(...values).toFixed(2) : "N/A",
      ],
      [
        `${filters.metric || "RSRP"} Median`,
        sortedValues[Math.floor(sortedValues.length / 2)]?.toFixed(2) || "N/A",
      ],
      ["Generated At", new Date().toISOString()],
    ];

    const blob = new Blob([csvRows.map((r) => r.join(",")).join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stats_${filters.metric || "RSRP"}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Stats CSV downloaded!");
  }, [filteredLogs, logs.length, sessionIds, filters]);

  // Raw logs CSV download
  const handleRawDownload = useCallback(() => {
    if (filteredLogs.length === 0) {
      toast.error("No logs to download");
      return;
    }

    const headers = [
      "session_id",
      "lat",
      "lng",
      "rsrp",
      "rsrq",
      "sinr",
      "technology",
      "band",
      "timestamp",
      "source",
    ];
    const rows = [
      headers.join(","),
      ...filteredLogs.map((l) =>
        [
          l.session_id || "",
          l.lat || "",
          l.lng || "",
          l.rsrp ?? "",
          l.rsrq ?? "",
          l.sinr ?? "",
          l.technology || "",
          l.band || "",
          l.timestamp || "",
          l.source || "",
        ].join(",")
      ),
    ];

    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `raw_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filteredLogs.length.toLocaleString()} points!`);
  }, [filteredLogs]);

  // Set download handlers in context (prevents stale closures)
  const downloadHandlersRef = useRef({
    stats: handleStatsDownload,
    raw: handleRawDownload,
  });
  downloadHandlersRef.current = {
    stats: handleStatsDownload,
    raw: handleRawDownload,
  };

  useEffect(() => {
    setDownloadHandlers({
      onDownloadStatsCsv: () => downloadHandlersRef.current.stats(),
      onDownloadRawCsv: () => downloadHandlersRef.current.raw(),
    });
  }, [setDownloadHandlers]);

  // Update polygon stats whenever filtered logs change
  const prevFilteredLengthRef = useRef(0);
  useEffect(() => {
    if (filteredLogs.length !== prevFilteredLengthRef.current) {
      prevFilteredLengthRef.current = filteredLogs.length;

      if (filteredLogs.length > 0) {
        const values = filteredLogs
          .map((l) => getMetricValue(l, filters.metric))
          .filter((v) => v !== null && !isNaN(v));
        const sorted = [...values].sort((a, b) => a - b);

        setPolygonStats({
          count: filteredLogs.length,
          type: "session",
          logs: filteredLogs,
          stats: {
            mean:
              values.length > 0
                ? values.reduce((a, b) => a + b, 0) / values.length
                : 0,
            min: values.length > 0 ? Math.min(...values) : 0,
            max: values.length > 0 ? Math.max(...values) : 0,
            median: values.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0,
          },
          intersectingSessions: sessionIds.map((id) => ({ id })),
          activeFilters: filters,
          selectedMetric: filters.metric || "RSRP",
        });
        setHasLogs(true);
      } else {
        setPolygonStats(null);
        setHasLogs(false);
      }
    }
  }, [filteredLogs, sessionIds, filters, setPolygonStats, setHasLogs]);

  // Map callbacks
  const onMapLoad = useCallback((m) => setMap(m), []);
  const onMapUnmount = useCallback(() => setMap(null), []);

  const handleDrawingSummary = useCallback(
    (stats) => {
      setAnalysis(stats);
      setPolygonStats(stats);
    },
    [setPolygonStats]
  );

  const handleCloseAnalysis = useCallback(() => {
    setAnalysis(null);
    setPolygonStats(null);
  }, [setPolygonStats]);

  const goBack = useCallback(() => navigate(-1), [navigate]);

  const mapCenter = useMemo(() => {
    if (filteredLogs.length > 0)
      return { lat: filteredLogs[0].lat, lng: filteredLogs[0].lng };
    return DEFAULT_CENTER;
  }, [filteredLogs]);

  // Loading State
  if (!isLoaded || loading || thresholdsLoading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-gray-900">
        <div className="text-center">
          <Spinner />
          <p className="mt-4 text-white">
            {thresholdsLoading
              ? "Loading thresholds..."
              : loading && fetchProgress?.total > 0
              ? `Loading... ${fetchProgress.current.toLocaleString()} / ${fetchProgress.total.toLocaleString()} points`
              : "Loading map..."}
          </p>
          {loading && fetchProgress?.total > 0 && (
            <div className="mt-2 w-64 mx-auto bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    (fetchProgress.current / fetchProgress.total) * 100
                  )}%`,
                }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loadError || error) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-gray-900 text-white">
        <div className="text-center max-w-md px-4">
          <h2 className="text-2xl font-bold mb-4">Error</h2>
          <p className="text-red-400 mb-4">{loadError?.message || error}</p>
          <Button onClick={goBack} className="bg-blue-600 hover:bg-blue-700">
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
          </Button>
        </div>
      </div>
    );
  }

  // Formatted thresholds for Drawing Layer
  const formattedThresholds = allThresholds
    ? {
        rsrp: allThresholds.rsrp || [],
        rsrq: allThresholds.rsrq || [],
        sinr: allThresholds.sinr || [],
        dl_thpt: allThresholds.dlThpt || allThresholds.dl_tpt || [],
        ul_thpt: allThresholds.ulThpt || allThresholds.ul_tpt || [],
        mos: allThresholds.mos || [],
        lte_bler: allThresholds.lteBler || [],
      }
    : {};

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={mapCenter}
        zoom={12}
        onLoad={onMapLoad}
        onUnmount={onMapUnmount}
        options={MAP_OPTIONS}
      >
        {map && filteredLogs.length > 0 && (
          <CanvasCirclesOverlay
            map={map}
            logs={filteredLogs}
            metric={filters.metric || "RSRP"}
            getMetricColor={getMetricColor}
          />
        )}

        {map && (
          <DrawingToolsLayer
            map={map}
            enabled={safeUi.drawEnabled}
            logs={filteredLogs}
            sessions={sessionMarkers}
            thresholds={formattedThresholds}
            selectedMetric={filters.metric?.toLowerCase() || "rsrp"}
            shapeMode={safeUi.shapeMode}
            pixelateRect={safeUi.drawPixelateRect}
            cellSizeMeters={safeUi.drawCellSizeMeters}
            colorizeCells={safeUi.colorizeCells}
            onSummary={handleDrawingSummary}
            onDrawingsChange={() => {}}
            clearSignal={safeUi.drawClearSignal}
          />
        )}
      </GoogleMap>

      <AllLogsPanelToggle
        logs={filteredLogs}
        thresholds={formattedThresholds}
        selectedMetric={filters.metric?.toLowerCase() || "rsrp"}
        isLoading={loading}
        appSummary={appSummary}
        getMetricColor={getMetricColor}
      />

      {hasActiveFilters && (
        <ActiveFiltersBar
          filters={filters}
          onClearFilter={handleClearFilter}
          onClearAll={clearFilters}
          className="absolute top-4 left-4 z-20 max-w-lg"
        />
      )}

      {showLegend && (
        <div className="absolute top-20 right-4 z-20">
          <MapLegend
            metric={filters.metric || "RSRP"}
            thresholds={currentThresholds}
          />
        </div>
      )}

      {/* No results overlay when filters eliminate everything */}
      {filteredLogs.length === 0 && logs.length > 0 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg px-6 py-4 text-center">
          <Filter className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-700 font-medium">
            No points match current filters
          </p>
          <p className="text-gray-500 text-sm mt-1">
            {logs.length.toLocaleString()} points available. Try adjusting your
            filters.
          </p>
          <Button size="sm" className="mt-3" onClick={clearFilters}>
            Clear All Filters
          </Button>
        </div>
      )}

      {/* Analysis Panel */}
      {analysis && (
        <div className="absolute bottom-4 left-4 z-30 bg-white rounded-lg shadow-lg w-[320px] border border-gray-200">
          <div className="flex items-center justify-between px-3 py-2 bg-blue-600 rounded-t-lg">
            <h3 className="font-semibold text-white text-sm">
              Selection Analysis
            </h3>
            <button
              onClick={handleCloseAnalysis}
              className="text-white/80 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-3 text-xs space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded px-2 py-1.5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">
                  Shape
                </div>
                <div className="font-medium text-gray-800 capitalize">
                  {analysis.type || "Unknown"}
                </div>
              </div>
              <div className="bg-gray-50 rounded px-2 py-1.5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">
                  Points
                </div>
                <div className="font-medium text-gray-800">
                  {(analysis.count || 0).toLocaleString()}
                </div>
              </div>
            </div>

            {analysis.stats && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-blue-50 rounded px-2 py-1.5 border border-blue-100">
                  <div className="text-[10px] text-blue-600 uppercase tracking-wide">
                    Mean
                  </div>
                  <div className="font-bold text-blue-700">
                    {analysis.stats.mean?.toFixed(1) ?? "-"}{" "}
                    {getMetricUnit(filters.metric)}
                  </div>
                </div>
                <div className="bg-green-50 rounded px-2 py-1.5 border border-green-100">
                  <div className="text-[10px] text-green-600 uppercase tracking-wide">
                    Median
                  </div>
                  <div className="font-bold text-green-700">
                    {analysis.stats.median?.toFixed(1) ?? "-"}{" "}
                    {getMetricUnit(filters.metric)}
                  </div>
                </div>
                <div className="bg-orange-50 rounded px-2 py-1.5 border border-orange-100">
                  <div className="text-[10px] text-orange-600 uppercase tracking-wide">
                    Min
                  </div>
                  <div className="font-bold text-orange-700">
                    {analysis.stats.min?.toFixed(1) ?? "-"}{" "}
                    {getMetricUnit(filters.metric)}
                  </div>
                </div>
                <div className="bg-red-50 rounded px-2 py-1.5 border border-red-100">
                  <div className="text-[10px] text-red-600 uppercase tracking-wide">
                    Max
                  </div>
                  <div className="font-bold text-red-700">
                    {analysis.stats.max?.toFixed(1) ?? "-"}{" "}
                    {getMetricUnit(filters.metric)}
                  </div>
                </div>
              </div>
            )}

            {analysis.area > 0 && (
              <div className="bg-gray-50 rounded px-2 py-1.5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">
                  Area
                </div>
                <div className="font-medium text-gray-800">
                  {analysis.area > 1_000_000
                    ? `${(analysis.area / 1_000_000).toFixed(2)} km²`
                    : `${analysis.area.toFixed(0)} m²`}
                </div>
              </div>
            )}

            {hasActiveFilters && (
              <div className="bg-yellow-50 rounded px-2 py-1.5 border border-yellow-100 text-xs text-yellow-800">
                Analysis based on filtered data
              </div>
            )}
          </div>

          <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 rounded-b-lg flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={() => setIsSaveDialogOpen(true)}
              disabled={!analysis.geometry}
            >
              <Save className="h-3 w-3 mr-1.5" />
              Save Polygon
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2"
              onClick={handleStatsDownload}
            >
              <Download className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Save Polygon Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Save Polygon Analysis</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="polygon-name" className="text-right">
                Name
              </Label>
              <Input
                id="polygon-name"
                value={polygonName}
                onChange={(e) => setPolygonName(e.target.value)}
                className="col-span-3"
                placeholder="e.g., Poor Coverage Zone - Downtown"
                autoFocus
              />
            </div>

            {analysis && (
              <div className="text-xs text-gray-600 space-y-1 ml-[calc(25%+1rem)]">
                <div>
                  Shape:{" "}
                  <span className="font-medium capitalize">{analysis.type}</span>{" "}
                  - Points:{" "}
                  <span className="font-medium">
                    {(analysis.count || 0).toLocaleString()}
                  </span>
                </div>
                {analysis.stats?.mean !== undefined && (
                  <div>
                    Avg {filters.metric || "RSRP"}:{" "}
                    <span className="font-medium">
                      {analysis.stats.mean.toFixed(1)}{" "}
                      {getMetricUnit(filters.metric)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSaveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSavePolygon}
              disabled={!polygonName.trim() || isSaving}
            >
              {isSaving ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" />
                  Saving...
                </>
              ) : (
                "Save Polygon"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SessionMapDebug;