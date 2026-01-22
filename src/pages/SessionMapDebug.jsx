// src/pages/SessionMapDebug.jsx
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useJsApiLoader } from "@react-google-maps/api";
import { mapViewApi } from "../api/apiEndpoints";
import { ArrowLeft, Download, Save, X, Filter, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";
import { toast } from "react-toastify";
import { useMapContext } from "../context/MapContext";
import MapLegend from "@/components/map/MapLegend";
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
import { useSessionNeighbors } from "@/hooks/useSessionNeighbors";
import MapWithMultipleCircles from "@/components/MapwithMultipleCircle";

// ============================================
// CONSTANTS & HELPERS
// ============================================
const EMPTY_ARRAY = [];

const DEFAULT_CENTER = { lat: 28.6139, lng: 77.209 };

const MAP_OPTIONS = {
  mapTypeControl: true,
  streetViewControl: false,
  fullscreenControl: true,
  zoomControl: true,
  gestureHandling: "greedy",
};

const normalizeMetric = (metric) => {
  if (!metric) return "rsrp";
  const lower = metric.toLowerCase();
  if (lower === "dl_tpt" || lower === "dl_throughput") return "dl_thpt";
  if (lower === "ul_tpt" || lower === "ul_throughput") return "ul_thpt";
  return lower;
};

const getMetricUnit = (metric) => {
  const normalized = normalizeMetric(metric).toUpperCase();
  switch (normalized) {
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
      return "Mbps";
    default:
      return "dBm";
  }
};

const getMetricValue = (log, metric) => {
  const key = normalizeMetric(metric);
  if (key === "dl_thpt") return log.dl_thpt ?? log.dl_tpt ?? log.DL_TPT ?? -120;
  if (key === "ul_thpt") return log.ul_thpt ?? log.ul_tpt ?? log.UL_TPT ?? -120;
  return log[key] ?? log.rsrp ?? -120;
};

const geometryToWktPolygon = (geometry) => {
  if (!geometry) return null;

  const read = (p) => ({
    lat: typeof p.lat === "function" ? p.lat() : p.lat,
    lng: typeof p.lng === "function" ? p.lng() : p.lng,
  });

  // POLYGON
  if (geometry.type === "polygon" && geometry.polygon?.length >= 3) {
    const points = geometry.polygon.map(read);
    const wktCoords = points.map((p) => `${p.lat} ${p.lng}`).join(", ");
    const first = `${points[0].lat} ${points[0].lng}`;
    return `POLYGON((${wktCoords}, ${first}))`;
  }

  // RECTANGLE
  if (geometry.type === "rectangle" && geometry.rectangle) {
    const ne = read(geometry.rectangle.ne);
    const sw = read(geometry.rectangle.sw);
    const coords = [
      { lat: ne.lat, lng: sw.lng },
      { lat: ne.lat, lng: ne.lng },
      { lat: sw.lat, lng: ne.lng },
      { lat: sw.lat, lng: sw.lng },
      { lat: ne.lat, lng: sw.lng },
    ];
    return `POLYGON((${coords.map((p) => `${p.lat} ${p.lng}`).join(", ")}))`;
  }

  // CIRCLE
  if (geometry.type === "circle" && geometry.circle) {
    const center = read(geometry.circle.center);
    const radius = geometry.circle.radius;
    const points = [];
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      const latOffset = (radius / 111111) * Math.cos(angle);
      const lngOffset =
        (radius / (111111 * Math.cos((center.lat * Math.PI) / 180))) *
        Math.sin(angle);

      const lat = Math.max(-90, Math.min(90, center.lat + latOffset));
      const lng = center.lng + lngOffset;
      points.push(`${lat} ${lng}`);
    }
    return `POLYGON((${points.join(", ")}))`;
  }
  return null;
};

// ============================================
// SPINNER COMPONENT
// ============================================
function Spinner({ className = "" }) {
  return (
    <Loader2 className={`h-8 w-8 animate-spin text-blue-500 ${className}`} />
  );
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
      className={`flex flex-wrap items-center gap-1.5 rounded-lg bg-white/95 px-2 py-1 shadow-lg backdrop-blur-sm sm:gap-2 sm:px-3 sm:py-2 ${className}`}
    >
      <div className="flex items-center gap-1.5 text-gray-500">
        <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <span className="text-[10px] font-medium sm:text-xs">Filters:</span>
      </div>

      {activeFilters.map((filter) => (
        <Badge
          key={filter.key}
          variant="secondary"
          className={`${filter.color} flex cursor-pointer items-center gap-1 text-[10px] font-medium transition-colors sm:text-xs`}
          onClick={() => onClearFilter(filter.key)}
        >
          {filter.label}
          <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        </Badge>
      ))}

      {activeFilters.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-[10px] text-gray-500 hover:text-gray-700 sm:h-6 sm:px-2 sm:text-xs"
          onClick={onClearAll}
        >
          Clear All
        </Button>
      )}
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
  const [legendFilter, setLegendFilter] = useState(null);

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
    if (!sessionIdParam) return EMPTY_ARRAY;
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
  } = useNetworkSamples(sessionIds, true, false, EMPTY_ARRAY);

  // Use the Session Neighbors Hook
  const { neighborData, loading: neighborsLoading } = useSessionNeighbors(
    sessionIds,
    true,
    false,
    EMPTY_ARRAY
  );

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

  // Formatted thresholds
  const formattedThresholds = useMemo(() => {
    return allThresholds
      ? {
          rsrp: allThresholds.rsrp || [],
          rsrq: allThresholds.rsrq || [],
          sinr: allThresholds.sinr || [],
          dl_thpt:
            allThresholds.dlThpt ||
            allThresholds.dl_tpt ||
            allThresholds.dl_thpt ||
            [],
          ul_thpt:
            allThresholds.ulThpt ||
            allThresholds.ul_tpt ||
            allThresholds.ul_thpt ||
            [],
          mos: allThresholds.mos || [],
          lte_bler: allThresholds.lteBler || [],
        }
      : {};
  }, [allThresholds]);

  // Filter logs logic
  const filteredLogs = useMemo(() => {
    if (!logs.length) return [];

    return logs
      .filter((log) => {
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
      })
      .map((log) => ({
        ...log,
        dl_thpt: log.dl_thpt ?? log.dl_tpt ?? log.DL_TPT ?? null,
        ul_thpt: log.ul_thpt ?? log.ul_tpt ?? log.UL_TPT ?? null,
        lte_bler: log.lte_bler ?? log.lteBler ?? null,
      }));
  }, [logs, filters]);

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

  // Save Polygon
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
    console.log("💾 SAVING POLYGON:", {
      name: polygonName,
      wkt: wktString,
      geometry: analysis.geometry,
    });
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

  // Set download handlers in context
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

  // Update polygon stats
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
            median:
              values.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0,
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
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900">
        <div className="max-w-md px-4 text-center">
          <Spinner className="mx-auto" />
          <p className="mt-4 text-sm text-white sm:text-base">
            {thresholdsLoading
              ? "Loading thresholds..."
              : loading && fetchProgress?.total > 0
              ? `Loading... ${fetchProgress.current.toLocaleString()} / ${fetchProgress.total.toLocaleString()} points`
              : "Loading map..."}
          </p>
          {loading && fetchProgress?.total > 0 && (
            <div className="mx-auto mt-2 h-2 w-64 rounded-full bg-gray-700">
              <div
                className="h-2 rounded-full bg-blue-500 transition-all duration-300"
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
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900 text-white">
        <div className="max-w-md px-4 text-center">
          <h2 className="mb-4 text-xl font-bold sm:text-2xl">Error</h2>
          <p className="mb-4 text-sm text-red-400 sm:text-base">
            {loadError?.message || error}
          </p>
          <Button onClick={goBack} className="bg-blue-600 hover:bg-blue-700">
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
          </Button>
        </div>
      </div>
    );
  }

  const selectedMetric = normalizeMetric(filters.metric);

  return (
    <div className="fixed inset-0 overflow-hidden bg-gray-900">
      {/* Map Container - Fixed full screen */}
      <div className="absolute inset-0">
        <MapWithMultipleCircles
          isLoaded={isLoaded}
          loadError={loadError}
          locations={filteredLogs}
          neighborData={neighborData}
          showNeighbors={true}
          selectedMetric={selectedMetric}
          thresholds={formattedThresholds}
          onLoad={onMapLoad}
          options={MAP_OPTIONS}
          legendFilter={legendFilter}
          center={mapCenter}
          showPoints={true}
          pointRadius={8}
          showStats={false}
          activeMarkerIndex={null}
          onMarkerClick={() => {}}
          debugNeighbors={true}
          neighborSquareSize={15}
          neighborOpacity={0.5}
        >
          {map && (
            <DrawingToolsLayer
              map={map}
              enabled={safeUi.drawEnabled}
              logs={filteredLogs}
              sessions={sessionMarkers}
              thresholds={formattedThresholds}
              selectedMetric={selectedMetric}
              shapeMode={safeUi.shapeMode}
              pixelateRect={safeUi.drawPixelateRect}
              cellSizeMeters={safeUi.drawCellSizeMeters}
              colorizeCells={safeUi.colorizeCells}
              onSummary={handleDrawingSummary}
              onDrawingsChange={() => {}}
              clearSignal={safeUi.drawClearSignal}
            />
          )}
        </MapWithMultipleCircles>
      </div>

      {/* All Logs Panel Toggle - Fixed position */}
      <div className="pointer-events-none absolute inset-0 z-11">
        <div className="pointer-events-auto">
          <AllLogsPanelToggle
          z={15}
            logs={filteredLogs}
            thresholds={formattedThresholds}
            selectedMetric={selectedMetric}
            isLoading={loading}
            appSummary={appSummary}
            getMetricColor={getMetricColor}
          />
        </div>
      </div>

      {/* Active Filters Bar - Fixed position */}
      {hasActiveFilters && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-2 sm:justify-start sm:p-4">
          <div className="pointer-events-auto max-w-full sm:max-w-lg">
            <ActiveFiltersBar
              filters={filters}
              onClearFilter={handleClearFilter}
              onClearAll={clearFilters}
            />
          </div>
        </div>
      )}

      {/* Map Legend - Fixed position */}
      {showLegend && (
        <div className="pointer-events-none absolute inset-0 ">
          <div className="pointer-events-auto">
            <MapLegend
              thresholds={formattedThresholds}
              selectedMetric={selectedMetric}
              colorBy={null}
              logs={filteredLogs}
              activeFilter={legendFilter}
              onFilterChange={setLegendFilter}
            />
          </div>
        </div>
      )}

      {/* No Results Overlay - Fixed position */}
      {filteredLogs.length === 0 && logs.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
          <div className="pointer-events-auto w-full max-w-sm rounded-lg bg-white/95 px-4 py-3 text-center shadow-lg backdrop-blur-sm sm:px-6 sm:py-4">
            <Filter className="mx-auto mb-2 h-6 w-6 text-gray-400 sm:h-8 sm:w-8" />
            <p className="text-sm font-medium text-gray-700 sm:text-base">
              No points match current filters
            </p>
            <p className="mt-1 text-xs text-gray-500 sm:text-sm">
              {logs.length.toLocaleString()} points available. Try adjusting
              your filters.
            </p>
            <Button size="sm" className="mt-3" onClick={clearFilters}>
              Clear All Filters
            </Button>
          </div>
        </div>
      )}

      {/* Analysis Panel - Fixed position */}
      {analysis && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center p-2 sm:justify-start sm:p-4">
          <div className="pointer-events-auto w-full max-w-sm rounded-lg border border-gray-200 bg-white shadow-lg sm:w-[320px]">
            <div className="flex items-center justify-between rounded-t-lg bg-blue-600 px-3 py-2">
              <h3 className="text-xs font-semibold text-white sm:text-sm">
                Selection Analysis
              </h3>
              <button
                onClick={handleCloseAnalysis}
                className="p-1 text-white/80 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[50vh] space-y-2 overflow-y-auto p-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded bg-gray-50 px-2 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">
                    Shape
                  </div>
                  <div className="font-medium capitalize text-gray-800">
                    {analysis.type || "Unknown"}
                  </div>
                </div>
                <div className="rounded bg-gray-50 px-2 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">
                    Points
                  </div>
                  <div className="font-medium text-gray-800">
                    {(analysis.count || 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {analysis.stats && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded border border-blue-100 bg-blue-50 px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-blue-600">
                      Mean
                    </div>
                    <div className="font-bold text-blue-700">
                      {analysis.stats.mean?.toFixed(1) ?? "-"}{" "}
                      {getMetricUnit(filters.metric)}
                    </div>
                  </div>
                  <div className="rounded border border-green-100 bg-green-50 px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-green-600">
                      Median
                    </div>
                    <div className="font-bold text-green-700">
                      {analysis.stats.median?.toFixed(1) ?? "-"}{" "}
                      {getMetricUnit(filters.metric)}
                    </div>
                  </div>
                  <div className="rounded border border-orange-100 bg-orange-50 px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-orange-600">
                      Min
                    </div>
                    <div className="font-bold text-orange-700">
                      {analysis.stats.min?.toFixed(1) ?? "-"}{" "}
                      {getMetricUnit(filters.metric)}
                    </div>
                  </div>
                  <div className="rounded border border-red-100 bg-red-50 px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-red-600">
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
                <div className="rounded bg-gray-50 px-2 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">
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
                <div className="rounded border border-yellow-100 bg-yellow-50 px-2 py-1.5 text-xs text-yellow-800">
                  Analysis based on filtered data
                </div>
              )}
            </div>

            <div className="flex gap-2 rounded-b-lg border-t border-gray-200 bg-gray-50 px-3 py-2">
              <Button
                size="sm"
                className="h-9 flex-1 text-xs sm:h-8"
                onClick={() => setIsSaveDialogOpen(true)}
                disabled={!analysis.geometry}
              >
                <Save className="mr-1.5 h-3 w-3" />
                Save Polygon
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 px-2 sm:h-8"
                onClick={handleStatsDownload}
              >
                <Download className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Save Polygon Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Save Polygon Analysis</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-4 sm:gap-4">
              <Label htmlFor="polygon-name" className="sm:text-right">
                Name
              </Label>
              <Input
                id="polygon-name"
                value={polygonName}
                onChange={(e) => setPolygonName(e.target.value)}
                className="sm:col-span-3"
                placeholder="e.g., Poor Coverage Zone - Downtown"
                autoFocus
              />
            </div>

            {analysis && (
              <div className="ml-0 space-y-1 text-xs text-gray-600 sm:ml-[calc(25%+1rem)]">
                <div>
                  Shape:{" "}
                  <span className="font-medium capitalize">
                    {analysis.type}
                  </span>{" "}
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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