
export const defaultThresholds = {
    RSRP: [
        { min: -140, max: -105, color: '#FF0000' },
        { min: -105, max: -95, color: '#FFFF00' },
        { min: -95, max: -90, color: '#000088' },
        { min: -90, max: -85, color: '#ADD8E6' }
    ],
    SINR: [
        { min: -20, max: 0, color: '#FF0000' },
        { min: 0, max: 10, color: '#FFFF00' },
        { min: 10, max: 20, color: '#00FF00' },
        { min: 20, max: 40, color: '#0000FF' }
    ],
    RSRQ: [
        { min: -20, max: -15, color: '#FF0000' },
        { min: -15, max: -10, color: '#FFFF00' },
        { min: -10, max: -5, color: '#00FF00' },
        { min: -5, max: 0, color: '#0000FF' }
    ]
};

export const getColorForValue = (value, metric) => {
    if (value === null || value === undefined) return '#CCCCCC';
    const thresholds = defaultThresholds[metric] || [];
    
    for (const threshold of thresholds) {
        if (value >= threshold.min && value <= threshold.max) {
            return threshold.color;
        }
    }
    
    return '#CCCCCC'; 
};