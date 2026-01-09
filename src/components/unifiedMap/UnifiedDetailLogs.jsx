// src/components/unifiedMap/UnifiedDetailLogs.jsx
import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import useSWR from "swr";
import { 
  BarChart3, 
  Download, 
  Maximize2, 
  Minimize2, 
  Filter,
  Radio,
  Square,
  Signal,
  TrendingUp,
  TrendingDown,
  Activity,
  Wifi,
  Zap
} from "lucide-react";
import toast from "react-hot-toast";

// Tabs
import { OverviewTab } from "./tabs/OverviewTab";
import { SignalTab } from "./tabs/SignalTab";
import { NetworkTab } from "./tabs/NetworkTab";
import { PerformanceTab } from "./tabs/PerformanceTab";
import { ApplicationTab } from "./tabs/ApplicationTab";
import { IOAnalysis } from "./tabs/IOAnalysis";

// Common
import { TabButton } from "./common/TabButton";
import { LoadingSpinner } from "./common/LoadingSpinner";

// Utils
import { calculateStats, calculateIOSummary } from "@/utils/analyticsHelpers";
import { exportAnalytics } from "@/utils/exportService";
import { TABS } from "@/utils/constants";
import { adminApi } from "@/api/apiEndpoints";

const DEFAULT_DATA_FILTERS = {
  providers: [],
  bands: [],
  technologies: [],
};

// Helper to get color from thresholds
const getColorFromThresholds = (value, thresholds) => {
  if (value == null || isNaN(value)) return '#9CA3AF';
  
  if (!thresholds?.length) {
    if (value >= -80) return '#10B981';
    if (value >= -90) return '#34D399';
    if (value >= -100) return '#FBBF24';
    if (value >= -110) return '#F97316';
    return '#EF4444';
  }
  
  const sorted = [...thresholds]
    .filter(t => t.min != null && t.max != null)
    .sort((a, b) => parseFloat(a.min) - parseFloat(b.min));
  
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const min = parseFloat(t.min);
    const max = parseFloat(t.max);
    const isLast = i === sorted.length - 1;
    
    if (value >= min && (isLast ? value <= max : value < max)) {
      return t.color;
    }
  }
  
  if (sorted.length > 0) {
    if (value < parseFloat(sorted[0].min)) return sorted[0].color;
    if (value > parseFloat(sorted[sorted.length - 1].max)) return sorted[sorted.length - 1].color;
  }
  
  return '#9CA3AF';
};

const getSignalQuality = (value) => {
  if (value == null) return { label: 'Unknown', color: '#9CA3AF' };
  if (value >= -80) return { label: 'Excellent', color: '#10B981' };
  if (value >= -90) return { label: 'Good', color: '#34D399' };
  if (value >= -100) return { label: 'Fair', color: '#FBBF24' };
  if (value >= -110) return { label: 'Poor', color: '#F97316' };
  return { label: 'Very Poor', color: '#EF4444' };
};

// N78 Analysis Tab Component
const N78AnalysisTab = ({ 
  n78NeighborData, 
  n78NeighborStats, 
  n78NeighborLoading,
  thresholds,
  expanded 
}) => {
  // Get RSRP thresholds
  const rsrpThresholds = thresholds?.rsrp || [];

  // Calculate detailed N78 statistics
  const n78DetailedStats = useMemo(() => {
    if (!n78NeighborData?.length) return null;
    
    const neighborRsrpValues = n78NeighborData
      .map(n => n.neighborRsrp)
      .filter(v => v != null && !isNaN(v));
    
    const neighborRsrqValues = n78NeighborData
      .map(n => n.neighborRsrq)
      .filter(v => v != null && !isNaN(v));
    
    const primaryRsrpValues = n78NeighborData
      .map(n => n.rsrp)
      .filter(v => v != null && !isNaN(v));
    
    const primaryRsrqValues = n78NeighborData
      .map(n => n.rsrq)
      .filter(v => v != null && !isNaN(v));

    const sinrValues = n78NeighborData
      .map(n => n.sinr)
      .filter(v => v != null && !isNaN(v));

    const mosValues = n78NeighborData
      .map(n => n.mos)
      .filter(v => v != null && !isNaN(v));
    
    // Group by provider
    const providerCounts = {};
    const providerN78Rsrp = {};
    
    // Group by primary band
    const bandCounts = {};
    
    // Group by network type
    const networkCounts = {};
    
    // Group by environment (indoor/outdoor)
    const envCounts = { Indoor: 0, Outdoor: 0, Unknown: 0 };
    
    // Signal quality distribution
    const qualityDist = { Excellent: 0, Good: 0, Fair: 0, Poor: 0, 'Very Poor': 0 };
    
    n78NeighborData.forEach(n => {
      // Provider stats
      if (n.provider) {
        if (!providerCounts[n.provider]) {
          providerCounts[n.provider] = 0;
          providerN78Rsrp[n.provider] = [];
        }
        providerCounts[n.provider]++;
        if (n.neighborRsrp != null) {
          providerN78Rsrp[n.provider].push(n.neighborRsrp);
        }
      }
      
      // Band stats
      if (n.primaryBand) {
        bandCounts[n.primaryBand] = (bandCounts[n.primaryBand] || 0) + 1;
      }
      
      // Network stats
      if (n.network || n.networkType) {
        const net = n.network || n.networkType;
        networkCounts[net] = (networkCounts[net] || 0) + 1;
      }
      
      // Environment stats
      const env = n.indoorOutdoor || 'Unknown';
      if (env.toLowerCase().includes('indoor')) {
        envCounts.Indoor++;
      } else if (env.toLowerCase().includes('outdoor')) {
        envCounts.Outdoor++;
      } else {
        envCounts.Unknown++;
      }
      
      // Quality distribution
      if (n.neighborRsrp != null) {
        const quality = getSignalQuality(n.neighborRsrp);
        qualityDist[quality.label]++;
      }
    });
    
    // Calculate stats helper
    const calcStats = (values) => {
      if (!values.length) return { min: null, max: null, avg: null, median: null, count: 0 };
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
        count: values.length,
      };
    };
    
    // Calculate provider averages
    const providerStats = Object.entries(providerCounts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: (count / n78NeighborData.length * 100).toFixed(1),
        avgN78Rsrp: providerN78Rsrp[name]?.length > 0 
          ? providerN78Rsrp[name].reduce((a, b) => a + b, 0) / providerN78Rsrp[name].length 
          : null,
      }))
      .sort((a, b) => b.count - a.count);
    
    return {
      total: n78NeighborData.length,
      neighborRsrp: calcStats(neighborRsrpValues),
      neighborRsrq: calcStats(neighborRsrqValues),
      primaryRsrp: calcStats(primaryRsrpValues),
      primaryRsrq: calcStats(primaryRsrqValues),
      sinr: calcStats(sinrValues),
      mos: calcStats(mosValues),
      providers: providerStats,
      bands: Object.entries(bandCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ 
          name, 
          count, 
          percentage: (count / n78NeighborData.length * 100).toFixed(1) 
        })),
      networks: Object.entries(networkCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ 
          name, 
          count, 
          percentage: (count / n78NeighborData.length * 100).toFixed(1) 
        })),
      environment: envCounts,
      qualityDistribution: qualityDist,
    };
  }, [n78NeighborData]);

  if (n78NeighborLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
        <span className="ml-3 text-slate-400">Loading N78 neighbor data...</span>
      </div>
    );
  }

  if (!n78NeighborData?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <Radio className="h-16 w-16 mb-4 opacity-50" />
        <p className="text-lg font-medium">No N78 Neighbor Data Available</p>
        <p className="text-sm mt-2">Enable N78 neighbors in the sidebar to see analysis</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-500/20 rounded-lg">
          <Radio className="h-6 w-6 text-blue-400" />
        </div>
        <div>
          <h3 className="font-semibold text-lg text-white">N78 Neighbor Analysis</h3>
          <p className="text-xs text-slate-400">5G n78 Band Detection Points</p>
        </div>
        <div className="ml-auto bg-blue-500/20 px-3 py-1 rounded-full">
          <span className="text-blue-400 font-bold">{n78DetailedStats?.total.toLocaleString()}</span>
          <span className="text-slate-400 text-sm ml-1">records</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className={`grid ${expanded ? 'grid-cols-4' : 'grid-cols-2'} gap-3`}>
        {/* Total Records */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <Square className="h-4 w-4 text-blue-400" fill="currentColor" />
            <span className="text-xs text-slate-400">Total Records</span>
          </div>
          <div className="text-2xl font-bold text-blue-400">
            {n78DetailedStats?.total.toLocaleString()}
          </div>
        </div>

        {/* Avg N78 RSRP */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <Signal className="h-4 w-4 text-indigo-400" />
            <span className="text-xs text-slate-400">Avg N78 RSRP</span>
          </div>
          <div 
            className="text-2xl font-bold"
            style={{ color: getColorFromThresholds(n78DetailedStats?.neighborRsrp.avg, rsrpThresholds) }}
          >
            {n78DetailedStats?.neighborRsrp.avg?.toFixed(1) ?? 'N/A'}
            <span className="text-sm font-normal text-slate-500 ml-1">dBm</span>
          </div>
        </div>

        {/* Median N78 RSRP */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="h-4 w-4 text-purple-400" />
            <span className="text-xs text-slate-400">Median N78 RSRP</span>
          </div>
          <div 
            className="text-2xl font-bold"
            style={{ color: getColorFromThresholds(n78DetailedStats?.neighborRsrp.median, rsrpThresholds) }}
          >
            {n78DetailedStats?.neighborRsrp.median?.toFixed(1) ?? 'N/A'}
            <span className="text-sm font-normal text-slate-500 ml-1">dBm</span>
          </div>
        </div>

        {/* Sessions */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-green-400" />
            <span className="text-xs text-slate-400">Sessions</span>
          </div>
          <div className="text-2xl font-bold text-green-400">
            {n78NeighborStats?.sessionCount || '-'}
          </div>
        </div>
      </div>

      {/* Signal Range Bar */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <div className="text-xs font-semibold text-slate-400 mb-3 uppercase">N78 Signal Range</div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-400" />
            <span className="text-sm text-slate-400">Min:</span>
            <span 
              className="font-bold"
              style={{ color: getColorFromThresholds(n78DetailedStats?.neighborRsrp.min, rsrpThresholds) }}
            >
              {n78DetailedStats?.neighborRsrp.min?.toFixed(1)} dBm
            </span>
          </div>
          <div className="flex-1 mx-4 h-2 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full opacity-60" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Max:</span>
            <span 
              className="font-bold"
              style={{ color: getColorFromThresholds(n78DetailedStats?.neighborRsrp.max, rsrpThresholds) }}
            >
              {n78DetailedStats?.neighborRsrp.max?.toFixed(1)} dBm
            </span>
            <TrendingUp className="h-4 w-4 text-green-400" />
          </div>
        </div>
      </div>

      {/* Signal Quality Distribution */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <div className="text-xs font-semibold text-slate-400 mb-3 uppercase">Signal Quality Distribution</div>
        <div className="space-y-2">
          {Object.entries(n78DetailedStats?.qualityDistribution || {}).map(([quality, count]) => {
            const percentage = (count / n78DetailedStats.total * 100);
            const qualityInfo = getSignalQuality(
              quality === 'Excellent' ? -70 :
              quality === 'Good' ? -85 :
              quality === 'Fair' ? -95 :
              quality === 'Poor' ? -105 : -115
            );
            
            return (
              <div key={quality} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-20">{quality}</span>
                <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${percentage}%`,
                      backgroundColor: qualityInfo.color 
                    }}
                  />
                </div>
                <span className="text-xs font-medium text-slate-300 w-16 text-right">
                  {count} ({percentage.toFixed(1)}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Primary vs N78 Comparison */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <div className="text-xs font-semibold text-slate-400 mb-3 uppercase">Primary Cell vs N78 Neighbor</div>
        <div className={`grid ${expanded ? 'grid-cols-4' : 'grid-cols-2'} gap-3`}>
          {/* Primary RSRP */}
          <div className="bg-slate-900/50 rounded-lg p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">Primary RSRP</div>
            <div 
              className="text-xl font-bold"
              style={{ color: getColorFromThresholds(n78DetailedStats?.primaryRsrp.avg, rsrpThresholds) }}
            >
              {n78DetailedStats?.primaryRsrp.avg?.toFixed(1) ?? 'N/A'}
              <span className="text-xs font-normal text-slate-500 ml-1">dBm</span>
            </div>
          </div>

          {/* N78 RSRP */}
          <div className="bg-blue-900/30 rounded-lg p-3 text-center border border-blue-700/30">
            <div className="text-xs text-blue-400 mb-1">N78 RSRP</div>
            <div 
              className="text-xl font-bold"
              style={{ color: getColorFromThresholds(n78DetailedStats?.neighborRsrp.avg, rsrpThresholds) }}
            >
              {n78DetailedStats?.neighborRsrp.avg?.toFixed(1) ?? 'N/A'}
              <span className="text-xs font-normal text-slate-500 ml-1">dBm</span>
            </div>
          </div>

          {/* Primary RSRQ */}
          <div className="bg-slate-900/50 rounded-lg p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">Primary RSRQ</div>
            <div className="text-xl font-bold text-slate-300">
              {n78DetailedStats?.primaryRsrq.avg?.toFixed(1) ?? 'N/A'}
              <span className="text-xs font-normal text-slate-500 ml-1">dB</span>
            </div>
          </div>

          {/* N78 RSRQ */}
          <div className="bg-blue-900/30 rounded-lg p-3 text-center border border-blue-700/30">
            <div className="text-xs text-blue-400 mb-1">N78 RSRQ</div>
            <div className="text-xl font-bold text-blue-300">
              {n78DetailedStats?.neighborRsrq.avg?.toFixed(1) ?? 'N/A'}
              <span className="text-xs font-normal text-slate-500 ml-1">dB</span>
            </div>
          </div>
        </div>

        {/* Difference Indicator */}
        {n78DetailedStats?.primaryRsrp.avg != null && n78DetailedStats?.neighborRsrp.avg != null && (
          <div className="mt-3 text-center bg-slate-900/50 rounded-lg p-2">
            <span className="text-xs text-slate-500">RSRP Difference: </span>
            <span className={`font-bold ${
              n78DetailedStats.neighborRsrp.avg > n78DetailedStats.primaryRsrp.avg 
                ? 'text-green-400' 
                : 'text-red-400'
            }`}>
              {n78DetailedStats.neighborRsrp.avg > n78DetailedStats.primaryRsrp.avg ? '+' : ''}
              {(n78DetailedStats.neighborRsrp.avg - n78DetailedStats.primaryRsrp.avg).toFixed(1)} dB
            </span>
            <span className="text-xs text-slate-500 ml-2">
              ({n78DetailedStats.neighborRsrp.avg > n78DetailedStats.primaryRsrp.avg 
                ? 'N78 stronger' 
                : 'Primary stronger'})
            </span>
          </div>
        )}
      </div>

      {/* Provider & Band Breakdown */}
      <div className={`grid ${expanded ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
        {/* By Provider */}
        {n78DetailedStats?.providers?.length > 0 && (
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="text-xs font-semibold text-slate-400 mb-3 uppercase flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              By Provider
            </div>
            <div className="space-y-2">
              {n78DetailedStats.providers.slice(0, 5).map((p, idx) => (
                <div key={p.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ 
                        backgroundColor: ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444'][idx % 5]
                      }}
                    />
                    <span className="text-sm font-medium text-slate-300 truncate max-w-[100px]">
                      {p.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {p.avgN78Rsrp != null && (
                      <span 
                        className="text-xs font-medium"
                        style={{ color: getColorFromThresholds(p.avgN78Rsrp, rsrpThresholds) }}
                      >
                        {p.avgN78Rsrp.toFixed(1)} dBm
                      </span>
                    )}
                    <span className="text-xs text-slate-500">{p.percentage}%</span>
                    <span className="font-bold text-blue-400 min-w-[40px] text-right">
                      {p.count.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By Primary Band */}
        {n78DetailedStats?.bands?.length > 0 && (
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="text-xs font-semibold text-slate-400 mb-3 uppercase flex items-center gap-2">
              <Zap className="h-4 w-4" />
              By Primary Band
            </div>
            <div className="space-y-2">
              {n78DetailedStats.bands.slice(0, 5).map((b, idx) => (
                <div key={b.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded"
                      style={{ 
                        backgroundColor: ['#06B6D4', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444'][idx % 5]
                      }}
                    />
                    <span className="text-sm font-medium text-slate-300">
                      Band {b.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{b.percentage}%</span>
                    <span className="font-bold text-purple-400 min-w-[40px] text-right">
                      {b.count.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Network Type & Environment */}
      <div className={`grid ${expanded ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
        {/* By Network Type */}
        {n78DetailedStats?.networks?.length > 0 && (
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="text-xs font-semibold text-slate-400 mb-3 uppercase">By Primary Network</div>
            <div className="flex flex-wrap gap-2">
              {n78DetailedStats.networks.map((n, idx) => (
                <div 
                  key={n.name}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border"
                  style={{
                    backgroundColor: ['#3B82F620', '#10B98120', '#F59E0B20', '#8B5CF620'][idx % 4],
                    borderColor: ['#3B82F650', '#10B98150', '#F59E0B50', '#8B5CF650'][idx % 4],
                    color: ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'][idx % 4],
                  }}
                >
                  {n.name}: {n.count} ({n.percentage}%)
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Environment */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="text-xs font-semibold text-slate-400 mb-3 uppercase">Environment</div>
          <div className="flex gap-3">
            <div className="flex-1 bg-green-900/30 rounded-lg p-3 text-center border border-green-700/30">
              <div className="text-xs text-green-400 mb-1">Outdoor</div>
              <div className="text-lg font-bold text-green-400">
                {n78DetailedStats?.environment.Outdoor || 0}
              </div>
              <div className="text-xs text-slate-500">
                {((n78DetailedStats?.environment.Outdoor || 0) / n78DetailedStats?.total * 100).toFixed(1)}%
              </div>
            </div>
            <div className="flex-1 bg-blue-900/30 rounded-lg p-3 text-center border border-blue-700/30">
              <div className="text-xs text-blue-400 mb-1">Indoor</div>
              <div className="text-lg font-bold text-blue-400">
                {n78DetailedStats?.environment.Indoor || 0}
              </div>
              <div className="text-xs text-slate-500">
                {((n78DetailedStats?.environment.Indoor || 0) / n78DetailedStats?.total * 100).toFixed(1)}%
              </div>
            </div>
            {n78DetailedStats?.environment.Unknown > 0 && (
              <div className="flex-1 bg-slate-700/50 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-400 mb-1">Unknown</div>
                <div className="text-lg font-bold text-slate-400">
                  {n78DetailedStats?.environment.Unknown}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Additional Metrics */}
      {(n78DetailedStats?.sinr.count > 0 || n78DetailedStats?.mos.count > 0) && (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="text-xs font-semibold text-slate-400 mb-3 uppercase">Additional Metrics</div>
          <div className={`grid ${expanded ? 'grid-cols-4' : 'grid-cols-2'} gap-3`}>
            {n78DetailedStats?.sinr.count > 0 && (
              <>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-slate-500 mb-1">Avg SINR</div>
                  <div className="text-lg font-bold text-cyan-400">
                    {n78DetailedStats.sinr.avg?.toFixed(1)} dB
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-slate-500 mb-1">SINR Range</div>
                  <div className="text-sm font-medium text-slate-300">
                    {n78DetailedStats.sinr.min?.toFixed(1)} ~ {n78DetailedStats.sinr.max?.toFixed(1)} dB
                  </div>
                </div>
              </>
            )}
            {n78DetailedStats?.mos.count > 0 && (
              <>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-slate-500 mb-1">Avg MOS</div>
                  <div className="text-lg font-bold text-amber-400">
                    {n78DetailedStats.mos.avg?.toFixed(2)}
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-slate-500 mb-1">MOS Range</div>
                  <div className="text-sm font-medium text-slate-300">
                    {n78DetailedStats.mos.min?.toFixed(2)} ~ {n78DetailedStats.mos.max?.toFixed(2)}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Extended TABS with N78
const EXTENDED_TABS = [
  ...TABS,
  { id: "n78", label: "N78 Analysis" },
];

export default function UnifiedDetailLogs({
  locations = [],
  distance,
  totalLocations = 0,
  filteredCount = 0,
  selectedMetric,
  siteData = [],
  siteToggle,
  enableSiteToggle,
  appSummary,
  polygons = [],
  showPolygons,
  projectId,
  sessionIds = [],
  isLoading,
  thresholds,
  logArea,
  onClose,
  tptVolume,
  InpSummary,
  indoor,
  outdoor,
  durationTime,
  showN78Neighbors = false,
  n78NeighborData = [],
  n78NeighborStats = null,
  n78NeighborLoading = false,
  dataFilters = DEFAULT_DATA_FILTERS,
  onFilteredDataChange,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [filteredLocations, setFilteredLocations] = useState(locations);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const [durationData, setDurationData] = useState(durationTime);

  useEffect(() => {
    setDurationData(durationTime);
  }, [durationTime]);
  
  const chartRefs = {
    distribution: useRef(null),
    tech: useRef(null),
    radar: useRef(null),
    band: useRef(null),
    operator: useRef(null),
    pciColorLegend: useRef(null),
    providerPerf: useRef(null),
    speed: useRef(null),
    throughputTimeline: useRef(null),
    jitterLatency: useRef(null),
    mosChart: useRef(null),
    throughputChart: useRef(null),
    signalChart: useRef(null),
    qoeChart: useRef(null),
  };

  const hasActiveFilters = useMemo(() => {
    return (
      dataFilters.providers?.length > 0 ||
      dataFilters.bands?.length > 0 ||
      dataFilters.technologies?.length > 0
    );
  }, [dataFilters]);

  // Dynamic tabs based on N78 data availability
  const availableTabs = useMemo(() => {
    if (showN78Neighbors && n78NeighborData?.length > 0) {
      return EXTENDED_TABS;
    }
    return TABS;
  }, [showN78Neighbors, n78NeighborData]);
  
  const fetchFilteredData = useCallback(async (filters) => {
    if (!projectId && !sessionIds?.length) {
      console.warn("No projectId or sessionIds provided for filtering");
      return locations;
    }

    try {
      setIsFilterLoading(true);
      
      const payload = {
        project_id: projectId,
        session_ids: sessionIds,
        filters: {
          providers: filters.providers || [],
          bands: filters.bands || [],
          technologies: filters.technologies || [],
        },
      };

      console.log("📡 Fetching filtered analytics data:", payload);

      const response = await adminApi.getFilteredLocations(payload);
      const filteredData = response?.Data || response?.data || [];
      
      console.log("✅ Filtered analytics data received:", filteredData.length, "locations");
      
      if (filteredData.length > 0) {
        toast.success(`Analytics updated: ${filteredData.length} locations`, {
          duration: 2000,
          icon: '📊',
        });
      } else {
        toast.warning("No data matches current filters", {
          duration: 2000,
        });
      }
      
      return filteredData;
    } catch (error) {
      console.error("Failed to fetch filtered analytics data:", error);
      toast.error("Failed to apply filters to analytics");
      return locations; 
    } finally {
      setIsFilterLoading(false);
    }
  }, [projectId, sessionIds, locations]);
      
  useEffect(() => {
    const applyFilters = async () => {
      if (hasActiveFilters) {
        const filtered = await fetchFilteredData(dataFilters);
        console.log(filtered, "console for location in detailslogs");
        setFilteredLocations(filtered);
        onFilteredDataChange?.(filtered);
      } else {
        setFilteredLocations(locations);
        onFilteredDataChange?.(locations);
      }
    };

    applyFilters();
  }, [dataFilters, hasActiveFilters]); 

  useEffect(() => {
    if (!hasActiveFilters) {
      setFilteredLocations(locations);
    }
  }, [locations, hasActiveFilters]);

  useEffect(() => {
    console.log(locations, "In detail logs getting appSummary");
  }, [locations]);

  const fetchDuration = async () => {
    if (!sessionIds?.length) return null;
    const resp = await adminApi.getNetworkDurations({ session_ids: sessionIds });
    return resp?.Data || null;
  };

  const { data: duration } = useSWR(
    sessionIds?.length ? ["network-duration", sessionIds] : null,
    fetchDuration,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  const stats = useMemo(
    () => calculateStats(filteredLocations, selectedMetric),
    [filteredLocations, selectedMetric]
  );

  const ioSummary = useMemo(
    () => calculateIOSummary(logArea),
    [logArea]
  );

  const polygonStats = useMemo(() => {
    if (!polygons?.length) return null;

    const withPoints = polygons.filter(p => p.pointCount > 0);
    const totalPoints = polygons.reduce((sum, p) => sum + (p.pointCount || 0), 0);

    return {
      total: polygons.length,
      withData: withPoints.length,
      totalPoints,
      avgPoints: (totalPoints / withPoints.length || 0).toFixed(1),
    };
  }, [polygons]);

  const handleExport = () => {
    exportAnalytics({
      locations: filteredLocations,
      stats,
      duration,
      appSummary,
      ioSummary,
      projectId,
      sessionIds,
      chartRefs,
      selectedMetric,
      totalLocations,
      filteredCount: filteredLocations.length,
      polygonStats,
      siteData,
      appliedFilters: dataFilters,
      n78NeighborData: showN78Neighbors ? n78NeighborData : null,
      n78NeighborStats: showN78Neighbors ? n78NeighborStats : null,
    });
  };

  // Collapsed state
  if (collapsed) {
    return (
      <div className="fixed bottom-4 left-4 flex gap-2 z-40">
        <button
          onClick={() => setCollapsed(false)}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-slate-800 transition-all flex items-center gap-2 text-sm"
        >
          <BarChart3 className="h-4 w-4" />
          Show Analytics
          {hasActiveFilters && (
            <span className="ml-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
              Filtered
            </span>
          )}
          {showN78Neighbors && n78NeighborData?.length > 0 && (
            <span className="ml-1 bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
              N78
            </span>
          )}
        </button>
        <button
          onClick={onClose}
          className="bg-red-900 text-white px-3 py-2 rounded-lg shadow-lg hover:bg-red-800 transition-all text-sm"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div
      className={`
        fixed z-40 bg-slate-950 text-white  
        shadow-2xl border border-slate-700 transition-all duration-300
        ${expanded 
          ? "top-14 left-1/2 -translate-x-1/2 w-[95vw] max-w-[850px]" 
          : "bottom-4 right-0 w-[480px]"
        }
        h-[calc(100%-72px)]
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900 rounded-t-lg">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-blue-400" />
          <h3 className="font-semibold text-lg">Analytics Dashboard</h3>
          {hasActiveFilters && (
            <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
              <Filter className="h-3 w-3" />
              Filtered
            </span>
          )}
          {showN78Neighbors && n78NeighborData?.length > 0 && (
            <span className="bg-purple-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
              <Radio className="h-3 w-3" />
              N78: {n78NeighborData.length.toLocaleString()}
            </span>
          )}
          {(isFilterLoading || n78NeighborLoading) && (
            <div className="flex items-center gap-1 text-sm text-blue-400">
              <div className="animate-spin rounded-full h-3 w-3 border border-blue-400 border-t-transparent" />
              <span>Loading...</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={!filteredLocations?.length}
            className="flex items-center gap-2 text-slate-400 hover:text-green-400 transition-colors p-2 rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export Analytics"
          >
            <Download className="h-4 w-4" />
            <span className="text-sm font-medium hidden lg:inline">Export</span>
          </button>
          
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-slate-400 hover:text-blue-400 p-1 rounded hover:bg-slate-800"
            title={expanded ? "Minimize" : "Maximize"}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          
          <button
            onClick={() => setCollapsed(true)}
            className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 font-bold"
            title="Collapse"
          >
            −
          </button>
          
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-red-400 px-2 py-1 rounded hover:bg-slate-800"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Filter Summary Bar */}
      {hasActiveFilters && (
        <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-700 flex items-center gap-3 text-sm flex-wrap">
          <span className="text-slate-400 font-medium flex items-center gap-1">
            <Filter className="h-3 w-3" />
            Active Filters:
          </span>
          
          {dataFilters.providers?.length > 0 && (
            <span className="bg-blue-900/50 text-blue-300 px-2 py-1 rounded border border-blue-700/30 text-xs font-medium">
              📡 Providers: {dataFilters.providers.join(", ")}
            </span>
          )}
          
          {dataFilters.bands?.length > 0 && (
            <span className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded border border-purple-700/30 text-xs font-medium">
              📶 Bands: {dataFilters.bands.join(", ")}
            </span>
          )}
          
          {dataFilters.technologies?.length > 0 && (
            <span className="bg-green-900/50 text-green-300 px-2 py-1 rounded border border-green-700/30 text-xs font-medium">
              🔧 Tech: {dataFilters.technologies.join(", ")}
            </span>
          )}
          
          <span className="text-slate-400 ml-auto font-mono text-xs">
            {filteredLocations.length.toLocaleString()} / {totalLocations.toLocaleString()} logs
            <span className="text-blue-400 ml-2">
              ({totalLocations > 0 ? ((filteredLocations.length / totalLocations) * 100).toFixed(1) : 0}%)
            </span>
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 p-3 bg-slate-900 border-b border-slate-700 overflow-x-auto scrollbar-hide">
        {availableTabs.map(tab => (
          <TabButton
            key={tab.id}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={tab.id === 'n78' ? 'bg-purple-900/30 border-purple-700/50' : ''}
          >
            {tab.id === 'n78' && <Radio className="h-3 w-3 mr-1" />}
            {tab.label}
            {tab.id === 'n78' && n78NeighborData?.length > 0 && (
              <span className="ml-1 text-xs opacity-70">({n78NeighborData.length})</span>
            )}
          </TabButton>
        ))}
      </div>

      {/* Content */}
      <div className={`
        ${expanded ? "max-h-[calc(100vh-200px)]" : "max-h-[70vh]"} 
        overflow-y-auto scrollbar-hide p-4 space-y-4
      `}>
        {(isLoading || isFilterLoading) && <LoadingSpinner />}

        {!isLoading && !isFilterLoading && filteredLocations.length === 0 && activeTab !== 'n78' && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Filter className="h-16 w-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">No data matches the current filters</p>
            <p className="text-sm mt-2">Try adjusting your filter criteria</p>
          </div>
        )}

        {activeTab === "overview" && filteredLocations.length > 0 && (
          <OverviewTab
            totalLocations={totalLocations}
            filteredCount={filteredLocations.length}
            siteData={siteData}
            distance={distance}
            siteToggle={siteToggle}
            enableSiteToggle={enableSiteToggle}
            showPolygons={showPolygons}
            polygonStats={polygonStats}
            stats={stats}
            selectedMetric={selectedMetric}
            ioSummary={ioSummary}
            durationData={durationData}
            duration={duration}
            locations={filteredLocations}
            expanded={expanded}
            tptVolume={tptVolume}
          />
        )}

        {activeTab === "signal" && filteredLocations.length > 0 && (
          <SignalTab
            locations={filteredLocations}
            selectedMetric={selectedMetric}
            thresholds={thresholds}
            expanded={expanded}
            chartRefs={chartRefs}
          />
        )}

        {activeTab === "network" && filteredLocations.length > 0 && (
          <NetworkTab
            locations={filteredLocations}
            expanded={expanded}
            chartRefs={chartRefs}
          />
        )}

        {activeTab === "performance" && filteredLocations.length > 0 && (
          <PerformanceTab
            locations={filteredLocations}
            expanded={expanded}
            chartRefs={chartRefs}
          />
        )}

        {activeTab === "Application" && (
          <ApplicationTab
            appSummary={appSummary}
            expanded={expanded}
            chartRefs={chartRefs}
          />
        )}

        {activeTab === "io" && (
          <IOAnalysis 
            indoor={indoor}
            outdoor={outdoor}
            expanded={expanded}
            chartRefs={chartRefs}
          />
        )}

        {/* N78 Analysis Tab */}
        {activeTab === "n78" && (
          <N78AnalysisTab
            n78NeighborData={n78NeighborData}
            n78NeighborStats={n78NeighborStats}
            n78NeighborLoading={n78NeighborLoading}
            thresholds={thresholds}
            expanded={expanded}
          />
        )}
      </div>
    </div>
  );
}