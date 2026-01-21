import { useMemo } from 'react';
import { useProjectPolygons } from './useProjectPolygons';
import { useNetworkSamples } from './useNetworkSamples';
import { useSessionNeighbors } from './useSessionNeighbors';
import { PolygonChecker } from '@/utils/polygonUtils';

export const useFilteredLogs = (sessionIds, projectId, options = {}) => {
  const { 
    enablePolygonFilter = true, 
    polygonSource = 'map' 
  } = options;

  // 1. Fetch Polygons
  const { polygons, loading: polyLoading } = useProjectPolygons(
    projectId, 
    enablePolygonFilter, 
    polygonSource
  );

  // 2. Fetch Raw Logs
  const { locations: rawLocations, loading: locLoading, progress } = useNetworkSamples(sessionIds);
  const { neighborData: rawNeighbors, loading: neighborLoading } = useSessionNeighbors(sessionIds);

  // 3. Initialize Checker
  const checker = useMemo(() => new PolygonChecker(polygons), [polygons]);

  // 4. Filter Logs Immediately as they arrive
  const filteredLocations = useMemo(() => {
    return checker.filter(rawLocations);
  }, [rawLocations, checker]);

  const filteredNeighbors = useMemo(() => {
    return checker.filter(rawNeighbors);
  }, [rawNeighbors, checker]);

  return {
    locations: filteredLocations,
    neighbors: filteredNeighbors,
    polygons,
    loading: polyLoading || locLoading || neighborLoading,
    progress
  };
};