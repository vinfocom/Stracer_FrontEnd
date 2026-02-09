import React, { useState, useMemo } from "react";
import { 
  ChevronUp, 
  ChevronDown, 
  Activity, 
  BarChart3, 
  TrendingUp,
  LineChart as LineChartIcon
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer 
} from "recharts";

const MapChildFooter = ({ 
  data = [], 
  metric = "rsrp", 
  thresholds = [] 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // --- 1. Calculate Statistics & Chart Data ---
  const { stats, histogramData, cdfData } = useMemo(() => {
    if (!data.length) return { stats: null, histogramData: [], cdfData: [] };

    // Filter valid numbers
    const values = data
      .map((d) => parseFloat(d[metric]))
      .filter((v) => !isNaN(v));

    if (!values.length) return { stats: null, histogramData: [], cdfData: [] };

    // Basic Stats
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // --- Threshold Distribution ---
    const distribution = values.reduce((acc, val) => {
        let color = "#9CA3AF"; // Default gray
        if (thresholds?.length) {
            const sortedThresholds = [...thresholds].sort((a, b) => parseFloat(a.min) - parseFloat(b.min));
            for (let i = 0; i < sortedThresholds.length; i++) {
                const t = sortedThresholds[i];
                const tMin = parseFloat(t.min);
                const tMax = parseFloat(t.max);
                if (val >= tMin && (i === sortedThresholds.length - 1 ? val <= tMax : val < tMax)) {
                    color = t.color;
                    break;
                }
            }
            if (val < parseFloat(sortedThresholds[0].min)) color = sortedThresholds[0].color;
            if (val > parseFloat(sortedThresholds[sortedThresholds.length - 1].max)) color = sortedThresholds[sortedThresholds.length - 1].color;
        }
        acc[color] = (acc[color] || 0) + 1;
        return acc;
    }, {});

    // --- Histogram Data (Binned Ranges) ---
    const binCount = 20;
    const range = max - min;
    const safeRange = range === 0 ? 1 : range;
    const binSize = safeRange / binCount;
    
    const bins = Array.from({ length: binCount }, (_, i) => {
      const binMin = min + i * binSize;
      const binMax = min + (i + 1) * binSize;
      return {
        name: `${binMin.toFixed(0)}`,
        min: binMin,
        max: binMax,
        count: 0,
        rangeLabel: `${binMin.toFixed(1)} - ${binMax.toFixed(1)}`
      };
    });

    values.forEach(v => {
      let index = Math.floor((v - min) / binSize);
      if (index >= binCount) index = binCount - 1;
      if (index < 0) index = 0;
      bins[index].count += 1;
    });

    // --- CDF (Cumulative Frequency) Data Generation ---
    // 1. Map values to their individual frequency (repetition count)
    const freqMap = {};
    values.forEach(v => {
        const key = Math.round(v); // Group by integer value for cleaner chart
        freqMap[key] = (freqMap[key] || 0) + 1;
    });

    // 2. Sort unique values
    const sortedUniqueValues = Object.keys(freqMap)
        .map(k => parseInt(k))
        .sort((a, b) => a - b);

    // 3. Calculate running totals
    let runningTotal = 0;
    const cdfChartData = sortedUniqueValues.map(val => {
        const frequency = freqMap[val];
        runningTotal += frequency;
        return {
            value: val,
            cumulative: runningTotal, // The Y-axis value (CDF)
            frequency: frequency      // For Tooltip (Repetition)
        };
    });

    return { 
      stats: { avg, min, max, count: values.length, distribution }, 
      histogramData: bins,
      cdfData: cdfChartData
    };
  }, [data, metric, thresholds]);

  if (!stats) return null;

  return (
    <div 
      className={`
        absolute bottom-0 left-0 right-0 z-30 
        bg-white/95 backdrop-blur-sm border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]
        transition-all duration-300 ease-in-out
        ${isExpanded ? "h-[500px]" : "h-12"} 
        flex flex-col
      `}
    >
      {/* --- Header / Collapsed View --- */}
      <div 
        className="flex items-center justify-between px-4 h-12 cursor-pointer hover:bg-gray-50 transition-colors shrink-0 border-b border-gray-100"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4 overflow-hidden">
            <div className="flex items-center gap-2 text-blue-700 font-semibold min-w-fit">
                <Activity size={16} />
                <span className="text-sm">Analytics</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-600 border-l pl-3 ml-1 truncate">
                <span className="font-medium text-gray-900">{stats.count}</span> Samples
                <span className="w-px h-3 bg-gray-300 mx-1 hidden sm:block"></span>
                <span className="hidden sm:inline">Avg {metric.toUpperCase()}: </span>
                <span className={`font-mono font-bold ${getMetricColorClass(stats.avg, metric)}`}>
                    {stats.avg.toFixed(1)}
                </span>
            </div>
        </div>
        <button className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
            {isExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>

      {/* --- Expanded Content --- */}
      <div className={`flex-grow overflow-y-auto p-4 ${isExpanded ? "opacity-100 visible" : "opacity-0 invisible h-0"}`}>
        
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatBox label={`Avg ${metric}`} value={stats.avg.toFixed(2)} icon={<Activity size={14}/>} />
            <StatBox label="Min Value" value={stats.min.toFixed(2)} />
            <StatBox label="Max Value" value={stats.max.toFixed(2)} />
            <StatBox label="Total Samples" value={stats.count} />
        </div>

        {/* Color Distribution Bar */}
        <div className="space-y-2 mb-6">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span className="flex items-center gap-1"><BarChart3 size={12}/> Signal Threshold Distribution</span>
            </div>
            <div className="h-4 w-full flex rounded-full overflow-hidden bg-gray-100 border border-gray-200">
                {Object.entries(stats.distribution).map(([color, count]) => (
                    <div 
                        key={color}
                        style={{ width: `${(count / stats.count) * 100}%`, backgroundColor: color }}
                        className="h-full hover:opacity-80 transition-opacity relative group"
                        title={`Count: ${count} (${((count/stats.count)*100).toFixed(1)}%)`}
                    />
                ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
                 {Object.entries(stats.distribution)
                    .sort((a,b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([color, count]) => (
                    <div key={color} className="flex items-center gap-1 text-[10px] text-gray-600">
                        <span className="w-2 h-2 rounded-full" style={{backgroundColor: color}}></span>
                        <span>{((count/stats.count)*100).toFixed(0)}%</span>
                    </div>
                 ))}
            </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-2">
            
            {/* Histogram (Counts per Bin) */}
            <div className="bg-slate-50 rounded border border-slate-200 p-2 flex flex-col h-[200px]">
                <div className="text-[10px] text-gray-500 font-semibold mb-2 flex items-center gap-1">
                   <BarChart3 size={12} /> HISTOGRAM (Range Distribution)
                </div>
                <div className="flex-grow w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={histogramData} margin={{top: 5, right: 5, left: -20, bottom: 0}}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis 
                                dataKey="name" 
                                tick={{fontSize: 9}} 
                                interval="preserveStartEnd"
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis 
                                tick={{fontSize: 9}} 
                                tickLine={false}
                                axisLine={false}
                            />
                            <RechartsTooltip 
                                contentStyle={{fontSize: '12px', borderRadius: '4px', border: 'none', boxShadow: '0 2px 5px rgba(0,0,0,0.1)'}}
                                cursor={{fill: 'rgba(0,0,0,0.05)'}}
                                labelFormatter={(label, payload) => {
                                    if(payload && payload[0]) return `Range: ${payload[0].payload.rangeLabel}`;
                                    return label;
                                }}
                            />
                            <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} name="Samples" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* CDF (Cumulative Count) with Frequency Tooltip */}
            <div className="bg-slate-50 rounded border border-slate-200 p-2 flex flex-col h-[200px]">
                <div className="text-[10px] text-gray-500 font-semibold mb-2 flex items-center gap-1">
                   <TrendingUp size={12} /> CDF (Cumulative Sample Count)
                </div>
                <div className="flex-grow w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={cdfData} margin={{top: 5, right: 10, left: -10, bottom: 0}}>
                            <defs>
                                <linearGradient id="colorCdf" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis 
                                dataKey="value" 
                                type="number" 
                                domain={['dataMin', 'dataMax']} 
                                tick={{fontSize: 9}}
                                tickFormatter={(v) => v.toFixed(0)}
                                tickLine={false}
                                axisLine={false}
                                allowDecimals={false}
                                reversed={true}
                            />
                            <YAxis 
                                domain={[0, 'auto']}
                                tick={{fontSize: 9}}
                                tickLine={false}
                                axisLine={false}
                                label={{ value: 'Total Samples', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#9ca3af', offset: 15 }}
                            />
                            <RechartsTooltip 
                                contentStyle={{fontSize: '12px', borderRadius: '4px', border: 'none', boxShadow: '0 2px 5px rgba(0,0,0,0.1)'}}
                                labelFormatter={(v) => `${metric.toUpperCase()}: ${v}`}
                                // CUSTOM TOOLTIP FORMATTER
                                formatter={(value, name, props) => {
                                    if (name === 'cumulative') return [`${value}`, 'Cumulative Samples'];
                                    return [value, name];
                                }}
                                // Injecting custom content to show BOTH cumulative and specific frequency
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                            <div className="bg-white p-2 border border-gray-100 shadow-md rounded text-xs">
                                                <p className="font-bold mb-1 border-b pb-1">{metric.toUpperCase()}: {label}</p>
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                                    <span className="text-gray-500">Cumulative:</span>
                                                    <span className="font-mono font-semibold text-blue-600">{data.cumulative}</span>
                                                    
                                                    <span className="text-gray-500">Repeated:</span>
                                                    <span className="font-mono font-semibold text-green-600">{data.frequency} times</span>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="cumulative" 
                                stroke="#10b981" 
                                fillOpacity={1} 
                                fill="url(#colorCdf)" 
                                strokeWidth={2}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

        </div>

      </div>
    </div>
  );
};

// --- Helper Sub-components ---

const StatBox = ({ label, value, icon }) => (
    <div className="bg-slate-50 p-2 rounded border border-slate-100 flex flex-col items-center justify-center shadow-sm">
        <span className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
            {icon} {label}
        </span>
        <span className="text-sm font-bold text-slate-800">{value}</span>
    </div>
);

const getMetricColorClass = (val, metric) => {
    if (metric === 'rsrp') {
        if (val > -85) return 'text-green-600';
        if (val > -105) return 'text-yellow-600';
        return 'text-red-600';
    }
    return 'text-blue-600';
};

export default MapChildFooter;