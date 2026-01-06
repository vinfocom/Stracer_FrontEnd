import React, { useMemo } from "react";
import { ThroughputTimelineChart } from "../charts/performance/ThroughputTimelineChart";
import { JitterLatencyChart } from "../charts/performance/JitterLatencyChart";
import { SpeedAnalysisChart } from "../charts/performance/SpeedAnalysisChart";
import { Activity } from "lucide-react";

export const PerformanceTab = ({ locations, expanded, chartRefs }) => {
 
  const hasSpeedData = useMemo(() => {
    if (!locations || locations.length === 0) return false;
    return locations.some(loc => 
      loc.speed != null && 
      !isNaN(loc.speed) && 
      isFinite(loc.speed) && 
      parseFloat(loc.speed) > 0
    );
  }, [locations]);

  // Check if there's any jitter/latency/packet_loss data
  const hasNetworkQualityData = useMemo(() => {
    if (!locations || locations.length === 0) return false;
    return locations.some(loc => 
      loc.jitter != null || 
      loc.latency != null || 
      loc.packet_loss != null
    );
  }, [locations]);

  if (!locations || locations.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-8 text-center border border-slate-700">
        <Activity className="h-12 w-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 text-sm mb-2">No Performance Data Available</p>
        <p className="text-slate-500 text-xs">
          Performance metrics will appear here when location data is loaded.
        </p>
      </div>
    );
  }

  // If no performance data at all
  if (!hasSpeedData && !hasNetworkQualityData) {
    return (
      <div className="bg-slate-800 rounded-lg p-8 text-center border border-slate-700">
        <Activity className="h-12 w-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 text-sm mb-2">No Performance Metrics Available</p>
        <p className="text-slate-500 text-xs">
          No speed, latency, jitter, or packet loss data found in the current dataset.
        </p>
      </div>
    );
  }

  // Determine grid layout based on what data is available
  const chartCount = (hasNetworkQualityData ? 1 : 0) + (hasSpeedData ? 1 : 0);
  const gridClass = expanded && chartCount > 1 ? "grid-cols-2" : "grid-cols-1";

  return (
    <div className={`grid ${gridClass} gap-4`}>
      {/* Network Quality Metrics (Latency, Jitter, Packet Loss) */}
      {hasNetworkQualityData && (
        <JitterLatencyChart 
          ref={chartRefs?.jitterLatency} 
          locations={locations} 
        />
      )}

      {/* Speed Analysis - Only render if speed data exists */}
      {hasSpeedData && (
        <SpeedAnalysisChart 
          ref={chartRefs?.speed} 
          locations={locations} 
        />
      )}

      
    </div>
  );
};