// src/components/unifiedMap/SiteLegend.jsx

import React, { useState, useMemo } from "react";
import { ChevronDown, TowerControl, Loader2 } from "lucide-react"; // Added Loader2
import { getProviderColor, normalizeProviderName } from "@/utils/colorUtils";

export default function SiteLegend({ enabled, sites = [], isLoading = false }) {
  const [collapsed, setCollapsed] = useState(false);

  const availableOperators = useMemo(() => {
  if (!sites || sites.length === 0) return [];

  const operatorMap = new Map();
  sites.forEach(site => {
    // Check all possible operator fields from the API
    const rawName = site.network || site.Network || site.operator || "Unknown";
    const normalized = normalizeProviderName(rawName) || "Unknown"; 
    
    if (!operatorMap.has(normalized)) {
      operatorMap.set(normalized, {
        label: normalized,
        color: getProviderColor(normalized)
      });
    }
  });
  return Array.from(operatorMap.values()).sort((a, b) => a.label.localeCompare(b.label));
}, [sites]);

  
  if (!enabled) return null;

  return (
    <div className="absolute bottom-38 right-4 z-[20]"> {/* Increased z-index */}
      <div className="bg-gray-900/95 backdrop-blur-lg border border-gray-700/40 rounded-lg shadow-xl min-w-[180px]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-white/5 rounded-t-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            <TowerControl className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold text-gray-100">
              Cell Sectors {availableOperators.length > 0 ? `(${availableOperators.length})` : ''}
            </span>
          </div>
          
          {!isLoading && <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${collapsed ? "" : "rotate-180"}`} />}
        </button>

        {!collapsed && (
          <div className="px-3 pb-3 pt-1 space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar">
            {availableOperators.length > 0 ? (
              availableOperators.map((item) => (
                <div key={item.label} className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-4">
                    <div
                      className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent"
                      style={{ borderBottomColor: item.color }}
                    />
                  </div>
                  <span className="text-xs text-gray-300 font-medium">{item.label}</span>
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