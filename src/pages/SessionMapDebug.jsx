import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import { mapViewApi, settingApi } from "../api/apiEndpoints";
import Spinner from "../components/common/Spinner";
import { ArrowLeft, Download, Save, X, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";
import { toast } from "react-toastify";
import { useMapContext } from "../context/MapContext";
import DrawingToolsLayer from "@/components/map/tools/DrawingToolsLayer";
import DrawingControlsPanel from "@/components/map/layout/DrawingControlsPanel";
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
import { normalizeProviderName, normalizeTechName } from "@/utils/colorUtils";

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

const EMPTY_ARRAY = [];
const EMPTY_OBJECT = {};

const getThresholdKey = (metric) => {
  switch (metric?.toUpperCase()) {
    case "RSRP":
      return "rsrp_json";
    case "RSRQ":
      return "rsrq_json";
    case "SINR":
      return "sinr_json";
    case "MOS":
      return "mos_json";
    case "DL_THPT":
    case "DL_TPT":
      return "dl_thpt_json";
    case "UL_THPT":
    case "UL_TPT":
      return "ul_thpt_json";
    default:
      return "rsrp_json";
  }
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

const parseThresholds = (jsonString) => {
  if (!jsonString || jsonString === "undefined" || jsonString === "null") {
    return null;
  }
  try {
    const parsed = JSON.parse(jsonString);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch (e) {
    return null;
  }
};

const getColorFromThresholds = (value, thresholds) => {
  if (value === null || value === undefined || isNaN(value)) {
    return "#808080";
  }

  if (!thresholds || !Array.isArray(thresholds) || thresholds.length === 0) {
    return "#808080";
  }

  for (const threshold of thresholds) {
    const min = parseFloat(threshold.min);
    const max = parseFloat(threshold.max);

    if (max > min) {
      if (value >= min && value < max) {
        return threshold.color;
      }
    } else {
      if (value >= min) {
        return threshold.color;
      }
    }
  }

  const sortedThresholds = [...thresholds].sort(
    (a, b) => parseFloat(b.max) - parseFloat(a.max)
  );

  const highestMax = Math.max(...thresholds.map((t) => parseFloat(t.max)));
  if (value >= highestMax) {
    return sortedThresholds[0].color;
  }

  const lowestMin = Math.min(...thresholds.map((t) => parseFloat(t.min)));
  if (value < lowestMin) {
    return (
      thresholds.find((t) => parseFloat(t.min) === lowestMin)?.color ||
      "#808080"
    );
  }

  return "#808080";
};

const thresholdsToLegend = (thresholds, metric) => {
  if (!thresholds || !Array.isArray(thresholds) || thresholds.length === 0) {
    return null;
  }

  const unit = getMetricUnit(metric);

  const isNegativeMetric = ["RSRP", "RSRQ"].includes(metric?.toUpperCase());

  const sorted = [...thresholds].sort((a, b) => {
    if (isNegativeMetric) {
      return parseFloat(b.min) - parseFloat(a.min);
    }
    return parseFloat(b.min) - parseFloat(a.min);
  });

  return sorted.map((t) => ({
    color: t.color,
    label: t.label || `${t.range || `${t.min} to ${t.max}`} ${unit}`.trim(),
    min: parseFloat(t.min),
    max: parseFloat(t.max),
  }));
};

const coordinatesToWktPolygon = (coords) => {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const pointsString = coords.map((p) => `${p.lng} ${p.lat}`).join(", ");
  const firstPointString = `${coords[0].lng} ${coords[0].lat}`;
  return `POLYGON((${pointsString}, ${firstPointString}))`;
};

const getColorForRSRP = (rsrp) => {
  if (rsrp >= -80) return "#00FF00";
  if (rsrp >= -90) return "#FFFF00";
  if (rsrp >= -100) return "#FFA500";
  if (rsrp >= -110) return "#FF6600";
  return "#FF0000";
};

const getColorForRSRQ = (rsrq) => {
  if (rsrq >= -10) return "#00FF00";
  if (rsrq >= -15) return "#7FFF00";
  if (rsrq >= -20) return "#FFFF00";
  if (rsrq >= -25) return "#FFA500";
  return "#FF0000";
};

const getColorForSINR = (sinr) => {
  if (sinr >= 20) return "#00FF00";
  if (sinr >= 13) return "#7FFF00";
  if (sinr >= 0) return "#FFFF00";
  if (sinr >= -5) return "#FFA500";
  return "#FF0000";
};

const getColorForMetric = (value, metric, thresholds = null) => {
  if (value === null || value === undefined || isNaN(value)) {
    return "#808080";
  }

  if (thresholds && Array.isArray(thresholds) && thresholds.length > 0) {
    return getColorFromThresholds(value, thresholds);
  }

  switch (metric?.toUpperCase()) {
    case "RSRP":
      return getColorForRSRP(value);
    case "RSRQ":
      return getColorForRSRQ(value);
    case "SINR":
      return getColorForSINR(value);
    case "RSSI":
      if (value >= -65) return "#00FF00";
      if (value >= -75) return "#FFFF00";
      if (value >= -85) return "#FFA500";
      return "#FF0000";
    default:
      return getColorForRSRP(value);
  }
};

const getMetricValue = (log, metric) => {
  const metricKey = metric?.toLowerCase() || "rsrp";
  return log[metricKey] ?? log.rsrp ?? -120;
};

const parseLogEntry = (log, sessionId) => {
  if (!log || typeof log !== 'object') {
    return null;
  }

  const lat = parseFloat(log.lat || log.Lat || log.latitude || log.Latitude);
  const lng = parseFloat(log.lon || log.lng || log.Lng || log.longitude || log.Longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  const parseNum = (val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = parseFloat(val);
    return Number.isFinite(num) ? num : null;
  };

  const providerValue = normalizeProviderName(log.m_alpha_long || log.Provider);
  const bandValue = log.band || log.Band;
  const techValue = normalizeTechName(log.network);

  return {
    lat,
    lng,
    rsrp: parseNum(log.rsrp || log.RSRP) ?? -120,
    rsrq: parseNum(log.rsrq || log.RSRQ) ?? 0,
    sinr: parseNum(log.sinr || log.SINR) ?? 0,
    rssi: parseNum(log.rssi || log.RSSI) ?? -100,
    dl_tpt: parseNum(log.dl_tpt),
    ul_tpt: parseNum(log.ul_tpt),
    mos: parseNum(log.mos),
    provider: providerValue,
    technology: techValue,
    band: bandValue ? String(bandValue) : "",
    timestamp: log.timestamp || log.Timestamp || log.time || log.Time || log.dateTime || "",
    source: log.source || log.Source || log.dataSource || "",
    pci: log.pci || log.PCI || "",
    cellId: log.cellId || log.CellId || log.cell_id || "",
    session_id: sessionId ?? log.session_id,
    id: log.id || `${sessionId}-${log.timestamp}`,
  };
};

const extractLogsFromResponse = (data) => {
  if (Array.isArray(data)) return data;
  if (data?.data && Array.isArray(data.data)) return data.data;
  if (data?.Data && Array.isArray(data.Data)) return data.Data;
  if (data?.logs && Array.isArray(data.logs)) return data.logs;
  if (data?.networkLogs && Array.isArray(data.networkLogs)) return data.networkLogs;
  if (data?.result && Array.isArray(data.result)) return data.result;
  return [];
};

function CanvasCirclesOverlay({
  map,
  logs,
  metric = "RSRP",
  thresholds = null,
}) {
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
        if (panes) {
          panes.overlayLayer.appendChild(this.canvas);
        }
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

              ctx.beginPath();
              ctx.arc(x, y, radius, 0, Math.PI * 2);
              ctx.fillStyle = getColorForMetric(
                metricValue,
                metric,
                thresholds
              );
              ctx.globalAlpha = 0.6;
              ctx.fill();
              ctx.globalAlpha = 1;
            }
          } catch (e) {
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
      if (overlayRef.current) {
        overlayRef.current.draw();
      }
    });

    return () => {
      if (idleListener) {
        window.google.maps.event.removeListener(idleListener);
      }
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
        overlayRef.current = null;
      }
    };
  }, [map, logs, metric, thresholds]);

  return null;
}

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

function MapLegend({ metric = "RSRP", thresholds = null }) {
  const defaultLegends = {
    RSRP: [
      { color: "#00FF00", label: ">= -80 dBm (Excellent)" },
      { color: "#FFFF00", label: "-80 to -90 dBm (Good)" },
      { color: "#FFA500", label: "-90 to -100 dBm (Fair)" },
      { color: "#FF6600", label: "-100 to -110 dBm (Poor)" },
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
  };

  const dynamicLegend = useMemo(() => {
    return thresholdsToLegend(thresholds, metric);
  }, [thresholds, metric]);

  const currentLegend =
    dynamicLegend ||
    defaultLegends[metric?.toUpperCase()] ||
    defaultLegends.RSRP;
  const unit = getMetricUnit(metric);

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3">
      <h4 className="text-xs font-semibold text-gray-700 mb-2">
        {metric || "RSRP"} Legend {unit && `(${unit})`}
      </h4>
      <div className="space-y-1">
        {currentLegend.map((item, index) => (
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

function SessionMapDebug() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [map, setMap] = useState(null);
  const [fetchProgress, setFetchProgress] = useState({ current: 0, total: 0, page: 0, totalPages: 0 });
  const [analysis, setAnalysis] = useState(null);
  const [appSummary, setAppSummary] = useState(null);

  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [polygonName, setPolygonName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [allThresholds, setAllThresholds] = useState(null);
  const [currentThresholds, setCurrentThresholds] = useState(null);

  const [showLegend, setShowLegend] = useState(true);

  const [sessionMarkers, setSessionMarkers] = useState([]);

  const {
    ui,
    updateUI,
    setDownloadHandlers,
    setPolygonStats,
    setHasLogs,
    hasLogs,
    filters,
    resetFilter,
    clearFilters,
    hasActiveFilters,
    updateAvailableFilters,
  } = useMapContext();

  const sessionIdParam =
    searchParams.get("sessionId") || searchParams.get("sessionIds");

  const sessionIds = useMemo(() => {
    if (!sessionIdParam) return [];
    return sessionIdParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id && id !== "undefined" && id !== "null");
  }, [sessionIdParam]);

  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

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

  const formattedThresholds = useMemo(() => {
    if (!allThresholds) return {};
    return {
      rsrp: parseThresholds(allThresholds.rsrp_json),
      rsrq: parseThresholds(allThresholds.rsrq_json),
      sinr: parseThresholds(allThresholds.sinr_json),
      dl_thpt: parseThresholds(allThresholds.dl_thpt_json || allThresholds.dl_tpt_json),
      ul_thpt: parseThresholds(allThresholds.ul_thpt_json || allThresholds.ul_tpt_json),
      dl_tpt: parseThresholds(allThresholds.dl_thpt_json || allThresholds.dl_tpt_json),
      ul_tpt: parseThresholds(allThresholds.ul_thpt_json || allThresholds.ul_tpt_json),
      mos: parseThresholds(allThresholds.mos_json),
      lte_bler: parseThresholds(allThresholds.lte_bler_json),
    };
  }, [allThresholds]);

  useEffect(() => {
    const fetchThresholds = async () => {
      try {
        const response = await settingApi.getThresholdSettings();

        if (!response || response.Status !== 1 || !response.Data) {
          return;
        }

        setAllThresholds(response.Data);
      } catch (error) {
      }
    };

    fetchThresholds();
  }, []);

  useEffect(() => {
    if (!allThresholds) {
      setCurrentThresholds(null);
      return;
    }

    const metric = filters.metric || "RSRP";
    const key = getThresholdKey(metric);
    const jsonString = allThresholds[key];

    if (!jsonString) {
      setCurrentThresholds(null);
      return;
    }

    const parsed = parseThresholds(jsonString);
    setCurrentThresholds(parsed);
  }, [allThresholds, filters.metric]);

  const filteredLogs = useMemo(() => {
    if (!logs.length) return [];

    return logs.filter((log) => {
      const metricValue = getMetricValue(log, filters.metric);

      if (filters.minSignal !== "" && !isNaN(parseFloat(filters.minSignal))) {
        if (metricValue < parseFloat(filters.minSignal)) {
          return false;
        }
      }
      if (filters.maxSignal !== "" && !isNaN(parseFloat(filters.maxSignal))) {
        if (metricValue > parseFloat(filters.maxSignal)) {
          return false;
        }
      }

      if (filters.technology && filters.technology !== "ALL") {
        if (log.technology) {
          if (log.technology.toUpperCase() !== filters.technology.toUpperCase()) {
            return false;
          }
        }
      }

      if (filters.band && filters.band !== "" && filters.band !== "all") {
        if (log.band) {
          if (log.band.toString() !== filters.band) {
            return false;
          }
        }
      }

      if (filters.provider && filters.provider !== "all") {
        if (log.provider) {
          if (log.provider.toLowerCase() !== filters.provider.toLowerCase()) {
            return false;
          }
        }
      }

      if (filters.startDate || filters.endDate) {
        if (log.timestamp) {
          const logDate = new Date(log.timestamp);
          if (filters.startDate && logDate < filters.startDate) {
            return false;
          }
          if (filters.endDate) {
            const endOfDay = new Date(filters.endDate);
            endOfDay.setHours(23, 59, 59, 999);
            if (logDate > endOfDay) {
              return false;
            }
          }
        }
      }

      if (filters.dataSource && filters.dataSource !== "all") {
        if (log.source) {
          if (log.source.toLowerCase() !== filters.dataSource.toLowerCase()) {
            return false;
          }
        }
      }

      return true;
    });
  }, [logs, filters]);

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
    (key) => {
      resetFilter(key);
    },
    [resetFilter]
  );

  const handleSavePolygon = async () => {
    if (!analysis || !analysis.geometry) {
      toast.warn("No analysis data or geometry found to save.");
      return;
    }
    if (!polygonName.trim()) {
      toast.warn("Please provide a name for the polygon.");
      return;
    }

    let wktString = null;
    const geometry = analysis.geometry;

    if (geometry.type === "polygon" && geometry.polygon) {
      wktString = coordinatesToWktPolygon(geometry.polygon);
    } else if (geometry.type === "rectangle" && geometry.rectangle) {
      const { ne, sw } = geometry.rectangle;
      const rectCoords = [
        { lng: sw.lng, lat: ne.lat },
        { lng: ne.lng, lat: ne.lat },
        { lng: ne.lng, lat: sw.lat },
        { lng: sw.lng, lat: sw.lat },
      ];
      wktString = coordinatesToWktPolygon(rectCoords);
    } else if (geometry.type === "circle" && geometry.circle) {
      const { center, radius } = geometry.circle;
      const circleCoords = [];
      const numPoints = 32;
      for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * 360;
        const latOffset = (radius / 111111) * Math.cos((angle * Math.PI) / 180);
        const lngOffset =
          (radius / (111111 * Math.cos((center.lat * Math.PI) / 180))) *
          Math.sin((angle * Math.PI) / 180);
        circleCoords.push({
          lat: center.lat + latOffset,
          lng: center.lng + lngOffset,
        });
      }
      wktString = coordinatesToWktPolygon(circleCoords);
    }

    if (!wktString) {
      toast.error("Could not convert the drawn shape to WKT format.");
      return;
    }

    const payload = {
      Name: polygonName,
      WKT: wktString,
      SessionIds: sessionIds || [],
    };

    setIsSaving(true);
    try {
      const response = await mapViewApi.savePolygon(payload);
      if (response && response.Status === 1) {
        toast.success(`Polygon "${polygonName}" saved successfully!`);
        setIsSaveDialogOpen(false);
        setPolygonName("");
      } else {
        toast.error(response?.Message || "Failed to save polygon.");
      }
    } catch (error) {
      toast.error(
        `Error saving polygon: ${error.message || "An unknown error occurred."}`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatsDownload = useCallback(() => {
    if (filteredLogs.length === 0) {
      toast.error("No data to download");
      return;
    }

    const values = filteredLogs
      .map((log) => getMetricValue(log, filters.metric))
      .filter((v) => !isNaN(v));
    const sortedValues = [...values].sort((a, b) => a - b);

    const activeFiltersStr =
      Object.entries(filters)
        .filter(([k, v]) => v && v !== "ALL" && v !== "all" && v !== "")
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
        (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
      ],
      [`${filters.metric || "RSRP"} Min`, Math.min(...values).toFixed(2)],
      [`${filters.metric || "RSRP"} Max`, Math.max(...values).toFixed(2)],
      [
        `${filters.metric || "RSRP"} Median`,
        sortedValues[Math.floor(sortedValues.length / 2)]?.toFixed(2) || "N/A",
      ],
      ["Generated At", new Date().toISOString()],
    ];

    const blob = new Blob([csvRows.map((r) => r.join(",")).join("\n")], {
      type: "text/csv",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `stats_${filters.metric || "RSRP"}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success("Stats downloaded!");
  }, [filteredLogs, logs.length, sessionIds, filters]);

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
          l.rsrp || "",
          l.rsrq || "",
          l.sinr || "",
          l.technology || "",
          l.band || "",
          l.timestamp || "",
          l.source || "",
        ].join(",")
      ),
    ];

    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `logs_filtered_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success(`Downloaded ${filteredLogs.length} points!`);
  }, [filteredLogs]);

  const handlersRef = useRef({
    stats: handleStatsDownload,
    raw: handleRawDownload,
  });
  handlersRef.current = { stats: handleStatsDownload, raw: handleRawDownload };

  useEffect(() => {
    setDownloadHandlers({
      onDownloadStatsCsv: () => handlersRef.current.stats(),
      onDownloadRawCsv: () => handlersRef.current.raw(),
      onFetchLogs: () => toast.info("Logs already loaded"),
    });
  }, [setDownloadHandlers]);

  const prevLogsLengthRef = useRef(0);
  useEffect(() => {
    if (filteredLogs.length !== prevLogsLengthRef.current) {
      prevLogsLengthRef.current = filteredLogs.length;

      if (filteredLogs.length > 0) {
        const values = filteredLogs
          .map((l) => getMetricValue(l, filters.metric))
          .filter((v) => !isNaN(v));
        const sorted = [...values].sort((a, b) => a - b);

        setPolygonStats({
          count: filteredLogs.length,
          type: "session",
          logs: filteredLogs,
          stats: {
            count: values.length,
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
  }, [filteredLogs.length, sessionIds, setPolygonStats, setHasLogs, filters]);

  useEffect(() => {
    const fetchData = async () => {
      if (sessionIds.length === 0) {
        setError("No session ID(s) provided");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      const allPoints = [];
      let mergedAppSummary = {};

      const allProviders = new Set();
      const allBands = new Set();
      const allNetworkTypes = new Set();
      const markers = [];

      const PAGE_SIZE = 10000;
      const startTime = performance.now();

      try {
        let currentPage = 1;
        let totalCount = 0;
        let totalPages = 1;
        let hasMoreData = true;

        while (hasMoreData) {
          setFetchProgress({
            current: allPoints.length,
            total: totalCount || 0,
            page: currentPage,
            totalPages: totalPages,
          });

          const response = await mapViewApi.getNetworkLog({
            session_ids: sessionIds,
            page: currentPage,
            limit: PAGE_SIZE,
          });

          const rawResponse = response?.data || response;
          const pageData = extractLogsFromResponse(rawResponse);

          if (currentPage === 1) {
            if (typeof rawResponse === 'object' && !Array.isArray(rawResponse)) {
              totalCount = rawResponse.total_count || rawResponse.totalCount || rawResponse.TotalCount || 0;
              if (rawResponse.app_summary) {
                mergedAppSummary = { ...mergedAppSummary, ...rawResponse.app_summary };
              }
            } else {
              totalCount = pageData.length;
            }

            totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
          }

          if (!Array.isArray(pageData)) {
            break;
          }

          const sessionPointsMap = new Map();

          pageData.forEach((log) => {
            const parsed = parseLogEntry(log, log.session_id);
            if (parsed) {
              allPoints.push(parsed);

              const providerValue = parsed.provider;
              const bandValue = parsed.band;
              const techValue = parsed.technology;

              if (providerValue) allProviders.add(providerValue);
              if (bandValue) allBands.add(String(bandValue));
              if (techValue) allNetworkTypes.add(techValue);

              if (!sessionPointsMap.has(parsed.session_id)) {
                sessionPointsMap.set(parsed.session_id, {
                  lat: parsed.lat,
                  lng: parsed.lng,
                  count: 1
                });
              } else {
                sessionPointsMap.get(parsed.session_id).count++;
              }
            }
          });

          sessionPointsMap.forEach((data, sessionId) => {
            const existingMarker = markers.find(m => m.session_id === sessionId);
            if (!existingMarker) {
              markers.push({
                id: sessionId,
                session_id: sessionId,
                lat: data.lat,
                lng: data.lng,
                position: { lat: data.lat, lng: data.lng },
                logsCount: data.count,
              });
            } else {
              existingMarker.logsCount += data.count;
            }
          });

          if (currentPage >= totalPages) {
            hasMoreData = false;
          } else if (pageData.length < PAGE_SIZE) {
            hasMoreData = false;
          } else {
            currentPage++;
          }

          if (currentPage > 100) {
            hasMoreData = false;
          }

          if (hasMoreData) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        const fetchTime = ((performance.now() - startTime) / 1000).toFixed(2);

        const providerArray = Array.from(allProviders).filter(
          (p) => p && p !== "undefined" && p !== "null"
        );
        const bandArray = Array.from(allBands).filter(
          (b) => b && b !== "undefined" && b !== "null"
        );
        const techArray = Array.from(allNetworkTypes).filter(
          (t) => t && t !== "undefined" && t !== "null"
        );

        updateAvailableFilters({
          providers: providerArray,
          bands: bandArray,
          technologies: techArray,
        });

        if (allPoints.length === 0) {
          setError("No valid data found in the sessions");
          toast.warn("No valid data found");
        } else {
          toast.success(
            `Loaded ${allPoints.length.toLocaleString()} points from ${sessionIds.length} session(s) in ${fetchTime}s`
          );
        }

        setLogs(allPoints);
        setSessionMarkers(markers);
        setAppSummary(
          Object.keys(mergedAppSummary).length > 0 ? mergedAppSummary : null
        );

      } catch (err) {
        toast.error(`Failed to fetch data: ${err.message}`);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [sessionIds.join(",")]);

  useEffect(() => {
    if (map && filteredLogs.length > 0 && window.google) {
      const bounds = new window.google.maps.LatLngBounds();
      filteredLogs.forEach((pt) => bounds.extend({ lat: pt.lat, lng: pt.lng }));
      map.fitBounds(bounds, { padding: 50 });
    }
  }, [map, filteredLogs.length]);

  const onMapLoad = useCallback((m) => setMap(m), []);
  const onMapUnmount = useCallback(() => setMap(null), []);

  const handleDrawingSummary = useCallback(
    (stats) => {
      setAnalysis(stats);
      setPolygonStats(stats);
    },
    [setPolygonStats]
  );

  const handleDrawingsChange = useCallback(() => {}, []);
  const goBack = useCallback(() => navigate(-1), [navigate]);

  const handleCloseAnalysis = useCallback(() => {
    setAnalysis(null);
    setPolygonStats(null);
  }, [setPolygonStats]);

  const mapCenter = useMemo(() => {
    if (filteredLogs.length > 0) {
      return { lat: filteredLogs[0].lat, lng: filteredLogs[0].lng };
    }
    return DEFAULT_CENTER;
  }, [filteredLogs]);

  if (!isLoaded || loading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-gray-900">
        <div className="text-center">
          <Spinner />
          <p className="mt-4 text-white">
            {loading && fetchProgress.total > 0
              ? `Loading... ${fetchProgress.current.toLocaleString()} / ${fetchProgress.total.toLocaleString()} points (Page ${fetchProgress.page}/${fetchProgress.totalPages})`
              : "Loading map..."}
          </p>
          {loading && fetchProgress.total > 0 && (
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
            thresholds={currentThresholds}
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
            onDrawingsChange={handleDrawingsChange}
            clearSignal={safeUi.drawClearSignal}
          />
        )}
      </GoogleMap>

      <AllLogsPanelToggle
        logs={filteredLogs}
        thresholds={
          allThresholds
            ? {
                rsrp: parseThresholds(allThresholds.rsrp_json),
                rsrq: parseThresholds(allThresholds.rsrq_json),
                sinr: parseThresholds(allThresholds.sinr_json),
                dl_thpt: parseThresholds(allThresholds.dl_thpt_json || allThresholds.dl_tpt_json),
                ul_thpt: parseThresholds(allThresholds.ul_thpt_json || allThresholds.ul_tpt_json),
                mos: parseThresholds(allThresholds.mos_json),
              }
            : {}
        }
        selectedMetric={filters.metric?.toLowerCase() || "rsrp"}
        isLoading={loading}
        appSummary={appSummary}
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

      {filteredLogs.length === 0 && logs.length > 0 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg px-6 py-4 text-center">
          <Filter className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-700 font-medium">
            No points match current filters
          </p>
          <p className="text-gray-500 text-sm mt-1">
            {logs.length} points available. Try adjusting your filters.
          </p>
          <Button size="sm" className="mt-3" onClick={clearFilters}>
            Clear All Filters
          </Button>
        </div>
      )}

      {analysis && (
        <div className="absolute bottom-4 left-4 z-30 bg-white rounded-lg shadow-lg w-[300px] border border-gray-200">
          <div className="flex items-center justify-between px-3 py-2 bg-blue-600 rounded-t-lg">
            <h3 className="font-semibold text-white text-sm">
              Selection Analysis
            </h3>
            <button
              onClick={handleCloseAnalysis}
              className="text-white/80 hover:text-white transition-colors"
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
                  {analysis.type}
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

            {analysis.stats?.mean !== undefined && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-blue-50 rounded px-2 py-1.5 border border-blue-100">
                  <div className="text-[10px] text-blue-600 uppercase tracking-wide">
                    Mean
                  </div>
                  <div className="font-bold text-blue-700">
                    {analysis.stats.mean.toFixed(2)}{" "}
                    <span className="text-[10px] font-normal">dBm</span>
                  </div>
                </div>
                <div className="bg-green-50 rounded px-2 py-1.5 border border-green-100">
                  <div className="text-[10px] text-green-600 uppercase tracking-wide">
                    Median
                  </div>
                  <div className="font-bold text-green-700">
                    {analysis.stats.median?.toFixed(2) || "-"}{" "}
                    <span className="text-[10px] font-normal">dBm</span>
                  </div>
                </div>
                <div className="bg-orange-50 rounded px-2 py-1.5 border border-orange-100">
                  <div className="text-[10px] text-orange-600 uppercase tracking-wide">
                    Min
                  </div>
                  <div className="font-bold text-orange-700">
                    {analysis.stats.min?.toFixed(2) || "-"}{" "}
                    <span className="text-[10px] font-normal">dBm</span>
                  </div>
                </div>
                <div className="bg-red-50 rounded px-2 py-1.5 border border-red-100">
                  <div className="text-[10px] text-red-600 uppercase tracking-wide">
                    Max
                  </div>
                  <div className="font-bold text-red-700">
                    {analysis.stats.max?.toFixed(2) || "-"}{" "}
                    <span className="text-[10px] font-normal">dBm</span>
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
                  {analysis.area > 1000000
                    ? `${(analysis.area / 1000000).toFixed(2)} km2`
                    : `${analysis.area.toFixed(0)} m2`}
                </div>
              </div>
            )}

            {hasActiveFilters && (
              <div className="bg-yellow-50 rounded px-2 py-1.5 border border-yellow-100">
                <div className="text-[10px] text-yellow-700">
                  Analysis based on filtered data
                </div>
              </div>
            )}
          </div>

          <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 rounded-b-lg flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
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
              title="Download Stats CSV"
            >
              <Download className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle className="text-gray-800">
              Save Polygon Analysis
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label
                htmlFor="polygon-name"
                className="text-right text-gray-700"
              >
                Name
              </Label>
              <Input
                id="polygon-name"
                value={polygonName}
                onChange={(e) => setPolygonName(e.target.value)}
                className="col-span-3 bg-white border-gray-300 text-gray-800"
                placeholder="e.g., Low Coverage Zone A"
                autoFocus
              />
            </div>
            {analysis && (
              <div className="text-xs text-gray-500 ml-[calc(25%+1rem)] space-y-1">
                <div>
                  Shape:{" "}
                  <span className="capitalize font-medium">
                    {analysis.type}
                  </span>{" "}
                  - Points:{" "}
                  <span className="font-medium">{analysis.count || 0}</span>
                </div>
                {analysis.stats?.mean && (
                  <div>
                    Avg {filters.metric || "RSRP"}:{" "}
                    <span className="font-medium">
                      {analysis.stats.mean.toFixed(1)} dBm
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
              className="border-gray-300 text-gray-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSavePolygon}
              disabled={!polygonName.trim() || isSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
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