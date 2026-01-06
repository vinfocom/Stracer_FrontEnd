// src/components/UnifiedMapSidebar.jsx
import React, { useMemo, useCallback, memo, useState } from "react";
import {
  X,
  RefreshCw,
  AlertTriangle,
  Layers,
  Filter,
  Minus,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Palette } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const PanelSection = memo(({ title, icon: Icon, children, className = "" }) => (
  <div className={`space-y-2 ${className}`}>
    {title && (
      <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
        {Icon && <Icon className="h-4 w-4" />}
        <span>{title}</span>
      </div>
    )}
    <div className="rounded-lg border border-slate-700 p-3 bg-slate-900">
      {children}
    </div>
  </div>
));
PanelSection.displayName = "PanelSection";

const ToggleButton = memo(
  ({ value, onChange, options, disabled, className = "" }) => (
    <div
      className={`flex rounded-lg overflow-hidden border border-slate-600 ${className} ${
        disabled ? "opacity-50" : ""
      }`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => !disabled && onChange(option.value)}
          disabled={disabled}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            value === option.value
              ? "bg-blue-600 text-white"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          } ${disabled ? "cursor-not-allowed" : ""}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
);
ToggleButton.displayName = "ToggleButton";

const CompactThresholdInput = memo(
  ({ value, onChange, min, max, step, disabled }) => {
    const [inputValue, setInputValue] = useState(String(value));

    const handleIncrement = () => {
      const newValue = Math.min(max, parseFloat(value) + step);
      onChange(newValue);
      setInputValue(String(newValue));
    };

    const handleDecrement = () => {
      const newValue = Math.max(min, parseFloat(value) - step);
      onChange(newValue);
      setInputValue(String(newValue));
    };

    const handleInputChange = (e) => {
      const val = e.target.value;
      setInputValue(val);

      if (val === "" || val === "-") return;

      const numValue = parseFloat(val);
      if (!isNaN(numValue) && numValue >= min && numValue <= max) {
        onChange(numValue);
      }
    };

    const handleBlur = () => {
      const numValue = parseFloat(inputValue);
      if (isNaN(numValue) || inputValue === "" || inputValue === "-") {
        setInputValue(String(value));
      } else {
        const clampedValue = Math.max(min, Math.min(max, numValue));
        onChange(clampedValue);
        setInputValue(String(clampedValue));
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        handleIncrement();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        handleDecrement();
      }
    };

    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || value <= min}
          className="p-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Decrease"
        >
          <Minus className="h-3 w-3" />
        </button>

        <Input
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="bg-slate-800 border-slate-700 text-white h-7 text-center text-xs w-16"
          placeholder={String(value)}
        />

        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || value >= max}
          className="p-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Increase"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    );
  }
);
CompactThresholdInput.displayName = "CompactThresholdInput";

const UnifiedMapSidebar = ({
  open,
  onOpenChange,
  enableDataToggle,
  setEnableDataToggle,
  dataToggle,
  setDataToggle,
  enableSiteToggle,
  setEnableSiteToggle,
  setTechHandOver,
  siteToggle,
  setSiteToggle,
  projectId,
  sessionIds,
  metric,
  setMetric,
  coverageHoleFilters,
  setCoverageHoleFilters,
  dataFilters,
  setDataFilters,
  availableFilterOptions,
  colorBy,
  setColorBy,
  ui,
  onUIChange,
  techHandOver,
  technologyTransitions,
  showPolygons,
  setShowPolygons,
  polygonSource,
  setPolygonSource,
  onlyInsidePolygons,
  setOnlyInsidePolygons,
  polygonCount,
  showSiteMarkers,
  setShowSiteMarkers,
  showSiteSectors,
  setShowSiteSectors,
  loading,
  reloadData,
  showNeighbors,
  setShowNeighbors,
  neighborStats,
  areaEnabled,
  setAreaEnabled,
  enableGrid,
  setEnableGrid,
  gridSizeMeters,
  setGridSizeMeters,
}) => {
  const sideClasses = useMemo(() => {
    const base =
      "fixed top-14 left-0 h-[calc(100vh-3.5rem)] z-50 w-[90vw] sm:w-[390px] bg-slate-950 text-white shadow-2xl transition-transform duration-200 ease-out overflow-hidden";
    return open ? `${base} translate-x-0` : `${base} -translate-x-full`;
  }, [open]);

  const handleApply = useCallback(() => {
    reloadData?.();
  }, [reloadData]);

  const shouldShowMetricSelector = useMemo(
    () =>
      enableDataToggle ||
      (enableSiteToggle && siteToggle === "sites-prediction") ||
      showPolygons,
    [enableDataToggle, enableSiteToggle, siteToggle, showPolygons]
  );

  const updateCoverageFilter = useCallback(
    (metric, field, value) => {
      setCoverageHoleFilters?.((prev) => ({
        ...prev,
        [metric]: {
          ...prev[metric],
          [field]: value,
        },
      }));
    },
    [setCoverageHoleFilters]
  );

  const activeCoverageFiltersCount = useMemo(() => {
    if (!coverageHoleFilters) return 0;
    return Object.values(coverageHoleFilters).filter((f) => f.enabled).length;
  }, [coverageHoleFilters]);

  const toggleAllCoverageFilters = useCallback(
    (enabled) => {
      setCoverageHoleFilters?.((prev) => ({
        rsrp: { ...prev.rsrp, enabled },
        rsrq: { ...prev.rsrq, enabled },
        sinr: { ...prev.sinr, enabled },
      }));
    },
    [setCoverageHoleFilters]
  );

  // ✅ Data filter handlers
  // ✅ UPDATED: Data filter handler
  const updateDataFilter = useCallback(
    (filterType, value) => {
      setDataFilters?.((prev) => ({
        ...prev,
        [filterType]: value === "all" ? [] : [value], // Use "all" instead of empty string
      }));
    },
    [setDataFilters]
  );

  const clearAllDataFilters = useCallback(() => {
    setDataFilters?.({
      providers: [],
      bands: [],
      technologies: [],
    });
  }, [setDataFilters]);

  const activeDataFiltersCount = useMemo(() => {
    if (!dataFilters) return 0;
    return (
      (dataFilters.providers?.length > 0 ? 1 : 0) +
      (dataFilters.bands?.length > 0 ? 1 : 0) +
      (dataFilters.technologies?.length > 0 ? 1 : 0)
    );
  }, [dataFilters]);

  const siteToggleOptions = useMemo(
    () => [
      { value: "Cell", label: "Cell" },
      { value: "NoML", label: "NoML" },
      { value: "ML", label: "ML" },
    ],
    []
  );
  const handleColorByChange = useCallback(
    (value) => {
      console.log(" Layer Color changed to:", value, "Type:", typeof value);

      if (value === "metric") {
        console.log("  → Setting colorBy to NULL (use metric colors)");
        setColorBy?.(null);
      } else {
        console.log("  → Setting colorBy to:", value);
        setColorBy?.(value);
      }
    },
    [setColorBy]
  );

  const dataToggleOptions = useMemo(
    () => [
      { value: "sample", label: "Sample" },
      { value: "prediction", label: "Prediction" },
    ],
    []
  );

  const polygonToggleOptions = useMemo(
    () => [
      { value: "map", label: "Map Regions" },
      { value: "save", label: "Buildings" },
    ],
    []
  );

  const handleDataToggleChange = useCallback(
    (value) => setDataToggle?.(value),
    [setDataToggle]
  );

  const handleSiteToggleChange = useCallback(
    (value) => setSiteToggle?.(value),
    [setSiteToggle]
  );

  const handleMetricChange = useCallback(
    (value) => setMetric?.(value),
    [setMetric]
  );

  const handlePolygonSourceChange = useCallback(
    (value) => {
      console.log(`🔄 Polygon source changed to: ${value}`);
      setPolygonSource?.(value);
    },
    [setPolygonSource]
  );

  return (
    <>
      {open && (
        <div
          className="fixed inset-0  bg-black/40 "
          onClick={() => onOpenChange?.(false)}
        />
      )}

      <div className={sideClasses}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-900">
          <h2 className="text-lg font-semibold">Map Controls</h2>
          <button
            className="p-1 rounded hover:bg-slate-800 transition-colors"
            onClick={() => onOpenChange?.(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="h-[calc(100%-140px)] overflow-y-auto p-4 space-y-4">
          <PanelSection title="Current View">
            <div className="space-y-2 text-sm">
              {projectId && (
                <div className="flex justify-between p-2 bg-slate-800 rounded">
                  <span className="text-slate-400">Project ID:</span>
                  <span className="font-semibold text-blue-400">
                    {projectId}
                  </span>
                </div>
              )}
              {sessionIds && sessionIds.length > 0 && (
                <div className="p-2 bg-slate-800 rounded">
                  <div className="text-slate-400 mb-1">Session ID(s):</div>
                  <div className="font-semibold text-green-400">
                    {sessionIds.join(", ")}
                  </div>
                </div>
              )}
              {!projectId && (!sessionIds || sessionIds.length === 0) && (
                <div className="text-slate-500 text-center py-2">
                  No project or session linked
                </div>
              )}
            </div>
          </PanelSection>

          <PanelSection title="Data Layer">
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={enableDataToggle}
                  onChange={(e) => setEnableDataToggle?.(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Enable Data Layer</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={areaEnabled}
                  onChange={(e) => setAreaEnabled?.(e.target.checked)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="text-sm">Area Zones</div>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={enableGrid}
                  onChange={(e) => setEnableGrid?.(e.target.checked)}
                  disabled={!enableDataToggle}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="text-sm">Grid View</div>
                  <div className="text-xs text-slate-400">
                    Show data as grid cells
                  </div>
                </div>
              </label>

              {/* Grid Size Slider - only show when grid is enabled */}
              {enableGrid && (
                <div className="p-2 bg-slate-800 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-300">Cell Size</span>
                    <span className="text-xs font-semibold text-blue-400">
                      {gridSizeMeters || 50}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="200"
                    step="10"
                    value={gridSizeMeters || 50}
                    onChange={(e) =>
                      setGridSizeMeters?.(parseInt(e.target.value))
                    }
                    className="w-full h-2 bg-slate-700 rounded-lg cursor-pointer accent-blue-500"
                  />
                </div>
              )}

              <div>
                <ToggleButton
                  value={dataToggle}
                  onChange={handleDataToggleChange}
                  disabled={!enableDataToggle}
                  options={dataToggleOptions}
                />
              </div>
            </div>
          </PanelSection>

          <PanelSection title="Sites Layer">
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={enableSiteToggle}
                  onChange={(e) => setEnableSiteToggle?.(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Enable Sites Layer</span>
              </label>

              <div>
                <Label className="text-xs text-slate-300 mb-2 block">
                  Site Data Source
                </Label>
                <ToggleButton
                  value={siteToggle}
                  onChange={handleSiteToggleChange}
                  disabled={!enableSiteToggle}
                  options={siteToggleOptions}
                />
              </div>

              {enableSiteToggle && (
                <div className="space-y-2 pt-2 border-t border-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={showSiteMarkers}
                      onChange={(e) => setShowSiteMarkers?.(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Show Site Markers</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={showSiteSectors}
                      onChange={(e) => setShowSiteSectors?.(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Show Sectors</span>
                  </label>
                </div>
              )}
            </div>
          </PanelSection>

          <PanelSection title="Polygon Layer">
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={showPolygons}
                  onChange={(e) => {
                    const isEnabled = e.target.checked;
                    console.log(`🔘 Polygon checkbox toggled: ${isEnabled}`);
                    setShowPolygons?.(isEnabled);
                  }}
                  className="w-4 h-4"
                />
                <span className="text-sm">Show Polygons</span>
              </label>

              <div>
                <Label className="text-xs text-slate-300 mb-2 block">
                  Polygon Source
                </Label>
                <ToggleButton
                  value={polygonSource}
                  onChange={handlePolygonSourceChange}
                  disabled={!showPolygons}
                  options={polygonToggleOptions}
                />
              </div>

              {showPolygons && polygonCount > 0 && (
                <div className="p-2 bg-slate-800 rounded text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Loaded:</span>
                    <span className="font-semibold text-blue-400">
                      {polygonCount} polygon(s)
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-slate-400">Source:</span>
                    <span className="font-semibold text-green-400">
                      {polygonSource === "map" ? "Map Regions" : "Buildings"}
                    </span>
                  </div>
                </div>
              )}

              <Label className="text-xs text-slate-300 mb-2 block">
                Point Filtering
              </Label>

              <div className="mb-2 p-2 bg-slate-800 rounded text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Mode:</span>
                  <span
                    className={`font-semibold ${
                      onlyInsidePolygons ? "text-green-400" : "text-blue-400"
                    }`}
                  >
                    {onlyInsidePolygons ? "Filtered" : "All Points"}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setOnlyInsidePolygons?.(!onlyInsidePolygons)}
                className={`w-full px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                  onlyInsidePolygons
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-slate-700 hover:bg-slate-600 text-slate-300"
                }`}
              >
                {onlyInsidePolygons ? "Show All Points" : "Filter Inside Only"}
              </button>
            </div>
          </PanelSection>

          <PanelSection title="Heatmap Layer" icon={Layers}>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={showNeighbors}
                  onChange={(e) => setShowNeighbors?.(e.target.checked)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    Show Neighbor Heatmap
                  </div>
                  <div className="text-xs text-slate-400">
                    Display neighbor cell data as heatmap
                  </div>
                </div>
              </label>

              {showNeighbors && neighborStats && neighborStats.total > 0 && (
                <div className="space-y-2">
                  <div className="p-2 bg-slate-800 rounded text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Total Neighbors:</span>
                      <span className="font-semibold text-blue-400">
                        {neighborStats.total}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Unique PCIs:</span>
                      <span className="font-semibold text-green-400">
                        {neighborStats.uniquePCIs}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </PanelSection>

          {/* ✅ UPDATED: Metric Display with Simple Dropdowns */}
          {shouldShowMetricSelector && (
            <PanelSection title="Metric & Filters">
              <div className="space-y-3">
                {/* Metric Selector */}
                <div>
                  <Label className="text-xs text-slate-300 mb-2 block">
                    Select Metric
                  </Label>
                  <Select value={metric} onValueChange={handleMetricChange}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-9">
                      <SelectValue placeholder="Select metric..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rsrp">RSRP</SelectItem>
                      <SelectItem value="rsrq">RSRQ</SelectItem>
                      <SelectItem value="sinr">SINR</SelectItem>
                      <SelectItem value="dl_tpt">DL Throughput</SelectItem>
                      <SelectItem value="ul_tpt">UL Throughput</SelectItem>
                      <SelectItem value="mos">MOS</SelectItem>
                      <SelectItem value="pci">PCI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Divider */}
                <div className="border-t border-slate-700 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-slate-300">
                      Data Filters
                    </Label>
                    {activeDataFiltersCount > 0 && (
                      <button
                        onClick={clearAllDataFilters}
                        className="text-[10px] text-blue-400 hover:text-blue-300 underline"
                      >
                        Clear ({activeDataFiltersCount})
                      </button>
                    )}
                  </div>
                </div>

                {/* Provider Dropdown */}
                {/* Provider Dropdown */}
                <div>
                  <Label className="text-xs text-slate-300 mb-1.5 block">
                    Provider
                  </Label>
                  <Select
                    value={dataFilters?.providers?.[0] || "all"}
                    onValueChange={(value) =>
                      updateDataFilter("providers", value)
                    }
                    disabled={!enableDataToggle}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-9 text-xs">
                      <SelectValue placeholder="All Providers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Providers</SelectItem>
                      {availableFilterOptions?.providers?.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {provider}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Band Dropdown */}
                <div>
                  <Label className="text-xs text-slate-300 mb-1.5 block">
                    Band
                  </Label>
                  <Select
                    value={dataFilters?.bands?.[0] || "all"}
                    onValueChange={(value) => updateDataFilter("bands", value)}
                    disabled={!enableDataToggle}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-9 text-xs">
                      <SelectValue placeholder="All Bands" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Bands</SelectItem>
                      {availableFilterOptions?.bands?.map((band) => (
                        <SelectItem key={band} value={band}>
                          {band}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Technology Dropdown */}
                <div>
                  <Label className="text-xs text-slate-300 mb-1.5 block">
                    Technology
                  </Label>
                  <Select
                    value={dataFilters?.technologies?.[0] || "all"}
                    onValueChange={(value) =>
                      updateDataFilter("technologies", value)
                    }
                    disabled={!enableDataToggle}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-9 text-xs">
                      <SelectValue placeholder="All Technologies" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Technologies</SelectItem>
                      {availableFilterOptions?.technologies
                        ?.filter(
                          (tech) => tech && tech.toLowerCase() !== "unknown"
                        )
                        ?.map((tech) => (
                          <SelectItem key={tech} value={tech}>
                            {tech}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Active Filters Indicator */}
                {activeDataFiltersCount > 0 && (
                  <div className="p-2 bg-blue-900/20 border border-blue-700 rounded text-xs">
                    <div className="text-blue-300 font-medium">
                      🔍 {activeDataFiltersCount} filter
                      {activeDataFiltersCount > 1 ? "s" : ""} active
                    </div>
                  </div>
                )}
              </div>
            </PanelSection>
          )}

          {shouldShowMetricSelector && (
            <PanelSection title="Layer Color" icon={Palette}>
              <div className="space-y-2">
                <Label className="text-xs text-slate-300 mb-2 block">
                  Color Points
                </Label>
                <Select
                  value={colorBy || "metric"}
                  onValueChange={handleColorByChange}
                  disabled={!enableDataToggle}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-9 text-xs">
                    <SelectValue placeholder="Select color scheme..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="metric"> Metric Value</SelectItem>
                    <SelectItem value="provider"> Provider</SelectItem>
                    <SelectItem value="band"> band</SelectItem>
                    <SelectItem value="technology"> technology</SelectItem>
                  </SelectContent>
                </Select>

                {!colorBy && (
                  <div className="p-2 bg-slate-800 rounded text-xs text-slate-400">
                    Points colored by selected metric value
                  </div>
                )}
              </div>
            </PanelSection>
          )}
          {/* Coverage Handover Panel */}
          <PanelSection title="Tech Handover" icon={RefreshCw}>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={techHandOver || false}
                  onChange={(e) => setTechHandOver?.(e.target.checked)} 
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    Show Technology Handovers
                  </div>
                  <div className="text-xs text-slate-400">
                    Display markers where technology changes
                  </div>
                </div>
              </label>

              {techHandOver && technologyTransitions?.length > 0 && (
                <div className="p-2 bg-slate-800 rounded text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Total Handovers:</span>
                    <span className="font-semibold text-orange-400">
                      {technologyTransitions.length}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </PanelSection>
          {shouldShowMetricSelector && coverageHoleFilters && (
            <PanelSection title="Coverage Hole Filters" icon={Filter}>
              <div className="space-y-3">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => toggleAllCoverageFilters(true)}
                    className="flex-1 px-2 py-1 text-[10px] bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                  >
                    Enable All
                  </button>
                  <button
                    onClick={() => toggleAllCoverageFilters(false)}
                    className="flex-1 px-2 py-1 text-[10px] bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                  >
                    Disable All
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center gap-2 p-2 bg-slate-800/50 rounded">
                    <input
                      type="checkbox"
                      checked={coverageHoleFilters.rsrp?.enabled || false}
                      onChange={(e) =>
                        updateCoverageFilter(
                          "rsrp",
                          "enabled",
                          e.target.checked
                        )
                      }
                      className="w-3.5 h-3.5 flex-shrink-0"
                    />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs font-medium text-slate-300 w-12 flex-shrink-0">
                        RSRP
                      </span>
                      <CompactThresholdInput
                        value={coverageHoleFilters.rsrp?.threshold ?? -110}
                        onChange={(val) =>
                          updateCoverageFilter("rsrp", "threshold", val)
                        }
                        min={-150}
                        max={-50}
                        step={1}
                        disabled={!coverageHoleFilters.rsrp?.enabled}
                      />
                      <span className="text-[10px] text-slate-500 flex-shrink-0">
                        dBm
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-2 bg-slate-800/50 rounded">
                    <input
                      type="checkbox"
                      checked={coverageHoleFilters.rsrq?.enabled || false}
                      onChange={(e) =>
                        updateCoverageFilter(
                          "rsrq",
                          "enabled",
                          e.target.checked
                        )
                      }
                      className="w-3.5 h-3.5 flex-shrink-0"
                    />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs font-medium text-slate-300 w-12 flex-shrink-0">
                        RSRQ
                      </span>
                      <CompactThresholdInput
                        value={coverageHoleFilters.rsrq?.threshold ?? -15}
                        onChange={(val) =>
                          updateCoverageFilter("rsrq", "threshold", val)
                        }
                        min={-30}
                        max={0}
                        step={0.5}
                        disabled={!coverageHoleFilters.rsrq?.enabled}
                      />
                      <span className="text-[10px] text-slate-500 flex-shrink-0">
                        dB
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-2 bg-slate-800/50 rounded">
                    <input
                      type="checkbox"
                      checked={coverageHoleFilters.sinr?.enabled || false}
                      onChange={(e) =>
                        updateCoverageFilter(
                          "sinr",
                          "enabled",
                          e.target.checked
                        )
                      }
                      className="w-3.5 h-3.5 flex-shrink-0"
                    />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs font-medium text-slate-300 w-12 flex-shrink-0">
                        SINR
                      </span>
                      <CompactThresholdInput
                        value={coverageHoleFilters.sinr?.threshold ?? 0}
                        onChange={(val) =>
                          updateCoverageFilter("sinr", "threshold", val)
                        }
                        min={-20}
                        max={30}
                        step={1}
                        disabled={!coverageHoleFilters.sinr?.enabled}
                      />
                      <span className="text-[10px] text-slate-500 flex-shrink-0">
                        dB
                      </span>
                    </div>
                  </div>
                </div>

                {activeCoverageFiltersCount > 0 && (
                  <div className="p-2 bg-yellow-900/20 border border-yellow-700 rounded">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="h-3 w-3 text-yellow-400 flex-shrink-0" />
                      <div className="font-semibold text-yellow-400 text-xs">
                        {activeCoverageFiltersCount} Active Filter
                        {activeCoverageFiltersCount > 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="text-[10px] text-yellow-300 space-y-0.5">
                      {coverageHoleFilters.rsrp?.enabled && (
                        <div>
                          • RSRP {"<"} {coverageHoleFilters.rsrp.threshold} dBm
                        </div>
                      )}
                      {coverageHoleFilters.rsrq?.enabled && (
                        <div>
                          • RSRQ {"<"} {coverageHoleFilters.rsrq.threshold} dB
                        </div>
                      )}
                      {coverageHoleFilters.sinr?.enabled && (
                        <div>
                          • SINR {"<"} {coverageHoleFilters.sinr.threshold} dB
                        </div>
                      )}
                    </div>
                    <div className="mt-1.5 pt-1.5 border-t border-yellow-700/50 text-[10px] text-yellow-200">
                      All criteria must be met (AND logic)
                    </div>
                  </div>
                )}

                {activeCoverageFiltersCount === 0 && (
                  <div className="p-2 bg-slate-800 rounded text-[10px] text-slate-400 text-center">
                    Enable filters to identify coverage holes
                  </div>
                )}
              </div>
            </PanelSection>
          )}
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-900">
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700"
            onClick={handleApply}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "Loading..." : "Reload Data"}
          </Button>
        </div>
      </div>
    </>
  );
};

export default memo(UnifiedMapSidebar);
