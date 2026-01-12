// src/components/maps/DeckGLOverlay.jsx
import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { ScatterplotLayer, PolygonLayer } from '@deck.gl/layers';

// Convert meters to degrees for square bounds
const metersToLatDeg = (meters) => meters / 111320;
const metersToLngDeg = (meters, lat) => meters / (111320 * Math.cos((lat * Math.PI) / 180));

// Generate square polygon coordinates
const getSquarePolygon = (lat, lng, sizeMeters) => {
  const halfLatDeg = metersToLatDeg(sizeMeters / 2);
  const halfLngDeg = metersToLngDeg(sizeMeters / 2, lat);
  
  return [
    [lng - halfLngDeg, lat - halfLatDeg],
    [lng + halfLngDeg, lat - halfLatDeg],
    [lng + halfLngDeg, lat + halfLatDeg],
    [lng - halfLngDeg, lat + halfLatDeg],
    [lng - halfLngDeg, lat - halfLatDeg], // Close the polygon
  ];
};

// Parse hex color to RGB array
const hexToRgb = (hex) => {
  if (!hex || typeof hex !== 'string') return [128, 128, 128, 200];
  
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16),
      200, // Alpha
    ];
  }
  return [128, 128, 128, 200];
};

const DeckGLOverlay = ({
  map,
  // Primary locations (circles)
  locations = [],
  getColor,
  radius = 8,
  opacity = 0.8,
  selectedIndex = null,
  onClick,
  radiusMinPixels = 2,
  radiusMaxPixels = 40,
  showPrimaryLogs = true,
  
  // Neighbor locations (squares)
  neighbors = [],
  getNeighborColor,
  neighborSquareSize = 25, // meters
  neighborOpacity = 0.7,
  onNeighborClick,
  showNeighbors = true,
  
  // Shared
  pickable = true,
  autoHighlight = true,
}) => {
  const overlayRef = useRef(null);
  const layersRef = useRef([]);

  // Initialize overlay
  useEffect(() => {
    if (!map) return;

    if (!overlayRef.current) {
      overlayRef.current = new GoogleMapsOverlay({
        interleaved: true,
      });
    }

    overlayRef.current.setMap(map);

    return () => {
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
        overlayRef.current.finalize();
        overlayRef.current = null;
      }
    };
  }, [map]);

  // Handle primary location click
  const handlePrimaryClick = useCallback((info, event) => {
    if (info.object && onClick) {
      onClick(info.index, info.object);
    }
  }, [onClick]);

  // Handle neighbor click
  const handleNeighborClick = useCallback((info, event) => {
    if (info.object && onNeighborClick) {
      onNeighborClick(info.object);
    }
  }, [onNeighborClick]);

  // Memoize primary locations data
  const primaryData = useMemo(() => {
    if (!showPrimaryLogs || !locations?.length) return [];
    
    return locations.map((loc, idx) => ({
      ...loc,
      index: idx,
      position: [loc.lng, loc.lat],
      color: getColor ? hexToRgb(getColor(loc)) : [16, 185, 129, 200],
    }));
  }, [locations, showPrimaryLogs, getColor]);

  // Memoize neighbor data with pre-computed polygons
  const neighborData = useMemo(() => {
    if (!showNeighbors || !neighbors?.length) return [];
    
    return neighbors.map((n, idx) => ({
      ...n,
      index: idx,
      polygon: getSquarePolygon(n.lat, n.lng, neighborSquareSize),
      color: getNeighborColor ? hexToRgb(getNeighborColor(n)) : [139, 92, 246, 180],
    }));
  }, [neighbors, showNeighbors, neighborSquareSize, getNeighborColor]);

  // Create and update layers
  useEffect(() => {
    if (!overlayRef.current || !map) return;

    const layers = [];

    // Primary locations layer (Circles)
    

    // Neighbor locations layer (Squares)
    if (showNeighbors && neighborData.length > 0) {
      const polygonLayer = new PolygonLayer({
        id: 'neighbor-logs-layer',
        data: neighborData,
        getPolygon: d => d.polygon,
        getFillColor: d => d.color,
        getLineColor: d => {
          const c = d.color;
          return [c[0], c[1], c[2], 220]; // Slightly more opaque for border
        },
        getLineWidth: 1,
        lineWidthMinPixels: 1,
        lineWidthMaxPixels: 3,
        filled: true,
        stroked: true,
        opacity: neighborOpacity,
        pickable,
        autoHighlight,
        highlightColor: [255, 255, 0, 180],
        onClick: handleNeighborClick,
        updateTriggers: {
          getFillColor: [getNeighborColor],
          getPolygon: [neighborSquareSize],
        },
        // Performance optimizations
        parameters: {
          depthTest: false,
        },
      });
      layers.push(polygonLayer);
    }

    if (showPrimaryLogs && primaryData.length > 0) {
      const scatterLayer = new ScatterplotLayer({
        id: 'primary-logs-layer',
        data: primaryData,
        getPosition: d => d.position,
        getFillColor: d => d.color,
        getRadius: d => d.index === selectedIndex ? radius * 1 : radius,
        radiusMinPixels,
        radiusMaxPixels,
        opacity,
        pickable,
        autoHighlight,
        highlightColor: [255, 255, 0, 200],
        onClick: handlePrimaryClick,
        updateTriggers: {
          getFillColor: [getColor],
          getRadius: [selectedIndex, radius],
        },
        // Performance optimizations
        parameters: {
          depthTest: false,
        },
        extensions: [],
      });
      layers.push(scatterLayer);
    }

    layersRef.current = layers;
    overlayRef.current.setProps({ layers });

    // Log performance info in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[DeckGLOverlay] Layers updated:', {
        primaryCount: primaryData.length,
        neighborCount: neighborData.length,
        totalLayers: layers.length,
      });
    }
  }, [
    map, 
    primaryData, 
    neighborData, 
    showPrimaryLogs, 
    showNeighbors,
    selectedIndex, 
    radius, 
    radiusMinPixels, 
    radiusMaxPixels, 
    opacity,
    neighborOpacity,
    neighborSquareSize,
    pickable, 
    autoHighlight,
    handlePrimaryClick,
    handleNeighborClick,
    getColor,
    getNeighborColor,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (overlayRef.current) {
        overlayRef.current.setProps({ layers: [] });
      }
    };
  }, []);

  return null; // This component doesn't render DOM elements
};

export default React.memo(DeckGLOverlay);