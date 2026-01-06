import JSZip from "jszip";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import toast from "react-hot-toast";

/**
 * Main export function for analytics data
 * @param {Object} params - Export parameters
 */
export const exportAnalytics = async ({
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
}) => {
  try {
    toast.loading("Preparing comprehensive export...", { id: "export" });

    const zip = new JSZip();
    const timestamp = getTimestamp();

    // Create Excel workbook
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

    // Add Excel file to ZIP
    const excelBuffer = XLSX.write(workbook, { 
      bookType: "xlsx", 
      type: "array" 
    });
    zip.file(`analytics-data-${timestamp}.xlsx`, excelBuffer);

    // Capture all charts
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
    const zipBlob = await zip.generateAsync({ 
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
    
    saveAs(zipBlob, `analytics-export-${timestamp}.zip`);

    toast.success("Comprehensive export completed!", { id: "export" });
  } catch (error) {
    console.error("Export error:", error);
    toast.error(`Export failed: ${error.message}`, { id: "export" });
  }
};

/**
 * Create Excel workbook with all data sheets
 */
const createExcelWorkbook = async ({
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
}) => {
  const wb = XLSX.utils.book_new();

  // 1. Summary Sheet
  const summarySheet = createSummarySheet({
    projectId,
    sessionIds,
    selectedMetric,
    totalLocations,
    filteredCount,
    stats,
    ioSummary,
    polygonStats,
    siteData,
  });
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  // 2. Location Data Sheet
  if (locations?.length > 0) {
    const locationSheet = createLocationSheet(locations);
    XLSX.utils.book_append_sheet(wb, locationSheet, "Location Data");
  }

  // 3. Application Performance Sheet
  if (appSummary && Object.keys(appSummary).length > 0) {
    const appSheet = createApplicationSheet(appSummary);
    XLSX.utils.book_append_sheet(wb, appSheet, "Application Performance");
  }

  // 4. Duration Sheet
  if (duration) {
    const durationSheet = createDurationSheet(duration);
    XLSX.utils.book_append_sheet(wb, durationSheet, "Session Duration");
  }

  // 5. Statistics by Provider
  if (locations?.length > 0) {
    const providerSheet = createProviderStatsSheet(locations);
    XLSX.utils.book_append_sheet(wb, providerSheet, "Provider Statistics");
  }

  // 6. Statistics by Technology
  if (locations?.length > 0) {
    const techSheet = createTechnologyStatsSheet(locations);
    XLSX.utils.book_append_sheet(wb, techSheet, "Technology Statistics");
  }

  // 7. Band Analysis
  if (locations?.length > 0) {
    const bandSheet = createBandAnalysisSheet(locations);
    XLSX.utils.book_append_sheet(wb, bandSheet, "Band Analysis");
  }

  // 8. PCI Analysis
  if (locations?.length > 0) {
    const pciSheet = createPCIAnalysisSheet(locations);
    XLSX.utils.book_append_sheet(wb, pciSheet, "PCI Analysis");
  }

  return wb;
};

/**
 * Create Summary Sheet
 */
const createSummarySheet = ({
  projectId,
  sessionIds,
  selectedMetric,
  totalLocations,
  filteredCount,
  stats,
  ioSummary,
  polygonStats,
  siteData,
}) => {
  const data = [
    ["📊 ANALYTICS EXPORT REPORT"],
    [""],
    ["Generated:", new Date().toLocaleString()],
    ["Project ID:", projectId],
    ["Session IDs:", sessionIds.join(", ")],
    [""],
    ["📈 DATA SUMMARY"],
    ["Total Samples:", totalLocations],
    ["Filtered Samples:", filteredCount],
    ["Selected Metric:", selectedMetric?.toUpperCase() || "N/A"],
    [""],
  ];

  if (ioSummary) {
    data.push(
      ["📍 INDOOR/OUTDOOR DISTRIBUTION"],
      ["Indoor Samples:", ioSummary.indoor],
      ["Outdoor Samples:", ioSummary.outdoor],
      ["Total:", ioSummary.total],
      ["Indoor %:", `${((ioSummary.indoor / ioSummary.total) * 100).toFixed(2)}%`],
      ["Outdoor %:", `${((ioSummary.outdoor / ioSummary.total) * 100).toFixed(2)}%`],
      [""]
    );
  }

  if (stats) {
    data.push(
      ["📊 METRIC STATISTICS"],
      ["Average:", stats.avg],
      ["Minimum:", stats.min],
      ["Maximum:", stats.max],
      ["Median:", stats.median],
      ["Sample Count:", stats.count],
      [""]
    );
  }

  if (polygonStats) {
    data.push(
      ["🗺️ POLYGON STATISTICS"],
      ["Total Polygons:", polygonStats.total],
      ["Polygons with Data:", polygonStats.withData],
      ["Total Points:", polygonStats.totalPoints],
      ["Average Points per Polygon:", polygonStats.avgPoints],
      [""]
    );
  }

  if (siteData?.length > 0) {
    data.push(
      ["📡 SITE INFORMATION"],
      ["Total Sites:", siteData.length],
      [""]
    );
  }

  return XLSX.utils.aoa_to_sheet(data);
};

/**
 * Create Location Data Sheet
 */
const createLocationSheet = (locations) => {
  const data = locations.map((loc, index) => ({
    "Sample #": index + 1,
    "Latitude": loc.lat?.toFixed(6) || "N/A",
    "Longitude": loc.lng?.toFixed(6) || "N/A",
    "Operator": loc.operator || "N/A",
    "Provider": loc.provider || "N/A",
    "Technology": loc.technology || "N/A",
    "Band": loc.band || "N/A",
    "PCI": loc.pci || "N/A",
    "Cell ID": loc.nodeb_id || "N/A",
    "RSRP (dBm)": loc.rsrp?.toFixed(2) || "N/A",
    "RSRQ (dB)": loc.rsrq?.toFixed(2) || "N/A",
    "SINR (dB)": loc.sinr?.toFixed(2) || "N/A",
    "DL Throughput (Mbps)": loc.dl_thpt?.toFixed(2) || "N/A",
    "UL Throughput (Mbps)": loc.ul_thpt?.toFixed(2) || "N/A",
    "MOS": loc.mos?.toFixed(2) || "N/A",
    "Latency (ms)": loc.latency?.toFixed(2) || "N/A",
    "Jitter (ms)": loc.jitter?.toFixed(2) || "N/A",
    "Speed (m/s)": loc.speed?.toFixed(2) || "N/A",
    "Speed (km/h)": loc.speed ? (loc.speed * 3.6).toFixed(2) : "N/A",
    "Timestamp": loc.timestamp || "N/A",
  }));

  return XLSX.utils.json_to_sheet(data);
};

/**
 * Create Application Performance Sheet
 */
const createApplicationSheet = (appSummary) => {
  const data = [];

  Object.entries(appSummary).forEach(([sessionId, apps]) => {
    Object.entries(apps).forEach(([appName, metrics]) => {
      data.push({
        "Session ID": sessionId,
        "Application": metrics.appName || appName,
        "Duration (HH:MM:SS)": metrics.durationHHMMSS || "N/A",
        "Samples": metrics.sampleCount || 0,
        "MOS Score": metrics.avgMos?.toFixed(2) || "N/A",
        "Avg RSRP (dBm)": metrics.avgRsrp?.toFixed(2) || "N/A",
        "Avg RSRQ (dB)": metrics.avgRsrq?.toFixed(2) || "N/A",
        "Avg SINR (dB)": metrics.avgSinr?.toFixed(2) || "N/A",
        "Avg DL (Mbps)": metrics.avgDlTptMbps?.toFixed(2) || "N/A",
        "Avg UL (Mbps)": metrics.avgUlTptMbps?.toFixed(2) || "N/A",
        "Avg Latency (ms)": metrics.avgLatency?.toFixed(2) || "N/A",
        "Avg Jitter (ms)": metrics.avgJitter?.toFixed(2) || "N/A",
        "Avg Packet Loss (%)": metrics.avgPacketLoss?.toFixed(2) || "N/A",
        "First Used": metrics.firstUsedAt || "N/A",
        "Last Used": metrics.lastUsedAt || "N/A",
      });
    });
  });

  return XLSX.utils.json_to_sheet(data);
};

/**
 * Create Duration Sheet
 */
const createDurationSheet = (duration) => {
  const data = [
    ["Session Duration Information"],
    [""],
    ["Total Duration:", duration.total_duration || "N/A"],
    ["Start Time:", duration.start_time || "N/A"],
    ["End Time:", duration.end_time || "N/A"],
  ];

  return XLSX.utils.aoa_to_sheet(data);
};

/**
 * Create Provider Statistics Sheet
 */
const createProviderStatsSheet = (locations) => {
  const providerStats = {};

  locations.forEach((loc) => {
    const provider = loc.provider || "Unknown";
    if (!providerStats[provider]) {
      providerStats[provider] = {
        count: 0,
        rsrp: [],
        rsrq: [],
        sinr: [],
        dl: [],
        ul: [],
        mos: [],
        latency: [],
      };
    }

    providerStats[provider].count++;
    if (loc.rsrp != null) providerStats[provider].rsrp.push(loc.rsrp);
    if (loc.rsrq != null) providerStats[provider].rsrq.push(loc.rsrq);
    if (loc.sinr != null) providerStats[provider].sinr.push(loc.sinr);
    if (loc.dl_thpt != null) providerStats[provider].dl.push(parseFloat(loc.dl_thpt));
    if (loc.ul_thpt != null) providerStats[provider].ul.push(parseFloat(loc.ul_thpt));
    if (loc.mos != null) providerStats[provider].mos.push(loc.mos);
    if (loc.latency != null) providerStats[provider].latency.push(loc.latency);
  });

  const data = Object.entries(providerStats)
    .filter(([name]) => name !== "Unknown")
    .map(([provider, stats]) => ({
      Provider: provider,
      "Sample Count": stats.count,
      "Avg RSRP (dBm)": calculateAverage(stats.rsrp),
      "Avg RSRQ (dB)": calculateAverage(stats.rsrq),
      "Avg SINR (dB)": calculateAverage(stats.sinr),
      "Avg DL (Mbps)": calculateAverage(stats.dl),
      "Avg UL (Mbps)": calculateAverage(stats.ul),
      "Avg MOS": calculateAverage(stats.mos),
      "Avg Latency (ms)": calculateAverage(stats.latency),
    }));

  return XLSX.utils.json_to_sheet(data);
};

/**
 * Create Technology Statistics Sheet
 */
const createTechnologyStatsSheet = (locations) => {
  const techStats = {};

  locations.forEach((loc) => {
    const tech = loc.technology || "Unknown";
    if (!techStats[tech]) {
      techStats[tech] = {
        count: 0,
        rsrp: [],
        sinr: [],
        dl: [],
        ul: [],
      };
    }

    techStats[tech].count++;
    if (loc.rsrp != null) techStats[tech].rsrp.push(loc.rsrp);
    if (loc.sinr != null) techStats[tech].sinr.push(loc.sinr);
    if (loc.dl_thpt != null) techStats[tech].dl.push(parseFloat(loc.dl_thpt));
    if (loc.ul_thpt != null) techStats[tech].ul.push(parseFloat(loc.ul_thpt));
  });

  const data = Object.entries(techStats)
    .filter(([name]) => name !== "Unknown")
    .map(([technology, stats]) => ({
      Technology: technology,
      "Sample Count": stats.count,
      "Avg RSRP (dBm)": calculateAverage(stats.rsrp),
      "Avg SINR (dB)": calculateAverage(stats.sinr),
      "Avg DL (Mbps)": calculateAverage(stats.dl),
      "Avg UL (Mbps)": calculateAverage(stats.ul),
    }));

  return XLSX.utils.json_to_sheet(data);
};

/**
 * Create Band Analysis Sheet
 */
const createBandAnalysisSheet = (locations) => {
  const bandStats = {};

  locations.forEach((loc) => {
    const band = loc.band || "Unknown";
    if (!bandStats[band]) {
      bandStats[band] = {
        count: 0,
        rsrp: [],
        dl: [],
        pcis: new Set(),
        nodebs: new Set(),
      };
    }

    bandStats[band].count++;
    if (loc.rsrp != null) bandStats[band].rsrp.push(loc.rsrp);
    if (loc.dl_thpt != null) bandStats[band].dl.push(parseFloat(loc.dl_thpt));
    if (loc.pci != null) bandStats[band].pcis.add(loc.pci);
    if (loc.nodeb_id != null) bandStats[band].nodebs.add(loc.nodeb_id);
  });

  const data = Object.entries(bandStats)
    .filter(([name]) => name !== "Unknown")
    .map(([band, stats]) => ({
      Band: band,
      "Sample Count": stats.count,
      "Unique PCIs": stats.pcis.size,
      "Unique Cells": stats.nodebs.size,
      "Avg RSRP (dBm)": calculateAverage(stats.rsrp),
      "Avg DL (Mbps)": calculateAverage(stats.dl),
      "PCI List": Array.from(stats.pcis).join(", "),
    }));

  return XLSX.utils.json_to_sheet(data);
};

/**
 * Create PCI Analysis Sheet
 */
const createPCIAnalysisSheet = (locations) => {
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
      PCI: pci,
      "Sample Count": stats.count,
      "Unique Cells": stats.nodebs.size,
      "Providers": Array.from(stats.providers).join(", "),
      "Bands": Array.from(stats.bands).join(", "),
      "Cell IDs": Array.from(stats.nodebs).join(", "),
      "Avg RSRP (dBm)": calculateAverage(stats.rsrp),
      "Avg RSRQ (dB)": calculateAverage(stats.rsrq),
      "Avg SINR (dB)": calculateAverage(stats.sinr),
      "Avg MOS": calculateAverage(stats.mos),
    }));

  return XLSX.utils.json_to_sheet(data);
};

/**
 * Capture all chart screenshots
 */
const captureAllCharts = async (zip, chartRefs, timestamp) => {
  const chartFolder = zip.folder("charts");

  const chartCaptures = [
    { ref: chartRefs.distribution, name: "signal-distribution" },
    { ref: chartRefs.tech, name: "technology-breakdown" },
    { ref: chartRefs.band, name: "band-distribution" },
    { ref: chartRefs.operator, name: "operator-comparison" },
    { ref: chartRefs.pciColorLegend, name: "pci-color-legend" },
    { ref: chartRefs.providerPerf, name: "provider-performance" },
    { ref: chartRefs.speed, name: "speed-analysis" },
    { ref: chartRefs.throughputTimeline, name: "throughput-timeline" },
    { ref: chartRefs.jitterLatency, name: "jitter-latency" },
  ];

  const captures = chartCaptures.map(async ({ ref, name }) => {
    if (ref?.current) {
      try {
        const canvas = await html2canvas(ref.current, {
          backgroundColor: "#0f172a",
          scale: 2,
          logging: false,
          useCORS: true,
        });

        const blob = await new Promise((resolve) => {
          canvas.toBlob(resolve, "image/png", 1.0);
        });

        if (blob) {
          chartFolder.file(`${name}-${timestamp}.png`, blob);
        }
      } catch (error) {
        console.error(`Failed to capture ${name}:`, error);
      }
    }
  });

  await Promise.all(captures);
};

/**
 * Generate README file content
 */
const generateReadme = ({
  projectId,
  sessionIds,
  timestamp,
  totalLocations,
  filteredCount,
  selectedMetric,
}) => {
  return `
╔════════════════════════════════════════════════════════════════╗
║           ANALYTICS EXPORT REPORT - README                     ║
╚════════════════════════════════════════════════════════════════╝

📅 Generated: ${new Date().toLocaleString()}
🆔 Project ID: ${projectId}
🔢 Session IDs: ${sessionIds.join(", ")}

═══════════════════════════════════════════════════════════════

📊 DATA SUMMARY
---------------
• Total Samples: ${totalLocations.toLocaleString()}
• Filtered Samples: ${filteredCount.toLocaleString()}
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
• RSRP (Reference Signal Received Power): Signal strength in dBm
  - Excellent: > -80 dBm
  - Good: -80 to -90 dBm
  - Fair: -90 to -100 dBm
  - Poor: < -100 dBm

• RSRQ (Reference Signal Received Quality): Signal quality in dB
  - Excellent: > -10 dB
  - Good: -10 to -15 dB
  - Fair: -15 to -20 dB
  - Poor: < -20 dB

• SINR (Signal to Interference plus Noise Ratio): Signal clarity in dB
  - Excellent: > 20 dB
  - Good: 13 to 20 dB
  - Fair: 0 to 13 dB
  - Poor: < 0 dB

Quality of Experience:
• MOS (Mean Opinion Score): Voice quality rating (1-5)
  - Excellent: 4.0 - 5.0
  - Good: 3.0 - 4.0
  - Fair: 2.0 - 3.0
  - Poor: 1.0 - 2.0

• Latency: Network delay in milliseconds
  - Excellent: < 50 ms
  - Good: 50 - 100 ms
  - Fair: 100 - 150 ms
  - Poor: > 150 ms

═══════════════════════════════════════════════════════════════

💡 USAGE TIPS
-------------
1. Open the Excel file for detailed data analysis
2. Use pivot tables for custom aggregations
3. Charts are high-resolution (2x scale) for presentations
4. All timestamps are in local timezone
5. "N/A" indicates missing or unavailable data

═══════════════════════════════════════════════════════════════

⚠️ IMPORTANT NOTES
------------------
• All metrics are averaged where applicable
• Location coordinates use WGS84 datum
• Charts reflect filtered data only
• Throughput values are in Mbps (Megabits per second)
• Speed values are provided in both m/s and km/h

═══════════════════════════════════════════════════════════════

📧 SUPPORT
----------
For questions or issues with this export, please contact your
system administrator.

═══════════════════════════════════════════════════════════════

Generated by Network Analytics Dashboard v2.0
© ${new Date().getFullYear()} All rights reserved
`;
};

/**
 * Helper: Calculate average from array
 */
const calculateAverage = (arr) => {
  if (!arr || arr.length === 0) return "N/A";
  const sum = arr.reduce((a, b) => a + b, 0);
  return (sum / arr.length).toFixed(2);
};

/**
 * Helper: Get formatted timestamp
 */
const getTimestamp = () => {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, -5);
};

/**
 * Export individual chart
 */
export const exportSingleChart = async (chartRef, chartName) => {
  try {
    if (!chartRef?.current) {
      toast.error("Chart not available for export");
      return;
    }

    toast.loading("Capturing chart...", { id: "chart-export" });

    const canvas = await html2canvas(chartRef.current, {
      backgroundColor: "#0f172a",
      scale: 2,
      logging: false,
      useCORS: true,
    });

    canvas.toBlob((blob) => {
      const timestamp = getTimestamp();
      saveAs(blob, `${chartName}-${timestamp}.png`);
      toast.success("Chart exported successfully!", { id: "chart-export" });
    });
  } catch (error) {
    console.error("Chart export error:", error);
    toast.error("Failed to export chart", { id: "chart-export" });
  }
};

/**
 * Export only Excel data (no charts)
 */
export const exportExcelOnly = async (params) => {
  try {
    toast.loading("Generating Excel file...", { id: "excel-export" });

    const workbook = await createExcelWorkbook(params);
    const timestamp = getTimestamp();

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(blob, `analytics-data-${timestamp}.xlsx`);

    toast.success("Excel file exported!", { id: "excel-export" });
  } catch (error) {
    console.error("Excel export error:", error);
    toast.error("Failed to export Excel file", { id: "excel-export" });
  }
};

export default {
  exportAnalytics,
  exportSingleChart,
  exportExcelOnly,
};