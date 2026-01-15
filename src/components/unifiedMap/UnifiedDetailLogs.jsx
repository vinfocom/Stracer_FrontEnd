// UnifiedDetailLogs.jsx
import React, {
  useState,
  useRef,
  useMemo,
  useEffect,
  useCallback,
} from "react";
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
  Zap,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  Image,
  FileJson,
  Loader2,
  Check,
} from "lucide-react";
import toast from "react-hot-toast";

// Tabs
import { OverviewTab } from "./tabs/OverviewTab";
import { SignalTab } from "./tabs/SignalTab";
import { HandoverAnalysisTab } from "./tabs/HandoverAnalysisTab";
import { NetworkTab } from "./tabs/NetworkTab";
import { PerformanceTab } from "./tabs/PerformanceTab";
import { ApplicationTab } from "./tabs/ApplicationTab";
import { IOAnalysis } from "./tabs/IOAnalysis";
import  N78AnalysisTab  from "./tabs/N78AnalysisTab";

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

// ============================================
// EXPORT UTILITIES
// ============================================

// Convert data to CSV format
const convertToCSV = (data, headers) => {
  if (!data || !data.length) return "";
  
  const csvHeaders = headers || Object.keys(data[0]);
  const csvRows = [
    csvHeaders.join(","),
    ...data.map(row => 
      csvHeaders.map(header => {
        const value = row[header];
        const cellStr = String(value ?? "");
        if (cellStr.includes(",") || cellStr.includes('"') || cellStr.includes("\n")) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(",")
    )
  ];
  
  return csvRows.join("\n");
};

// Download file utility
const downloadFile = (content, filename, type = "text/csv") => {
  const blob = new Blob([content], { type: `${type};charset=utf-8;` });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Capture element as image using html2canvas
const captureElementAsImage = async (element, filename) => {
  try {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(element, {
      backgroundColor: "#0f172a",
      scale: 2,
      logging: false,
      useCORS: true,
    });
    
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
    
    return true;
  } catch (error) {
    console.error("Failed to capture image:", error);
    return false;
  }
};

// ============================================
// EXPORT DROPDOWN COMPONENT
// ============================================

const ExportDropdown = ({
  locations,
  stats,
  duration,
  appSummary,
  ioSummary,
  projectId,
  sessionIds,
  chartRefs,
  selectedMetric,
  totalLocations,
  filteredCount,
  polygonStats,
  siteData,
  dataFilters,
  n78NeighborData,
  n78NeighborStats,
  technologyTransitions,
  contentRef,
  activeTab,
  indoor,
  outdoor,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState(null);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getTimestamp = () => new Date().toISOString().split("T")[0];

  // Export all data as CSV
  const exportAllDataCSV = async () => {
    setIsExporting(true);
    setExportType("csv");
    
    try {
      const timestamp = getTimestamp();
      
      // Main locations data
      if (locations?.length) {
        const locationHeaders = [
          "index", "latitude", "longitude", "rsrp", "rsrq", "sinr", 
          "technology", "provider", "band", "pci", "timestamp", "session_id"
        ];
        const locationData = locations.map((loc, idx) => ({
          index: idx + 1,
          latitude: loc.lat?.toFixed(6) || loc.latitude?.toFixed(6) || "",
          longitude: loc.lng?.toFixed(6) || loc.longitude?.toFixed(6) || "",
          rsrp: loc.rsrp ?? "",
          rsrq: loc.rsrq ?? "",
          sinr: loc.sinr ?? "",
          technology: loc.technology || loc.networkType || "",
          provider: loc.provider || loc.operator || "",
          band: loc.band || loc.primaryBand || "",
          pci: loc.pci || "",
          timestamp: loc.timestamp || "",
          session_id: loc.session_id || "",
        }));
        
        downloadFile(
          convertToCSV(locationData, locationHeaders),
          `locations_data_${timestamp}.csv`
        );
      }

      // Handover data
      if (technologyTransitions?.length) {
        const handoverHeaders = [
          "index", "from_tech", "to_tech", "handover_type", 
          "latitude", "longitude", "timestamp", "session_id", "log_index"
        ];
        const handoverData = technologyTransitions.map((t, idx) => {
          const techOrder = { "5G": 5, "4G": 4, "3G": 3, "2G": 2 };
          const fromOrder = techOrder[t.from?.toUpperCase()] || 0;
          const toOrder = techOrder[t.to?.toUpperCase()] || 0;
          const type = toOrder > fromOrder ? "upgrade" : toOrder < fromOrder ? "downgrade" : "lateral";
          
          return {
            index: idx + 1,
            from_tech: t.from || "",
            to_tech: t.to || "",
            handover_type: type,
            latitude: t.lat?.toFixed(6) || "",
            longitude: t.lng?.toFixed(6) || "",
            timestamp: t.timestamp || "",
            session_id: t.session_id || "",
            log_index: t.atIndex ?? "",
          };
        });
        
        downloadFile(
          convertToCSV(handoverData, handoverHeaders),
          `handover_data_${timestamp}.csv`
        );
      }

      // N78 data
      if (n78NeighborData?.length) {
        const n78Headers = [
          "index", "neighbor_rsrp", "neighbor_rsrq", "primary_rsrp", 
          "primary_rsrq", "sinr", "provider", "primary_band", "network_type",
          "latitude", "longitude", "indoor_outdoor"
        ];
        const n78Data = n78NeighborData.map((n, idx) => ({
          index: idx + 1,
          neighbor_rsrp: n.neighborRsrp ?? "",
          neighbor_rsrq: n.neighborRsrq ?? "",
          primary_rsrp: n.rsrp ?? "",
          primary_rsrq: n.rsrq ?? "",
          sinr: n.sinr ?? "",
          provider: n.provider || "",
          primary_band: n.primaryBand || "",
          network_type: n.network || n.networkType || "",
          latitude: n.lat?.toFixed(6) || "",
          longitude: n.lng?.toFixed(6) || "",
          indoor_outdoor: n.indoorOutdoor || "",
        }));
        
        downloadFile(
          convertToCSV(n78Data, n78Headers),
          `n78_neighbor_data_${timestamp}.csv`
        );
      }

      toast.success("CSV files exported successfully!", { icon: "📊" });
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to export CSV data");
    } finally {
      setIsExporting(false);
      setExportType(null);
      setIsOpen(false);
    }
  };

  // Export as JSON
  const exportAllDataJSON = async () => {
    setIsExporting(true);
    setExportType("json");
    
    try {
      const timestamp = getTimestamp();
      
      const exportData = {
        metadata: {
          exportDate: new Date().toISOString(),
          projectId,
          sessionIds,
          totalLocations,
          filteredCount,
          appliedFilters: dataFilters,
        },
        statistics: stats,
        locations: locations?.slice(0, 1000), // Limit for JSON size
        handovers: technologyTransitions,
        n78Neighbors: n78NeighborData?.slice(0, 500),
        n78Stats: n78NeighborStats,
        appSummary,
        ioSummary,
        duration,
        polygonStats,
        siteData,
        indoor,
        outdoor,
      };

      downloadFile(
        JSON.stringify(exportData, null, 2),
        `analytics_export_${timestamp}.json`,
        "application/json"
      );

      toast.success("JSON exported successfully!", { icon: "📄" });
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to export JSON data");
    } finally {
      setIsExporting(false);
      setExportType(null);
      setIsOpen(false);
    }
  };

  // Export current view as image
  const exportCurrentViewAsImage = async () => {
    setIsExporting(true);
    setExportType("image");
    
    try {
      const timestamp = getTimestamp();
      
      if (contentRef?.current) {
        const success = await captureElementAsImage(
          contentRef.current,
          `analytics_${activeTab}_${timestamp}.png`
        );
        
        if (success) {
          toast.success("Image exported successfully!", { icon: "🖼️" });
        } else {
          toast.error("Failed to capture image");
        }
      }
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to export image");
    } finally {
      setIsExporting(false);
      setExportType(null);
      setIsOpen(false);
    }
  };

  // Export all charts as images
  const exportAllChartsAsImages = async () => {
    setIsExporting(true);
    setExportType("charts");
    
    try {
      const timestamp = getTimestamp();
      let exportedCount = 0;

      for (const [chartName, chartRef] of Object.entries(chartRefs)) {
        if (chartRef?.current) {
          const success = await captureElementAsImage(
            chartRef.current,
            `chart_${chartName}_${timestamp}.png`
          );
          if (success) exportedCount++;
          // Small delay between exports
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      if (exportedCount > 0) {
        toast.success(`${exportedCount} charts exported!`, { icon: "📈" });
      } else {
        toast.warning("No charts available to export");
      }
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to export charts");
    } finally {
      setIsExporting(false);
      setExportType(null);
      setIsOpen(false);
    }
  };

  // Export summary report
  const exportSummaryReport = async () => {
    setIsExporting(true);
    setExportType("report");
    
    try {
      const timestamp = getTimestamp();
      
      let report = `
╔══════════════════════════════════════════════════════════════╗
║                    ANALYTICS SUMMARY REPORT                   ║
╚══════════════════════════════════════════════════════════════╝

Generated: ${new Date().toLocaleString()}
Project ID: ${projectId || "N/A"}
Sessions: ${sessionIds?.length || 0}

────────────────────────────────────────────────────────────────
                         DATA OVERVIEW
────────────────────────────────────────────────────────────────
Total Locations: ${totalLocations?.toLocaleString() || 0}
Filtered Count: ${filteredCount?.toLocaleString() || 0}
Coverage: ${totalLocations ? ((filteredCount / totalLocations) * 100).toFixed(1) : 0}%

`;

      // Add stats
      if (stats) {
        report += `
────────────────────────────────────────────────────────────────
                       SIGNAL STATISTICS
────────────────────────────────────────────────────────────────
Metric: ${selectedMetric || "RSRP"}
Average: ${stats.avg?.toFixed(2) || "N/A"} dBm
Minimum: ${stats.min?.toFixed(2) || "N/A"} dBm
Maximum: ${stats.max?.toFixed(2) || "N/A"} dBm
Median: ${stats.median?.toFixed(2) || "N/A"} dBm
Std Dev: ${stats.stdDev?.toFixed(2) || "N/A"}
`;
      }

      // Add handover stats
      if (technologyTransitions?.length) {
        const counts = { upgrade: 0, downgrade: 0, lateral: 0 };
        technologyTransitions.forEach(t => {
          const techOrder = { "5G": 5, "4G": 4, "3G": 3, "2G": 2 };
          const fromOrder = techOrder[t.from?.toUpperCase()] || 0;
          const toOrder = techOrder[t.to?.toUpperCase()] || 0;
          if (toOrder > fromOrder) counts.upgrade++;
          else if (toOrder < fromOrder) counts.downgrade++;
          else counts.lateral++;
        });

        report += `
────────────────────────────────────────────────────────────────
                      HANDOVER ANALYSIS
────────────────────────────────────────────────────────────────
Total Handovers: ${technologyTransitions.length}
Upgrades: ${counts.upgrade} (${((counts.upgrade / technologyTransitions.length) * 100).toFixed(1)}%)
Downgrades: ${counts.downgrade} (${((counts.downgrade / technologyTransitions.length) * 100).toFixed(1)}%)
Lateral: ${counts.lateral} (${((counts.lateral / technologyTransitions.length) * 100).toFixed(1)}%)
`;
      }

      // Add N78 stats
      if (n78NeighborStats) {
        report += `
────────────────────────────────────────────────────────────────
                      N78 NEIGHBOR ANALYSIS
────────────────────────────────────────────────────────────────
Total Records: ${n78NeighborData?.length || 0}
Sessions: ${n78NeighborStats.sessionCount || 0}
Avg N78 RSRP: ${n78NeighborStats.avgRsrp?.toFixed(1) || "N/A"} dBm
`;
      }

      // Add filters
      if (dataFilters?.providers?.length || dataFilters?.bands?.length || dataFilters?.technologies?.length) {
        report += `
────────────────────────────────────────────────────────────────
                       APPLIED FILTERS
────────────────────────────────────────────────────────────────
Providers: ${dataFilters.providers?.join(", ") || "None"}
Bands: ${dataFilters.bands?.join(", ") || "None"}
Technologies: ${dataFilters.technologies?.join(", ") || "None"}
`;
      }

      report += `
════════════════════════════════════════════════════════════════
                        END OF REPORT
════════════════════════════════════════════════════════════════
`;

      downloadFile(report, `analytics_report_${timestamp}.txt`, "text/plain");
      toast.success("Report exported successfully!", { icon: "📋" });
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to export report");
    } finally {
      setIsExporting(false);
      setExportType(null);
      setIsOpen(false);
    }
  };

  // Full export (legacy function)
  const handleFullExport = () => {
    setIsOpen(false);
    exportAnalytics({
      locations,
      stats,
      duration,
      appSummary,
      ioSummary,
      projectId,
      sessionIds,
      chartRefs,
      selectedMetric,
      totalLocations,
      filteredCount,
      polygonStats,
      siteData,
      appliedFilters: dataFilters,
      n78NeighborData,
      n78NeighborStats,
    });
  };

  const exportOptions = [
    {
      id: "csv",
      label: "Export All as CSV",
      icon: FileSpreadsheet,
      description: "Download all data tables",
      action: exportAllDataCSV,
      color: "text-green-400",
    },
    {
      id: "json",
      label: "Export as JSON",
      icon: FileJson,
      description: "Full data export",
      action: exportAllDataJSON,
      color: "text-yellow-400",
    },
    {
      id: "image",
      label: "Capture Current View",
      icon: Image,
      description: "Screenshot current tab",
      action: exportCurrentViewAsImage,
      color: "text-blue-400",
    },
    {
      id: "charts",
      label: "Export All Charts",
      icon: BarChart3,
      description: "Download chart images",
      action: exportAllChartsAsImages,
      color: "text-purple-400",
    },
    {
      id: "report",
      label: "Summary Report",
      icon: FileText,
      description: "Text summary report",
      action: exportSummaryReport,
      color: "text-cyan-400",
    },
    {
      id: "full",
      label: "Full Analytics Export",
      icon: Download,
      description: "Complete export package",
      action: handleFullExport,
      color: "text-orange-400",
    },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={!locations?.length || isExporting}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm
          transition-all duration-200 
          ${locations?.length && !isExporting
            ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg hover:shadow-green-500/25"
            : "bg-slate-700 text-slate-400 cursor-not-allowed"
          }
        `}
      >
        {isExporting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Exporting...</span>
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && !isExporting && (
        <div className="absolute right-0 mt-2 w-64 bg-slate-800 rounded-lg shadow-xl border border-slate-700 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-2 border-b border-slate-700 bg-slate-900/50">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Export Options
            </span>
          </div>
          
          <div className="py-1">
            {exportOptions.map((option) => {
              const Icon = option.icon;
              const isActive = exportType === option.id;
              
              return (
                <button
                  key={option.id}
                  onClick={option.action}
                  disabled={isExporting}
                  className={`
                    w-full px-3 py-2.5 flex items-start gap-3 
                    hover:bg-slate-700/50 transition-colors text-left
                    ${isActive ? "bg-slate-700/50" : ""}
                  `}
                >
                  <div className={`p-1.5 rounded-md bg-slate-900/50 ${option.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white flex items-center gap-2">
                      {option.label}
                      {isActive && <Check className="h-3 w-3 text-green-400" />}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {option.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Stats Footer */}
          <div className="p-2 border-t border-slate-700 bg-slate-900/50">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{locations?.length?.toLocaleString() || 0} locations</span>
              <span>{technologyTransitions?.length || 0} handovers</span>
              <span>{n78NeighborData?.length || 0} N78</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// HELPER FUNCTIONS (keep existing ones)
// ============================================

const getColorFromThresholds = (value, thresholds) => {
  if (value == null || isNaN(value)) return "#9CA3AF";

  if (!thresholds?.length) {
    if (value >= -80) return "#10B981";
    if (value >= -90) return "#34D399";
    if (value >= -100) return "#FBBF24";
    if (value >= -110) return "#F97316";
    return "#EF4444";
  }

  const sorted = [...thresholds]
    .filter((t) => t.min != null && t.max != null)
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
    if (value > parseFloat(sorted[sorted.length - 1].max))
      return sorted[sorted.length - 1].color;
  }

  return "#9CA3AF";
};

const getSignalQuality = (value) => {
  if (value == null) return { label: "Unknown", color: "#9CA3AF" };
  if (value >= -80) return { label: "Excellent", color: "#10B981" };
  if (value >= -90) return { label: "Good", color: "#34D399" };
  if (value >= -100) return { label: "Fair", color: "#FBBF24" };
  if (value >= -110) return { label: "Poor", color: "#F97316" };
  return { label: "Very Poor", color: "#EF4444" };
};




export default function UnifiedDetailLogs({
  locations = [],
  distance,
  totalLocations = 0,
  filteredCount = 0,
  onHighlightLogs,
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
  technologyTransitions,
  techHandOver = false,
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
  
  // Ref for content area (for image capture)
  const contentRef = useRef(null);

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
    let tabs = [...TABS];

    if (!techHandOver) {
      tabs = tabs.filter(tab => tab.id !== 'handover');
    }

    if (showN78Neighbors && n78NeighborData?.length > 0) {
      tabs.push({ id: "n78", label: "Unlatched Analysis" });
    }

    return tabs;
  }, [techHandOver, showN78Neighbors, n78NeighborData]);

  const fetchFilteredData = useCallback(
    async (filters) => {
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

        const response = await adminApi.getFilteredLocations(payload);
        const filteredData = response?.Data || response?.data || [];

        if (filteredData.length > 0) {
          toast.success(`Analytics updated: ${filteredData.length} locations`, {
            duration: 2000,
            icon: "📊",
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
    },
    [projectId, sessionIds, locations]
  );

  useEffect(() => {
    const applyFilters = async () => {
      if (hasActiveFilters) {
        const filtered = await fetchFilteredData(dataFilters);
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

  const fetchDuration = async () => {
    if (!sessionIds?.length) return null;
    const resp = await adminApi.getNetworkDurations({
      session_ids: sessionIds,
    });
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

  const ioSummary = useMemo(() => calculateIOSummary(logArea), [logArea]);

  const polygonStats = useMemo(() => {
    if (!polygons?.length) return null;

    const withPoints = polygons.filter((p) => p.pointCount > 0);
    const totalPoints = polygons.reduce(
      (sum, p) => sum + (p.pointCount || 0),
      0
    );

    return {
      total: polygons.length,
      withData: withPoints.length,
      totalPoints,
      avgPoints: (totalPoints / withPoints.length || 0).toFixed(1),
    };
  }, [polygons]);

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
        ${
          expanded
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
          
          {(isFilterLoading || n78NeighborLoading) && (
            <div className="flex items-center gap-1 text-sm text-blue-400">
              <div className="animate-spin rounded-full h-3 w-3 border border-blue-400 border-t-transparent" />
              <span>Loading...</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          
          <ExportDropdown
            locations={filteredLocations}
            stats={stats}
            duration={duration}
            appSummary={appSummary}
            ioSummary={ioSummary}
            projectId={projectId}
            sessionIds={sessionIds}
            chartRefs={chartRefs}
            selectedMetric={selectedMetric}
            totalLocations={totalLocations}
            filteredCount={filteredLocations.length}
            polygonStats={polygonStats}
            siteData={siteData}
            dataFilters={dataFilters}
            n78NeighborData={n78NeighborData}
            n78NeighborStats={n78NeighborStats}
            technologyTransitions={technologyTransitions}
            contentRef={contentRef}
            activeTab={activeTab}
            indoor={indoor}
            outdoor={outdoor}
          />

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-slate-400 hover:text-blue-400 p-1 rounded hover:bg-slate-800"
            title={expanded ? "Minimize" : "Maximize"}
          >
            {expanded ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
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
               Providers: {dataFilters.providers.join(", ")}
            </span>
          )}

          {dataFilters.bands?.length > 0 && (
            <span className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded border border-purple-700/30 text-xs font-medium">
               Bands: {dataFilters.bands.join(", ")}
            </span>
          )}

          {dataFilters.technologies?.length > 0 && (
            <span className="bg-green-900/50 text-green-300 px-2 py-1 rounded border border-green-700/30 text-xs font-medium">
              🔧 Tech: {dataFilters.technologies.join(", ")}
            </span>
          )}

          <span className="text-slate-400 ml-auto font-mono text-xs">
            {filteredLocations.length.toLocaleString()} /{" "}
            {totalLocations.toLocaleString()} logs
            <span className="text-blue-400 ml-2">
              (
              {totalLocations > 0
                ? ((filteredLocations.length / totalLocations) * 100).toFixed(1)
                : 0}
              %)
            </span>
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 p-3 bg-slate-900 border-b border-slate-700 overflow-x-auto scrollbar-hide">
        {availableTabs.map((tab) => (
          <TabButton
            key={tab.id}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={
              tab.id === "n78" ? "bg-purple-900/30 border-purple-700/50" : ""
            }
          >
            {tab.id === "n78" && <Radio className="h-3 w-3 mr-1" />}
            {tab.label}
            {tab.id === "n78" && n78NeighborData?.length > 0 && (
              <span className="ml-1 text-xs opacity-70">
                ({n78NeighborData.length})
              </span>
            )}
          </TabButton>
        ))}
      </div>

      {/* Content - with ref for image capture */}
      <div
        ref={contentRef}
        className={`
        ${expanded ? "max-h-[calc(100vh-200px)]" : "max-h-[70vh]"} 
        overflow-y-auto scrollbar-hide p-4 space-y-4
      `}
      >
        {(isLoading || isFilterLoading) && <LoadingSpinner />}

        {!isLoading &&
          !isFilterLoading &&
          filteredLocations.length === 0 &&
          activeTab !== "n78" && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Filter className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">
                No data matches the current filters
              </p>
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
            onHighlightLogs={onHighlightLogs}
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

        {activeTab === "handover" && (
          <HandoverAnalysisTab
            transitions={technologyTransitions}
            onRowClick={(item) => {
              // Optional: Pan map to location logic
            }}
          />
        )}

        {activeTab === "n78" && (
          <N78AnalysisTab
            n78NeighborData={n78NeighborData}
            n78NeighborStats={n78NeighborStats}
            n78NeighborLoading={n78NeighborLoading}
            thresholds={thresholds}
            expanded={expanded}
            primaryData={locations}
            selectedMetric={selectedMetric}
          />
        )}
      </div>
    </div>
  );
}