import React, { useState, useMemo } from "react";
import { 
  ChevronUp, 
  ChevronDown, 
  Activity, 
  BarChart3, 
  Maximize2,
  Minimize2,
  Signal
} from "lucide-react";
import { Card } from "@/components/ui/card";

const MapChildFooter = ({ 
  data = [], 
  metric = "rsrp", 
  thresholds = [] 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // --- 1. Calculate Statistics ---
  const stats = useMemo(() => {
    if (!data.length) return null;

    const values = data
      .map((d) => parseFloat(d[metric]))
      .filter((v) => !isNaN(v));

    if (!values.length) return null;

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Distribution based on thresholds
    const distribution = values.reduce((acc, val) => {
        let color = "#9CA3AF"; // Default gray
        
        // Find matching threshold color
        if (thresholds?.length) {
            // Sort thresholds to ensure correct range checking
            const sortedThresholds = [...thresholds].sort((a, b) => parseFloat(a.min) - parseFloat(b.min));
            
            for (let i = 0; i < sortedThresholds.length; i++) {
                const t = sortedThresholds[i];
                const tMin = parseFloat(t.min);
                const tMax = parseFloat(t.max);
                // Check if value falls in range (handling last bucket inclusive)
                if (val >= tMin && (i === sortedThresholds.length - 1 ? val <= tMax : val < tMax)) {
                    color = t.color;
                    break;
                }
            }
            // Edge cases for out of bounds (match first or last)
            if (val < parseFloat(sortedThresholds[0].min)) color = sortedThresholds[0].color;
            if (val > parseFloat(sortedThresholds[sortedThresholds.length - 1].max)) color = sortedThresholds[sortedThresholds.length - 1].color;
        }

        acc[color] = (acc[color] || 0) + 1;
        return acc;
    }, {});

    return { avg, min, max, count: values.length, distribution };
  }, [data, metric, thresholds]);

  // If no data, render nothing or empty state
  if (!stats) return null;

  return (
    <div 
      className={`
        absolute bottom-0 left-0 right-0 z-30 
        bg-white/95 backdrop-blur-sm border-t shadow-lg
        transition-all duration-300 ease-in-out
        ${isExpanded ? "h-64" : "h-12"}
        flex flex-col
      `}
    >
      {/* --- Header / Collapsed View --- */}
      <div 
        className="flex items-center justify-between px-4 h-12 cursor-pointer hover:bg-gray-50 transition-colors shrink-0 border-b border-gray-100"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4 overflow-hidden">
            {/* Title & Icon */}
            <div className="flex items-center gap-2 text-blue-700 font-semibold min-w-fit">
                <Activity size={16} />
                <span className="text-sm">Analytics</span>
            </div>

            {/* Quick Stats Summary */}
            <div className="flex items-center gap-3 text-xs text-gray-600 border-l pl-3 ml-1 truncate">
                <span className="font-medium text-gray-900">{stats.count}</span> Samples
                <span className="w-px h-3 bg-gray-300 mx-1 hidden sm:block"></span>
                <span className="hidden sm:inline">Avg {metric.toUpperCase()}: </span>
                <span className={`font-mono font-bold ${getMetricColorClass(stats.avg, metric)}`}>
                    {stats.avg.toFixed(1)}
                </span>
            </div>
        </div>

        {/* Toggle Button */}
        <button 
            className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
        >
            {isExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>

      {/* --- Expanded Content --- */}
      <div className={`flex-grow overflow-y-auto p-4 ${isExpanded ? "opacity-100 visible" : "opacity-0 invisible h-0"}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatBox label={`Avg ${metric}`} value={stats.avg.toFixed(2)} icon={<Activity size={14}/>} />
            <StatBox label="Min Value" value={stats.min.toFixed(2)} />
            <StatBox label="Max Value" value={stats.max.toFixed(2)} />
            <StatBox label="Total Samples" value={stats.count} />
        </div>

        {/* Distribution Bar */}
        <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span className="flex items-center gap-1"><BarChart3 size={12}/> Signal Distribution</span>
                <span>{metric.toUpperCase()}</span>
            </div>
            
            <div className="h-4 w-full flex rounded-full overflow-hidden bg-gray-100 border border-gray-200">
                {Object.entries(stats.distribution).map(([color, count]) => (
                    <div 
                        key={color}
                        style={{ width: `${(count / stats.count) * 100}%`, backgroundColor: color }}
                        className="h-full hover:opacity-80 transition-opacity relative group"
                        title={`Count: ${count} (${((count/stats.count)*100).toFixed(1)}%)`}
                    />
                ))}
            </div>
            
            {/* Simple Legend for Bar */}
            <div className="flex items-center gap-2 flex-wrap mt-2">
                 {Object.entries(stats.distribution)
                    .sort((a,b) => b[1] - a[1]) // Sort by count desc
                    .slice(0, 5) // Show top 5 segments
                    .map(([color, count]) => (
                    <div key={color} className="flex items-center gap-1 text-[10px] text-gray-600">
                        <span className="w-2 h-2 rounded-full" style={{backgroundColor: color}}></span>
                        <span>{((count/stats.count)*100).toFixed(0)}%</span>
                    </div>
                 ))}
            </div>
        </div>
      </div>
    </div>
  );
};

// --- Helper Sub-components ---

const StatBox = ({ label, value, icon }) => (
    <div className="bg-slate-50 p-2 rounded border border-slate-100 flex flex-col items-center justify-center shadow-sm">
        <span className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
            {icon} {label}
        </span>
        <span className="text-sm font-bold text-slate-800">{value}</span>
    </div>
);

const getMetricColorClass = (val, metric) => {
    // Very basic coloring for RSRP just for the header text
    if (metric === 'rsrp') {
        if (val > -85) return 'text-green-600';
        if (val > -105) return 'text-yellow-600';
        return 'text-red-600';
    }
    return 'text-blue-600';
};

export default MapChildFooter;