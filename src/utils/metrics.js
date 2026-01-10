// src/utils/metrics.js

// ✅ PCI Color Palette - 20 distinct colors
export const PCI_COLOR_PALETTE = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8",
  "#F7DC6F", "#BB8FCE", "#85C1E2", "#F8B739", "#52BE80",
  "#EC7063", "#5DADE2", "#F39C12", "#A569BD", "#48C9B0",
  "#E74C3C", "#3498DB", "#E67E22", "#9B59B6", "#1ABC9C",
];

// ✅ Color schemes for "Color By" options (Provider, Technology, Band)
export const COLOR_SCHEMES = {
  provider: {
    JIO: "#3B82F6", 
    Jio: "#3B82F6",
    jio: "#3B82F6",       // Blue
    Airtel: "#EF4444",     // Red
    "IND airtel": "#EF4444",
    "Vi India": "#22C55E", // Green
    "VI India": "#22C55E",
    Yas:"#7d1b49",
    BSNL: "#F59E0B",       // Amber
    Unknown: "#6B7280",
    台灣大哥大: "#4400e2ff"    // Gray
  },
  technology: {
    "5G": "#EC4899",       // Pink
    "NR (5G NSA)": "#EC4899",
    "NR (5G SA)": "#EC4899",
    "4G": "#8B5CF6",       // Purple
    "LTE": "#8B5CF6",
    "3G": "#10B981",       // Emerald
    "2G": "#6B7280",       // Gray
    Unknown: "#F59E0B",    // Amber
  },
  band: {
    1: "#EF4444",
  B1: "#EF4444",

  2: "#F59E0B",
  B2: "#F59E0B",

  3: "#EF4444",
  B3: "#EF4444",

  4: "#F59E0B",
  B4: "#F59E0B",

  5: "#F59E0B",
  B5: "#F59E0B",

  6: "#EF4444",
  B6: "#EF4444",

  8: "#10B981",
  B8: "#10B981",

  9: "#F59E0B",
  B9: "#F59E0B",

  19: "#EF4444",
  B19: "#EF4444",

  // ---------- 4G (LTE) ----------
  7: "#10B981",
  B7: "#10B981",

  12: "#3B82F6",
  B12: "#3B82F6",

  13: "#3B82F6",
  B13: "#3B82F6",

  17: "#3B82F6",
  B17: "#3B82F6",

  18: "#10B981",
  B18: "#10B981",

  20: "#3B82F6",
  B20: "#3B82F6",

  25: "#8B5CF6",
  B25: "#8B5CF6",

  26: "#8B5CF6",
  B26: "#8B5CF6",

  28: "#EC4899",
  B28: "#EC4899",

  38: "#6366F1",
  B38: "#6366F1",

  39: "#6366F1",
  B39: "#6366F1",

  40: "#3B82F6",
  B40: "#3B82F6",

  41: "#8B5CF6",
  B41: "#8B5CF6",

  // ---------- 5G (already present, kept for compatibility) ----------
  n28: "#EC4899",
  n78: "#F472B6",

  // ---------- Fallback ----------
  Unknown: "#6B7280",
  },
};

// ✅ Helper to get color for provider/technology/band
export const getColorByValue = (colorBy, value) => {
  const scheme = COLOR_SCHEMES[colorBy];
  if (!scheme) return "#6B7280";
  
  // Direct match
  if (scheme[value]) return scheme[value];
  
  // Case-insensitive match
  const match = Object.keys(scheme).find(
    (k) => k.toLowerCase() === String(value || "").toLowerCase()
  );
  
  return match ? scheme[match] : scheme["Unknown"] || "#6B7280";
};


export const getPciColor = (pciValue) => {
  const numValue = parseFloat(pciValue);
  if (!Number.isFinite(numValue)) return "#808080";
  return PCI_COLOR_PALETTE[Math.abs(Math.floor(numValue)) % PCI_COLOR_PALETTE.length];
};

// metric 
export const METRIC_CONFIG = {
  rsrp: {
    thresholdKey: 'rsrp',
    label: 'RSRP',
    unit: 'dBm',
    fields: ['rsrp', 'RSRP', 'Rsrp', 'lte_rsrp', 'LTE_RSRP', 'nr_rsrp'],
  },
  rsrq: {
    thresholdKey: 'rsrq',
    label: 'RSRQ',
    unit: 'dB',
    fields: ['rsrq', 'RSRQ', 'Rsrq', 'lte_rsrq', 'LTE_RSRQ', 'nr_rsrq'],
  },
  sinr: {
    thresholdKey: 'sinr',
    label: 'SINR',
    unit: 'dB',
    fields: ['sinr', 'SINR', 'Sinr', 'lte_sinr', 'LTE_SINR', 'nr_sinr'],
  },
  dl_thpt: {
    thresholdKey: 'dl_thpt',
    label: 'DL Throughput',
    unit: 'Mbps',
    fields: ['dl_tpt', 'DL_TPT', 'dl_thpt', 'DL_THPT', 'dl_throughput', 'download'],
  },
  ul_thpt: {
    thresholdKey: 'ul_thpt',
    label: 'UL Throughput',
    unit: 'Mbps',
    fields: ['ul_thpt', 'UL_THPT', 'ul_tpt', 'UL_TPT', 'ul_throughput', 'upload'],
  },
  mos: {
    thresholdKey: 'mos',
    label: 'MOS',
    unit: '',
    fields: ['mos', 'MOS', 'Mos', 'mos_score'],
  },
  lte_bler: {
    thresholdKey: 'lte_bler',
    label: 'LTE BLER',
    unit: '%',
    fields: ['lte_bler','lte_bler_json', 'LTE_BLER', 'bler', 'BLER'],
  },
  pci: {
    thresholdKey: 'pci',
    label: 'PCI',
    unit: '',
    fields: ['pci', 'PCI', 'Pci', 'physical_cell_id'],
  },
};

// ✅ Alias mappings
const METRIC_ALIASES = {
  'dl_tpt': 'dl_thpt',     
  'ul_tpt': 'ul_thpt',     
  'bler': 'lte_bler',
  'lte-bler': 'lte_bler',
  'mos_score': 'mos',
};


export const getMetricConfig = (metric) => {
  if (!metric) {
    return { ...METRIC_CONFIG.rsrp, key: 'rsrp' };
  }

  const normalized = String(metric).toLowerCase().trim().replace(/[-\s]/g, '_');

  if (METRIC_CONFIG[normalized]) {
    return { ...METRIC_CONFIG[normalized], key: normalized };
  }

  const aliasKey = METRIC_ALIASES[normalized];
  if (aliasKey && METRIC_CONFIG[aliasKey]) {
    return { ...METRIC_CONFIG[aliasKey], key: aliasKey };
  }

  const configKeys = Object.keys(METRIC_CONFIG);
  const matchedKey = configKeys.find(k => k.includes(normalized) || normalized.includes(k));
  if (matchedKey) {
    return { ...METRIC_CONFIG[matchedKey], key: matchedKey };
  }

  console.warn(`[metrics] Unknown metric: "${metric}"`);
  return { ...METRIC_CONFIG.rsrp, key: 'rsrp' };
};

/**
 * Legacy function - ensures backward compatibility
 */
export const resolveMetricConfig = (key) => {
  const config = getMetricConfig(key);
  return {
    field: config.fields[0],
    thresholdKey: config.thresholdKey,
    label: config.label,
    unit: config.unit,
  };
};

/**
 * Extract metric value from log - handles strings and numbers
 */
export const getMetricValueFromLog = (log, metric) => {
  if (!log) return NaN;

  const config = getMetricConfig(metric);
  if (!config?.fields) return NaN;

  for (const field of config.fields) {
    const val = log[field];
    if (val !== undefined && val !== null && val !== '') {
      const parsed = parseFloat(val);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return NaN;
};

/**
 * Get color for metric value based on thresholds
 */
export const getColorForMetric = (metric, value, thresholds) => {
  
  if (String(metric).toLowerCase() === 'pci') {
    return getPciColor(value);
  }

  const config = getMetricConfig(metric);
  const metricThresholds = thresholds?.[config.thresholdKey] || [];
  const numValue = parseFloat(value);

  if (!Number.isFinite(numValue) || metricThresholds.length === 0) {
    return "#808080";
  }

  const match = metricThresholds.find((t) => {
    const min = parseFloat(t.min);
    const max = parseFloat(t.max);
    return Number.isFinite(min) && Number.isFinite(max) && numValue >= min && numValue <= max;
  });

  return match?.color || "#808080";
};