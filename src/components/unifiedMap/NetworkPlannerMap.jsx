// src/components/unifiedMap/NetworkPlannerMap.jsx

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { InfoWindowF, MarkerF, PolygonF, PolylineF } from "@react-google-maps/api";
import {
  getProviderColor,
  getBandColor,
  getTechnologyColor,
} from "@/utils/colorUtils";
import { useSiteData } from "@/hooks/useSiteData";
import { mapViewApi } from "@/api/apiEndpoints";
import { toast } from "react-toastify";
import EditSiteFormDialog from "@/components/unifiedMap/EditSiteFormDialog";

function computeOffset(center, distanceMeters, headingDegrees) {
  const earthRadius = 6371000;
  const lat1 = (center.lat * Math.PI) / 180;
  const lng1 = (center.lng * Math.PI) / 180;
  const heading = (headingDegrees * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceMeters / earthRadius) +
      Math.cos(lat1) * Math.sin(distanceMeters / earthRadius) * Math.cos(heading),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(heading) * Math.sin(distanceMeters / earthRadius) * Math.cos(lat1),
      Math.cos(distanceMeters / earthRadius) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

function getSiteId(site) {
  return String(
    site?.site_key_inferred ||
      site?.siteKeyInferred ||
      site?.site ||
      site?.site_id ||
      site?.siteId ||
      site?.nodeb_id ||
      site?.nodebId ||
      site?.id ||
      "",
  ).trim();
}

function getSiteName(site) {
  return String(
    site?.site_name ||
      site?.siteName ||
      site?.site_key_inferred ||
      site?.siteKeyInferred ||
      site?.site ||
      site?.site_id ||
      "Unknown",
  ).trim();
}

function normalizeComparableSiteId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return String(numeric);
  return raw;
}

const INVALID_MATCH_VALUES = new Set(["unknown", "null", "undefined", "na", "n/a", "-1"]);

function normalizeMatchValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  if (INVALID_MATCH_VALUES.has(lowered)) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return String(numeric);
  return lowered;
}

function extractMatchValue(source, keys = []) {
  if (!source || typeof source !== "object" || !Array.isArray(keys) || keys.length === 0) {
    return null;
  }

  const candidates = [
    source,
    source.loc,
    source.location,
    source.properties,
    source.data,
    source.raw,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    for (const key of keys) {
      if (!(key in candidate)) continue;
      const normalized = normalizeMatchValue(candidate[key]);
      if (normalized !== null) return normalized;
    }
  }
  return null;
}

function extractNodebId(source) {
  return extractMatchValue(source, [
    "node_id",
    "nodeId",
    "nodeID",
    "node",
    "Node",
    "NodeID",
    "NodeId",
    "node_b",
    "nodeB",
    "nodeb_id",
    "nodebId",
    "nodeb",
    "NodeB",
    "NodeBId",
    "NodeB_ID",
    "Node_B",
    "Node_B_ID",
    "eNodeB",
    "enodeb",
    "enodeb_id",
    "e_nodeb",
    "gNodeB",
    "gnodeb",
    "gnodeb_id",
    "g_nodeb",
    "site",
    "site_id",
    "siteId",
    "site_key_inferred",
    "siteKeyInferred",
    "cell_id_representative",
    "cellIdRepresentative",
  ]);
}

function extractPciValue(source) {
  return extractMatchValue(source, [
    "pci",
    "PCI",
    "physical_cell_id",
    "physicalCellId",
    "cell_id",
    "cellId",
    "pci_or_psi",
    "primaryPci",
    "primary_pci",
  ]);
}

function inferTechnologyFromCarrier(technologyValue, earfcnValue) {
  const techRaw = String(technologyValue ?? "").trim();
  if (techRaw) return techRaw;
  const earfcnNum = Number(earfcnValue);
  if (Number.isFinite(earfcnNum)) {
    return earfcnNum >= 100000 ? "5G" : "4G";
  }
  return "Unknown";
}

const NUMERIC_FIELD_HINTS = new Set([
  "site",
  "site_id",
  "node_id",
  "nodeb_id",
  "cell_id",
  "sec_id",
  "pci",
  "azimuth",
  "bw",
  "height",
  "m_tilt",
  "e_tilt",
  "earfcn",
  "latitude",
  "longitude",
  "tac",
  "tbl_project_id",
  "tbl_upload_id",
  "uplink_center_frequency",
  "downlink_frequency",
  "frequency",
  "bandwidth",
  "beamwidth",
  "range",
]);

const EDITABLE_SITE_FIELDS = [
  "site",
  "site_name",
  "sector",
  "cell_id",
  "sec_id",
  "longitude",
  "latitude",
  "tac",
  "pci",
  "azimuth",
  "height",
  "bw",
  "m_tilt",
  "e_tilt",
  "maximum_transmission_power_of_resource",
  "real_transmit_power_of_resource",
  "reference_signal_power",
  "cellsize",
  "frequency",
  "band",
  "uplink_center_frequency",
  "downlink_frequency",
  "earfcn",
  "cluster",
  "Technology",
];

const EDIT_FIELD_ALIAS_MAP = {
  site: ["site", "site_id", "siteId", "site_key_inferred", "siteKeyInferred"],
  site_name: ["site_name", "siteName"],
  sector: ["sector", "sector_id", "sectorId"],
  cell_id: ["cell_id", "cellId", "cell_id_representative", "cellIdRepresentative"],
  sec_id: ["sec_id", "secId"],
  longitude: ["longitude", "lng", "lon", "lon_pred"],
  latitude: ["latitude", "lat", "lat_pred"],
  tac: ["tac"],
  pci: ["pci", "PCI", "pci_or_psi", "physical_cell_id", "physicalCellId"],
  azimuth: ["azimuth", "azimuth_deg_5", "azimuth_deg_5_soft"],
  height: ["height"],
  bw: ["bw", "beamwidth", "beamwidth_deg_est"],
  m_tilt: ["m_tilt", "mTilt"],
  e_tilt: ["e_tilt", "eTilt"],
  maximum_transmission_power_of_resource: ["maximum_transmission_power_of_resource"],
  real_transmit_power_of_resource: ["real_transmit_power_of_resource"],
  reference_signal_power: ["reference_signal_power"],
  cellsize: ["cellsize", "cell_size"],
  frequency: ["frequency"],
  band: ["band", "frequency_band"],
  uplink_center_frequency: ["uplink_center_frequency"],
  downlink_frequency: ["downlink_frequency"],
  earfcn: ["earfcn", "earfcn_or_narfcn", "earfcnOrNarfcn"],
  cluster: ["cluster", "operator", "network", "Network"],
  Technology: ["Technology", "technology", "tech"],
};

function isPrimitiveValue(value) {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function toComparableValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return String(value);
}

function convertFormValueForApi(key, rawValue, originalValue) {
  const value = String(rawValue ?? "");
  const trimmed = value.trim();
  if (trimmed === "") return null;

  if (typeof originalValue === "boolean") {
    return trimmed.toLowerCase() === "true";
  }

  if (typeof originalValue === "number" || NUMERIC_FIELD_HINTS.has(String(key || "").toLowerCase())) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
  }

  return value;
}

function pickValueByAliases(source, aliases = []) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, alias)) {
      return source[alias];
    }
  }
  return undefined;
}

function normalizeSiteRows(rows = []) {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((item, index) => ({
      ...item,
      site:
        item.site_key_inferred ||
        item.siteKeyInferred ||
        item.site ||
        item.site_id ||
        item.siteId ||
        item.site_name ||
        item.siteName ||
        item.nodeb_id ||
        item.nodebId ||
        item.cell_id_representative ||
        item.cellIdRepresentative ||
        `site_${index}`,
      lat: parseFloat(item.lat_pred || item.lat || item.latitude || 0),
      lng: parseFloat(item.lon_pred || item.lng || item.lon || item.longitude || 0),
      azimuth: parseFloat(item.azimuth_deg_5 || item.azimuth_deg_5_soft || item.azimuth || 0),
      beamwidth: parseFloat(item.beamwidth_deg_est || item.beamwidth || 65),
      range: parseFloat(item.range || item.radius || 220),
      operator: item.network || item.Network || item.operator || item.cluster || "Unknown",
      band: item.band || item.frequency_band || item.frequency || "Unknown",
      technology: inferTechnologyFromCarrier(
        item.Technology || item.tech || item.technology,
        item.earfcn_or_narfcn ?? item.earfcn,
      ),
      pci: item.pci ?? item.PCI ?? item.pci_or_psi ?? item.cell_id ?? item.cell_id_representative,
      earfcnOrNarfcn: item.earfcn_or_narfcn ?? item.earfcnOrNarfcn ?? item.earfcn ?? null,
      siteKeyInferred: item.site_key_inferred ?? item.siteKeyInferred ?? null,
      cellIdRepresentative: item.cell_id_representative ?? item.cellIdRepresentative ?? null,
      samples: Number.isFinite(Number(item.samples)) ? Number(item.samples) : null,
      azimuthReliability: Number.isFinite(Number(item.azimuth_reliability))
        ? Number(item.azimuth_reliability)
        : null,
      medianSampleDistanceM: Number.isFinite(Number(item.median_sample_distance_m))
        ? Number(item.median_sample_distance_m)
        : null,
      nodebId:
        extractNodebId(item) ??
        normalizeMatchValue(
          item.site_key_inferred ??
            item.site ??
            item.site_id ??
            item.siteId ??
            item.site_name ??
            item.cell_id_representative,
        ),
    }))
    .filter((item) => item.lat !== 0 && Number.isFinite(item.lat) && Number.isFinite(item.lng));
}

function generateSectorsFromSite(site, siteIndex, colorMode = "Operator") {
  const sectors = [];
  const parsedSectorCount = Number(site.sector_count ?? site.sectorCount);
  const hasSingleSectorHint =
    site.sector !== undefined &&
    site.sector !== null &&
    String(site.sector).trim() !== "";
  const sectorCount =
    Number.isFinite(parsedSectorCount) && parsedSectorCount > 0
      ? parsedSectorCount
      : hasSingleSectorHint
        ? 1
        : 3;

  const lat = parseFloat(site.lat ?? site.latitude ?? site.lat_pred ?? site.Lat ?? 0);
  const lng = parseFloat(site.lng ?? site.longitude ?? site.lon_pred ?? site.lon ?? site.Lng ?? 0);

  const baseAzimuth = parseFloat(site.azimuth ?? site.azimuth_deg_5 ?? 0);
  const beamwidth = parseFloat(site.beamwidth ?? site.beamwidth_deg_est ?? site.bw ?? 65);
  const range = parseFloat(site.range ?? 220);

  const network = site.operator || site.network || site.cluster || "Unknown";
  const band = site.band || site.frequency_band || site.frequency || "Unknown";
  const earfcnOrNarfcn = site.earfcn_or_narfcn ?? site.earfcnOrNarfcn ?? site.earfcn ?? null;
  const tech = inferTechnologyFromCarrier(
    site.tech || site.Technology || site.technology,
    earfcnOrNarfcn,
  );
  const pci =
    site.pci ??
    site.PCI ??
    site.pci_or_psi ??
    site.physical_cell_id ??
    site.cell_id ??
    site.cell_id_representative;
  const nodebId = extractNodebId(site);
  const siteIdResolved = getSiteId(site);
  const siteNameResolved = getSiteName(site);
  const siteKeyInferred = String(site.site_key_inferred ?? site.siteKeyInferred ?? siteIdResolved).trim();
  const cellIdRepresentative = String(
    site.cell_id_representative ?? site.cellIdRepresentative ?? site.cell_id ?? site.cellId ?? "",
  ).trim();
  const cellIdRaw = site.cell_id ?? site.cellId ?? null;
  const sectorRaw = site.sector ?? site.sector_id ?? site.sectorId ?? null;
  const samples = Number.isFinite(Number(site.samples)) ? Number(site.samples) : null;
  const azimuthReliability = Number.isFinite(Number(site.azimuth_reliability ?? site.azimuthReliability))
    ? Number(site.azimuth_reliability ?? site.azimuthReliability)
    : null;
  const medianSampleDistanceM = Number.isFinite(
    Number(site.median_sample_distance_m ?? site.medianSampleDistanceM),
  )
    ? Number(site.median_sample_distance_m ?? site.medianSampleDistanceM)
    : null;

  let color;
  const mode = colorMode.toLowerCase();
  if (mode === "band") {
    color = getBandColor(band);
  } else if (mode === "technology") {
    color = getTechnologyColor(tech);
  } else {
    color = getProviderColor(network);
  }

  if (Number.isNaN(lat) || Number.isNaN(lng) || (lat === 0 && lng === 0)) return [];

  const azimuthSpacing = 360 / sectorCount;
  for (let i = 0; i < sectorCount; i++) {
    const azimuth = (baseAzimuth + i * azimuthSpacing) % 360;
    const siteIdPart = siteIdResolved || `site_${siteIndex}`;
    const rowIdPart = String(site.id ?? site.cell_id ?? siteIndex);
    const sectorPart = String(site.sector ?? site.sector_id ?? i);
    sectors.push({
      id: `sector-${siteIdPart}-${rowIdPart}-${sectorPart}-${i}`,
      sourceRowId: site.id != null ? Number(site.id) : null,
      rawSite: site,
      lat,
      lng,
      azimuth,
      beamwidth,
      color,
      network,
      technology: tech,
      band,
      earfcnOrNarfcn,
      range,
      pci: pci !== null && pci !== undefined ? String(pci).trim() : null,
      nodebId,
      siteId: siteIdResolved,
      siteName: siteNameResolved,
      siteNameRaw:
        site.site_name != null && String(site.site_name).trim() !== ""
          ? String(site.site_name).trim()
          : "",
      siteKeyInferred: siteKeyInferred || null,
      cellIdRepresentative: cellIdRepresentative || null,
      cellId: cellIdRaw != null && String(cellIdRaw).trim() !== "" ? String(cellIdRaw).trim() : null,
      sector: sectorRaw != null && String(sectorRaw).trim() !== "" ? String(sectorRaw).trim() : null,
      samples,
      azimuthReliability,
      medianSampleDistanceM,
    });
  }
  return sectors;
}

const NetworkPlannerMap = ({
  radius = 120,
  projectId,
  siteToggle = "NoML",
  enableSiteToggle = true,
  showSiteMarkers = true,
  showSiteSectors = true,
  onDataLoaded,
  viewport = null,
  colorMode = "Operator",
  options = {},
  hoveredLog,
  map = null,
  selectedMetric = "rsrp",
  onlyInsidePolygons = false,
  filterPolygons = [],
  thresholds = {},
  getMetricColor = null,
  onSiteSelect = null,
}) => {
  const { siteData, loading, error } = useSiteData({
    enableSiteToggle,
    siteToggle,
    projectId,
    autoFetch: true,
    filterEnabled: onlyInsidePolygons,
    polygons: filterPolygons,
  });

  const polygonRefs = useRef(new Set());
  const markerRefs = useRef(new Set());
  const polylineRefs = useRef(new Set());
  const mountedRef = useRef(true);
  const siteFetchTokenRef = useRef({});
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);
  const [selectedSiteDataById, setSelectedSiteDataById] = useState({});
  const [loadingSitesQueue, setLoadingSitesQueue] = useState(new Set());
  const [selectedSectorInfo, setSelectedSectorInfo] = useState(null);
  const [isSavingSectorEdit, setIsSavingSectorEdit] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [sectorEditFormData, setSectorEditFormData] = useState({});
  const [sectorEditOriginalData, setSectorEditOriginalData] = useState({});

  const normalizedPolygonPaths = useMemo(() => {
    if (!Array.isArray(filterPolygons) || filterPolygons.length === 0) return [];
    return filterPolygons
      .map((poly) => {
        if (Array.isArray(poly?.paths?.[0])) return poly.paths[0];
        if (Array.isArray(poly?.paths) && poly.paths[0]?.lat != null) return poly.paths;
        if (Array.isArray(poly?.path) && poly.path[0]?.lat != null) return poly.path;
        return [];
      })
      .filter((path) => Array.isArray(path) && path.length >= 3);
  }, [filterPolygons]);

  const pointInsideAnyPolygon = useCallback(
    (point) => {
      if (!onlyInsidePolygons || normalizedPolygonPaths.length === 0) return true;
      const lat = Number(point?.lat);
      const lng = Number(point?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

      for (const path of normalizedPolygonPaths) {
        let inside = false;
        for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
          const xi = path[i].lng;
          const yi = path[i].lat;
          const xj = path[j].lng;
          const yj = path[j].lat;
          if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
            inside = !inside;
          }
        }
        if (inside) return true;
      }
      return false;
    },
    [onlyInsidePolygons, normalizedPolygonPaths],
  );

  const clearMapOverlays = useCallback(() => {
    polygonRefs.current.forEach((poly) => {
      try {
        poly?.setMap?.(null);
      } catch {
        // no-op
      }
    });
    polylineRefs.current.forEach((line) => {
      try {
        line?.setMap?.(null);
      } catch {
        // no-op
      }
    });
    polygonRefs.current.clear();
    polylineRefs.current.clear();
    markerRefs.current.forEach((marker) => {
      try {
        marker?.setMap?.(null);
      } catch {
        // no-op
      }
    });
    markerRefs.current.clear();
  }, []);

  const clearSectorOverlays = useCallback(() => {
    polygonRefs.current.forEach((poly) => {
      try {
        poly?.setMap?.(null);
      } catch {
        // no-op
      }
    });
    polylineRefs.current.forEach((line) => {
      try {
        line?.setMap?.(null);
      } catch {
        // no-op
      }
    });
    polygonRefs.current.clear();
    polylineRefs.current.clear();
  }, []);

  const selectedSiteIdSet = useMemo(() => new Set(selectedSiteIds), [selectedSiteIds]);

  useEffect(() => {
    if (onDataLoaded) {
      onDataLoaded(siteData, loading);
    }
  }, [siteData, loading, onDataLoaded]);

  useEffect(() => {
    if (!enableSiteToggle) {
      clearMapOverlays();
      setSelectedSiteIds([]);
      setSelectedSiteDataById({});
      setSelectedSectorInfo(null);
      setIsEditDialogOpen(false);
      setSectorEditFormData({});
      setSectorEditOriginalData({});
      siteFetchTokenRef.current = {};
      setLoadingSitesQueue(new Set());
    }
  }, [enableSiteToggle, clearMapOverlays, siteToggle]);

  useEffect(() => {
    if (showSiteSectors) return;
    clearSectorOverlays();
    setSelectedSectorInfo(null);
    setIsEditDialogOpen(false);
  }, [showSiteSectors, clearSectorOverlays]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearMapOverlays();
    };
  }, [clearMapOverlays]);

  const filteredSiteData = useMemo(() => {
    if (!onlyInsidePolygons || normalizedPolygonPaths.length === 0) return siteData;
    return siteData.filter((site) => {
      const lat = parseFloat(site.lat ?? site.latitude ?? site.lat_pred ?? 0);
      const lng = parseFloat(site.lng ?? site.longitude ?? site.lon_pred ?? site.lon ?? 0);
      return pointInsideAnyPolygon({ lat, lng });
    });
  }, [siteData, onlyInsidePolygons, normalizedPolygonPaths, pointInsideAnyPolygon]);

  const allSectors = useMemo(
    () => filteredSiteData.flatMap((site, idx) => generateSectorsFromSite(site, idx, colorMode)),
    [filteredSiteData, colorMode],
  );

  const uniqueSectors = useMemo(() => {
    const seen = new Set();
    const result = [];
    allSectors.forEach((sector, index) => {
      const renderKey = [
        sector.id,
        Number(sector.lat).toFixed(7),
        Number(sector.lng).toFixed(7),
        Number(sector.azimuth).toFixed(2),
        Number(sector.beamwidth).toFixed(2),
        index,
      ].join("|");
      if (seen.has(renderKey)) return;
      seen.add(renderKey);
      result.push({
        ...sector,
        renderKey,
      });
    });
    return result;
  }, [allSectors]);

  const siteMarkers = useMemo(() => {
    const bySite = new Map();

    filteredSiteData.forEach((item) => {
      const siteId = getSiteId(item);
      if (!siteId) return;

      if (!bySite.has(siteId)) {
        const lat = parseFloat(item.lat ?? item.latitude ?? item.lat_pred ?? 0);
        const lng = parseFloat(item.lng ?? item.longitude ?? item.lon_pred ?? item.lon ?? 0);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        bySite.set(siteId, {
          siteId,
          siteName: getSiteName(item),
          lat,
          lng,
        });
      }
    });

    return Array.from(bySite.values());
  }, [filteredSiteData]);

  const fetchSitePayload = useCallback(
    async (siteMarker) => {
      const baseParams = { projectId: projectId || "" };
      const candidateParams = [
        { ...baseParams, siteId: siteMarker.siteId },
        { ...baseParams, site_id: siteMarker.siteId },
        { ...baseParams, site: siteMarker.siteId },
        { ...baseParams, siteName: siteMarker.siteName },
      ];

      let rows = [];
      for (const params of candidateParams) {
        try {
          const res = await mapViewApi.getSitePrediction(params);
          const rawRows = res?.Data || res?.data?.Data || res?.data || [];
          const normalizedAll = normalizeSiteRows(rawRows);
          const normalizedMatch = normalizedAll.filter(
            (r) => getSiteId(r) === siteMarker.siteId,
          );

          if (normalizedMatch.length > 0) {
            rows = normalizedMatch;
            break;
          }
          if (normalizedAll.length > 0) {
            rows = normalizedAll;
            break;
          }
        } catch {
          toast.error("Failed to fetch site data");
          
        }
      }

      if (rows.length === 0) {
        rows = filteredSiteData.filter((r) => getSiteId(r) === siteMarker.siteId);
      }

      const sectors = rows
        .flatMap((site, idx) => generateSectorsFromSite(site, idx, colorMode))
        .filter((s) => pointInsideAnyPolygon({ lat: s.lat, lng: s.lng }));

      return { sectors, lteRows: [] };
    },
    [projectId, filteredSiteData, colorMode, selectedMetric, pointInsideAnyPolygon],
  );

  const loadSiteData = useCallback(
    async (siteMarker, forceRefresh = false) => {
      if (!siteMarker?.siteId) return;
      const siteId = siteMarker.siteId;
      const metricKey = String(selectedMetric || "rsrp").toLowerCase();
      const cached = selectedSiteDataById[siteId];
      if (
        !forceRefresh &&
        cached &&
        cached.metricKey === metricKey &&
        cached.colorMode === colorMode
      ) {
        return;
      }

      const token = `${Date.now()}-${Math.random()}`;
      siteFetchTokenRef.current[siteId] = token;
      setLoadingSitesQueue((prev) => {
        const next = new Set(prev);
        next.add(siteId);
        return next;
      });

      try {
        const { sectors, lteRows } = await fetchSitePayload(siteMarker);
        if (!mountedRef.current) return;
        if (siteFetchTokenRef.current[siteId] !== token) return;

        setSelectedSiteDataById((prev) => ({
          ...prev,
          [siteId]: {
            siteName: siteMarker.siteName,
            sectors,
            lteRows,
            metricKey,
            colorMode,
          },
        }));
      } finally {
        if (siteFetchTokenRef.current[siteId] === token) {
          delete siteFetchTokenRef.current[siteId];
        }
        if (mountedRef.current) {
          setLoadingSitesQueue((prev) => {
            const next = new Set(prev);
            next.delete(siteId);
            return next;
          });
        }
      }
    },
    [colorMode, fetchSitePayload, selectedMetric, selectedSiteDataById],
  );

  const handleSiteMarkerClick = useCallback(
    async (siteMarker) => {
      if (!siteMarker?.siteId) return;
      const siteId = siteMarker.siteId;
      setSelectedSectorInfo(null);

      if (selectedSiteIdSet.has(siteId)) {
        const nextIds = selectedSiteIds.filter((id) => id !== siteId);
        setSelectedSiteIds(nextIds);
        if (onSiteSelect) onSiteSelect(nextIds);
        return;
      }

      const nextIds = [...selectedSiteIds, siteId];
      setSelectedSiteIds(nextIds);
      if (onSiteSelect) onSiteSelect(nextIds);
      await loadSiteData(siteMarker);
    },
    [loadSiteData, selectedSiteIdSet, selectedSiteIds, onSiteSelect],
  );

  const handleSelectAllSites = useCallback(async () => {
    if (!Array.isArray(siteMarkers) || siteMarkers.length === 0) return;
    setSelectedSectorInfo(null);
    const allIds = siteMarkers.map((site) => site.siteId);
    setSelectedSiteIds(allIds);
    if (onSiteSelect) onSiteSelect(allIds);
    await Promise.all(siteMarkers.map((site) => loadSiteData(site)));
  }, [loadSiteData, siteMarkers, onSiteSelect]);

  const handleClearSelectedSites = useCallback(() => {
    setSelectedSectorInfo(null);
    setSelectedSiteIds([]);
    if (onSiteSelect) onSiteSelect([]);
  }, [onSiteSelect]);

  useEffect(() => {
    if (!Array.isArray(siteMarkers) || siteMarkers.length === 0) return;
    if (!Array.isArray(selectedSiteIds) || selectedSiteIds.length === 0) return;

    const siteById = new Map(siteMarkers.map((site) => [site.siteId, site]));
    selectedSiteIds.forEach((siteId) => {
      const siteMarker = siteById.get(siteId);
      if (!siteMarker) return;
      const cached = selectedSiteDataById[siteId];
      const metricKey = String(selectedMetric || "rsrp").toLowerCase();
      if (!cached || cached.metricKey !== metricKey || cached.colorMode !== colorMode) {
        void loadSiteData(siteMarker, true);
      }
    });
  }, [colorMode, loadSiteData, selectedMetric, selectedSiteDataById, selectedSiteIds, siteMarkers]);

  const selectedSiteSectors = useMemo(() => {
    if (!Array.isArray(selectedSiteIds) || selectedSiteIds.length === 0) return [];
    const merged = selectedSiteIds.flatMap((id) => selectedSiteDataById[id]?.sectors || []);
    const seen = new Set();
    return merged.filter((sector, idx) => {
      const key =
        sector.renderKey ||
        [
          sector.id || `sector-${idx}`,
          Number(sector.lat).toFixed(7),
          Number(sector.lng).toFixed(7),
          Number(sector.azimuth).toFixed(2),
          Number(sector.beamwidth).toFixed(2),
          idx,
        ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [selectedSiteDataById, selectedSiteIds]);

  const selectedSiteLteLocations = useMemo(() => {
    if (!Array.isArray(selectedSiteIds) || selectedSiteIds.length === 0) return [];
    return selectedSiteIds.flatMap((siteId) =>
      (selectedSiteDataById[siteId]?.lteRows || []).map((row) => ({
        ...row,
        siteId: row.siteId || siteId,
      })),
    );
  }, [selectedSiteDataById, selectedSiteIds]);

  const sectorsToRender = useMemo(() => {
    if (!showSiteSectors) return [];
    const source =
      selectedSiteIds.length > 0 && selectedSiteSectors.length > 0 ? selectedSiteSectors : uniqueSectors;
    const seen = new Set();
    return source.filter((sector, idx) => {
      const key =
        sector.renderKey ||
        [
          sector.id || `sector-${idx}`,
          Number(sector.lat).toFixed(7),
          Number(sector.lng).toFixed(7),
          Number(sector.azimuth).toFixed(2),
          Number(sector.beamwidth).toFixed(2),
          idx,
        ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [showSiteSectors, selectedSiteIds, selectedSiteSectors, uniqueSectors]);

  const visibleSectors = useMemo(() => {
    if (!viewport) return sectorsToRender;
    return sectorsToRender.filter(
      (s) =>
        s.lat >= viewport.south &&
        s.lat <= viewport.north &&
        s.lng >= viewport.west &&
        s.lng <= viewport.east,
    );
  }, [sectorsToRender, viewport]);

  const visibleSiteMarkers = useMemo(() => {
    if (!viewport) return siteMarkers;
    return siteMarkers.filter(
      (s) =>
        s.lat >= viewport.south &&
        s.lat <= viewport.north &&
        s.lng >= viewport.west &&
        s.lng <= viewport.east,
    );
  }, [siteMarkers, viewport]);

  const logCoords = useMemo(() => {
    if (!hoveredLog) return null;

    const lat = parseFloat(hoveredLog.lat ?? hoveredLog.latitude ?? hoveredLog.Lat);
    const lng = parseFloat(hoveredLog.lng ?? hoveredLog.longitude ?? hoveredLog.Lng ?? hoveredLog.lon);

    if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
    return null;
  }, [hoveredLog]);

  const logPci = useMemo(() => {
    if (!hoveredLog) return null;
    return extractPciValue(hoveredLog);
  }, [hoveredLog]);

  const openSectorInfo = useCallback((sector, infoPos) => {
    const next = {
      ...sector,
      renderKey: sector.renderKey,
      infoPos,
    };
    setSelectedSectorInfo(next);
  }, []);

  const openSiteEditDialog = useCallback((sector) => {
    if (!sector) return;
    if (String(siteToggle || "").toLowerCase() !== "cell") {
      toast.info("Editing is available only for Cell toggle (site_prediction).");
      return;
    }

    const raw = sector.rawSite && typeof sector.rawSite === "object" ? sector.rawSite : {};
    const source = { ...raw };
    const seed = { id: raw.id ?? sector.sourceRowId ?? null };

    EDITABLE_SITE_FIELDS.forEach((field) => {
      const aliases = EDIT_FIELD_ALIAS_MAP[field] || [field];
      let value = pickValueByAliases(source, aliases);

      if (value === undefined) {
        if (field === "site_name") value = sector.siteNameRaw ?? sector.siteName ?? null;
        else if (field === "sector") value = sector.sector ?? null;
        else if (field === "cell_id") value = sector.cellId ?? sector.cellIdRepresentative ?? null;
        else if (field === "pci") value = sector.pci ?? null;
        else if (field === "Technology") value = sector.technology ?? null;
        else if (field === "band") value = sector.band ?? null;
        else if (field === "azimuth") value = sector.azimuth ?? null;
        else if (field === "latitude") value = sector.lat ?? null;
        else if (field === "longitude") value = sector.lng ?? null;
        else if (field === "cluster") value = sector.network ?? null;
      }

      if (isPrimitiveValue(value) || value === null) {
        seed[field] = value ?? null;
      }
    });

    const formState = Object.fromEntries(
      Object.entries(seed).map(([key, value]) => [
        key,
        value === null || value === undefined ? "" : String(value),
      ]),
    );

    setSectorEditOriginalData(seed);
    setSectorEditFormData(formState);
    setIsEditDialogOpen(true);
  }, [siteToggle]);

  const handleSectorEditFieldChange = useCallback((field, value) => {
    setSectorEditFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleSectorEditSave = useCallback(async () => {
    if (!selectedSectorInfo) return;
    const rowId = Number(sectorEditOriginalData.id ?? selectedSectorInfo.sourceRowId);
    if (!Number.isFinite(rowId) || rowId <= 0) {
      toast.error("Unable to update this site row: missing row id.");
      return;
    }

    const azimuthValue = String(sectorEditFormData.azimuth ?? "").trim();
    if (azimuthValue !== "") {
      const azimuthNumber = Number(azimuthValue);
      if (!Number.isFinite(azimuthNumber) || azimuthNumber < 0 || azimuthNumber > 360) {
        toast.error("Azimuth must be a number between 0 and 360.");
        return;
      }
    }

    const latitudeValue = String(sectorEditFormData.latitude ?? "").trim();
    if (latitudeValue !== "") {
      const latitudeNumber = Number(latitudeValue);
      if (!Number.isFinite(latitudeNumber) || latitudeNumber < -90 || latitudeNumber > 90) {
        toast.error("Latitude must be between -90 and 90.");
        return;
      }
    }

    const longitudeValue = String(sectorEditFormData.longitude ?? "").trim();
    if (longitudeValue !== "") {
      const longitudeNumber = Number(longitudeValue);
      if (!Number.isFinite(longitudeNumber) || longitudeNumber < -180 || longitudeNumber > 180) {
        toast.error("Longitude must be between -180 and 180.");
        return;
      }
    }

    const payloadItem = { id: rowId };
    Object.keys(sectorEditFormData).forEach((key) => {
      if (key === "id") return;
      const originalValue = sectorEditOriginalData[key];
      const converted = convertFormValueForApi(key, sectorEditFormData[key], originalValue);
      if (toComparableValue(originalValue) !== toComparableValue(converted)) {
        payloadItem[key] = converted;
      }
    });

    if (Object.keys(payloadItem).length === 1) {
      toast.info("No changes to save.");
      setIsEditDialogOpen(false);
      return;
    }

    if ("site_name" in payloadItem && String(payloadItem.site_name ?? "").trim() === "") {
      payloadItem.site_name = null;
    }
    if ("sector" in payloadItem && String(payloadItem.sector ?? "").trim() === "") {
      payloadItem.sector = null;
    }

    setIsSavingSectorEdit(true);
    try {
      const response = await mapViewApi.updateSitePrediction([payloadItem]);
      const rowsAffected =
        Number(response?.Data ?? response?.data?.Data ?? response?.rowsAffected ?? response?.RowsAffected ?? 0) || 0;

      const nextRaw = {
        ...(selectedSectorInfo.rawSite || {}),
        ...payloadItem,
        id: rowId,
      };
      const nextSiteName = String(nextRaw.site_name ?? selectedSectorInfo.siteNameRaw ?? "").trim();
      const nextSector = String(nextRaw.sector ?? selectedSectorInfo.sector ?? "").trim();
      const nextAzimuth = Number(nextRaw.azimuth ?? selectedSectorInfo.azimuth ?? 0);
      const nextBand = String(nextRaw.band ?? selectedSectorInfo.band ?? "").trim();
      const nextPci =
        nextRaw.pci ?? nextRaw.PCI ?? nextRaw.pci_or_psi ?? nextRaw.cell_id ?? selectedSectorInfo.pci ?? null;
      const nextTechnology = inferTechnologyFromCarrier(
        nextRaw.technology ?? nextRaw.Technology ?? nextRaw.tech ?? selectedSectorInfo.technology,
        nextRaw.earfcn_or_narfcn ?? nextRaw.earfcnOrNarfcn ?? nextRaw.earfcn,
      );
      const nextNetwork = String(
        nextRaw.network ?? nextRaw.Network ?? nextRaw.operator ?? nextRaw.cluster ?? selectedSectorInfo.network ?? "",
      ).trim();
      const nextNodeId = extractNodebId(nextRaw) ?? selectedSectorInfo.nodebId ?? null;
      const nextCellId =
        nextRaw.cell_id ??
        nextRaw.cellId ??
        nextRaw.cell_id_representative ??
        nextRaw.cellIdRepresentative ??
        selectedSectorInfo.cellId ??
        selectedSectorInfo.cellIdRepresentative ??
        null;

      setSelectedSiteDataById((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((siteId) => {
          const existing = next[siteId];
          if (!existing?.sectors) return;
          next[siteId] = {
            ...existing,
            sectors: existing.sectors.map((sector) => {
              if (Number(sector.sourceRowId) !== rowId) return sector;
              return {
                ...sector,
                rawSite: nextRaw,
                siteNameRaw: nextSiteName,
                siteName: nextSiteName || sector.siteName || sector.siteId || "Unknown",
                sector: nextSector || null,
                azimuth: Number.isFinite(nextAzimuth) ? nextAzimuth : sector.azimuth,
                band: nextBand || sector.band,
                pci: nextPci !== null && nextPci !== undefined ? String(nextPci).trim() : sector.pci,
                technology: nextTechnology || sector.technology,
                network: nextNetwork || sector.network,
                nodebId: nextNodeId ?? sector.nodebId,
                cellId: nextCellId !== null && nextCellId !== undefined ? String(nextCellId).trim() : sector.cellId,
              };
            }),
          };
        });
        return next;
      });

      setSelectedSectorInfo((prev) =>
        prev && Number(prev.sourceRowId) === rowId
          ? {
              ...prev,
              rawSite: nextRaw,
              siteNameRaw: nextSiteName,
              siteName: nextSiteName || prev.siteName || prev.siteId || "Unknown",
              sector: nextSector || null,
              azimuth: Number.isFinite(nextAzimuth) ? nextAzimuth : prev.azimuth,
              band: nextBand || prev.band,
              pci: nextPci !== null && nextPci !== undefined ? String(nextPci).trim() : prev.pci,
              technology: nextTechnology || prev.technology,
              network: nextNetwork || prev.network,
              nodebId: nextNodeId ?? prev.nodebId,
              cellId: nextCellId !== null && nextCellId !== undefined ? String(nextCellId).trim() : prev.cellId,
            }
          : prev,
      );

      setSectorEditOriginalData(nextRaw);
      setSectorEditFormData(
        Object.fromEntries(
          Object.entries(nextRaw).map(([key, value]) => [
            key,
            value === null || value === undefined ? "" : String(value),
          ]),
        ),
      );
      setIsEditDialogOpen(false);
      toast.success(rowsAffected > 0 ? `Updated (${rowsAffected} row${rowsAffected > 1 ? "s" : ""}).` : "Site updated.");

      const marker = siteMarkers.find((item) => item.siteId === selectedSectorInfo.siteId);
      if (marker) {
        void loadSiteData(marker, true);
      }
    } catch (error) {
      toast.error(error?.message || "Failed to update site.");
    } finally {
      setIsSavingSectorEdit(false);
    }
  }, [selectedSectorInfo, sectorEditFormData, sectorEditOriginalData, siteMarkers, loadSiteData]);

  if (!enableSiteToggle) return null;
  if (error) return null;

  return (
    <>
      <div className="absolute right-3 top-3 z-[2100] flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void handleSelectAllSites();
          }}
          disabled={!siteMarkers.length}
          className="rounded bg-slate-900/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow disabled:cursor-not-allowed disabled:opacity-40"
        >
          Select All Sites
        </button>
        <button
          type="button"
          onClick={handleClearSelectedSites}
          disabled={selectedSiteIds.length === 0}
          className="rounded bg-slate-700/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear
        </button>
        <div className="rounded bg-blue-600/90 px-2 py-1 text-[11px] font-semibold text-white shadow">
          {selectedSiteIds.length} selected
        </div>
      </div>

      {showSiteMarkers &&
        visibleSiteMarkers.map((site) => (
          <MarkerF
            key={`site-${site.siteId}`}
            position={{ lat: site.lat, lng: site.lng }}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: selectedSiteIdSet.has(site.siteId) ? 7 : 5,
              fillColor: selectedSiteIdSet.has(site.siteId) ? "#dc2626" : "#2563eb",
              fillOpacity: 0.95,
              strokeColor: "#ffffff",
              strokeWeight: 1.5,
            }}
            zIndex={selectedSiteIdSet.has(site.siteId) ? 4001 : 3001}
            onClick={() => {
              void handleSiteMarkerClick(site);
            }}
            onLoad={(marker) => {
              if (marker) markerRefs.current.add(marker);
            }}
            onUnmount={(marker) => {
              if (marker) markerRefs.current.delete(marker);
            }}
          />
        ))}

      {loadingSitesQueue.size > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[2100] rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-md">
          Loading {loadingSitesQueue.size} site(s)...
        </div>
      )}

      {visibleSectors.map((sector, index) => {
        const p0 = { lat: sector.lat, lng: sector.lng };
        const r = (sector.range || radius) * (options.scale || 1);
        const p1 = computeOffset(p0, r, sector.azimuth - sector.beamwidth / 2);
        const p2 = computeOffset(p0, r, sector.azimuth + sector.beamwidth / 2);
        const sectorRenderKey =
          sector.renderKey ||
          [
            sector.id || `sector-${index}`,
            Number(sector.lat).toFixed(7),
            Number(sector.lng).toFixed(7),
            Number(sector.azimuth).toFixed(2),
            Number(sector.beamwidth).toFixed(2),
            index,
          ].join("|");
        const infoPos = {
          lat: (p0.lat + p1.lat + p2.lat) / 3,
          lng: (p0.lng + p1.lng + p2.lng) / 3,
        };

        const activeCoords = logCoords;
        const sectorPci = normalizeMatchValue(sector.pci);
        const isHoveredMatch = logPci !== null && sectorPci !== null && sectorPci === logPci;
        const isSelectedSector = selectedSectorInfo?.renderKey === sectorRenderKey;
        const infoSector = isSelectedSector ? selectedSectorInfo || sector : sector;
        const canEditSitePrediction = String(siteToggle || "").toLowerCase() === "cell";

        return (
          <React.Fragment key={sectorRenderKey}>
            <PolygonF
              paths={[p0, p1, p2]}
              options={{
                fillColor: sector.color,
                fillOpacity: isSelectedSector ? 0.95 : isHoveredMatch ? 0.9 : options.opacity || 0.6,
                strokeWeight: isSelectedSector ? 2 : 1,
                strokeColor: isSelectedSector ? "#111827" : isHoveredMatch ? "#FF0000" : sector.color,
                zIndex: isSelectedSector ? 3000 : isHoveredMatch ? 2001 : 2000,
              }}
              onClick={() => openSectorInfo({ ...sector, renderKey: sectorRenderKey }, infoPos)}
              onRightClick={() => {
                const nextSector = { ...sector, renderKey: sectorRenderKey };
                openSectorInfo(nextSector, infoPos);
                openSiteEditDialog(nextSector);
              }}
              onLoad={(polygon) => {
                if (polygon) polygonRefs.current.add(polygon);
              }}
              onUnmount={(polygon) => {
                if (polygon) polygonRefs.current.delete(polygon);
              }}
            />

            {isHoveredMatch && activeCoords && (
              <PolylineF
                path={[p0, activeCoords]}
                options={{
                  strokeColor: "#000000",
                  strokeOpacity: 1.0,
                  strokeWeight: 2,
                  zIndex: 999999,
                }}
                onLoad={(polyline) => {
                  if (polyline) polylineRefs.current.add(polyline);
                }}
                onUnmount={(polyline) => {
                  if (polyline) polylineRefs.current.delete(polyline);
                }}
              />
            )}

            {isSelectedSector && (
              <InfoWindowF
                position={selectedSectorInfo.infoPos}
                onCloseClick={() => {
                  setSelectedSectorInfo(null);
                }}
              >
                <div className="min-w-[210px] border border-slate-300 bg-white p-2 text-xs shadow-sm">
                  <div className="mb-1 flex items-center justify-between border-b border-slate-200 pb-1 font-semibold">
                    <span>Site Info</span>
                    <button
                      type="button"
                      onClick={() => openSiteEditDialog(infoSector)}
                      disabled={!canEditSitePrediction}
                      className="rounded bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      title={
                        canEditSitePrediction
                          ? "Edit site fields"
                          : "Switch Site toggle to Cell to edit site_prediction fields"
                      }
                    >
                      Edit
                    </button>
                  </div>
                  <div>Site ID: {infoSector.siteId || "N/A"}</div>
                  <div>Cell ID: {infoSector.cellId || infoSector.cellIdRepresentative || "N/A"}</div>
                  <div>NodeB ID: {infoSector.nodebId || "N/A"}</div>
                  <div>PCI: {infoSector.pci || "N/A"}</div>
                  <div>Network: {infoSector.network || "N/A"}</div>
                  <div>Technology: {infoSector.technology || "N/A"}</div>
                  <div>Band: {infoSector.band || "N/A"}</div>
                </div>
              </InfoWindowF>
            )}
          </React.Fragment>
        );
      })}

      <EditSiteFormDialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
        }}
        formValues={sectorEditFormData}
        onFieldChange={handleSectorEditFieldChange}
        onSave={() => {
          void handleSectorEditSave();
        }}
        submitting={isSavingSectorEdit}
      />
    </>
  );
};

export default React.memo(NetworkPlannerMap);
