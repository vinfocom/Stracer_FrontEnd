// src/components/multiMap/MapChild.jsx
import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { normalizeProviderName, normalizeTechName } from "@/utils/colorUtils";
import MapwithMultipleCircle from "../unifiedMap/MapwithMultipleCircle";
import MapLegend from "@/components/map/MapLegend";

const MapChild = ({
  id,
  title,
  allNeighbors = [],
  allLocations = [],
  onRemove,
  thresholds,
  projectId,
}) => {
  const [metric, setMetric] = useState("rsrp");
  const [provider, setProvider] = useState("All");
  const [band, setBand] = useState("All");
  const [tech, setTech] = useState("All");
  const [legendFilter, setLegendFilter] = useState(null);

  // --- 1. Filter Data ---
  const filteredData = useMemo(() => {
    if (!allLocations) return [];
    return allLocations.filter((loc) => {
      if (tech !== "All") {
        const t = normalizeTechName(loc.technology);
        if (t !== tech) return false;
      }
      if (provider !== "All") {
        const p = normalizeProviderName(loc.provider);
        if (p !== provider) return false;
      }
      if (band !== "All") {
        const b = String(loc.band || "");
        if (b !== band) return false;
      }
      return true;
    });
  }, [allLocations, tech, provider, band]);

  // --- 2. Generate Options ---
  const options = useMemo(() => {
    const techSet = new Set(["All"]);
    const providerSet = new Set(["All"]);
    const bandSet = new Set(["All"]);

    allLocations.forEach((loc) => {
      if (loc.technology) techSet.add(normalizeTechName(loc.technology));
      if (loc.provider) providerSet.add(normalizeProviderName(loc.provider));
      if (loc.band) bandSet.add(String(loc.band));
    });

    // ✅ CRITICAL FIX: Return the object
    return {
      tech: Array.from(techSet).sort(),
      provs: Array.from(providerSet).sort(),
      bands: Array.from(bandSet).sort(),
    };
  }, [allLocations]);

  return (
    <div className="relative w-full h-full flex flex-col border rounded-lg bg-white shadow-sm overflow-hidden">
      {/* --- Mini Toolbar --- */}
      <div className="flex items-center justify-between p-2 bg-gray-50 border-b h-12">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-gray-700">{title}</span>

          {/* Metric Selector */}
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="text-xs border rounded px-1 py-1 bg-white"
          >
            <option value="rsrp">RSRP</option>
            <option value="rsrq">RSRQ</option>
            <option value="sinr">SINR</option>
            <option value="ul_tpt">Ul Tpt</option>
            <option value="dl_tpt">DL Tpt</option>
            <option value="mos">MOS</option>
            <option value="lte_bler">LTE BLER</option>
            <option value="pci">PCI</option>
            <option value="num_cells">Pilot pollution</option>
            <option value="level">SSI</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* Tech Filter */}
          <select
            value={tech}
            onChange={(e) => setTech(e.target.value)}
            className="text-xs border rounded px-1 py-1 bg-white max-w-[80px]"
          >
            {options.tech.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Provider Filter */}
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="text-xs border rounded px-1 py-1 bg-white max-w-[80px]"
          >
            {options.provs.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            value={band}
            onChange={(e) => setBand(e.target.value)}
            className="text-xs border rounded px-1 py-1 bg-white max-w-[80px]"
          >
            {options.bands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <button
            onClick={() => onRemove(id)}
            className="text-gray-400 hover:text-red-500"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* --- The Map --- */}
      <div className="flex-grow relative">
        <MapwithMultipleCircle
          isLoaded={true}
          locations={filteredData}
          selectedMetric={metric}
          thresholds={thresholds}
          neighborData={allNeighbors}
          showNeighbors={true}
          fitToLocations={true}
          showControls={false}
          projectId={projectId}
          enablePolygonFilter={true}
          polygonSource="map"
          showPolygonBoundary={true}
          legendFilter={legendFilter}
        />

        <div className="absolute top-2 right-2 z-20 pointer-events-auto">
            <div className="scale-90 origin-top-right">
          <MapLegend
            thresholds={thresholds}
            selectedMetric={metric}
            logs={filteredData}
            activeFilter={legendFilter}
            onFilterChange={setLegendFilter}
          />
          </div>
        </div>

        {/* Stats Overlay */}
        <div className="absolute bottom-2 left-2 bg-white/90 p-1 rounded text-[10px] shadow z-10">
          Pts: {filteredData.length} | Avg:{" "}
          {filteredData.length > 0
            ? (
                filteredData.reduce(
                  (acc, curr) => acc + (parseFloat(curr[metric]) || 0),
                  0,
                ) / filteredData.length
              ).toFixed(1)
            : 0}
        </div>
      </div>
    </div>
  );
};

export default MapChild;
