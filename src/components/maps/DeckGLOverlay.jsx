// components/maps/DeckGLOverlay.jsx
import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { ScatterplotLayer } from '@deck.gl/layers';

// Convert hex color to RGB array
const hexToRgb = (hex) => {
  if (!hex) return [128, 128, 128];
  
  // Handle shorthand hex
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16),
    ];
  }
  
  // Handle shorthand like #fff
  const shorthand = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
  if (shorthand) {
    return [
      parseInt(shorthand[1] + shorthand[1], 16),
      parseInt(shorthand[2] + shorthand[2], 16),
      parseInt(shorthand[3] + shorthand[3], 16),
    ];
  }
  
  return [128, 128, 128];
};

// Pre-compute colors for better performance
const createColorCache = () => {
  const cache = new Map();
  return (hex) => {
    if (cache.has(hex)) return cache.get(hex);
    const rgb = hexToRgb(hex);
    cache.set(hex, rgb);
    return rgb;
  };
};

const DeckGLOverlay = ({
  map,
  locations,
  getColor,
  radius = 8,
  opacity = 1,
  selectedIndex = null,
  onClick,
  enablePicking = true,
  radiusMinPixels = 2,
  radiusMaxPixels = 50,
}) => {
  const overlayRef = useRef(null);
  const colorCacheRef = useRef(createColorCache());

  // Initialize overlay
  useEffect(() => {
    if (!map) return;

    const overlay = new GoogleMapsOverlay({
      interleaved: true,
    });
    
    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      overlay.setMap(null);
      overlayRef.current = null;
    };
  }, [map]);

  // Pre-compute position data for better performance
  const positionData = useMemo(() => {
    if (!locations?.length) return null;

    // Use Float32Array for better memory efficiency with large datasets
    const positions = new Float32Array(locations.length * 2);
    const colors = new Uint8Array(locations.length * 4);
    const colorCache = colorCacheRef.current;

    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      const idx2 = i * 2;
      const idx4 = i * 4;

      positions[idx2] = loc.lng;
      positions[idx2 + 1] = loc.lat;

      const hexColor = getColor(loc);
      const rgb = colorCache(hexColor);
      
      colors[idx4] = rgb[0];
      colors[idx4 + 1] = rgb[1];
      colors[idx4 + 2] = rgb[2];
      colors[idx4 + 3] = Math.round(opacity * 255);
    }

    return { positions, colors, length: locations.length };
  }, [locations, getColor, opacity]);

  // Create and update layer
  useEffect(() => {
    if (!overlayRef.current || !positionData) {
      overlayRef.current?.setProps({ layers: [] });
      return;
    }

    const { positions, colors, length } = positionData;

    const scatterLayer = new ScatterplotLayer({
      id: 'location-scatter',
      data: { length, attributes: { getPosition: { value: positions, size: 2 } } },
      
      // Optimized for large datasets
      _dataDiff: null,
      positionFormat: 'XY',
      
      getPosition: (_, { index, target }) => {
        target[0] = positions[index * 2];
        target[1] = positions[index * 2 + 1];
        target[2] = 0;
        return target;
      },
      
      getFillColor: (_, { index, target }) => {
        const idx4 = index * 4;
        target[0] = colors[idx4];
        target[1] = colors[idx4 + 1];
        target[2] = colors[idx4 + 2];
        target[3] = colors[idx4 + 3];
        return target;
      },

      getRadius: (_, { index }) => {
        return selectedIndex === index ? radius * 1.5 : radius;
      },

      radiusScale: 1,
      radiusMinPixels,
      radiusMaxPixels,
      radiusUnits: 'pixels',
      
      filled: true,
      stroked: selectedIndex !== null,
      lineWidthMinPixels: 1,
      getLineColor: [255, 255, 255, 200],
      getLineWidth: (_, { index }) => selectedIndex === index ? 2 : 0,
      
      pickable: enablePicking,
      autoHighlight: enablePicking,
      highlightColor: [255, 255, 255, 100],
      
      onClick: enablePicking ? (info) => {
        if (info.index >= 0 && onClick) {
          onClick(info.index, locations[info.index]);
        }
      } : undefined,

      // Performance optimizations
      updateTriggers: {
        getFillColor: [colors],
        getRadius: [selectedIndex, radius],
        getLineWidth: [selectedIndex],
      },

      // GPU acceleration settings
      parameters: {
        depthTest: false,
      },
    });

    overlayRef.current.setProps({
      layers: [scatterLayer],
    });
  }, [positionData, radius, selectedIndex, onClick, enablePicking, radiusMinPixels, radiusMaxPixels, locations]);

  return null;
};

export default React.memo(DeckGLOverlay);