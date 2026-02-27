// src/hooks/useNetworkSamples.js
import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import { mapViewApi } from '@/api/apiEndpoints'; // Adjust path as needed
import { normalizeTechName, normalizeProviderName } from '@/utils/colorUtils';

// --- Helper Functions (Moved from Component) ---
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRequestCancelled = (error) => {
  if (!error) return false;
  
  // 1. Check custom property from apiService.js
  if (error.isCancelled === true) return true;
  
  // 2. Check standard Axios/Browser cancellation names
  if (
    error.name === 'AbortError' || 
    error.name === 'CanceledError' || 
    error.code === 'ERR_CANCELED' ||
    error.message === 'Request cancelled' // Matches apiService.js message
  ) {
    return true;
  }
  
  return false;
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

const parseLogEntry = (log, sessionId) => {
  if (!log || typeof log !== 'object') return null;
  const lat = parseFloat(log.lat);
  const lng = parseFloat(log.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const parseNum = (val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = parseFloat(val);
    return Number.isFinite(num) ? num : null;
  };

  return {
    id: log.id ?? log.Id ?? log.log_id ?? log.LogId ?? null,
    session_id: sessionId ?? log.session_id,
    lat, lng, latitude: lat, longitude: lng,
    radius: 18,
    timestamp: log.timestamp,
    rsrp: parseNum(log.rsrp),
    rsrq: parseNum(log.rsrq),
    sinr: parseNum(log.sinr),
    dl_tpt: parseNum(log.dl_tpt),
    ul_tpt: parseNum(log.ul_tpt),
    mos: parseNum(log.mos),
    level: parseNum(log.level),
    jitter: parseNum(log.jitter),
    latency: parseNum(log.latency),
    tac: parseNum(log.tac),
    packet_loss: parseNum(log.packet_loss),
    provider: normalizeProviderName(log.m_alpha_long || ''),
    technology: normalizeTechName(log.network || ''),
    band: log.band || '',
    pci: log.pci ?? log.Pci ?? log.PCI ?? '',
    nodeb_id: log.nodeb_id || '',
    cell_id: log.cell_id ?? log.cellId ?? '',
    num_cells: parseInt(log.num_cells) || null,
    speed: parseNum(log.Speed),
    battery: parseInt(log.battery) || null,
    indoor_outdoor: log.indoor_outdoor || null,
    apps: log.apps || '',
    image_path: log.image_path || '',
  };
};

export const useNetworkSamples = (sessionIds, enabled = true, filterEnabled = false, polygons = []) => {
  const [locations, setLocations] = useState([]);
  const [appSummary, setAppSummary] = useState({});
  const [inpSummary, setInpSummary] = useState({});
  const [tptVolume, setTptVolume] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, page: 0, totalPages: 0 });
  const [technologyTransitions, setTechnologyTransitions] = useState([]);
  const [bandTransitions, setBandTransitions] = useState([]);
  const [pciTransitions, setPciTransitions] = useState([]);
  
  const abortControllerRef = useRef(null);
  const isFetchingRef = useRef(false);
  const mountedRef = useRef(true);
  const lastFetchedKeyRef = useRef(null);
  const fetchIdRef = useRef(0);

  const fetchData = useCallback(async (forceRefresh = false) => {
const fetchKey = sessionIds ? [...sessionIds].sort().join(',') : '';


    if (!forceRefresh && fetchKey === lastFetchedKeyRef.current && locations.length > 0) return;
    if (!sessionIds?.length || !enabled) {
      setLocations([]);
      setAppSummary({});
      setInpSummary({});
      setTptVolume({});
      return;
    }
    if (isFetchingRef.current && fetchKey === lastFetchedKeyRef.current) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
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
        if (fetchIdRef.current !== currentFetchId || !mountedRef.current) return;

        let response;
        try {
          response = await mapViewApi.getNetworkLog({
            session_ids: sessionIds,
            page: currentPage,
            limit: PAGE_SIZE,
            signal: abortControllerRef.current.signal,
          });

          console.log(`Fetched page ${currentPage} with ${response?.data?.data?.length || 0} records`);
        } catch (fetchErr) {
          if (isRequestCancelled(fetchErr)) return;
          throw fetchErr;
        }

        if (fetchIdRef.current !== currentFetchId || !mountedRef.current) return;

        let apiBody;
        let logsArray;

        // Handle various API response structures
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
          if (totalCount === 0 && logsArray.length > 0) totalCount = logsArray.length;
          totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
          if (apiBody?.app_summary) summaryData.app = apiBody.app_summary;
          if (apiBody?.io_summary) summaryData.io = apiBody.io_summary;
          if (apiBody?.tpt_volume) summaryData.tpt = apiBody.tpt_volume;
        }

        if (!Array.isArray(logsArray)) break;

        logsArray.forEach((log) => {
          const parsed = parseLogEntry(log, log.session_id);
          if (parsed) allParsedLogs.push(parsed);
        });

        if (mountedRef.current && fetchIdRef.current === currentFetchId) {
          setProgress({
            current: allParsedLogs.length,
            total: totalCount,
            page: currentPage,
            totalPages: totalPages,
          });
        }

        if (currentPage >= totalPages || logsArray.length < PAGE_SIZE || currentPage > 100) {
          hasMoreData = false;
        } else {
          currentPage++;
          await delay(100);
        }
      }

      let finalLogs = allParsedLogs;

      if (filterEnabled && polygons?.length > 0) {
        finalLogs = allParsedLogs.filter(log => 
          polygons.some(poly => isPointInPolygon(log, poly))
        );
      }

      const fetchTime = ((performance.now() - startTime) / 1000).toFixed(2);
      setLocations(finalLogs); 
      setAppSummary(summaryData.app);
      setInpSummary(summaryData.io);
      setTptVolume(summaryData.tpt);
      lastFetchedKeyRef.current = fetchKey;


      if (allParsedLogs.length > 0) {
        toast.success(`${allParsedLogs.length.toLocaleString()} points loaded in ${fetchTime}s`);
      } else {
        toast.warn('No valid log data found');
      }

      

    } catch (err) {
      if (isRequestCancelled(err)) return;
      if (mountedRef.current && fetchIdRef.current === currentFetchId) {
        setError(err.message);
        toast.error(`Error: ${err.message}`);
        if (allParsedLogs.length > 0) {
           // Fallback to what we have
           setLocations(allParsedLogs);
        }
      }
    } finally {
      if (fetchIdRef.current === currentFetchId) {
        isFetchingRef.current = false;
        if (mountedRef.current) setLoading(false);
      }
    }
  }, [sessionIds, enabled, filterEnabled, polygons]);

  // Handle Technology Transitions Logic
  useEffect(() => {
    if (!locations || locations.length < 2) {
      setTechnologyTransitions([]);
      setBandTransitions([]);
      setPciTransitions([]);
      return;
    }
    
    const techTrans = [];
    const bandTrans = [];
    const pciTrans = [];

    let prevTech = normalizeTechName(locations[0].technology);
    let prevBand = locations[0].band;
    let prevPci = locations[0].pci;

    for (let i = 1; i < locations.length; i++) {
      const loc = locations[i];
      
      // Technology Transition
      const currTech = normalizeTechName(loc.technology);
      if (currTech && prevTech && currTech !== prevTech) {
        techTrans.push({
          from: prevTech,
          to: currTech,
          atIndex: i,
          lat: loc.lat,
          lng: loc.lng,
          timestamp: loc.timestamp,
          session_id: loc.session_id,
          type: 'technology'
        });
      }
      prevTech = currTech;

      // Band Transition
      const currBand = loc.band;
      if (currBand && prevBand && String(currBand) !== String(prevBand)) {
        bandTrans.push({
            from: String(prevBand),
            to: String(currBand),
            atIndex: i,
            lat: loc.lat,
            lng: loc.lng,
            timestamp: loc.timestamp,
            session_id: loc.session_id,
            type: 'band'
        });
      }
      prevBand = currBand;

      // PCI Transition
      const currPci = loc.pci;
      // Ensure we treat 0 as a valid PCI value, but skip null/undefined/empty string
      if (currPci !== '' && currPci !== null && prevPci !== '' && prevPci !== null && String(currPci) !== String(prevPci)) {
         pciTrans.push({
            from: String(prevPci),
            to: String(currPci),
            atIndex: i,
            lat: loc.lat,
            lng: loc.lng,
            timestamp: loc.timestamp,
            session_id: loc.session_id,
            type: 'pci'
        });
      }
      prevPci = currPci;
    }

    setTechnologyTransitions(techTrans);
    setBandTransitions(bandTrans);
    setPciTransitions(pciTrans);
  }, [locations]);
  // Lifecycle & Polling
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => fetchData(), 50);
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
    bandTransitions, 
    pciTransitions,
  };
};
