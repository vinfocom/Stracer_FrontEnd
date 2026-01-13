import { string } from "prop-types";

// Hash function to generate consistent color from string
const stringToColor = (str) => {
  if (!str) return "#a8a6a2";
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Generate HSL color for better distribution
  const hue = Math.abs(hash % 360);
  const saturation = 65 + (Math.abs(hash) % 20); // 65-85%
  const lightness = 45 + (Math.abs(hash) % 15);  // 45-60%
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

// Alternative: Generate hex color
const stringToHexColor = (str) => {
  if (!str) return "#a8a6a2";
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  
  return color;
};

// Cache for dynamically generated colors
const dynamicColorCache = {
  provider: {},
  technology: {},
  band: {}
};

export const normalizeProviderName = (rawName) => {
  if (!rawName) return null;

  const invalidValues = ["000 000", " 000 000 ", "404440", "404011"];
  const s = String(rawName).trim();

  if (/^\/+$/.test(s)) return null;
  if (invalidValues.includes(s)) return null;

  const cleaned = s.toUpperCase().replace(/[\s\-_]/g, "");

  if (cleaned.includes("JIO") || cleaned.includes("JIOTRUE")) {
    return "Jio";
  }

  if (cleaned.includes("AIRTEL")) {
    return "Airtel";
  }

  if (
    cleaned === "VI" ||
    cleaned.includes("VIINDIA") ||
    cleaned.includes("VODAFONE") ||
    cleaned.includes("IDEA")
  ) {
    return "VI India";
  }

  if (cleaned.includes("YAS")) {
    return "Yas";
  }

  if (cleaned.includes("BSNL")) {
    return "BSNL";
  }

  return s;
};

export const normalizeTechName = (tech, band = null) => {
  if (band) {
    const bandStr = String(band).trim().toLowerCase();
    const nrBandPattern = /^n\d+/i;
    
    if (nrBandPattern.test(bandStr)) {
      return "5G";
    }
    
    const fiveGBands = ['n78', 'n77', 'n41', 'n1', 'n28', 'n3', 'n5', 'n7', 'n8', 'n20', 'n38', 'n40', 'n66', 'n71', 'n257', 'n258', 'n260', 'n261'];
    if (fiveGBands.includes(bandStr)) {
      return "5G";
    }
  }

  if (!tech) return "Unknown";

  const techStr = String(tech).trim();
  
  const InvalidValues = [
    "000", "00", "Unknown/No Service", "Unknown / No Service", 
    "UNKNOWN / NO SERVICE", "Unknown", "undefined", "null", "404440", "404011"
  ];
  
  if (InvalidValues.includes(techStr)) return "Unknown";

  const t = techStr.toUpperCase();

  if (t.includes("5G") || t.includes("NR") || t.includes("NSA") || t.includes("SA")) {
    return "5G";
  }
  
  if (t.includes("LTE") || t.includes("4G")) {
    return "4G";
  }
  
  if (t.includes("3G") || t.includes("WCDMA") || t.includes("UMTS") || t.includes("HSPA")) {
    return "3G";
  }
  
  if (t.includes("2G") || t.includes("EDGE") || t.includes("GSM") || t.includes("GPRS")) {
    return "2G";
  }
  
  return tech;
};

export const normalizeBandName = (band) => {
  if (band === null || band === undefined || band === "" || band === "Unknown") return "Unknown";

  const bandStr = String(band);
  if (bandStr.charAt(0) === "B" || bandStr.charAt(0) === "n") {
    return bandStr;
  } else {
    return "B" + bandStr;
  }
};

export const COLOR_SCHEMES = {
  provider: {
    Jio: "#3B82F6",
    Airtel: "#EF4444",
    "VI India": "#22C55E",
    BSNL: "#F59E0B",
    Yas: "#7d1b49",
    台灣大哥大: "#4400e2ff",
    Unknown: "#a8a6a2",
  },
  technology: {
    "5G": "#EC4899",
    "4G": "#8B5CF6",
    "3G": "#10B981",
    "2G": "#6B7280",
    Unknown: "#a8a6a2",
  },
  band: {
    1: "#EF4444", B1: "#EF4444",
    2: "#F59E0B", B2: "#F59E0B",
    3: "#EF4444", B3: "#EF4444",
    4: "#F59E0B", B4: "#F59E0B",
    5: "#F59E0B", B5: "#F59E0B",
    6: "#EF4444", B6: "#EF4444",
    7: "#10B981", B7: "#10B981",
    8: "#10B981", B8: "#10B981",
    9: "#F59E0B", B9: "#F59E0B",
    12: "#3B82F6", B12: "#3B82F6",
    13: "#3B82F6", B13: "#3B82F6",
    17: "#3B82F6", B17: "#3B82F6",
    18: "#10B981", B18: "#10B981",
    19: "#EF4444", B19: "#EF4444",
    20: "#3B82F6", B20: "#3B82F6",
    25: "#8B5CF6", B25: "#8B5CF6",
    26: "#8B5CF6", B26: "#8B5CF6",
    28: "#EC4899", B28: "#EC4899",
    38: "#6366F1", B38: "#6366F1",
    39: "#6366F1", B39: "#6366F1",
    40: "#3B82F6", B40: "#3B82F6",
    41: "#8B5CF6", B41: "#8B5CF6",
    n5: "#F59E0B",
    n28: "#EC4899",
    n78: "#F472B6",
    Unknown: "#a8a6a2",
  },
};

// Main function with dynamic color generation
export const getLogColor = (colorBy, value, defaultColor = "#a8a6a2") => {
  if (!colorBy || !value) {
    return defaultColor;
  }

  const scheme = COLOR_SCHEMES[colorBy];
  if (!scheme) {
    return defaultColor;
  }

  let normalizedValue = String(value).trim();

  // Normalize based on type
  if (colorBy === "provider") {
    normalizedValue = normalizeProviderName(value);
  } else if (colorBy === "technology") {
    normalizedValue = normalizeTechName(value);
  } else if (colorBy === "band") {
    if (normalizedValue === "-1" || normalizedValue === "") {
      normalizedValue = "Unknown";
    } else {
      normalizedValue = normalizeBandName(value);
    }
  }

  // Return Unknown color if normalized value is null/Unknown
  if (!normalizedValue || normalizedValue === "Unknown") {
    return scheme["Unknown"] || defaultColor;
  }

  // Check predefined color scheme
  if (scheme[normalizedValue]) {
    return scheme[normalizedValue];
  }

  // Case-insensitive match
  const matchKey = Object.keys(scheme).find(
    (key) => key.toLowerCase() === normalizedValue.toLowerCase()
  );

  if (matchKey) {
    return scheme[matchKey];
  }

  // 🎨 Generate dynamic color for new operators/values
  const cacheKey = `${colorBy}_${normalizedValue}`;
  
  if (!dynamicColorCache[colorBy][normalizedValue]) {
    dynamicColorCache[colorBy][normalizedValue] = stringToColor(normalizedValue);
    console.log(`🎨 Generated dynamic color for ${colorBy}: ${normalizedValue} → ${dynamicColorCache[colorBy][normalizedValue]}`);
  }

  return dynamicColorCache[colorBy][normalizedValue];
};

export const getProviderColor = (provider) => {
  const normalized = normalizeProviderName(provider);
  return getLogColor("provider", normalized, "#a8a6a2");
};

export const getTechnologyColor = (technology) => {
  const normalized = normalizeTechName(technology);
  return getLogColor("technology", normalized, "#a8a6a2");
};

export const getBandColor = (band) => {
  const normalized = normalizeBandName(band);
  return getLogColor("band", normalized, "#a8a6a2");
};

// Export cache for debugging/inspection
export const getDynamicColorCache = () => dynamicColorCache;

// Optional: Clear cache function
export const clearDynamicColorCache = () => {
  dynamicColorCache.provider = {};
  dynamicColorCache.technology = {};
  dynamicColorCache.band = {};
};