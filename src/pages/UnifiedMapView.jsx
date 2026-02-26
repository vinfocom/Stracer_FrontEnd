// src/pages/UnifiedMapView.jsx

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom"; 
import { useJsApiLoader, Polygon } from "@react-google-maps/api";
import { toast } from "react-toastify";
import { LayoutGrid } from "lucide-react";

import { mapViewApi } from "../api/apiEndpoints";

// Components
import Spinner from "../components/common/Spinner";
import MapWithMultipleCircles from "@/components/unifiedMap/MapwithMultipleCircle";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";
import UnifiedMapSidebar from "@/components/unifiedMap/UnifiedMapSideBar.jsx";
import NetworkPlannerMap from "@/components/unifiedMap/NetworkPlannerMap";
import UnifiedHeader from "@/components/unifiedMap/unifiedMapHeader";
import UnifiedDetailLogs from "@/components/unifiedMap/UnifiedDetailLogs";
import MapLegend from "@/components/map/MapLegend";
import SiteLegend from "@/components/unifiedMap/SiteLegend";
import DrawingToolsLayer from "@/components/map/tools/DrawingToolsLayer";
import LoadingProgress from "@/components/LoadingProgress";
import TechHandoverMarkers from "@/components/unifiedMap/TechHandoverMarkers";
import AddSiteFormDialog from "@/components/unifiedMap/AddSiteFormDialog";
import { normalizeBandName } from "@/utils/colorUtils";

// Hooks
import { useSiteData } from "@/hooks/useSiteData";
import { useNeighborCollisions } from "@/hooks/useNeighborCollisions";
import useColorForLog from "@/hooks/useColorForLog";
import {
  useBestNetworkCalculation,
  DEFAULT_WEIGHTS,
} from "@/hooks/useBestNetworkCalculation";

import { useNetworkSamples } from "@/hooks/useNetworkSamples";
import { usePredictionData } from "@/hooks/usePredictionData";
import { useSessionNeighbors } from "@/hooks/useSessionNeighbors";
import { useProjectPolygons } from "@/hooks/useProjectPolygons";
import { useAreaPolygons } from "@/hooks/useAreaPolygons";

// Utils
import {
  normalizeProviderName,
  normalizeTechName,
  getBandColor,
  getTechnologyColor,
  getProviderColor,
} from "@/utils/colorUtils";

const DEFAULT_CENTER = { lat: 28.64453086, lng: 77.37324242 };

const DEFAULT_COVERAGE_FILTERS = {
  rsrp: { enabled: false, threshold: -110 },
  rsrq: { enabled: false, threshold: -15 },
  sinr: { enabled: false, threshold: 0 },
};

const DEFAULT_DATA_FILTERS = {
  providers: [],
  bands: [],
  technologies: [],
  indoorOutdoor: [],
};

const METRIC_CONFIG = {
  rsrp: {
    higherIsBetter: true,
    unit: "dBm",
    label: "RSRP",
    min: -140,
    max: -44,
  },
  rsrq: { higherIsBetter: true, unit: "dB", label: "RSRQ", min: -20, max: -3 },
  sinr: { higherIsBetter: true, unit: "dB", label: "SINR", min: -10, max: 30 },
  dl_tpt: {
    higherIsBetter: true,
    unit: "Mbps",
    label: "DL Throughput",
    min: 0,
    max: 300,
  },
  ul_tpt: {
    higherIsBetter: true,
    unit: "Mbps",
    label: "UL Throughput",
    min: 0,
    max: 100,
  },
  mos: { higherIsBetter: true, unit: "", label: "MOS", min: 1, max: 5 },
  lte_bler: {
    higherIsBetter: false,
    unit: "%",
    label: "BLER",
    min: 0,
    max: 100,
  },
  num_cells: {
    higherIsBetter: false,
    unit: "",
    label: "Pilot Pollution",
    min: 1,
    max: 20,
  },
  level: {
    higherIsBetter: true,
    unit: "dB",
    label: "SSI",
    min: -120,
    max: -30,
  },
  jitter: {
    higherIsBetter: false,
    unit: "ms",
    label: "Jitter",
    min: 0,
    max: 100,
  },
  latency: {
    higherIsBetter: false,
    unit: "ms",
    label: "Latency",
    min: 0,
    max: 500,
  },
  packet_loss: {
    higherIsBetter: false,
    unit: "%",
    label: "Packet Loss",
    min: 0,
    max: 100,
  },
};

const COLOR_GRADIENT = [
  { min: 0.8, color: "#22C55E" },
  { min: 0.6, color: "#84CC16" },
  { min: 0.4, color: "#EAB308" },
  { min: 0.2, color: "#F97316" },
  { min: 0.0, color: "#EF4444" },
];

const debounce = (fn, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
};

const normalizeMetric = (metric) => {
  if (!metric) return "rsrp";
  const lower = metric.toLowerCase();
  if (["dl_tpt", "dl_throughput", "tpt_dl", "throughput_dl"].includes(lower)) return "dl_thpt";
  if (["ul_tpt", "ul_throughput", "tpt_ul", "throughput_ul"].includes(lower)) return "ul_thpt";
  return lower;
};

const normalizeMetricValue = (value, metric) => {
  const normalizedKey = normalizeMetric(metric);
  const config = METRIC_CONFIG[normalizedKey] || METRIC_CONFIG[metric];
  if (!config || value == null || isNaN(value)) return null;

  let normalized = (value - config.min) / (config.max - config.min);
  normalized = Math.max(0, Math.min(1, normalized));

  if (!config.higherIsBetter) {
    normalized = 1 - normalized;
  }

  return normalized;
};

const getColorFromNormalizedValue = (normalizedValue) => {
  if (normalizedValue == null || isNaN(normalizedValue)) return "#999999";
  for (const { min, color } of COLOR_GRADIENT) {
    if (normalizedValue >= min) return color;
  }
  return "#EF4444";
};

const getColorForMetricValue = (value, metric) => {
  const normalizedKey = normalizeMetric(metric);
  const normalized = normalizeMetricValue(value, normalizedKey);
  return getColorFromNormalizedValue(normalized);
};

const getColorFromValueOrMetric = (value, thresholds, metric) => {
  if (value == null || isNaN(value)) return "#999999";

  if (thresholds?.length > 0) {
    const sorted = [...thresholds]
      .filter((t) => t.min != null && t.max != null)
      .sort((a, b) => parseFloat(a.min) - parseFloat(b.min));

    let matchedThreshold = null;
    for (const t of sorted) {
      const min = parseFloat(t.min);
      const max = parseFloat(t.max);
      const isLastRange = t === sorted[sorted.length - 1];
      if (value >= min && (isLastRange ? value <= max : value < max)) {
        matchedThreshold = t;
      }
    }
    if (matchedThreshold?.color) return matchedThreshold.color;
    if (sorted.length > 0) {
      if (value < sorted[0].min) return sorted[0].color;
      if (value > sorted[sorted.length - 1].max)
        return sorted[sorted.length - 1].color;
    }
    return "#999999";
  }
  return getColorForMetricValue(value, metric);
};

const getThresholdKey = (metric) => {
  return normalizeMetric(metric);
};

const isPointInPolygon = (point, polygon) => {
  const path = polygon?.paths?.[0];
  if (!path?.length) return false;
  const lat = point.lat ?? point.latitude;
  const lng = point.lng ?? point.longitude;
  if (lat == null || lng == null) return false;

  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const { lng: xi, lat: yi } = path[i];
    const { lng: xj, lat: yj } = path[j];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
};

const calculateMedian = (values) => {
  if (!values?.length) return null;
  const validValues = values.filter((v) => v != null && !isNaN(v));
  if (!validValues.length) return null;
  const sorted = [...validValues].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const calculateCategoryStats = (points, category, metric) => {
  if (!points?.length) return null;
  const grouped = {};
  points.forEach((pt) => {
    const key = String(pt[category] || "Unknown").trim();
    if (!grouped[key]) grouped[key] = { count: 0, values: [] };
    grouped[key].count++;
    const val = parseFloat(pt[metric]);
    if (!isNaN(val) && val != null) grouped[key].values.push(val);
  });

  const stats = Object.entries(grouped)
    .map(([name, { count, values }]) => {
      const sortedValues = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sortedValues.length / 2);
      const medianValue =
        sortedValues.length > 0
          ? sortedValues.length % 2
            ? sortedValues[mid]
            : (sortedValues[mid - 1] + sortedValues[mid]) / 2
          : null;

      return {
        name,
        count,
        percentage: ((count / points.length) * 100).toFixed(1),
        avgValue: values.length
          ? values.reduce((a, b) => a + b, 0) / values.length
          : null,
        medianValue,
        minValue: values.length ? Math.min(...values) : null,
        maxValue: values.length ? Math.max(...values) : null,
      };
    })
    .sort((a, b) => b.count - a.count);

  return { stats, dominant: stats[0], total: points.length };
};

// --- Sub Components ---

// ... (ZoneTooltip and BestNetworkLegend remain unchanged) ...
const ZoneTooltip = React.memo(
  ({ polygon, position, selectedMetric, selectedCategory }) => {
    if (!selectedCategory) return null;
    if (!polygon || !position) return null;

    const {
      name,
      pointCount,
      fillColor,
      medianValue,
      bestProvider,
      bestProviderValue,
      bestBand,
      bestBandValue,
      bestTechnology,
      bestTechnologyValue,
      categoryStats,
    } = polygon;

    const config = METRIC_CONFIG[selectedMetric] || {
      unit: "",
      higherIsBetter: true,
    };
    const unit = config.unit || "";

    if (!pointCount || pointCount === 0) {
      return (
        <div
          className="fixed z-[1000] bg-white rounded-lg shadow-xl border border-gray-300 p-4"
          style={{
            left: Math.min(position.x + 15, window.innerWidth - 220),
            top: Math.min(position.y - 10, window.innerHeight - 100),
            pointerEvents: "none",
          }}
        >
          <div className="font-semibold text-gray-800 mb-1">
            {name || "Zone"}
          </div>
          <div className="text-sm text-gray-500">No data available</div>
        </div>
      );
    }

    return (
      <div
        className="fixed z-[1000] bg-white rounded-xl shadow-2xl border-2 overflow-hidden"
        style={{
          left: Math.min(position.x + 15, window.innerWidth - 400),
          top: Math.min(position.y - 10, window.innerHeight - 400),
          pointerEvents: "none",
          borderColor: fillColor || "#3B82F6",
          minWidth: "360px",
          maxWidth: "420px",
        }}
      >
        <div
          className="px-4 py-3"
          style={{ backgroundColor: fillColor || "#3B82F6" }}
        >
          <span className="text-white font-semibold text-sm">
            {name} - {pointCount} samples
          </span>
        </div>

        <div className="p-4 space-y-3">
          {selectedCategory === "provider" && bestProvider && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-500 uppercase">
                Best Provider
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: getProviderColor(bestProvider) }}
                  />
                  <span className="text-sm font-medium">{bestProvider}</span>
                </div>
                {bestProviderValue !== null && (
                  <span className="text-sm text-gray-600">
                    {bestProviderValue.toFixed(2)} {unit}
                  </span>
                )}
              </div>
            </div>
          )}

          {medianValue !== null && medianValue !== undefined && (
            <div className="flex items-center justify-between pb-2 border-b">
              <span className="text-sm font-medium text-gray-600">
                Median {config.label}:
              </span>
              <span className="text-base font-bold text-gray-900">
                {medianValue.toFixed(2)} {unit}
              </span>
            </div>
          )}

          {selectedCategory === "band" && bestBand && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-500 uppercase">
                Best Band
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: getBandColor(bestBand) }}
                  />
                  <span className="text-sm font-medium">Band {bestBand}</span>
                </div>
                {bestBandValue !== null && (
                  <span className="text-sm text-gray-600">
                    {bestBandValue.toFixed(2)} {unit}
                  </span>
                )}
              </div>
            </div>
          )}

          {selectedCategory === "technology" && bestTechnology && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-500 uppercase">
                Best Technology
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{
                      backgroundColor: getTechnologyColor(bestTechnology),
                    }}
                  />
                  <span className="text-sm font-medium">{bestTechnology}</span>
                </div>
                {bestTechnologyValue !== null && (
                  <span className="text-sm text-gray-600">
                    {bestTechnologyValue.toFixed(2)} {unit}
                  </span>
                )}
              </div>
            </div>
          )}

          {categoryStats &&
            selectedCategory &&
            categoryStats[selectedCategory]?.stats && (
              <div className="pt-2 border-t">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                  All {selectedCategory}s
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {categoryStats[selectedCategory].stats
                    .slice(0, 5)
                    .map((stat) => (
                      <div
                        key={stat.name}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-gray-600">{stat.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">
                            {stat.count} pts
                          </span>
                          {stat.medianValue !== null && (
                            <span className="font-medium">
                              {stat.medianValue.toFixed(1)} {unit}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
        </div>
      </div>
    );
  },
);
ZoneTooltip.displayName = "ZoneTooltip";

const BestNetworkLegend = React.memo(({ stats, providerColors, enabled }) => {
  if (!enabled || !stats || Object.keys(stats).length === 0) return null;
  const sortedProviders = Object.entries(stats).sort(
    (a, b) => b[1].locationsWon - a[1].locationsWon,
  );
  const totalZones = sortedProviders.reduce(
    (sum, [, d]) => sum + d.locationsWon,
    0,
  );

  return (
    <div className="absolute bottom-4 left-4 z-[500] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 min-w-[220px] max-w-[280px]">
      <div className="font-bold text-sm mb-2 text-gray-800 border-b pb-2 flex items-center gap-2">
        <span>Best Network by Zone</span>
      </div>
      <div className="space-y-1.5">
        {sortedProviders.map(([provider, data]) => (
          <div key={provider} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{
                  backgroundColor:
                    data.color ||
                    providerColors?.[provider] ||
                    getProviderColor(provider),
                }}
              />
              <span className="text-sm font-medium text-gray-700">
                {provider}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {data.locationsWon}/{totalZones}
              </span>
              <span className="text-xs font-bold text-gray-800 min-w-[40px] text-right">
                {data.percentage?.toFixed(0) || 0}%
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t text-[10px] text-gray-400 text-center">
        Based on weighted composite score
      </div>
    </div>
  );
});
BestNetworkLegend.displayName = "BestNetworkLegend";

// --- Main Component ---

const UnifiedMapView = () => {
  // ... (State hooks remain exactly the same) ...
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [isSideOpen, setIsSideOpen] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState("rsrp");
  const [viewport, setViewport] = useState(null);
  const [colorBy, setColorBy] = useState(null);
  const [highlightedLogs, setHighlightedLogs] = useState(null);

  const [enableDataToggle, setEnableDataToggle] = useState(true);
  const [dataToggle, setDataToggle] = useState("sample");
  const [enableSiteToggle, setEnableSiteToggle] = useState(false);
  const [siteToggle, setSiteToggle] = useState("Cell");
  const [modeMethod, setModeMethod] = useState("Operator");
  const [showSiteMarkers, setShowSiteMarkers] = useState(true);
  const [showSiteSectors, setShowSiteSectors] = useState(true);
  const [showNeighbors, setShowNeighbors] = useState(false);

  const [showPolygons, setShowPolygons] = useState(false);
  const [polygonSource, setPolygonSource] = useState("map");
  const [onlyInsidePolygons, setOnlyInsidePolygons] = useState(false);
  const [areaEnabled, setAreaEnabled] = useState(false);
  const [coverageViolationThreshold, setCoverageViolationThreshold] =
    useState(null);

  const [hoveredPolygon, setHoveredPolygon] = useState(null);
  const [hoverPosition, setHoverPosition] = useState(null);
  const [mapVisibleLocations, setMapVisibleLocations] = useState([]);
  const [dominanceThreshold, setDominanceThreshold] = useState(null);
  const [hoveredCellId, setHoveredCellId] = useState(null);
  const [hoveredLog, setHoveredLog] = useState(null);

  const [ui, setUi] = useState({
    basemapStyle: "roadmap",
    drawEnabled: false,
    shapeMode: "polygon",
    drawPixelateRect: false,
    drawCellSizeMeters: 100,
    drawClearSignal: 0,
    colorizeCells: true,
  });

  const [drawnPoints, setDrawnPoints] = useState(null);
  const [mapVisibleNeighbors, setMapVisibleNeighbors] = useState([]);
  const [legendFilter, setLegendFilter] = useState(null);
  const [isOpacityCollapsed, setIsOpacityCollapsed] = useState(true);
  const [opacity, setOpacity] = useState(0.8);
  const [showSessionNeighbors, setShowSessionNeighbors] = useState(true);

  const [bestNetworkEnabled, setBestNetworkEnabled] = useState(false);
  const [bestNetworkWeights, setBestNetworkWeights] = useState(DEFAULT_WEIGHTS);
  const [bestNetworkOptions, setBestNetworkOptions] = useState({
    gridSize: 0.0005,
    minSamples: 3,
    minMetrics: 2,
    removeOutliersEnabled: true,
    calculationMethod: "median",
    percentileValue: 50,
    outlierMultiplier: 1.5,
  });

  const [coverageHoleFilters, setCoverageHoleFilters] = useState(
    DEFAULT_COVERAGE_FILTERS,
  );
  const [dataFilters, setDataFilters] = useState(DEFAULT_DATA_FILTERS);
  const [enableGrid, setEnableGrid] = useState(false);
  const [gridSizeMeters, setGridSizeMeters] = useState(20);
  const [mlGridEnabled, setMlGridEnabled] = useState(false);
  const [mlGridSize, setMlGridSize] = useState(50);
  const [mlGridAggregation, setMlGridAggregation] = useState("mean");
  const [durationTime, setDurationTime] = useState([]);
  const [techHandOver, setTechHandOver] = useState(false);
  const [bandHandover, setBandHandover] = useState(false);
  const [pciHandover, setPciHandover] = useState(false);
  const [showNumCells, setShowNumCells] = useState(false);
  const [indoor, setIndoor] = useState([]);
  const [outdoor, setOutdoor] = useState([]);
  const [distance, setDistance] = useState(null);
  const [logArea, setLogArea] = useState(null);
  const [pciDistData, setPciDistData] = useState(null);
  const [pciThreshold, setPciThreshold] = useState(0);
  const [dominanceData, setDominanceData] = useState([]);
  const [manualSiteData, setManualSiteData] = useState([]);
  const [manualSiteLoading, setManualSiteLoading] = useState(false);

  useEffect(() => {
    if (!enableSiteToggle) {
      setManualSiteData([]);
    }
  }, [enableSiteToggle]);

  // ... (All existing useEffects and handlers remain exactly the same) ...
  const handleSitesLoaded = useCallback((data, isLoading) => {
    setManualSiteData(data);
    setManualSiteLoading(isLoading);
  }, []);

  const [dominanceSettings, setDominanceSettings] = useState({
    enabled: false,
    threshold: 6,
    showOverlap: false,
    showCoverageViolation: false,
  });

  const mapRef = useRef(null);
  const viewportRef = useRef(null);

  // --- Add Site Mode ---
  const [addSiteMode, setAddSiteMode] = useState(false);
  const [pickedLatLng, setPickedLatLng] = useState(null);
  const [showAddSiteDialog, setShowAddSiteDialog] = useState(false);
  const addSiteModeRef = useRef(false);

  // --- Handling Passed State from MultiView ---
  const passedState = location.state;
  const passedLocations = passedState?.locations;
  const passedNeighbors = passedState?.neighborData;
  const passedProject = passedState?.project;

  const [project, setProject] = useState(passedProject || null);

  const projectId = useMemo(() => {
    const param = searchParams.get("project_id") ?? searchParams.get("project");
    return param ? Number(param) : null;
  }, [searchParams]);

  const sessionIds = useMemo(() => {
    const param = searchParams.get("sessionId") ?? searchParams.get("session");
    if (!param) return [];
    return param
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [searchParams]);

  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const { thresholds: baseThresholds, refetch: refetchColors } =
    useColorForLog();
  const shouldLoadProjectPolygons = showPolygons || enableSiteToggle || onlyInsidePolygons;
  const {
    polygons,
    loading: polygonLoading,
    refetch: refetchPolygons,
  } = useProjectPolygons(projectId, shouldLoadProjectPolygons, polygonSource);

  // ✅ 5. Use Area Polygons Hook
  const {
    areaData, // The hook now returns data from areaBreakdownApi
    loading: areaLoading,
    refetch: refetchAreaPolygons,
  } = useAreaPolygons(projectId, areaEnabled);

  const rawFilteringPolygons = useMemo(
    () => [
      ...(polygons ? polygons : []),
      ...(areaEnabled && areaData ? areaData : []),
    ],
    [polygons, areaEnabled, areaData],
  );
  const siteLayerPolygonFiltering = Boolean(enableSiteToggle && rawFilteringPolygons.length > 0);

  const shouldFetchSamples =
    !passedLocations && enableDataToggle && dataToggle === "sample";

  const {
    locations: fetchedSamples,
    appSummary,
    inpSummary,
    tptVolume,
    loading: sampleLoading,
    progress: sampleProgress,
    error: sampleError,
    refetch: refetchSample,
    bandTransitions,
    pciTransitions,
    technologyTransitions: technologyTransitions,
  } = useNetworkSamples(
    sessionIds,
    shouldFetchSamples,
    onlyInsidePolygons,
    rawFilteringPolygons,
  );

  // Combine passed data with fetched data
  const sampleLocations = passedLocations || fetchedSamples;

  // ✅ 2. Use Prediction Data Hook
  const {
    locations: predictionLocations,
    colorSettings: predictionColorSettings,
    loading: predictionLoading,
    error: predictionError,
    refetch: refetchPrediction,
  } = usePredictionData(
    projectId,
    selectedMetric,
    (enableDataToggle && dataToggle === "prediction") ||
      (enableSiteToggle && siteToggle === "sites-prediction"),
  );

  // ✅ 3. Use Session Neighbors Hook
  const shouldFetchNeighbors = !passedNeighbors && showSessionNeighbors;

  const {
    neighborData: fetchedNeighbors,
    stats: sessionNeighborStats,
    loading: sessionNeighborLoading,
    error: sessionNeighborError,
    refetch: refetchSessionNeighbors,
  } = useSessionNeighbors(
    sessionIds,
    shouldFetchNeighbors,
    onlyInsidePolygons,
    rawFilteringPolygons,
  );

  const sessionNeighborData = passedNeighbors || fetchedNeighbors;

  // ✅ 6. Use Site Data (Existing)
  const {
    siteData: rawSiteData,
    loading: siteLoading,
    error: siteError,
    refetch: refetchSites,
  } = useSiteData({
    enableSiteToggle,
    siteToggle,
    projectId,
    sessionIds,
    autoFetch: true,
    filterEnabled: siteLayerPolygonFiltering || onlyInsidePolygons,
    polygons: rawFilteringPolygons,
  });

  const siteData = rawSiteData || [];
  const {
    allNeighbors: rawAllNeighbors,
    stats: neighborStats,
    loading: neighborLoading,
    refetch: refetchNeighbors,
  } = useNeighborCollisions({
    sessionIds,
    enabled: showNeighbors,
  });

  const allNeighbors = rawAllNeighbors || [];

  // ... (Effect hooks for duration, neighbor data, etc. remain unchanged) ...
  useEffect(() => {
    const timeData = async () => {
      if (!sessionIds?.length) return;
      try {
        const res = await mapViewApi.getDuration({
          sessionIds: sessionIds.join(","),
        });

        const dataArray = res?.Data || res?.data?.data || res?.data || [];

        if (Array.isArray(dataArray)) {
          setDurationTime(
            dataArray.map((item) => ({
              provider: normalizeProviderName(
                item.Provider || item.provider || "",
              ),

              networkType: normalizeTechName(
                item.Network || item.network || "",
              ),

              totaltime: item.TotalDurationHours
                ? `${item.TotalDurationHours.toFixed(2)} hrs`
                : item.timeReadable || "0s",
            })),
          );
        }
      } catch (err) {
        console.error("Failed to fetch duration data", err);
      }
    };
    timeData();
  }, [sessionIds]);

  useEffect(() => {
    const neighbordata = async () => {
      if (!sessionIds?.length) return;
      try {
        const res = await mapViewApi.getDistanceSession({
          sessionIds: sessionIds.join(","),
        });
        setDistance(res?.TotalDistanceKm || null);
      } catch (error) {}
    };
    neighbordata();
  }, [sessionIds]);

  useEffect(() => {
    const ioAnalysis = async () => {
      try {
        const res = await mapViewApi.getIOAnalysis({
          sessionIds: sessionIds.join(","),
        });
        setIndoor(res?.Indoor);
        setOutdoor(res?.Outdoor);
      } catch (error) {}
    };
    ioAnalysis();
  }, [sessionIds]);

  useEffect(() => {
    if (sessionIds.length > 0) {
      const fetchDist = async () => {
        try {
          const data = await mapViewApi.getPciDistribution(sessionIds);
          if (data && data.success) {
            // Store only the primary_yes data as requested
            setPciDistData(data.primary_yes);
          }
        } catch (error) {
          console.error("Failed to fetch PCI distribution", error);
        }
      };
      fetchDist();
    }
  }, [sessionIds]);

  useEffect(() => {
    const fetchDominance = async () => {
      if (sessionIds.length > 0) {
        try {
          const res = await mapViewApi.getDominanceDetails(sessionIds);
          if (res?.success && res.data) {
            setDominanceData(res.data);
          }
        } catch (err) {
          console.error("Failed to fetch dominance details", err);
        }
      }
    };
    fetchDominance();
  }, [sessionIds]);

  // ... (Rest of Derived State & Computations logic is same) ...
  const pciRange = useMemo(() => {
    if (!pciDistData || Object.keys(pciDistData).length === 0) {
      return { min: 0, max: 100 };
    }
    const percentages = Object.values(pciDistData).map((pciGroup) => {
      const totalWeight = Object.values(pciGroup).reduce(
        (sum, value) => sum + (parseFloat(value) || 0),
        0,
      );
      return totalWeight * 100;
    });
    const min = Math.min(...percentages);
    const max = Math.max(...percentages);
    return {
      min: isFinite(min) ? Math.floor(min) : 0,
      max: isFinite(max) ? Math.ceil(max) : 100,
    };
  }, [pciDistData]);

  const locations = useMemo(() => {
    if (!enableDataToggle && !enableSiteToggle) return [];
    let mainLogs = [];
    if (enableDataToggle) {
      mainLogs =
        dataToggle === "sample"
          ? sampleLocations || []
          : predictionLocations || [];
    } else if (enableSiteToggle && siteToggle === "sites-prediction") {
      mainLogs = predictionLocations || [];
    }
    return mainLogs;
  }, [
    enableDataToggle,
    enableSiteToggle,
    dataToggle,
    siteToggle,
    sampleLocations,
    predictionLocations,
  ]);

  const isLoading =
    (shouldFetchSamples && sampleLoading) ||
    predictionLoading ||
    siteLoading ||
    neighborLoading ||
    polygonLoading ||
    areaLoading ||
    (shouldFetchNeighbors && sessionNeighborLoading);

  const error = sampleError || predictionError || sessionNeighborError;

  const effectiveThresholds = useMemo(() => {
    if (predictionColorSettings?.length && dataToggle === "prediction") {
      return {
        ...baseThresholds,
        [selectedMetric]: predictionColorSettings.map((s) => ({
          min: parseFloat(s.min),
          max: parseFloat(s.max),
          color: s.color,
        })),
      };
    }
    return baseThresholds;
  }, [baseThresholds, predictionColorSettings, selectedMetric, dataToggle]);

  const {
    processedPolygons: bestNetworkPolygons,
    stats: bestNetworkStats,
    providerColors: bestNetworkProviderColors,
  } = useBestNetworkCalculation(
    locations,
    bestNetworkWeights,
    bestNetworkEnabled,
    bestNetworkOptions,
    areaData,
  );

  const availableFilterOptions = useMemo(() => {
    const providers = new Set();
    const bands = new Set();
    const technologies = new Set();

    (locations || []).forEach((loc) => {
      if (loc.provider) providers.add(loc.provider);
      if (loc.band) {
        const norm = normalizeBandName(loc.band);
        if (norm && norm !== "Unknown") bands.add(norm);
      }
      if (loc.technology) technologies.add(normalizeTechName(loc.technology));
    });

    (sessionNeighborData || []).forEach((n) => {
      if (n.provider) providers.add(n.provider);
      if (n.primaryBand) {
        const norm = normalizeBandName(n.primaryBand);
        if (norm && norm !== "Unknown") bands.add(norm);
      }
      if (n.neighbourBand) {
        const norm = normalizeBandName(n.neighbourBand);
        if (norm && norm !== "Unknown") bands.add(norm);
      }
      if (n.networkType)
        technologies.add(normalizeTechName(n.networkType, n.neighbourBand));
    });

    return {
      providers: [...providers].sort(),
      bands: [...bands].sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numA - numB;
      }),
      technologies: [...technologies].sort(),
    };
  }, [locations, sessionNeighborData]);

  const problematicLogIds = useMemo(() => {
    if (
      dominanceThreshold === null ||
      !dominanceData ||
      !Array.isArray(dominanceData)
    ) {
      return null;
    }
    const idMap = new Map();
    const limit = Math.abs(dominanceThreshold);
    dominanceData.forEach((item) => {
      const logId = String(item.LogId || item.log_id);
      const values = item.dominance || [];
      const countInRange = values.filter((val) => {
        const num = parseFloat(val);
        return num >= -limit && num <= limit;
      }).length;
      if (countInRange > 0) {
        idMap.set(logId, countInRange);
      }
    });
    return idMap;
  }, [dominanceData, dominanceThreshold]);

  const coverageViolationLogIds = useMemo(() => {
    if (
      coverageViolationThreshold === null ||
      !dominanceData ||
      !Array.isArray(dominanceData)
    ) {
      return null;
    }
    const idMap = new Map();
    dominanceData.forEach((item) => {
      const logId = String(item.LogId || item.log_id);
      const values = item.dominance || [];
      const countInRange = values.filter((val) => {
        const num = parseFloat(val);
        return num >= coverageViolationThreshold && num <= 0;
      }).length;
      if (countInRange > 0) {
        idMap.set(logId, countInRange);
      }
    });
    return idMap;
  }, [dominanceData, coverageViolationThreshold]);

  const filteredLocations = useMemo(() => {
    let result = [...(locations || [])];
    const activeCoverageFilters = Object.entries(coverageHoleFilters).filter(
      ([, config]) => config.enabled,
    );
    if (activeCoverageFilters.length > 0) {
      result = result.filter((loc) =>
        activeCoverageFilters.every(([metric, { threshold }]) => {
          const val = parseFloat(loc[metric]);
          return !isNaN(val) && val < threshold;
        }),
      );
    }
    const { providers, bands, technologies, indoorOutdoor } = dataFilters;
    if (providers?.length)
      result = result.filter((l) => providers.includes(l.provider));
    if (bands?.length)
      result = result.filter((l) => bands.includes(String(l.band)));
    if (technologies?.length)
      result = result.filter((l) =>
        technologies.includes(normalizeTechName(l.technology)),
      );
    if (indoorOutdoor?.length > 0) {
      const lowerFilters = indoorOutdoor.map((v) => v.toLowerCase());
      result = result.filter(
        (l) =>
          l.indoor_outdoor &&
          lowerFilters.includes(l.indoor_outdoor.toLowerCase()),
      );
    }
    if (pciDistData && pciThreshold > 0) {
      result = result.filter((loc) => {
        const logPci = String(loc.pci || loc.PCI || "");
        if (!logPci) return true;
        const pciGroup = pciDistData[logPci];
        if (pciGroup) {
          const totalWeight = Object.values(pciGroup).reduce(
            (sum, value) => sum + (parseFloat(value) || 0),
            0,
          );
          const totalPercentage = totalWeight * 100;
          return totalPercentage >= pciThreshold;
        }
        return true;
      });
    }
    if (dominanceThreshold !== null && problematicLogIds) {
      result = result
        .filter((loc) => {
          const logId = String(loc.id || loc.LogId || "");
          return problematicLogIds.has(logId);
        })
        .map((loc) => ({
          ...loc,
          dominance: problematicLogIds.get(String(loc.id || loc.LogId || "")),
        }));
    }
    if (coverageViolationThreshold !== null && coverageViolationLogIds) {
      result = result
        .filter((loc) => {
          const logId = String(loc.id || loc.LogId || "");
          return coverageViolationLogIds.has(logId);
        })
        .map((loc) => ({
          ...loc,
          coverage_violation: coverageViolationLogIds.get(
            String(loc.id || loc.LogId || ""),
          ),
        }));
    }
    return result;
  }, [
    locations,
    coverageHoleFilters,
    dataFilters,
    pciDistData,
    pciThreshold,
    problematicLogIds,
    dominanceThreshold,
    coverageViolationLogIds,
    coverageViolationThreshold,
  ]);

  const finalDisplayLocations = useMemo(() => {
    if (drawnPoints !== null) {
      return drawnPoints;
    }
    if (highlightedLogs) return highlightedLogs;
    return filteredLocations;
  }, [drawnPoints, highlightedLogs, filteredLocations]);

  const polygonsWithColors = useMemo(() => {
    if (!showPolygons || !polygons?.length) return [];
    if (!onlyInsidePolygons || !locations?.length) {
      return polygons.map((p) => ({
        ...p,
        fillColor: "#4285F4",
        fillOpacity: 0.35,
        pointCount: 0,
      }));
    }
    const thresholdKey = getThresholdKey(selectedMetric);
    const currentThresholds = effectiveThresholds[thresholdKey] || [];
    return polygons.map((poly) => {
      const pointsInside = locations.filter((pt) => isPointInPolygon(pt, poly));
      const values = pointsInside
        .map((p) => parseFloat(p[selectedMetric]))
        .filter((v) => !isNaN(v));
      if (!values.length) {
        return {
          ...poly,
          fillColor: "#ccc",
          fillOpacity: 0.3,
          pointCount: pointsInside.length,
        };
      }
      const median = calculateMedian(values);
      const fillColor = getColorFromValueOrMetric(
        median,
        currentThresholds,
        selectedMetric,
      );
      return {
        ...poly,
        fillColor,
        fillOpacity: 0.7,
        pointCount: pointsInside.length,
        medianValue: median,
      };
    });
  }, [
    showPolygons,
    polygons,
    onlyInsidePolygons,
    locations,
    selectedMetric,
    effectiveThresholds,
  ]);

  const areaPolygonsWithColors = useMemo(() => {
    if (!areaEnabled || !areaData?.length) return [];
    if (!filteredLocations?.length) {
      return areaData.map((p) => ({
        ...p,
        fillColor: "#9333ea",
        fillOpacity: 0.25,
        pointCount: 0,
        medianValue: null,
        categoryStats: null,
        bestProvider: null,
        bestBand: null,
        bestTechnology: null,
      }));
    }
    const thresholdKey = getThresholdKey(selectedMetric);
    const currentThresholds = baseThresholds[thresholdKey] || [];
    const useCategorical =
      colorBy && ["provider", "band", "technology"].includes(colorBy);
    const metricConfig = METRIC_CONFIG[selectedMetric] || {
      higherIsBetter: true,
    };
    return areaData.map((poly) => {
      const pointsInside = filteredLocations.filter((pt) =>
        isPointInPolygon(pt, poly),
      );
      if (!pointsInside.length) {
        return {
          ...poly,
          fillColor: "#ccc",
          fillOpacity: 0.3,
          pointCount: 0,
          medianValue: null,
          categoryStats: null,
          bestProvider: null,
          bestBand: null,
          bestTechnology: null,
        };
      }
      const providerStats = calculateCategoryStats(
        pointsInside,
        "provider",
        selectedMetric,
      );
      const bandStats = calculateCategoryStats(
        pointsInside,
        "band",
        selectedMetric,
      );
      const technologyStats = calculateCategoryStats(
        pointsInside,
        "technology",
        selectedMetric,
      );
      const values = pointsInside
        .map((p) => parseFloat(p[selectedMetric]))
        .filter((v) => !isNaN(v) && v != null);
      const medianValue = calculateMedian(values);
      const findBestByMetric = (stats) => {
        if (!stats?.stats?.length) return { best: null, value: null };
        let best = null;
        let bestValue = metricConfig.higherIsBetter ? -Infinity : Infinity;
        stats.stats.forEach((stat) => {
          const median = stat.medianValue ?? stat.avgValue;
          if (median != null) {
            const isBetter = metricConfig.higherIsBetter
              ? median > bestValue
              : median < bestValue;
            if (isBetter) {
              bestValue = median;
              best = stat.name;
            }
          }
        });
        return {
          best,
          value:
            bestValue === -Infinity || bestValue === Infinity
              ? null
              : bestValue,
        };
      };
      const { best: bestProvider, value: bestProviderValue } =
        findBestByMetric(providerStats);
      const { best: bestBand, value: bestBandValue } =
        findBestByMetric(bandStats);
      const { best: bestTechnology, value: bestTechnologyValue } =
        findBestByMetric(technologyStats);
      let fillColor;
      if (useCategorical) {
        switch (colorBy) {
          case "provider":
            fillColor = bestProvider
              ? getProviderColor(bestProvider)
              : providerStats?.dominant
                ? getProviderColor(providerStats.dominant.name)
                : "#ccc";
            break;
          case "band":
            fillColor = bestBand
              ? getBandColor(bestBand)
              : bandStats?.dominant
                ? getBandColor(bandStats.dominant.name)
                : "#ccc";
            break;
          case "technology":
            fillColor = bestTechnology
              ? getTechnologyColor(bestTechnology)
              : technologyStats?.dominant
                ? getTechnologyColor(technologyStats.dominant.name)
                : "#ccc";
            break;
          default:
            fillColor = "#ccc";
        }
      } else {
        fillColor =
          medianValue !== null
            ? getColorFromValueOrMetric(
                medianValue,
                currentThresholds,
                selectedMetric,
              )
            : "#ccc";
      }
      return {
        ...poly,
        fillColor,
        fillOpacity: 0.7,
        strokeWeight: 2.5,
        pointCount: pointsInside.length,
        medianValue,
        bestProvider,
        bestProviderValue,
        bestBand,
        bestBandValue,
        bestTechnology,
        bestTechnologyValue,
        categoryStats: {
          provider: providerStats,
          band: bandStats,
          technology: technologyStats,
        },
      };
    });
  }, [
    areaEnabled,
    areaData,
    filteredLocations,
    selectedMetric,
    baseThresholds,
    colorBy,
  ]);

  const visiblePolygons = useMemo(() => {
    if (!showPolygons || !polygonsWithColors?.length) return [];
    if (!viewport) return polygonsWithColors;
    return polygonsWithColors.filter((poly) => {
      if (!poly.bbox) return true;
      return !(
        poly.bbox.west > viewport.east ||
        poly.bbox.east < viewport.west ||
        poly.bbox.south > viewport.north ||
        poly.bbox.north < viewport.south
      );
    });
  }, [showPolygons, polygonsWithColors, viewport]);

  const mapCenter = useMemo(() => {
    if (!locations?.length) return DEFAULT_CENTER;
    const sum = locations.reduce(
      (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
      { lat: 0, lng: 0 },
    );
    return { lat: sum.lat / locations.length, lng: sum.lng / locations.length };
  }, [locations]);

  const showDataCircles =
    enableDataToggle || (enableSiteToggle && siteToggle === "sites-prediction");
  const shouldRenderSiteLayer = Boolean(showSiteMarkers || showSiteSectors);
  const shouldShowLegend = useMemo(() => {
    return (
      enableDataToggle ||
      (enableSiteToggle && ["Cell", "NoML", "ML"].includes(siteToggle))
    );
  }, [enableDataToggle, enableSiteToggle, siteToggle]);

  const locationsToDisplay = useMemo(() => {
    if (!showDataCircles) return [];
    return finalDisplayLocations;
  }, [showDataCircles, finalDisplayLocations, onlyInsidePolygons]);

  const mapOptions = useMemo(
    () => ({
      mapTypeId: ui.basemapStyle,
      disableDefaultUI: false,
      zoomControl: true,
    }),
    [ui.basemapStyle],
  );

  const updateViewportRef = useCallback((newViewport) => {
    viewportRef.current = newViewport;
    setViewport(newViewport);
  }, []);

  const debouncedSetViewport = useMemo(
    () => debounce(updateViewportRef, 300),
    [updateViewportRef],
  );

  const handleMapLoad = useCallback(
    (map) => {
      mapRef.current = map;
      map.addListener("maptypeid_changed", () => {
        const currentType = map.getMapTypeId();
        setUi((prev) => {
          if (prev.basemapStyle === currentType) return prev;
          return { ...prev, basemapStyle: currentType };
        });
      });
      const updateViewport = () => {
        const bounds = map.getBounds();
        if (!bounds) return;
        const newViewport = {
          north: bounds.getNorthEast().lat(),
          south: bounds.getSouthWest().lat(),
          east: bounds.getNorthEast().lng(),
          west: bounds.getSouthWest().lng(),
        };
        debouncedSetViewport(newViewport);
      };
      map.addListener("idle", updateViewport);
      updateViewport();

      // Add site click listener
      map.addListener("click", (e) => {
        if (addSiteModeRef.current) {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          setPickedLatLng({ lat, lng });
          setAddSiteMode(false);
          addSiteModeRef.current = false;
          setShowAddSiteDialog(true);
        }
      });
    },
    [debouncedSetViewport],
  );

  const handleUIChange = useCallback((newUI) => {
    setUi((prev) => {
      const updated = { ...prev, ...newUI };
      return updated;
    });
  }, []);

  const handleDrawingsChange = useCallback((drawings) => {
    let newPoints = null;
    if (drawings && drawings.length > 0) {
      const uniqueLogs = new Map();
      let hasLogs = false;
      drawings.forEach((drawing) => {
        if (drawing.logs?.length > 0) {
          hasLogs = true;
          drawing.logs.forEach((log) => {
            const key = log.id || `${log.lat}-${log.lng}-${log.timestamp}`;
            uniqueLogs.set(key, log);
          });
        }
      });
      if (hasLogs) newPoints = Array.from(uniqueLogs.values());
      else newPoints = [];
    }
    setDrawnPoints((prev) => {
      if (prev === null && newPoints === null) return prev;
      if (prev === null && newPoints !== null) return newPoints;
      if (prev !== null && newPoints === null) return null;
      if (prev.length !== newPoints.length) return newPoints;
      const prevIds = new Set(prev.map((p) => p.id));
      const hasDiff = newPoints.some((p) => !prevIds.has(p.id));
      return hasDiff ? newPoints : prev;
    });
  }, []);

  const reloadData = useCallback(() => {
    refetchColors();
    if (enableSiteToggle) refetchSites();
    if (enableDataToggle && dataToggle === "sample") refetchSample();
    if (
      (enableDataToggle && dataToggle === "prediction") ||
      (enableSiteToggle && siteToggle === "sites-prediction")
    ) {
      refetchPrediction();
    }
    if (showPolygons) refetchPolygons();
    if (areaEnabled) refetchAreaPolygons();
    if (showNeighbors) refetchNeighbors();
    if (showSessionNeighbors) refetchSessionNeighbors();
  }, [
    enableDataToggle,
    enableSiteToggle,
    dataToggle,
    siteToggle,
    showPolygons,
    areaEnabled,
    showNeighbors,
    showSessionNeighbors,
    refetchSample,
    refetchPrediction,
    refetchPolygons,
    refetchAreaPolygons,
    refetchSites,
    refetchNeighbors,
    refetchSessionNeighbors,
  ]);

  const filteredNeighbors = useMemo(() => {
    let data = sessionNeighborData || [];
    if (!data.length) return [];
    if (onlyInsidePolygons && showPolygons && polygons?.length) {
      data = data.filter((point) =>
        polygons.some((poly) => isPointInPolygon(point, poly)),
      );
    }
    const { providers, bands, technologies } = dataFilters;
    const hasProviderFilter = providers?.length > 0;
    const hasBandFilter = bands?.length > 0;
    const hasTechFilter = technologies?.length > 0;
    if (hasProviderFilter || hasBandFilter || hasTechFilter) {
      data = data.filter((item) => {
        if (hasProviderFilter && !providers.includes(item.provider))
          return false;
        if (
          hasTechFilter &&
          !technologies.includes(normalizeTechName(item.networkType))
        )
          return false;
        if (hasBandFilter) {
          const nb = String(item.neighbourBand);
          const pb = String(item.primaryBand);
          if (!bands.includes(nb) && !bands.includes(pb)) return false;
        }
        return true;
      });
    }
    return data;
  }, [
    sessionNeighborData,
    onlyInsidePolygons,
    showPolygons,
    polygons,
    dataFilters,
  ]);

  const handlePolygonMouseOver = useCallback((poly, e) => {
    setHoveredPolygon(poly);
    setHoverPosition({ x: e.domEvent.clientX, y: e.domEvent.clientY });
  }, []);

  const handlePolygonMouseMove = useCallback((e) => {
    setHoverPosition({ x: e.domEvent.clientX, y: e.domEvent.clientY });
  }, []);

  const handlePolygonMouseOut = useCallback(() => {
    setHoveredPolygon(null);
    setHoverPosition(null);
  }, []);

  const handleNavigateToMultiView = () => {
    const url = `/multi-map?session=${sessionIds.join(",")}&project_id=${projectId || ""}`;
    navigate(url, {
      state: {
        locations: locations,
        neighborData: sessionNeighborData,
        thresholds: effectiveThresholds,
        project: project,
      },
    });
  };



const handleMarkerHover = useCallback((hoverInfo) => {
  // 1. Unpack the deck.gl event object to get the actual log data
  const log = hoverInfo?.object || hoverInfo;
  
  if (!log) {
     setHoveredLog(null);
     setHoveredCellId(null);
     return;
  }

  console.log("✅ [BOTTLENECK CHECK 2] UnifiedMapView received log:", log);

  console.log("DEBUG: Actual Hovered Log Data:", log);
  
  // 2. Extract PCI from the unpacked log
  const pci = log?.pci ?? log?.PCI ?? log?.cell_id ?? log?.physical_cell_id;
  const normalizedPci = pci !== null && pci !== undefined ? String(pci).trim() : null;
  
  console.log(`[UnifiedMapView] Hovered Log PCI: ${normalizedPci}`); 
  
  // 3. Set the corrected log object to state
  setHoveredLog(log);
  setHoveredCellId(normalizedPci);
}, []);

const uniqueBands = useMemo(() => {
  if (!siteData || !siteData.length) return [];
  const paramSet = new Set();
  siteData.forEach((s) => {
    const bandVal = s.Band || s.band;
    if (bandVal) {
      const normalized = normalizeBandName(bandVal);
      if (normalized && normalized !== "Unknown") {
        paramSet.add(normalized);
      }
    }
  });
  return Array.from(paramSet).sort();
}, [siteData]);

const uniquePcis = useMemo(() => {
  if (!siteData || !siteData.length) return [];
  const paramSet = new Set();
  siteData.forEach((s) => {
    // Check various casing for PCI
    const val = s.Pci !== undefined ? s.Pci : (s.pci !== undefined ? s.pci : s.PCI);
    if (val !== undefined && val !== null && val !== "") {
      const num = Number(val);
      if (!isNaN(num)) paramSet.add(num);
    }
  });
  return Array.from(paramSet).sort((a, b) => a - b);
}, [siteData]);

  const uniquePcisFromLogs = useMemo(() => {
    const pciSet = new Set();
    const processItem = (item) => {
      const pci = item.pci ?? item.PCI ?? item.cell_id ?? item.physical_cell_id;
      if (pci !== undefined && pci !== null && pci !== "") {
        const num = Number(pci);
        if (!isNaN(num)) pciSet.add(num);
      }
    };
    (locations || []).forEach(processItem);
    (sessionNeighborData || []).forEach(processItem);
    return pciSet;
  }, [locations, sessionNeighborData]);

  const combinedBands = useMemo(() => {
    // Merge bands from logs (availableFilterOptions) and sites (uniqueBands)
    const set = new Set([...(availableFilterOptions?.bands || []), ...uniqueBands]);
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.replace(/\D/g, '')) || 0;
      return numA - numB;
    });
  }, [availableFilterOptions, uniqueBands]);

  const combinedPcis = useMemo(() => {
    // Merge PCIs from logs and sites
    const set = new Set([...uniquePcisFromLogs, ...uniquePcis]);
    return Array.from(set).sort((a, b) => a - b);
  }, [uniquePcisFromLogs, uniquePcis]);

  if (!isLoaded)
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  if (loadError)
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Map loading error: {loadError.message}
      </div>
    );

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-800">
      <UnifiedHeader
        onSettingsSaved={refetchColors}
        onToggleControls={() => setIsSideOpen(!isSideOpen)}
        onLeftToggle={() => setShowAnalytics(!showAnalytics)}
        isControlsOpen={isSideOpen}
        showAnalytics={showAnalytics}
        projectId={projectId}
        sessionIds={sessionIds}
        project={project}
        setProject={setProject}
        isOpacityCollapsed={isOpacityCollapsed}
        setIsOpacityCollapsed={setIsOpacityCollapsed}
        opacity={opacity}
        setOpacity={setOpacity}
        ui={ui}
        onUIChange={handleUIChange}
      />

      {showAnalytics && (
        <UnifiedDetailLogs
          locations={finalDisplayLocations}
          onHighlightLogs={setHighlightedLogs}
          totalLocations={locations?.length || 0}
          filteredCount={finalDisplayLocations?.length || 0}
          dataToggle={dataToggle}
          enableDataToggle={enableDataToggle}
          selectedMetric={selectedMetric}
          siteData={siteData}
          durationTime={durationTime}
          siteToggle={siteToggle}
          enableSiteToggle={enableSiteToggle}
          showSiteMarkers={showSiteMarkers}
          showSiteSectors={showSiteSectors}
          polygons={polygonsWithColors}
          visiblePolygons={visiblePolygons}
          polygonSource={polygonSource}
          showPolygons={showPolygons}
          onlyInsidePolygons={onlyInsidePolygons}
          coverageHoleFilters={coverageHoleFilters}
          viewport={viewport}
          distance={distance}
          mapCenter={mapCenter}
          projectId={projectId}
          sessionIds={sessionIds}
          isLoading={isLoading}
          thresholds={effectiveThresholds}
          appSummary={appSummary}
          InpSummary={inpSummary}
          tptVolume={tptVolume}
          logArea={logArea}
          indoor={indoor}
          outdoor={outdoor}
          technologyTransitions={technologyTransitions}
          techHandOver={techHandOver}
          dataFilters={dataFilters}
          bestNetworkEnabled={bestNetworkEnabled}
          bestNetworkStats={bestNetworkStats}
          onClose={() => setShowAnalytics(false)}
          n78NeighborLoading={sessionNeighborLoading}
          showN78Neighbors={showSessionNeighbors}
          n78NeighborStats={sessionNeighborStats}
          n78NeighborData={filteredNeighbors}
        />
      )}

      <UnifiedMapSidebar
        open={isSideOpen}
        pciThreshold={pciThreshold}
        dominanceThreshold={dominanceThreshold}
        setDominanceThreshold={setDominanceThreshold}
        setPciThreshold={setPciThreshold}
        onOpenChange={setIsSideOpen}
        enableDataToggle={enableDataToggle}
        setEnableDataToggle={setEnableDataToggle}
        dataToggle={dataToggle}
        modeMethod={modeMethod}
        setModeMethod={setModeMethod}
        setTechHandover={setTechHandOver}
        techHandover={techHandOver}
        technologyTransitions={technologyTransitions}
        setDataToggle={setDataToggle}
        enableSiteToggle={enableSiteToggle}
        setEnableSiteToggle={setEnableSiteToggle}
        bandHandover={bandHandover}
        setBandHandover={setBandHandover}
        bandTransitions={bandTransitions}
        pciHandover={pciHandover}
        setPciHandover={setPciHandover}
        pciTransitions={pciTransitions}
        siteToggle={siteToggle}
        showSessionNeighbors={showSessionNeighbors}
        setShowSessionNeighbors={setShowSessionNeighbors}
        showNumCells={showNumCells}
        setShowNumCells={setShowNumCells}
        setSiteToggle={setSiteToggle}
        projectId={projectId}
        sessionIds={sessionIds}
        metric={selectedMetric}
        setMetric={setSelectedMetric}
        coverageHoleFilters={coverageHoleFilters}
        setCoverageHoleFilters={setCoverageHoleFilters}
        dataFilters={dataFilters}
        setDataFilters={setDataFilters}
        availableFilterOptions={availableFilterOptions}
        colorBy={colorBy}
        setColorBy={setColorBy}
        ui={ui}
        pciRange={pciRange}
        onUIChange={handleUIChange}
        showPolygons={showPolygons}
        setShowPolygons={setShowPolygons}
        polygonSource={polygonSource}
        setPolygonSource={setPolygonSource}
        onlyInsidePolygons={onlyInsidePolygons}
        setOnlyInsidePolygons={setOnlyInsidePolygons}
        polygonCount={polygons?.length || 0}
        showSiteMarkers={showSiteMarkers}
        setShowSiteMarkers={setShowSiteMarkers}
        showSiteSectors={showSiteSectors}
        setShowSiteSectors={setShowSiteSectors}
        loading={isLoading}
        reloadData={reloadData}
        showNeighbors={showNeighbors}
        setShowNeighbors={setShowNeighbors}
        neighborStats={neighborStats}
        areaEnabled={areaEnabled}
        setAreaEnabled={setAreaEnabled}
        enableGrid={enableGrid}
        setEnableGrid={setEnableGrid}
        gridSizeMeters={gridSizeMeters}
        setGridSizeMeters={setGridSizeMeters}
        mlGridEnabled={mlGridEnabled}
        setMlGridEnabled={setMlGridEnabled}
        mlGridSize={mlGridSize}
        setMlGridSize={setMlGridSize}
        mlGridAggregation={mlGridAggregation}
        setMlGridAggregation={setMlGridAggregation}
        bestNetworkEnabled={bestNetworkEnabled}
        setBestNetworkEnabled={setBestNetworkEnabled}
        bestNetworkWeights={bestNetworkWeights}
        setBestNetworkWeights={setBestNetworkWeights}
        bestNetworkOptions={bestNetworkOptions}
        setBestNetworkOptions={setBestNetworkOptions}
        bestNetworkStats={bestNetworkStats}
        coverageViolationThreshold={coverageViolationThreshold}
        setCoverageViolationThreshold={setCoverageViolationThreshold}
        onAddSiteClick={() => {
          setAddSiteMode(true);
          addSiteModeRef.current = true;
          toast.info("Click on the map to pick a location for the new site", { autoClose: 4000 });
        }}
      />

      <div className="flex-grow relative overflow-hidden">
        <div className="absolute top-18 right-3 z-10">
          <button
            onClick={handleNavigateToMultiView}
            className="bg-white p-2 rounded-md shadow-md hover:bg-gray-100 text-gray-700 flex items-center justify-center border border-gray-200"
            title="Open Multi View"
          >
            <LayoutGrid size={20} />
          </button>
        </div>

        <LoadingProgress
          progress={sampleProgress}
          loading={sampleLoading && enableDataToggle && dataToggle === "sample"}
        />

        {shouldShowLegend && !bestNetworkEnabled && (
          <MapLegend
            thresholds={effectiveThresholds}
            selectedMetric={selectedMetric}
            colorBy={colorBy}
            showOperators={colorBy === "provider"}
            showBands={colorBy === "band"}
            showTechnologies={colorBy === "technology"}
            showSignalQuality={!colorBy || colorBy === "metric"}
            availableFilterOptions={availableFilterOptions}
            logs={finalDisplayLocations}
            activeFilter={legendFilter}
            onFilterChange={setLegendFilter}
          />
        )}

        <SiteLegend
          enabled={enableSiteToggle}
          sites={manualSiteData}
          colorMode={modeMethod}
          isLoading={manualSiteLoading}
        />

        <BestNetworkLegend
          stats={bestNetworkStats}
          providerColors={bestNetworkProviderColors}
          enabled={bestNetworkEnabled}
        />

        <div className="relative h-full w-full">
          {isLoading &&
          (locations?.length || 0) === 0 &&
          (siteData?.length || 0) === 0 ? (
            <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-700">
              <Spinner />
            </div>
          ) : error || siteError ? (
            <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-700">
              <div className="text-center space-y-2">
                {error && <p className="text-red-500">Data Error: {error}</p>}
                {siteError && (
                  <p className="text-red-500">
                    Site Error: {siteError.message}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <MapWithMultipleCircles
              isLoaded={isLoaded}
              loadError={loadError}
              locations={finalDisplayLocations}
              thresholds={effectiveThresholds}
              selectedMetric={selectedMetric}
              areaData={areaData}
              // REMOVED legacy props to prevent ghost lines:
              // technologyTransitions={technologyTransitions}
              // techHandOver={techHandOver}
              onMarkerHover={handleMarkerHover} // Pass the new handler
              hoveredCellId={hoveredLog?.pci}
              colorBy={colorBy}
              activeMarkerIndex={null}
              onMarkerClick={() => {}}
              options={mapOptions}
              center={mapCenter}
              defaultZoom={13}
              fitToLocations={(locationsToDisplay?.length || 0) > 0}
              showNumCells={showNumCells}
              onLoad={handleMapLoad}
              pointRadius={12}
              projectId={projectId}
              polygonSource={polygonSource}
              enablePolygonFilter={true}
              showPolygonBoundary={true}
              enableGrid={enableGrid}
              gridSizeMeters={gridSizeMeters}
              areaEnabled={areaEnabled}
              onFilteredLocationsChange={setMapVisibleLocations}
              opacity={opacity}
              neighborData={filteredNeighbors}
              showNeighbors={showSessionNeighbors}
              neighborSquareSize={15}
              neighborOpacity={0.5}
              onNeighborClick={(neighbor) => {}}
              onFilteredNeighborsChange={setMapVisibleNeighbors}
              debugNeighbors={true}
              legendFilter={legendFilter}
            >
              <DrawingToolsLayer
                map={mapRef.current}
                enabled={ui.drawEnabled}
                logs={filteredLocations}
                sessions={[]}
                selectedMetric={selectedMetric}
                thresholds={effectiveThresholds}
                pixelateRect={ui.drawPixelateRect}
                cellSizeMeters={ui.drawCellSizeMeters}
                colorizeCells={ui.colorizeCells}
                shapeMode={ui.shapeMode}
                onUIChange={handleUIChange}
                clearSignal={ui.drawClearSignal}
                onDrawingsChange={handleDrawingsChange}
              />

              {showPolygons &&
                (visiblePolygons || []).map((poly) => (
                  <Polygon
                    key={poly.uid}
                    paths={poly.paths[0]}
                    options={{
                      fillColor: poly.fillColor || "#4285F4",
                      fillOpacity: poly.fillOpacity || 0.35,
                      strokeColor: onlyInsidePolygons
                        ? poly.fillColor
                        : "#2563eb",
                      strokeWeight: 2,
                      strokeOpacity: 0.9,
                      clickable: true,
                      zIndex: 50,
                    }}
                    onMouseOver={(e) => handlePolygonMouseOver(poly, e)}
                    onMouseMove={handlePolygonMouseMove}
                    onMouseOut={handlePolygonMouseOut}
                  />
                ))}

              {areaEnabled &&
                (areaPolygonsWithColors || []).map((poly) => (
                  <Polygon
                    key={poly.uid}
                    paths={poly.paths[0]}
                    options={{
                      fillColor: poly.fillColor || "#9333ea",
                      fillOpacity: poly.fillOpacity ?? 0.25,
                      strokeColor: poly.fillColor || "#7e22ce",
                      strokeWeight: 2,
                      strokeOpacity: 0.9,
                      clickable: true,
                      zIndex: 60,
                    }}
                    onMouseOver={(e) => handlePolygonMouseOver(poly, e)}
                    onMouseMove={handlePolygonMouseMove}
                    onMouseOut={handlePolygonMouseOut}
                  />
                ))}

              {shouldRenderSiteLayer && (
                <NetworkPlannerMap
                  key={`site-layer-${projectId || "none"}-${siteToggle}`}
                  projectId={projectId}
                  sessionIds={sessionIds}
                  siteToggle={siteToggle}
                  enableSiteToggle={enableSiteToggle}
                  showSiteMarkers={showSiteMarkers}
                  showSiteSectors={showSiteSectors}
                  map={mapRef.current}
                  selectedMetric={selectedMetric}
                  onlyInsidePolygons={siteLayerPolygonFiltering || onlyInsidePolygons}
                  filterPolygons={rawFilteringPolygons}
                  hoveredCellId={hoveredCellId}
                  hoveredLog={hoveredLog}
                  locations={finalDisplayLocations}
                  onDataLoaded={handleSitesLoaded}
                  colorMode={modeMethod}
                  viewport={viewport}
                  mlGridEnabled={mlGridEnabled}
                  mlGridSize={mlGridSize}
                  mlGridAggregation={mlGridAggregation}
                  options={{
                    scale: 0.2,
                    zIndex: 1000,
                    opacity: opacity,
                  }}
                />
              )}

              {/* Handover Layers - New Implementation */}
              <TechHandoverMarkers
                transitions={technologyTransitions}
                show={enableSiteToggle && techHandOver}
                type="technology"
              />

              <TechHandoverMarkers
                transitions={bandTransitions}
                show={enableSiteToggle && bandHandover}
                type="band"
              />

              <TechHandoverMarkers
                transitions={pciTransitions}
                show={enableSiteToggle && pciHandover}
                type="pci"
              />
            </MapWithMultipleCircles>
          )}
        </div>
      </div>

      {hoveredPolygon && hoverPosition && (
        <ZoneTooltip
          polygon={hoveredPolygon}
          position={hoverPosition}
          selectedMetric={selectedMetric}
          selectedCategory={colorBy}
        />
      )}

      {/* Add Site Cursor Indicator */}
      {addSiteMode && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[2000] bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 animate-pulse">
          📍 Click on the map to select a location
          <button
            onClick={() => { setAddSiteMode(false); addSiteModeRef.current = false; }}
            className="ml-2 bg-white/20 hover:bg-white/30 rounded-full px-2 py-0.5 text-xs"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Add Site Dialog */}
      <AddSiteFormDialog
        open={showAddSiteDialog}
        onOpenChange={setShowAddSiteDialog}
        projectId={projectId}
        pickedLatLng={pickedLatLng}
        onSuccess={refetchSites}
        availableBands={combinedBands}
        availablePcis={combinedPcis}
      />
    </div>
  );
};

export default UnifiedMapView;
