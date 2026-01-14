// src/hooks/useProjectPolygons.js
import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { mapViewApi } from '@/api/apiEndpoints';
import { parseWKTToPolygons, computeBbox } from '@/utils/wkt.js';

export const useAreaPolygons = (projectId, showPolygons, polygonSource) => {
  const [polygons, setPolygons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!projectId || !showPolygons) {
      setPolygons([]);
      return;
    }
    if (abortControllerRef.current) abortControllerRef.current.abort();
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
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [fetchData]);

  return { polygons, loading, error, refetch: fetchData };
};