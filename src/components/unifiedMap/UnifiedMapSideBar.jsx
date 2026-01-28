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
  ChevronDown,
  ChevronRight,
  Database,
  Radio,
  Hexagon,
  Palette,
  MapPin,
  Grid3X3,
  Thermometer,
  ArrowLeftRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

// Custom Checkbox Component - Fully Visible
const Checkbox = memo(
  ({ checked, onChange, disabled = false, className = "" }) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className={`
      w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0
      ${
        checked
          ? "bg-blue-600 border-blue-600"
          : "bg-slate-700 border-slate-500 hover:border-slate-400"
      }
      ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      ${className}
    `}
    >
      {checked && <Check className="h-3.5 w-3.5 text-white stroke-[3]" />}
    </button>
  ),
);
Checkbox.displayName = "Checkbox";

// Custom Toggle Switch - Fully Visible
const ToggleSwitch = memo(({ checked, onChange, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => !disabled && onChange?.(!checked)}
    className={`
      relative w-11 h-6 rounded-full transition-all shrink-0
      ${checked ? "bg-blue-600" : "bg-slate-600"}
      ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
    `}
  >
    <span
      className={`
        absolute top-1 w-4 h-4 rounded-full bg-white  transition-all
        ${checked ? "left-6" : "left-1"}
      `}
    />
  </button>
));
ToggleSwitch.displayName = "ToggleSwitch";

// Collapsible Section Component
const CollapsibleSection = memo(
  ({ title, icon: Icon, children, defaultOpen = false, badge = null }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
      <div className="border border-slate-700/50 rounded-lg overflow-hidden bg-slate-900/50">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-blue-400" />}
            <span className="text-sm font-medium text-slate-100">{title}</span>
            {badge !== null && (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-600 text-white rounded-full">
                {badge}
              </span>
            )}
          </div>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </button>
        {isOpen && (
          <div className="px-3 pb-3 pt-1 space-y-3 border-t border-slate-700/50">
            {children}
          </div>
        )}
      </div>
    );
  },
);
CollapsibleSection.displayName = "CollapsibleSection";

// Toggle Row with Checkbox
const ToggleRow = memo(
  ({
    label,
    description,
    checked,
    onChange,
    disabled = false,
    useSwitch = false,
  }) => (
    <div className="flex items-center justify-between py-1.5 gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-200">{label}</div>
        {description && (
          <div className="text-xs text-slate-500 truncate">{description}</div>
        )}
      </div>
      {useSwitch ? (
        <ToggleSwitch
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
      ) : (
        <Checkbox checked={checked} onChange={onChange} disabled={disabled} />
      )}
    </div>
  ),
);
ToggleRow.displayName = "ToggleRow";

// Compact Select Row
const SelectRow = memo(
  ({
    label,
    value,
    onChange,
    options,
    placeholder,
    disabled = false,
    className = "",
  }) => (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs text-slate-400">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="bg-slate-800 border-slate-600 text-white h-8 text-sm">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ),
);
SelectRow.displayName = "SelectRow";

// Segmented Control
const SegmentedControl = memo(
  ({ value, onChange, options, disabled = false }) => (
    <div
      className={`flex rounded-md overflow-hidden border border-slate-600 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => !disabled && onChange(option.value)}
          disabled={disabled}
          className={`flex-1 px-2 py-1.5 text-xs font-medium transition-all ${
            value === option.value
              ? "bg-blue-600 text-white"
              : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
);
SegmentedControl.displayName = "SegmentedControl";

// Threshold Input with +/- buttons
const ThresholdInput = memo(
  ({ value, onChange, min, max, step, unit, disabled }) => {
    const [inputValue, setInputValue] = useState(String(value));

    const handleChange = (delta) => {
      const newValue =
        delta > 0
          ? Math.min(max, parseFloat(value) + step)
          : Math.max(min, parseFloat(value) - step);
      onChange(newValue);
      setInputValue(String(newValue));
    };

    const handleInputChange = (e) => {
      const val = e.target.value;
      setInputValue(val);
      const numValue = parseFloat(val);
      if (!isNaN(numValue) && numValue >= min && numValue <= max) {
        onChange(numValue);
      }
    };

    const handleBlur = () => {
      const numValue = parseFloat(inputValue);
      if (isNaN(numValue)) {
        setInputValue(String(value));
      } else {
        const clamped = Math.max(min, Math.min(max, numValue));
        onChange(clamped);
        setInputValue(String(clamped));
      }
    };

    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleChange(-1)}
          disabled={disabled || value <= min}
          className="w-6 h-6 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition-colors text-white"
        >
          <Minus className="h-3 w-3" />
        </button>
        <Input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          disabled={disabled}
          className="bg-slate-800 border-slate-600 text-white h-6 text-center text-xs w-14 px-1"
        />
        <button
          type="button"
          onClick={() => handleChange(1)}
          disabled={disabled || value >= max}
          className="w-6 h-6 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition-colors text-white"
        >
          <Plus className="h-3 w-3" />
        </button>
        <span className="text-[10px] text-slate-400 w-8">{unit}</span>
      </div>
    );
  },
);
ThresholdInput.displayName = "ThresholdInput";

// Info Badge
const InfoBadge = memo(({ label, value, color = "blue" }) => {
  const colors = {
    blue: "text-blue-400",
    green: "text-green-400",
    orange: "text-orange-400",
    yellow: "text-yellow-400",
  };

  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium ${colors[color]}`}>{value}</span>
    </div>
  );
});
InfoBadge.displayName = "InfoBadge";

// Main Component
const UnifiedMapSidebar = ({
  open,
  onOpenChange,
  pciThreshold,
  dominanceThreshold,
  setDominanceThreshold,
  setPciThreshold,
  showNumCells,
  setShowNumCells,
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
  pciRange = { min: 0, max: 100 },
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
      "fixed top-14 left-0 h-[calc(100vh-3.5rem)] z-50 w-[340px] bg-slate-950 text-white  transition-transform duration-200 ease-out flex flex-col";
    return open ? `${base} translate-x-0` : `${base} -translate-x-full`;
  }, [open]);

  // Metric options
  const metricOptions = useMemo(
    () => [
      { value: "rsrp", label: "RSRP" },
      { value: "rsrq", label: "RSRQ" },
      { value: "sinr", label: "SINR" },
      { value: "dl_tpt", label: "DL Throughput" },
      { value: "ul_tpt", label: "UL Throughput" },
      { value: "mos", label: "MOS" },
      { value: "pci", label: "PCI" },
      { value: "num_cells", label: "Pilot pollution" },
      { value: "level", label: "SSI" },
      { value: "jitter", label: "Jitter" },
      { value: "latency", label: "Latency" },
      { value: "packet_loss", label: "Packet Loss" },
      { value: "tac", label: "TAC" },
    ],
    [],
  );

  const colorOptions = useMemo(
    () => [
      { value: "metric", label: "By Metric Value" },
      { value: "provider", label: "By Provider" },
      { value: "band", label: "By Band" },
      { value: "technology", label: "By Technology" },
    ],
    [],
  );

  // Filter handlers
  const updateDataFilter = useCallback(
    (filterType, value) => {
      setDataFilters?.((prev) => ({
        ...prev,
        [filterType]: value === "all" ? [] : [value],
      }));
    },
    [setDataFilters],
  );

  const clearAllDataFilters = useCallback(() => {
    setDataFilters?.({ providers: [], bands: [], technologies: [] });
  }, [setDataFilters]);

  const activeDataFiltersCount = useMemo(() => {
    if (!dataFilters) return 0;
    return (
      (dataFilters.providers?.length > 0 ? 1 : 0) +
      (dataFilters.bands?.length > 0 ? 1 : 0) +
      (dataFilters.technologies?.length > 0 ? 1 : 0)
    );
  }, [dataFilters]);

  const updateCoverageFilter = useCallback(
    (metric, field, value) => {
      setCoverageHoleFilters?.((prev) => ({
        ...prev,
        [metric]: { ...prev[metric], [field]: value },
      }));
    },
    [setCoverageHoleFilters],
  );

  const activeCoverageFiltersCount = useMemo(() => {
    if (!coverageHoleFilters) return 0;
    return Object.values(coverageHoleFilters).filter((f) => f.enabled).length;
  }, [coverageHoleFilters]);

  const shouldShowMetricSelector = useMemo(
    () =>
      enableDataToggle ||
      (enableSiteToggle && siteToggle === "sites-prediction") ||
      showPolygons,
    [enableDataToggle, enableSiteToggle, siteToggle, showPolygons],
  );

  const toggleEnvironment = useCallback(
    (value) => {
      setDataFilters?.((prev) => {
        const current = prev.indoorOutdoor || [];
        const exists = current.includes(value);
        let newValues;
        if (exists) {
          newValues = current.filter((v) => v !== value);
        } else {
          newValues = [...current, value];
        }
        return { ...prev, indoorOutdoor: newValues };
      });
    },
    [setDataFilters],
  );

  return (
    <>
      {open && (
        <div
          className="fixed inset-0  "
          onClick={() => onOpenChange?.(false)}
        />
      )}

      <div className={sideClasses}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900 shrink-0">
          <h2 className="text-base font-semibold">Map Controls</h2>
          <button
            className="p-1.5 rounded-md hover:bg-slate-800 transition-colors"
            onClick={() => onOpenChange?.(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {/* Current View Info */}
          {(projectId || sessionIds?.length > 0) && (
            <div className="p-2.5 bg-slate-800/50 rounded-lg text-xs space-y-1 border border-slate-700/50">
              {projectId && <InfoBadge label="Project" value={projectId} />}
              {sessionIds?.length > 0 && (
                <div className="text-xs">
                  <div className="text-slate-500 mb-1">Sessions</div>
                  <div className="bg-slate-900/60 border border-slate-700 rounded p-1.5 max-h-20 overflow-y-auto text-green-400 break-all">
                    {sessionIds.join(", ")}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Data Layer */}
          <CollapsibleSection
            title="Data Layer"
            icon={Database}
            defaultOpen={true}
          >
            <ToggleRow
              label="Enable Data"
              checked={enableDataToggle}
              onChange={setEnableDataToggle}
              useSwitch={true}
            />

            {enableDataToggle && (
              <>
                <SegmentedControl
                  value={dataToggle}
                  onChange={setDataToggle}
                  options={[
                    { value: "sample", label: "Sample" },
                    { value: "prediction", label: "Prediction" },
                  ]}
                />

                <div className="space-y-2 pt-1">
                  <ToggleRow
                    label="Area Zones"
                    checked={areaEnabled}
                    onChange={setAreaEnabled}
                  />
                  <ToggleRow
                    label="Grid View"
                    description="Show data as grid cells"
                    checked={enableGrid}
                    onChange={setEnableGrid}
                  />
                </div>

                {enableGrid && (
                  <div className="pt-1 bg-slate-800/50 rounded-lg p-2">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-slate-400">Cell Size</span>
                      <span className="text-blue-400 font-semibold">
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

                <ToggleRow
                  label="Show Num cell "
                  description="Display cell count on logs"
                  checked={showNumCells}
                  onChange={setShowNumCells}
                />
              </>
            )}
          </CollapsibleSection>

          {/* Sites Layer */}
          <CollapsibleSection title="Sites Layer" icon={Radio}>
            <ToggleRow
              label="Enable Sites"
              checked={enableSiteToggle}
              onChange={setEnableSiteToggle}
              useSwitch={true}
            />

            {enableSiteToggle && (
              <>
                <SegmentedControl
                  value={siteToggle}
                  onChange={setSiteToggle}
                  options={[
                    { value: "Cell", label: "Cell" },
                    { value: "NoML", label: "NoML" },
                    { value: "ML", label: "ML" },
                  ]}
                />

                <div className="space-y-2 pt-1">
                  <ToggleRow
                    label="Show Markers"
                    checked={showSiteMarkers}
                    onChange={setShowSiteMarkers}
                  />
                  <ToggleRow
                    label="Show Sectors"
                    checked={showSiteSectors}
                    onChange={setShowSiteSectors}
                  />
                </div>
              </>
            )}
          </CollapsibleSection>

          {/* Polygon Layer */}
          <CollapsibleSection
            title="Polygons"
            icon={Hexagon}
            badge={showPolygons && polygonCount > 0 ? polygonCount : null}
          >
            <ToggleRow
              label="Show Polygons"
              checked={showPolygons}
              onChange={setShowPolygons}
              useSwitch={true}
            />

            {showPolygons && (
              <>
                <SegmentedControl
                  value={polygonSource}
                  onChange={setPolygonSource}
                  options={[
                    { value: "map", label: "Map Regions" },
                    { value: "save", label: "Buildings" },
                  ]}
                />

                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm text-slate-300">
                    Filter Inside Only
                  </span>
                  <ToggleSwitch
                    checked={onlyInsidePolygons}
                    onChange={setOnlyInsidePolygons}
                  />
                </div>

                {polygonCount > 0 && (
                  <div className="bg-slate-800/50 rounded p-2 text-xs">
                    <InfoBadge
                      label="Loaded"
                      value={`${polygonCount} polygon(s)`}
                      color="green"
                    />
                  </div>
                )}
              </>
            )}
          </CollapsibleSection>

          {shouldShowMetricSelector && (
            <CollapsibleSection
              title="Metric & Filters"
              icon={Filter}
              defaultOpen={true}
              badge={activeDataFiltersCount > 0 ? activeDataFiltersCount : null}
            >
              <SelectRow
                label="Metric"
                value={metric}
                onChange={setMetric}
                options={metricOptions}
                placeholder="Select metric"
              />

              <SelectRow
                label="Color By"
                value={colorBy || "metric"}
                onChange={(v) => setColorBy?.(v === "metric" ? null : v)}
                options={colorOptions}
                placeholder="Select color scheme"
                disabled={!enableDataToggle}
              />

              <div className="border-t border-slate-700/50 pt-3 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400">Data Filters</span>
                  {activeDataFiltersCount > 0 && (
                    <button
                      onClick={clearAllDataFilters}
                      className="text-[10px] text-blue-400 hover:underline"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <SelectRow
                    label="Provider"
                    value={dataFilters?.providers?.[0] || "all"}
                    onChange={(v) => updateDataFilter("providers", v)}
                    options={[
                      { value: "all", label: "All Providers" },
                      ...(availableFilterOptions?.providers?.map((p) => ({
                        value: p,
                        label: p,
                      })) || []),
                    ]}
                    disabled={!enableDataToggle}
                  />

                  <SelectRow
                    label="Band"
                    value={dataFilters?.bands?.[0] || "all"}
                    onChange={(v) => updateDataFilter("bands", v)}
                    options={[
                      { value: "all", label: "All Bands" },
                      ...(availableFilterOptions?.bands?.map((b) => ({
                        value: b,
                        label: b,
                      })) || []),
                    ]}
                    disabled={!enableDataToggle}
                  />

                  <SelectRow
                    label="Technology"
                    value={dataFilters?.technologies?.[0] || "all"}
                    onChange={(v) => updateDataFilter("technologies", v)}
                    options={[
                      { value: "all", label: "All Technologies" },
                      ...(availableFilterOptions?.technologies
                        ?.filter((t) => t && t.toLowerCase() !== "unknown")
                        ?.map((t) => ({ value: t, label: t })) || []),
                    ]}
                    disabled={!enableDataToggle}
                  />
                </div>

                <div className="space-y-1.5 pt-1">
                  <Label className="text-xs text-slate-400">Environment</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-800/50">
                      <Checkbox
                        checked={dataFilters?.indoorOutdoor?.includes("Indoor")}
                        onChange={() => toggleEnvironment("Indoor")}
                        disabled={!enableDataToggle}
                      />
                      <span className="text-sm text-slate-300">Indoor</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-800/50">
                      <Checkbox
                        checked={dataFilters?.indoorOutdoor?.includes(
                          "Outdoor",
                        )}
                        onChange={() => toggleEnvironment("Outdoor")}
                        disabled={!enableDataToggle}
                      />
                      <span className="text-sm text-slate-300">Outdoor</span>
                    </label>
                  </div>
                </div>

                <div className="border-t border-slate-700/50 pt-3 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400">
                      PCI Appearance Filter
                    </span>
                    <span className="text-xs font-mono text-blue-400">
                      {pciThreshold}%
                    </span>
                  </div>

                  <div className="px-1">
                    <input
                      type="range"
                      min={pciRange.min} // Updated to use dynamic min
                      max={pciRange.max} // Updated to use dynamic max
                      step="0.1"
                      value={pciThreshold}
                      onChange={(e) =>
                        setPciThreshold(parseFloat(e.target.value))
                      }
                      className="w-full h-1.5 bg-slate-700 rounded-lg cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                      <span>{pciRange.min}%</span>
                      <span>{pciRange.max}%</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 italic">
                    Hides PCIs that appear less than {pciThreshold}% of the time
                    in this session.
                  </p>
                </div>

                {activeDataFiltersCount > 0 && (
                  <div className="mt-2 p-2 bg-blue-900/20 border border-blue-700/50 rounded text-xs text-blue-300">
                    🔍 {activeDataFiltersCount} filter
                    {activeDataFiltersCount > 1 ? "s" : ""} active
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Heatmap Layer */}
          <CollapsibleSection title="Heatmap" icon={Thermometer}>
            <ToggleRow
              label="Neighbor Heatmap"
              description="Display neighbor cell data"
              checked={showNeighbors}
              onChange={setShowNeighbors}
              useSwitch={true}
            />

            {showNeighbors && neighborStats?.total > 0 && (
              <div className="bg-slate-800/50 rounded p-2 space-y-1">
                <InfoBadge
                  label="Total Neighbors"
                  value={neighborStats.total}
                />
                <InfoBadge
                  label="Unique PCIs"
                  value={neighborStats.uniquePCIs}
                  color="green"
                />
              </div>
            )}
          </CollapsibleSection>

          {/* Metric & Filters */}

          <CollapsibleSection title="Dominance Analysis" icon={AlertTriangle}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Dominance Filter</span>
                <ToggleSwitch
        checked={dominanceThreshold !== null}
        onChange={(checked) => {
          const newVal = checked ? 6 : null;
          setDominanceThreshold(newVal);
          // Auto-switch metric to dominance to see colors immediately
          if (checked) setMetric("dominance"); 
        }}
      />
              </div>

              {dominanceThreshold !== null && (
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">
                    Range Mask (±dB)
                  </Label>
                  <Input
                    type="number"
                    value={dominanceThreshold}
                    min={0}
                    onChange={(e) =>
                      setDominanceThreshold(parseInt(e.target.value))
                    }
                    className="bg-slate-800 border-slate-600 text-white h-8 text-sm"
                  />
                  <p className="text-[10px] text-slate-500 italic">
                    Showing logs with neighbors within{" "}
                    {-Math.abs(dominanceThreshold)} to{" "}
                    {Math.abs(dominanceThreshold)} dB. Colors reflect the count
                    of overlapping signals.
                  </p>
                </div>
              )}
            </div>
          </CollapsibleSection>
          <CollapsibleSection
            title="Tech Handover"
            icon={ArrowLeftRight}
            badge={
              techHandOver && technologyTransitions?.length > 0
                ? technologyTransitions.length
                : null
            }
          >
            <ToggleRow
              label="Show Handovers"
              description="Display technology change points"
              checked={techHandOver}
              onChange={setTechHandOver}
              useSwitch={true}
            />

            {techHandOver && technologyTransitions?.length > 0 && (
              <div className="bg-slate-800/50 rounded p-2 text-xs">
                <InfoBadge
                  label="Total Handovers"
                  value={technologyTransitions.length}
                  color="orange"
                />
              </div>
            )}
          </CollapsibleSection>

          {/* Coverage Hole Filters */}
          {shouldShowMetricSelector && coverageHoleFilters && (
            <CollapsibleSection
              title="Coverage Holes"
              icon={AlertTriangle}
              badge={
                activeCoverageFiltersCount > 0
                  ? activeCoverageFiltersCount
                  : null
              }
            >
              {/* RSRP */}
              <div className="flex items-center gap-3 py-1">
                <Checkbox
                  checked={coverageHoleFilters.rsrp?.enabled}
                  onChange={(v) => updateCoverageFilter("rsrp", "enabled", v)}
                />
                <span className="text-sm w-12 text-slate-200">RSRP</span>
                <ThresholdInput
                  value={coverageHoleFilters.rsrp?.threshold ?? -110}
                  onChange={(v) => updateCoverageFilter("rsrp", "threshold", v)}
                  min={-150}
                  max={-50}
                  step={1}
                  unit="dBm"
                  disabled={!coverageHoleFilters.rsrp?.enabled}
                />
              </div>

              {/* RSRQ */}
              <div className="flex items-center gap-3 py-1">
                <Checkbox
                  checked={coverageHoleFilters.rsrq?.enabled}
                  onChange={(v) => updateCoverageFilter("rsrq", "enabled", v)}
                />
                <span className="text-sm w-12 text-slate-200">RSRQ</span>
                <ThresholdInput
                  value={coverageHoleFilters.rsrq?.threshold ?? -15}
                  onChange={(v) => updateCoverageFilter("rsrq", "threshold", v)}
                  min={-30}
                  max={0}
                  step={0.5}
                  unit="dB"
                  disabled={!coverageHoleFilters.rsrq?.enabled}
                />
              </div>

              {/* SINR */}
              <div className="flex items-center gap-3 py-1">
                <Checkbox
                  checked={coverageHoleFilters.sinr?.enabled}
                  onChange={(v) => updateCoverageFilter("sinr", "enabled", v)}
                />
                <span className="text-sm w-12 text-slate-200">SINR</span>
                <ThresholdInput
                  value={coverageHoleFilters.sinr?.threshold ?? 0}
                  onChange={(v) => updateCoverageFilter("sinr", "threshold", v)}
                  min={-20}
                  max={30}
                  step={1}
                  unit="dB"
                  disabled={!coverageHoleFilters.sinr?.enabled}
                />
              </div>

              {activeCoverageFiltersCount > 0 && (
                <div className="p-2 bg-yellow-900/20 border border-yellow-700/50 rounded text-xs text-yellow-300 mt-2">
                  <div className="font-medium mb-1">
                    ⚠️ {activeCoverageFiltersCount} filter
                    {activeCoverageFiltersCount > 1 ? "s" : ""} active
                  </div>
                  <div className="text-yellow-400/80 text-[10px]">
                    All conditions must be met (AND logic)
                  </div>
                </div>
              )}

              {activeCoverageFiltersCount === 0 && (
                <div className="p-2 bg-slate-800/50 rounded text-xs text-slate-500 text-center">
                  Enable filters to identify coverage holes
                </div>
              )}
            </CollapsibleSection>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-700 bg-slate-900 shrink-0">
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 h-9"
            onClick={reloadData}
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
