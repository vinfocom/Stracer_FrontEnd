import React, { useState } from "react";
import { ChevronDown, TowerControl } from "lucide-react";

// Colors matching src/components/unifiedMap/NetworkPlannerMap.jsx
const SITE_COLORS = [
  { label: 'Jio', color: '#3B82F6' },
  { label: 'Airtel', color: '#EF4444' },
  { label: 'Vi India', color: '#22C55E' },
  { label: 'Far Eastone', color: '#00b4d8ff' }, // Added
  { label: 'TW Mobile', color: '#f77f00ff' },   // Added
  { label: 'Yas', color: "#7d1b49" },

  { label: 'Unknown', color: '#8B5CF6' },
];

export default function SiteLegend({ enabled }) {
  const [collapsed, setCollapsed] = useState(false);

  if (!enabled) return null;

  return (
    <div className="absolute bottom-38 right-4 z-10">
      <div className="bg-gray-900/95 backdrop-blur-lg border border-gray-700/40 rounded-lg shadow-xl min-w-[160px] max-w-[200px]">
        {/* Header */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-white/5 rounded-t-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            <TowerControl className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold text-gray-100">Cell Sectors</span>
          </div>
          <ChevronDown
            className={`w-3 h-3 text-gray-500 transition-transform duration-200 ${
              collapsed ? "" : "rotate-180"
            }`}
          />
        </button>

        {/* Content */}
        {!collapsed && (
          <div className="px-3 pb-3 pt-1 space-y-2">
            {SITE_COLORS.map((item) => (
              <div key={item.label} className="flex items-center gap-2.5">
                {/* Sector Icon representation */}
                <div className="flex items-center justify-center w-4">
                   <div
                    className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent"
                    style={{ borderBottomColor: item.color }}
                  />
                </div>
                <span className="text-xs text-gray-300 font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}