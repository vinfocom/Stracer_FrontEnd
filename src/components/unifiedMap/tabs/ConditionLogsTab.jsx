import React, { useMemo } from "react";
import { BarChart3, Grid3X3 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

import { ChartContainer } from "../common/ChartContainer";
import { StatCard } from "../common/StatCard";
import { EmptyState } from "../common/EmptyState";
import { CHART_CONFIG } from "@/utils/constants";

const CONDITION_COLORS = {
  baseline: "#ef4444",
  optimized: "#22c55e",
  unknown: "#64748b",
};

const METRIC_COLORS = {
  rsrp: "#60a5fa",
  rsrq: "#f59e0b",
};

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeCondition = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "optimised") return "optimized";
  if (normalized === "updated") return "optimized";
  if (normalized === "original") return "baseline";
  return normalized;
};

const resolveSelectedCondition = (sitePredictionVersion) => {
  const normalized = normalizeCondition(sitePredictionVersion || "original");
  if (normalized === "delta") return "delta";
  if (normalized === "optimized") return "optimized";
  return "baseline";
};

const readMetricValue = (row, metric, selectedMetricLower) => {
  const metricKeys =
    metric === "rsrq"
      ? ["rsrq", "pred_rsrq", "reference_signal_quality", "RSRQ"]
      : ["rsrp", "pred_rsrp", "reference_signal_power", "RSRP"];

  for (const key of metricKeys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = toFiniteNumber(row[key]);
      if (Number.isFinite(value)) return value;
    }
  }

  if (selectedMetricLower === metric) {
    const value = toFiniteNumber(row.value);
    if (Number.isFinite(value)) return value;
  }

  const hintedKey = Object.keys(row || {}).find((key) =>
    String(key || "").toLowerCase().includes(metric),
  );
  if (hintedKey) {
    const hintedValue = toFiniteNumber(row[hintedKey]);
    if (Number.isFinite(hintedValue)) return hintedValue;
  }

  return null;
};

const readSelectedMetricValue = (row, selectedMetricLower) => {
  if (!selectedMetricLower) return null;

  if (selectedMetricLower === "rsrp" || selectedMetricLower === "rsrq") {
    return readMetricValue(row, selectedMetricLower, selectedMetricLower);
  }

  const metricCandidates =
    selectedMetricLower === "sinr" || selectedMetricLower === "snr"
      ? ["sinr", "snr", "pred_sinr", "signal_to_noise_ratio"]
      : [selectedMetricLower];

  const genericCandidates = [
    selectedMetricLower,
    selectedMetricLower.toUpperCase(),
    "value",
    "Value",
    "measured",
    "measured_value",
    "metric_value",
    "avg_value",
  ];

  for (const key of [...metricCandidates, ...genericCandidates]) {
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) {
      const value = toFiniteNumber(row[key]);
      if (Number.isFinite(value)) return value;
    }
  }

  const metricHint = selectedMetricLower.replace(/[^a-z0-9]/g, "");
  const hintedKey = Object.keys(row || {}).find((key) =>
    String(key || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .includes(metricHint),
  );
  if (hintedKey) {
    const hintedValue = toFiniteNumber(row[hintedKey]);
    if (Number.isFinite(hintedValue)) return hintedValue;
  }

  return null;
};

const summarizeMetric = (rows = [], metric) => {
  const values = rows.map((row) => row[metric]).filter(Number.isFinite);
  if (!values.length) {
    return { count: 0, avg: null, min: null, max: null };
  }

  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < minValue) minValue = value;
    if (value > maxValue) maxValue = value;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    avg: total / values.length,
    min: Number.isFinite(minValue) ? minValue : null,
    max: Number.isFinite(maxValue) ? maxValue : null,
  };
};

const buildCdfData = (baselineValues = [], optimizedValues = [], points = 60) => {
  const base = (baselineValues || []).filter(Number.isFinite);
  const opt = (optimizedValues || []).filter(Number.isFinite);
  if (base.length === 0 && opt.length === 0) return [];

  const allValues = [...base, ...opt];
  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;
  for (const value of allValues) {
    if (value < minValue) minValue = value;
    if (value > maxValue) maxValue = value;
  }
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return [];

  if (minValue === maxValue) {
    return [
      {
        value: minValue,
        baseline: base.length ? 100 : 0,
        optimized: opt.length ? 100 : 0,
      },
    ];
  }

  const totalPoints = Math.max(10, Math.min(200, Number(points) || 60));
  const step = (maxValue - minValue) / totalPoints;
  const computePercent = (values, threshold) =>
    values.length === 0
      ? 0
      : (values.reduce((count, value) => count + (value >= threshold ? 1 : 0), 0) / values.length) * 100;

  const result = [];
  for (let idx = 0; idx <= totalPoints; idx += 1) {
    const x = minValue + step * idx;
    result.push({
      value: x,
      baseline: computePercent(base, x),
      optimized: computePercent(opt, x),
    });
  }
  return result;
};

const toMetricDisplay = (value) =>
  Number.isFinite(value) ? value.toFixed(2) : "N/A";

const formatMetricLabel = (metric) => {
  const normalized = String(metric || "").trim().toLowerCase();
  if (!normalized) return "Metric";

  const labelMap = {
    rsrp: "RSRP",
    rsrq: "RSRQ",
    sinr: "SINR",
    snr: "SNR",
    dl_thpt: "DL Throughput",
    ul_thpt: "UL Throughput",
    mos: "MOS",
  };

  if (labelMap[normalized]) return labelMap[normalized];
  return normalized.replace(/_/g, " ").toUpperCase();
};

export const ConditionLogsTab = ({
  locations = [],
  selectedMetric = "rsrp",
  sitePredictionVersion = "original",
  lteGridEnabled = false,
  lteGridSizeMeters = 50,
  isDeltaSiteGridMode = false,
  viewport = null,
  expanded = false,
}) => {
  const selectedCondition = useMemo(
    () => resolveSelectedCondition(sitePredictionVersion),
    [sitePredictionVersion],
  );

  const normalizedRows = useMemo(() => {
    if (!Array.isArray(locations) || locations.length === 0) return [];

    const selectedMetricLower = String(selectedMetric || "rsrp")
      .trim()
      .toLowerCase();

    return locations
      .map((row, index) => {
        const lat = toFiniteNumber(row.lat ?? row.latitude);
        const lng = toFiniteNumber(row.lng ?? row.lon ?? row.longitude);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const rawCondition = normalizeCondition(
          row.deltaVariant ?? row.delta_variant ?? "",
        );

        return {
          id:
            row.id ??
            row.log_id ??
            row.logId ??
            row.cell_id ??
            row.cellId ??
            row.site_id ??
            row.siteId ??
            index,
          lat,
          lng,
          siteId: String(row.siteId ?? row.site_id ?? row.site ?? "").trim(),
          sectorId: String(
            row.sector ??
              row.sector_id ??
              row.sectorId ??
              row.cell_id ??
              row.cellId ??
              "",
          ).trim(),
          rawCondition,
          metricValue: readSelectedMetricValue(row, selectedMetricLower),
          rsrp: readMetricValue(row, "rsrp", selectedMetricLower),
          rsrq: readMetricValue(row, "rsrq", selectedMetricLower),
        };
      })
      .filter(Boolean);
  }, [locations, selectedMetric]);

  const visibleRows = useMemo(() => {
    if (!viewport) return normalizedRows;
    const north = Number(viewport?.north);
    const south = Number(viewport?.south);
    const east = Number(viewport?.east);
    const west = Number(viewport?.west);
    if (![north, south, east, west].every(Number.isFinite)) return normalizedRows;

    return normalizedRows.filter(
      (row) =>
        row.lat <= north &&
        row.lat >= south &&
        row.lng <= east &&
        row.lng >= west,
    );
  }, [normalizedRows, viewport]);

  const classifyRowCondition = useMemo(() => {
    const deltaMode = selectedCondition === "delta";

    return (row) => {
      if (row.rawCondition === "baseline" || row.rawCondition === "optimized") {
        return row.rawCondition;
      }

      if (deltaMode) return "unknown";
      return selectedCondition === "optimized" ? "optimized" : "baseline";
    };
  }, [selectedCondition]);

  const conditionBuckets = useMemo(() => {
    const buckets = {
      baseline: [],
      optimized: [],
      unknown: [],
    };

    visibleRows.forEach((row) => {
      const condition = classifyRowCondition(row);
      if (!buckets[condition]) {
        buckets.unknown.push(row);
        return;
      }
      buckets[condition].push({
        ...row,
        displayCondition: condition,
      });
    });

    return buckets;
  }, [visibleRows, classifyRowCondition]);

  const hasTaggedConditions = useMemo(
    () =>
      visibleRows.some(
        (row) => row.rawCondition === "baseline" || row.rawCondition === "optimized",
      ),
    [visibleRows],
  );

  const tableRows = useMemo(() => {
    if (selectedCondition === "delta") {
      return [
        ...conditionBuckets.baseline,
        ...conditionBuckets.optimized,
        ...conditionBuckets.unknown,
      ];
    }

    if (!hasTaggedConditions) {
      return visibleRows.map((row) => ({
        ...row,
        displayCondition: selectedCondition,
      }));
    }

    if (selectedCondition === "optimized") {
      return conditionBuckets.optimized;
    }

    return conditionBuckets.baseline;
  }, [
    selectedCondition,
    conditionBuckets,
    hasTaggedConditions,
    visibleRows,
  ]);

  const selectedMetricLabel = useMemo(
    () => formatMetricLabel(selectedMetric),
    [selectedMetric],
  );
  const average = (values = []) => {
    const finiteValues = (values || []).filter(Number.isFinite);
    if (!finiteValues.length) return null;
    return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  };

  const gridAnalysis = useMemo(() => {
    if (!lteGridEnabled || tableRows.length === 0) {
      return null;
    }

    const safeSize = Math.max(5, Number(lteGridSizeMeters) || 50);
    const meanLat =
      tableRows.reduce((sum, row) => sum + row.lat, 0) / tableRows.length;
    const stepLat = safeSize / 111320;
    const stepLng =
      safeSize /
      (111320 * Math.max(Math.abs(Math.cos((meanLat * Math.PI) / 180)), 1e-6));

    const buckets = new Map();
    tableRows.forEach((row) => {
      const gridRow = Math.floor(row.lat / stepLat);
      const gridCol = Math.floor(row.lng / stepLng);
      const key = `${gridRow}|${gridCol}`;
      const condition = row.displayCondition || classifyRowCondition(row);

      if (!buckets.has(key)) {
        buckets.set(key, {
          baselineCount: 0,
          optimizedCount: 0,
          unknownCount: 0,
          baselineMetricValues: [],
          optimizedMetricValues: [],
          unknownMetricValues: [],
          baselineRsrpValues: [],
          optimizedRsrpValues: [],
          unknownRsrpValues: [],
          baselineRsrqValues: [],
          optimizedRsrqValues: [],
          unknownRsrqValues: [],
          allMetricValues: [],
        });
      }

      const bucket = buckets.get(key);
      if (condition === "baseline") bucket.baselineCount += 1;
      else if (condition === "optimized") bucket.optimizedCount += 1;
      else bucket.unknownCount += 1;

      if (Number.isFinite(row.metricValue)) {
        bucket.allMetricValues.push(row.metricValue);
        if (condition === "baseline") bucket.baselineMetricValues.push(row.metricValue);
        else if (condition === "optimized") bucket.optimizedMetricValues.push(row.metricValue);
        else bucket.unknownMetricValues.push(row.metricValue);
      }
      if (Number.isFinite(row.rsrp)) {
        if (condition === "baseline") bucket.baselineRsrpValues.push(row.rsrp);
        else if (condition === "optimized") bucket.optimizedRsrpValues.push(row.rsrp);
        else bucket.unknownRsrpValues.push(row.rsrp);
      }
      if (Number.isFinite(row.rsrq)) {
        if (condition === "baseline") bucket.baselineRsrqValues.push(row.rsrq);
        else if (condition === "optimized") bucket.optimizedRsrqValues.push(row.rsrq);
        else bucket.unknownRsrqValues.push(row.rsrq);
      }
    });

    let baselineDominantCount = 0;
    let optimizedDominantCount = 0;
    let unknownDominantCount = 0;
    let comparableCellCount = 0;
    const gridPointRows = [];
    const baselineDominantMetricValues = [];
    const optimizedDominantMetricValues = [];
    const baselineDominantRsrpValues = [];
    const optimizedDominantRsrpValues = [];
    const baselineDominantRsrqValues = [];
    const optimizedDominantRsrqValues = [];

    buckets.forEach((bucket) => {
      const baselineMetricAvg = average(bucket.baselineMetricValues);
      const optimizedMetricAvg = average(bucket.optimizedMetricValues);
      const unknownMetricAvg = average(bucket.unknownMetricValues);
      const overallMetricAvg = average(bucket.allMetricValues);
      const baselineRsrpAvg = average(bucket.baselineRsrpValues);
      const optimizedRsrpAvg = average(bucket.optimizedRsrpValues);
      const baselineRsrqAvg = average(bucket.baselineRsrqValues);
      const optimizedRsrqAvg = average(bucket.optimizedRsrqValues);

      if (bucket.baselineCount > 0 && bucket.optimizedCount > 0) {
        comparableCellCount += 1;
      }

      let dominantCondition = "unknown";
      if (bucket.baselineCount > bucket.optimizedCount) {
        dominantCondition = "baseline";
      } else if (bucket.optimizedCount > bucket.baselineCount) {
        dominantCondition = "optimized";
      } else if (bucket.baselineCount === bucket.optimizedCount && bucket.baselineCount > 0) {
        if (Number.isFinite(baselineMetricAvg) && Number.isFinite(optimizedMetricAvg)) {
          dominantCondition = optimizedMetricAvg >= baselineMetricAvg ? "optimized" : "baseline";
        }
      }

      if (dominantCondition === "baseline") {
        baselineDominantCount += 1;
        if (Number.isFinite(baselineMetricAvg)) baselineDominantMetricValues.push(baselineMetricAvg);
        if (Number.isFinite(baselineRsrpAvg)) baselineDominantRsrpValues.push(baselineRsrpAvg);
        if (Number.isFinite(baselineRsrqAvg)) baselineDominantRsrqValues.push(baselineRsrqAvg);
      } else if (dominantCondition === "optimized") {
        optimizedDominantCount += 1;
        if (Number.isFinite(optimizedMetricAvg)) optimizedDominantMetricValues.push(optimizedMetricAvg);
        if (Number.isFinite(optimizedRsrpAvg)) optimizedDominantRsrpValues.push(optimizedRsrpAvg);
        if (Number.isFinite(optimizedRsrqAvg)) optimizedDominantRsrqValues.push(optimizedRsrqAvg);
      } else {
        unknownDominantCount += 1;
      }

      const dominantMetricValue =
        dominantCondition === "baseline"
          ? baselineMetricAvg
          : dominantCondition === "optimized"
            ? optimizedMetricAvg
            : unknownMetricAvg;
      gridPointRows.push({
        metricValue: Number.isFinite(dominantMetricValue)
          ? dominantMetricValue
          : overallMetricAvg,
        condition: dominantCondition,
      });
    });

    return {
      estimatedCells: buckets.size,
      comparableCellCount,
      baselineDominantCount,
      optimizedDominantCount,
      unknownDominantCount,
      gridPointRows,
      baselineDominantMetricValues,
      optimizedDominantMetricValues,
      baselineDominantRsrpValues,
      optimizedDominantRsrpValues,
      baselineDominantRsrqValues,
      optimizedDominantRsrqValues,
    };
  }, [lteGridEnabled, lteGridSizeMeters, tableRows, classifyRowCondition]);

  const activeMetricSourceRows = useMemo(() => {
    if (lteGridEnabled && gridAnalysis?.gridPointRows?.length) {
      return gridAnalysis.gridPointRows;
    }
    return tableRows;
  }, [lteGridEnabled, gridAnalysis, tableRows]);

  const activeMetricSummary = useMemo(
    () => summarizeMetric(activeMetricSourceRows, "metricValue"),
    [activeMetricSourceRows],
  );

  const baselineRsrpValues = useMemo(
    () => conditionBuckets.baseline.map((row) => row.rsrp).filter(Number.isFinite),
    [conditionBuckets],
  );
  const optimizedRsrpValues = useMemo(
    () => conditionBuckets.optimized.map((row) => row.rsrp).filter(Number.isFinite),
    [conditionBuckets],
  );
  const baselineRsrqValues = useMemo(
    () => conditionBuckets.baseline.map((row) => row.rsrq).filter(Number.isFinite),
    [conditionBuckets],
  );
  const optimizedRsrqValues = useMemo(
    () => conditionBuckets.optimized.map((row) => row.rsrq).filter(Number.isFinite),
    [conditionBuckets],
  );

  const conditionCountData = useMemo(() => {
    if (lteGridEnabled && gridAnalysis) {
      return [
        {
          key: "baseline",
          condition: "Baseline",
          count: gridAnalysis.baselineDominantCount,
          color: CONDITION_COLORS.baseline,
        },
        {
          key: "optimized",
          condition: "Optimized",
          count: gridAnalysis.optimizedDominantCount,
          color: CONDITION_COLORS.optimized,
        },
        {
          key: "unknown",
          condition: "Unknown",
          count: gridAnalysis.unknownDominantCount,
          color: CONDITION_COLORS.unknown,
        },
      ].filter((item) => item.count > 0);
    }

    return [
      {
        key: "baseline",
        condition: "Baseline",
        count: conditionBuckets.baseline.length,
        color: CONDITION_COLORS.baseline,
      },
      {
        key: "optimized",
        condition: "Optimized",
        count: conditionBuckets.optimized.length,
        color: CONDITION_COLORS.optimized,
      },
      {
        key: "unknown",
        condition: "Unknown",
        count: conditionBuckets.unknown.length,
        color: CONDITION_COLORS.unknown,
      },
    ].filter((item) => item.count > 0);
  }, [lteGridEnabled, gridAnalysis, conditionBuckets]);

  const conditionMetricData = useMemo(() => {
    if (lteGridEnabled && gridAnalysis) {
      return [
        {
          key: "baseline",
          condition: "Baseline",
          rsrp: average(gridAnalysis.baselineDominantRsrpValues),
          rsrq: average(gridAnalysis.baselineDominantRsrqValues),
          color: CONDITION_COLORS.baseline,
        },
        {
          key: "optimized",
          condition: "Optimized",
          rsrp: average(gridAnalysis.optimizedDominantRsrpValues),
          rsrq: average(gridAnalysis.optimizedDominantRsrqValues),
          color: CONDITION_COLORS.optimized,
        },
      ].filter((item) => Number.isFinite(item.rsrp) || Number.isFinite(item.rsrq));
    }

    const entries = [
      { key: "baseline", label: "Baseline", rows: conditionBuckets.baseline },
      { key: "optimized", label: "Optimized", rows: conditionBuckets.optimized },
      { key: "unknown", label: "Unknown", rows: conditionBuckets.unknown },
    ];

    return entries
      .map(({ key, label, rows }) => {
        const rsrp = summarizeMetric(rows, "rsrp");
        const rsrq = summarizeMetric(rows, "rsrq");
        return {
          key,
          condition: label,
          rsrp: rsrp.avg,
          rsrq: rsrq.avg,
          color: CONDITION_COLORS[key],
        };
      })
      .filter((item) => Number.isFinite(item.rsrp) || Number.isFinite(item.rsrq));
  }, [lteGridEnabled, gridAnalysis, conditionBuckets]);

  const deltaMetricsData = useMemo(() => {
    if (selectedCondition !== "delta") return [];

    const baselineRsrp =
      lteGridEnabled && gridAnalysis
        ? average(gridAnalysis.baselineDominantRsrpValues)
        : summarizeMetric(conditionBuckets.baseline, "rsrp").avg;
    const optimizedRsrp =
      lteGridEnabled && gridAnalysis
        ? average(gridAnalysis.optimizedDominantRsrpValues)
        : summarizeMetric(conditionBuckets.optimized, "rsrp").avg;
    const baselineRsrq =
      lteGridEnabled && gridAnalysis
        ? average(gridAnalysis.baselineDominantRsrqValues)
        : summarizeMetric(conditionBuckets.baseline, "rsrq").avg;
    const optimizedRsrq =
      lteGridEnabled && gridAnalysis
        ? average(gridAnalysis.optimizedDominantRsrqValues)
        : summarizeMetric(conditionBuckets.optimized, "rsrq").avg;

    return [
      {
        metric: "RSRP",
        baseline: baselineRsrp,
        optimized: optimizedRsrp,
        delta:
          Number.isFinite(optimizedRsrp) && Number.isFinite(baselineRsrp)
            ? optimizedRsrp - baselineRsrp
            : null,
      },
      {
        metric: "RSRQ",
        baseline: baselineRsrq,
        optimized: optimizedRsrq,
        delta:
          Number.isFinite(optimizedRsrq) && Number.isFinite(baselineRsrq)
            ? optimizedRsrq - baselineRsrq
            : null,
      },
    ];
  }, [selectedCondition, lteGridEnabled, gridAnalysis, conditionBuckets]);

  const cdfRsrpData = useMemo(() => {
    if (lteGridEnabled && gridAnalysis) {
      return buildCdfData(
        gridAnalysis.baselineDominantRsrpValues,
        gridAnalysis.optimizedDominantRsrpValues,
      );
    }
    return buildCdfData(baselineRsrpValues, optimizedRsrpValues);
  }, [lteGridEnabled, gridAnalysis, baselineRsrpValues, optimizedRsrpValues]);

  const siteSectorStats = useMemo(() => {
    const makeSets = (rows = []) => {
      const sites = new Set();
      const sectors = new Set();

      rows.forEach((row) => {
        const siteId = String(row.siteId || "").trim();
        const sectorId = String(row.sectorId || row.id || "").trim();
        if (siteId) sites.add(siteId);
        if (siteId || sectorId) sectors.add(`${siteId}|${sectorId}`);
      });

      return { sites, sectors };
    };

    const baselineSets = makeSets(conditionBuckets.baseline);
    const optimizedSets = makeSets(conditionBuckets.optimized);
    const allSiteSet = new Set([...baselineSets.sites, ...optimizedSets.sites]);
    // Triangle count on map in delta mode is baseline triangles + optimized triangles.
    const totalTriangleSectors = baselineSets.sectors.size + optimizedSets.sectors.size;

    return {
      totalSites: allSiteSet.size,
      baselineSites: baselineSets.sites.size,
      optimizedSites: optimizedSets.sites.size,
      totalSectors: totalTriangleSectors,
      baselineSectors: baselineSets.sectors.size,
      optimizedSectors: optimizedSets.sectors.size,
    };
  }, [conditionBuckets]);

  const lteGridStats = useMemo(() => {
    if (!lteGridEnabled || !gridAnalysis) {
      return {
        estimatedCells: 0,
        deltaComparableCells: 0,
        baselineDominatingCells: 0,
        optimizedDominatingCells: 0,
      };
    }
    return {
      estimatedCells: gridAnalysis.estimatedCells,
      deltaComparableCells: isDeltaSiteGridMode ? gridAnalysis.comparableCellCount : 0,
      baselineDominatingCells: gridAnalysis.baselineDominantCount,
      optimizedDominatingCells: gridAnalysis.optimizedDominantCount,
    };
  }, [lteGridEnabled, gridAnalysis, isDeltaSiteGridMode]);

  if (!normalizedRows.length) {
    return (
      <EmptyState
        icon={BarChart3}
        message="No log points available for condition analysis"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          icon={BarChart3}
          label={`Avg ${selectedMetricLabel}`}
          value={toMetricDisplay(activeMetricSummary.avg)}
          subValue={`${activeMetricSummary.count} points`}
          color="green"
        />
        <StatCard
          icon={BarChart3}
          label="Unique Sites"
          value={siteSectorStats.totalSites}
          subValue={`Baseline ${siteSectorStats.baselineSites} | Optimized ${siteSectorStats.optimizedSites}`}
          color="blue"
        />
        <StatCard
          icon={BarChart3}
          label="Total Sectors"
          value={siteSectorStats.totalSectors}
          subValue={`Baseline ${siteSectorStats.baselineSectors} | Optimized ${siteSectorStats.optimizedSectors}`}
          color="yellow"
        />
      </div>

      <div
        className={`grid grid-cols-2 ${lteGridEnabled ? "md:grid-cols-4" : "md:grid-cols-2"} gap-3`}
      >
        <StatCard
          icon={Grid3X3}
          label="LTE Grid Cells"
          value={lteGridEnabled ? lteGridStats.estimatedCells : 0}
          subValue={lteGridEnabled ? `Size ${Number(lteGridSizeMeters) || 50}m` : "Grid disabled"}
          color="purple"
        />
        <StatCard
          icon={Grid3X3}
          label="Delta Comparable Cells"
          value={isDeltaSiteGridMode ? lteGridStats.deltaComparableCells : 0}
          subValue={isDeltaSiteGridMode ? "Cells with base + opt" : "Delta grid off"}
          color="yellow"
        />
        {lteGridEnabled && (
          <StatCard
            icon={Grid3X3}
            label="Baseline Dominating"
            value={lteGridStats.baselineDominatingCells}
            subValue="Grid cells"
            color="red"
          />
        )}
        {lteGridEnabled && (
          <StatCard
            icon={Grid3X3}
            label="Optimized Dominating"
            value={lteGridStats.optimizedDominatingCells}
            subValue="Grid cells"
            color="green"
          />
        )}
      </div>

      <div className={`grid ${expanded ? "grid-cols-2" : "grid-cols-1"} gap-4`}>
        <ChartContainer
          title="Condition Log Distribution"
          subtitle="How logs are split by Baseline / Optimized / Unknown"
          icon={BarChart3}
        >
          {conditionCountData.length === 0 ? (
            <EmptyState message="No condition distribution available" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={conditionCountData} margin={CHART_CONFIG.margin}>
                <CartesianGrid {...CHART_CONFIG.grid} />
                <XAxis dataKey="condition" tick={{ fill: "#9CA3AF", fontSize: 12 }} />
                <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    ...CHART_CONFIG.tooltip,
                    backgroundColor: "#020617",
                    border: "1px solid #334155",
                  }}
                  labelStyle={{ color: "#FFFFFF" }}
                  itemStyle={{ color: "#FFFFFF" }}
                  formatter={(value) => [value, "Logs"]}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {conditionCountData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>

        <ChartContainer
          title="Average RSRP and RSRQ by Condition"
          subtitle="Metric averages calculated per condition"
          icon={BarChart3}
        >
          {conditionMetricData.length === 0 ? (
            <EmptyState message="RSRP/RSRQ values are not available in current logs" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={conditionMetricData} margin={CHART_CONFIG.margin}>
                <CartesianGrid {...CHART_CONFIG.grid} />
                <XAxis dataKey="condition" tick={{ fill: "#9CA3AF", fontSize: 12 }} />
                <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    ...CHART_CONFIG.tooltip,
                    backgroundColor: "#020617",
                    border: "1px solid #334155",
                  }}
                  labelStyle={{ color: "#FFFFFF" }}
                  itemStyle={{ color: "#FFFFFF" }}
                  formatter={(value, key) => [toMetricDisplay(value), String(key).toUpperCase()]}
                />
                <Bar dataKey="rsrp" name="RSRP" fill={METRIC_COLORS.rsrp} radius={[8, 8, 0, 0]} />
                <Bar dataKey="rsrq" name="RSRQ" fill={METRIC_COLORS.rsrq} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>
      </div>

      {selectedCondition === "delta" && (
        <>
          <ChartContainer
            title="Delta Metrics (Optimized - Baseline)"
            subtitle="Positive values mean optimized is higher"
            icon={BarChart3}
          >
            {deltaMetricsData.every((entry) => !Number.isFinite(entry.delta)) ? (
              <EmptyState message="Need both baseline and optimized rows to compute delta" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={deltaMetricsData} margin={CHART_CONFIG.margin}>
                  <CartesianGrid {...CHART_CONFIG.grid} />
                  <XAxis dataKey="metric" tick={{ fill: "#9CA3AF", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      ...CHART_CONFIG.tooltip,
                      backgroundColor: "#020617",
                      border: "1px solid #334155",
                    }}
                    labelStyle={{ color: "#FFFFFF" }}
                    itemStyle={{ color: "#FFFFFF" }}
                    formatter={(value) => [toMetricDisplay(value), "Delta"]}
                  />
                  <Bar dataKey="delta" radius={[8, 8, 0, 0]}>
                    {deltaMetricsData.map((entry) => (
                      <Cell
                        key={entry.metric}
                        fill={Number(entry.delta) >= 0 ? "#16a34a" : "#dc2626"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartContainer>

          <ChartContainer
            title="RSRP CDF (Baseline vs Optimized)"
            subtitle={
              lteGridEnabled
                ? "Reverse CDF from dominant grid values (percentage >= value)"
                : "Reverse CDF: percentage of points >= value"
            }
            icon={BarChart3}
          >
            {cdfRsrpData.length === 0 ? (
              <EmptyState message="No RSRP values available for CDF" />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={cdfRsrpData} margin={CHART_CONFIG.margin}>
                  <CartesianGrid {...CHART_CONFIG.grid} />
                  <XAxis
                    dataKey="value"
                    reversed
                    tickFormatter={(value) => {
                      const numericValue = toFiniteNumber(value);
                      return Number.isFinite(numericValue)
                        ? numericValue.toFixed(2)
                        : String(value ?? "");
                    }}
                    tick={{ fill: "#9CA3AF", fontSize: 12 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "#9CA3AF", fontSize: 12 }}
                    label={{ value: "Reverse CDF %", angle: -90, position: "insideLeft", fill: "#9CA3AF" }}
                  />
                  <Tooltip
                    contentStyle={{
                      ...CHART_CONFIG.tooltip,
                      backgroundColor: "#020617",
                      border: "1px solid #334155",
                    }}
                    labelStyle={{ color: "#FFFFFF" }}
                    itemStyle={{ color: "#FFFFFF" }}
                    labelFormatter={(value) => {
                      const numericValue = toFiniteNumber(value);
                      return Number.isFinite(numericValue)
                        ? `RSRP ${numericValue.toFixed(2)}`
                        : `RSRP ${String(value ?? "")}`;
                    }}
                    formatter={(value, name) => [
                      `${toMetricDisplay(value)}%`,
                      String(name).toUpperCase(),
                    ]}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="baseline" name="Baseline" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="optimized" name="Optimized" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartContainer>
        </>
      )}
    </div>
  );
};

export default ConditionLogsTab;
