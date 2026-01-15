// src/hooks/useSessionNeighbors.js
import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { mapViewApi } from '@/api/apiEndpoints';
import { normalizeProviderName, normalizeTechName } from '@/utils/colorUtils';

// ✅ FIX 1: Robust cancellation check including Axios 'CanceledError'
const isRequestCancelled = (err) => 
  err?.name === 'AbortError' || 
  err?.name === 'CanceledError' || 
  err?.code === 'ERR_CANCELED';

export const useSessionNeighbors = (sessionIds, enabled = true) => {
  const [neighborData, setNeighborData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  
  const abortControllerRef = useRef(null);
  const mountedRef = useRef(true);
  const lastFetchKeyRef = useRef(null);
  const isFetchingRef = useRef(false);
  // ✅ FIX 2: Track the key currently being fetched to prevent race conditions
  const currentFetchingKeyRef = useRef(null);

  const fetchData = useCallback(async (force = false) => {
    const fetchKey = sessionIds?.sort().join(',') || '';
    
    if (!sessionIds?.length || !enabled) {
      if (mountedRef.current) {
        setNeighborData([]);
        setStats(null);
      }
      return;
    }
    
    // ✅ FIX 3: Check against currentFetchingKeyRef to prevent aborting identical pending requests
    if (!force && fetchKey === lastFetchKeyRef.current && neighborData.length > 0) return;
    if (isFetchingRef.current && fetchKey === currentFetchingKeyRef.current) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    
    isFetchingRef.current = true;
    currentFetchingKeyRef.current = fetchKey; // Mark this key as "in progress"

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const res = await mapViewApi.getSessionNeighbour({
        sessionIds: sessionIds,
        signal: abortControllerRef.current.signal,
      });

      if (!mountedRef.current) return;

      if (res?.Status === 1 && res?.Data) {
        const formattedData = res.Data.map((item) => {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon);
            if (!isFinite(lat) || !isFinite(lng)) return null;
            const neighbourBand = item.neighbour_band || item.neighbor_band;

            return {
                id: item.id,
                sessionId: item.session_id,
                timestamp: item.timestamp,
                lat, lng,
                provider: normalizeProviderName(item.provider || ""),
                networkType: normalizeTechName(item.primary_network, neighbourBand),
                primaryBand: item.primary_band,
                neighbourBand: neighbourBand,
                primaryRsrp: parseFloat(item.primary_rsrp) || null,
                primaryRsrq: parseFloat(item.primary_rsrq) || null,
                primarySinr: parseFloat(item.primary_sinr) || null,
                primaryPci: parseInt(item.primary_pci) || null,
                neighbourRsrp: parseFloat(item.neighbour_rsrp) || null,
                neighbourRsrq: parseFloat(item.neighbour_rsrq) || null,
                neighbourSinr: parseFloat(item.neighbour_sinr) || null,
                neighbourPci: parseInt(item.neighbour_pci) || null,
            };
        }).filter(Boolean);

        const statsObj = { 
          total: formattedData.length,
          uniquePCIs: new Set(formattedData.map(d => d.primaryPci)).size
        }; 

        if (mountedRef.current) {
          setNeighborData(formattedData);
          setStats(statsObj);
          lastFetchKeyRef.current = fetchKey;
        }
      } else {
        if (mountedRef.current) setNeighborData([]);
      }
    } catch (err) {
      // ✅ FIX 4: Use the improved check so we don't toast errors for cancellations
      if (isRequestCancelled(err)) return;
      
      if (mountedRef.current) {
        setError(err.message);
        toast.error(`Failed to fetch neighbor data: ${err.message}`);
      }
    } finally {
      // Only clear fetching flags if this was the request that finished
      if (currentFetchingKeyRef.current === fetchKey) {
        isFetchingRef.current = false;
        currentFetchingKeyRef.current = null;
        if (mountedRef.current) setLoading(false);
      }
    }
  }, [sessionIds, enabled]);

  // ... (rest of useEffects remain the same)
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => fetchData(), 100);
    return () => clearTimeout(timeoutId);
  }, [sessionIds?.join(','), enabled, fetchData]);

  return { neighborData, stats, loading, error, refetch: () => fetchData(true) };
};