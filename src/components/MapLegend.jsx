import React, { useMemo } from 'react';
import { COLOR_SCHEMES } from '@/utils/colorUtils';

const SIGNAL_QUALITY_LEGEND = [
  { label: 'Excellent', color: '#22c55e', range: '-75 to -80 dBm' },
  { label: 'Good', color: '#86efac', range: '-82 to -85 dBm' },
  { label: 'Fair', color: '#fbbf24', range: '-90 to -95 dBm' },
  { label: 'Poor', color: '#fb923c', range: '-98 to -102 dBm' },
  { label: 'Very Poor', color: '#ef4444', range: '-105+ dBm' },
];

const LEGEND_CONFIG = {
  provider: { title: 'Operators', scheme: 'provider' },
  operator: { title: 'Operators', scheme: 'provider' },
  technology: { title: 'Technology', scheme: 'technology' },
  tech: { title: 'Technology', scheme: 'technology' },
  band: { title: 'Frequency Bands', scheme: 'band' },
};

const getLegendItems = (scheme) => {
  const colorScheme = COLOR_SCHEMES[scheme];
  if (!colorScheme) return [];
  
  return Object.entries(colorScheme)
    .filter(([key]) => key !== 'Unknown')
    .map(([label, color]) => ({ label, color }));
};

const MapLegend = ({ 
  colorBy = 'metric',   
  showSignalQuality = false 
}) => {
  
  const activeLegend = useMemo(() => {
    const config = LEGEND_CONFIG[colorBy];
    if (!config) return null;
    
    return {
      title: config.title,
      items: getLegendItems(config.scheme)
    };
  }, [colorBy]);

  const shouldShowSignal = showSignalQuality || colorBy === 'metric' || !colorBy;

  if (!activeLegend && !shouldShowSignal) return null;

  return (
    <div className="absolute top-2 right-2 z-10 bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 min-w-[200px] max-w-[250px]">
      <h3 className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        Map Legend
      </h3>
      
      {activeLegend && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {activeLegend.title}
          </div>
          
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {activeLegend.items.map(({ label, color }) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full border border-gray-300 shadow-sm flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {shouldShowSignal && (
        <div className={activeLegend ? "pt-2 border-t border-gray-200 dark:border-gray-700" : ""}>
          <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Signal Quality (RSRP)
          </div>
          <div className="space-y-1.5">
            {SIGNAL_QUALITY_LEGEND.map(({ label, color, range }) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-800 dark:text-gray-200">
                    {label}
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400">
                    {range}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapLegend;