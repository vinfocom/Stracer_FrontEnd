import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useJsApiLoader, Polygon } from "@react-google-maps/api";
import { toast } from "react-toastify";

import { mapViewApi, settingApi, areaBreakdownApi } from "../api/apiEndpoints";
import Spinner from "../components/common/Spinner";
import MapWithMultipleCircles from "../components/MapwithMultipleCircle";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";
import UnifiedMapSidebar from "@/components/unifiedMap/UnifiedMapSideBar.jsx";
import SiteMarkers from "@/components/unifiedMap/SiteMarkers";
import NetworkPlannerMap from "@/components/unifiedMap/NetworkPlannerMap";
import { useSiteData } from "@/hooks/useSiteData";
import UnifiedHeader from "@/components/unifiedMap/unifiedMapHeader";
import UnifiedDetailLogs from "@/components/unifiedMap/UnifiedDetailLogs";
import MapLegend from "@/components/map/MapLegend";
import { useNeighborCollisions } from "@/hooks/useNeighborCollisions";
import NeighborHeatmapLayer from "@/components/unifiedMap/NeighborHeatmapLayer";
import SiteLegend from "@/components/unifiedMap/SiteLegend";
import {
  normalizeProviderName,
  normalizeTechName,
  getBandColor,
  getTechnologyColor,
  getProviderColor,
  COLOR_SCHEMES,
} from "@/utils/colorUtils";

import {
  useBestNetworkCalculation,
  DEFAULT_WEIGHTS,
} from "@/hooks/useBestNetworkCalculation";
import LoadingProgress from "@/components/LoadingProgress";

const DEFAULT_CENTER = { lat: 28.64453086, lng: 77.37324242 };

const DEFAULT_THRESHOLDS = {
  rsrp: [],
  rsrq: [],
  sinr: [],
  dl_thpt: [],
  ul_thpt: [],
  mos: [],
  lte_bler: [],
};

const DEFAULT_COVERAGE_FILTERS = {
  rsrp: { enabled: false, threshold: -110 },
  rsrq: { enabled: false, threshold: -15 },
  sinr: { enabled: false, threshold: 0 },
};

const DEFAULT_DATA_FILTERS = {
  providers: [],
  bands: [],
  technologies: [],
};

const METRIC_CONFIG = {
  rsrp: { higherIsBetter: true, unit: "dBm", label: "RSRP", min: -140, max: -44 },
  rsrq: { higherIsBetter: true, unit: "dB", label: "RSRQ", min: -20, max: -3 },
  sinr: { higherIsBetter: true, unit: "dB", label: "SINR", min: -10, max: 30 },
  dl_tpt: { higherIsBetter: true, unit: "Mbps", label: "DL Throughput", min: 0, max: 300 },
  ul_tpt: { higherIsBetter: true, unit: "Mbps", label: "UL Throughput", min: 0, max: 100 },
  mos: { higherIsBetter: true, unit: "", label: "MOS", min: 1, max: 5 },
  lte_bler: { higherIsBetter: false, unit: "%", label: "BLER", min: 0, max: 100 },
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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeMetricValue = (value, metric) => {
  const config = METRIC_CONFIG[metric];
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
  const normalized = normalizeMetricValue(value, metric);
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
      if (value > sorted[sorted.length - 1].max) return sorted[sorted.length - 1].color;
    }

    return "#999999";
  }

  return getColorForMetricValue(value, metric);
};

const getThresholdKey = (metric) => {
  const mapping = {
    dl_tpt: "dl_thpt",
    ul_tpt: "ul_thpt",
    rsrp: "rsrp",
    rsrq: "rsrq",
    sinr: "sinr",
    mos: "mos",
    lte_bler: "lte_bler_json",
    pci: "pci",
  };
  return mapping[metric?.toLowerCase()] || metric;
};

const parseWKTToPolygons = (wkt) => {
  if (!wkt?.trim()) return [];
  try {
    const match = wkt.trim().match(/POLYGON\s*\(\(([^)]+)\)\)/i);
    if (!match) return [];

    const points = match[1].split(",").reduce((acc, coord) => {
      const [lng, lat] = coord.trim().split(/\s+/).map(parseFloat);
      if (!isNaN(lat) && !isNaN(lng)) acc.push({ lat, lng });
      return acc;
    }, []);

    return points.length >= 3 ? [{ paths: [points] }] : [];
  } catch {
    return [];
  }
};

const computeBbox = (points) => {
  if (!points?.length) return null;
  return points.reduce(
    (bbox, pt) => ({
      north: Math.max(bbox.north, pt.lat),
      south: Math.min(bbox.south, pt.lat),
      east: Math.max(bbox.east, pt.lng),
      west: Math.min(bbox.west, pt.lng),
    }),
    { north: -90, south: 90, east: -180, west: 180 }
  );
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
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
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

const cleanThresholds = (thresholds) => {
  if (!thresholds?.length) return [];

  const valid = thresholds
    .filter((t) => {
      const min = parseFloat(t.min);
      const max = parseFloat(t.max);
      return !isNaN(min) && !isNaN(max) && min < max;
    })
    .map((t) => ({
      ...t,
      min: parseFloat(t.min),
      max: parseFloat(t.max),
    }));

  return [...valid].sort((a, b) => a.min - b.min);
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
      const medianValue = sortedValues.length > 0
        ? sortedValues.length % 2
          ? sortedValues[mid]
          : (sortedValues[mid - 1] + sortedValues[mid]) / 2
        : null;

      return {
        name,
        count,
        percentage: ((count / points.length) * 100).toFixed(1),
        avgValue: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
        medianValue,
        minValue: values.length ? Math.min(...values) : null,
        maxValue: values.length ? Math.max(...values) : null,
      };
    })
    .sort((a, b) => b.count - a.count);

  return { stats, dominant: stats[0], total: points.length };
};

const parseLogEntry = (log, sessionId) => {
  if (!log || typeof log !== 'object') {
    return null;
  }

  const lat = parseFloat(log.lat);
  const lng = parseFloat(log.lon);

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

  return {
    id: log.id,
    session_id: sessionId ?? log.session_id,
    lat: lat,
    lng: lng,
    latitude: lat,
    longitude: lng,
    radius: 18,
    timestamp: log.timestamp,
    rsrp: parseNum(log.rsrp),
    rsrq: parseNum(log.rsrq),
    sinr: parseNum(log.sinr),
    dl_tpt: parseNum(log.dl_tpt),
    ul_tpt: parseNum(log.ul_tpt),
    mos: parseNum(log.mos),
    jitter: parseNum(log.jitter),
    latency: parseNum(log.latency),
    packet_loss: parseNum(log.packet_loss),
    provider: normalizeProviderName(log.m_alpha_long || ''),
    technology: normalizeTechName(log.network || ''),
    band: log.band || '',
    pci: log.pci || '',
    nodeb_id: log.nodeb_id || '',
    cell_id: log.cell_id || '',
    num_cells: parseInt(log.num_cells) || null,
    speed: parseNum(log.Speed),
    battery: parseInt(log.battery) || null,
    indoor_outdoor: log.indoor_outdoor || null,
    apps: log.apps || '',
    image_path: log.image_path || '',
  };
};

// const extractLogsFromResponse = (data) => {
//   if (Array.isArray(data)) return data;
//   if (data?.data && Array.isArray(data.data)) return data.data;
//   if (data?.Data && Array.isArray(data.Data)) return data.Data;
//   if (data?.logs && Array.isArray(data.logs)) return data.logs;
//   if (data?.networkLogs && Array.isArray(data.networkLogs)) return data.networkLogs;
//   if (data?.result && Array.isArray(data.result)) return data.result;
//   return [];
// };

const useThresholdSettings = () => {
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const fetchThresholds = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await settingApi.getThresholdSettings({
          signal: abortController.signal,
        });

        if (!isMounted) return;

        const d = res?.Data;
        if (d) {
          setThresholds({
            rsrp: cleanThresholds(JSON.parse(d.rsrp_json || "[]")),
            rsrq: cleanThresholds(JSON.parse(d.rsrq_json || "[]")),
            sinr: cleanThresholds(JSON.parse(d.sinr_json || "[]")),
            dl_thpt: cleanThresholds(JSON.parse(d.dl_thpt_json || "[]")),
            ul_thpt: cleanThresholds(JSON.parse(d.ul_thpt_json || "[]")),
            mos: cleanThresholds(JSON.parse(d.mos_json || "[]")),
            lte_bler: cleanThresholds(JSON.parse(d.lte_bler_json || "[]")),
          });
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchThresholds();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, []);

  return { thresholds, loading, error };
};

const isRequestCancelled = (error) => {
  if (!error) return false;
  if (error.name === 'AbortError') return true;
  if (error.name === 'CanceledError') return true;
  if (error.code === 'ERR_CANCELED') return true;
  if (typeof error.__CANCEL__ !== 'undefined') return true;
  if (error.message?.toLowerCase().includes('cancel')) return true;
  if (error.message?.toLowerCase().includes('abort')) return true;
  return false;
};

const useSampleData = (sessionIds, enabled) => {
  const [locations, setLocations] = useState([]);
  const [appSummary, setAppSummary] = useState({});
  const [inpSummary, setInpSummary] = useState({});
  const [tptVolume, setTptVolume] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, page: 0, totalPages: 0 });
  const [technologyTransitions, setTechnologyTransitions] = useState([]);
  
  const abortControllerRef = useRef(null);
  const isFetchingRef = useRef(false);
  const mountedRef = useRef(true);
  const lastFetchedKeyRef = useRef(null);
  const fetchIdRef = useRef(0);

  const fetchData = useCallback(async (forceRefresh = false) => {
    const fetchKey = sessionIds?.sort().join(',') || '';
    
    if (!forceRefresh && fetchKey === lastFetchedKeyRef.current && locations.length > 0) {
      return;
    }

    if (!sessionIds?.length || !enabled) {
      setLocations([]);
      setAppSummary({});
      setInpSummary({});
      setTptVolume({});
      setProgress({ current: 0, total: 0, page: 0, totalPages: 0 });
      return;
    }

    if (isFetchingRef.current && fetchKey === lastFetchedKeyRef.current) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    const currentFetchId = ++fetchIdRef.current;

    isFetchingRef.current = true;
    setLoading(true);
    setError(null);
    setProgress({ current: 0, total: 0, page: 0, totalPages: 0 });

    const PAGE_SIZE = 20000;
    const allParsedLogs = [];
    let summaryData = { app: {}, io: {}, tpt: null };

    const startTime = performance.now();

    try {
      let currentPage = 1;
      let totalCount = 0;
      let totalPages = 1;
      let hasMoreData = true;

      while (hasMoreData) {
        if (fetchIdRef.current !== currentFetchId || !mountedRef.current) {
          return;
        }

        let response;
        try {
          response = await mapViewApi.getNetworkLog({
            session_ids: sessionIds,
            page: currentPage,
            limit: PAGE_SIZE,
            signal: abortControllerRef.current.signal,
          });
        } catch (fetchErr) {
          if (isRequestCancelled(fetchErr)) {
            return;
          }
          throw fetchErr;
        }

        if (fetchIdRef.current !== currentFetchId || !mountedRef.current) {
          return;
        }

        let apiBody;
        let logsArray;

        if (response?.data && typeof response.data === 'object' && !Array.isArray(response.data) && response.data.data) {
          apiBody = response.data;
          logsArray = apiBody.data || [];
        } else if (response?.data && Array.isArray(response.data)) {
          apiBody = response;
          logsArray = response.data;
        } else if (Array.isArray(response)) {
          apiBody = { data: response };
          logsArray = response;
        } else {
          apiBody = response?.data || response || {};
          logsArray = apiBody?.data || (Array.isArray(apiBody) ? apiBody : []);
        }

        if (currentPage === 1) {
          totalCount = apiBody?.total_count || apiBody?.totalCount || apiBody?.TotalCount || 0;
          
          if (totalCount === 0 && logsArray.length > 0) {
            totalCount = logsArray.length;
          }
          
          totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

          if (apiBody?.app_summary) {
            summaryData.app = apiBody.app_summary;
          }
          if (apiBody?.io_summary) {
            summaryData.io = apiBody.io_summary;
          }
          if (apiBody?.tpt_volume) {
            summaryData.tpt = apiBody.tpt_volume;
          }
        }

        if (!Array.isArray(logsArray)) {
          break;
        }

        let parsedCount = 0;

        logsArray.forEach((log) => {
          const parsed = parseLogEntry(log, log.session_id);
          if (parsed) {
            allParsedLogs.push(parsed);
            parsedCount++;
          }
        });

        if (mountedRef.current && fetchIdRef.current === currentFetchId) {
          setProgress({
            current: allParsedLogs.length,
            total: totalCount,
            page: currentPage,
            totalPages: totalPages,
          });
        }

        if (currentPage >= totalPages) {
          hasMoreData = false;
        } else if (logsArray.length < PAGE_SIZE) {
          hasMoreData = false;
        } else {
          currentPage++;
        }

        if (currentPage > 100) {
          hasMoreData = false;
        }

        if (hasMoreData) {
          await delay(100);
        }
      }

      if (fetchIdRef.current !== currentFetchId || !mountedRef.current) {
        return;
      }

      const fetchTime = ((performance.now() - startTime) / 1000).toFixed(2);

      setLocations(allParsedLogs);
      setAppSummary(summaryData.app);
      setInpSummary(summaryData.io);
      setTptVolume(summaryData.tpt);
      lastFetchedKeyRef.current = fetchKey;

      if (allParsedLogs.length > 0) {
        const pageInfo = totalPages > 1 ? ` (${totalPages} pages)` : '';
        toast.success(`${allParsedLogs.length.toLocaleString()} points loaded in ${fetchTime}s${pageInfo}`);
      } else {
        toast.warn('No valid log data found');
      }

    } catch (err) {
      if (isRequestCancelled(err)) {
        return;
      }

      if (mountedRef.current && fetchIdRef.current === currentFetchId) {
        setError(err.message);
        toast.error(`Error: ${err.message}`);

        if (allParsedLogs.length > 0) {
          setLocations(allParsedLogs);
          setAppSummary(summaryData.app);
          setInpSummary(summaryData.io);
          setTptVolume(summaryData.tpt);
          toast.info(`Loaded ${allParsedLogs.length.toLocaleString()} points before error`);
        }
      }
    } finally {
      if (fetchIdRef.current === currentFetchId) {
        isFetchingRef.current = false;
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    }
  }, [sessionIds, enabled]);

  useEffect(() => {
    if (!locations || locations.length < 2) {
      setTechnologyTransitions([]);
      return;
    }

    const transitions = [];
    let prevTech = normalizeTechName(locations[0].technology);

    for (let i = 1; i < locations.length; i++) {
      const currTech = normalizeTechName(locations[i].technology);
      if (currTech && prevTech && currTech !== prevTech) {
        transitions.push({
          from: prevTech,
          to: currTech,
          atIndex: i,
          lat: locations[i].lat,
          lng: locations[i].lng,
          timestamp: locations[i].timestamp,
          session_id: locations[i].session_id,
        });
      }
      prevTech = currTech;
    }

    setTechnologyTransitions(transitions);
  }, [locations]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchData();
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [fetchData]);

  return {
    locations,
    appSummary,
    inpSummary,
    tptVolume,
    loading,
    error,
    progress,
    refetch: useCallback(() => {
      lastFetchedKeyRef.current = null;
      fetchData(true);
    }, [fetchData]),
    technologyTransitions,
  };
};

const usePredictionData = (projectId, selectedMetric, enabled) => {
  const [locations, setLocations] = useState([]);
  const [colorSettings, setColorSettings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!projectId || !enabled) {
      setLocations([]);
      setColorSettings([]);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const res = await mapViewApi.getPredictionLog({
        projectId: Number(projectId),
        metric: selectedMetric.toUpperCase(),
        signal: abortControllerRef.current.signal,
      });

      if (res?.Status === 1 && res?.Data) {
        const { dataList = [], colorSetting = [] } = res.Data;

        const formatted = dataList
          .map((pt) => {
            const lat = parseFloat(pt.lat);
            const lng = parseFloat(pt.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return {
              lat,
              lng,
              latitude: lat,
              longitude: lng,
              [selectedMetric]: pt.prm,
              isPrediction: true,
            };
          })
          .filter(Boolean);

        setLocations(formatted);
        setColorSettings(colorSetting);
        toast.success(`${formatted.length} prediction points`);
      } else {
        toast.error(res?.Message || "No prediction data");
        setLocations([]);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      toast.error(err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedMetric, enabled]);

  useEffect(() => {
    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  return {
    locations,
    colorSettings,
    loading,
    error,
    refetch: fetchData,
  };
};

const useSessionNeighbors = (sessionIds, enabled) => {
  const [neighborData, setNeighborData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  
  const abortControllerRef = useRef(null);
  const mountedRef = useRef(true);
  const lastFetchKeyRef = useRef(null);
  const isFetchingRef = useRef(false);

  // Stable fetch function
  const fetchData = useCallback(async (force = false) => {
    // Create a stable key for this fetch
    const fetchKey = sessionIds?.sort().join(',') || '';
    
    console.log('[useSessionNeighbors] fetchData called:', {
      sessionIds,
      enabled,
      sessionIdsLength: sessionIds?.length || 0,
      fetchKey,
      lastFetchKey: lastFetchKeyRef.current,
      isFetching: isFetchingRef.current,
    });

    // Skip if conditions not met
    if (!sessionIds?.length || !enabled) {
      console.log('[useSessionNeighbors] Skipping fetch - conditions not met');
      if (mountedRef.current) {
        setNeighborData([]);
        setStats(null);
        setError(null);
      }
      return;
    }

    // Skip if already fetched with same key (unless forced)
    if (!force && fetchKey === lastFetchKeyRef.current && neighborData.length > 0) {
      console.log('[useSessionNeighbors] Skipping - already have data for this key');
      return;
    }

    // Skip if currently fetching the same data
    if (isFetchingRef.current && fetchKey === lastFetchKeyRef.current) {
      console.log('[useSessionNeighbors] Skipping - already fetching this data');
      return;
    }

    // Abort any previous request
    if (abortControllerRef.current) {
      console.log('[useSessionNeighbors] Aborting previous request');
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();
    isFetchingRef.current = true;

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    console.log('[useSessionNeighbors] Starting API call with sessionIds:', sessionIds);

    try {
      const res = await mapViewApi.getSessionNeighbour({
        sessionIds: sessionIds,
        signal: abortControllerRef.current.signal,
      });

      // Check if component is still mounted and this is still the current request
      if (!mountedRef.current) {
        console.log('[useSessionNeighbors] Component unmounted, ignoring response');
        return;
      }

      console.log('[useSessionNeighbors] API Response received:', {
        status: res?.Status,
        message: res?.Message,
        dataLength: res?.Data?.length || 0,
        sessionCount: res?.SessionCount,
        recordCount: res?.RecordCount,
        cached: res?.Cached,
      });

      if (res?.Status === 1 && res?.Data) {
        const data = res.Data;
        
        console.log('[useSessionNeighbors] Raw data sample (first 3 items):', data.slice(0, 3));

        const formattedData = data
          .map((item, index) => {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon);

            if (!isFinite(lat) || !isFinite(lng)) {
              return null;
            }

            return {
              id: item.id,
              sessionId: item.session_id,
              timestamp: item.timestamp,
              lat,
              lng,
              latitude: lat,
              longitude: lng,
              indoorOutdoor: item.indoor_outdoor,

              // Primary cell info
              primaryNetwork: item.primary_network,
              primaryBand: item.primary_band,
              primaryRsrp: parseFloat(item.primary_rsrp) || null,
              primaryRsrq: parseFloat(item.primary_rsrq) || null,
              primarySinr: parseFloat(item.primary_sinr) || null,
              primaryPci: item.primary_pci,

              // Provider and network
              provider: normalizeProviderName(item.provider || ""),
              networkType: normalizeTechName(item.primary_network),

              // Quality metrics
              mos: parseFloat(item.mos) || null,
              dlTpt: parseFloat(item.dl_tpt) || null,
              ulTpt: parseFloat(item.ul_tpt) || null,

              // Neighbour cell info
              neighbourBand: item.neighbour_band,
              neighbourRsrp: parseFloat(item.neighbour_rsrp) || null,
              neighbourRsrq: parseFloat(item.neighbour_rsrq) || null,
              neighbourPci: item.neighbour_pci,

              // Legacy compatibility
              rsrp: parseFloat(item.primary_rsrp) || null,
              rsrq: parseFloat(item.primary_rsrq) || null,
              sinr: parseFloat(item.primary_sinr) || null,
            };
          })
          .filter(Boolean);

        console.log('[useSessionNeighbors] Formatted data:', {
          totalRaw: data.length,
          totalFormatted: formattedData.length,
        });

        // Build stats
        const statsObj = {
          sessionCount: res.SessionCount || 0,
          recordCount: res.RecordCount || formattedData.length,
          cached: res.Cached || false,
          byProvider: {},
          byPrimaryBand: {},
          byNeighbourBand: {},
          byNetwork: {},
        };

        formattedData.forEach((item) => {
          if (item.provider) {
            if (!statsObj.byProvider[item.provider]) {
              statsObj.byProvider[item.provider] = { count: 0, avgRsrp: 0, values: [] };
            }
            statsObj.byProvider[item.provider].count++;
            if (item.primaryRsrp) statsObj.byProvider[item.provider].values.push(item.primaryRsrp);
          }

          if (item.primaryBand) {
            if (!statsObj.byPrimaryBand[item.primaryBand]) {
              statsObj.byPrimaryBand[item.primaryBand] = { count: 0 };
            }
            statsObj.byPrimaryBand[item.primaryBand].count++;
          }

          if (item.neighbourBand) {
            if (!statsObj.byNeighbourBand[item.neighbourBand]) {
              statsObj.byNeighbourBand[item.neighbourBand] = { count: 0 };
            }
            statsObj.byNeighbourBand[item.neighbourBand].count++;
          }

          if (item.primaryNetwork) {
            if (!statsObj.byNetwork[item.primaryNetwork]) {
              statsObj.byNetwork[item.primaryNetwork] = { count: 0 };
            }
            statsObj.byNetwork[item.primaryNetwork].count++;
          }
        });

        Object.keys(statsObj.byProvider).forEach((provider) => {
          const values = statsObj.byProvider[provider].values;
          if (values.length > 0) {
            statsObj.byProvider[provider].avgRsrp =
              values.reduce((a, b) => a + b, 0) / values.length;
          }
          delete statsObj.byProvider[provider].values;
        });

        // Update state only if mounted
        if (mountedRef.current) {
          setNeighborData(formattedData);
          setStats(statsObj);
          lastFetchKeyRef.current = fetchKey;
          console.log('[useSessionNeighbors] ✅ Data successfully loaded:', formattedData.length);
          toast.success(`${formattedData.length} neighbor records loaded`);
        }

      } else {
        console.warn('[useSessionNeighbors] API returned no data:', res?.Message);
        if (mountedRef.current) {
          toast.warn(res?.Message || "No neighbor data found");
          setNeighborData([]);
          setStats(null);
        }
      }
    } catch (err) {
      // Check if this was an abort/cancel
      if (isRequestCancelled(err)) {
        console.log('[useSessionNeighbors] Request was cancelled (expected during cleanup)');
        return; // Don't update state or show error for cancelled requests
      }
      
      console.error('[useSessionNeighbors] ❌ API Error:', err.message);
      
      if (mountedRef.current) {
        setError(err.message);
        toast.error(`Failed to fetch neighbor data: ${err.message}`);
      }
    } finally {
      isFetchingRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [sessionIds, enabled]); // Remove neighborData from dependencies

  // Handle mount/unmount
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      console.log('[useSessionNeighbors] Component unmounting');
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Fetch data when dependencies change
  useEffect(() => {
    console.log('[useSessionNeighbors] useEffect triggered:', { sessionIds, enabled });
    
    // Add a small delay to prevent rapid re-fetches
    const timeoutId = setTimeout(() => {
      fetchData();
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      // Don't abort here - let the request complete
    };
  }, [sessionIds?.join(','), enabled]); // Use stable dependency

  // Manual refetch function
  const refetch = useCallback(() => {
    console.log('[useSessionNeighbors] Manual refetch triggered');
    lastFetchKeyRef.current = null; // Reset to force refetch
    fetchData(true);
  }, [fetchData]);

  return {
    neighborData,
    stats,
    loading,
    error,
    refetch,
  };
};

const useProjectPolygons = (projectId, showPolygons, polygonSource) => {
  const [polygons, setPolygons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!projectId || !showPolygons) {
      setPolygons([]);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const res = await mapViewApi.getProjectPolygonsV2(projectId, polygonSource, {
        signal: abortControllerRef.current.signal,
      });

      const items = res?.Data || res?.data?.Data || (Array.isArray(res) ? res : []);

      const parsed = items.flatMap((item) => {
        const wkt = item.Wkt || item.wkt;
        if (!wkt) return [];
        return parseWKTToPolygons(wkt).map((p, k) => ({
          id: item.Id || item.id,
          name: item.Name || item.name || `Polygon ${item.Id}`,
          source: polygonSource,
          uid: `${polygonSource}-${item.Id}-${k}`,
          paths: p.paths,
          bbox: computeBbox(p.paths[0]),
        }));
      });

      setPolygons(parsed);
      if (parsed.length) toast.success(`${parsed.length} polygon(s) loaded`);
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setPolygons([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, showPolygons, polygonSource]);

  useEffect(() => {
    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  return { polygons, loading, error, refetch: fetchData };
};

const useAreaPolygons = (projectId, areaEnabled) => {
  const [areaData, setAreaData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!projectId || !areaEnabled) {
      setAreaData([]);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const res = await areaBreakdownApi.getAreaPolygons(projectId, {
        signal: abortControllerRef.current.signal,
      });

      let zones = [];
      if (res?.data?.ai_zones?.length > 0) zones = res.data.ai_zones;
      else if (Array.isArray(res?.data)) zones = res.data;
      else if (Array.isArray(res)) zones = res;

      if (!zones?.length) {
        toast.warning("No area zones found");
        setAreaData([]);
        return;
      }

      const parsed = zones
        .map((zone, index) => {
          const geometry = zone.geometry || zone.Geometry || zone.wkt || zone.Wkt;
          if (!geometry) return null;

          const poly = parseWKTToPolygons(geometry)[0];
          if (!poly?.paths?.[0]?.length) return null;

          return {
            id: zone.id || zone.Id || index,
            blockId: zone.block_id || zone.blockId,
            name: zone.project_name || zone.name || `Block ${zone.block_id || index}`,
            source: "area",
            uid: `area-${zone.id || zone.Id || index}`,
            paths: poly.paths,
            bbox: computeBbox(poly.paths[0]),
          };
        })
        .filter(Boolean);

      setAreaData(parsed);
      if (parsed.length > 0) toast.success(`${parsed.length} area zone(s) loaded`);
    } catch (err) {
      if (err.name === "AbortError") return;
      toast.error(`Failed to load area zones: ${err.message}`);
      setError(err.message);
      setAreaData([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, areaEnabled]);

  useEffect(() => {
    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  return { areaData, loading, error, refetch: fetchData };
};

const ZoneTooltip = React.memo(({ polygon, position, selectedMetric, selectedCategory }) => {
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

  const config = METRIC_CONFIG[selectedMetric] || { unit: "", higherIsBetter: true };
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
        <div className="font-semibold text-gray-800 mb-1">{name || "Zone"}</div>
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
      <div className="px-4 py-3" style={{ backgroundColor: fillColor || "#3B82F6" }}>
        <span className="text-white font-semibold text-sm">
          {name} - {pointCount} samples
        </span>
      </div>

      <div className="p-4 space-y-3">
        {selectedCategory === "provider" && bestProvider && (
          <div className="space-y-1">
            <div className="text-xs font-semibold text-gray-500 uppercase">Best Provider</div>
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
            <div className="text-xs font-semibold text-gray-500 uppercase">Best Band</div>
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
            <div className="text-xs font-semibold text-gray-500 uppercase">Best Technology</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: getTechnologyColor(bestTechnology) }}
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

        {categoryStats && selectedCategory && categoryStats[selectedCategory]?.stats && (
          <div className="pt-2 border-t">
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
              All {selectedCategory}s
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {categoryStats[selectedCategory].stats.slice(0, 5).map((stat) => (
                <div key={stat.name} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{stat.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{stat.count} pts</span>
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
});

ZoneTooltip.displayName = "ZoneTooltip";

const BestNetworkLegend = React.memo(({ stats, providerColors, enabled }) => {
  if (!enabled || !stats || Object.keys(stats).length === 0) return null;

  const sortedProviders = Object.entries(stats).sort(
    (a, b) => b[1].locationsWon - a[1].locationsWon
  );

  const totalZones = sortedProviders.reduce((sum, [, d]) => sum + d.locationsWon, 0);

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
                style={{ backgroundColor: data.color || providerColors?.[provider] || getProviderColor(provider) }}
              />
              <span className="text-sm font-medium text-gray-700">{provider}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{data.locationsWon}/{totalZones}</span>
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

const UnifiedMapView = () => {
  const [searchParams] = useSearchParams();

  const [isSideOpen, setIsSideOpen] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState("rsrp");
  const [basemapStyle, setBasemapStyle] = useState("roadmap");
  const [viewport, setViewport] = useState(null);
  const [colorBy, setColorBy] = useState(null);

  const [enableDataToggle, setEnableDataToggle] = useState(true);
  const [dataToggle, setDataToggle] = useState("sample");
  const [enableSiteToggle, setEnableSiteToggle] = useState(false);
  const [siteToggle, setSiteToggle] = useState("NoML");
  const [showSiteMarkers, setShowSiteMarkers] = useState(true);
  const [showSiteSectors, setShowSiteSectors] = useState(true);
  const [showNeighbors, setShowNeighbors] = useState(false);

  const [showPolygons, setShowPolygons] = useState(false);
  const [polygonSource, setPolygonSource] = useState("map");
  const [onlyInsidePolygons, setOnlyInsidePolygons] = useState(false);
  const [areaEnabled, setAreaEnabled] = useState(false);

  const [hoveredPolygon, setHoveredPolygon] = useState(null);
  const [hoverPosition, setHoverPosition] = useState(null);
  const [mapVisibleLocations, setMapVisibleLocations] = useState([]);

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

  const [coverageHoleFilters, setCoverageHoleFilters] = useState(DEFAULT_COVERAGE_FILTERS);
  const [dataFilters, setDataFilters] = useState(DEFAULT_DATA_FILTERS);
  const [enableGrid, setEnableGrid] = useState(false);
  const [gridSizeMeters, setGridSizeMeters] = useState(20);
  const [durationTime, setDurationTime] = useState([]);
  const [techHandOver, setTechHandOver] = useState(false);
  const [indoor, setIndoor] = useState([]);
  const [outdoor, setOutdoor] = useState([]);
  const [distance, setDistance] = useState(null);

  const [logArea, setLogArea] = useState(null);

  const mapRef = useRef(null);
  const viewportRef = useRef(null);

  const projectId = useMemo(() => {
    const param = searchParams.get("project_id") ?? searchParams.get("project");
    return param ? Number(param) : null;
  }, [searchParams]);

  const sessionIds = useMemo(() => {
    const param = searchParams.get("sessionId") ?? searchParams.get("session");
    if (!param) return [];
    return param.split(",").map((s) => s.trim()).filter(Boolean);
  }, [searchParams]);

  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  const { thresholds: baseThresholds } = useThresholdSettings();

  const {
    locations: sampleLocations,
    appSummary,
    inpSummary,
    tptVolume,
    loading: sampleLoading,
    progress: sampleProgress,
    error: sampleError,
    refetch: refetchSample,
    technologyTransitions: technologyTransitions,
  } = useSampleData(
    sessionIds,
    enableDataToggle && dataToggle === "sample"
  );

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
    (enableSiteToggle && siteToggle === "sites-prediction")
  );

  const {
  neighborData: sessionNeighborData,
  stats: sessionNeighborStats,
  loading: sessionNeighborLoading,
  error: sessionNeighborError,
  refetch: refetchSessionNeighbors,
} = useSessionNeighbors(sessionIds, showSessionNeighbors);



useEffect(() => {
  console.log('[UnifiedMapView] Session Neighbor Data Updated:', {
    showSessionNeighbors,
    sessionNeighborLoading,
    sessionNeighborError,
    dataLength: sessionNeighborData?.length || 0,
    statsAvailable: !!sessionNeighborStats,
    sample: sessionNeighborData?.slice(0, 2),
  });
}, [sessionNeighborData, sessionNeighborStats, sessionNeighborLoading, sessionNeighborError, showSessionNeighbors]);
  const {
    polygons,
    loading: polygonLoading,
    refetch: refetchPolygons,
  } = useProjectPolygons(projectId, showPolygons, polygonSource);

  const {
    areaData,
    loading: areaLoading,
    refetch: refetchAreaPolygons,
  } = useAreaPolygons(projectId, areaEnabled);

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

  useEffect(() => {
    const timeData = async () => {
      if (!sessionIds?.length) return;
      try {
        const res = await mapViewApi.getDuration({ sessionIds: sessionIds.join(",") });
        const dataArray = res?.data?.data || res?.data || [];
        if (Array.isArray(dataArray)) {
          setDurationTime(
            dataArray.map((item) => ({
              provider: normalizeProviderName(item.provider || ""),
              networkType: normalizeTechName(item.network || ""),
              totaltime: String(item.timeReadable || 0),
            }))
          );
        }
      } catch (err) {
      }
    };
    timeData();
  }, [sessionIds]);

  useEffect(() => {
    const neighbordata = async () => {
      if (!sessionIds?.length) return;
      try {
        const res = await mapViewApi.getDistanceSession({ sessionIds: sessionIds.join(",") });
        setDistance(res?.TotalDistanceKm || null);
      } catch (error) {
      }
    }
    neighbordata();
  }, [sessionIds]);

  useEffect(() => {
    const ioAnalysis = async () => {
      try {
        const res = await mapViewApi.getIOAnalysis({ sessionIds: sessionIds.join(",") });
        setIndoor(res?.Indoor);
        setOutdoor(res?.Outdoor);
      } catch (error) {
      }
    }

    ioAnalysis();
  }, [sessionIds]);

  const locations = useMemo(() => {
    if (!enableDataToggle && !enableSiteToggle) return [];

    let mainLogs = [];

    if (enableDataToggle) {
      mainLogs = dataToggle === "sample" ? (sampleLocations || []) : (predictionLocations || []);
    } else if (enableSiteToggle && siteToggle === "sites-prediction") {
      mainLogs = predictionLocations || [];
    }

    // if (showSessionNeighbors && sessionNeighborData?.length) {
    //   const neighbors = sessionNeighborData.map(n => ({
    //     ...n,
    //     technology: n.networkType || 'Unknown',
    //     band: n.neighborBand || '',
    //     isNeighbour: true,
    //     source: 'neighbour'
    //   }));
    //   return [...mainLogs, ...neighbors];
    // }

    return mainLogs;
  }, [enableDataToggle, enableSiteToggle, dataToggle, siteToggle, sampleLocations, predictionLocations, showSessionNeighbors, sessionNeighborData]);

  const isLoading = sampleLoading || predictionLoading || siteLoading ||
    neighborLoading || polygonLoading || areaLoading || sessionNeighborLoading;

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
    areaData
  );

  const availableFilterOptions = useMemo(() => {
    const providers = new Set();
    const bands = new Set();
    const technologies = new Set();

    (locations || []).forEach((loc) => {
      if (loc.provider) providers.add(loc.provider);
      if (loc.band) bands.add(loc.band);
      if (loc.technology) technologies.add(normalizeTechName(loc.technology));
    });

    return {
      providers: [...providers].sort(),
      bands: [...bands].sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0)),
      technologies: [...technologies].sort(),
    };
  }, [locations]);

  const filteredLocations = useMemo(() => {
    let result = [...(locations || [])];

    const activeCoverageFilters = Object.entries(coverageHoleFilters).filter(
      ([, config]) => config.enabled
    );

    if (activeCoverageFilters.length > 0) {
      result = result.filter((loc) =>
        activeCoverageFilters.every(([metric, { threshold }]) => {
          const val = parseFloat(loc[metric]);
          return !isNaN(val) && val < threshold;
        })
      );
    }

    const { providers, bands, technologies } = dataFilters;
    if (providers?.length) result = result.filter((l) => providers.includes(l.provider));
    if (bands?.length) result = result.filter((l) => bands.includes(l.band));
    if (technologies?.length) result = result.filter((l) => technologies.includes(l.technology));

    return result;
  }, [locations, coverageHoleFilters, dataFilters]);

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
        return { ...poly, fillColor: "#ccc", fillOpacity: 0.3, pointCount: pointsInside.length };
      }

      const median = calculateMedian(values);
      const fillColor = getColorFromValueOrMetric(median, currentThresholds, selectedMetric);

      return { ...poly, fillColor, fillOpacity: 0.7, pointCount: pointsInside.length, medianValue: median };
    });
  }, [showPolygons, polygons, onlyInsidePolygons, locations, selectedMetric, effectiveThresholds]);

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
    const useCategorical = colorBy && ["provider", "band", "technology"].includes(colorBy);
    const metricConfig = METRIC_CONFIG[selectedMetric] || { higherIsBetter: true };

    return areaData.map((poly) => {
      const pointsInside = filteredLocations.filter((pt) => isPointInPolygon(pt, poly));

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

      const providerStats = calculateCategoryStats(pointsInside, "provider", selectedMetric);
      const bandStats = calculateCategoryStats(pointsInside, "band", selectedMetric);
      const technologyStats = calculateCategoryStats(pointsInside, "technology", selectedMetric);

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
            const isBetter = metricConfig.higherIsBetter ? median > bestValue : median < bestValue;
            if (isBetter) {
              bestValue = median;
              best = stat.name;
            }
          }
        });

        return { best, value: bestValue === -Infinity || bestValue === Infinity ? null : bestValue };
      };

      const { best: bestProvider, value: bestProviderValue } = findBestByMetric(providerStats);
      const { best: bestBand, value: bestBandValue } = findBestByMetric(bandStats);
      const { best: bestTechnology, value: bestTechnologyValue } = findBestByMetric(technologyStats);

      let fillColor;

      if (useCategorical) {
        switch (colorBy) {
          case "provider":
            fillColor = bestProvider ? getProviderColor(bestProvider) : (providerStats?.dominant ? getProviderColor(providerStats.dominant.name) : "#ccc");
            break;
          case "band":
            fillColor = bestBand ? getBandColor(bestBand) : (bandStats?.dominant ? getBandColor(bandStats.dominant.name) : "#ccc");
            break;
          case "technology":
            fillColor = bestTechnology ? getTechnologyColor(bestTechnology) : (technologyStats?.dominant ? getTechnologyColor(technologyStats.dominant.name) : "#ccc");
            break;
          default:
            fillColor = "#ccc";
        }
      } else {
        fillColor = medianValue !== null
          ? getColorFromValueOrMetric(medianValue, currentThresholds, selectedMetric)
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
        categoryStats: { provider: providerStats, band: bandStats, technology: technologyStats },
      };
    });
  }, [areaEnabled, areaData, filteredLocations, selectedMetric, baseThresholds, colorBy]);

  const allBestNetworkPolygons = useMemo(() => {
    if (bestNetworkEnabled && bestNetworkPolygons?.length > 0) {
      return bestNetworkPolygons;
    }
    return [];
  }, [bestNetworkEnabled, bestNetworkPolygons]);

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
      { lat: 0, lng: 0 }
    );
    return { lat: sum.lat / locations.length, lng: sum.lng / locations.length };
  }, [locations]);

  const showDataCircles = enableDataToggle || (enableSiteToggle && siteToggle === "sites-prediction");
  const shouldShowLegend = enableDataToggle || (enableSiteToggle && siteToggle === "sites-prediction");

  const locationsToDisplay = useMemo(() => {
    if (onlyInsidePolygons) return [];
    if (!showDataCircles) return [];

    const hasCoverageFilters = Object.values(coverageHoleFilters).some((f) => f.enabled);
    const hasDataFilters = (dataFilters.providers?.length || 0) > 0 ||
      (dataFilters.bands?.length || 0) > 0 ||
      (dataFilters.technologies?.length || 0) > 0;

    if (hasCoverageFilters || hasDataFilters) {
      return filteredLocations;
    }

    return locations || [];
  }, [showDataCircles, coverageHoleFilters, dataFilters, filteredLocations, locations, onlyInsidePolygons]);

  const mapOptions = useMemo(() => ({
    mapTypeId: basemapStyle,
  }), [basemapStyle]);

  const updateViewportRef = useCallback((newViewport) => {
    viewportRef.current = newViewport;
    setViewport(newViewport);
  }, []);

  const debouncedSetViewport = useMemo(
    () => debounce(updateViewportRef, 300),
    [updateViewportRef]
  );

  const handleMapLoad = useCallback((map) => {
    mapRef.current = map;

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
  }, [debouncedSetViewport]);

  const handleBasemapChange = useCallback((newStyle) => {
    setBasemapStyle(newStyle);

    if (mapRef.current) {
      mapRef.current.setMapTypeId(newStyle);
    }
  }, []);

  const handleUIChange = useCallback((newUI) => {
    if (newUI.basemapStyle && newUI.basemapStyle !== basemapStyle) {
      handleBasemapChange(newUI.basemapStyle);
    }
  }, [basemapStyle, handleBasemapChange]);

  const reloadData = useCallback(() => {
    if (enableSiteToggle) refetchSites();
    if (enableDataToggle && dataToggle === "sample") refetchSample();
    if ((enableDataToggle && dataToggle === "prediction") ||
      (enableSiteToggle && siteToggle === "sites-prediction")) {
      refetchPrediction();
    }
    if (showPolygons) refetchPolygons();
    if (areaEnabled) refetchAreaPolygons();
    if (showNeighbors) refetchNeighbors();
    if (showSessionNeighbors) refetchSessionNeighbors();
  }, [
    enableDataToggle, enableSiteToggle, dataToggle, siteToggle,
    showPolygons, areaEnabled, showNeighbors, showSessionNeighbors,
    refetchSample, refetchPrediction, refetchPolygons,
    refetchAreaPolygons, refetchSites, refetchNeighbors, refetchSessionNeighbors
  ]);

  const filteredNeighbors = useMemo(() => {
  // 1. If no data, return empty
  if (!sessionNeighborData?.length) return [];

  // 2. If filtering is disabled, return all data
  // Note: Adjust 'onlyInsidePolygons' to whatever flag triggers your filter
  if (!onlyInsidePolygons || !showPolygons || !polygons?.length) {
    return sessionNeighborData;
  }

  // 3. Filter points that are inside at least one visible polygon
  return sessionNeighborData.filter((point) => {
    // Check if point exists inside ANY of the loaded polygons
    return polygons.some((poly) => isPointInPolygon(point, poly));
  });
}, [sessionNeighborData, onlyInsidePolygons, showPolygons, polygons]);

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

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Map loading error: {loadError.message}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-800">
      <UnifiedHeader
        onToggleControls={() => setIsSideOpen(!isSideOpen)}
        onLeftToggle={() => setShowAnalytics(!showAnalytics)}
        isControlsOpen={isSideOpen}
        showAnalytics={showAnalytics}
        projectId={projectId}
        sessionIds={sessionIds}
        isOpacityCollapsed={isOpacityCollapsed}
        setIsOpacityCollapsed={setIsOpacityCollapsed}
        opacity={opacity}
        setOpacity={setOpacity}
      />

      {showAnalytics && (
        <UnifiedDetailLogs
          locations={filteredLocations}
          totalLocations={locations?.length || 0}
          filteredCount={filteredLocations?.length || 0}
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
          dataFilters={dataFilters}
          bestNetworkEnabled={bestNetworkEnabled}
          bestNetworkStats={bestNetworkStats}
          onClose={() => setShowAnalytics(false)}
        />
      )}

      <UnifiedMapSidebar
        open={isSideOpen}
        onOpenChange={setIsSideOpen}
        enableDataToggle={enableDataToggle}
        setEnableDataToggle={setEnableDataToggle}
        dataToggle={dataToggle}
        setTechHandOver={setTechHandOver}
        techHandOver={techHandOver}
        technologyTransitions={technologyTransitions}
        setDataToggle={setDataToggle}
        enableSiteToggle={enableSiteToggle}
        setEnableSiteToggle={setEnableSiteToggle}
        siteToggle={siteToggle}
        showSessionNeighbors={showSessionNeighbors}
        setShowSessionNeighbors={setShowSessionNeighbors}
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
        ui={{ basemapStyle }}
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
        bestNetworkEnabled={bestNetworkEnabled}
        setBestNetworkEnabled={setBestNetworkEnabled}
        bestNetworkWeights={bestNetworkWeights}
        setBestNetworkWeights={setBestNetworkWeights}
        bestNetworkOptions={bestNetworkOptions}
        setBestNetworkOptions={setBestNetworkOptions}
        bestNetworkStats={bestNetworkStats}
      />

      <div className="flex-grow relative overflow-hidden">
        <LoadingProgress
          progress={sampleProgress}
          loading={sampleLoading && enableDataToggle && dataToggle === "sample"}
        />

        {shouldShowLegend && !bestNetworkEnabled && !isLoading && (
          <MapLegend
            thresholds={effectiveThresholds}
            selectedMetric={selectedMetric}
            colorBy={colorBy}
            showOperators={colorBy === "provider"}
            showBands={colorBy === "band"}
            showTechnologies={colorBy === "technology"}
            showSignalQuality={!colorBy || colorBy === "metric"}
            availableFilterOptions={availableFilterOptions}
            logs={mapVisibleLocations}
          />
        )}

        <SiteLegend enabled={enableSiteToggle && showSiteSectors} />

        <BestNetworkLegend
          stats={bestNetworkStats}
          providerColors={bestNetworkProviderColors}
          enabled={bestNetworkEnabled}
        />

        <div className="relative h-full w-full">
          {isLoading && (locations?.length || 0) === 0 && (siteData?.length || 0) === 0 ? (
            <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-700">
              <Spinner />
            </div>
          ) : error || siteError ? (
            <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-700">
              <div className="text-center space-y-2">
                {error && <p className="text-red-500">Data Error: {error}</p>}
                {siteError && <p className="text-red-500">Site Error: {siteError.message}</p>}
              </div>
            </div>
          ) : (
            // In UnifiedMapView.jsx - Replace the NeighborHeatmapLayer usage

// Remove the NeighborHeatmapLayer from children and pass data as props:
<MapWithMultipleCircles
  isLoaded={isLoaded}
  loadError={loadError}
  locations={locationsToDisplay}
  thresholds={effectiveThresholds}
  selectedMetric={selectedMetric}
  technologyTransitions={technologyTransitions}
  techHandOver={techHandOver}
  colorBy={colorBy}
  activeMarkerIndex={null}
  onMarkerClick={() => {}}
  options={mapOptions}
  center={mapCenter}
  defaultZoom={13}
  fitToLocations={(locationsToDisplay?.length || 0) > 0}
  onLoad={handleMapLoad}
  pointRadius={5}
  projectId={projectId}
  polygonSource={polygonSource}
  enablePolygonFilter={true}
  showPolygonBoundary={true}
  enableGrid={enableGrid}
  gridSizeMeters={gridSizeMeters}
  areaEnabled={areaEnabled}
  onFilteredLocationsChange={setMapVisibleLocations}
  opacity={opacity}
  
  // ========= NEW: Neighbor Props =========
  neighborData={sessionNeighborData}
  showNeighbors={showSessionNeighbors}
  neighborSquareSize={25}  // Size in meters
  neighborOpacity={0.7}
  onNeighborClick={(neighbor) => {
    console.log('Neighbor clicked:', neighbor);
  }}
  onFilteredNeighborsChange={(filtered) => {
    console.log('Filtered neighbors:', filtered.length);
  }}
  debugNeighbors={true}  // Set to false in production
>
  {/* Other children like SiteMarkers, NetworkPlannerMap, Polygons, etc. */}
  {showPolygons && (visiblePolygons || []).map((poly) => (
    <Polygon
      key={poly.uid}
      paths={poly.paths[0]}
      options={{
        fillColor: poly.fillColor || "#4285F4",
        fillOpacity: poly.fillOpacity || 0.35,
        strokeColor: onlyInsidePolygons ? poly.fillColor : "#2563eb",
        strokeWeight: 2,
        strokeOpacity: 0.9,
        clickable: true,
        zIndex: 50,
      }}
    />
  ))}

  {enableSiteToggle && showSiteMarkers && (
    <SiteMarkers
      sites={siteData}
      showMarkers={showSiteMarkers}
      circleRadius={0}
      viewport={viewport}
    />
  )}

  {enableSiteToggle && showSiteSectors && (
    <NetworkPlannerMap
      defaultRadius={10}
      scale={0.2}
      showSectors={showSiteSectors}
      viewport={viewport}
      options={{ zIndex: 1000 }}
      projectId={projectId}
      minSectors={3}
    />
  )}
  
  {/* Area polygons, Best Network polygons, etc. */}
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
    </div>
  );
};

export default UnifiedMapView;