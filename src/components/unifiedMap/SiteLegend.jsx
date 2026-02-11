// src/components/unifiedMap/SiteLegend.jsx

import React, { useState, useMemo } from "react";
import { ChevronDown, TowerControl, Loader2, Layers } from "lucide-react";
import { 
  getProviderColor, 
  normalizeProviderName,
  getBandColor,
  normalizeBandName,
  getTechnologyColor,
  normalizeTechName
} from "@/utils/colorUtils";

export default function SiteLegend({ enabled, sites = [], isLoading = false, colorMode = "Operator" }) {
  const [collapsed, setCollapsed] = useState(false);

  const legendItems = useMemo(() => {
    if (!sites || sites.length === 0) return [];

    const itemMap = new Map();
    const mode = colorMode.toLowerCase();

    sites.forEach(site => {
      let rawName = "Unknown";
      let normalized = "Unknown";
      let color = "#9ca3af";

      if (mode === "band") {
        rawName = site.band || site.frequency_band || site.Band || "Unknown";
        normalized = normalizeBandName(rawName);
        color = getBandColor(normalized);
      } else if (mode === "technology") {
        rawName = site.tech || site.technology || site.Technology || "Unknown";
        normalized = normalizeTechName(rawName);
        color = getTechnologyColor(normalized);
      } else {
        // Default to Operator
        rawName = site.network || site.Network || site.operator || "Unknown";
        normalized = normalizeProviderName(rawName) || "Unknown";
        color = getProviderColor(normalized);
      }
      
      if (!itemMap.has(normalized)) {
        itemMap.set(normalized, {
          label: normalized,
          color: color,
          count: 1
        });
      } else {
        itemMap.get(normalized).count++;
      }
    });

    // Sort: Bands numerically if possible, otherwise alphabetical
    return Array.from(itemMap.values()).sort((a, b) => {
       if (mode === "band") {
         const numA = parseInt(a.label.replace(/\D/g, ''));
         const numB = parseInt(b.label.replace(/\D/g, ''));
         if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
       }
       return a.label.localeCompare(b.label);
    });
  }, [sites, colorMode]);

  if (!enabled) return null;

  return (
    <div className="absolute bottom-38 right-4 z-[20]">
      <div className="bg-gray-900/95 backdrop-blur-lg border border-gray-700/40 rounded-lg shadow-xl min-w-[180px]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-white/5 rounded-t-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            <TowerControl className="w-4 h-4 text-blue-400" />
            <div className="flex flex-col items-start">
               <span className="text-xs font-bold text-gray-100">
                Cell Sectors
              </span>
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                 by {colorMode}
              </span>
            </div>
           
          </div>
          
          {!isLoading && <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${collapsed ? "" : "rotate-180"}`} />}
          {isLoading && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
        </button>

        {!collapsed && (
          <div className="px-3 pb-3 pt-1 space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar">
            {legendItems.length > 0 ? (
              legendItems.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-4">
                      <div
                        className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent"
                        style={{ borderBottomColor: item.color }}
                      />
                    </div>
                    <span className="text-xs text-gray-300 font-medium">{item.label}</span>
                  </div>
                  <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded-full">
                    {item.count}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-2 text-[10px] text-gray-500 italic text-center">
                {isLoading ? "Fetching site data..." : "No sites in view"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}