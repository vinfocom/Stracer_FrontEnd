// src/components/unifiedMap/TechHandoverMarkers.jsx
import React, { useMemo, memo, useState, useCallback, useEffect, useRef } from "react";
import { OverlayView, Polyline } from "@react-google-maps/api";
import { ArrowRightLeft, Zap, Download } from "lucide-react";
import { COLOR_SCHEMES, normalizeTechName, getBandColor } from "@/utils/colorUtils";

const getColor = (value, type) => {
  if (type === 'band') {
    return typeof getBandColor === 'function' ? getBandColor(value) : "#8b5cf6";
  } else if (type === 'pci') {
    return "#3B82F6"; 
  } else {
    const normalized = normalizeTechName(value);
    return COLOR_SCHEMES.technology[normalized] ?? COLOR_SCHEMES.technology.Unknown;
  }
};

// ... (Keep downloadCSVFunc and DownloadButton unchanged) ...
// CSV Download Utility Function
const downloadCSVFunc = (transitions, filename = "handover_data.csv") => {
    if (!transitions || transitions.length === 0) {
      alert("No data to download");
      return;
    }
    const headers = ["Index", "From", "To", "Type", "Latitude", "Longitude", "Timestamp", "Session ID", "Log Index"];
    const rows = transitions.map((t, index) => [
        index + 1, t.from || "", t.to || "", t.type || "unknown", 
        t.lat?.toFixed(6) || "", t.lng?.toFixed(6) || "", 
        t.timestamp ? new Date(t.timestamp).toISOString() : "", 
        t.session_id || "", t.atIndex ?? ""
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const DownloadButton = memo(({ transitions, className = "" }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const handleDownload = useCallback(() => {
    setIsDownloading(true);
    try {
      const timestamp = new Date().toISOString().split("T")[0];
      downloadCSVFunc(transitions, `handover_data_${timestamp}.csv`);
    } catch (error) {
      console.error(error);
    } finally {
      setTimeout(() => setIsDownloading(false), 500);
    }
  }, [transitions]);

  return (
    <button
      onClick={handleDownload}
      disabled={isDownloading || !transitions?.length}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${transitions?.length ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-gray-300 text-gray-500"} ${className}`}
    >
      <Download className="h-3.5 w-3.5" />
      {isDownloading ? "Downloading..." : "Download CSV"}
    </button>
  );
});
DownloadButton.displayName = "DownloadButton";

const getHandoverType = (from, to, type) => {
  if (type !== 'technology') return "change";
  const techOrder = { "5G": 5, "5G NR": 5, "NR": 5, "4G": 4, "LTE": 4, "4G LTE": 4, "3G": 3, "WCDMA": 3, "UMTS": 3, "2G": 2, "GSM": 2, "EDGE": 2 };
  const fromOrder = techOrder[from?.toUpperCase()] || 0;
  const toOrder = techOrder[to?.toUpperCase()] || 0;
  if (toOrder > fromOrder) return "upgrade";
  if (toOrder < fromOrder) return "downgrade";
  return "lateral";
};

const HandoverMarker = memo(({ transition, onClick, isSelected, type }) => {
  const { from, to, lat, lng } = transition;
  const handoverType = getHandoverType(from, to, type);
  const fromColor = getColor(from, type);
  const toColor = getColor(to, type);
  
  const bgColor = useMemo(() => {
    if (type !== 'technology') return "bg-blue-500";
    if (handoverType === "upgrade") return "bg-green-500";
    if (handoverType === "downgrade") return "bg-red-500";
    return "bg-blue-500";
  }, [handoverType, type]);

  const borderColor = useMemo(() => {
    if (type !== 'technology') return "border-blue-300";
    if (handoverType === "upgrade") return "border-green-300";
    if (handoverType === "downgrade") return "border-red-300";
    return "border-blue-300";
  }, [handoverType, type]);

  return (
    <OverlayView position={{ lat, lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
      <div
        className={`relative cursor-pointer transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ${isSelected ? "scale-125 z-50" : "hover:scale-110 z-10"}`}
        onClick={() => onClick?.(transition)}
      >
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${bgColor} border-2 ${borderColor} shadow-lg`}>
          <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded min-w-[20px] text-center" style={{ backgroundColor: fromColor }}>{from}</span>
          <ArrowRightLeft className="h-3 w-3 text-white" />
          <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded min-w-[20px] text-center" style={{ backgroundColor: toColor }}>{to}</span>
        </div>
        {type === 'technology' && (
            <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold shadow ${handoverType === "upgrade" ? "bg-green-600" : handoverType === "downgrade" ? "bg-red-600" : "bg-blue-600"}`}>
            {handoverType === "upgrade" ? "↑" : handoverType === "downgrade" ? "↓" : "↔"}
            </div>
        )}
        <div className={`absolute inset-0 rounded-full animate-ping opacity-25 ${bgColor}`} style={{ animationDuration: "2s" }} />
      </div>
    </OverlayView>
  );
});
HandoverMarker.displayName = "HandoverMarker";

const CompactHandoverMarker = memo(({ transition, onClick, isSelected, type }) => {
  const { from, to, lat, lng } = transition;
  const handoverType = getHandoverType(from, to, type);
  const bgColor = type !== 'technology' ? "#3B82F6" : (handoverType === "upgrade" ? "#10B981" : handoverType === "downgrade" ? "#EF4444" : "#3B82F6");

  return (
    <OverlayView position={{ lat, lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
      <div
        className={`cursor-pointer transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ${isSelected ? "scale-150 z-50" : "hover:scale-125 z-10"}`}
        onClick={() => onClick?.(transition)}
        title={`${from} → ${to}`}
      >
        <div className="w-4 h-4 rounded-full border-2 border-white shadow-lg flex items-center justify-center" style={{ backgroundColor: bgColor }}>
          <Zap className="h-2.5 w-2.5 text-white" />
        </div>
      </div>
    </OverlayView>
  );
});
CompactHandoverMarker.displayName = "CompactHandoverMarker";

const HandoverPopup = memo(({ transition, onClose, type }) => {
  if (!transition) return null;
  const { from, to, lat, lng, timestamp, session_id, atIndex } = transition;
  const handoverType = getHandoverType(from, to, type);
  const handleDownloadSingle = () => downloadCSVFunc([transition], `handover_${type}_${from}_to_${to}.csv`);
  
  return (
    <OverlayView position={{ lat, lng }} mapPaneName={OverlayView.FLOAT_PANE}>
      <div className="relative transform -translate-x-1/2 -translate-y-full mb-4">
        <div className="bg-slate-900 text-white rounded-lg shadow-xl p-3 min-w-[200px] border border-slate-700">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-700">
            <span className="text-sm font-semibold capitalize">{type} Handover</span>
            <button onClick={onClose} className="text-slate-400 hover:text-white">×</button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <span className="px-2 py-1 rounded text-sm font-bold text-white min-w-[30px] text-center" style={{ backgroundColor: getColor(from, type) }}>{from}</span>
              <span className="text-lg">→</span>
              <span className="px-2 py-1 rounded text-sm font-bold text-white min-w-[30px] text-center" style={{ backgroundColor: getColor(to, type) }}>{to}</span>
            </div>
            <div className={`text-center text-xs font-medium px-2 py-1 rounded bg-blue-500/20 text-blue-400`}>
              {type === 'technology' 
               ? (handoverType === "upgrade" ? "⬆️ Upgrade" : handoverType === "downgrade" ? "⬇️ Downgrade" : "↔️ Lateral")
               : "↔️ Change"
              }
            </div>
            <div className="text-xs space-y-1 pt-2 border-t border-slate-700">
              {timestamp && <div className="flex justify-between"><span className="text-slate-400">Time:</span><span>{new Date(timestamp).toLocaleString()}</span></div>}
              {session_id && <div className="flex justify-between"><span className="text-slate-400">Session:</span><span className="truncate max-w-[100px]">{session_id}</span></div>}
              <div className="flex justify-between"><span className="text-slate-400">Location:</span><span>{lat.toFixed(5)}, {lng.toFixed(5)}</span></div>
              {atIndex !== undefined && <div className="flex justify-between"><span className="text-slate-400">Log Index:</span><span>{atIndex}</span></div>}
            </div>
            <button onClick={handleDownloadSingle} className="w-full mt-2 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded bg-slate-700 hover:bg-slate-600 text-slate-200">
              <Download className="h-3 w-3" /> Download Record
            </button>
          </div>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-slate-900" />
      </div>
    </OverlayView>
  );
});
HandoverPopup.displayName = "HandoverPopup";

// Main Component
const TechHandoverMarkers = ({ transitions = [], show = false, compactMode = false, showConnections = true, type = 'technology', onTransitionClick }) => {
  const [selectedTransition, setSelectedTransition] = useState(null);
  const connectionRefs = useRef(new Map());
  const handleMarkerClick = (transition) => { setSelectedTransition(transition); onTransitionClick?.(transition); };
  const handlePopupClose = () => setSelectedTransition(null);

  const clearConnectionPolylines = useCallback(() => {
    connectionRefs.current.forEach((polyline) => {
      try {
        polyline?.setMap?.(null);
      } catch (e) {
        // Ignore map cleanup errors from stale instances
      }
    });
    connectionRefs.current.clear();
  }, []);

  const registerConnection = useCallback((id, polyline) => {
    if (!polyline) return;
    const existing = connectionRefs.current.get(id);
    if (existing && existing !== polyline) {
      try {
        existing.setMap(null);
      } catch (e) {
        // Ignore stale map cleanup errors
      }
    }
    connectionRefs.current.set(id, polyline);
  }, []);

  const unregisterConnection = useCallback((id, polyline) => {
    const current = connectionRefs.current.get(id);
    if (current) {
      try {
        current.setMap(null);
      } catch (e) {
        // Ignore stale map cleanup errors
      }
    } else if (polyline) {
      try {
        polyline.setMap(null);
      } catch (e) {
        // Ignore stale map cleanup errors
      }
    }
    connectionRefs.current.delete(id);
  }, []);

  useEffect(() => {
    if (!show || !showConnections) {
      clearConnectionPolylines();
      if (!show) setSelectedTransition(null);
    }
  }, [show, showConnections, clearConnectionPolylines]);

  useEffect(() => {
    return () => {
      clearConnectionPolylines();
    };
  }, [clearConnectionPolylines]);

  const connectionPaths = useMemo(() => {
  if (!showConnections || transitions.length < 2) return [];
  const paths = [];
  for (let i = 0; i < transitions.length - 1; i++) {
    // Check if they belong to the same session to avoid long "ghost" lines across the map
    if (transitions[i].session_id === transitions[i + 1].session_id) {
      paths.push({ 
          // ADD 'type' here to differentiate between Tech, Band, and PCI connections
          id: `connection-${type}-${transitions[i].session_id}-${i}`, 
          path: [
            { lat: transitions[i].lat, lng: transitions[i].lng }, 
            { lat: transitions[i + 1].lat, lng: transitions[i + 1].lng }
          ] 
      });
    }
  }
  return paths;
}, [transitions, showConnections, type]); // Added 'type' to deps

  if (!show || !transitions.length) return null;
  const MarkerComponent = (compactMode || transitions.length > 20) ? CompactHandoverMarker : HandoverMarker;

  return (
    <>
      {showConnections && connectionPaths.map((c) => (
        <Polyline 
            key={c.id} 
            path={c.path} 
            onLoad={(polyline) => registerConnection(c.id, polyline)}
            onUnmount={(polyline) => unregisterConnection(c.id, polyline)}
            options={{ strokeColor: "#F59E0B", strokeOpacity: 0.5, strokeWeight: 2, geodesic: true, icons: [{ icon: { path: window.google?.maps?.SymbolPath?.FORWARD_CLOSED_ARROW, scale: 3, fillColor: "#F59E0B", fillOpacity: 1, strokeWeight: 0 }, offset: "50%" }] }} 
        />
      ))}
      {transitions.map((t, i) => (
        <MarkerComponent 
            // 👇 FIX: Ensure key is unique using type
           key={`handover-marker-${type}-${t.session_id}-${t.atIndex}-${i}`} 
            transition={t} 
            onClick={handleMarkerClick} 
            isSelected={selectedTransition === t} 
            type={type} 
        />
      ))}
      {selectedTransition && <HandoverPopup transition={selectedTransition} onClose={handlePopupClose} type={type} />}
    </>
  );
};

export const downloadCSV = downloadCSVFunc;
export { DownloadButton };
export default memo(TechHandoverMarkers);
