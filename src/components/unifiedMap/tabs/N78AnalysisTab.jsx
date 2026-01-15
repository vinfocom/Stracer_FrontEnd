import React, { useMemo, useState } from 'react';
import { 
  Radio, Signal, Activity, TrendingUp, Square, BarChart3, Wifi, MapPin, Layers, Server, ArrowRightLeft,
  ChevronDown
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';

// --- Configuration & Helpers ---
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

const METRIC_CONFIG = {
  rsrp: {
    label: 'RSRP',
    unit: 'dBm',
    neighborKey: 'neighbourRsrp', // Matches your hook
    primaryKey: 'rsrp',
    min: -140,
    max: -40,
    buckets: [
      { label: '<-120', min: -999, max: -120 },
      { label: '-120 to -110', min: -120, max: -110 },
      { label: '-110 to -100', min: -110, max: -100 },
      { label: '-100 to -90', min: -100, max: -90 },
      { label: '-90 to -80', min: -90, max: -80 },
      { label: '>-80', min: -80, max: 999 },
    ]
  },
  rsrq: {
    label: 'RSRQ',
    unit: 'dB',
    neighborKey: 'neighbourRsrq',
    primaryKey: 'rsrq',
    min: -30,
    max: 0,
    buckets: [
      { label: '<-20', min: -999, max: -20 },
      { label: '-20 to -15', min: -20, max: -15 },
      { label: '-15 to -10', min: -15, max: -10 },
      { label: '-10 to -5', min: -10, max: -5 },
      { label: '>-5', min: -5, max: 999 },
    ]
  },
  sinr: {
    label: 'SINR',
    unit: 'dB',
    neighborKey: 'neighbourSinr',
    primaryKey: 'sinr',
    min: -10,
    max: 40,
    buckets: [
      { label: '<0', min: -999, max: 0 },
      { label: '0 to 10', min: 0, max: 10 },
      { label: '10 to 20', min: 10, max: 20 },
      { label: '20 to 30', min: 20, max: 30 },
      { label: '>30', min: 30, max: 999 },
    ]
  }
};

const getColorFromThresholds = (value, thresholds) => {
  if (value == null || isNaN(value)) return "#9CA3AF";
  if (!thresholds?.length) {
    // Default fallback colors if no thresholds provided
    if (value >= -80) return "#10B981";
    if (value >= -90) return "#34D399";
    if (value >= -100) return "#FBBF24";
    if (value >= -110) return "#F97316";
    return "#EF4444";
  }
  const sorted = [...thresholds].sort((a, b) => parseFloat(a.min) - parseFloat(b.min));
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (value >= parseFloat(t.min) && value < parseFloat(t.max)) return t.color;
  }
  return "#9CA3AF";
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 p-2 rounded shadow-xl text-xs z-50">
        <p className="font-semibold text-white mb-1">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.fill || entry.color }} />
            <span className="text-slate-300 capitalize">{entry.name}:</span>
            <span className="text-white font-mono">
              {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const N78AnalysisTab = ({
  n78NeighborData,
  n78NeighborStats,
  n78NeighborLoading,
  primaryData = [],
  thresholds,
  expanded,
}) => {
  const [selectedMetric, setSelectedMetric] = useState('rsrp');
  const rsrpThresholds = thresholds?.rsrp || [];

  // --- Statistics Calculation ---
  const stats = useMemo(() => {
    if (!n78NeighborData?.length) return null;
    
    const config = METRIC_CONFIG[selectedMetric];

    // 1. Filter Valid Data based on Selected Metric
    const validNeighborData = n78NeighborData.map(n => ({
      ...n,
      val: n[config.neighborKey] ?? n.neighborRsrp, // fallback for legacy
      provider: n.provider || "Unknown",
      band: n.neighbourBand || n.primaryBand || "Unknown",
      tech: n.networkType || "Unknown"
    })).filter(n => n.val != null && !isNaN(n.val) && n.val !== 0); // Filter zeros if needed

    const validPrimaryData = primaryData.map(p => ({
        val: p[config.primaryKey]
    })).filter(p => p.val != null && !isNaN(p.val) && p.val !== 0);

    // 2. Calculate Basic Stats (Neighbor)
    const values = validNeighborData.map(n => n.val).sort((a, b) => a - b);
    const avg = values.reduce((a, b) => a + b, 0) / values.length || 0;
    const mid = Math.floor(values.length / 2);
    const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;

    // 3. Aggregations
    const providers = {};
    const bands = {};
    const techs = {};

    validNeighborData.forEach(n => {
      providers[n.provider] = (providers[n.provider] || 0) + 1;
      bands[n.band] = (bands[n.band] || 0) + 1;
      techs[n.tech] = (techs[n.tech] || 0) + 1;
    });

    // 4. Distribution & Comparison
    // Initialize buckets
    const distData = config.buckets.map(b => ({ 
        name: b.label, 
        Primary: 0, 
        Neighbor: 0,
        min: b.min,
        max: b.max
    }));

    // Fill buckets
    const fillBucket = (val, type) => {
        const bucket = distData.find(b => val >= b.min && val < b.max);
        if (bucket) bucket[type]++;
    };

    validNeighborData.forEach(n => fillBucket(n.val, 'Neighbor'));
    validPrimaryData.forEach(p => fillBucket(p.val, 'Primary'));

    // 5. Comparative Summary (Avg/Median)
    const primaryValues = validPrimaryData.map(p => p.val).sort((a, b) => a - b);
    const primaryAvg = primaryValues.reduce((a, b) => a + b, 0) / primaryValues.length || 0;
    const pMid = Math.floor(primaryValues.length / 2);
    const primaryMedian = primaryValues.length % 2 ? primaryValues[pMid] : (primaryValues[pMid - 1] + primaryValues[pMid]) / 2;

    const comparisonSummary = [
        { name: 'Average', Primary: primaryAvg.toFixed(1), Neighbor: avg.toFixed(1) },
        { name: 'Median', Primary: primaryMedian.toFixed(1), Neighbor: median.toFixed(1) },
        { name: 'Min', Primary: primaryValues[0]?.toFixed(1) || 0, Neighbor: values[0]?.toFixed(1) || 0 },
        { name: 'Max', Primary: primaryValues[primaryValues.length-1]?.toFixed(1) || 0, Neighbor: values[values.length-1]?.toFixed(1) || 0 },
    ];

    const formatChartData = (obj) => Object.entries(obj)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      total: n78NeighborData.length,
      sessionCount: new Set(n78NeighborData.map(n => n.sessionId)).size,
      stats: { min: values[0], max: values[values.length-1], avg, median },
      chartData: {
        providers: formatChartData(providers),
        bands: formatChartData(bands),
        techs: formatChartData(techs),
        distribution: distData,
        summary: comparisonSummary
      }
    };
  }, [n78NeighborData, primaryData, selectedMetric]);

  if (n78NeighborLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mb-2" />
        <span>Loading N78 Data...</span>
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <Radio className="h-16 w-16 mb-4 opacity-50" />
        <p className="text-lg font-medium">No unlatched  Data Found</p>
      </div>
    );
  }

  const config = METRIC_CONFIG[selectedMetric];

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      
      {/* 1. Header with Metric Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-800/50 p-3 rounded-lg border border-slate-700 gap-3">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
                <Radio className="h-6 w-6 text-purple-400" />
            </div>
            <div>
                <h3 className="font-bold text-white">Unlateched</h3>
                <p className="text-xs text-slate-400">{stats.total} samples | {stats.sessionCount} sessions</p>
            </div>
        </div>

        {/* Metric Selector Buttons */}
        <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
            {Object.entries(METRIC_CONFIG).map(([key, conf]) => (
                <button
                    key={key}
                    onClick={() => setSelectedMetric(key)}
                    className={`
                        px-3 py-1.5 text-xs font-medium rounded-md transition-all
                        ${selectedMetric === key 
                            ? 'bg-blue-600 text-white shadow-lg' 
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                    `}
                >
                    {conf.label}
                </button>
            ))}
        </div>

        <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-400">{config.label} Avg</div>
            <div className="text-lg font-bold" style={{ color: selectedMetric === 'rsrp' ? getColorFromThresholds(stats.stats.avg, rsrpThresholds) : '#fff' }}>
                {stats.stats.avg?.toFixed(1) ?? '--'} <span className="text-xs text-slate-500">{config.unit}</span>
            </div>
        </div>
      </div>

      {/* 2. Comparative Analysis Section */}
      <div className="grid grid-cols-2 md:grid-cols-1 gap-6 ">
        
        {/* Metric Comparison (Bar Chart) */}
        <div className="bg-slate-800/50 p-10 rounded-lg border border-slate-700 h-[300px]">
           <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-cyan-400" /> Primary vs Neighbor ({config.label})
          </h4>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.chartData.summary} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={true} vertical={false}/>
              <XAxis type="number" tick={{fill: '#94a3b8', fontSize: 10}} />
              <YAxis dataKey="name" type="category" tick={{fill: '#94a3b8', fontSize: 11}} width={50} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="Primary" fill="#3B82F6" name="Primary" radius={[0, 4, 4, 0]} barSize={20} />
              <Bar dataKey="Neighbor" fill="#8B5CF6" name="Neighbor" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Distribution Overlap (Area Chart) */}
        <div className="bg-slate-800/50 p-10 rounded-lg border border-slate-700 h-[300px]">
           <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-pink-400" /> {config.label} Distribution
          </h4>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.chartData.distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{fill: '#94a3b8', fontSize: 10}} interval={0} />
              <YAxis tick={{fill: '#94a3b8', fontSize: 10}} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area type="monotone" dataKey="Primary" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} />
              <Area type="monotone" dataKey="Neighbor" stackId="2" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Detailed Breakdown Charts (Context) */}
      <div className={`grid ${expanded ? "grid-cols-2" : "grid-cols-1 md:grid-cols-1"} gap-4`}>
        
        {/* Provider Distribution */}
        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 h-[250px]">
          <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <Wifi className="h-4 w-4 text-blue-400" /> Providers
          </h4>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.chartData.providers}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={60}
                paddingAngle={5}
                dataKey="value"
              >
                {stats.chartData.providers.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{fontSize: '10px'}}/>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Band Distribution */}
        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 h-[250px]">
           <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <Layers className="h-4 w-4 text-purple-400" /> Bands
          </h4>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.chartData.bands} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={60} tick={{fill: '#94a3b8', fontSize: 10}} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" fill="#8B5CF6" radius={[0, 4, 4, 0]} barSize={15} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tech Distribution */}
        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 h-[250px]">
           <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <Server className="h-4 w-4 text-orange-400" /> Technology
          </h4>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.chartData.techs}
                cx="50%"
                cy="50%"
                outerRadius={60}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {stats.chartData.techs.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
};

export default N78AnalysisTab;