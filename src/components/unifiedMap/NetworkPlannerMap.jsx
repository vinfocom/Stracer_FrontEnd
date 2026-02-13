// src/components/unifiedMap/NetworkPlannerMap.jsx

import React, { useEffect, useMemo, useState } from "react";
import { PolygonF, PolylineF } from "@react-google-maps/api";
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
    
    // ✅ FIX 1: Robust Coordinate Extraction (Added site.latitude and site.longitude)
    const lat = parseFloat(site.lat ?? site.latitude ?? site.lat_pred ?? site.Lat ?? 0);
    const lng = parseFloat(site.lng ?? site.longitude ?? site.lon_pred ?? site.lon ?? site.Lng ?? 0);
    
    const baseAzimuth = parseFloat(site.azimuth ?? site.azimuth_deg_5 ?? 0);
    const beamwidth = parseFloat(site.beamwidth ?? site.beamwidth_deg_est ?? site.bw ?? 65);
    const range = parseFloat(site.range ?? 220);

    // Extract network info safely
    const network = site.operator || site.network || site.cluster || "Unknown";
    const band = site.band || site.frequency_band || site.frequency || "Unknown";
    const tech = site.tech || site.Technology || site.technology || "Unknown";
    
    // ✅ FIX 2: EXTRACT PCI ROBUSTLY
    const pci = site.pci ?? site.PCI ?? site.physical_cell_id ?? site.cell_id;

    let color;
    const mode = colorMode.toLowerCase();
    if (mode === "band") {
        color = getBandColor(band);
    } else if (mode === "technology") {
        color = getTechnologyColor(tech);
    } else {
        color = getProviderColor(network);
    }
  
    // Avoid generating sectors at Null Island (0,0)
    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return [];
  
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
        // Force string for perfect matching
        pci: pci !== null && pci !== undefined ? String(pci).trim() : null,
        siteId: site.site || site.site_id
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
  colorMode = "Operator", 
  options = {},
  hoveredLog, // Expecting the hovered log object
}) => {

  const { siteData, loading, error } = useSiteData({
    enableSiteToggle,
    siteToggle,
    projectId,
    autoFetch: true,
  });

  useEffect(() => {
    if (onDataLoaded) {
      onDataLoaded(siteData, loading);
    }
  }, [siteData, loading, onDataLoaded]);

  const allSectors = useMemo(() => {
    return siteData.flatMap((site, idx) => generateSectorsFromSite(site, idx, colorMode));
  }, [siteData, colorMode]);

  const visibleSectors = useMemo(() => {
    if (!viewport) return allSectors;
    return allSectors.filter(s => 
      s.lat >= viewport.south && s.lat <= viewport.north && 
      s.lng >= viewport.west && s.lng <= viewport.east
    );
  }, [allSectors, viewport]);

  // Extract log PCI robustly
  const logPci = useMemo(() => {
    if (!hoveredLog) return null;
    // Check all possible casing for PCI
    const p = hoveredLog.pci ?? hoveredLog.PCI ?? hoveredLog.cell_id ?? hoveredLog.physical_cell_id;
    const stringPci = p !== null && p !== undefined ? String(p).trim() : null;
    console.log(`DEBUG: Extracted Log PCI: [${stringPci}]`);
    return stringPci;
  }, [hoveredLog]);

  // Extract log Coordinates robustly
  const logCoords = useMemo(() => {
    if (!hoveredLog) return null;
    const lat = parseFloat(hoveredLog.lat ?? hoveredLog.latitude ?? hoveredLog.Lat);
    const lng = parseFloat(hoveredLog.lng ?? hoveredLog.longitude ?? hoveredLog.Lng ?? hoveredLog.lon);
    
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    console.warn("DEBUG: Hovered log has invalid coordinates", hoveredLog);
    return null;
  }, [hoveredLog]);

  const isMatchFound = visibleSectors.some(s => logPci !== null && s.pci === logPci);

  // DEBUGGING UI COMPONENT
  const DebugPanel = () => (
    <div className="absolute top-20 left-4 z-[999999] bg-black/90 text-green-400 font-mono text-xs p-4 rounded-md shadow-2xl pointer-events-none w-80 border border-green-500">
      <h3 className="text-white font-bold mb-2 border-b border-gray-600 pb-1 text-sm">🛠️ Serving Line Debugger</h3>
      
      <div className="mb-2">
        <strong>Hovered Log:</strong> {hoveredLog ? <span className="text-green-400">Detected</span> : <span className="text-red-400">NONE</span>}
      </div>

      <div className="mb-2 pl-2 border-l-2 border-green-700">
        <div><strong>Extracted Log PCI:</strong> <span className={logPci ? "text-yellow-300" : "text-red-400"}>{logPci !== null ? `"${logPci}"` : 'null'}</span></div>
        <div><strong>Extracted Log Coords:</strong> <span className={logCoords ? "text-blue-300" : "text-red-400"}>{logCoords ? `Valid (${logCoords.lat.toFixed(4)}, ...)` : 'INVALID/NULL'}</span></div>
      </div>

      <div className="mb-2">
        <strong>Visible Sectors:</strong> {visibleSectors.length}
      </div>
      
      <div className="pl-2 border-l-2 border-green-700 mb-2">
        <div><strong>Sample Sector PCIs:</strong></div>
        <div className="text-gray-300 truncate">
          {visibleSectors.length > 0 ? visibleSectors.slice(0, 5).map(s => `"${s.pci}"`).join(', ') : 'No sectors loaded'}
        </div>
      </div>

      <div className={`mt-3 p-2 rounded text-center font-bold uppercase ${isMatchFound && logCoords ? 'bg-green-600 text-white' : 'bg-red-900 text-red-200'}`}>
        {isMatchFound && logCoords ? '✅ Ready to draw line' : '❌ Line block: No match / No Coords'}
      </div>
    </div>
  );

  if (error) return null;

  

  return (
    <>
      <DebugPanel />
      
      {visibleSectors.map((sector) => {
        const p0 = { lat: sector.lat, lng: sector.lng };
        const r = (sector.range || radius) * (options.scale || 1);
        const p1 = computeOffset(p0, r, sector.azimuth - sector.beamwidth / 2);
        const p2 = computeOffset(p0, r, sector.azimuth + sector.beamwidth / 2);

        const isHoveredMatch = logPci !== null && sector.pci === logPci;

        const sectorPci = sector.pci !== null && sector.pci !== undefined ? String(sector.pci).trim() : null;


if (isHoveredMatch) {
  console.log(`[NetworkPlannerMap] Match Found! Sector: ${sectorPci} == Log: ${logPci}`);
}

        return (
          <React.Fragment key={sector.id}>
            <PolygonF
              paths={[p0, p1, p2]}
              options={{
                fillColor: sector.color,
                fillOpacity: isHoveredMatch ? 0.9 : (options.opacity || 0.6),
                strokeWeight: isHoveredMatch ? 1 : 1,
                strokeColor: isHoveredMatch ? "#FF0000" : sector.color, // Highlight matched sector in red
                zIndex: isHoveredMatch ? 2001 : 2000,
              }}
            />
            
            {/* The Actual Line Drawing */}
            {isHoveredMatch && logCoords && (
  <PolylineF
    path={[p0, logCoords]} // p0 is sector origin, logCoords is the log location
    options={{
      strokeColor: "#000000",
      strokeOpacity: 1.0,
      strokeWeight: 2, 
      
      zIndex: 999999 // Prevents line from hiding under other map layers
    }}
  />
)}
          </React.Fragment>
        );
      })}
    </>
  );
};

export default React.memo(NetworkPlannerMap);