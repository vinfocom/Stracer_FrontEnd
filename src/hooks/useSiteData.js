// src/hooks/useSiteData.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { mapViewApi } from '@/api/apiEndpoints';

const getFirstFiniteNumber = (values = [], fallback = 0) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return fallback;
};

const normalizeBeamwidth = (value, fallback = 65) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(5, Math.min(180, numeric));
};

const normalizeSectorRange = (value, fallback = 220) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(20, Math.min(5000, numeric));
};

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
  sitePredictionVersion = "original",
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
  }, [enableSiteToggle, siteToggle, sitePredictionVersion, siteData.length]);

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
      sitePredictionVersion,
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
      const normalizedVersion =
        String(sitePredictionVersion || "original").toLowerCase() === "updated"
          ? "updated"
          : "original";

      switch (siteToggle) {
        case 'Cell':
          response = await mapViewApi.getSitePrediction({
            ...params,
            version: normalizedVersion,
          });
          break;
        case 'NoML': response = await mapViewApi.getSiteNoMl(params); break;
        case 'ML': response = await mapViewApi.getSiteMl(params); break;
        default: response = { data: [] };
      }

      if (!isMounted.current) return;

      const rawData = response?.data?.Data || response?.data?.data || response?.Data || response?.data || [];
      
      const normalizedData = Array.isArray(rawData) 
        ? rawData.map((item, index) => {
          const earfcnValue = item.earfcn_or_narfcn ?? item.earfcn ?? item.Earfcn;
          const earfcnNum = Number(earfcnValue);
          const inferredTechnology =
            Number.isFinite(earfcnNum) ? (earfcnNum >= 100000 ? "5G" : "4G") : "Unknown";

          return {
            ...item,
            site:
              item.site ||
              item.site_id ||
              item.siteId ||
              item.site_key_inferred ||
              item.siteKeyInferred ||
              item.nodeb_id ||
              item.nodebId ||
              item.cell_id_representative ||
              item.cellIdRepresentative ||
              `site_${index}`,
            lat: parseFloat(item.lat_pred || item.lat || item.latitude || 0),
            lng: parseFloat(item.lon_pred || item.lng || item.lon || item.longitude || 0),
            azimuth: getFirstFiniteNumber([item.azimuth_deg_5, item.azimuth_deg_5_soft, item.azimuth], 0),
            beamwidth: normalizeBeamwidth(
              getFirstFiniteNumber([item.bw, item.beamwidth, item.beamwidth_deg_est], 65),
              65,
            ),
            range: normalizeSectorRange(getFirstFiniteNumber([item.range, item.radius], 220), 220),
            operator: item.network || item.Network || item.cluster || "Unknown",
            band: item.band || item.frequency_band || item.frequency || "Unknown",
            technology: item.Technology || item.tech || item.technology || inferredTechnology,
            pci:
              item.pci ??
              item.PCI ??
              item.pci_or_psi ??
              item.cell_id ??
              item.cell_id_representative,
            id:
              item.original_id ??
              item.id ??
              item.cell_id ??
              item.cell_id_representative ??
              item.site ??
              item.site_id ??
              item.siteId ??
              item.site_key_inferred ??
              index,
          };
        }).filter(item => item.lat !== 0 && !isNaN(item.lat))
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
  }, [enableSiteToggle, siteToggle, sitePredictionVersion, projectId, sessionIds, siteData.length, filterEnabled, polygons]);

  useEffect(() => {
    if (autoFetch) {
      fetchSiteData();
    }
  }, [fetchSiteData, autoFetch]);

  return { siteData, loading, error, fetchSiteData };
};
