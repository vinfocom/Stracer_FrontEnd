// src/components/maps/DeckGLOverlay.jsx
import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { ScatterplotLayer, PolygonLayer, TextLayer } from '@deck.gl/layers';

// ✅ ROBUST COLOR PARSER (Handles Hex and HSL)
const parseColorToRGB = (colorStr) => {
  if (!colorStr || typeof colorStr !== 'string') return [128, 128, 128, 200];

  // 1. Handle HSL (used for dynamic providers)
  if (colorStr.startsWith('hsl')) {
    const values = colorStr.match(/\d+/g);
    if (values && values.length >= 3) {
      const h = parseInt(values[0]) / 360;
      const s = parseInt(values[1]) / 100;
      const l = parseInt(values[2]) / 100;

      let r, g, b;
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p, q, t) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 200];
    }
  }

  // 2. Handle Hex
  const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colorStr);
  if (hexMatch) {
    return [
      parseInt(hexMatch[1], 16),
      parseInt(hexMatch[2], 16),
      parseInt(hexMatch[3], 16),
      200
    ];
  }

  return [128, 128, 128, 200]; // Fallback Gray
};

// ... keep metersToLatDeg and getSquarePolygon ...

const DeckGLOverlay = ({
  map,
  showNumCells = false,
  locations = [],
  getColor,
  radius = 8,
  opacity = 0.8,
  selectedIndex = null,
  onClick,
  radiusMinPixels = 2,
  radiusMaxPixels = 40,
  showPrimaryLogs = true,
  neighbors = [],
  getNeighborColor,
  neighborSquareSize = 25,
  neighborOpacity = 0.7,
  onNeighborClick,
  showNeighbors = true,
  pickable = true,
  autoHighlight = true,
}) => {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!map) return;
    if (!overlayRef.current) {
      overlayRef.current = new GoogleMapsOverlay({ interleaved: true });
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

  const handlePrimaryClick = useCallback((info) => {
    if (info.object && onClick) onClick(info.index, info.object);
  }, [onClick]);

  const handleNeighborClick = useCallback((info) => {
    if (info.object && onNeighborClick) onNeighborClick(info.object);
  }, [onNeighborClick]);

  // Pre-compute colors in memo to avoid repeat parsing
  const primaryData = useMemo(() => {
    if (!showPrimaryLogs || !locations?.length) return [];
    return locations.map((loc, idx) => ({
      ...loc,
      index: idx,
      position: [loc.lng, loc.lat],
      // ✅ Use new robust parser
      computedColor: getColor ? parseColorToRGB(getColor(loc)) : [16, 185, 129, 200],
    }));
  }, [locations, showPrimaryLogs, getColor]);

  const neighborData = useMemo(() => {
    if (!showNeighbors || !neighbors?.length) return [];
    return neighbors.map((n, idx) => ({
      ...n,
      index: idx,
      polygon: getSquarePolygon(n.lat, n.lng, neighborSquareSize),
      // ✅ Use new robust parser
      computedColor: getNeighborColor ? parseColorToRGB(getNeighborColor(n)) : [139, 92, 246, 180],
    }));
  }, [neighbors, showNeighbors, neighborSquareSize, getNeighborColor]);

  useEffect(() => {
    if (!overlayRef.current || !map) return;

    const layers = [];

    if (showNeighbors && neighborData.length > 0) {
      layers.push(new PolygonLayer({
        id: 'neighbor-logs-layer',
        data: neighborData,
        getPolygon: d => d.polygon,
        getFillColor: d => d.computedColor, // ✅ Use pre-computed color
        getLineColor: d => [d.computedColor[0], d.computedColor[1], d.computedColor[2], 220],
        getLineWidth: 1,
        lineWidthMinPixels: 1,
        filled: true,
        stroked: true,
        opacity: neighborOpacity,
        pickable,
        autoHighlight,
        onClick: handleNeighborClick,
      }));
    }

    if (showPrimaryLogs && primaryData.length > 0) {
      layers.push(new ScatterplotLayer({
        id: 'primary-logs-layer',
        data: primaryData,
        getPosition: d => d.position,
        getFillColor: d => d.computedColor, // ✅ FIX: Use pre-computed color instead of undefined parseColor
        getRadius: d => d.index === selectedIndex ? radius * 1.5 : radius,
        radiusMinPixels,
        radiusMaxPixels,
        opacity,
        pickable,
        autoHighlight,
        onClick: handlePrimaryClick,
        updateTriggers: {
          getFillColor: [getColor],
          getRadius: [selectedIndex, radius],
        },
      }));

      if (showNumCells) {
        layers.push(new TextLayer({
          id: 'primary-logs-text-layer',
          data: primaryData,
          getPosition: d => d.position,
          getText: d => d.num_cells ? String(d.num_cells) : '',
          getSize: 14,
          getColor: [0, 0, 0, 255],
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
          background: true,
          getBackgroundColor: [255, 255, 255, 200],
        }));
      }
    }

    overlayRef.current.setProps({ layers });
  }, [map, primaryData, neighborData, showPrimaryLogs, showNeighbors, selectedIndex, radius, radiusMinPixels, radiusMaxPixels, opacity, neighborOpacity, showNumCells, getColor, getNeighborColor]);

  return null;
};

export default React.memo(DeckGLOverlay);