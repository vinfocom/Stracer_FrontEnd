// src/hooks/useSiteData.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { mapViewApi } from '@/api/apiEndpoints';

const isPointInPolygon = (point, polygon) => {
  const path = Array.isArray(polygon?.paths?.[0])
    ? polygon.paths[0]
    : Array.isArray(polygon?.paths) && polygon.paths[0]?.lat != null
      ? polygon.paths
      : Array.isArray(polygon?.path) && polygon.path[0]?.lat != null
        ? polygon.path
        : null;
  if (!path?.length) return false;
  const lat = point.lat ?? point.latitude;
  const lng = point.lng ?? point.longitude;
  if (lat == null || lng == null) return false;

  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const { lng: xi, lat: yi } = path[i];
    const { lng: xj, lat: yj } = path[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

export const useSiteData = ({ 
  enableSiteToggle, 
  siteToggle, 
  projectId, 
  sessionIds,
  autoFetch = false,
  filterEnabled = false,
  polygons = [],
}) => {
  const [siteData, setSiteData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const isMounted = useRef(true);
  const lastFetchParams = useRef(null);

  // DEBUG: Log current state on every render
  useEffect(() => {
  }, [enableSiteToggle, siteToggle, siteData.length]);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const fetchSiteData = useCallback(async () => {

    // If the toggle is not enabled, we clear data and stop
    if (!enableSiteToggle) {
      setSiteData([]);
      setLoading(false);
      lastFetchParams.current = null;
      return;
    }

    // Prevents duplicate calls
    const currentParams = JSON.stringify({
      siteToggle,
      projectId,
      sessionIds,
      filterEnabled,
      polygons,
    });
    if (lastFetchParams.current === currentParams && siteData.length > 0) {
      return;
    }

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
      
      const normalizedData = Array.isArray(rawData) 
        ? rawData.map((item, index) => ({
          ...item,
           site: item.site || item.site_id || `site_${index}`,
            lat: parseFloat(item.lat_pred || item.lat || item.latitude || 0),
            lng: parseFloat(item.lon_pred || item.lng || item.lon || item.longitude || 0),
            azimuth: parseFloat(item.azimuth_deg_5 || item.azimuth || 0),
            beamwidth: parseFloat(item.beamwidth_deg_est || item.beamwidth || 65),
            range: parseFloat(item.range || item.radius || 220),
            operator: item.network || item.Network || item.cluster || "Unknown",
            band: item.band ||  "Unknown",
            technology: item.Technology || item.tech || "Unknown",
            pci: item.pci ?? item.PCI ?? item.pci_or_psi ?? item.cell_id, // ✅ FIX: Explicitly extract PCI
            id: item.cell_id || item.site || index
          })).filter(item => item.lat !== 0 && !isNaN(item.lat))
        : [];

      let finalData = normalizedData;
      if (filterEnabled && polygons?.length > 0) {
        finalData = normalizedData.filter((site) =>
          polygons.some((poly) => isPointInPolygon(site, poly)),
        );
      }

      setSiteData(finalData);

    } catch (err) {
      if (isMounted.current) {
        setError(err);
        setSiteData([]);
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [enableSiteToggle, siteToggle, projectId, sessionIds, siteData.length, filterEnabled, polygons]);

  useEffect(() => {
    if (autoFetch) {
      fetchSiteData();
    }
  }, [fetchSiteData, autoFetch]);

  return { siteData, loading, error, fetchSiteData };
};
