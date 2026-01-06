import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import {
  Settings,
  Download,
  Filter,
  Activity,
  X,
  BarChart3,
} from "lucide-react";
import {
  useOperatorMetrics,
  useOperatorsAndNetworks,
} from "@/hooks/useDashboardData.js";
import { formatNumber } from "@/utils/chartUtils";
import Spinner from "@/components/common/Spinner";
import {
  getProviderColor,
  normalizeProviderName,
  getTechnologyColor,
  normalizeTechName,
  COLOR_SCHEMES,
} from "@/utils/colorUtils";

const FALLBACK_COLORS = [
  "#3B82F6",
  "#8B5CF6",
  "#7d1b49",
  "#F59E0B",
  "#EF4444",
  "#06B6D4",
  "#EC4899",
  "#84CC16",
  "#F97316",
  "#6366F1",
];

const NEGATIVE_VALUE_METRICS = ["rsrp", "rsrq"];

const isValidName = (name) => {
  if (!name || typeof name !== "string") return false;
  const cleanName = name.toLowerCase().trim();
  return (
    cleanName !== "" &&
    cleanName !== "unknown" &&
    cleanName !== "null" &&
    cleanName !== "undefined" &&
    cleanName !== "n/a" &&
    cleanName !== "na" &&
    cleanName !== "-" &&
    cleanName !== "000 000" &&
    cleanName !== "000000" &&
    !/^0+[\s]*0*$/.test(cleanName) &&
    !/^[\s0\-]+$/.test(cleanName) &&
    !cleanName.includes("unknown") &&
    cleanName.length > 1
  );
};

const hasValidValue = (value) => {
  return typeof value === "number" && !isNaN(value) && value !== 0;
};

const getChartTechColor = (tech, index) => {
  const color = getTechnologyColor(tech);
  if (color) return color;
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
};

const METRICS = {
  samples: {
    label: "Sample Count",
    unit: "samples",
    yAxisLabel: "Samples",
    format: (val) => formatNumber(val),
    icon: Activity,
    reversed: false,
  },
  rsrp: {
    label: "RSRP",
    unit: "dBm",
    yAxisLabel: "RSRP (dBm)",
    format: (val) => `${val?.toFixed(1) || 0} dBm`,
    icon: Activity,
    reversed: true,
  },
  rsrq: {
    label: "RSRQ",
    unit: "dB",
    yAxisLabel: "RSRQ (dB)",
    format: (val) => `${val?.toFixed(1) || 0} dB`,
    icon: Activity,
    reversed: true,
  },
  sinr: {
    label: "SINR",
    unit: "dB",
    yAxisLabel: "SINR (dB)",
    format: (val) => `${val?.toFixed(1) || 0} dB`,
    icon: Activity,
    reversed: false,
  },
  mos: {
    label: "MOS",
    unit: "",
    yAxisLabel: "MOS Score",
    format: (val) => val?.toFixed(2) || "0",
    icon: Activity,
    reversed: false,
  },
  jitter: {
    label: "Jitter",
    unit: "ms",
    yAxisLabel: "Jitter (ms)",
    format: (val) => `${val?.toFixed(1) || 0} ms`,
    icon: Activity,
    reversed: false,
  },
  latency: {
    label: "Latency",
    unit: "ms",
    yAxisLabel: "Latency (ms)",
    format: (val) => `${val?.toFixed(1) || 0} ms`,
    icon: Activity,
    reversed: false,
  },
  packetLoss: {
    label: "Packet Loss",
    unit: "",
    yAxisLabel: "Packet Loss (%)",
    format: (val) => `${val?.toFixed(2) || 0}`,
    icon: Activity,
    reversed: false,
  },
};

const OperatorNetworkChart = () => {
  const {
    operators: apiOperators,
    networks: apiNetworks,
    isLoading: metaLoading,
  } = useOperatorsAndNetworks();

  const [selectedMetric, setSelectedMetric] = useState("samples");
  const [showSettings, setShowSettings] = useState(false);
  const [selectedOperators, setSelectedOperators] = useState([]);
  const [selectedTechnologies, setSelectedTechnologies] = useState([]);

  const { data: allData, isLoading } = useOperatorMetrics(selectedMetric, {});

  const availableTechnologies = useMemo(() => {
    if (!apiNetworks || !Array.isArray(apiNetworks)) return [];
    return apiNetworks.filter((tech) => {
      if (!isValidName(tech)) return false;
      const normalized = normalizeTechName(tech);
      return normalized !== "2G" && normalized !== "Unknown";
    });
  }, [apiNetworks]);

  const availableOperators = useMemo(() => {
    if (!apiOperators || !Array.isArray(apiOperators)) return [];

    // Only filter by valid name, no operator restriction
    const validOperators = apiOperators.filter((operator) =>
      isValidName(operator)
    );

    const uniqueBrands = new Map();
    validOperators.forEach((operator) => {
      const brandName = normalizeProviderName(operator);
      if (brandName && !uniqueBrands.has(brandName)) {
        uniqueBrands.set(brandName, {
          original: operator,
          brand: brandName,
          color: getProviderColor(operator) || COLOR_SCHEMES.provider.Unknown,
        });
      }
    });

    return Array.from(uniqueBrands.values());
  }, [apiOperators]);

  const filteredData = useMemo(() => {
    if (!allData || allData.length === 0) return [];

    // Only filter by valid name, no operator restriction
    let filtered = allData.filter((item) => isValidName(item.name));

    const groupedByBrand = new Map();

    filtered.forEach((item) => {
      const brandName = normalizeProviderName(item.name);
      if (!brandName) return;

      if (!groupedByBrand.has(brandName)) {
        groupedByBrand.set(brandName, {
          name: item.name,
          displayName: brandName,
          operatorColor:
            getProviderColor(item.name) || COLOR_SCHEMES.provider.Unknown,
          techData: {},
          techCounts: {},
        });
      }

      const brandItem = groupedByBrand.get(brandName);

      Object.keys(item).forEach((key) => {
        if (
          [
            "name",
            "total",
            "displayName",
            "operatorColor",
            "_networkCounts",
          ].includes(key)
        )
          return;
        if (!isValidName(key)) return;

        const normalizedTech = normalizeTechName(key);
        if (normalizedTech === "2G" || normalizedTech === "Unknown") return;

        const value = item[key];
        if (!hasValidValue(value)) return;

        if (brandItem.techData[normalizedTech] !== undefined) {
          const currentCount = brandItem.techCounts[normalizedTech] || 1;
          const currentSum = brandItem.techData[normalizedTech] * currentCount;

          brandItem.techCounts[normalizedTech] = currentCount + 1;
          brandItem.techData[normalizedTech] =
            (currentSum + value) / brandItem.techCounts[normalizedTech];
        } else {
          brandItem.techData[normalizedTech] = value;
          brandItem.techCounts[normalizedTech] = 1;
        }
      });
    });

    filtered = Array.from(groupedByBrand.values()).map((item) => ({
      name: item.name,
      displayName: item.displayName,
      operatorColor: item.operatorColor,
      ...item.techData,
    }));

    if (selectedOperators.length > 0) {
      filtered = filtered.filter((item) =>
        selectedOperators.includes(item.displayName)
      );
    }

    if (selectedTechnologies.length > 0) {
      filtered = filtered
        .map((item) => {
          const newItem = {
            name: item.name,
            displayName: item.displayName,
            operatorColor: item.operatorColor,
          };
          selectedTechnologies.forEach((tech) => {
            if (hasValidValue(item[tech])) {
              newItem[tech] = item[tech];
            }
          });
          return newItem;
        })
        .filter((item) => {
          const techKeys = Object.keys(item).filter(
            (k) => !["name", "displayName", "operatorColor"].includes(k)
          );
          return techKeys.length > 0;
        });
    }

    filtered = filtered
      .map((item) => {
        const techs = Object.keys(item).filter(
          (k) => !["name", "total", "displayName", "operatorColor"].includes(k)
        );
        const validValues = techs.filter((tech) => hasValidValue(item[tech]));

        let total = 0;
        if (validValues.length > 0) {
          const sum = validValues.reduce((acc, tech) => acc + item[tech], 0);
          total = sum / validValues.length;
        }

        return { ...item, total };
      })
      .filter((item) => {
        const techs = Object.keys(item).filter(
          (k) => !["name", "total", "displayName", "operatorColor"].includes(k)
        );
        return techs.some((tech) => hasValidValue(item[tech]));
      });

    return filtered;
  }, [allData, selectedOperators, selectedTechnologies, selectedMetric]);

  const technologyTypes = useMemo(() => {
    if (!filteredData?.length) return [];
    const techs = new Set();
    filteredData.forEach((item) => {
      Object.entries(item).forEach(([key, value]) => {
        if (
          !["name", "displayName", "operatorColor", "total"].includes(key) &&
          hasValidValue(value)
        ) {
          techs.add(key);
        }
      });
    });
    return [...techs];
  }, [filteredData]);

  const handleMetricChange = (value) => {
    setSelectedMetric(value);
    setShowSettings(false);
  };

  const toggleOperator = (brandName) => {
    setSelectedOperators((prev) =>
      prev.includes(brandName)
        ? prev.filter((op) => op !== brandName)
        : [...prev, brandName]
    );
  };

  const toggleTechnology = (tech) => {
    setSelectedTechnologies((prev) =>
      prev.includes(tech) ? prev.filter((t) => t !== tech) : [...prev, tech]
    );
  };

  const clearAllFilters = () => {
    setSelectedOperators([]);
    setSelectedTechnologies([]);
    setSelectedMetric("samples");
  };

  const hasActiveFilters =
    selectedOperators.length > 0 ||
    selectedTechnologies.length > 0 ||
    selectedMetric !== "samples";

  const handleExport = () => {
    if (!filteredData || filteredData.length === 0) return;

    const metricConfig = METRICS[selectedMetric];
    const headers = [
      "Operator",
      ...technologyTypes,
      `Average ${metricConfig.label}`,
    ];
    const rows = filteredData.map((item) => [
      item.displayName || item.name,
      ...technologyTypes.map((tech) => item[tech] ?? ""),
      item.total ?? "",
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n"
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `operator_${selectedMetric}_${
      new Date().toISOString().split("T")[0]
    }.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const formatYAxis = (value) => {
    if (selectedMetric === "samples") return formatNumber(value);
    return value?.toFixed(1) || "0";
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;

    const metricConfig = METRICS[selectedMetric];
    const validPayload = payload.filter((p) => hasValidValue(p.value));
    if (validPayload.length === 0) return null;

    const currentOperator = filteredData.find(
      (item) => item.name === label || item.displayName === label
    );
    const operatorColor =
      currentOperator?.operatorColor || COLOR_SCHEMES.provider.Unknown;
    const displayName = currentOperator?.displayName || label;

    const sum = validPayload.reduce((acc, p) => acc + (p.value || 0), 0);
    const total =
      selectedMetric === "samples" ? sum : sum / validPayload.length;

    return (
      <div
        className="bg-white rounded-lg shadow-xl border-2 p-3"
        style={{ borderColor: operatorColor, minWidth: "180px", zIndex: 99999 }}
      >
        <div
          className="text-lg font-bold mb-2 pb-2 border-b"
          style={{ color: operatorColor, borderColor: `${operatorColor}30` }}
        >
          {displayName}
        </div>

        <div className="space-y-1.5">
          {validPayload
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
            .map((entry, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-base font-semibold text-gray-700">
                    {entry.name}
                  </span>
                </div>
                <span className="text-base font-bold text-gray-900">
                  {metricConfig.format(entry.value)}
                </span>
              </div>
            ))}
        </div>

        <div
          className="mt-2 pt-2 border-t flex justify-between items-center"
          style={{ borderColor: `${operatorColor}30` }}
        >
          <span className="text-base font-semibold text-gray-600">
            {selectedMetric === "samples" ? "Total" : "Avg"}
          </span>
          <span className="text-lg font-bold" style={{ color: operatorColor }}>
            {metricConfig.format(total)}
          </span>
        </div>
      </div>
    );
  };

  const CustomLegend = ({ payload }) => {
    if (!payload || payload.length === 0) return null;

    const validLegendItems = payload.filter((entry) => {
      return filteredData.some((item) => hasValidValue(item[entry.value]));
    });

    if (validLegendItems.length === 0) return null;

    return (
      <div className="flex flex-wrap justify-center gap-4 mt-4 pt-3 border-t border-gray-200">
        {validLegendItems.map((entry, index) => (
          <div key={index} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm font-bold text-gray-700">
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const currentMetric = METRICS[selectedMetric];
  const isReversedAxis = currentMetric?.reversed || false;

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 p-5 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-lg">
              <BarChart3 className="text-white" size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                Operator Comparison
              </h3>
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {currentMetric?.label}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={!filteredData || filteredData.length === 0}
              className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all disabled:opacity-50"
              title="Export CSV"
            >
              <Download size={20} />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-lg transition-all ${
                showSettings
                  ? "text-blue-600 bg-blue-50"
                  : "text-gray-500 hover:text-blue-600 hover:bg-blue-50"
              }`}
              title="Settings"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-5">
        {showSettings && (
          <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <Filter size={16} className="text-blue-600" />
                Filters
              </h4>
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-red-600 hover:text-red-700 font-semibold"
                >
                  Clear All
                </button>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Metric
              </label>
              <select
                value={selectedMetric}
                onChange={(e) => handleMetricChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-medium"
              >
                {Object.entries(METRICS).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Operators
              </label>
              <div className="flex flex-wrap gap-2">
                {metaLoading ? (
                  <Spinner />
                ) : availableOperators.length > 0 ? (
                  availableOperators.map((operatorData, index) => {
                    const isSelected =
                      selectedOperators.length === 0 ||
                      selectedOperators.includes(operatorData.brand);

                    return (
                      <button
                        key={`${operatorData.brand}-${index}`}
                        onClick={() => toggleOperator(operatorData.brand)}
                        className="px-4 py-2 text-sm font-bold rounded-lg transition-all"
                        style={
                          isSelected
                            ? {
                                backgroundColor: operatorData.color,
                                color: "#fff",
                              }
                            : { backgroundColor: "#E5E7EB", color: "#6B7280" }
                        }
                      >
                        {operatorData.brand}
                      </button>
                    );
                  })
                ) : (
                  <span className="text-sm text-gray-500">No operators</span>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Technology
              </label>
              <div className="flex flex-wrap gap-2">
                {metaLoading ? (
                  <Spinner />
                ) : availableTechnologies.length > 0 ? (
                  availableTechnologies.map((tech, index) => {
                    const techColor = getChartTechColor(tech, index);
                    const isSelected =
                      selectedTechnologies.length === 0 ||
                      selectedTechnologies.includes(tech);

                    return (
                      <button
                        key={`${tech}-${index}`}
                        onClick={() => toggleTechnology(tech)}
                        className="px-3 py-1.5 text-sm font-semibold rounded-lg transition-all"
                        style={
                          isSelected
                            ? { backgroundColor: techColor, color: "#fff" }
                            : { backgroundColor: "#E5E7EB", color: "#6B7280" }
                        }
                      >
                        {tech}
                      </button>
                    );
                  })
                ) : (
                  <span className="text-sm text-gray-500">No technologies</span>
                )}
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="h-[400px] flex items-center justify-center bg-gray-50 rounded-xl">
            <div className="text-center">
              <Spinner />
              <p className="text-sm text-gray-500 mt-3">Loading...</p>
            </div>
          </div>
        )}

        {!isLoading &&
          filteredData &&
          filteredData.length > 0 &&
          technologyTypes.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart
                  data={filteredData}
                  margin={{ top: 20, right: 30, left: 50, bottom: 60 }}
                  barGap={2}
                  barCategoryGap="25%"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#E5E7EB"
                  />
                  <XAxis
                    dataKey="displayName"
                    tick={{ fill: "#111827", fontSize: 14, fontWeight: 700 }}
                    axisLine={{ stroke: "#D1D5DB" }}
                    tickLine={{ stroke: "#D1D5DB" }}
                  />
                  <YAxis
                    reversed={isReversedAxis}
                    tick={{ fill: "#6B7280", fontSize: 12, fontWeight: 500 }}
                    tickFormatter={formatYAxis}
                    axisLine={{ stroke: "#D1D5DB" }}
                    tickLine={{ stroke: "#D1D5DB" }}
                    label={{
                      value: currentMetric?.yAxisLabel,
                      angle: -90,
                      position: "insideLeft",
                      style: { fill: "#374151", fontSize: 12, fontWeight: 600 },
                      offset: 0,
                    }}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: "rgba(59, 130, 246, 0.1)" }}
                    wrapperStyle={{ zIndex: 99999 }}
                  />
                  <Legend content={<CustomLegend />} />
                  {technologyTypes.map((tech, idx) => (
                    <Bar
                      key={tech}
                      dataKey={tech}
                      name={tech}
                      fill={getChartTechColor(tech, idx)}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={50}
                    >
                      {filteredData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            hasValidValue(entry[tech])
                              ? getChartTechColor(tech, idx)
                              : "transparent"
                          }
                        />
                      ))}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

        {!isLoading &&
          (!filteredData ||
            filteredData.length === 0 ||
            technologyTypes.length === 0) && (
            <div className="h-[400px] flex flex-col items-center justify-center text-gray-500 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
              <Filter size={40} className="text-gray-400 mb-3" />
              <p className="text-lg font-bold text-gray-700">
                No data available
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Selected metric: {currentMetric?.label}
              </p>

              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold flex items-center gap-2"
                >
                  <X size={16} />
                  Clear Filters
                </button>
              )}
            </div>
          )}
      </div>
    </div>
  );
};

export default OperatorNetworkChart;