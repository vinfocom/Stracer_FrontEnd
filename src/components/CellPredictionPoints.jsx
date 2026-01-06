// src/components/CellPredictionPoints.jsx
import React, { useMemo } from "react";
import { CircleF, InfoWindowF } from "@react-google-maps/api";
import { useState } from "react";

// Hardcoded prediction points - small circles showing predicted coverage areas
const HARDCODED_PREDICTION_POINTS = [
  // High coverage areas (good signal) - Green
  { lat: 28.64453086, lng: 77.37324242, rsrp: -75, color: '#22c55e', opacity: 0.4, radius: 30 },
  { lat: 28.64523086, lng: 77.37424242, rsrp: -78, color: '#22c55e', opacity: 0.4, radius: 30 },
  { lat: 28.64383086, lng: 77.37224242, rsrp: -76, color: '#22c55e', opacity: 0.4, radius: 30 },
  
  // Medium-high coverage - Light green
  { lat: 28.64873086, lng: 77.37974242, rsrp: -82, color: '#86efac', opacity: 0.4, radius: 30 },
  { lat: 28.64943086, lng: 77.38074242, rsrp: -85, color: '#86efac', opacity: 0.4, radius: 30 },
  { lat: 28.64803086, lng: 77.37874242, rsrp: -83, color: '#86efac', opacity: 0.4, radius: 30 },
  
  // Medium coverage - Yellow
  { lat: 28.63903086, lng: 77.37804242, rsrp: -90, color: '#fbbf24', opacity: 0.4, radius: 30 },
  { lat: 28.63973086, lng: 77.37904242, rsrp: -92, color: '#fbbf24', opacity: 0.4, radius: 30 },
  { lat: 28.63833086, lng: 77.37704242, rsrp: -91, color: '#fbbf24', opacity: 0.4, radius: 30 },
  
  // Medium-low coverage - Orange
  { lat: 28.65243086, lng: 77.36704242, rsrp: -98, color: '#fb923c', opacity: 0.4, radius: 30 },
  { lat: 28.65313086, lng: 77.36804242, rsrp: -100, color: '#fb923c', opacity: 0.4, radius: 30 },
  { lat: 28.65173086, lng: 77.36604242, rsrp: -99, color: '#fb923c', opacity: 0.4, radius: 30 },
  
  // Low coverage - Red
  { lat: 28.63713086, lng: 77.36914242, rsrp: -105, color: '#ef4444', opacity: 0.4, radius: 30 },
  { lat: 28.63783086, lng: 77.37014242, rsrp: -108, color: '#ef4444', opacity: 0.4, radius: 30 },
  { lat: 28.63643086, lng: 77.36814242, rsrp: -106, color: '#ef4444', opacity: 0.4, radius: 30 },
  
  // Additional scattered points
  { lat: 28.65533086, lng: 77.38444242, rsrp: -80, color: '#22c55e', opacity: 0.4, radius: 30 },
  { lat: 28.63303086, lng: 77.38284242, rsrp: -95, color: '#fbbf24', opacity: 0.4, radius: 30 },
  { lat: 28.65923086, lng: 77.36544242, rsrp: -102, color: '#fb923c', opacity: 0.4, radius: 30 },
  { lat: 28.62963086, lng: 77.36174242, rsrp: -110, color: '#dc2626', opacity: 0.5, radius: 30 },
  { lat: 28.65813086, lng: 77.37674242, rsrp: -77, color: '#22c55e', opacity: 0.4, radius: 30 },
  { lat: 28.63113086, lng: 77.37534242, rsrp: -93, color: '#fbbf24', opacity: 0.4, radius: 30 },
  { lat: 28.65933086, lng: 77.36074242, rsrp: -101, color: '#fb923c', opacity: 0.4, radius: 30 },
  
  // Fill in more coverage areas
  { lat: 28.64653086, lng: 77.37524242, rsrp: -81, color: '#22c55e', opacity: 0.4, radius: 30 },
  { lat: 28.64353086, lng: 77.37124242, rsrp: -84, color: '#86efac', opacity: 0.4, radius: 30 },
  { lat: 28.64753086, lng: 77.37724242, rsrp: -79, color: '#22c55e', opacity: 0.4, radius: 30 },
  { lat: 28.64203086, lng: 77.37424242, rsrp: -88, color: '#fbbf24', opacity: 0.4, radius: 30 },
  { lat: 28.64553086, lng: 77.37624242, rsrp: -86, color: '#86efac', opacity: 0.4, radius: 30 },
  { lat: 28.64103086, lng: 77.37324242, rsrp: -94, color: '#fbbf24', opacity: 0.4, radius: 30 },
  { lat: 28.64703086, lng: 77.37824242, rsrp: -87, color: '#86efac', opacity: 0.4, radius: 30 },
  { lat: 28.64253086, lng: 77.37524242, rsrp: -89, color: '#fbbf24', opacity: 0.4, radius: 30 },
  { lat: 28.64603086, lng: 77.37724242, rsrp: -83, color: '#86efac', opacity: 0.4, radius: 30 },
  { lat: 28.64153086, lng: 77.37224242, rsrp: -96, color: '#fb923c', opacity: 0.4, radius: 30 },
  
  // Edge areas with weaker signal
  { lat: 28.65403086, lng: 77.38244242, rsrp: -103, color: '#fb923c', opacity: 0.4, radius: 30 },
  { lat: 28.63503086, lng: 77.36474242, rsrp: -107, color: '#ef4444', opacity: 0.4, radius: 30 },
  { lat: 28.66003086, lng: 77.37274242, rsrp: -104, color: '#fb923c', opacity: 0.4, radius: 30 },
  { lat: 28.62803086, lng: 77.37774242, rsrp: -109, color: '#dc2626', opacity: 0.5, radius: 30 },
  { lat: 28.65703086, lng: 77.36274242, rsrp: -105, color: '#ef4444', opacity: 0.4, radius: 30 },
  { lat: 28.63003086, lng: 77.38474242, rsrp: -111, color: '#dc2626', opacity: 0.5, radius: 30 },
];

const PredictionPoint = ({ point, onClick, isSelected }) => {
  return (
    <>
      <CircleF
        center={{ lat: point.lat, lng: point.lng }}
        radius={point.radius}
        options={{
          fillColor: point.color,
          fillOpacity: point.opacity,
          strokeColor: point.color,
          strokeWeight: 1,
          strokeOpacity: 0.8,
          clickable: true,
          zIndex: 40,
        }}
        onClick={() => onClick(point)}
      />
      
      {isSelected && (
        <InfoWindowF
          position={{ lat: point.lat, lng: point.lng }}
          onCloseClick={() => onClick(null)}
          options={{ zIndex: 150 }}
        >
          <div className="p-2 min-w-[150px]">
            <h4 className="font-semibold text-sm mb-1 text-gray-900">
              Prediction Point
            </h4>
            <div className="space-y-1 text-xs text-gray-700">
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">RSRP:</span>
                <span className="font-medium">{point.rsrp} dBm</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">Location:</span>
                <span className="font-medium text-xs">
                  {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                </span>
              </div>
            </div>
          </div>
        </InfoWindowF>
      )}
    </>
  );
};

const CellPredictionPoints = ({ showPrediction = false, viewport = null }) => {
  const [selectedPoint, setSelectedPoint] = useState(null);

  const visiblePoints = useMemo(() => {
    if (!viewport || HARDCODED_PREDICTION_POINTS.length < 50) {
      return HARDCODED_PREDICTION_POINTS;
    }

    return HARDCODED_PREDICTION_POINTS.filter(point => {
      const buffer = 0.002;
      return point.lat >= (viewport.south - buffer) && 
             point.lat <= (viewport.north + buffer) && 
             point.lng >= (viewport.west - buffer) && 
             point.lng <= (viewport.east + buffer);
    });
  }, [viewport]);

  if (!showPrediction) {
    return null;
  }

  console.log(`🔮 Rendering ${visiblePoints.length}/${HARDCODED_PREDICTION_POINTS.length} prediction points`);

  return (
    <>
      {visiblePoints.map((point, index) => (
        <PredictionPoint
          key={`prediction-${index}`}
          point={point}
          onClick={(p) => setSelectedPoint(p)}
          isSelected={selectedPoint === point}
        />
      ))}
    </>
  );
};

export default CellPredictionPoints;