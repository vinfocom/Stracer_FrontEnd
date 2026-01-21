import React, { useEffect, useState, useRef, useMemo } from "react";
import { PolygonF } from "@react-google-maps/api";
import { cellSiteApi } from "@/api/apiEndpoints";
import toast from "react-hot-toast";

// Helper to calculate sector polygon points
function computeOffset(center, distanceMeters, headingDegrees) {
  const earthRadius = 6371000;
  const lat1 = (center.lat * Math.PI) / 180;
  const lng1 = (center.lng * Math.PI) / 180;
  const heading = (headingDegrees * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceMeters / earthRadius) +
      Math.cos(lat1) * Math.sin(distanceMeters / earthRadius) * Math.cos(heading)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(heading) * Math.sin(distanceMeters / earthRadius) * Math.cos(lat1),
      Math.cos(distanceMeters / earthRadius) - Math.sin(lat1) * Math.sin(lat2)
    );

  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

// ✅ Operator to color mapping with fallback
function getColorForNetwork(network) {
  // Default color if no network
  const DEFAULT_COLOR = "#3B82F6"; // Blue as default instead of gray
  
  if (!network || network === "" || network === "null" || network === "undefined") {
    console.log(" No network value, using default color:", DEFAULT_COLOR);
    return DEFAULT_COLOR;
  }

  const OPERATOR_COLORS = {
    // Jio variants
    "Jio True5G": "#3B82F6",
    "JIO 4G": "#3B82F6",
    "JIO4G": "#3B82F6",
    "IND-JIO": "#3B82F6",
    "jio": "#3B82F6",
    "Far Eastone": "#00b4d8ff",
    "TW Mobile": "#f77f00ff",
    "FAR EASTONE": "#00b4d8ff",
    "TW MOBILE": "#f77f00ff",
    
    
    "IND airtel": "#EF4444",
    "ind airtel": "#EF4444",
    
    "IND Airtel": "#EF4444",
    "airtel": "#EF4444",
    "Airtel 5G": "#EF4444",
    "Airtel": "#EF4444",
    
    // VI variants
    "VI India": "#22C55E",
    "Vi India": "#22C55E",
    "Vodafone IN": "#22C55E",
    "VI": "#22C55E",
    "Vi": "#22C55E",
    
    
    "BSNL": "#F59E0B",
    "bsnl": "#F59E0B",
    
    
    "Unknown": "#8B5CF6", 
  };

  const networkStr = String(network).trim();

  // Exact match
  if (OPERATOR_COLORS[networkStr]) {
    return OPERATOR_COLORS[networkStr];
  }

  // Case-insensitive match
  const exactMatch = Object.keys(OPERATOR_COLORS).find(
    key => key.toLowerCase() === networkStr.toLowerCase()
  );
  
  if (exactMatch) {
    return OPERATOR_COLORS[exactMatch];
  }

  // Keyword fallback
  const lowerNetwork = networkStr.toLowerCase();
  
  if (lowerNetwork.includes("jio")) return "#3B82F6";
  if (lowerNetwork.includes("airtel")) return "#EF4444";
  if (lowerNetwork.includes("vi") || lowerNetwork.includes("vodafone")) return "#22C55E";
  if (lowerNetwork.includes("bsnl")) return "#F59E0B";
  if (lowerNetwork.includes("eastone")) return "#00b4d8ff";
  if (lowerNetwork.includes("mobile") && lowerNetwork.includes("tw")) return "#f77f00ff";

  // Return a visible color instead of gray
  console.log(" Unknown operator:", networkStr, "using purple");
  return "#8B5CF6"; // Purple for unmatched
}

// ✅ Extract network/operator from site with multiple field checks
function extractNetworkFromSite(site) {
  // Check multiple possible field names
  const possibleFields = [
    'network',
    'Network',
    'operator', 
    'Operator',
    'provider',
    'Provider',
    'carrier',
    'Carrier',
    'mno',
    'MNO'
  ];
  
  for (const field of possibleFields) {
    if (site[field] && site[field] !== "" && site[field] !== "null") {
      console.log(`✅ Found network in field "${field}":`, site[field]);
      return site[field];
    }
  }
  
  console.log(" No network field found in site:", Object.keys(site));
  return null;
}


function generateUniqueSectorId(site, sectorIndex, siteIndex) {
  const cellId = site.cell_id_representative ?? site.cell_id ?? 'unknown';
  const siteKey = site.site_key_inferred ?? site.site_key ?? '';
  const lat = (site.lat_pred ?? site.lat)?.toFixed?.(6) ?? '0';
  const lng = (site.lon_pred ?? site.lng ?? site.lon)?.toFixed?.(6) ?? '0';
  
  return `sector-${siteIndex}-${cellId}-${siteKey}-${sectorIndex}-${lat}-${lng}`.replace(/\s+/g, '_');
}


function generateSectorsFromSite(site, siteIndex) {
  const sectors = [];
  const sectorCount = site.sector_count || 3;
  const baseAzimuth = site.azimuth_deg_5 || site.azimuth || 0;
  const beamwidth = site.beamwidth_deg_est || site.beamwidth || 65;
  
  // ✅ Extract network with fallback
  const network = extractNetworkFromSite(site);
  const color = getColorForNetwork(network);

  if (siteIndex < 3) {
    console.log(` Site ${siteIndex}:`, {
      network: network,
      color: color,
      sectorCount: sectorCount,
      lat: site.lat_pred ?? site.lat,
      lng: site.lon_pred ?? site.lng ?? site.lon,
      allFields: Object.keys(site)
    });
  }
  
  // ✅ Get coordinates with fallbacks
  const lat = site.lat_pred ?? site.lat;
  const lng = site.lon_pred ?? site.lng ?? site.lon;
  
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    console.warn(`⚠️ Invalid coordinates for site ${siteIndex}:`, { lat, lng });
    return [];
  }
  
  // Network-based range
  let range = 60;
  const networkLower = String(network || "").toLowerCase();
  
  if (networkLower.includes("5g") || networkLower.includes("true5g")) {
    range = 45;
  } else if (networkLower.includes("vi") || networkLower.includes("vodafone")) {
    range = 80;
  } else if (networkLower.includes("jio")) {
    range = 50;
  } else if (networkLower.includes("airtel")) {
    range = 55;
  }
  
  const azimuthSpacing = 360 / sectorCount;
  
  for (let i = 0; i < sectorCount; i++) {
    const azimuth = (baseAzimuth + (i * azimuthSpacing)) % 360;
    const uniqueId = generateUniqueSectorId(site, i, siteIndex);
    
    sectors.push({
      id: uniqueId,
      cell_id: site.cell_id_representative ?? site.cell_id,
      site_key: site.site_key_inferred ?? site.site_key,
      lat: lat,
      lng: lng,
      azimuth: azimuth,
      beamwidth: beamwidth,
      color: color, // ✅ Color is set here
      network: network,
      range: range,
      samples: site.samples,
      pci: site.pci_or_psi ?? site.pci,
      earfcn: site.earfcn_or_narfcn ?? site.earfcn,
      azimuth_reliability: site.azimuth_reliability,
      sectorIndex: i,
      siteIndex: siteIndex,
    });
  }
  
  return sectors;
}

// ========================================
// COMPONENT
// ========================================

let instanceCounter = 0;

const NetworkPlannerMap = ({ 
  radius = 120, 
  projectId,
  sectors: externalSectors = null,
  onSectorClick = null,
  viewport = null,
  options = {},
  minSectors = 0
}) => {
  const instanceId = useRef(++instanceCounter);
  const [internalSectors, setInternalSectors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fetchedProjectId = useRef(null);

  const sectors = externalSectors || internalSectors;

  useEffect(() => {
    if (externalSectors && externalSectors.length > 0) {
      console.log(`ℹ [NetworkPlanner ${instanceId.current}] Using ${externalSectors.length} external sectors`);
      return;
    }

    if (!projectId) {
      console.warn(`⚠️ [NetworkPlanner ${instanceId.current}] No projectId provided`);
      return;
    }
    
    const fetchSite = async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log(`📡 [NetworkPlanner ${instanceId.current}] Fetching site data for project ${projectId}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const res = await cellSiteApi.siteNoml(projectId, controller.signal);
        clearTimeout(timeoutId);
        
        // ✅ Debug: Log the raw response structure
        console.log("📦 Raw API response:", res);
        console.log("📦 Response keys:", Object.keys(res || {}));
        
        // ✅ Handle different response structures
        let siteData = [];
        if (res?.data) {
          siteData = Array.isArray(res.data) ? res.data : [res.data];
        } else if (res?.Data) {
          siteData = Array.isArray(res.Data) ? res.Data : [res.Data];
        } else if (Array.isArray(res)) {
          siteData = res;
        }
        
        if (siteData.length > 0) {
          // ✅ Debug: Log first site's structure
          console.log("📋 First site structure:", siteData[0]);
          console.log("📋 First site keys:", Object.keys(siteData[0]));
          
          console.log(`🏢 [NetworkPlanner ${instanceId.current}] Received ${siteData.length} sites`);
          
          // Log unique operators
          const uniqueOperators = [...new Set(siteData.map(s => extractNetworkFromSite(s)).filter(Boolean))];
          console.log("📋 Unique operators found:", uniqueOperators);
          
          // Filter by minSectors
          const filteredSites = siteData.filter(site => {
            const count = site.sector_count ?? 3;
            return count >= minSectors;
          });

          console.log(`🔍 Filtered: ${filteredSites.length}/${siteData.length} sites (minSectors=${minSectors})`);

          // Generate sectors with site index
          const allSectors = filteredSites.flatMap((site, siteIndex) => 
            generateSectorsFromSite(site, siteIndex)
          );
          
          // ✅ Debug: Log color distribution
          const colorStats = allSectors.reduce((acc, s) => {
            const key = `${s.network || 'No Network'} → ${s.color}`;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {});
          
          console.log(`🎨 [NetworkPlanner ${instanceId.current}] Color distribution:`);
          console.table(colorStats);
          
          // ✅ Debug: Log sample sectors
          console.log("📍 Sample sectors:", allSectors.slice(0, 3).map(s => ({
            id: s.id,
            network: s.network,
            color: s.color,
            lat: s.lat,
            lng: s.lng
          })));
          
          setInternalSectors(allSectors);
          fetchedProjectId.current = projectId;
        } else {
          console.warn(`⚠️ [NetworkPlanner ${instanceId.current}] No site data found`);
          setInternalSectors([]);
        }
      } catch (error) {
        let errMsg = 'Failed to fetch site data';
        
        if (error.name === 'AbortError') {
          errMsg = 'Request timeout';
        } else if (error.response) {
          errMsg = `Server error: ${error.response.status}`;
        } else if (error.request) {
          errMsg = 'No response from server';
        } else if (error.message) {
          errMsg = error.message;
        }

        toast.error(`Network Planner Error: ${errMsg}`);
        
        console.error(` [NetworkPlanner ${instanceId.current}] ${errMsg}`, error);
        setError(errMsg);
        setInternalSectors([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSite();
  }, [projectId, externalSectors, minSectors]);

  // ✅ Memoize visible sectors
  const visibleSectors = useMemo(() => {
    if (!viewport) return sectors;
    
    return sectors.filter((sector) => {
      const { lat, lng } = sector;
      return (
        lat >= viewport.south &&
        lat <= viewport.north &&
        lng >= viewport.west &&
        lng <= viewport.east
      );
    });
  }, [sectors, viewport]);

  if (loading && !externalSectors) {
    return null;
  }

  if (error && !externalSectors) {
    return null;
  }

  if (visibleSectors.length === 0) {
    return null;
  }

  // ✅ Settings with better defaults for visibility
  const effectiveScale = options.scale ?? 1;
  const effectiveZIndex = options.zIndex ?? 2000;
  const effectiveOpacity = options.opacity ?? 0.6; // ✅ Higher opacity for visibility

  console.log(`🖼️ [NetworkPlanner ${instanceId.current}] Rendering ${visibleSectors.length} sectors`);

  return (
    <>
      {visibleSectors.map((sector, index) => {
        try {
          if (!sector.lat || !sector.lng || isNaN(sector.lat) || isNaN(sector.lng)) {
            return null;
          }

          const p0 = { lat: sector.lat, lng: sector.lng };
          const bw = sector.beamwidth ?? 65;
          const r = (sector.range ?? radius) * effectiveScale;

          const p1 = computeOffset(p0, r, sector.azimuth - bw / 2);
          const p2 = computeOffset(p0, r, sector.azimuth + bw / 2);

          const triangleCoords = [p0, p1, p2];
          const uniqueKey = sector.id || `sector-fallback-${index}`;
          
          // ✅ Ensure color is valid
          const fillColor = sector.color || "#3B82F6";
          const strokeColor = sector.color || "#3B82F6";

          // ✅ Debug first sector
          if (index === 0) {
            console.log("🔺 First sector polygon:", {
              key: uniqueKey,
              fillColor,
              strokeColor,
              fillOpacity: effectiveOpacity,
              network: sector.network,
              coords: triangleCoords
            });
          }

          return (
            <PolygonF
              key={uniqueKey}
              paths={triangleCoords}
              options={{
                fillColor: fillColor,
                fillOpacity: effectiveOpacity,
                strokeColor: strokeColor,
                strokeWeight: 2,
                strokeOpacity: 1,
                zIndex: effectiveZIndex,
                clickable: !!onSectorClick,
              }}
              onClick={() => {
                if (onSectorClick) {
                  onSectorClick(sector);
                }
              }}
            />
          );
        } catch (err) {
          console.error(` Error rendering sector:`, err);
          return null;
        }
      })}
    </>
  );
};

export default NetworkPlannerMap;