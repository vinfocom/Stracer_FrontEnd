// src/hooks/useSiteData.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { mapViewApi } from '@/api/apiEndpoints';

export const useSiteData = ({ 
  enableSiteToggle, 
  siteToggle, 
  projectId, 
  sessionIds,
  autoFetch = true 
}) => {
  const [siteData, setSiteData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const isMounted = useRef(true);
  const lastFetchParams = useRef(null);

  const fetchSiteData = useCallback(async () => {
    if (!enableSiteToggle) {
      setSiteData([]);
      setLoading(false);
      return;
    }

    const currentParams = JSON.stringify({ siteToggle, projectId, sessionIds });
    
    if (lastFetchParams.current === currentParams && siteData.length > 0) {
      console.log('⏭️ Skipping duplicate site data fetch');
      return;
    }

    setLoading(true);
    setError(null);
    lastFetchParams.current = currentParams;
    
    try {
      const params = {
        projectId: projectId || '',
        sessionIds: Array.isArray(sessionIds) ? sessionIds.join(',') : sessionIds || '',
      };

      let response;
      
      switch (siteToggle) {
        case 'Cell':
          console.log('🗼 Fetching Cell (Site Prediction) data...');
          response = await mapViewApi.getSitePrediction(params);
          break;
        case 'NoML':
          console.log('🗼 Fetching NoML site data...');
          response = await mapViewApi.getSiteNoMl(params);
          break;
        case 'ML':
          console.log('🗼 Fetching ML site data...');
          response = await mapViewApi.getSiteMl(params);
          break;
        default:
          response = { data: [] };
      }

      if (!isMounted.current) return;

      const rawData = response?.data?.Data || response?.data?.data || response?.Data || response?.data || [];
      
      const normalizedData = Array.isArray(rawData) 
        ? rawData.map((item, index) => ({
            site: item.site || item.site_id || item.siteId || `site_${index}`,
            site_name: item.site_name || item.siteName || item.name,
            cell_id: item.cell_id || item.cellId || item.id || `cell_${index}`,
            lat: parseFloat(item.lat || item.latitude || 0),
            lng: parseFloat(item.lng || item.lon || item.longitude || 0),
            azimuth: parseFloat(item.azimuth || 0),
            beamwidth: parseFloat(item.beamwidth || item.beam_width || 65),
            range: parseFloat(item.range || item.radius || 220),
            operator: item.operator || item.operator_name,
            tech: item.tech || item.technology,
            band: item.band || item.frequency_band,
            _raw: item
          }))
          .filter(item => 
            !isNaN(item.lat) && 
            !isNaN(item.lng) && 
            Math.abs(item.lat) <= 90 && 
            Math.abs(item.lng) <= 180
          )
        : [];

      setSiteData(normalizedData);
      console.log(`✅ Loaded ${normalizedData.length} site records (${siteToggle})`);
      
    } catch (err) {
      console.error('Error fetching site data:', err);
      if (isMounted.current) {
        setError(err);
        setSiteData([]);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [enableSiteToggle, siteToggle, projectId, sessionIds, siteData.length]);

  useEffect(() => {
    if (autoFetch) {
      fetchSiteData();
    }
  }, [fetchSiteData, autoFetch]);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  return { 
    siteData, 
    loading, 
    error, 
    refetch: fetchSiteData,
    isEmpty: siteData.length === 0
  };
};