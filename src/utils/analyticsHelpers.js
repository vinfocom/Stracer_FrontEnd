export const calculateStats = (locations, metric) => {
  if (!locations?.length) return null;

  const values = locations
    .map(loc => loc[metric])
    .filter(val => val != null && !isNaN(val));

  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, val) => acc + val, 0);
  const avg = sum / values.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  return {
    avg: Number(avg.toFixed(2)),
    min: Number(Math.min(...values).toFixed(2)),
    max: Number(Math.max(...values).toFixed(2)),
    median: Number(median.toFixed(2)),
    count: values.length,
  };
};

export const calculateIOSummary = (logArea) => {
  if (!logArea || typeof logArea !== "object") return null;

  let totalIndoor = 0;
  let totalOutdoor = 0;

  Object.values(logArea).forEach(session => {
    totalIndoor += session.Indoor?.inputCount || 0;
    totalOutdoor += session.Outdoor?.inputCount || 0;
  });

  return {
    indoor: totalIndoor,
    outdoor: totalOutdoor,
    total: totalIndoor + totalOutdoor,
  };
};

export const formatDuration = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
};

export const filterValidData = (data, field) => {
  return data.filter(item => {
    const name = item[field]?.toLowerCase() || '';
    return !name.includes('unknown') && !name.includes('no service');
  });
};