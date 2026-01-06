import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Polygon,
  MarkerClustererF,
} from "@react-google-maps/api";
import { toast } from "react-toastify";
import { adminApi, mapViewApi, settingApi } from "../api/apiEndpoints";
import MapSidebar from "../components/map/layout/MapSidebar";
import SessionDetailPanel from "../components/map/layout/SessionDetail";
import AllLogsDetailPanel from "../components/map/layout/AllLogsDetailPanel";
import MapHeader from "../components/map/layout/MapHeader";
import Spinner from "../components/common/Spinner";
import LogLayer from "../components/map/layers/LogLayer";

const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;
const GOOGLE_MAPS_LIBRARIES = ["places", "geometry", "visualization"]; // heatmap needs visualization
const DELHI_CENTER = { lat: 28.6139, lng: 77.2090 };
const MAP_CONTAINER_STYLE = { height: "100vh", width: "100%" };

// Persist/restore viewport
const VIEWPORT_KEY = "map_viewport_v1";
const loadSavedViewport = () => {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Number.isFinite(v.zoom)) {
      return v;
    }
  } catch {}
  return null;
};
const saveViewport = (map) => {
  try {
    const c = map.getCenter?.();
    const z = map.getZoom?.();
    if (!c || !Number.isFinite(z)) return;
    localStorage.setItem(
      VIEWPORT_KEY,
      JSON.stringify({ lat: c.lat(), lng: c.lng(), zoom: z })
    );
  } catch {}
};

// Metric -> threshold key helper (kept consistent with your code)
const resolveMetricConfig = (key) => {
  const map = {
    rsrp: { field: "rsrp", thresholdKey: "rsrp", label: "RSRP", unit: "dBm" },
    rsrq: { field: "rsrq", thresholdKey: "rsrq", label: "RSRQ", unit: "dB" },
    sinr: { field: "sinr", thresholdKey: "sinr", label: "SINR", unit: "dB" },
    "dl-throughput": { field: "dl_tpt", thresholdKey: "dl_thpt", label: "DL Throughput", unit: "Mbps" },
    "ul-throughput": { field: "ul_tpt", thresholdKey: "ul_thpt", label: "UL Throughput", unit: "Mbps" },
    mos: { field: "mos", thresholdKey: "mos", label: "MOS", unit: "" },
    "lte-bler": { field: "bler", thresholdKey: "lte_bler", label: "LTE BLER", unit: "%" },
  };
  return map[key?.toLowerCase()] || map.rsrp;
};

// Simple clean styles for a neat map (optional if you already have a map style via mapId)
const MAP_STYLES = {
  default: null,
  clean: [
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.stroke", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  ],
  night: [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
    { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
    { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
    { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
  ],
};

// WKT parser for POLYGON/MULTIPOLYGON to Google paths
const parseWKTToPaths = (wkt) => {
  if (!wkt) return [];
  const trim = (s) => s.trim();
  const toLatLng = (pair) => {
    const [lon, lat] = pair.split(/\s+/).map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lng: lon };
    return null;
  };

  const isMulti = wkt.toUpperCase().startsWith("MULTIPOLYGON");
  const inner = wkt.substring(wkt.indexOf("((")); // from first ((
  const strip = inner.replace(/^KATEX_INLINE_OPEN+|KATEX_INLINE_CLOSE+$/g, ""); // remove leading/trailing parens

  if (isMulti) {
    // MULTIPOLYGON(((lon lat, ...)), ((lon lat, ...)))
    const polygonsRaw = strip.split(")),((");
    return polygonsRaw
      .map((polyRaw) =>
        polyRaw
          .split("),(")
          .map((ringRaw) =>
            ringRaw.split(",").map(trim).map(toLatLng).filter(Boolean)
          )
      )
      .filter((rings) => rings.length > 0);
  } else {
    // POLYGON((lon lat, ...),(hole...))
    const ringsRaw = strip.split("),(");
    const rings = ringsRaw
      .map((ring) => ring.split(",").map(trim).map(toLatLng).filter(Boolean))
      .filter((r) => r.length > 0);
    return [rings];
  }
};

// Legend component for thresholds
const MapLegend = ({ thresholds, selectedMetric }) => {
  const { thresholdKey, label, unit } = resolveMetricConfig(selectedMetric);
  const list = thresholds[thresholdKey] || [];
  if (!list.length) return null;

  return (
    <div className="absolute bottom-4 right-4 z-10 rounded-lg border bg-white dark:bg-slate-950 dark:text-white p-3 shadow">
      <div className="text-sm font-semibold mb-2">{label} {unit ? `(${unit})` : ""}</div>
      <div className="space-y-1">
        {list.map((t, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs">
            <span className="inline-block w-4 h-3 rounded" style={{ backgroundColor: t.color }} />
            <span>{(t.range || `${t.min} to ${t.max}`)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const MapView = () => {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    mapId: MAP_ID,
  });

  const [map, setMap] = useState(null);
  const [allSessions, setAllSessions] = useState([]);
  const [selectedSessionData, setSelectedSessionData] = useState(null);
  const [thresholds, setThresholds] = useState({});
  const [selectedMetric, setSelectedMetric] = useState("rsrp");
  const [isLoading, setIsLoading] = useState(false);
  const [showAllLogsPanel, setShowAllLogsPanel] = useState(false);
  const [activeFilters, setActiveFilters] = useState(null);
  const [drawnLogs, setDrawnLogs] = useState([]);

  // UI layer toggles
  const [ui, setUi] = useState({
    showSessions: true,
    clusterSessions: true,
    showLogsCircles: true,
    showHeatmap: false,
    showPolygons: false,
    basemapStyle: "clean", // default neat style
    selectedProjectId: null,
    renderVisibleLogsOnly: true,
  });

  // Polygons state
  const [projectPolygons, setProjectPolygons] = useState([]); // [{id, name, paths: [rings]}]

  // Keep a ref to remove listener on unmount and track bounds
  const idleListenerRef = useRef(null);
  const [visibleBounds, setVisibleBounds] = useState(null);

  // thresholds
  useEffect(() => {
    const fetchThresholds = async () => {
      try {
        const res = await settingApi.getThresholdSettings();
        if (res?.Data) {
          const data = res.Data;
          setThresholds({
            rsrp: JSON.parse(data.rsrp_json || "[]"),
            rsrq: JSON.parse(data.rsrq_json || "[]"),
            sinr: JSON.parse(data.sinr_json || "[]"),
            dl_thpt: JSON.parse(data.dl_thpt_json || "[]"),
            ul_thpt: JSON.parse(data.ul_thpt_json || "[]"),
            mos: JSON.parse(data.mos_json || "[]"),
            lte_bler: JSON.parse(data.lte_bler_json || "[]"),
          });
        }
      } catch {
        toast.error("Could not load color thresholds.");
      }
    };
    fetchThresholds();
  }, []);

  const fetchAllSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await adminApi.getSessions();
      const validSessions = (data || []).filter(
        (s) =>
          !isNaN(parseFloat(s.start_lat)) && !isNaN(parseFloat(s.start_lon))
      );
      setAllSessions(validSessions);
    } catch (error) {
      toast.error(`Failed to fetch sessions: ${error?.message || "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoaded) fetchAllSessions();
  }, [isLoaded, fetchAllSessions]);

  // Fetch polygons when toggled and project selected
  useEffect(() => {
    const loadPolygons = async () => {
      if (!ui.showPolygons || !ui.selectedProjectId) {
        setProjectPolygons([]);
        return;
      }
      try {
        const rows = await mapViewApi.getProjectPolygons({ projectId: ui.selectedProjectId });
        // rows: [{ id, name, wkt }]
        const parsed = (rows || []).map((r) => ({
          id: r.id,
          name: r.name,
          rings: parseWKTToPaths(r.wkt), // [[[latlngs], [hole]], ...]
        }));
        setProjectPolygons(parsed);
      } catch (err) {
        console.error("Failed to load polygons", err);
        toast.error("Failed to load project polygons");
      }
    };
    loadPolygons();
  }, [ui.showPolygons, ui.selectedProjectId]);

  const onMapLoad = useCallback((mapInstance) => {
    setMap(mapInstance);

    const saved = loadSavedViewport();
    if (saved) {
      mapInstance.setCenter({ lat: saved.lat, lng: saved.lng });
      mapInstance.setZoom(saved.zoom);
    }

    idleListenerRef.current = mapInstance.addListener("idle", () => {
      saveViewport(mapInstance);
      const b = mapInstance.getBounds?.();
      if (b) {
        const ne = b.getNorthEast();
        const sw = b.getSouthWest();
        setVisibleBounds({
          north: ne.lat(),
          east: ne.lng(),
          south: sw.lat(),
          west: sw.lng(),
        });
      }
    });
  }, []);

  const onMapUnmount = useCallback(() => {
    try {
      if (idleListenerRef.current) {
        window.google?.maps?.event?.removeListener?.(idleListenerRef.current);
      }
    } catch {}
    idleListenerRef.current = null;
    setMap(null);
  }, []);

  const handleApplyFilters = (filters) => {
    setActiveFilters(filters);
    setSelectedMetric(filters.measureIn?.toLowerCase() || "rsrp");
    setSelectedSessionData(null);
    // Ensure logs layer is visible on apply
    setUi((u) => ({ ...u, showLogsCircles: true }));
  };

  const handleClearFilters = useCallback(() => {
    setActiveFilters(null);
    setDrawnLogs([]);
    setShowAllLogsPanel(false);
    fetchAllSessions();
  }, [fetchAllSessions]);

  const handleUIChange = (partial) => {
    setUi((prev) => ({ ...prev, ...partial }));
  };

  const handleSessionMarkerClick = async (session) => {
    setIsLoading(true);
    setShowAllLogsPanel(false);
    try {
      const logs = await mapViewApi.getNetworkLog(session.id);
      setSelectedSessionData({ session, logs: logs || [] });
    } catch (error) {
      toast.error(
        `Failed to fetch logs for session ${session.id}: ${error?.message || "Unknown error"}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogsLoaded = useCallback((logs) => {
    setDrawnLogs(logs || []);
    setShowAllLogsPanel(Boolean(logs?.length));
  }, []);

  // Style selection
  const mapStyles = useMemo(() => MAP_STYLES[ui.basemapStyle] || null, [ui.basemapStyle]);

  if (loadError) return <div>Error loading Google Maps.</div>;
  if (!isLoaded) return <Spinner />;

  return (
    <div className="relative h-full w-full">
      <MapHeader map={map} />

      <MapSidebar
        onApplyFilters={handleApplyFilters}
        onClearFilters={handleClearFilters}
        onUIChange={handleUIChange}
        ui={ui}
      />

      {isLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/70 dark:bg-black/70">
          <Spinner />
        </div>
      )}

      <GoogleMap
        mapContainerStyle={MAP_CONTAINER_STYLE}
        center={DELHI_CENTER}
        zoom={14}
        onLoad={onMapLoad}
        onUnmount={onMapUnmount}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
          mapId: MAP_ID,
          styles: mapStyles || null,
          gestureHandling: "greedy",
        }}
      >
        {/* Sessions layer (with optional clustering) */}
        {!activeFilters && ui.showSessions && (
          ui.clusterSessions ? (
            <MarkerClustererF>
              {(clusterer) =>
                allSessions.map((s) => {
                  const lat = parseFloat(s.start_lat);
                  const lng = parseFloat(s.start_lon);
                  if (isNaN(lat) || isNaN(lng)) return null;
                  return (
                    <Marker
                      key={`session-${s.id}`}
                      position={{ lat, lng }}
                      title={`Session ${s.id}`}
                      clusterer={clusterer}
                      onClick={() => handleSessionMarkerClick(s)}
                    />
                  );
                })
              }
            </MarkerClustererF>
          ) : (
            allSessions.map((s) => {
              const lat = parseFloat(s.start_lat);
              const lng = parseFloat(s.start_lon);
              if (isNaN(lat) || isNaN(lng)) return null;
              return (
                <Marker
                  key={`session-${s.id}`}
                  position={{ lat, lng }}
                  title={`Session ${s.id}`}
                  onClick={() => handleSessionMarkerClick(s)}
                />
              );
            })
          )
        )}

        {/* Logs layer via LogLayer (circles/heatmap) */}
        {activeFilters && map && (
          <LogLayer
            map={map}
            filters={activeFilters}
            selectedMetric={selectedMetric}
            thresholds={thresholds}
            onLogsLoaded={handleLogsLoaded}
            setIsLoading={setIsLoading}
            showCircles={ui.showLogsCircles}
            showHeatmap={ui.showHeatmap}
            visibleBounds={ui.renderVisibleLogsOnly ? visibleBounds : null}
          />
        )}

        {/* Project polygons overlay */}
        {ui.showPolygons &&
          projectPolygons.map((poly) =>
            poly.rings.map((rings, idx) => (
              <Polygon
                key={`${poly.id}-${idx}`}
                paths={rings}
                options={{
                  strokeColor: "#2563eb",
                  strokeOpacity: 0.8,
                  strokeWeight: 1.5,
                  fillColor: "#3b82f6",
                  fillOpacity: 0.08,
                  clickable: true,
                }}
                onClick={() => toast.info(poly.name || `Region ${poly.id}`)}
              />
            ))
          )}
      </GoogleMap>

      {/* Legend for metric thresholds */}
      {activeFilters && (ui.showLogsCircles || ui.showHeatmap) && (
        <MapLegend thresholds={thresholds} selectedMetric={selectedMetric} />
      )}

      {showAllLogsPanel && activeFilters && (
        <AllLogsDetailPanel
          logs={drawnLogs}
          thresholds={thresholds}
          selectedMetric={selectedMetric}
          isLoading={isLoading}
          onClose={() => setShowAllLogsPanel(false)}
        />
      )}

      <SessionDetailPanel
        sessionData={selectedSessionData}
        isLoading={isLoading}
        thresholds={thresholds}
        selectedMetric={selectedMetric}
        onClose={() => setSelectedSessionData(null)}
      />
    </div>
  );
};

export default MapView;