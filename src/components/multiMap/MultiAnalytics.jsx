import React, { useMemo } from "react";
import { 
  BarChart3, 
  TrendingUp, 
  Activity, 
  Database,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { SignalDistributionChart } from "../unifiedMap/charts/signal/SignalDistributionChart";
import { ThroughputTimelineChart } from "../unifiedMap/charts/performance/ThroughputTimelineChart";
import { calculateStats } from "@/utils/analyticsHelpers";

const StatCard = ({ label, value, unit, icon: Icon, colorClass }) => (
  <div className="bg-white p-3 rounded-lg border shadow-sm flex items-center gap-3">
    <div className={`p-2 rounded-full ${colorClass}`}>
      <Icon size={16} />
    </div>
    <div>
      <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{label}</p>
      <p className="text-sm font-bold text-gray-800">
        {value} <span className="text-[10px] font-normal text-gray-400">{unit}</span>
      </p>
    </div>
  </div>
);

const MultiAnalytics = ({ data, metric, thresholds }) => {
  // 1. Calculate stats using full dataset
  const stats = useMemo(() => calculateStats(data, metric), [data, metric]);

  // 2. FIX FOR "NO BAR" & COLOR ISSUES
  // This ensures the chart receives a valid threshold object with a 'color' property
  const normalizedThresholds = useMemo(() => {
    if (!thresholds) return null;

    // Try multiple case variations to find the correct threshold array
    // e.g., metric='rsrp' might be stored as 'RSRP' or 'rsrp' or 'Rsrp'
    const key = Object.keys(thresholds).find(
      k => k.toLowerCase() === metric.toLowerCase() || 
           k.toLowerCase().replace('_', '') === metric.toLowerCase().replace('_', '')
    );

    const rawThresholds = key ? thresholds[key] : null;
    
    if (!rawThresholds) {
      console.warn(`MultiAnalytics: No thresholds found for metric "${metric}"`);
      return null;
    }

    // Map over thresholds and ensure '.color' exists
    const cleanThresholds = rawThresholds.map(t => ({
      ...t,
      // Fallback: use color, colorCode, fill, or a default gray if all missing
      color: t.color || t.colorCode || t.fill || '#9CA3AF' 
    }));

    // Return in the exact format expected by SignalDistributionChart: { [metric]: [...] }
    return { [metric]: cleanThresholds };
  }, [thresholds, metric]);

  // 3. Performance Optimization: Downsample data for Timeline Chart
  const optimizedChartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const TARGET_POINTS = 2000;
    if (data.length <= TARGET_POINTS) return data;

    const step = Math.ceil(data.length / TARGET_POINTS);
    return data.filter((_, index) => index % step === 0);
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2 bg-gray-50">
        <Database size={32} className="opacity-20" />
        <p className="text-sm italic">No data available for analytics</p>
      </div>
    );
  }

  return (
    // FIX FOR SCROLLING: 
    // 'absolute inset-0' forces it to fill the parent container
    // 'overflow-y-auto' enables the scrollbar when content is too tall
    <div className="absolute inset-0 overflow-y-auto bg-gray-50/50">
      <div className="p-4 flex flex-col gap-4 pb-20"> {/* pb-20 adds space at bottom for scrolling */}
        
        {/* --- Key Metrics Grid --- */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard 
            label="Samples" 
            value={stats?.count || 0} 
            unit="pts" 
            icon={Database} 
            colorClass="bg-blue-100 text-blue-600"
          />
          <StatCard 
            label={`Avg ${metric.toUpperCase()}`} 
            value={stats?.avg || 0} 
            unit="" 
            icon={Activity} 
            colorClass="bg-emerald-100 text-emerald-600"
          />
          <StatCard 
            label="Max" 
            value={stats?.max || 0} 
            unit="" 
            icon={ArrowUp} 
            colorClass="bg-orange-100 text-orange-600"
          />
          <StatCard 
            label="Min" 
            value={stats?.min || 0} 
            unit="" 
            icon={ArrowDown} 
            colorClass="bg-slate-100 text-slate-600"
          />
        </div>

        {/* --- Charts Section --- */}
        <div className="grid grid-cols-1 gap-4">
          
          {/* Distribution Chart */}
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden min-h-[300px]">
            <div className="p-2 border-b bg-gray-50 flex items-center gap-2">
              <BarChart3 size={14} className="text-gray-500" />
              <span className="text-xs font-bold text-gray-700">Metric Distribution</span>
            </div>
            <div className="p-2 h-[250px]">
               {/* Pass the normalized thresholds object */}
               <SignalDistributionChart 
                  locations={data} 
                  metric={metric} 
                  thresholds={normalizedThresholds} 
               />
            </div>
          </div>

          {/* Timeline Chart */}
          {data.some(d => d.dl_tpt || d.ul_tpt) && (
            <div className="bg-white rounded-lg border shadow-sm overflow-hidden min-h-[350px]">
              <div className="p-2 border-b bg-gray-50 flex items-center gap-2">
                <TrendingUp size={14} className="text-gray-500" />
                <span className="text-xs font-bold text-gray-700">Throughput Timeline</span>
              </div>
              <div className="p-2 h-[300px]">
                <ThroughputTimelineChart locations={optimizedChartData} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MultiAnalytics;