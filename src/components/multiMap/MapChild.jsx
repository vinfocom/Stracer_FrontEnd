// src/components/multiMap/MapChild.jsx
import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { normalizeProviderName, normalizeTechName } from "@/utils/colorUtils";
import MapwithMultipleCircle from "../unifiedMap/MapwithMultipleCircle";
import MapLegend from "@/components/map/MapLegend";
import MapChildFooter from "./MapChildFooter";

const MapChild = ({
  id,
  title,
  allNeighbors = [],
  allLocations = [],
  mapRole = "primary",
  onRemove,
  thresholds,
  projectId,
}) => {
  const isSecondaryView = mapRole === "secondary";
  const [metric, setMetric] = useState("rsrp");
  const [provider, setProvider] = useState("All");
  const [band, setBand] = useState("All");
  const [tech, setTech] = useState("All");
  const [legendFilter, setLegendFilter] = useState(null);

  const filteredPrimaryData = useMemo(() => {
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

  const filteredNeighborData = useMemo(() => {
    if (!allNeighbors) return [];
    return allNeighbors.filter((neighbor) => {
      const lat = parseFloat(
        neighbor.lat ?? neighbor.latitude ?? neighbor.Lat,
      );
      const lng = parseFloat(
        neighbor.lng ?? neighbor.longitude ?? neighbor.Lng ?? neighbor.lon,
      );
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

      const normalizedTech = normalizeTechName(
        neighbor.networkType || neighbor.technology,
        neighbor.neighbourBand || neighbor.neighborBand || neighbor.primaryBand,
      );
      const normalizedProvider = normalizeProviderName(neighbor.provider);
      const normalizedBand = String(
        neighbor.neighbourBand ??
          neighbor.neighborBand ??
          neighbor.primaryBand ??
          neighbor.band ??
          "",
      );

      if (tech !== "All" && normalizedTech !== tech) return false;
      if (provider !== "All" && normalizedProvider !== provider) return false;
      if (band !== "All" && normalizedBand !== band) return false;

      return true;
    });
  }, [allNeighbors, tech, provider, band]);

  const secondaryDisplayData = useMemo(() => {
    return filteredNeighborData.map((neighbor) => {
      const neighbourRsrp = parseFloat(
        neighbor.neighbourRsrp ?? neighbor.neighbour_rsrp,
      );
      const neighbourRsrq = parseFloat(
        neighbor.neighbourRsrq ?? neighbor.neighbour_rsrq,
      );
      const neighbourSinr = parseFloat(
        neighbor.neighbourSinr ?? neighbor.neighbour_sinr,
      );

      return {
        ...neighbor,
        lat: parseFloat(neighbor.lat ?? neighbor.latitude ?? neighbor.Lat),
        lng: parseFloat(
          neighbor.lng ?? neighbor.longitude ?? neighbor.Lng ?? neighbor.lon,
        ),
        provider: normalizeProviderName(neighbor.provider),
        technology: normalizeTechName(
          neighbor.networkType || neighbor.technology,
          neighbor.neighbourBand || neighbor.neighborBand || neighbor.primaryBand,
        ),
        band: String(
          neighbor.neighbourBand ??
            neighbor.neighborBand ??
            neighbor.primaryBand ??
            neighbor.band ??
            "",
        ),
        pci: neighbor.neighbourPci ?? neighbor.neighbour_pci ?? neighbor.primaryPci,
        rsrp: Number.isFinite(neighbourRsrp) ? neighbourRsrp : null,
        rsrq: Number.isFinite(neighbourRsrq) ? neighbourRsrq : null,
        sinr: Number.isFinite(neighbourSinr) ? neighbourSinr : null,
      };
    });
  }, [filteredNeighborData]);

  const displayData = isSecondaryView ? secondaryDisplayData : filteredPrimaryData;

  const options = useMemo(() => {
    const techSet = new Set(["All"]);
    const providerSet = new Set(["All"]);
    const bandSet = new Set(["All"]);

    if (isSecondaryView) {
      allNeighbors.forEach((neighbor) => {
        const normalizedTech = normalizeTechName(
          neighbor.networkType || neighbor.technology,
          neighbor.neighbourBand ||
            neighbor.neighborBand ||
            neighbor.primaryBand,
        );
        const normalizedProvider = normalizeProviderName(neighbor.provider);
        const normalizedBand = String(
          neighbor.neighbourBand ??
            neighbor.neighborBand ??
            neighbor.primaryBand ??
            neighbor.band ??
            "",
        );

        if (normalizedTech) techSet.add(normalizedTech);
        if (normalizedProvider) providerSet.add(normalizedProvider);
        if (normalizedBand) bandSet.add(normalizedBand);
      });
    } else {
      allLocations.forEach((loc) => {
        if (loc.technology) techSet.add(normalizeTechName(loc.technology));
        if (loc.provider) providerSet.add(normalizeProviderName(loc.provider));
        if (loc.band) bandSet.add(String(loc.band));
      });
    }

    return {
      tech: Array.from(techSet).sort(),
      provs: Array.from(providerSet).sort(),
      bands: Array.from(bandSet).sort(),
    };
  }, [allLocations, allNeighbors, isSecondaryView]);

  return (
    <div className="relative w-full h-full flex flex-col border rounded-lg bg-white shadow-sm overflow-hidden">
      {/* --- Mini Toolbar --- */}
      <div className="flex items-center justify-between p-2 bg-gray-50 border-b h-12">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-gray-700">{title}</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
              isSecondaryView
                ? "bg-purple-100 text-purple-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            {isSecondaryView ? "Secondary Logs" : "Primary Logs"}
          </span>

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
          locations={isSecondaryView ? [] : filteredPrimaryData}
          selectedMetric={metric}
          thresholds={thresholds}
          neighborData={isSecondaryView ? filteredNeighborData : []}
          showNeighbors={isSecondaryView}
          fitToLocations={true}
          showControls={false}
          projectId={projectId}
          enablePolygonFilter={true}
          polygonSource="map"
          showPolygonBoundary={true}
          showPoints={!isSecondaryView}
          legendFilter={legendFilter}
        />

        <div className="absolute top-14 right-2 z-20 pointer-events-auto">
          <div className="scale-90 origin-top-right">
            <MapLegend
              thresholds={thresholds}
              selectedMetric={metric}
              logs={displayData}
              activeFilter={legendFilter}
              onFilterChange={setLegendFilter}
              className="relative" // Added to fix positioning
            />
          </div>
        </div>

        <div>
          <MapChildFooter
            data={displayData}
            metric={metric}
            thresholds={thresholds}
          />
        </div>

        {/* Stats Overlay */}
        <div className="absolute bottom-2 left-2 bg-white/90 p-1 rounded text-[10px] shadow z-10">
          Pts: {displayData.length} | Avg:{" "}
          {displayData.length > 0
            ? (
                displayData.reduce(
                  (acc, curr) => acc + (parseFloat(curr[metric]) || 0),
                  0,
                ) / displayData.length
              ).toFixed(1)
            : 0}
        </div>
      </div>
    </div>
  );
};

export default MapChild;
