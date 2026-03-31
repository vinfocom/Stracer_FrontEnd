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
  return normalizeComparableSiteId(
    site?.site ??
      site?.site_id ??
      site?.siteId ??
      site?.site_key_inferred ??
      site?.siteKeyInferred ??
      site?.nodeb_id ??
      site?.nodebId ??
      site?.id ??
      "",
  );
}

function getSiteName(site) {
  return String(
    site?.site_name ||
      site?.siteName ||
      site?.site ||
      site?.site_id ||
      site?.siteId ||
      site?.site_key_inferred ||
      site?.siteKeyInferred ||
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
    "site_id",
    "siteId",
    "site",
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

function getFirstFiniteNumber(values = [], fallback = 0) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return fallback;
}

function normalizeBeamwidth(value, fallback = 65) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(5, Math.min(180, numeric));
}

function normalizeSectorRange(value, fallback = 220) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(20, Math.min(5000, numeric));
}

function normalizeBaselineLteMetric(metric) {
  const raw = String(metric || "rsrp").trim().toLowerCase();
  if (raw === "rsrq") return "RSRQ";
  if (raw === "sinr" || raw === "snr") return "SINR";
  return "RSRP";
}

function normalizeLteRows(rawRows = [], fallbackSiteId = "", selectedMetric = "rsrp") {
  if (!Array.isArray(rawRows)) return [];
  const metricLower = String(selectedMetric || "rsrp").trim().toLowerCase();
  const metricCandidates =
    metricLower === "rsrq"
      ? ["reference_signal_quality", "rsrq"]
      : metricLower === "sinr" || metricLower === "snr"
        ? ["signal_to_noise_ratio", "sinr", "snr"]
        : ["reference_signal_power", "rsrp"];
  const genericCandidates = [
    "value",
    "Value",
    "measured",
    "measured_value",
    "metric_value",
    "avg_value",
    metricLower,
    metricLower.toUpperCase(),
  ];

  return rawRows
    .map((item) => {
      const lat = Number(
        item?.lat ??
          item?.latitude ??
          item?.Lat ??
          item?.Latitude ??
          item?.LATITUDE,
      );
      const lng = Number(
        item?.lng ??
          item?.lon ??
          item?.longitude ??
          item?.Lng ??
          item?.Lon ??
          item?.Longitude ??
          item?.LONGITUDE,
      );
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      let rawValue = item?.value;
      if (rawValue === undefined || rawValue === null) {
        const allCandidates = [...metricCandidates, ...genericCandidates];
        for (const key of allCandidates) {
          if (Object.prototype.hasOwnProperty.call(item, key)) {
            rawValue = item[key];
            break;
          }
        }
      }
      if (rawValue === undefined || rawValue === null) {
        const metricHint = metricLower.replace(/[^a-z0-9]/g, "");
        const hintedKey = Object.keys(item || {}).find((k) =>
          String(k || "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
            .includes(metricHint),
        );
        if (hintedKey) rawValue = item[hintedKey];
      }

      const value = Number(rawValue);
      const sampleCount = Number(item?.sampleCount ?? item?.sample_count ?? 1);
      const siteId = String(item?.siteId ?? item?.site_id ?? item?.site ?? fallbackSiteId ?? "").trim();

      return {
        ...item,
        lat,
        lng,
        latitude: lat,
        longitude: lng,
        value: Number.isFinite(value) ? value : null,
        sampleCount: Number.isFinite(sampleCount) ? sampleCount : 1,
        siteId,
      };
    })
    .filter(Boolean);
}

function computeDistanceMeters(a, b) {
  const lat1 = Number(a?.lat);
  const lng1 = Number(a?.lng);
  const lat2 = Number(b?.lat);
  const lng2 = Number(b?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const aa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return earthRadius * c;
}

function dedupeLteRows(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const seen = new Set();
  const deduped = [];
  rows.forEach((row) => {
    const key = [
      Number(row?.lat).toFixed(6),
      Number(row?.lng).toFixed(6),
      Number.isFinite(Number(row?.value)) ? Number(row.value).toFixed(2) : "na",
      String(row?.siteId || "").trim(),
    ].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(row);
  });
  return deduped;
}

const MAX_SITE_LTE_POINTS = 3000;
const LTE_FALLBACK_RADIUS_METERS = 3000;
const MAX_RENDERED_LTE_MARKERS = 700;

function downsampleRows(rows = [], maxCount = MAX_RENDERED_LTE_MARKERS) {
  if (!Array.isArray(rows) || rows.length <= maxCount) return Array.isArray(rows) ? rows : [];
  const stride = Math.ceil(rows.length / maxCount);
  const sampled = [];
  for (let i = 0; i < rows.length; i += stride) {
    sampled.push(rows[i]);
  }
  if (sampled.length > maxCount) sampled.length = maxCount;
  return sampled;
}

function isSiteLteDebugEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const queryValue = new URLSearchParams(window.location.search)
      .get("debugSiteLte")
      ?.toLowerCase();
    const localValue = String(window.localStorage.getItem("debug.siteLte") || "").toLowerCase();
    return queryValue === "1" || queryValue === "true" || localValue === "1" || localValue === "true";
  } catch {
    return false;
  }
}

const MIN_TRIANGLE_SCALE_MULTIPLIER = 0.25;
const MAX_TRIANGLE_SCALE_MULTIPLIER = 3;
const TRIANGLE_SCALE_STEP = 0.25;

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

function extractApiErrorDetails(error) {
  const parts = [];
  const primary = String(error?.message || "").trim();
  const details = String(error?.data?.Details || error?.Details || "").trim();
  const failedId = error?.data?.FailedId ?? error?.FailedId ?? null;

  if (primary) parts.push(primary);
  if (details && !parts.some((entry) => entry.includes(details))) {
    parts.push(`Details: ${details}`);
  }
  if (failedId !== null && failedId !== undefined && failedId !== "") {
    parts.push(`FailedId: ${failedId}`);
  }
  return parts.filter(Boolean).join(" | ");
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
        item.site ||
        item.site_id ||
        item.siteId ||
        item.site_key_inferred ||
        item.siteKeyInferred ||
        item.site_name ||
        item.siteName ||
        item.nodeb_id ||
        item.nodebId ||
        item.cell_id_representative ||
        item.cellIdRepresentative ||
        `site_${index}`,
      lat: parseFloat(item.lat_pred || item.lat || item.latitude || 0),
      lng: parseFloat(item.lon_pred || item.lng || item.lon || item.longitude || 0),
      azimuth: getFirstFiniteNumber([item.azimuth_deg_5, item.azimuth_deg_5_soft, item.azimuth], 0),
      beamwidth: normalizeBeamwidth(
        getFirstFiniteNumber([item.bw, item.beamwidth, item.beamwidth_deg_est], 65),
        65,
      ),
      range: normalizeSectorRange(getFirstFiniteNumber([item.range, item.radius], 220), 220),
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
          item.site ??
            item.site_id ??
            item.siteId ??
            item.site_key_inferred ??
            item.site_name ??
            item.cell_id_representative,
        ),
      id:
        item.original_id ??
        item.id ??
        item.cell_id ??
        item.cell_id_representative ??
        item.site ??
        item.site_key_inferred ??
        index,
    }))
    .filter((item) => item.lat !== 0 && Number.isFinite(item.lat) && Number.isFinite(item.lng));
}

function generateSectorsFromSite(site, siteIndex, colorMode = "Operator", options = {}) {
  const sectors = [];
  const parsedSectorCount = Number(site.sector_count ?? site.sectorCount);
  const forceSingleSector = Boolean(options?.forceSingleSector);
  const hasSingleSectorHint =
    site.sector !== undefined &&
    site.sector !== null &&
    String(site.sector).trim() !== "";
  const hasExplicitSectorIdentity =
    [
      site.sector,
      site.sector_id,
      site.sectorId,
      site.sec_id,
      site.secId,
      site.cell_id,
      site.cellId,
      site.cell_id_representative,
      site.cellIdRepresentative,
    ].some((value) => value !== undefined && value !== null && String(value).trim() !== "");
  const sectorCount =
    Number.isFinite(parsedSectorCount) && parsedSectorCount > 0
      ? parsedSectorCount
      : forceSingleSector || hasSingleSectorHint || hasExplicitSectorIdentity
        ? 1
        : 3;

  const lat = parseFloat(site.lat ?? site.latitude ?? site.lat_pred ?? site.Lat ?? 0);
  const lng = parseFloat(site.lng ?? site.longitude ?? site.lon_pred ?? site.lon ?? site.Lng ?? 0);

  const baseAzimuth = getFirstFiniteNumber([site.azimuth, site.azimuth_deg_5, site.azimuth_deg_5_soft], 0);
  const beamwidth = normalizeBeamwidth(
    getFirstFiniteNumber([site.bw, site.beamwidth, site.beamwidth_deg_est], 65),
    65,
  );
  const range = normalizeSectorRange(getFirstFiniteNumber([site.range, site.radius], 220), 220);

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
    const rowIdPart = String(site.id ?? site.original_id ?? site.cell_id ?? siteIndex);
    const sectorPart = String(site.sector ?? site.sector_id ?? i);
    sectors.push({
      id: `sector-${siteIdPart}-${rowIdPart}-${sectorPart}-${i}`,
      sourceRowId:
        Number.isFinite(Number(site.id)) && Number(site.id) > 0
          ? Number(site.id)
          : null,
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
  sitePredictionVersion = "original",
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
  enableSiteLteOverlay = false,
  singleSiteSelection = false,
  showBulkSiteActions = true,
}) => {
  const siteLteDebugEnabled = useMemo(() => isSiteLteDebugEnabled(), []);
  const { siteData, loading, error, fetchSiteData } = useSiteData({
    enableSiteToggle,
    siteToggle,
    sitePredictionVersion,
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
  const [dragMode, setDragMode] = useState(null); // "sector" | "site" | null
  const [pendingMovePosition, setPendingMovePosition] = useState(null);
  const [isApplyingDraggedMove, setIsApplyingDraggedMove] = useState(false);
  const [triangleScaleMultiplier, setTriangleScaleMultiplier] = useState(1);

  const effectiveSectorScale = useMemo(() => {
    const baseScaleRaw = Number(options?.scale);
    const baseScale =
      Number.isFinite(baseScaleRaw) && baseScaleRaw > 0 ? baseScaleRaw : 1;
    const multiplierRaw = Number(triangleScaleMultiplier);
    const multiplier = Number.isFinite(multiplierRaw)
      ? Math.min(
          MAX_TRIANGLE_SCALE_MULTIPLIER,
          Math.max(MIN_TRIANGLE_SCALE_MULTIPLIER, multiplierRaw),
        )
      : 1;
    return baseScale * multiplier;
  }, [options?.scale, triangleScaleMultiplier]);

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
    // Keep memory bounded by retaining cache only for currently selected site ids.
    setSelectedSiteDataById((prev) => {
      if (!prev || Object.keys(prev).length === 0) return prev;
      const keep = new Set(selectedSiteIds);
      let changed = false;
      const next = {};
      Object.keys(prev).forEach((siteId) => {
        if (keep.has(siteId)) {
          next[siteId] = prev[siteId];
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    const keep = new Set(selectedSiteIds);
    let pruned = false;
    Object.keys(siteFetchTokenRef.current || {}).forEach((siteId) => {
      if (!keep.has(siteId)) {
        delete siteFetchTokenRef.current[siteId];
        pruned = true;
      }
    });
    if (pruned || keep.size === 0) {
      setLoadingSitesQueue((prev) => {
        if (!(prev instanceof Set) || prev.size === 0) return prev;
        const next = new Set([...prev].filter((siteId) => keep.has(siteId)));
        return next.size === prev.size ? prev : next;
      });
    }
  }, [selectedSiteIds]);

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
      setDragMode(null);
      setPendingMovePosition(null);
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
    setDragMode(null);
    setPendingMovePosition(null);
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
    () =>
      filteredSiteData.flatMap((site, idx) =>
        generateSectorsFromSite(site, idx, colorMode, {
          forceSingleSector: String(siteToggle || "").toLowerCase() === "cell",
        }),
      ),
    [filteredSiteData, colorMode, siteToggle],
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
      const normalizedVersion =
        String(sitePredictionVersion || "original").toLowerCase() === "updated"
          ? "updated"
          : "original";
      const normalizedSiteId = normalizeComparableSiteId(siteMarker?.siteId);
      const debug = {
        siteId: String(siteMarker?.siteId || ""),
        version: normalizedVersion,
        lte: {
          attempts: [],
          selectedAttempt: null,
          finalRows: 0,
        },
      };
      const baseParams = { projectId: projectId || "", version: normalizedVersion };
      const candidateParams = [
        { ...baseParams, siteId: siteMarker.siteId },
        { ...baseParams, site_id: siteMarker.siteId },
        { ...baseParams, site: siteMarker.siteId },
        { ...baseParams, siteName: siteMarker.siteName },
      ];

      let rows = [];
      let siteFetchFailed = false;
      for (const params of candidateParams) {
        try {
          const res = await mapViewApi.getSitePrediction(params);
          const rawRows = res?.Data || res?.data?.Data || res?.data || [];
          const normalizedAll = normalizeSiteRows(rawRows);
          const normalizedMatch = normalizedAll.filter(
            (r) => normalizeComparableSiteId(getSiteId(r)) === normalizedSiteId,
          );

          if (normalizedMatch.length > 0) {
            rows = normalizedMatch;
            break;
          }
          if (normalizedAll.length === 1) {
            rows = normalizedAll;
            break;
          }
        } catch {
          siteFetchFailed = true;
        }
      }

      if (rows.length === 0) {
        rows = filteredSiteData.filter(
          (r) => normalizeComparableSiteId(getSiteId(r)) === normalizedSiteId,
        );
      }
      if (rows.length === 0 && siteFetchFailed) {
        toast.error("Failed to fetch site data");
      }

      const sectors = rows
        .flatMap((site, idx) =>
          generateSectorsFromSite(site, idx, colorMode, {
            forceSingleSector: String(siteToggle || "").toLowerCase() === "cell",
          }),
        )
        .filter((s) => pointInsideAnyPolygon({ lat: s.lat, lng: s.lng }));

      let lteRows = [];
      if (enableSiteLteOverlay && Number(projectId) > 0) {
        const lteFetchFn =
          normalizedVersion === "updated"
            ? mapViewApi.getLtePredictionLocationStatsRefined
            : mapViewApi.getLtePfrection;
        const effectiveMetric =
          normalizedVersion === "updated"
            ? "MEASURED"
            : normalizeBaselineLteMetric(selectedMetric);
        const lteBaseParams = {
          projectId: Number(projectId),
          metric: effectiveMetric,
          statType: "avg",
          stat: "avg",
        };
        const lteCandidateParams = [
          { ...lteBaseParams, siteId: String(siteMarker.siteId || "").trim() },
          { ...lteBaseParams, site: String(siteMarker.siteId || "").trim() },
          { ...lteBaseParams, site_id: String(siteMarker.siteId || "").trim() },
        ];

        for (const lteParams of lteCandidateParams) {
          const paramKey = Object.prototype.hasOwnProperty.call(lteParams, "siteId")
            ? "siteId"
            : Object.prototype.hasOwnProperty.call(lteParams, "site")
              ? "site"
              : "site_id";
          const attempt = {
            paramKey,
            rawRows: 0,
            normalizedRows: 0,
            withSiteRows: 0,
            strictMatchedRows: 0,
            fallbackMatchedRows: 0,
            polygonFilteredRows: 0,
            finalRows: 0,
            error: "",
          };
          try {
            const lteRes = await lteFetchFn(lteParams);
            const rawLteRows = lteRes?.Data || lteRes?.data?.Data || lteRes?.data || [];
            attempt.rawRows = Array.isArray(rawLteRows) ? rawLteRows.length : 0;
            if (!Array.isArray(rawLteRows) || rawLteRows.length === 0) continue;
            const normalizedLte = normalizeLteRows(rawLteRows, siteMarker.siteId, selectedMetric);
            attempt.normalizedRows = normalizedLte.length;
            if (!normalizedLte.length) continue;

            const withSite = normalizedLte.filter((row) => String(row.siteId || "").trim() !== "");
            attempt.withSiteRows = withSite.length;
            const strictMatchedRows =
              withSite.length > 0
                ? withSite.filter(
                    (row) => normalizeComparableSiteId(row.siteId) === normalizedSiteId,
                  )
                : [];
            attempt.strictMatchedRows = strictMatchedRows.length;
            let matchedRows = strictMatchedRows;

            // Some backend responses omit site id in each point. In that case, infer by proximity
            // and avoid storing project-wide payloads for every selected site.
            if (matchedRows.length === 0 && withSite.length === 0) {
              const byDistance = normalizedLte.filter(
                (row) =>
                  computeDistanceMeters(
                    { lat: row.lat, lng: row.lng },
                    { lat: siteMarker.lat, lng: siteMarker.lng },
                  ) <= LTE_FALLBACK_RADIUS_METERS,
              );
              if (byDistance.length > 0 && byDistance.length < normalizedLte.length) {
                matchedRows = byDistance;
              } else if (normalizedLte.length <= 250) {
                matchedRows = normalizedLte;
              } else {
                matchedRows = [];
              }
            }
            attempt.fallbackMatchedRows = matchedRows.length;
            if (matchedRows.length === 0) continue;

            const lteRowsInsidePolygon = matchedRows.filter((row) =>
              pointInsideAnyPolygon({ lat: row.lat, lng: row.lng }),
            );
            attempt.polygonFilteredRows = lteRowsInsidePolygon.length;
            lteRows = dedupeLteRows(
              lteRowsInsidePolygon.length > 0 || !onlyInsidePolygons
                ? lteRowsInsidePolygon
                : matchedRows,
            ).slice(0, MAX_SITE_LTE_POINTS);
            attempt.finalRows = lteRows.length;
            debug.lte.attempts.push(attempt);
            if (lteRows.length > 0) break;
          } catch {
            attempt.error = "fetch-failed";
            debug.lte.attempts.push(attempt);
            continue;
          }
        }
      }
      debug.lte.selectedAttempt = debug.lte.attempts.find((entry) => entry.finalRows > 0) || null;
      debug.lte.finalRows = lteRows.length;

      return { sectors, lteRows, debug };
    },
    [
      projectId,
      sitePredictionVersion,
      filteredSiteData,
      colorMode,
      selectedMetric,
      pointInsideAnyPolygon,
      siteToggle,
      enableSiteLteOverlay,
    ],
  );

  const loadSiteData = useCallback(
    async (siteMarker, forceRefresh = false) => {
      if (!siteMarker?.siteId) return;
      const siteId = siteMarker.siteId;
      if (siteFetchTokenRef.current[siteId] && !forceRefresh) return;
      const metricKey = String(selectedMetric || "rsrp").toLowerCase();
      const versionKey =
        String(sitePredictionVersion || "original").toLowerCase() === "updated"
          ? "updated"
          : "original";
      const overlayKey = enableSiteLteOverlay ? "site-lte-on" : "site-lte-off";
      const cached = selectedSiteDataById[siteId];
      if (
        !forceRefresh &&
        cached &&
        cached.metricKey === metricKey &&
        cached.colorMode === colorMode &&
        cached.versionKey === versionKey &&
        cached.overlayKey === overlayKey
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
        const { sectors, lteRows, debug } = await fetchSitePayload(siteMarker);
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
            versionKey,
            overlayKey,
            hydrated: true,
            debug,
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
    [
      colorMode,
      fetchSitePayload,
      selectedMetric,
      selectedSiteDataById,
      sitePredictionVersion,
      enableSiteLteOverlay,
    ],
  );

  const handleSiteMarkerClick = useCallback(
    async (siteMarker) => {
      if (!siteMarker?.siteId) return;
      const siteId = siteMarker.siteId;
      setSelectedSectorInfo(null);

      if (selectedSiteIdSet.has(siteId)) {
        const nextIds = selectedSiteIds.filter((id) => id !== siteId);
        setSelectedSiteIds(nextIds);
        setSelectedSiteDataById((prev) => {
          if (!prev || !Object.prototype.hasOwnProperty.call(prev, siteId)) return prev;
          const next = { ...prev };
          delete next[siteId];
          return next;
        });
        if (onSiteSelect) onSiteSelect(nextIds);
        return;
      }

      const nextIds = singleSiteSelection ? [siteId] : [...selectedSiteIds, siteId];
      setSelectedSiteIds(nextIds);
      if (onSiteSelect) onSiteSelect(nextIds);
      await loadSiteData(siteMarker, Boolean(singleSiteSelection));
    },
    [loadSiteData, selectedSiteIdSet, selectedSiteIds, onSiteSelect, singleSiteSelection],
  );

  const handleSelectAllSites = useCallback(async () => {
    if (!Array.isArray(siteMarkers) || siteMarkers.length === 0) return;
    setSelectedSectorInfo(null);
    if (singleSiteSelection) {
      const firstSite = siteMarkers[0];
      if (!firstSite?.siteId) return;
      const nextIds = [firstSite.siteId];
      setSelectedSiteIds(nextIds);
      if (onSiteSelect) onSiteSelect(nextIds);
      await loadSiteData(firstSite, true);
      return;
    }
    const allIds = siteMarkers.map((site) => site.siteId);
    setSelectedSiteIds(allIds);
    if (onSiteSelect) onSiteSelect(allIds);
    await Promise.all(siteMarkers.map((site) => loadSiteData(site)));
  }, [loadSiteData, siteMarkers, onSiteSelect, singleSiteSelection]);

  const handleClearSelectedSites = useCallback(() => {
    setSelectedSectorInfo(null);
    setSelectedSiteIds([]);
    setSelectedSiteDataById({});
    siteFetchTokenRef.current = {};
    setLoadingSitesQueue(new Set());
    if (onSiteSelect) onSiteSelect([]);
  }, [onSiteSelect]);

  useEffect(() => {
    if (!Array.isArray(siteMarkers) || siteMarkers.length === 0) return;
    if (!Array.isArray(selectedSiteIds) || selectedSiteIds.length === 0) return;

    const siteById = new Map(siteMarkers.map((site) => [site.siteId, site]));
    selectedSiteIds.forEach((siteId) => {
      const siteMarker = siteById.get(siteId);
      if (!siteMarker) return;
      if (siteFetchTokenRef.current[siteId]) return;
      const cached = selectedSiteDataById[siteId];
      const metricKey = String(selectedMetric || "rsrp").toLowerCase();
      const versionKey =
        String(sitePredictionVersion || "original").toLowerCase() === "updated"
          ? "updated"
          : "original";
      const overlayKey = enableSiteLteOverlay ? "site-lte-on" : "site-lte-off";
      if (
        !cached ||
        cached.metricKey !== metricKey ||
        cached.colorMode !== colorMode ||
        cached.versionKey !== versionKey ||
        cached.overlayKey !== overlayKey
      ) {
        void loadSiteData(siteMarker, Boolean(cached));
      }
    });
  }, [
    colorMode,
    loadSiteData,
    selectedMetric,
    selectedSiteDataById,
    selectedSiteIds,
    siteMarkers,
    sitePredictionVersion,
    enableSiteLteOverlay,
  ]);

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

  const selectedSiteLteDebugRows = useMemo(() => {
    if (!siteLteDebugEnabled || !Array.isArray(selectedSiteIds) || selectedSiteIds.length === 0) return [];
    return selectedSiteIds.map((siteId) => {
      const debug = selectedSiteDataById[siteId]?.debug?.lte || null;
      const selectedAttempt = debug?.selectedAttempt || null;
      return {
        siteId,
        finalRows: Number(debug?.finalRows || 0),
        attempts: Array.isArray(debug?.attempts) ? debug.attempts.length : 0,
        paramKey: selectedAttempt?.paramKey || "none",
        rawRows: Number(selectedAttempt?.rawRows || 0),
        normalizedRows: Number(selectedAttempt?.normalizedRows || 0),
        strictMatchedRows: Number(selectedAttempt?.strictMatchedRows || 0),
      };
    });
  }, [selectedSiteDataById, selectedSiteIds, siteLteDebugEnabled]);

  const allSelectedSitesHydrated = useMemo(() => {
    if (!Array.isArray(selectedSiteIds) || selectedSiteIds.length === 0) return false;
    return selectedSiteIds.every(
      (siteId) => selectedSiteDataById[siteId]?.hydrated === true,
    );
  }, [selectedSiteDataById, selectedSiteIds]);

  const sectorsToRender = useMemo(() => {
    if (!showSiteSectors) return [];
    const source =
      selectedSiteIds.length > 0 && allSelectedSitesHydrated && selectedSiteSectors.length > 0
        ? selectedSiteSectors
        : uniqueSectors;
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
  }, [showSiteSectors, selectedSiteIds, selectedSiteSectors, uniqueSectors, allSelectedSitesHydrated]);

  const visibleSelectedSiteLteLocations = useMemo(() => {
    if (!enableSiteLteOverlay || !Array.isArray(selectedSiteLteLocations)) return [];
    if (!viewport) return selectedSiteLteLocations;
    return selectedSiteLteLocations.filter(
      (p) =>
        Number(p.lat) >= viewport.south &&
        Number(p.lat) <= viewport.north &&
        Number(p.lng) >= viewport.west &&
        Number(p.lng) <= viewport.east,
    );
  }, [enableSiteLteOverlay, selectedSiteLteLocations, viewport]);

  const renderedSelectedSiteLteLocations = useMemo(
    () => downsampleRows(visibleSelectedSiteLteLocations, MAX_RENDERED_LTE_MARKERS),
    [visibleSelectedSiteLteLocations],
  );

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
    setDragMode(null);
    setPendingMovePosition(null);
  }, []);

  const startDragMove = useCallback((mode) => {
    if (!selectedSectorInfo) return;
    if (String(siteToggle || "").toLowerCase() !== "cell") {
      toast.info("Drag move is available only for Cell toggle (site_prediction).");
      return;
    }

    const lat = Number(selectedSectorInfo.lat);
    const lng = Number(selectedSectorInfo.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("Cannot start drag move: invalid sector location.");
      return;
    }

    setDragMode(mode);
    setPendingMovePosition({ lat, lng });
    toast.info(mode === "site" ? "Drag marker to move full site, then click Update Location." : "Drag marker to move this sector, then click Update Location.");
  }, [selectedSectorInfo, siteToggle]);

  const applyDraggedMove = useCallback(async () => {
    if (!selectedSectorInfo || !dragMode || !pendingMovePosition) return;
    const lat = Number(pendingMovePosition.lat);
    const lng = Number(pendingMovePosition.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("Invalid target position.");
      return;
    }

    const rowIds =
      dragMode === "site"
        ? Array.from(
            new Set(
              [
                ...(selectedSiteDataById[selectedSectorInfo.siteId]?.sectors || []),
                ...allSectors.filter((s) => s.siteId === selectedSectorInfo.siteId),
              ]
                .map((s) => Number(s?.sourceRowId))
                .filter((id) => Number.isFinite(id) && id > 0),
            ),
          )
        : [Number(selectedSectorInfo.sourceRowId)].filter((id) => Number.isFinite(id) && id > 0);

    if (rowIds.length === 0) {
      toast.error("No valid rows found to update.");
      return;
    }

    const payload = rowIds.map((id) => ({
      id,
      latitude: lat,
      longitude: lng,
    }));

    setIsApplyingDraggedMove(true);
    try {
      const response = await mapViewApi.updateSitePrediction(payload);
      const rowsAffected =
        Number(response?.RowsAffected ?? response?.rowsAffected ?? response?.Data ?? response?.data?.Data ?? 0) || 0;

      if (rowsAffected <= 0) {
        toast.warning("No rows were updated. Check site toggle and row ids.");
      } else {
        toast.success(`Location updated for ${rowsAffected} row${rowsAffected > 1 ? "s" : ""}.`);
      }

      setSelectedSiteDataById((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((siteId) => {
          const existing = next[siteId];
          if (!existing?.sectors) return;
          next[siteId] = {
            ...existing,
            sectors: existing.sectors.map((sector) => {
              if (!rowIds.includes(Number(sector.sourceRowId))) return sector;
              return {
                ...sector,
                lat,
                lng,
                rawSite: {
                  ...(sector.rawSite || {}),
                  latitude: lat,
                  longitude: lng,
                },
              };
            }),
          };
        });
        return next;
      });

      setSelectedSectorInfo((prev) =>
        prev
          ? {
              ...prev,
              lat,
              lng,
              infoPos: { lat, lng },
              rawSite: {
                ...(prev.rawSite || {}),
                latitude: lat,
                longitude: lng,
              },
            }
          : prev,
      );

      setDragMode(null);
      setPendingMovePosition(null);

      await fetchSiteData();
      if (map?.panTo) map.panTo({ lat, lng });
    } catch (error) {
      toast.error(extractApiErrorDetails(error) || "Failed to update moved location.");
    } finally {
      setIsApplyingDraggedMove(false);
    }
  }, [
    selectedSectorInfo,
    dragMode,
    pendingMovePosition,
    allSectors,
    selectedSiteDataById,
    fetchSiteData,
    map,
  ]);

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
      const nextLat = Number(nextRaw.latitude ?? nextRaw.lat ?? selectedSectorInfo.lat ?? 0);
      const nextLng = Number(
        nextRaw.longitude ?? nextRaw.lng ?? nextRaw.lon ?? selectedSectorInfo.lng ?? 0,
      );

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
                lat: Number.isFinite(nextLat) ? nextLat : sector.lat,
                lng: Number.isFinite(nextLng) ? nextLng : sector.lng,
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
              lat: Number.isFinite(nextLat) ? nextLat : prev.lat,
              lng: Number.isFinite(nextLng) ? nextLng : prev.lng,
              infoPos:
                Number.isFinite(nextLat) && Number.isFinite(nextLng)
                  ? { lat: nextLat, lng: nextLng }
                  : prev.infoPos,
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
      if ("latitude" in payloadItem || "longitude" in payloadItem) {
        await fetchSiteData();
        if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
          const movedPoint = { lat: nextLat, lng: nextLng };
          const outsidePolygonFilter =
            onlyInsidePolygons && normalizedPolygonPaths.length > 0 && !pointInsideAnyPolygon(movedPoint);
          const outsideViewport =
            viewport &&
            (nextLat < viewport.south ||
              nextLat > viewport.north ||
              nextLng < viewport.west ||
              nextLng > viewport.east);

          if (outsidePolygonFilter) {
            toast.info("Site moved outside active polygon filter, so it is hidden.");
          } else if (outsideViewport) {
            toast.info("Site moved outside current view. Map is panning to new location.");
          }

          if (map?.panTo) {
            map.panTo(movedPoint);
          }
        }
      }
    } catch (error) {
      toast.error(extractApiErrorDetails(error) || "Failed to update site.");
    } finally {
      setIsSavingSectorEdit(false);
    }
  }, [
    selectedSectorInfo,
    sectorEditFormData,
    sectorEditOriginalData,
    siteMarkers,
    loadSiteData,
    fetchSiteData,
    map,
    onlyInsidePolygons,
    normalizedPolygonPaths,
    pointInsideAnyPolygon,
    viewport,
  ]);

  if (!enableSiteToggle) return null;
  if (error) return null;

  return (
    <>
      <div className="absolute right-3 top-3 z-[2100] flex items-center gap-2">
        {showBulkSiteActions && !singleSiteSelection && (
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
        )}
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
        <div className="flex items-center gap-1 rounded bg-slate-900/90 px-2 py-1 text-[11px] font-semibold text-white shadow">
          <span className="mr-1 text-slate-200">Triangles</span>
          <button
            type="button"
            onClick={() =>
              setTriangleScaleMultiplier((prev) =>
                Math.max(
                  MIN_TRIANGLE_SCALE_MULTIPLIER,
                  Number((prev - TRIANGLE_SCALE_STEP).toFixed(2)),
                ),
              )
            }
            disabled={triangleScaleMultiplier <= MIN_TRIANGLE_SCALE_MULTIPLIER}
            className="h-5 w-5 rounded bg-slate-700 text-white disabled:cursor-not-allowed disabled:opacity-50"
            title="Decrease triangle size"
          >
            -
          </button>
          <span className="min-w-[44px] text-center">
            {triangleScaleMultiplier.toFixed(2)}x
          </span>
          <button
            type="button"
            onClick={() =>
              setTriangleScaleMultiplier((prev) =>
                Math.min(
                  MAX_TRIANGLE_SCALE_MULTIPLIER,
                  Number((prev + TRIANGLE_SCALE_STEP).toFixed(2)),
                ),
              )
            }
            disabled={triangleScaleMultiplier >= MAX_TRIANGLE_SCALE_MULTIPLIER}
            className="h-5 w-5 rounded bg-slate-700 text-white disabled:cursor-not-allowed disabled:opacity-50"
            title="Increase triangle size"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setTriangleScaleMultiplier(1)}
            disabled={Math.abs(triangleScaleMultiplier - 1) < 0.001}
            className="ml-1 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-white disabled:cursor-not-allowed disabled:opacity-50"
            title="Reset triangle size"
          >
            Reset
          </button>
        </div>
      </div>

      {selectedSectorInfo && (
        <div className="absolute right-3 top-12 z-[2100] w-[290px] rounded border border-slate-300 bg-white p-2 text-xs shadow-lg">
          <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-1">
            <span className="font-semibold text-slate-800">Move Controls</span>
            <button
              type="button"
              onClick={() => {
                setSelectedSectorInfo(null);
                setDragMode(null);
                setPendingMovePosition(null);
              }}
              className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700"
            >
              Close
            </button>
          </div>

          <div className="mb-2 text-[11px] text-slate-600">
            Site: <span className="font-semibold">{selectedSectorInfo.siteId || "N/A"}</span>
          </div>

          {String(siteToggle || "").toLowerCase() !== "cell" ? (
            <div className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              Move is available on <b>Cell</b> toggle only.
            </div>
          ) : !dragMode ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => startDragMove("sector")}
                className="rounded bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white"
              >
                Move Sector
              </button>
              <button
                type="button"
                onClick={() => startDragMove("site")}
                className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white"
              >
                Move Site
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] text-slate-600">
                Drag orange marker on map, then click update.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void applyDraggedMove();
                  }}
                  disabled={isApplyingDraggedMove}
                  className="rounded bg-green-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                >
                  {isApplyingDraggedMove ? "Updating..." : "Update Location"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDragMode(null);
                    setPendingMovePosition(null);
                  }}
                  disabled={isApplyingDraggedMove}
                  className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700"
                >
                  Cancel Move
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
      {enableSiteLteOverlay && selectedSiteIds.length > 0 && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-[2100] rounded bg-slate-900/85 px-2.5 py-1 text-[11px] font-semibold text-white shadow-md">
          LTE points: {renderedSelectedSiteLteLocations.length}/{visibleSelectedSiteLteLocations.length}
        </div>
      )}
      {siteLteDebugEnabled && enableSiteLteOverlay && selectedSiteIds.length > 0 && (
        <div className="absolute left-3 top-20 z-[2100] max-w-[520px] rounded bg-black/80 px-3 py-2 text-[11px] text-white shadow-md">
          <div className="font-semibold">LTE Debug</div>
          <div className="text-slate-200">
            selectedSites={selectedSiteIds.length} totalRows={selectedSiteLteLocations.length} visibleRows=
            {visibleSelectedSiteLteLocations.length} renderedRows={renderedSelectedSiteLteLocations.length}
          </div>
          {selectedSiteLteDebugRows.map((row) => (
            <div key={`debug-site-${row.siteId}`} className="text-slate-100">
              site={row.siteId} final={row.finalRows} attempts={row.attempts} key={row.paramKey} raw=
              {row.rawRows} normalized={row.normalizedRows} strictMatched={row.strictMatchedRows}
            </div>
          ))}
        </div>
      )}

      {enableSiteLteOverlay &&
        renderedSelectedSiteLteLocations.map((point, index) => {
          const colorRaw =
            typeof getMetricColor === "function"
              ? getMetricColor(point.value, selectedMetric)
              : "#0ea5e9";
          const pointColor =
            typeof colorRaw === "string" && colorRaw.trim() !== ""
              ? colorRaw
              : "#0ea5e9";
          const key = `site-lte-${point.siteId || "na"}-${Number(point.lat).toFixed(6)}-${Number(
            point.lng,
          ).toFixed(6)}-${index}`;

          return (
            <MarkerF
              key={key}
              position={{ lat: Number(point.lat), lng: Number(point.lng) }}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 4.5,
                fillColor: pointColor,
                fillOpacity: 0.95,
                strokeColor: "#ffffff",
                strokeWeight: 1.2,
              }}
              zIndex={3600}
            />
          );
        })}

      {visibleSectors.map((sector, index) => {
        const p0 = { lat: sector.lat, lng: sector.lng };
        const r = (sector.range || radius) * effectiveSectorScale;
        const safeBeamwidth = normalizeBeamwidth(sector.beamwidth, 65);
        const p1 = computeOffset(p0, r, sector.azimuth - safeBeamwidth / 2);
        const p2 = computeOffset(p0, r, sector.azimuth + safeBeamwidth / 2);
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
                  setDragMode(null);
                  setPendingMovePosition(null);
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
                  {canEditSitePrediction && (
                    <div className="mt-2 border-t border-slate-200 pt-2">
                      {!dragMode ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startDragMove("sector")}
                            className="rounded bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white"
                          >
                            Move Sector
                          </button>
                          <button
                            type="button"
                            onClick={() => startDragMove("site")}
                            className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white"
                          >
                            Move Site
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="text-[11px] text-slate-700">
                            Drag marker, then click update.
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                void applyDraggedMove();
                              }}
                              disabled={isApplyingDraggedMove}
                              className="rounded bg-green-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                            >
                              {isApplyingDraggedMove ? "Updating..." : "Update Location"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDragMode(null);
                                setPendingMovePosition(null);
                              }}
                              disabled={isApplyingDraggedMove}
                              className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </InfoWindowF>
            )}

            {isSelectedSector && dragMode && pendingMovePosition && (
              <MarkerF
                position={pendingMovePosition}
                draggable
                zIndex={5000}
                icon={{
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: "#f97316",
                  fillOpacity: 0.95,
                  strokeColor: "#ffffff",
                  strokeWeight: 2,
                }}
                onDragEnd={(event) => {
                  const lat = event?.latLng?.lat?.();
                  const lng = event?.latLng?.lng?.();
                  if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    setPendingMovePosition({ lat, lng });
                  }
                }}
              />
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
