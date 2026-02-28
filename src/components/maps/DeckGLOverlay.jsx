// src/components/maps/DeckGLOverlay.jsx
import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { ScatterplotLayer, PolygonLayer, TextLayer } from '@deck.gl/layers';

const parseColorToRGB = (colorStr) => {
  if (!colorStr || typeof colorStr !== 'string') return [128, 128, 128, 200];

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


const metersToLatDeg = 1 / 111320;

const getSquarePolygon = (lat, lng, sizeMeters) => {
  const halfSize = sizeMeters / 2;
  const latDelta = halfSize * metersToLatDeg;
  // Adjust longitude delta based on latitude
  const lngDelta = (halfSize * metersToLatDeg) / Math.cos((lat * Math.PI) / 180);

  return [
    [lng - lngDelta, lat + latDelta], // Top Left
    [lng + lngDelta, lat + latDelta], // Top Right
    [lng + lngDelta, lat - latDelta], // Bottom Right
    [lng - lngDelta, lat - latDelta], // Bottom Left
    [lng - lngDelta, lat + latDelta]  // Close the loop
  ];
};


const DeckGLOverlay = ({
  onHover,
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
  const isCleanedUpRef = useRef(false);
  const attachedMapRef = useRef(null);
  const idleListenerRef = useRef(null);
  const attachTimerRef = useRef(null);
  const isValidMapInstance = useCallback((m) => {
    if (!m || !window.google?.maps) return false;
    if (typeof m.getDiv !== 'function') return false;
    return Boolean(m.getDiv());
  }, []);

  const canAttachOverlay = useCallback((m) => {
    if (!isValidMapInstance(m)) return false;
    if (typeof m.addListener !== 'function') return false;
    try {
      if (typeof m.getProjection === 'function' && !m.getProjection()) {
        return false;
      }
    } catch {
      return false;
    }
    return true;
  }, [isValidMapInstance]);

  useEffect(() => {
    if (!isValidMapInstance(map)) return;

    isCleanedUpRef.current = false;

    if (!overlayRef.current) {
      overlayRef.current = new GoogleMapsOverlay({ 
        interleaved: true,
        glOptions: { preserveDrawingBuffer: true } 
      });
    }

    const clearPendingAttach = () => {
      if (idleListenerRef.current && window.google?.maps?.event?.removeListener) {
        window.google.maps.event.removeListener(idleListenerRef.current);
      }
      idleListenerRef.current = null;
      if (attachTimerRef.current) {
        window.clearTimeout(attachTimerRef.current);
      }
      attachTimerRef.current = null;
    };

    const attachOverlay = () => {
      if (!overlayRef.current || isCleanedUpRef.current) return;
      if (attachedMapRef.current === map) return;
      if (!canAttachOverlay(map)) return;
      try {
        overlayRef.current.setMap(map);
        attachedMapRef.current = map;
        clearPendingAttach();
      } catch (err) {
        console.warn("Could not attach DeckGL to map instance:", err);
      }
    };

    attachOverlay();

    // Map may exist but still be mid-initialization; retry after first idle tick.
    if (attachedMapRef.current !== map && typeof map.addListener === 'function') {
      idleListenerRef.current = map.addListener('idle', attachOverlay);
      attachTimerRef.current = window.setTimeout(attachOverlay, 150);
    }

    return () => {
      clearPendingAttach();
      if (overlayRef.current) {
        try {
          overlayRef.current.setProps({ layers: [] });
          if (attachedMapRef.current === map) {
            overlayRef.current.setMap(null);
          }
        } catch (e) {
          // ignore detach errors during fast remount/unmount
        }
      }
      if (attachedMapRef.current === map) {
        attachedMapRef.current = null;
      }
    };
  }, [map, isValidMapInstance, canAttachOverlay]);

  const handlePrimaryClick = useCallback((info) => {
    if (info.object && onClick) onClick(info.index, info.object);
  }, [onClick]);

  const handleNeighborClick = useCallback((info) => {
    if (info.object && onNeighborClick) onNeighborClick(info.object);
  }, [onNeighborClick]);

  // Pre-compute colors in memo to avoid repeat parsing
  // In src/components/maps/DeckGLOverlay.jsx

  const primaryData = useMemo(() => {
    if (!showPrimaryLogs || !locations?.length) return [];
    return locations.map((loc, idx) => ({
      ...loc,
      index: idx,
      // Safely check all coordinate naming conventions
      position: [
        parseFloat(loc.lng ?? loc.longitude ?? loc.lon ?? loc.Lng ?? 0), 
        parseFloat(loc.lat ?? loc.latitude ?? loc.Lat ?? 0)
      ],
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
    if (!overlayRef.current || !isValidMapInstance(map)) return;
    if (attachedMapRef.current !== map) return;

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
        extruded: true,
        getElevation: 5,
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
        getFillColor: d => d.computedColor, 
        getRadius: d => d.index === selectedIndex ? radius * 1.5 : radius,
        radiusMinPixels,
        radiusMaxPixels,
        opacity,
        pickable,
        autoHighlight,
        onHover: onHover,
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

    try {
      overlayRef.current.setProps({ layers });
    } catch (e) {
      // Overlay can detach during map teardown; skip this update.
    }
  }, [map, primaryData, neighborData, showPrimaryLogs, showNeighbors, selectedIndex, radius, radiusMinPixels, radiusMaxPixels, opacity, neighborOpacity, showNumCells, getColor, getNeighborColor, isValidMapInstance]);

  useEffect(() => {
    return () => {
      if (idleListenerRef.current && window.google?.maps?.event?.removeListener) {
        window.google.maps.event.removeListener(idleListenerRef.current);
      }
      idleListenerRef.current = null;
      if (attachTimerRef.current) {
        window.clearTimeout(attachTimerRef.current);
      }
      attachTimerRef.current = null;
      if (!overlayRef.current || isCleanedUpRef.current) return;
      try {
        overlayRef.current.setProps({ layers: [] });
        if (attachedMapRef.current) {
          overlayRef.current.setMap(null);
        }
        overlayRef.current.finalize();
      } catch (e) {
        // ignore cleanup errors
      }
      overlayRef.current = null;
      attachedMapRef.current = null;
      isCleanedUpRef.current = true;
    };
  }, []);

  return null;
};

export default React.memo(DeckGLOverlay);
