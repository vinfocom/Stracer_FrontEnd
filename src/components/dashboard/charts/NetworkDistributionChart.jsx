import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import ChartCard from '../ChartCard';
import { TOOLTIP_STYLE, NETWORK_COLORS, CHART_COLORS } from '@/components/constants/dashboardConstants';
import { useNetworkDistribution } from '@/hooks/useDashboardData.js';
import { applyTopN } from '@/utils/dashboardUtils';
import { formatNumber } from '@/utils/chartUtils';

// Network normalization mapping
const NETWORK_NORMALIZATION_MAP = {
  '5G': '5G',
  'NSA': '5G',
  'SA': '5G',
  'NR': '5G',
  '5G NSA': '5G',
  '5G SA': '5G',
  '5G NR': '5G',
  'LTE': 'LTE/4G',
  '4G': 'LTE/4G',
  'LTE/4G': 'LTE/4G',
  '3G': '3G',
  '2G': '2G',
  'UNKNOWN': 'Unknown',
  'Unknown': 'Unknown',
  'unknown': 'Unknown',
  'N/A': 'Unknown',
  'NA': 'Unknown'
};

// Function to normalize network data
const normalizeNetworkData = (data) => {
  if (!data || !Array.isArray(data)) return [];
  
  // Create a map to aggregate normalized values
  const normalizedMap = new Map();
  
  data.forEach(item => {
    // Get the normalized network name
    const originalNetwork = item.network?.trim() || 'Unknown';
    const normalizedNetwork = NETWORK_NORMALIZATION_MAP[originalNetwork] || originalNetwork;
    
    // Aggregate values for the same normalized network
    if (normalizedMap.has(normalizedNetwork)) {
      const existing = normalizedMap.get(normalizedNetwork);
      normalizedMap.set(normalizedNetwork, {
        ...existing,
        value: existing.value + (item.value || 0)
      });
    } else {
      normalizedMap.set(normalizedNetwork, {
        network: normalizedNetwork,
        value: item.value || 0
      });
    }
  });
  
  // Convert map back to array and sort by value
  return Array.from(normalizedMap.values()).sort((a, b) => b.value - a.value);
};

const NetworkDistributionChart = ({ chartFilters, onChartFiltersChange, operators, networks }) => {
  const { data, isLoading } = useNetworkDistribution(chartFilters);

  // First normalize the data, then apply topN filter
  const filteredData = useMemo(() => {
    const normalizedData = normalizeNetworkData(data);
    return applyTopN(normalizedData, chartFilters?.topN);
  }, [data, chartFilters?.topN]);

  // Use normalized data for export as well
  const exportData = useMemo(() => {
    return normalizeNetworkData(data);
  }, [data]);

  return (
    <ChartCard
      title="Network Technology Distribution"
      dataset={exportData}
      exportFileName="network_type_distribution"
      isLoading={isLoading}
      chartFilters={chartFilters}
      onChartFiltersChange={onChartFiltersChange}
      operators={operators}
      networks={networks}
      showChartFilters={true}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={filteredData}
          layout="vertical"
          margin={{ top: 12, right: 40, left: 10, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.08)" />
          <XAxis
            type="number"
            tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 500 }}
            tickFormatter={formatNumber}
          />
          <YAxis
            dataKey="network"
            type="category"
            width={130}
            tick={{ fill: '#111827', fontSize: 12, fontWeight: 600 }}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" radius={[0, 8, 8, 0]}>
            <LabelList
              dataKey="value"
              position="right"
              style={{ fill: '#111827', fontSize: '12px', fontWeight: 700 }}
              formatter={formatNumber}
            />
            {filteredData?.map((entry, index) => (
              <Cell
                key={`cell-net-${index}`}
                fill={NETWORK_COLORS[entry.network] || CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default NetworkDistributionChart;