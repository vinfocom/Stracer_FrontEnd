import { useState, useEffect, useCallback, useRef } from 'react';
import { mapViewApi } from '@/api/apiEndpoints';

const isPointInPolygon = (point, polygon) => {
  const path = Array.isArray(polygon?.paths?.[0])
    ? polygon.paths[0]
    : Array.isArray(polygon?.paths) && polygon.paths[0]?.lat != null
      ? polygon.paths
      : Array.isArray(polygon?.path) && polygon.path[0]?.lat != null
        ? polygon.path
        : null;
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

export const useLtePrediction = ({
  projectId,
  metric = 'rsrp',
  stat = 'avg',
  enabled = true,
  autoFetch = true,
  filterEnabled = false,
  polygons = [],
} = {}) => {
  const [locations, setLocations] = useState([]);
  const [meta, setMeta] = useState({
    status: null,
    projectId: null,
    metric: null,
    statRequested: null,
    totalLocations: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchLtePrediction = useCallback(async () => {
    if (!enabled || !projectId) {
      setLocations([]);
      setMeta({
        status: null,
        projectId: null,
        metric: null,
        statRequested: null,
        totalLocations: 0,
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await mapViewApi.getLtePfrection({
        projectId: Number(projectId),
        metric: String(metric || '').toLowerCase(),
        stat,
      });

      if (!isMountedRef.current) return;

      const rawData = Array.isArray(response?.Data) ? response.Data : [];
      const normalized = rawData
        .map((item) => {
          const lat = Number(item?.lat);
          const lng = Number(item?.lon);
          const value = Number(item?.value);
          const sampleCount = Number(item?.sampleCount ?? 0);

          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

          return {
            lat,
            lng,
            latitude: lat,
            longitude: lng,
            value: Number.isFinite(value) ? value : null,
            sampleCount: Number.isFinite(sampleCount) ? sampleCount : 0,
          };
        })
        .filter(Boolean);

      let finalLocations = normalized;
      if (filterEnabled && polygons?.length > 0) {
        finalLocations = normalized.filter((pt) =>
          polygons.some((poly) => isPointInPolygon(pt, poly)),
        );
      }

      setLocations(finalLocations);
      setMeta({
        status: response?.Status ?? null,
        projectId: response?.ProjectId ?? Number(projectId),
        metric: response?.Metric ?? String(metric || '').toUpperCase(),
        statRequested: response?.StatRequested ?? stat,
        totalLocations: response?.TotalLocations ?? finalLocations.length,
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err);
      setLocations([]);
      setMeta({
        status: null,
        projectId: Number(projectId) || null,
        metric: String(metric || '').toUpperCase(),
        statRequested: stat,
        totalLocations: 0,
      });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, projectId, metric, stat, filterEnabled, polygons]);

  useEffect(() => {
    if (!autoFetch) return;
    fetchLtePrediction();
  }, [fetchLtePrediction, autoFetch]);

  return {
    locations,
    meta,
    loading,
    error,
    fetchLtePrediction,
  };
};

export default useLtePrediction;
