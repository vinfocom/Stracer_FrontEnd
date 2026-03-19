import { useCallback, useEffect, useRef, useState } from "react";
import { mapViewApi } from "@/api/apiEndpoints";

const EMPTY_ANALYTICS = Object.freeze({
  requestedSessionIds: [],
  sessions: [],
  summary: null,
  markers: [],
  rawResponse: null,
});

const isRequestCancelled = (error) => {
  if (!error) return false;
  return (
    error.isCancelled === true ||
    error.name === "AbortError" ||
    error.name === "CanceledError" ||
    error.code === "ERR_CANCELED" ||
    error.message === "Request cancelled"
  );
};

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeLatLng = (latRaw, lngRaw, allowZero = false) => {
  const lat = toFiniteNumber(latRaw);
  const lng = toFiniteNumber(lngRaw);

  if (lat == null || lng == null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (!allowZero && lat === 0 && lng === 0) return null;

  return { lat, lng };
};

const normalizeMetrics = (metrics = {}) => ({
  total_duration: toFiniteNumber(metrics.total_duration),
  avg_duration: toFiniteNumber(metrics.avg_duration),
  total_speed: toFiniteNumber(metrics.total_speed),
  avg_speed: toFiniteNumber(metrics.avg_speed),
  total_file_size: toFiniteNumber(metrics.total_file_size),
  avg_file_size: toFiniteNumber(metrics.avg_file_size),
});

const normalizeSubSessionItem = (item = {}) => {
  const subSessionId =
    item.sub_session_id ?? item.subSessionId ?? item.subsession_id ?? null;

  const coordinates = item.coordinates || {};
  const start = normalizeLatLng(coordinates.start_lat, coordinates.start_lon);
  const end = normalizeLatLng(coordinates.end_lat, coordinates.end_lon);

  return {
    subSessionId,
    start,
    end,
    rawCoordinates: coordinates,
  };
};

const normalizeSessionItem = (item = {}, index = 0) => {
  const sessionId = item.session_id ?? item.sessionId ?? item.id ?? `session-${index}`;
  const coordinates = item.coordinates || {};
  const sessionStart = normalizeLatLng(coordinates.start_lat, coordinates.start_lon);
  const sessionEnd = normalizeLatLng(coordinates.end_lat, coordinates.end_lon);
  const subSessions = Array.isArray(item.sub_sessions)
    ? item.sub_sessions.map(normalizeSubSessionItem)
    : [];

  const metrics = normalizeMetrics(item.metrics || {});
  const subSessionCount =
    toFiniteNumber(item.sub_session_count) ??
    toFiniteNumber(item.subSessionCount) ??
    subSessions.length;

  const markers = [];

  subSessions.forEach((sub, subIndex) => {
    if (!sub.start) return;
    markers.push({
      id: `sub-${sessionId}-${sub.subSessionId ?? subIndex}`,
      markerType: "sub-session-start",
      sessionId,
      subSessionId: sub.subSessionId,
      position: sub.start,
      start: sub.start,
      end: sub.end,
      sessionStart,
      sessionEnd,
      subSessionCount,
      metrics,
    });
  });

  if (markers.length === 0 && sessionStart) {
    markers.push({
      id: `session-${sessionId}`,
      markerType: "session-start",
      sessionId,
      subSessionId: null,
      position: sessionStart,
      start: sessionStart,
      end: sessionEnd,
      sessionStart,
      sessionEnd,
      subSessionCount,
      metrics,
    });
  }

  return {
    sessionId,
    start: sessionStart,
    end: sessionEnd,
    subSessionCount,
    subSessions,
    metrics,
    rawCoordinates: coordinates,
    markers,
  };
};

const normalizeResponse = (response) => {
  const body =
    response?.data && !Array.isArray(response.data) ? response.data : response || {};

  const data = Array.isArray(body?.data) ? body.data : [];
  const sessions = data.map((item, index) => normalizeSessionItem(item, index));
  const markers = sessions.flatMap((session) => session.markers || []);

  const requestedSessionIdsRaw = Array.isArray(body?.requested_session_ids)
    ? body.requested_session_ids
    : [];

  const requestedSessionIds = requestedSessionIdsRaw
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);

  return {
    requestedSessionIds,
    sessions,
    summary: normalizeMetrics(body?.summary || {}),
    markers,
    rawResponse: body,
  };
};

export const useSubSessionAnalytics = (sessionIds, enabled = false) => {
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);
  const mountedRef = useRef(true);
  const lastFetchKeyRef = useRef(null);
  const isFetchingRef = useRef(false);

  const fetchData = useCallback(
    async (force = false) => {
      const fetchKey = Array.isArray(sessionIds)
        ? [...sessionIds].map((id) => String(id ?? "").trim()).filter(Boolean).sort().join(",")
        : "";

      if (!enabled || !fetchKey) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        if (mountedRef.current) {
          setAnalytics(EMPTY_ANALYTICS);
          setLoading(false);
          setError(null);
        }
        return;
      }

      if (!force && isFetchingRef.current) return;
      if (!force && lastFetchKeyRef.current === fetchKey && analytics.sessions.length > 0) {
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      isFetchingRef.current = true;

      if (mountedRef.current) {
        setLoading(true);
        setError(null);
      }

      try {
        const response = await mapViewApi.getSubSessionAnalytics({
          sessionIds,
          signal: abortControllerRef.current.signal,
        });

        if (!mountedRef.current) return;

        const normalized = normalizeResponse(response);
        setAnalytics(normalized);
        lastFetchKeyRef.current = fetchKey;
      } catch (err) {
        if (isRequestCancelled(err)) return;

        if (mountedRef.current) {
          setError(err?.message || "Failed to fetch sub-session analytics");
          setAnalytics(EMPTY_ANALYTICS);
        }
      } finally {
        isFetchingRef.current = false;
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [enabled, sessionIds, analytics.sessions.length],
  );

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
    const timeout = setTimeout(() => {
      fetchData();
    }, 100);

    return () => clearTimeout(timeout);
  }, [fetchData]);

  return {
    ...analytics,
    loading,
    error,
    refetch: () => fetchData(true),
  };
};
