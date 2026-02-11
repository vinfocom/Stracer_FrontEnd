// src/components/unifiedMap/NetworkPlannerMap.jsx

import React, { useEffect, useMemo } from "react";
import { PolygonF } from "@react-google-maps/api";
import { getProviderColor, getBandColor, getTechnologyColor } from "@/utils/colorUtils";
import { useSiteData } from "@/hooks/useSiteData";

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
  
function generateSectorsFromSite(site, siteIndex, colorMode = "Operator") {
    const sectors = [];
    const sectorCount = site.sector_count || 3;
    
    // Use normalized fields from useSiteData or fallback to raw keys
    const lat = parseFloat(site.lat || site.lat_pred || 0);
    const lng = parseFloat(site.lng || site.lon_pred || site.lon || 0);
    const baseAzimuth = parseFloat(site.azimuth || site.azimuth_deg_5 || 0);
    const beamwidth = parseFloat(site.beamwidth || site.beamwidth_deg_est || 65);
    const range = parseFloat(site.range || 220);

    // Extract attributes for coloring
    const network = site.operator || site.network || "Unknown";
    const band = site.band || site.frequency_band || "Unknown";
    const tech = site.tech || site.technology || "Unknown";
    
    // Determine color based on mode
    let color;
    const mode = colorMode.toLowerCase();

    if (mode === "band") {
        color = getBandColor(band);
    } else if (mode === "technology") {
        color = getTechnologyColor(tech);
    } else {
        // Default to Operator
        color = getProviderColor(network);
    }
  
    if (isNaN(lat) || isNaN(lng)) return [];
  
    const azimuthSpacing = 360 / sectorCount;
    for (let i = 0; i < sectorCount; i++) {
      const azimuth = (baseAzimuth + (i * azimuthSpacing)) % 360;
      sectors.push({
        id: `sector-${site.site || site.cell_id || siteIndex}-${i}`,
        lat, 
        lng, 
        azimuth, 
        beamwidth, 
        color,
        network,
        range: range,
      });
    }
    return sectors;
}

const NetworkPlannerMap = ({ 
  radius = 120, 
  projectId,
  siteToggle = "NoML",
  enableSiteToggle = true,
  onDataLoaded, 
  viewport = null,
  colorMode = "Operator", // New prop to control coloring mode
  options = {}
}) => {
  console.log(`[NetworkPlannerMap] RENDER. Toggle: ${enableSiteToggle}, Type: ${siteToggle}, ColorMode: ${colorMode}`);

  const {
    siteData,
    loading,
    error,
  } = useSiteData({
    enableSiteToggle,
    siteToggle,
    projectId,
    autoFetch: true,
  });

  useEffect(() => {
    console.log(`[NetworkPlannerMap] Effect: siteData updated. Count: ${siteData.length}`);
    if (onDataLoaded) {
      onDataLoaded(siteData, loading);
    }
  }, [siteData, loading, onDataLoaded]);

  // Generate sector geometry with dynamic coloring
  const allSectors = useMemo(() => {
    console.log(`[NetworkPlannerMap] Recalculating allSectors. Data Count: ${siteData.length}, Mode: ${colorMode}`);
    return siteData.flatMap((site, idx) => generateSectorsFromSite(site, idx, colorMode));
  }, [siteData, colorMode]);

  // Performance: Only render sectors within the current map viewport
  const visibleSectors = useMemo(() => {
    console.log(`[NetworkPlannerMap] Filtering visibleSectors. Total: ${allSectors.length}`);
    if (!viewport) return allSectors;
    return allSectors.filter(s => 
      s.lat >= viewport.south && s.lat <= viewport.north && 
      s.lng >= viewport.west && s.lng <= viewport.east
    );
  }, [allSectors, viewport]);

  if (error) {
    console.error("[NetworkPlannerMap] Error state:", error);
    return null;
  }

  console.log(`[NetworkPlannerMap] Final Render. Drawing ${visibleSectors.length} sectors.`);

  return (
    <>
      {visibleSectors.map((sector) => {
        const p0 = { lat: sector.lat, lng: sector.lng };
        const r = (sector.range || radius) * (options.scale || 1);
        
        const p1 = computeOffset(p0, r, sector.azimuth - sector.beamwidth / 2);
        const p2 = computeOffset(p0, r, sector.azimuth + sector.beamwidth / 2);

        return (
          <PolygonF
            key={sector.id}
            paths={[p0, p1, p2]}
            options={{
              fillColor: sector.color,
              fillOpacity: options.opacity || 0.6,
              strokeColor: sector.color,
              strokeWeight: 1,
              strokeOpacity: 0.8,
              zIndex: options.zIndex || 2000,
              clickable: false 
            }}
          />
        );
      })}
    </>
  );
};

export default React.memo(NetworkPlannerMap);