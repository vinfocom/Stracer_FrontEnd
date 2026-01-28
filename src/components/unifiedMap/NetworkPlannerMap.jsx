// src/components/unifiedMap/NetworkPlannerMap.jsx

import React, { useEffect, useState, useMemo } from "react";
import { PolygonF } from "@react-google-maps/api";
import { cellSiteApi } from "@/api/apiEndpoints";
import { getProviderColor } from "@/utils/colorUtils";
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

// Standardized mapping for sectors
function generateSectorsFromSite(site, siteIndex) {
  const sectors = [];
  const sectorCount = site.sector_count || 3;
  // Map fields based on ML/NoML variations
  const lat = parseFloat(site.lat_pred || site.lat || 0);
  const lng = parseFloat(site.lon_pred || site.lng || site.lon || 0);
  const baseAzimuth = parseFloat(site.azimuth_deg_5 || site.azimuth || 0);
  const beamwidth = parseFloat(site.beamwidth_deg_est || site.beamwidth || 65);
  const network = site.network || site.Network || site.operator || "Unknown";
  
  const color = getProviderColor(network);

  if (isNaN(lat) || isNaN(lng)) return [];

  const azimuthSpacing = 360 / sectorCount;
  for (let i = 0; i < sectorCount; i++) {
    const azimuth = (baseAzimuth + (i * azimuthSpacing)) % 360;
    sectors.push({
      id: `sector-${site.cell_id_representative || site.id || siteIndex}-${i}`,
      lat, lng, azimuth, beamwidth, color,
      network,
      range: site.range || 60,
    });
  }
  return sectors;
}

const NetworkPlannerMap = ({ 
  radius = 120, 
  projectId,
  siteToggle = "NoML",
  onDataLoaded, // Callback to send data back to legend
  viewport = null,
  options = {}
}) => {
  const [siteData, setSiteData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
  if (!projectId) return;
  
  const fetchSites = async () => {
    setLoading(true);
    try {
      let response;
      // ✅ FIX: Pass the projectId directly as a value, not as { projectId: ... }
      const id = String(projectId); 

      if (siteToggle === "Cell") {
        response = await cellSiteApi.siteNoml(id);
      } else if (siteToggle === "ML") {
        response = await cellSiteApi.siteMl(id);
      } else {
        response = await cellSiteApi.siteNoml(id);
      }

      const raw = response?.data || response?.Data || [];
      setSiteData(raw);
      
      if (onDataLoaded) {
        onDataLoaded(raw, false);
      }
    } catch (error) {
      console.error("Fetch error:", error);
      if (onDataLoaded) onDataLoaded([], false);
    } finally {
      setLoading(false);
    }
  };

  fetchSites();
}, [projectId, siteToggle]);

  const sectors = useMemo(() => {
    return siteData.flatMap((site, idx) => generateSectorsFromSite(site, idx));
  }, [siteData]);

  const visibleSectors = useMemo(() => {
    if (!viewport) return sectors;
    return sectors.filter(s => 
      s.lat >= viewport.south && s.lat <= viewport.north && 
      s.lng >= viewport.west && s.lng <= viewport.east
    );
  }, [sectors, viewport]);

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
              strokeWeight: 2,
              zIndex: options.zIndex || 2000,
            }}
          />
        );
      })}
    </>
  );
};

export default NetworkPlannerMap;