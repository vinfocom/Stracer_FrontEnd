// src/hooks/useColorForLog.js
import { settingApi } from "@/api/apiEndpoints";
import { useCallback, useEffect, useState } from "react";
import { getLogColor } from "@/utils/colorUtils";

function useColorForLog() {
    const [parsedData, setParsedData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchThreshold = async () => {
            try {
                setLoading(true);
                const res = await settingApi.getThresholdSettings();
                
                if (res.Status === 1) {
                    const data = res.Data;
                    // ✅ FIX: Using snake_case keys to match src/utils/metrics.js
                    const parsed = {
                        id: data.id,
                        userId: data.user_id,
                        isDefault: data.is_default,
                        coverageHole: JSON.parse(data.coveragehole_json),
                        rsrp: JSON.parse(data.rsrp_json),
                        rsrq: JSON.parse(data.rsrq_json),
                        sinr: JSON.parse(data.sinr_json),
                        dl_thpt: JSON.parse(data.dl_thpt_json), // Fixed key
                        ul_thpt: JSON.parse(data.ul_thpt_json), // Fixed key
                        volteCall: JSON.parse(data.volte_call),
                        lte_bler: JSON.parse(data.lte_bler_json), // Fixed key
                        mos: JSON.parse(data.mos_json)
                    };
                    setParsedData(parsed);
                }
            } catch (err) {
                console.error("Error fetching thresholds:", err);
                setError(err);
            } finally {
                setLoading(false);
            }
        };

        fetchThreshold();
    }, []);

    const getMetricColor = useCallback((value, metric) => {
        const lowerMetric = metric?.toLowerCase();

        // 1. Handle Categorical Coloring (Provider, Technology, Band)
        if (['provider', 'technology', 'band'].includes(lowerMetric)) {
            return getLogColor(lowerMetric, value);
        }

        // 2. Handle Numeric/Threshold Coloring
        if (value === null || value === undefined || isNaN(value)) {
            return "#808080";
        }

        if (!parsedData) {
            return "#808080";
        }

        // ✅ FIX: Map all input keys to the snake_case keys in parsedData
        const metricKeyMap = {
            'rsrp': 'rsrp',
            'rsrq': 'rsrq',
            'sinr': 'sinr',
            'dl_thpt': 'dl_thpt',
            'dl_tpt': 'dl_thpt',
            'ul_thpt': 'ul_thpt',
            'ul_tpt': 'ul_thpt',
            'mos': 'mos',
            'lte_bler': 'lte_bler',
            'volte_call': 'volteCall',
            'coveragehole': 'coverageHole'
        };

        const key = metricKeyMap[lowerMetric] || lowerMetric;
        const thresholds = parsedData[key];

        if (!thresholds || !Array.isArray(thresholds)) {
            return "#808080";
        }

        for (const thres of thresholds) {
            const min = parseFloat(thres.min);
            const max = parseFloat(thres.max);
            
            if (value >= min && value < max) {
                return thres.color;
            }
        }

        // Handle edge cases
        const lastThreshold = thresholds[thresholds.length - 1];
        if (value >= parseFloat(lastThreshold.max)) {
            return lastThreshold.color;
        }

        const firstThreshold = thresholds[0];
        if (value < parseFloat(firstThreshold.min)) {
            return firstThreshold.color;
        }

        return "#808080";
    }, [parsedData]);

    const getThresholdInfo = useCallback((value, metric) => {
        if (!parsedData || value === null || value === undefined) {
            return null;
        }

        const metricKeyMap = {
            'rsrp': 'rsrp',
            'rsrq': 'rsrq',
            'sinr': 'sinr',
            'dl_thpt': 'dl_thpt',
            'dl_tpt': 'dl_thpt',
            'ul_thpt': 'ul_thpt',
            'ul_tpt': 'ul_thpt',
            'mos': 'mos',
            'lte_bler': 'lte_bler'
        };

        const key = metricKeyMap[metric?.toLowerCase()] || metric?.toLowerCase();
        const thresholds = parsedData[key];

        if (!thresholds || !Array.isArray(thresholds)) {
            return null;
        }

        for (const thres of thresholds) {
            if (value >= parseFloat(thres.min) && value <= parseFloat(thres.max)) {
                return {
                    color: thres.color,
                    label: thres.label,
                    range: thres.range,
                    min: thres.min,
                    max: thres.max
                };
            }
        }

        return null;
    }, [parsedData]);

    const getThresholdsForMetric = useCallback((metric) => {
        if (!parsedData) return null;

        const metricKeyMap = {
            'rsrp': 'rsrp',
            'rsrq': 'rsrq',
            'sinr': 'sinr',
            'dl_thpt': 'dl_thpt',
            'dl_tpt': 'dl_thpt',
            'ul_thpt': 'ul_thpt',
            'ul_tpt': 'ul_thpt',
            'mos': 'mos',
            'lte_bler': 'lte_bler'
        };

        const key = metricKeyMap[metric?.toLowerCase()] || metric?.toLowerCase();
        return parsedData[key] || null;
    }, [parsedData]);

    return {
        getMetricColor,
        getThresholdInfo,
        getThresholdsForMetric,
        thresholds: parsedData,
        loading,
        error,
        isReady: !loading && parsedData !== null
    };
}

export default useColorForLog;