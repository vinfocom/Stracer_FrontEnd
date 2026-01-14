// src/hooks/useSessionNeighbors.js
import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { mapViewApi } from '@/api/apiEndpoints';
import { normalizeProviderName, normalizeTechName } from '@/utils/colorUtils';

const isRequestCancelled = (err) => err?.name === 'AbortError' || err?.code === 'ERR_CANCELED';

export const useSessionNeighbors = (sessionIds, enabled = true) => {
  const [neighborData, setNeighborData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  
  const abortControllerRef = useRef(null);
  const mountedRef = useRef(true);
  const lastFetchKeyRef = useRef(null);
  const isFetchingRef = useRef(false);

  const fetchData = useCallback(async (force = false) => {
    const fetchKey = sessionIds?.sort().join(',') || '';
    if (!sessionIds?.length || !enabled) {
      if (mountedRef.current) {
        setNeighborData([]);
        setStats(null);
      }
      return;
    }
    
    // Prevent duplicate fetches
    if (!force && fetchKey === lastFetchKeyRef.current && neighborData.length > 0) return;
    if (isFetchingRef.current && fetchKey === lastFetchKeyRef.current) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    isFetchingRef.current = true;

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
        // Parsing logic
        const formattedData = res.Data.map((item) => {
          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lon);
          if (!isFinite(lat) || !isFinite(lng)) return null;
          
          const neighbourBand = item.neighbour_band || item.neighbor_band;

          // ✅ FIX: Map ALL metrics (RSRP, RSRQ, SINR) for both Primary and Neighbor
          return {
            id: item.id,
            sessionId: item.session_id,
            timestamp: item.timestamp,
            lat, 
            lng,
            
            // Categorical Data
            provider: normalizeProviderName(item.provider || ""),
            networkType: normalizeTechName(item.primary_network, neighbourBand),
            
            // Band Data
            primaryBand: item.primary_band,
            neighbourBand: neighbourBand,
            
            // Primary Metrics (Used for grid coloring when Metric selected)
            primaryRsrp: parseFloat(item.primary_rsrp) || null,
            primaryRsrq: parseFloat(item.primary_rsrq) || null, // Added
            primarySinr: parseFloat(item.primary_sinr) || null, // Added
            primaryPci: parseInt(item.primary_pci) || null,

            // Neighbor Metrics (Displayed in Tooltip)
            neighbourRsrp: parseFloat(item.neighbour_rsrp) || null,
            neighbourRsrq: parseFloat(item.neighbour_rsrq) || null, // Added
            neighbourSinr: parseFloat(item.neighbour_sinr) || null, // Added
            neighbourPci: parseInt(item.neighbour_pci) || null,
          };
        }).filter(Boolean);

        // Calculate Stats
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
      if (isRequestCancelled(err)) return;
      if (mountedRef.current) {
        setError(err.message);
        toast.error(`Failed to fetch neighbor data: ${err.message}`);
      }
    } finally {
      isFetchingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [sessionIds, enabled]);

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