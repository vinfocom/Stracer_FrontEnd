import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import { PieChart } from '@mui/x-charts/PieChart';
import { Box, TextField, Typography, Grid, Paper, Chip, Stack } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';
import ChartCard from '../ChartCard';
import { useCoverageRanking } from '@/hooks/useDashboardData.js';
import { formatNumber } from '@/utils/chartUtils';

// Operator-specific brand colors with gradients
const OPERATOR_COLORS = {
  jio: {
    primary: '#0a3d91',
    gradient: 'linear-gradient(135deg, #0a3d91 0%, #1565c0 100%)',
    light: '#e3f2fd',
  },
  airtel: {
    primary: '#ff0000',
    gradient: 'linear-gradient(135deg, #ff0000 0%, #ff5252 100%)',
    light: '#ffebee',
  },
  vi: {
    primary: '#ffc107',
    gradient: 'linear-gradient(135deg, #ffc107 0%, #ffca28 100%)',
    light: '#fff8e1',
  },
  vodafone: {
    primary: '#e60000',
    gradient: 'linear-gradient(135deg, #e60000 0%, #ff1744 100%)',
    light: '#ffebee',
  },
  yas:{
    primary: '#7b1fa2',
    gradient: 'linear-gradient(135deg, #7b1fa2 0%, #ab47bc 100%)',
    light: '#f3e5f5',
  }
};

const CHART_COLORS = ['#0a3d91', '#ff0000', '#ffc107', '#e60000'];

// Allowed telecom operators
const ALLOWED_OPERATORS = ['jio', 'airtel', 'vi', 'vodafone', 'yas' ];

// Helper function to get operator color config
const getOperatorConfig = (name) => {
  const nameLower = name.toLowerCase();
  if (nameLower.includes('jio')) return OPERATOR_COLORS.jio;
  if (nameLower.includes('airtel')) return OPERATOR_COLORS.airtel;
  if (nameLower.includes('yas')) return OPERATOR_COLORS.yas;
  if (nameLower.includes('vi') || nameLower.includes('vodafone')) return OPERATOR_COLORS.vi;
  return { primary: CHART_COLORS[0], gradient: CHART_COLORS[0], light: '#f5f5f5' };
};



const CoverageRankingChart = () => {
  const [settings, setSettings] = useState({ rsrpMin: -95, rsrpMax: 0 });
  const [draft, setDraft] = useState({ rsrpMin: '-95', rsrpMax: '0' });

  const { data, isLoading } = useCoverageRanking(settings.rsrpMin, settings.rsrpMax);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Filter only allowed operators
    const filteredData = data.filter(item => {
      const nameLower = item.name.toLowerCase();
      return ALLOWED_OPERATORS.some(operator => nameLower.includes(operator));
    });

    // Calculate total
    const total = filteredData.reduce((sum, item) => sum + (item.value || 0), 0);

    // Sort by value descending
    return filteredData
      .sort((a, b) => b.value - a.value)
      .map((item, index) => {
        const config = getOperatorConfig(item.name);

        return {
          id: index,
          value: item.value,
          label: item.name,
          percentage: total > 0 ? parseFloat(((item.value / total) * 100).toFixed(1)) : 0,
          color: config.primary,
          gradient: config.gradient,
          lightColor: config.light,
         
          rank: index + 1,
        };
      });
  }, [data]);

  useEffect(() => {
    setDraft({
      rsrpMin: String(settings.rsrpMin),
      rsrpMax: String(settings.rsrpMax),
    });
  }, [settings]);

  const applySettings = () => {
    const rsrpMin = Number(draft.rsrpMin);
    const rsrpMax = Number(draft.rsrpMax);

    if (isNaN(rsrpMin) || isNaN(rsrpMax)) {
      return toast.warn("Please enter valid numbers for RSRP range");
    }

    if (rsrpMin > rsrpMax) {
      return toast.warn("RSRP: Min cannot be greater than Max");
    }

    setSettings({ rsrpMin, rsrpMax });
  };

  const totalValue = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.value, 0);
  }, [chartData]);

  const avgValue = useMemo(() => {
    return chartData.length > 0 ? Math.round(totalValue / chartData.length) : 0;
  }, [chartData, totalValue]);

  return (
    <ChartCard
      title={` Coverage Ranking (RSRP ${settings.rsrpMin} to ${settings.rsrpMax} dBm)`}
      dataset={chartData}
      exportFileName="coverage_rank"
      isLoading={isLoading}
      showChartFilters={false}
      settings={{
        title: 'Coverage Rank Settings',
        render: () => (
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight="600" gutterBottom>
              RSRP Coverage Range (dBm)
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Min (dBm)"
                  value={draft.rsrpMin}
                  onChange={(e) => setDraft((s) => ({ ...s, rsrpMin: e.target.value }))}
                  size="small"
                  inputProps={{ step: 1 }}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Max (dBm)"
                  value={draft.rsrpMax}
                  onChange={(e) => setDraft((s) => ({ ...s, rsrpMax: e.target.value }))}
                  size="small"
                  inputProps={{ step: 1 }}
                />
              </Grid>
            </Grid>
            <Paper sx={{ mt: 2, p: 1.5, backgroundColor: '#e3f2fd', borderRadius: 2 }}>
              <Typography variant="caption" color="primary" fontWeight="500">
                💡 Typical RSRP range: -140 to -44 dBm
              </Typography>
            </Paper>
          </Box>
        ),
        onApply: applySettings,
      }}
    >
      {/* Main Container */}
      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          gap: 2,
          p: 2,
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* LEFT SIDE - Pie Chart */}
        <Box
          sx={{
            flex: '0 0 55%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <Box sx={{ position: 'relative' }}>
            <PieChart
              series={[
                {
                  data: chartData,
                  highlightScope: { faded: 'global', highlighted: 'item' },
                  faded: {
                    innerRadius: 25,
                    additionalRadius: -25,
                    color: 'gray',
                  },
                  innerRadius: 60,
                  outerRadius: 110,
                  paddingAngle: 3,
                  cornerRadius: 8,
                  arcLabel: (item) => `${item.percentage}%`,
                  arcLabelMinAngle: 20,
                  arcLabelRadius: '70%',
                  valueFormatter: (item) =>
                    `${formatNumber(item.value)} (${item.percentage}%)`,
                },
              ]}
              colors={chartData.map((item) => item.color)}
              width={280}
              height={280}
              slotProps={{
                legend: { hidden: true },
              }}
              sx={{
                '& .MuiPieArc-root': {
                  stroke: '#ffffff',
                  strokeWidth: 3,
                  filter: 'drop-shadow(3px 5px 8px rgba(0,0,0,0.2))',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer',
                  '&:hover': {
                    filter: 'drop-shadow(5px 8px 15px rgba(0,0,0,0.35))',
                    transform: 'scale(1.03)',
                  },
                },
                '& .MuiChartsArcLabel-root': {
                  fill: '#ffffff',
                  fontWeight: 700,
                  fontSize: '12px',
                  textShadow: '1px 1px 3px rgba(0,0,0,0.6)',
                },
              }}
              margin={{ top: 20, bottom: 20, left: 20, right: 20 }}
            />

            {/* Center Label */}
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none',
              }}
            >
              <Typography
                variant="h5"
                fontWeight="800"
                sx={{
                  background: 'linear-gradient(135deg, #1976d2, #42a5f5)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  lineHeight: 1.1,
                }}
              >
                {formatNumber(totalValue)}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: '#666',
                  fontSize: '11px',
                  display: 'block',
                }}
              >
                Total Samples
              </Typography>
              {chartData.length > 0 && (
                <Chip
                  icon={<TrendingUp sx={{ fontSize: 14 }} />}
                  label={chartData[0].label}
                  size="small"
                  sx={{
                    mt: 0.5,
                    height: 20,
                    fontSize: '9px',
                    background: chartData[0].gradient,
                    color: chartData[0].color === '#ffc107' ? '#333' : '#fff',
                    fontWeight: 600,
                  }}
                />
              )}
            </Box>
          </Box>

          {/* Stats Below Chart */}
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <Chip
              size="small"
              label={`${chartData.length} Operators`}
              sx={{ fontSize: '10px', height: 22, backgroundColor: '#f5f5f5', fontWeight: 500 }}
            />
            <Chip
              size="small"
              label={`Avg: ${formatNumber(avgValue)}`}
              sx={{ fontSize: '10px', height: 22, backgroundColor: '#f5f5f5', fontWeight: 500 }}
            />
          </Box>
        </Box>

        {/* RIGHT SIDE - Beautiful Legend */}
        <Box
          sx={{
            flex: '0 0 42%',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            overflowY: 'auto',
            pr: 0.5,
            '&::-webkit-scrollbar': {
              width: '6px',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: '#ccc',
              borderRadius: '3px',
            },
          }}
        >
          {/* Legend Title */}
          <Typography
            variant="subtitle2"
            fontWeight="700"
            sx={{
              color: '#333',
              mb: 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
             Operator Rankings
          </Typography>

          {/* Legend Items */}
          {chartData.map((item, index) => (
            <Paper
              key={index}
              elevation={3}
              sx={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 2,
                transition: 'all 0.3s ease',
                cursor: 'pointer',
                border: `2px solid ${item.color}20`,
                '&:hover': {
                  
                  boxShadow: `0 6px 20px ${item.color}40`,
                  borderColor: item.color,
                },
              }}
            >
              {/* Gradient Background */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: `linear-gradient(90deg, ${item.lightColor} 0%, #ffffff 100%)`,
                  opacity: 0.6,
                }}
              />

              {/* Content */}
              <Box
                sx={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1,
                }}
              >
                {/* Rank Badge */}
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '8px',
                    background: item.gradient,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: item.color === '#ffc107' ? '#333' : '#fff',
                    fontWeight: 800,
                    fontSize: '16px',
                    boxShadow: `0 4px 10px ${item.color}50`,
                    flexShrink: 0,
                  }}
                >
                  #{item.rank}
                </Box>

                {/* Operator Info */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    fontWeight="700"
                    sx={{
                      color: '#333',
                      lineHeight: 1.2,
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      mb: 0.5,
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>{item.icon}</span>
                    {item.label}
                  </Typography>

                  {/* Progress Bar */}
                  <Box
                    sx={{
                      height: 3,
                      backgroundColor: '#e0e0e0',
                      borderRadius: 3,
                      overflow: 'hidden',
                      mb: 0.5,
                    }}
                  >
                    <Box
                      sx={{
                        height: '100%',
                        width: `${item.percentage}%`,
                        background: item.gradient,
                        transition: 'width 0.5s ease',
                        boxShadow: `0 0 8px ${item.color}80`,
                      }}
                    />
                  </Box>

                  {/* Stats */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: '#666',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      {formatNumber(item.value)} samples
                    </Typography>
                    <Chip
                      label={`${item.percentage}%`}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '10px',
                        fontWeight: 700,
                        background: item.gradient,
                        color: item.color === '#ffc107' ? '#333' : '#fff',
                      }}
                    />
                  </Box>
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      </Box>
    </ChartCard>
  );
};

export default CoverageRankingChart;