import ExcelJS from "exceljs";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import html2canvas from "html2canvas";
import toast from "react-hot-toast";

// ============ Constants ============
const EXCEL_STYLES = {
  headerFill: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A5F" },
  },
  headerFont: {
    bold: true,
    color: { argb: "FFFFFFFF" },
    size: 11,
  },
  titleFont: {
    bold: true,
    size: 14,
    color: { argb: "FF1E3A5F" },
  },
  sectionFont: {
    bold: true,
    size: 12,
    color: { argb: "FF2E5A8F" },
  },
  borderStyle: {
    top: { style: "thin", color: { argb: "FFD0D0D0" } },
    left: { style: "thin", color: { argb: "FFD0D0D0" } },
    bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
    right: { style: "thin", color: { argb: "FFD0D0D0" } },
  },
  alternateRowFill: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF5F7FA" },
  },
};

const CHART_CAPTURES = [
  { key: "distribution", name: "signal-distribution" },
  { key: "tech", name: "technology-breakdown" },
  { key: "band", name: "band-distribution" },
  { key: "operator", name: "operator-comparison" },
  { key: "pciColorLegend", name: "pci-color-legend" },
  { key: "providerPerf", name: "provider-performance" },
  { key: "speed", name: "speed-analysis" },
  { key: "throughputTimeline", name: "throughput-timeline" },
  { key: "jitterLatency", name: "jitter-latency" },
];

// ============ Helper Functions ============
const getTimestamp = () => 
  new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);

const formatNumber = (value, decimals = 2) => {
  if (value == null || isNaN(value)) return "N/A";
  return Number(value).toFixed(decimals);
};

const calculateStats = (arr) => {
  if (!arr?.length) return { avg: "N/A", min: "N/A", max: "N/A", count: 0 };
  const validValues = arr.filter((v) => v != null && !isNaN(v));
  if (!validValues.length) return { avg: "N/A", min: "N/A", max: "N/A", count: 0 };
  
  const sum = validValues.reduce((a, b) => a + b, 0);
  return {
    avg: (sum / validValues.length).toFixed(2),
    min: Math.min(...validValues).toFixed(2),
    max: Math.max(...validValues).toFixed(2),
    count: validValues.length,
  };
};

const calculateAverage = (arr) => {
  const stats = calculateStats(arr);
  return stats.avg;
};

const safePercentage = (value, total) => {
  if (!total || total === 0) return "0.00%";
  return `${((value / total) * 100).toFixed(2)}%`;
};

// ============ Worksheet Styling Helpers ============
const applyHeaderStyle = (row) => {
  row.eachCell((cell) => {
    cell.fill = EXCEL_STYLES.headerFill;
    cell.font = EXCEL_STYLES.headerFont;
    cell.border = EXCEL_STYLES.borderStyle;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  row.height = 25;
};

const applyDataRowStyle = (row, isAlternate = false) => {
  row.eachCell((cell) => {
    cell.border = EXCEL_STYLES.borderStyle;
    cell.alignment = { vertical: "middle", horizontal: "left" };
    if (isAlternate) {
      cell.fill = EXCEL_STYLES.alternateRowFill;
    }
  });
};

const autoFitColumns = (worksheet, minWidth = 10, maxWidth = 50) => {
  worksheet.columns.forEach((column) => {
    let maxLength = minWidth;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const cellLength = cell.value ? String(cell.value).length : 0;
      maxLength = Math.min(Math.max(maxLength, cellLength + 2), maxWidth);
    });
    column.width = maxLength;
  });
};

const addDataTable = (worksheet, data, startRow = 1) => {
  if (!data?.length) return startRow;

  const headers = Object.keys(data[0]);
  
  // Add headers
  const headerRow = worksheet.getRow(startRow);
  headers.forEach((header, index) => {
    headerRow.getCell(index + 1).value = header;
  });
  applyHeaderStyle(headerRow);

  // Add data rows
  data.forEach((item, rowIndex) => {
    const row = worksheet.getRow(startRow + rowIndex + 1);
    headers.forEach((header, colIndex) => {
      row.getCell(colIndex + 1).value = item[header];
    });
    applyDataRowStyle(row, rowIndex % 2 === 1);
  });

  return startRow + data.length + 1;
};

// ============ Sheet Creation Functions ============
const createSummarySheet = (workbook, params) => {
  const {
    projectId,
    sessionIds,
    selectedMetric,
    totalLocations,
    filteredCount,
    stats,
    ioSummary,
    polygonStats,
    siteData,
  } = params;

  const worksheet = workbook.addWorksheet("Summary", {
    properties: { tabColor: { argb: "FF1E3A5F" } },
  });

  let rowNum = 1;

  // Title
  worksheet.mergeCells(`A${rowNum}:D${rowNum}`);
  const titleCell = worksheet.getCell(`A${rowNum}`);
  titleCell.value = "📊 ANALYTICS EXPORT REPORT";
  titleCell.font = { ...EXCEL_STYLES.titleFont, size: 16 };
  titleCell.alignment = { horizontal: "center" };
  rowNum += 2;

  // Helper to add section
  const addSection = (title, items) => {
    const sectionRow = worksheet.getRow(rowNum);
    worksheet.mergeCells(`A${rowNum}:D${rowNum}`);
    sectionRow.getCell(1).value = title;
    sectionRow.getCell(1).font = EXCEL_STYLES.sectionFont;
    rowNum++;

    items.forEach(([label, value]) => {
      const row = worksheet.getRow(rowNum);
      row.getCell(1).value = label;
      row.getCell(2).value = value;
      row.getCell(1).font = { bold: true };
      rowNum++;
    });
    rowNum++;
  };

  // General Info
  addSection("📋 GENERAL INFORMATION", [
    ["Generated:", new Date().toLocaleString()],
    ["Project ID:", projectId],
    ["Session IDs:", sessionIds?.join(", ") || "N/A"],
  ]);

  // Data Summary
  addSection("📈 DATA SUMMARY", [
    ["Total Samples:", totalLocations?.toLocaleString() || 0],
    ["Filtered Samples:", filteredCount?.toLocaleString() || 0],
    ["Selected Metric:", selectedMetric?.toUpperCase() || "N/A"],
  ]);

  // IO Summary
  if (ioSummary) {
    addSection("📍 INDOOR/OUTDOOR DISTRIBUTION", [
      ["Indoor Samples:", ioSummary.indoor],
      ["Outdoor Samples:", ioSummary.outdoor],
      ["Total:", ioSummary.total],
      ["Indoor %:", safePercentage(ioSummary.indoor, ioSummary.total)],
      ["Outdoor %:", safePercentage(ioSummary.outdoor, ioSummary.total)],
    ]);
  }

  // Metric Statistics
  if (stats) {
    addSection("📊 METRIC STATISTICS", [
      ["Average:", stats.avg],
      ["Minimum:", stats.min],
      ["Maximum:", stats.max],
      ["Median:", stats.median],
      ["Sample Count:", stats.count],
    ]);
  }

  // Polygon Statistics
  if (polygonStats) {
    addSection("🗺️ POLYGON STATISTICS", [
      ["Total Polygons:", polygonStats.total],
      ["Polygons with Data:", polygonStats.withData],
      ["Total Points:", polygonStats.totalPoints],
      ["Average Points per Polygon:", polygonStats.avgPoints],
    ]);
  }

  // Site Information
  if (siteData?.length > 0) {
    addSection("📡 SITE INFORMATION", [
      ["Total Sites:", siteData.length],
    ]);
  }

  autoFitColumns(worksheet, 15, 60);
};

const createLocationSheet = (workbook, locations) => {
  if (!locations?.length) return;

  const worksheet = workbook.addWorksheet("Location Data", {
    properties: { tabColor: { argb: "FF28A745" } },
  });

  const columns = [
    { header: "Sample #", key: "sampleNo", width: 10 },
    { header: "Latitude", key: "lat", width: 12 },
    { header: "Longitude", key: "lng", width: 12 },
    { header: "Operator", key: "operator", width: 15 },
    { header: "Provider", key: "provider", width: 15 },
    { header: "Technology", key: "technology", width: 12 },
    { header: "Band", key: "band", width: 10 },
    { header: "PCI", key: "pci", width: 8 },
    { header: "Cell ID", key: "cellId", width: 15 },
    { header: "RSRP (dBm)", key: "rsrp", width: 12 },
    { header: "RSRQ (dB)", key: "rsrq", width: 12 },
    { header: "SINR (dB)", key: "sinr", width: 12 },
    { header: "DL Throughput (Mbps)", key: "dlThpt", width: 18 },
    { header: "UL Throughput (Mbps)", key: "ulThpt", width: 18 },
    { header: "MOS", key: "mos", width: 8 },
    { header: "Latency (ms)", key: "latency", width: 12 },
    { header: "Jitter (ms)", key: "jitter", width: 12 },
    { header: "Speed (m/s)", key: "speedMs", width: 12 },
    { header: "Speed (km/h)", key: "speedKmh", width: 12 },
    { header: "Timestamp", key: "timestamp", width: 20 },
  ];

  worksheet.columns = columns;

  // Style header row
  applyHeaderStyle(worksheet.getRow(1));

  // Add data with chunking for large datasets
  const CHUNK_SIZE = 1000;
  for (let i = 0; i < locations.length; i += CHUNK_SIZE) {
    const chunk = locations.slice(i, i + CHUNK_SIZE);
    chunk.forEach((loc, index) => {
      const globalIndex = i + index;
      const row = worksheet.addRow({
        sampleNo: globalIndex + 1,
        lat: formatNumber(loc.lat, 6),
        lng: formatNumber(loc.lng, 6),
        operator: loc.operator || "N/A",
        provider: loc.provider || "N/A",
        technology: loc.technology || "N/A",
        band: loc.band || "N/A",
        pci: loc.pci || "N/A",
        cellId: loc.nodeb_id || "N/A",
        rsrp: formatNumber(loc.rsrp),
        rsrq: formatNumber(loc.rsrq),
        sinr: formatNumber(loc.sinr),
        dlThpt: formatNumber(loc.dl_thpt),
        ulThpt: formatNumber(loc.ul_thpt),
        mos: formatNumber(loc.mos),
        latency: formatNumber(loc.latency),
        jitter: formatNumber(loc.jitter),
        speedMs: formatNumber(loc.speed),
        speedKmh: loc.speed ? formatNumber(loc.speed * 3.6) : "N/A",
        timestamp: loc.timestamp || "N/A",
      });
      applyDataRowStyle(row, globalIndex % 2 === 1);
    });
  }

  // Freeze header row
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
};

const createApplicationSheet = (workbook, appSummary) => {
  if (!appSummary || Object.keys(appSummary).length === 0) return;

  const worksheet = workbook.addWorksheet("Application Performance", {
    properties: { tabColor: { argb: "FF6F42C1" } },
  });

  const data = [];
  Object.entries(appSummary).forEach(([sessionId, apps]) => {
    Object.entries(apps).forEach(([appName, metrics]) => {
      data.push({
        "Session ID": sessionId,
        "Application": metrics.appName || appName,
        "Duration (HH:MM:SS)": metrics.durationHHMMSS || "N/A",
        "Samples": metrics.sampleCount || 0,
        "MOS Score": formatNumber(metrics.avgMos),
        "Avg RSRP (dBm)": formatNumber(metrics.avgRsrp),
        "Avg RSRQ (dB)": formatNumber(metrics.avgRsrq),
        "Avg SINR (dB)": formatNumber(metrics.avgSinr),
        "Avg DL (Mbps)": formatNumber(metrics.avgDlTptMbps),
        "Avg UL (Mbps)": formatNumber(metrics.avgUlTptMbps),
        "Avg Latency (ms)": formatNumber(metrics.avgLatency),
        "Avg Jitter (ms)": formatNumber(metrics.avgJitter),
        "Avg Packet Loss (%)": formatNumber(metrics.avgPacketLoss),
        "First Used": metrics.firstUsedAt || "N/A",
        "Last Used": metrics.lastUsedAt || "N/A",
      });
    });
  });

  if (data.length > 0) {
    addDataTable(worksheet, data);
    autoFitColumns(worksheet);
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
  }
};

const createDurationSheet = (workbook, duration) => {
  if (!duration) return;

  const worksheet = workbook.addWorksheet("Session Duration", {
    properties: { tabColor: { argb: "FFFD7E14" } },
  });

  const data = [
    ["📅 Session Duration Information", ""],
    ["", ""],
    ["Total Duration:", duration.total_duration || "N/A"],
    ["Start Time:", duration.start_time || "N/A"],
    ["End Time:", duration.end_time || "N/A"],
  ];

  data.forEach((row, index) => {
    const wsRow = worksheet.getRow(index + 1);
    wsRow.getCell(1).value = row[0];
    wsRow.getCell(2).value = row[1];
    
    if (index === 0) {
      wsRow.getCell(1).font = EXCEL_STYLES.titleFont;
    } else if (row[0] && row[0] !== "") {
      wsRow.getCell(1).font = { bold: true };
    }
  });

  autoFitColumns(worksheet, 20, 40);
};

const createProviderStatsSheet = (workbook, locations) => {
  if (!locations?.length) return;

  const worksheet = workbook.addWorksheet("Provider Statistics", {
    properties: { tabColor: { argb: "FF17A2B8" } },
  });

  const providerStats = aggregateByField(locations, "provider", [
    "rsrp", "rsrq", "sinr", "dl_thpt", "ul_thpt", "mos", "latency"
  ]);

  const data = Object.entries(providerStats)
    .filter(([name]) => name !== "Unknown")
    .map(([provider, stats]) => ({
      "Provider": provider,
      "Sample Count": stats.count,
      "Avg RSRP (dBm)": calculateAverage(stats.rsrp),
      "Avg RSRQ (dB)": calculateAverage(stats.rsrq),
      "Avg SINR (dB)": calculateAverage(stats.sinr),
      "Avg DL (Mbps)": calculateAverage(stats.dl_thpt),
      "Avg UL (Mbps)": calculateAverage(stats.ul_thpt),
      "Avg MOS": calculateAverage(stats.mos),
      "Avg Latency (ms)": calculateAverage(stats.latency),
    }));

  if (data.length > 0) {
    addDataTable(worksheet, data);
    autoFitColumns(worksheet);
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
  }
};

const createTechnologyStatsSheet = (workbook, locations) => {
  if (!locations?.length) return;

  const worksheet = workbook.addWorksheet("Technology Statistics", {
    properties: { tabColor: { argb: "FF20C997" } },
  });

  const techStats = aggregateByField(locations, "technology", [
    "rsrp", "sinr", "dl_thpt", "ul_thpt"
  ]);

  const data = Object.entries(techStats)
    .filter(([name]) => name !== "Unknown")
    .map(([technology, stats]) => ({
      "Technology": technology,
      "Sample Count": stats.count,
      "Avg RSRP (dBm)": calculateAverage(stats.rsrp),
      "Avg SINR (dB)": calculateAverage(stats.sinr),
      "Avg DL (Mbps)": calculateAverage(stats.dl_thpt),
      "Avg UL (Mbps)": calculateAverage(stats.ul_thpt),
    }));

  if (data.length > 0) {
    addDataTable(worksheet, data);
    autoFitColumns(worksheet);
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
  }
};

const createBandAnalysisSheet = (workbook, locations) => {
  if (!locations?.length) return;

  const worksheet = workbook.addWorksheet("Band Analysis", {
    properties: { tabColor: { argb: "FFFFC107" } },
  });

  const bandStats = {};
  locations.forEach((loc) => {
    const band = loc.band || "Unknown";
    if (!bandStats[band]) {
      bandStats[band] = {
        count: 0,
        rsrp: [],
        dl_thpt: [],
        pcis: new Set(),
        nodebs: new Set(),
      };
    }

    bandStats[band].count++;
    if (loc.rsrp != null) bandStats[band].rsrp.push(loc.rsrp);
    if (loc.dl_thpt != null) bandStats[band].dl_thpt.push(parseFloat(loc.dl_thpt));
    if (loc.pci != null) bandStats[band].pcis.add(loc.pci);
    if (loc.nodeb_id != null) bandStats[band].nodebs.add(loc.nodeb_id);
  });

  const data = Object.entries(bandStats)
    .filter(([name]) => name !== "Unknown")
    .map(([band, stats]) => ({
      "Band": band,
      "Sample Count": stats.count,
      "Unique PCIs": stats.pcis.size,
      "Unique Cells": stats.nodebs.size,
      "Avg RSRP (dBm)": calculateAverage(stats.rsrp),
      "Avg DL (Mbps)": calculateAverage(stats.dl_thpt),
      "PCI List": Array.from(stats.pcis).slice(0, 20).join(", ") + 
                  (stats.pcis.size > 20 ? "..." : ""),
    }));

  if (data.length > 0) {
    addDataTable(worksheet, data);
    autoFitColumns(worksheet);
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
  }
};

const createPCIAnalysisSheet = (workbook, locations) => {
  if (!locations?.length) return;

  const worksheet = workbook.addWorksheet("PCI Analysis", {
    properties: { tabColor: { argb: "FFDC3545" } },
  });

  const pciStats = {};
  locations.forEach((loc) => {
    const pci = loc.pci || "Unknown";
    if (!pciStats[pci]) {
      pciStats[pci] = {
        count: 0,
        rsrp: [],
        rsrq: [],
        sinr: [],
        mos: [],
        providers: new Set(),
        bands: new Set(),
        nodebs: new Set(),
      };
    }

    pciStats[pci].count++;
    if (loc.rsrp != null) pciStats[pci].rsrp.push(loc.rsrp);
    if (loc.rsrq != null) pciStats[pci].rsrq.push(loc.rsrq);
    if (loc.sinr != null) pciStats[pci].sinr.push(loc.sinr);
    if (loc.mos != null) pciStats[pci].mos.push(loc.mos);
    if (loc.provider) pciStats[pci].providers.add(loc.provider);
    if (loc.band) pciStats[pci].bands.add(loc.band);
    if (loc.nodeb_id != null) pciStats[pci].nodebs.add(loc.nodeb_id);
  });

  const data = Object.entries(pciStats)
    .filter(([name]) => name !== "Unknown")
    .map(([pci, stats]) => ({
      "PCI": pci,
      "Sample Count": stats.count,
      "Unique Cells": stats.nodebs.size,
      "Providers": Array.from(stats.providers).join(", "),
      "Bands": Array.from(stats.bands).join(", "),
      "Cell IDs": Array.from(stats.nodebs).slice(0, 10).join(", ") +
                  (stats.nodebs.size > 10 ? "..." : ""),
      "Avg RSRP (dBm)": calculateAverage(stats.rsrp),
      "Avg RSRQ (dB)": calculateAverage(stats.rsrq),
      "Avg SINR (dB)": calculateAverage(stats.sinr),
      "Avg MOS": calculateAverage(stats.mos),
    }));

  if (data.length > 0) {
    addDataTable(worksheet, data);
    autoFitColumns(worksheet);
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
  }
};

// ============ Aggregation Helper ============
const aggregateByField = (locations, fieldName, metricsToAggregate) => {
  const stats = {};

  locations.forEach((loc) => {
    const key = loc[fieldName] || "Unknown";
    if (!stats[key]) {
      stats[key] = { count: 0 };
      metricsToAggregate.forEach((metric) => {
        stats[key][metric] = [];
      });
    }

    stats[key].count++;
    metricsToAggregate.forEach((metric) => {
      const value = loc[metric];
      if (value != null) {
        stats[key][metric].push(parseFloat(value));
      }
    });
  });

  return stats;
};

// ============ Excel Workbook Creation ============
const createExcelWorkbook = async (params) => {
  const workbook = new ExcelJS.Workbook();
  
  // Workbook properties
  workbook.creator = "Network Analytics Dashboard";
  workbook.lastModifiedBy = "Analytics Export";
  workbook.created = new Date();
  workbook.modified = new Date();

  // Create all sheets
  createSummarySheet(workbook, params);
  createLocationSheet(workbook, params.locations);
  createApplicationSheet(workbook, params.appSummary);
  createDurationSheet(workbook, params.duration);
  createProviderStatsSheet(workbook, params.locations);
  createTechnologyStatsSheet(workbook, params.locations);
  createBandAnalysisSheet(workbook, params.locations);
  createPCIAnalysisSheet(workbook, params.locations);

  return workbook;
};

// ============ Chart Capture ============
const captureAllCharts = async (zip, chartRefs, timestamp) => {
  if (!chartRefs) return;

  const chartFolder = zip.folder("charts");

  const capturePromises = CHART_CAPTURES.map(async ({ key, name }) => {
    const ref = chartRefs[key];
    if (!ref?.current) return;

    try {
      const canvas = await html2canvas(ref.current, {
        backgroundColor: "#0f172a",
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
      });

      return new Promise((resolve) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              chartFolder.file(`${name}-${timestamp}.png`, blob);
            }
            resolve();
          },
          "image/png",
          1.0
        );
      });
    } catch (error) {
      console.warn(`Failed to capture ${name}:`, error.message);
    }
  });

  await Promise.allSettled(capturePromises);
};

// ============ README Generator ============
const generateReadme = ({
  projectId,
  sessionIds,
  timestamp,
  totalLocations,
  filteredCount,
  selectedMetric,
}) => `
╔════════════════════════════════════════════════════════════════╗
║           ANALYTICS EXPORT REPORT - README                     ║
╚════════════════════════════════════════════════════════════════╝

📅 Generated: ${new Date().toLocaleString()}
🆔 Project ID: ${projectId}
🔢 Session IDs: ${sessionIds?.join(", ") || "N/A"}

═══════════════════════════════════════════════════════════════

📊 DATA SUMMARY
---------------
• Total Samples: ${totalLocations?.toLocaleString() || 0}
• Filtered Samples: ${filteredCount?.toLocaleString() || 0}
• Selected Metric: ${selectedMetric?.toUpperCase() || "N/A"}

═══════════════════════════════════════════════════════════════

📁 PACKAGE CONTENTS
-------------------

1. EXCEL FILE (analytics-data-${timestamp}.xlsx)
   ├─ Summary: Overview and key statistics
   ├─ Location Data: Complete dataset with GPS coordinates
   ├─ Application Performance: App-wise metrics and QoE
   ├─ Session Duration: Timing information
   ├─ Provider Statistics: Performance by network provider
   ├─ Technology Statistics: 4G/5G/LTE breakdown
   ├─ Band Analysis: Frequency band distribution
   └─ PCI Analysis: Physical Cell ID statistics

2. CHARTS FOLDER
   ├─ signal-distribution-${timestamp}.png
   ├─ technology-breakdown-${timestamp}.png
   ├─ band-distribution-${timestamp}.png
   ├─ operator-comparison-${timestamp}.png
   ├─ pci-color-legend-${timestamp}.png
   ├─ provider-performance-${timestamp}.png
   ├─ speed-analysis-${timestamp}.png
   ├─ throughput-timeline-${timestamp}.png
   └─ jitter-latency-${timestamp}.png

═══════════════════════════════════════════════════════════════

📋 METRICS EXPLANATION
----------------------

Signal Strength:
• RSRP: Signal strength in dBm (Excellent: > -80, Poor: < -100)
• RSRQ: Signal quality in dB (Excellent: > -10, Poor: < -20)
• SINR: Signal clarity in dB (Excellent: > 20, Poor: < 0)

Quality of Experience:
• MOS: Voice quality rating 1-5 (Excellent: 4.0-5.0, Poor: 1.0-2.0)
• Latency: Network delay in ms (Excellent: < 50, Poor: > 150)

═══════════════════════════════════════════════════════════════

💡 USAGE TIPS
-------------
1. Open the Excel file for detailed data analysis
2. Use pivot tables for custom aggregations
3. Charts are high-resolution (2x scale) for presentations
4. All timestamps are in local timezone
5. "N/A" indicates missing or unavailable data

═══════════════════════════════════════════════════════════════

Generated by Network Analytics Dashboard v2.0
© ${new Date().getFullYear()} All rights reserved
`;

// ============ Main Export Functions ============
/**
 * Main export function for analytics data
 */
export const exportAnalytics = async ({
  locations,
  stats,
  duration,
  appSummary,
  ioSummary,
  projectId,
  sessionIds = [],
  chartRefs,
  selectedMetric,
  totalLocations = 0,
  filteredCount = 0,
  polygonStats,
  siteData,
}) => {
  const toastId = "export";
  
  try {
    toast.loading("Preparing comprehensive export...", { id: toastId });

    const zip = new JSZip();
    const timestamp = getTimestamp();

    // Create Excel workbook
    toast.loading("Generating Excel data...", { id: toastId });
    const workbook = await createExcelWorkbook({
      locations,
      stats,
      duration,
      appSummary,
      ioSummary,
      projectId,
      sessionIds,
      selectedMetric,
      totalLocations,
      filteredCount,
      polygonStats,
      siteData,
    });

    // Write workbook to buffer
    const excelBuffer = await workbook.xlsx.writeBuffer();
    zip.file(`analytics-data-${timestamp}.xlsx`, excelBuffer);

    // Capture all charts
    toast.loading("Capturing charts...", { id: toastId });
    await captureAllCharts(zip, chartRefs, timestamp);

    // Add README
    const readme = generateReadme({
      projectId,
      sessionIds,
      timestamp,
      totalLocations,
      filteredCount,
      selectedMetric,
    });
    zip.file("README.txt", readme);

    // Generate and download ZIP
    toast.loading("Creating ZIP archive...", { id: toastId });
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    saveAs(zipBlob, `analytics-export-${timestamp}.zip`);

    toast.success("Export completed successfully!", { id: toastId });
  } catch (error) {
    console.error("Export error:", error);
    toast.error(`Export failed: ${error.message}`, { id: toastId });
    throw error;
  }
};

/**
 * Export individual chart
 */
export const exportSingleChart = async (chartRef, chartName) => {
  const toastId = "chart-export";
  
  try {
    if (!chartRef?.current) {
      toast.error("Chart not available for export");
      return;
    }

    toast.loading("Capturing chart...", { id: toastId });

    const canvas = await html2canvas(chartRef.current, {
      backgroundColor: "#0f172a",
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true,
    });

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/png", 1.0);
    });

    if (blob) {
      const timestamp = getTimestamp();
      saveAs(blob, `${chartName}-${timestamp}.png`);
      toast.success("Chart exported successfully!", { id: toastId });
    } else {
      throw new Error("Failed to create image blob");
    }
  } catch (error) {
    console.error("Chart export error:", error);
    toast.error("Failed to export chart", { id: toastId });
  }
};

/**
 * Export only Excel data (no charts)
 */
export const exportExcelOnly = async (params) => {
  const toastId = "excel-export";
  
  try {
    toast.loading("Generating Excel file...", { id: toastId });

    const workbook = await createExcelWorkbook(params);
    const timestamp = getTimestamp();

    const buffer = await workbook.xlsx.writeBuffer();
    
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(blob, `analytics-data-${timestamp}.xlsx`);

    toast.success("Excel file exported!", { id: toastId });
  } catch (error) {
    console.error("Excel export error:", error);
    toast.error("Failed to export Excel file", { id: toastId });
    throw error;
  }
};

// ============ Default Export ============
export default {
  exportAnalytics,
  exportSingleChart,
  exportExcelOnly,
};