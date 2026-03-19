import React, { memo, useEffect, useMemo, useState } from "react";
import { InfoWindowF, MarkerF } from "@react-google-maps/api";

const formatCoordinate = (point) => {
  if (!point) return "N/A";
  return `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
};

const formatMetric = (value, suffix = "") => {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
};

const SubSessionMarkers = ({ markers = [], show = false }) => {
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);

  useEffect(() => {
    if (!show) {
      setSelectedMarkerId(null);
    }
  }, [show]);

  const markerIcon = useMemo(() => {
    if (typeof window === "undefined" || !window.google?.maps) {
      return undefined;
    }

    return {
      path: window.google.maps.SymbolPath.CIRCLE,
      fillColor: "#F97316",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2,
      scale: 7,
    };
  }, []);

  const selectedMarker = useMemo(
    () => markers.find((item) => item.id === selectedMarkerId) || null,
    [markers, selectedMarkerId],
  );

  if (!show || !Array.isArray(markers) || markers.length === 0) {
    return null;
  }

  return (
    <>
      {markers.map((marker) => (
        <MarkerF
          key={marker.id}
          position={marker.position}
          icon={markerIcon}
          title={`Session ${marker.sessionId}${
            marker.subSessionId != null ? ` / Sub ${marker.subSessionId}` : ""
          }`}
          onClick={() => setSelectedMarkerId(marker.id)}
        />
      ))}

      {selectedMarker && (
        <InfoWindowF
          position={selectedMarker.position}
          onCloseClick={() => setSelectedMarkerId(null)}
        >
          <div className="min-w-[230px] text-xs text-slate-800">
            <div className="font-semibold text-sm mb-2">Sub-Session Start Point</div>
            <div className="space-y-1">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Session</span>
                <span className="font-medium">{selectedMarker.sessionId ?? "N/A"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Sub Session</span>
                <span className="font-medium">{selectedMarker.subSessionId ?? "N/A"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Start</span>
                <span className="font-medium">{formatCoordinate(selectedMarker.start)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">End</span>
                <span className="font-medium">{formatCoordinate(selectedMarker.end)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Sub Sessions</span>
                <span className="font-medium">{selectedMarker.subSessionCount ?? "N/A"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Avg Speed</span>
                <span className="font-medium">{formatMetric(selectedMarker.metrics?.avg_speed, " Mbps")}</span>
              </div>
            </div>
          </div>
        </InfoWindowF>
      )}
    </>
  );
};

export default memo(SubSessionMarkers);
