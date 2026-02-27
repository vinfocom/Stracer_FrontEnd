// src/hooks/usePredictionData.js
import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { mapViewApi } from '@/api/apiEndpoints';

export const usePredictionData = (projectId, selectedMetric, enabled = true) => {
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

    if (abortControllerRef.current) abortControllerRef.current.abort();
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
        const formatted = dataList.map((pt) => {
          const lat = parseFloat(pt.lat);
          const lng = parseFloat(pt.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return {
            lat,
            lng,
            latitude: lat,
            longitude: lng,
            [selectedMetric]: pt.prm,
            value: pt.prm,        // required by LtePredictionLocationLayer
            isPrediction: true,
          };
        }).filter(Boolean);

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
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [fetchData]);

  return { locations, colorSettings, loading, error, refetch: fetchData };
};