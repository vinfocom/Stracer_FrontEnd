// src/components/map/MapLegend.jsx
import React, { useMemo, useState } from "react";
import { ChevronDown, Layers } from "lucide-react";
import {
  PCI_COLOR_PALETTE,
  COLOR_SCHEMES,
  getMetricConfig,
  getMetricValueFromLog,
} from "@/utils/metrics";
import { normalizeProviderName, normalizeTechName } from "@/utils/colorUtils";

// Helper to get normalized key for counting
const getNormalizedKey = (log, colorBy, scheme) => {
  switch (colorBy) {
    case "provider":
      return normalizeProviderName(log.provider || log.Provider || log.carrier) || "Unknown";
      
    case "technology":
      const tech = log.network || log.Network || log.technology || log.networkType;
      const band = log.band || log.Band || log.neighbourBand || log.neighborBand || log.neighbour_band;
      return normalizeTechName(tech, band);

    case "band": {
      // ✅ FIX: Prioritize neighbor band fields first so "n78" is picked up instead of the primary band
      const b = String(
        log.neighbourBand || 
        log.neighborBand || 
        log.neighbour_band || 
        log.band || 
        log.Band || 
        ""
      ).trim();
      
      return b === "-1" || b === "" ? "Unknown" : (scheme[b] ? b : "Unknown");
    }
    default:
      return "Unknown";
  }
};

// ✅ Color Scheme Legend - UPDATED to hide "Unknown"
const ColorSchemeLegend = ({ colorBy, logs }) => {
  const scheme = COLOR_SCHEMES[colorBy];
  if (!scheme) return null;

  const { counts, total, usedEntries } = useMemo(() => {
    // Initialize counts for all scheme keys
    const tempCounts = Object.fromEntries(Object.keys(scheme).map(k => [k, 0]));

    logs?.forEach((log) => {
      const key = getNormalizedKey(log, colorBy, scheme);
      if (key in tempCounts) tempCounts[key]++;
    });

    const used = Object.entries(scheme)
      .filter(([key]) => 
        tempCounts[key] > 0 && 
        key !== "Unknown" // 👈 ADDED: Filter out Unknown entries
      )
      .sort((a, b) => tempCounts[b[0]] - tempCounts[a[0]]);

    return { counts: tempCounts, total: logs?.length || 0, usedEntries: used };
  }, [logs, colorBy, scheme]);

  if (!usedEntries.length) {
    return <div className="text-xs text-white text-center py-3">No data available</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto max-h-[200px] space-y-0.5 pr-1 custom-scrollbar">
        {usedEntries.map(([key, color]) => (
          <LegendRow
            key={key}
            color={color}
            label={key}
            count={counts[key]}
            total={total}
          />
        ))}
      </div>
      <LegendFooter total={total} />
    </div>
  );
};

// ✅ PCI Legend
const PciLegend = ({ logs }) => {
  const pciStats = useMemo(() => {
    const pciMap = new Map();
    let validCount = 0, invalidCount = 0;

    logs?.forEach((log) => {
      const pci = getMetricValueFromLog(log, "pci");
      if (Number.isFinite(pci)) {
        pciMap.set(Math.floor(pci), (pciMap.get(Math.floor(pci)) || 0) + 1);
        validCount++;
      } else {
        invalidCount++;
      }
    });

    return {
      allPcis: [...pciMap.entries()].sort((a, b) => b[1] - a[1]),
      uniqueCount: pciMap.size,
      validCount,
      invalidCount,
    };
  }, [logs]);

  const getPciColor = (pci) =>
    PCI_COLOR_PALETTE[Math.abs(Math.floor(pci)) % PCI_COLOR_PALETTE.length];

  if (!pciStats.allPcis.length) {
    return <div className="text-xs text-gray-500 text-center py-3">No PCI data available</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto max-h-[200px] space-y-0.5 pr-1 custom-scrollbar">
        {pciStats.allPcis.map(([pci, count]) => (
          <LegendRow
            key={pci}
            color={getPciColor(pci)}
            label={pci}
            count={count}
            total={pciStats.validCount}
          />
        ))}
      </div>
      <LegendFooter
        total={pciStats.validCount}
        uniqueCount={pciStats.uniqueCount}
        invalidCount={pciStats.invalidCount}
      />
    </div>
  );
};

// ✅ Metric Threshold Legend
const MetricThresholdLegend = ({ thresholds, selectedMetric, logs }) => {
  const config = getMetricConfig(selectedMetric);
  const list = thresholds?.[config.thresholdKey] || [];

  const { validCount, invalidCount, usedThresholds } = useMemo(() => {
    if (!logs?.length || !list.length) {
      return { validCount: 0, invalidCount: 0, usedThresholds: [] };
    }

    const tempCounts = new Array(list.length).fill(0);
    let valid = 0, invalid = 0;

    logs.forEach((log) => {
      const val = getMetricValueFromLog(log, selectedMetric);

      if (!Number.isFinite(val)) {
        invalid++;
        return;
      }

      valid++;
      const idx = list.findIndex((t) => {
        const min = parseFloat(t.min), max = parseFloat(t.max);
        return Number.isFinite(min) && Number.isFinite(max) && val >= min && val <= max;
      });

      if (idx !== -1) {
        tempCounts[idx]++;
      } else {
        // Handle edge cases
        const mins = list.map((t) => parseFloat(t.min)).filter(Number.isFinite);
        const maxs = list.map((t) => parseFloat(t.max)).filter(Number.isFinite);
        
        if (mins.length && maxs.length) {
          if (val < Math.min(...mins)) {
            const i = list.findIndex((t) => parseFloat(t.min) === Math.min(...mins));
            if (i !== -1) tempCounts[i]++;
          } else if (val > Math.max(...maxs)) {
            const i = list.findIndex((t) => parseFloat(t.max) === Math.max(...maxs));
            if (i !== -1) tempCounts[i]++;
          }
        }
      }
    });

    return {
      validCount: valid,
      invalidCount: invalid,
      usedThresholds: list
        .map((t, idx) => ({ ...t, idx, count: tempCounts[idx] }))
        .filter((t) => t.count > 0),
    };
  }, [logs, list, selectedMetric]);

  if (!list.length) {
    return <div className="text-xs text-gray-500 text-center py-3">No thresholds configured</div>;
  }

  if (!usedThresholds.length) {
    return <div className="text-xs text-gray-500 text-center py-3">No data available</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto max-h-[200px] space-y-0.5 pr-1 custom-scrollbar">
        {usedThresholds.map((t) => (
          <LegendRow
            key={t.idx}
            color={t.color}
            label={t.range || t.label || `${t.min} → ${t.max}`}
            count={t.count}
            total={validCount}
          />
        ))}
      </div>
      <LegendFooter total={validCount} invalidCount={invalidCount} invalidLabel="No value" />
    </div>
  );
};

// ✅ Reusable Legend Row Component
const LegendRow = ({ color, label, count, total }) => {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;

  return (
    <div className="flex items-center gap-3 py-1.5 px-1 rounded hover:bg-white/5 transition-colors">
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-[11px] text-white flex-1 truncate">{label}</span>
      <span className="text-sm tabular-nums text-white min-w-[36px] text-right">
        {count.toLocaleString()}
      </span>
      
    </div>
  );
};

// ✅ Reusable Legend Footer Component
const LegendFooter = ({ total, uniqueCount, invalidCount, invalidLabel = "No PCI" }) => (
  <div className="pt-2 mt-2 border-t border-gray-700/50 space-y-1 px-1">
    {uniqueCount !== undefined && (
      <div className="flex justify-between">
        <span className="text-[10px] text-gray-500">Unique</span>
        <span className="text-[10px] tabular-nums text-gray-400">{uniqueCount}</span>
      </div>
    )}
    <div className="flex justify-between">
      <span className="text-[10px] text-gray-500">Total</span>
      <span className="text-[10px] tabular-nums text-gray-400">{total.toLocaleString()}</span>
    </div>
    {invalidCount > 0 && (
      <div className="flex justify-between">
        <span className="text-[10px] text-gray-500">{invalidLabel}</span>
        <span className="text-[10px] tabular-nums text-amber-400/80">{invalidCount.toLocaleString()}</span>
      </div>
    )}
  </div>
);

// ✅ Main MapLegend Component
export default function MapLegend({
  thresholds,
  selectedMetric,
  colorBy = null,
  logs = [],
}) {
  const [collapsed, setCollapsed] = useState(false);

  const { content, title } = useMemo(() => {
    if (colorBy) {
      return {
        content: <ColorSchemeLegend colorBy={colorBy} logs={logs} />,
        title: colorBy.charAt(0).toUpperCase() + colorBy.slice(1),
      };
    }
    
    if (selectedMetric?.toLowerCase() === "pci") {
      return { content: <PciLegend logs={logs} />, title: "PCI" };
    }

    const config = getMetricConfig(selectedMetric);
    return {
      content: (
        <MetricThresholdLegend
          thresholds={thresholds}
          selectedMetric={selectedMetric}
          logs={logs}
        />
      ),
      title: `${config.label}${config.unit ? ` (${config.unit})` : ""}`,
    };
  }, [colorBy, selectedMetric, thresholds, logs]);

  if (!content) return null;

  return (
    <>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
      `}</style>

      <div className="absolute top-28 right-4 z-10">
        <div
          className={`bg-gray-900/95 backdrop-blur-lg border border-gray-700/40 rounded-lg shadow-xl shadow-black/20 transition-all duration-200 ${
            collapsed ? "w-auto" : "min-w-[240px] max-w-[280px]"
          }`}
        >
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-white/5 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-100">{title}</span>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                collapsed ? "" : "rotate-180"
              }`}
            />
          </button>

          {!collapsed && (
            <div className="px-2 pb-2">
              <div className="pt-1 border-t border-gray-700/40">{content}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}