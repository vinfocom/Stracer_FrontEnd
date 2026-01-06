import React, { useMemo, useState, useCallback } from "react";
import { Globe, Settings } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Cell,
  Radar,
} from "recharts";
import { ChartContainer } from "../../common/ChartContainer";
import { EmptyState } from "../../common/EmptyState";
import {
  normalizeProviderName,
  normalizeTechName,
  getLogColor,
  COLOR_SCHEMES,
} from "@/utils/colorUtils";

const safeNumber = (value) => {
  if (value == null || value === "") return null;
  const num = parseFloat(value);
  if (isNaN(num) || !isFinite(num)) return null;
  return num;
};

const calculateStats = (values) => {
  const valid = values.filter((v) => v !== null);
  if (valid.length === 0)
    return { avg: null, median: null, min: null, max: null, count: 0 };

  const sorted = [...valid].sort((a, b) => a - b);
  const sum = valid.reduce((a, b) => a + b, 0);
  const avg = sum / valid.length;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return {
    avg: parseFloat(avg.toFixed(2)),
    median: parseFloat(median.toFixed(2)),
    min: parseFloat(Math.min(...valid).toFixed(2)),
    max: parseFloat(Math.max(...valid).toFixed(2)),
    count: valid.length,
  };
};

const AVAILABLE_METRICS = {
  rsrp: {
    key: "rsrp",
    label: "RSRP",
    unit: "dBm",
    color: "#3B82F6",
    higherBetter: true,
  },
  rsrq: {
    key: "rsrq",
    label: "RSRQ",
    unit: "dB",
    color: "#8B5CF6",
    higherBetter: true,
  },
  sinr: {
    key: "sinr",
    label: "SINR",
    unit: "dB",
    color: "#22C55E",
    higherBetter: true,
  },
  mos: {
    key: "mos",
    label: "MOS",
    unit: "",
    color: "#F59E0B",
    higherBetter: true,
  },
  dl_tpt: {
    key: "dl_tpt",
    label: "Download",
    unit: "Mbps",
    color: "#06B6D4",
    higherBetter: true,
  },
  ul_tpt: {
    key: "ul_tpt",
    label: "Upload",
    unit: "Mbps",
    color: "#F97316",
    higherBetter: true,
  },
  latency: {
    key: "latency",
    label: "Latency",
    unit: "ms",
    color: "#EF4444",
    higherBetter: false,
  },
  jitter: {
    key: "jitter",
    label: "Jitter",
    unit: "ms",
    color: "#EC4899",
    higherBetter: false,
  },
};

const DEFAULT_METRICS = ["rsrp"];

const getProviderColor = (provider) => {
  const normalized = normalizeProviderName(provider);
  return getLogColor("provider", normalized, "#6B7280");
};

export const OperatorComparisonChart = React.forwardRef(
  (
    { locations, defaultMetrics = DEFAULT_METRICS, showRadar = true, showTable = true },
    ref
  ) => {
    const [selectedMetrics, setSelectedMetrics] = useState(defaultMetrics);
    const [showSettings, setShowSettings] = useState(false);
    const [viewMode, setViewMode] = useState("bar");

    const operatorData = useMemo(() => {
      if (!locations?.length) return [];

      const operatorStats = {};

      locations.forEach((loc) => {
        const rawProvider = loc.provider || loc.operator || "";
        const provider = normalizeProviderName(rawProvider);

        if (provider === "Unknown") return;

        if (!operatorStats[provider]) {
          operatorStats[provider] = {
            name: provider,
            color: getProviderColor(provider),
            samples: 0,
            rsrp: [],
            rsrq: [],
            sinr: [],
            mos: [],
            dl_tpt: [],
            ul_tpt: [],
            latency: [],
            jitter: [],
            technologies: {},
            bands: {},
          };
        }

        operatorStats[provider].samples++;

        const rsrp = safeNumber(loc.rsrp);
        const rsrq = safeNumber(loc.rsrq);
        const sinr = safeNumber(loc.sinr);
        const mos = safeNumber(loc.mos);
        const dl_tpt = safeNumber(loc.dl_tpt);
        const ul_tpt = safeNumber(loc.ul_tpt);
        const latency = safeNumber(loc.latency);
        const jitter = safeNumber(loc.jitter);

        if (rsrp !== null) operatorStats[provider].rsrp.push(rsrp);
        if (rsrq !== null) operatorStats[provider].rsrq.push(rsrq);
        if (sinr !== null) operatorStats[provider].sinr.push(sinr);
        if (mos !== null) operatorStats[provider].mos.push(mos);
        if (dl_tpt !== null) operatorStats[provider].dl_tpt.push(dl_tpt);
        if (ul_tpt !== null) operatorStats[provider].ul_tpt.push(ul_tpt);
        if (latency !== null) operatorStats[provider].latency.push(latency);
        if (jitter !== null) operatorStats[provider].jitter.push(jitter);

        const rawTech = loc.technology || loc.network || "";
        const tech = normalizeTechName(rawTech);
        if (tech !== "Unknown") {
          operatorStats[provider].technologies[tech] =
            (operatorStats[provider].technologies[tech] || 0) + 1;
        }

        const band = loc.band || "";
        if (band && band !== "-1" && band !== "Unknown") {
          operatorStats[provider].bands[band] =
            (operatorStats[provider].bands[band] || 0) + 1;
        }
      });

      return Object.values(operatorStats)
        .filter((op) => op.samples > 0)
        .map((op) => ({
          name: op.name,
          color: op.color,
          samples: op.samples,
          rsrp: calculateStats(op.rsrp),
          rsrq: calculateStats(op.rsrq),
          sinr: calculateStats(op.sinr),
          mos: calculateStats(op.mos),
          dl_tpt: calculateStats(op.dl_tpt),
          ul_tpt: calculateStats(op.ul_tpt),
          latency: calculateStats(op.latency),
          jitter: calculateStats(op.jitter),
          dominantTech:
            Object.entries(op.technologies).sort((a, b) => b[1] - a[1])[0]?.[0] ||
            "N/A",
          dominantBand:
            Object.entries(op.bands).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A",
          techCount: Object.keys(op.technologies).length,
          bandCount: Object.keys(op.bands).length,
        }))
        .sort((a, b) => b.samples - a.samples);
    }, [locations]);

    const barChartData = useMemo(() => {
      return operatorData.map((op) => {
        const data = { name: op.name, color: op.color, samples: op.samples };
        selectedMetrics.forEach((metricKey) => {
          data[metricKey] = op[metricKey]?.avg;
        });
        return data;
      });
    }, [operatorData, selectedMetrics]);

    const radarChartData = useMemo(() => {
      if (!operatorData.length) return [];

      const normalizers = {
        rsrp: (v) =>
          v !== null ? Math.max(0, Math.min(100, ((v + 140) / 60) * 100)) : 0,
        rsrq: (v) =>
          v !== null ? Math.max(0, Math.min(100, ((v + 20) / 17) * 100)) : 0,
        sinr: (v) =>
          v !== null ? Math.max(0, Math.min(100, ((v + 10) / 40) * 100)) : 0,
        mos: (v) =>
          v !== null ? Math.max(0, Math.min(100, (v / 5) * 100)) : 0,
        dl_tpt: (v) =>
          v !== null ? Math.max(0, Math.min(100, (v / 200) * 100)) : 0,
        ul_tpt: (v) =>
          v !== null ? Math.max(0, Math.min(100, (v / 100) * 100)) : 0,
        latency: (v) =>
          v !== null ? Math.max(0, 100 - Math.min(100, (v / 200) * 100)) : 0,
        jitter: (v) =>
          v !== null ? Math.max(0, 100 - Math.min(100, (v / 100) * 100)) : 0,
      };

      return selectedMetrics.map((metricKey) => {
        const config = AVAILABLE_METRICS[metricKey];
        const dataPoint = { metric: config.label };

        operatorData.forEach((op) => {
          const rawValue = op[metricKey]?.avg;
          dataPoint[op.name] = normalizers[metricKey]?.(rawValue) || 0;
          dataPoint[`${op.name}_raw`] = rawValue;
        });

        return dataPoint;
      });
    }, [operatorData, selectedMetrics]);

    const toggleMetric = useCallback((metricKey) => {
      setSelectedMetrics((prev) => {
        if (prev.includes(metricKey)) {
          if (prev.length === 1) return prev;
          return prev.filter((m) => m !== metricKey);
        }
        return [...prev, metricKey];
      });
    }, []);

    const CustomBarTooltip = ({ active, payload, label }) => {
      if (!active || !payload?.length) return null;

      const operator = operatorData.find((op) => op.name === label);
      if (!operator) return null;

      return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl min-w-[200px]">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: operator.color }}
            />
            <span className="font-semibold text-white">{label}</span>
            <span className="text-[10px] text-slate-400 ml-auto">
              {operator.samples} samples
            </span>
          </div>
          <div className="space-y-1.5">
            {payload.map((entry, idx) => {
              const config = AVAILABLE_METRICS[entry.dataKey];
              if (!config) return null;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-4 text-xs"
                >
                  <span style={{ color: config.color }}>{config.label}:</span>
                  <span className="text-white font-semibold">
                    {entry.value?.toFixed(1) ?? "N/A"} {config.unit}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-700 text-[10px] text-slate-400">
            <div>Tech: {operator.dominantTech}</div>
            <div>Band: B{operator.dominantBand}</div>
          </div>
        </div>
      );
    };

    const CustomRadarTooltip = ({ active, payload }) => {
      if (!active || !payload?.length) return null;
      const data = payload[0]?.payload;
      if (!data) return null;

      return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl">
          <div className="font-semibold text-white mb-2">{data.metric}</div>
          <div className="space-y-1">
            {operatorData.map((op) => (
              <div
                key={op.name}
                className="flex items-center justify-between gap-4 text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: op.color }}
                  />
                  <span className="text-slate-300">{op.name}</span>
                </div>
                <span className="text-white font-semibold">
                  {data[`${op.name}_raw`]?.toFixed(1) ?? "N/A"}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    };

    if (!operatorData.length) {
      return (
        <ChartContainer ref={ref} title="Operator Comparison" icon={Globe}>
          <EmptyState message="No operator data available" />
        </ChartContainer>
      );
    }

    return (
      <ChartContainer
        ref={ref}
        title="Operator Comparison"
        icon={Globe}
        subtitle={`${operatorData.length} operators | ${locations?.length || 0} samples`}
        headerExtra={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-slate-600">
              {["bar", "table"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-2 py-1 text-[10px] font-medium transition-colors capitalize ${
                    viewMode === mode
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-white hover:bg-slate-700"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  showSettings
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                <Settings className="h-3 w-3" />
                Metrics
                <span className="bg-slate-600 px-1 rounded text-[9px]">
                  {selectedMetrics.length}
                </span>
              </button>

              {showSettings && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowSettings(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-2 min-w-[180px]">
                    <div className="text-[10px] text-white mb-2 font-medium">
                      Select Metrics
                    </div>
                    <div className="space-y-1">
                      {Object.entries(AVAILABLE_METRICS).map(([key, config]) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={selectedMetrics.includes(key)}
                            onChange={() => toggleMetric(key)}
                            className="w-3 h-3 rounded"
                          />
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: config.color }}
                          />
                          <span className="text-xs text-slate-300">
                            {config.label}
                          </span>
                          <span className="text-[9px] text-slate-500 ml-auto">
                            {config.unit}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        }
        expandable
        collapsible
      >
        <div className="flex flex-wrap gap-1 mb-3">
          {selectedMetrics.map((metricKey) => {
            const config = AVAILABLE_METRICS[metricKey];
            return (
              <span
                key={metricKey}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{
                  backgroundColor: `${config.color}20`,
                  color: config.color,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: config.color }}
                />
                {config.label}
              </span>
            );
          })}
        </div>

        {viewMode === "bar" && (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={barChartData}
              margin={{ top: 10, right: 20, left: 10, bottom: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} />
              <Tooltip content={<CustomBarTooltip />} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {selectedMetrics.map((metricKey) => {
                const config = AVAILABLE_METRICS[metricKey];
                return (
                  <Bar
                    key={metricKey}
                    dataKey={metricKey}
                    name={config.label}
                    radius={[4, 4, 0, 0]}
                  >
                    {barChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={getProviderColor(entry.name)}
                      />
                    ))}
                  </Bar>
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        )}

        {viewMode === "radar" && (
          <ResponsiveContainer width="100%" height={350}>
            <RadarChart
              data={radarChartData}
              margin={{ top: 20, right: 30, bottom: 20, left: 30 }}
            >
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fill: "#9CA3AF", fontSize: 10 }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
                tick={{ fill: "#9CA3AF", fontSize: 9 }}
              />
              <Tooltip content={<CustomRadarTooltip />} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {operatorData.map((op) => (
                <Radar
                  key={op.name}
                  name={op.name}
                  dataKey={op.name}
                  stroke={op.color}
                  fill={op.color}
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        )}

        {viewMode === "table" && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-2 text-slate-400 font-medium sticky left-0 bg-slate-800">
                    Operator
                  </th>
                  <th className="text-center p-2 text-slate-400 font-medium">
                    Samples
                  </th>
                  {selectedMetrics.map((metricKey) => {
                    const config = AVAILABLE_METRICS[metricKey];
                    return (
                      <th
                        key={metricKey}
                        className="text-center p-2 font-medium"
                        style={{ color: config.color }}
                      >
                        {config.label}
                        {config.unit && (
                          <span className="text-[9px] text-slate-500 ml-0.5">
                            ({config.unit})
                          </span>
                        )}
                      </th>
                    );
                  })}
                  <th className="text-center p-2 text-slate-400 font-medium">
                    Tech
                  </th>
                  <th className="text-center p-2 text-slate-400 font-medium">
                    Band
                  </th>
                </tr>
              </thead>
              <tbody>
                {operatorData.map((op, idx) => (
                  <tr
                    key={op.name}
                    className={`border-t border-slate-700 hover:bg-slate-800/50 ${
                      idx === 0 ? "bg-green-900/10" : ""
                    }`}
                  >
                    <td className="p-2 sticky left-0 bg-slate-900">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: op.color }}
                        />
                        <span className="font-semibold text-white">
                          {op.name}
                        </span>
                        {idx === 0 && (
                          <span className="text-[9px] bg-green-500/20 text-green-400 px-1 rounded">
                            #1
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-center text-slate-300">
                      {op.samples}
                    </td>
                    {selectedMetrics.map((metricKey) => {
                      const config = AVAILABLE_METRICS[metricKey];
                      const stats = op[metricKey];
                      const value = stats?.avg;

                      const allValues = operatorData
                        .map((o) => o[metricKey]?.avg)
                        .filter(Boolean);
                      const isBest = config.higherBetter
                        ? value === Math.max(...allValues)
                        : value === Math.min(...allValues);

                      return (
                        <td
                          key={metricKey}
                          className={`p-2 text-center font-medium ${
                            isBest ? "text-green-400" : "text-slate-300"
                          }`}
                        >
                          {value?.toFixed(1) ?? "-"}
                          {isBest && (
                            <span className="ml-1 text-yellow-400 text-[10px]">
                              Best
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-2 text-center text-purple-400">
                      {op.dominantTech}
                    </td>
                    <td className="p-2 text-center text-blue-400">
                      {op.dominantBand !== "N/A" ? `B${op.dominantBand}` : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-700">
          {operatorData.map((op) => (
            <div
              key={op.name}
              className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 rounded"
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: op.color }}
              />
              <span className="text-xs text-white font-medium">{op.name}</span>
              <span className="text-[10px] text-slate-400">{op.samples}</span>
            </div>
          ))}
        </div>
      </ChartContainer>
    );
  }
);

OperatorComparisonChart.displayName = "OperatorComparisonChart";