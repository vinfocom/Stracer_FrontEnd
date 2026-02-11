// src/hooks/useSiteData.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { mapViewApi } from '@/api/apiEndpoints';

export const useSiteData = ({ 
  enableSiteToggle, 
  siteToggle, 
  projectId, 
  sessionIds,
  autoFetch = false 
}) => {
  const [siteData, setSiteData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const isMounted = useRef(true);
  const lastFetchParams = useRef(null);

  // DEBUG: Log current state on every render
  useEffect(() => {
    console.log(`[useSiteData] Hook Rendered. enableSiteToggle: ${enableSiteToggle}, siteToggle: ${siteToggle}, Data Length: ${siteData.length}`);
  }, [enableSiteToggle, siteToggle, siteData.length]);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const fetchSiteData = useCallback(async () => {
    console.log(`[useSiteData] fetchSiteData CALLED. enableSiteToggle: ${enableSiteToggle}`);

    // If the toggle is not enabled, we clear data and stop
    if (!enableSiteToggle) {
      console.log("[useSiteData] Toggle is OFF. Clearing siteData and returning.");
      setSiteData([]);
      setLoading(false);
      lastFetchParams.current = null;
      return;
    }

    // Prevents duplicate calls
    const currentParams = JSON.stringify({ siteToggle, projectId, sessionIds });
    if (lastFetchParams.current === currentParams && siteData.length > 0) {
      console.log("[useSiteData] Params unchanged and data exists. Skipping fetch.");
      return;
    }

    console.log(`[useSiteData] Starting API call for ${siteToggle}...`);
    setLoading(true);
    setError(null);
    lastFetchParams.current = currentParams;
    
    try {
      const params = { projectId: projectId || '' };
      let response;

      switch (siteToggle) {
        case 'Cell': response = await mapViewApi.getSitePrediction(params); break;
        case 'NoML': response = await mapViewApi.getSiteNoMl(params); break;
        case 'ML': response = await mapViewApi.getSiteMl(params); break;
        default: response = { data: [] };
      }

      if (!isMounted.current) return;

      const rawData = response?.data?.Data || response?.data?.data || response?.Data || response?.data || [];
      console.log(`[useSiteData] API Response received. Raw items: ${rawData.length}`);
      
      const normalizedData = Array.isArray(rawData) 
        ? rawData.map((item, index) => ({
            site: item.site || item.site_id || `site_${index}`,
            lat: parseFloat(item.lat_pred || item.lat || item.latitude || 0),
            lng: parseFloat(item.lon_pred || item.lng || item.lon || item.longitude || 0),
            azimuth: parseFloat(item.azimuth_deg_5 || item.azimuth || 0),
            beamwidth: parseFloat(item.beamwidth_deg_est || item.beamwidth || 65),
            range: parseFloat(item.range || item.radius || 220),
            operator: item.network || item.Network || item.cluster || "Unknown",
            band: item.band ||  "Unknown",
            technology: item.Technology || item.tech || "Unknown",
            // Helper for unique ID
            id: item.cell_id || item.site || index
          })).filter(item => item.lat !== 0 && !isNaN(item.lat))
        : [];

      console.log(`[useSiteData] Setting siteData. Normalized items: ${normalizedData.length}`);
      setSiteData(normalizedData);

    } catch (err) {
      console.error("[useSiteData] API Error:", err);
      if (isMounted.current) {
        setError(err);
        setSiteData([]);
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [enableSiteToggle, siteToggle, projectId, sessionIds, siteData.length]);

  useEffect(() => {
    if (autoFetch) {
      fetchSiteData();
    }
  }, [fetchSiteData, autoFetch]);

  return { siteData, loading, error, fetchSiteData };
};