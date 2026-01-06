import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import useSWR from "swr";
import { BarChart3, Download, Maximize2, Minimize2, Filter } from "lucide-react";
import toast from "react-hot-toast";

// Tabs
import { OverviewTab } from "./tabs/OverviewTab";
import { SignalTab } from "./tabs/SignalTab";
import { NetworkTab } from "./tabs/NetworkTab";
import { PerformanceTab } from "./tabs/PerformanceTab";
import { ApplicationTab } from "./tabs/ApplicationTab"
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
      console.error(" Failed to fetch filtered analytics data:", error);
      toast.error("Failed to apply filters to analytics");
      return locations; 
    } finally {
      setIsFilterLoading(false);
    }
  }, [projectId, sessionIds, locations]);
      
  // Apply filters when dataFilters change
  useEffect(() => {
    const applyFilters = async () => {
      if (hasActiveFilters) {
        const filtered = await fetchFilteredData(dataFilters);
        console.log(filtered,"console for location in  detailslogs ")
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
    console.log(locations,"In detail logs getting appSummary")
  }, [locations]);

  // Fetch duration
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

  // Export handler
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
          {isFilterLoading && (
            <div className="flex items-center gap-1 text-sm text-blue-400">
              <div className="animate-spin rounded-full h-3 w-3 border border-blue-400 border-t-transparent" />
              <span>Applying...</span>
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
        {TABS.map(tab => (
          <TabButton
            key={tab.id}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </TabButton>
        ))}
      </div>

      {/* Content */}
      <div className={`
        ${expanded ? "max-h-[calc(100vh-200px)]" : "max-h-[70vh]"} 
        overflow-y-auto scrollbar-hide p-4 space-y-4
      `}>
        {(isLoading || isFilterLoading) && <LoadingSpinner />}

        {!isLoading && !isFilterLoading && filteredLocations.length === 0 && (
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
      </div>
    </div>
  );
}