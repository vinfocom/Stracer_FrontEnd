// components/charts/BoxPlotChartSimple.jsx
import React, { useMemo, useState } from 'react';
import { Settings, Download, Activity, TrendingUp, AlertCircle } from 'lucide-react';
import { useBoxData } from '@/hooks/useDashboardData';
import Spinner from '@/components/common/Spinner';

const OPERATOR_COLORS = {
  'Airtel': '#E40000',
  'Jio': '#0A2885',
  'Vi': '#FFD700',
  'BSNL': '#00A651',
  'Vodafone': '#E60000',
  'Idea': '#FFD700',
  'default': '#6366f1'
};

const METRIC_CONFIG = {
  rsrp: {
    value: 'rsrp',
    label: 'RSRP',
    unit: 'dBm',
    domain: [-140, -60],
    description: 'Reference Signal Received Power'
  },
  rsrq: {
    value: 'rsrq',
    label: 'RSRQ',
    unit: 'dB',
    domain: [-20, -3],
    description: 'Reference Signal Received Quality'
  },
  sinr: {
    value: 'sinr',
    label: 'SINR',
    unit: 'dB',
    domain: [-10, 30],
    description: 'Signal to Interference & Noise Ratio'
  },
  dl_tpt: {
    value: 'dl_tpt',
    label: 'DL Throughput',
    unit: 'Mbps',
    domain: [0, 100],
    description: 'Download Throughput'
  },
  ul_tpt: {
    value: 'ul_tpt',
    label: 'UL Throughput',
    unit: 'Mbps',
    domain: [0, 50],
    description: 'Upload Throughput'
  }
};

const getOperatorColor = (name) => {
  if (!name) return OPERATOR_COLORS.default;
  const cleanName = name.toLowerCase();
  
  if (cleanName.includes('airtel') || cleanName.includes('bharti')) return OPERATOR_COLORS['Airtel'];
  if (cleanName.includes('jio') || cleanName.includes('reliance')) return OPERATOR_COLORS['Jio'];
  if (cleanName.includes('vi') || cleanName.includes('vodafone') || cleanName.includes('idea')) return OPERATOR_COLORS['Vi'];
  if (cleanName.includes('bsnl')) return OPERATOR_COLORS['BSNL'];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
};

const BoxPlotChartSimple = () => {
  const [selectedMetric, setSelectedMetric] = useState('rsrp');
  const [showSettings, setShowSettings] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const { data: boxData, isLoading, error } = useBoxData(selectedMetric);

  const metricConfig = useMemo(() => {
    return METRIC_CONFIG[selectedMetric] || METRIC_CONFIG.rsrp;
  }, [selectedMetric]);

  const validData = useMemo(() => {
    if (!boxData || !Array.isArray(boxData)) return [];
    
    return boxData.filter(d => 
      d &&
      d.provider &&
      Number.isFinite(d.min) &&
      Number.isFinite(d.max) &&
      Number.isFinite(d.Q1) &&
      Number.isFinite(d.Q3) &&
      Number.isFinite(d.Median) &&
      d.max > d.min
    );
  }, [boxData]);

  const yDomain = useMemo(() => {
    if (validData.length === 0) {
      return metricConfig.domain;
    }
    
    const allMin = Math.min(...validData.map(d => d.min));
    const allMax = Math.max(...validData.map(d => d.max));
    
    if (!Number.isFinite(allMin) || !Number.isFinite(allMax) || allMin >= allMax) {
      return metricConfig.domain;
    }
    
    const padding = Math.abs(allMax - allMin) * 0.2;
    return [Math.floor(allMin - padding), Math.ceil(allMax + padding)];
  }, [validData, metricConfig]);

  const calcPercent = (value, min, max) => {
    const range = max - min;
    if (range <= 0 || !Number.isFinite(value)) return 0;
    const percent = ((value - min) / range) * 100;
    return Math.max(0, Math.min(100, percent));
  };

  const formatValue = (value, metric) => {
    if (!Number.isFinite(value)) return 'N/A';
    
    switch (metric) {
      case 'dl_tpt':
      case 'ul_tpt':
        return value.toFixed(2);
      case 'rsrp':
      case 'rsrq':
      case 'sinr':
      default:
        return value.toFixed(1);
    }
  };

  const handleExport = () => {
    if (validData.length === 0) return;

    const headers = ['Provider', `Min (${metricConfig.unit})`, `Q1 (${metricConfig.unit})`, `Median (${metricConfig.unit})`, `Q3 (${metricConfig.unit})`, `Max (${metricConfig.unit})`, `IQR (${metricConfig.unit})`, 'Samples'];
    const rows = validData.map(item => [
      item.provider,
      formatValue(item.min, selectedMetric),
      formatValue(item.Q1, selectedMetric),
      formatValue(item.Median, selectedMetric),
      formatValue(item.Q3, selectedMetric),
      formatValue(item.max, selectedMetric),
      formatValue(item.Q3 - item.Q1, selectedMetric),
      item.samples || 'N/A'
    ]);

    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `boxplot_${selectedMetric}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleMouseMove = (item, event) => {
    setMousePosition({
      x: event.clientX,
      y: event.clientY
    });
    setHoveredItem(item);
  };

  const handleMouseLeave = () => {
    setHoveredItem(null);
  };

  const dataWarnings = useMemo(() => {
    const warnings = [];
    if (boxData && boxData.length > validData.length) {
      warnings.push(`${boxData.length - validData.length} row(s) excluded due to invalid data`);
    }
    if (validData.some(d => d.provider.startsWith('Other') || d.provider.startsWith('Unknown'))) {
      warnings.push('Some operators could not be identified');
    }
    return warnings;
  }, [boxData, validData]);

  const CustomTooltip = ({ item }) => {
    if (!item) return null;
    
    const color = getOperatorColor(item.provider);
    
    return (
      <div 
        className="fixed z-[9999] bg-white rounded-lg shadow-xl border-2 p-3 pointer-events-none"
        style={{ 
          left: mousePosition.x + 15,
          top: mousePosition.y - 10,
          borderColor: color,
          minWidth: '200px'
        }}
      >
        <div 
          className="text-base font-bold mb-2 pb-2 border-b"
          style={{ color: color, borderColor: `${color}30` }}
        >
          {item.provider}
        </div>
        
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Max:</span>
            <span className="font-semibold text-gray-900">
              {formatValue(item.max, selectedMetric)} {metricConfig.unit}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Q3:</span>
            <span className="font-semibold text-gray-900">
              {formatValue(item.Q3, selectedMetric)} {metricConfig.unit}
            </span>
          </div>
          <div className="flex justify-between" style={{ color: color }}>
            <span className="font-medium">Median:</span>
            <span className="font-bold">
              {formatValue(item.Median, selectedMetric)} {metricConfig.unit}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Q1:</span>
            <span className="font-semibold text-gray-900">
              {formatValue(item.Q1, selectedMetric)} {metricConfig.unit}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Min:</span>
            <span className="font-semibold text-gray-900">
              {formatValue(item.min, selectedMetric)} {metricConfig.unit}
            </span>
          </div>
          <div className="flex justify-between pt-1 border-t border-gray-200">
            <span className="text-gray-600">IQR:</span>
            <span className="font-semibold text-gray-900">
              {formatValue(item.Q3 - item.Q1, selectedMetric)} {metricConfig.unit}
            </span>
          </div>
          {item.samples && (
            <div className="flex justify-between">
              <span className="text-gray-600">Samples:</span>
              <span className="font-semibold text-gray-900">
                {item.samples.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const Legend = () => {
    if (validData.length === 0) return null;

    return (
      <div className="flex flex-wrap justify-center gap-4 mt-6 pt-4 border-t border-gray-200">
        {validData.map((item, index) => {
          const color = getOperatorColor(item.provider);
          return (
            <div 
              key={`legend-${item.provider}-${index}`}
              className="flex items-center gap-2"
            >
              <div 
                className="w-4 h-4 rounded"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm font-medium text-gray-700">
                {item.provider}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-gray-900">
            {metricConfig.label} Distribution
          </h3>
          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
            Box Plot
          </span>
          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
            {metricConfig.unit}
          </span>
          {validData.length > 0 && (
            <span className="text-xs text-gray-500">
              ({validData.length} operator{validData.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={validData.length === 0}
            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export CSV"
          >
            <Download size={20} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition-colors ${
              showSettings ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
            }`}
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Warnings */}
      {dataWarnings.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-700">
              {dataWarnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      {showSettings && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
            <Activity size={14} />
            Select Metric
          </label>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="w-full max-w-xs px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {Object.values(METRIC_CONFIG).map((m) => (
              <option key={m.value} value={m.value}>
                {m.label} ({m.unit})
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-gray-500">
            {metricConfig.description}
          </p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="h-80 flex items-center justify-center">
          <Spinner />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="h-80 flex flex-col items-center justify-center text-red-500">
          <Activity size={48} className="mb-4 opacity-50" />
          <p className="font-medium">Error loading data</p>
          <p className="text-sm text-gray-500 mt-1">{error.message}</p>
        </div>
      )}

      {/* Tooltip */}
      {hoveredItem && <CustomTooltip item={hoveredItem} />}

      {/* Chart */}
      {!isLoading && !error && validData.length > 0 && (
        <div className="space-y-4">
          {/* Visual Box Plot */}
          <div className="relative bg-gray-50 rounded-lg p-4 pt-8">
            {/* Y-Axis with unit */}
            <div className="absolute left-0 top-8 bottom-16 w-16 flex flex-col justify-between text-xs text-gray-500 text-right pr-2">
              <span>{yDomain[1]} <span className="text-gray-400">{metricConfig.unit}</span></span>
              <span>{Math.round((yDomain[0] + yDomain[1]) / 2)}</span>
              <span>{yDomain[0]}</span>
            </div>

            {/* Chart Area */}
            <div 
              className="ml-16 mr-4 flex items-end justify-around gap-4"
              style={{ height: '320px' }}
            >
              {validData.map((item, index) => {
                const color = getOperatorColor(item.provider);
                
                const minPercent = calcPercent(item.min, yDomain[0], yDomain[1]);
                const q1Percent = calcPercent(item.Q1, yDomain[0], yDomain[1]);
                const medianPercent = calcPercent(item.Median, yDomain[0], yDomain[1]);
                const q3Percent = calcPercent(item.Q3, yDomain[0], yDomain[1]);
                const maxPercent = calcPercent(item.max, yDomain[0], yDomain[1]);
                const boxHeight = Math.max(2, q3Percent - q1Percent);

                return (
                  <div
                    key={`box-${item.provider}-${index}`}
                    className="flex-1 relative max-w-[120px] min-w-[50px] cursor-pointer"
                    style={{ height: '100%' }}
                    onMouseMove={(e) => handleMouseMove(item, e)}
                    onMouseLeave={handleMouseLeave}
                  >
                    {/* Whisker Line */}
                    <div
                      className="absolute left-1/2 w-0.5 -translate-x-1/2 transition-all"
                      style={{
                        backgroundColor: color,
                        opacity: 0.7,
                        bottom: `${minPercent}%`,
                        height: `${Math.max(1, maxPercent - minPercent)}%`
                      }}
                    />

                    {/* Min Cap */}
                    <div
                      className="absolute left-1/2 h-0.5 w-5 -translate-x-1/2 transition-all"
                      style={{ backgroundColor: color, bottom: `${minPercent}%` }}
                    />

                    {/* Max Cap */}
                    <div
                      className="absolute left-1/2 h-0.5 w-5 -translate-x-1/2 transition-all"
                      style={{ backgroundColor: color, bottom: `${maxPercent}%` }}
                    />

                    {/* Box (Q1 to Q3) */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 w-12 rounded border-2 transition-all hover:shadow-lg"
                      style={{
                        borderColor: color,
                        backgroundColor: `${color}30`,
                        bottom: `${q1Percent}%`,
                        height: `${boxHeight}%`,
                        minHeight: '6px'
                      }}
                    />

                    {/* Median Line */}
                    <div
                      className="absolute left-1/2 h-1 w-12 -translate-x-1/2 rounded transition-all"
                      style={{
                        backgroundColor: color,
                        bottom: `${medianPercent}%`,
                        boxShadow: `0 0 4px ${color}`
                      }}
                    />

                    {/* Median Value Label - Positioned to the right of the box */}
                    <div
                      className="absolute text-xs font-bold whitespace-nowrap px-1.5 py-0.5 rounded shadow-sm border"
                      style={{ 
                        color: color, 
                        backgroundColor: 'white',
                        borderColor: `${color}50`,
                        left: 'calc(50% + 30px)',
                        bottom: `${medianPercent}%`,
                        transform: 'translateY(50%)',
                        zIndex: 10
                      }}
                    >
                      {formatValue(item.Median, selectedMetric)}
                    </div>

                    {/* Provider Label */}
                    <div 
                      className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-xs font-bold text-gray-700 whitespace-nowrap max-w-[100px] truncate text-center"
                    >
                      {item.provider}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* X-Axis Line */}
            <div className="ml-16 mr-4 h-px bg-gray-300 mt-10" />
          </div>

          {/* Legend */}
          <Legend />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && validData.length === 0 && (
        <div className="h-80 flex flex-col items-center justify-center text-gray-500">
          <TrendingUp size={48} className="mb-4 opacity-20" />
          <p className="text-lg font-medium">No valid data available</p>
          <p className="text-sm text-gray-400 mt-2">
            {boxData?.length > 0 
              ? 'Data exists but contains invalid values'
              : 'No data returned from API'}
          </p>
        </div>
      )}
    </div>
  );
};

export default BoxPlotChartSimple;