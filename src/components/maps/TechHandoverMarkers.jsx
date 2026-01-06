import React, { useMemo, memo } from "react";
import { OverlayView, Polyline } from "@react-google-maps/api";
import { ArrowRightLeft, Zap } from "lucide-react";
import { COLOR_SCHEMES, normalizeTechName } from "@/utils/colorUtils";



const getTechColor = (tech) => {
  const normalized = normalizeTechName(tech);
  return COLOR_SCHEMES.technology[normalized]?? COLOR_SCHEMES.technology.Unknown;
};

// Handover Summary Component
export const HandoverSummary = memo(({ transitions }) => {
  const summary = useMemo(() => {
    const counts = { upgrade: 0, downgrade: 0, lateral: 0 };
    const techPairs = {};

    transitions.forEach((t) => {
      const type = getHandoverType(t.from, t.to);
      counts[type]++;
      
      const key = `${t.from} → ${t.to}`;
      techPairs[key] = (techPairs[key] || 0) + 1;
    });

    // Get top 3 most common handovers
    const topPairs = Object.entries(techPairs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return { counts, topPairs };
  }, [transitions]);

  return (
    <div className="space-y-2 mt-2 pt-2 border-t border-gray-200">
      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="bg-green-50 rounded p-1">
          <div className="text-green-600 font-bold">{summary.counts.upgrade}</div>
          <div className="text-[10px] text-green-500">Upgrades</div>
        </div>
        <div className="bg-red-50 rounded p-1">
          <div className="text-red-600 font-bold">{summary.counts.downgrade}</div>
          <div className="text-[10px] text-red-500">Downgrades</div>
        </div>
        <div className="bg-blue-50 rounded p-1">
          <div className="text-blue-600 font-bold">{summary.counts.lateral}</div>
          <div className="text-[10px] text-blue-500">Lateral</div>
        </div>
      </div>

      {summary.topPairs.length > 0 && (
        <div className="text-[10px] space-y-0.5">
          <div className="text-gray-500 font-medium">Most Common:</div>
          {summary.topPairs.map(([pair, count]) => (
            <div key={pair} className="flex justify-between text-gray-600">
              <span>{pair}</span>
              <span className="font-medium">{count}x</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

HandoverSummary.displayName = "HandoverSummary";
// Determine if it's an upgrade or downgrade
const getHandoverType = (from, to) => {
  const techOrder = { "5G": 5, "5G NR": 5, "NR": 5, "4G": 4, "LTE": 4, "4G LTE": 4, "3G": 3, "WCDMA": 3, "UMTS": 3, "2G": 2, "GSM": 2, "EDGE": 2 };
  
  const fromOrder = techOrder[from?.toUpperCase()] || 0;
  const toOrder = techOrder[to?.toUpperCase()] || 0;
  
  if (toOrder > fromOrder) return "upgrade";
  if (toOrder < fromOrder) return "downgrade";
  return "lateral";
};

// Single Handover Marker Component
const HandoverMarker = memo(({ transition, onClick, isSelected }) => {
  const { from, to, lat, lng, timestamp, session_id } = transition;
  
  const handoverType = getHandoverType(from, to);
  const fromColor = getTechColor(from);
  const toColor = getTechColor(to);
  
  const bgColor = useMemo(() => {
    switch (handoverType) {
      case "upgrade": return "bg-green-500";
      case "downgrade": return "bg-red-500";
      default: return "bg-blue-500";
    }
  }, [handoverType]);

  const borderColor = useMemo(() => {
    switch (handoverType) {
      case "upgrade": return "border-green-300";
      case "downgrade": return "border-red-300";
      default: return "border-blue-300";
    }
  }, [handoverType]);

  return (
    <OverlayView
      position={{ lat, lng }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div
        className={`relative cursor-pointer transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ${
          isSelected ? "scale-125 z-50" : "hover:scale-110 z-10"
        }`}
        onClick={() => onClick?.(transition)}
      >
        {/* Main Marker */}
        <div
          className={`flex items-center gap-1 px-2 py-1 rounded-full ${bgColor} border-2 ${borderColor} shadow-lg`}
        >
          {/* From Tech */}
          <span
            className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded"
            style={{ backgroundColor: fromColor }}
          >
            {from}
          </span>
          
          {/* Arrow */}
          <ArrowRightLeft className="h-3 w-3 text-white" />
          
          {/* To Tech */}
          <span
            className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded"
            style={{ backgroundColor: toColor }}
          >
            {to}
          </span>
        </div>

        {/* Handover Type Badge */}
        <div
          className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold shadow ${
            handoverType === "upgrade"
              ? "bg-green-600"
              : handoverType === "downgrade"
              ? "bg-red-600"
              : "bg-blue-600"
          }`}
        >
          {handoverType === "upgrade" ? "↑" : handoverType === "downgrade" ? "↓" : "↔"}
        </div>

        {/* Pulse Effect */}
        <div
          className={`absolute inset-0 rounded-full animate-ping opacity-25 ${bgColor}`}
          style={{ animationDuration: "2s" }}
        />
      </div>
    </OverlayView>
  );
});

HandoverMarker.displayName = "HandoverMarker";

// Compact Marker (for many transitions)
const CompactHandoverMarker = memo(({ transition, onClick, isSelected }) => {
  const { from, to, lat, lng } = transition;
  const handoverType = getHandoverType(from, to);
  
  const bgColor = useMemo(() => {
    switch (handoverType) {
      case "upgrade": return "#10B981";
      case "downgrade": return "#EF4444";
      default: return "#3B82F6";
    }
  }, [handoverType]);

  return (
    <OverlayView
      position={{ lat, lng }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div
        className={`cursor-pointer transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ${
          isSelected ? "scale-150 z-50" : "hover:scale-125 z-10"
        }`}
        onClick={() => onClick?.(transition)}
        title={`${from} → ${to}`}
      >
        <div
          className="w-4 h-4 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
          style={{ backgroundColor: bgColor }}
        >
          <Zap className="h-2.5 w-2.5 text-white" />
        </div>
      </div>
    </OverlayView>
  );
});

CompactHandoverMarker.displayName = "CompactHandoverMarker";

// Handover Info Popup
const HandoverPopup = memo(({ transition, onClose }) => {
  if (!transition) return null;
  
  const { from, to, lat, lng, timestamp, session_id, atIndex } = transition;
  const handoverType = getHandoverType(from, to);
  
  return (
    <OverlayView
      position={{ lat, lng }}
      mapPaneName={OverlayView.FLOAT_PANE}
    >
      <div className="relative transform -translate-x-1/2 -translate-y-full mb-4">
        <div className="bg-slate-900 text-white rounded-lg shadow-xl p-3 min-w-[200px] border border-slate-700">
          {/* Header */}
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-700">
            <span className="text-sm font-semibold">Tech Handover</span>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              ×
            </button>
          </div>
          
          {/* Handover Info */}
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <span
                className="px-2 py-1 rounded text-sm font-bold text-white"
                style={{ backgroundColor: getTechColor(from) }}
              >
                {from}
              </span>
              <span className="text-lg">→</span>
              <span
                className="px-2 py-1 rounded text-sm font-bold text-white"
                style={{ backgroundColor: getTechColor(to) }}
              >
                {to}
              </span>
            </div>
            
            <div
              className={`text-center text-xs font-medium px-2 py-1 rounded ${
                handoverType === "upgrade"
                  ? "bg-green-500/20 text-green-400"
                  : handoverType === "downgrade"
                  ? "bg-red-500/20 text-red-400"
                  : "bg-blue-500/20 text-blue-400"
              }`}
            >
              {handoverType === "upgrade"
                ? "⬆️ Upgrade"
                : handoverType === "downgrade"
                ? "⬇️ Downgrade"
                : "↔️ Lateral"}
            </div>
            
            <div className="text-xs space-y-1 pt-2 border-t border-slate-700">
              {timestamp && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Time:</span>
                  <span>{new Date(timestamp).toLocaleString()}</span>
                </div>
              )}
              {session_id && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Session:</span>
                  <span className="truncate max-w-[100px]">{session_id}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Location:</span>
                <span>
                  {lat.toFixed(5)}, {lng.toFixed(5)}
                </span>
              </div>
              {atIndex !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Log Index:</span>
                  <span>{atIndex}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Arrow pointer */}
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-slate-900" />
      </div>
    </OverlayView>
  );
});

HandoverPopup.displayName = "HandoverPopup";

// Main TechHandoverMarkers Component
const TechHandoverMarkers = ({
  transitions = [],
  show = false,
  compactMode = false,
  showConnections = true,
  onTransitionClick,
}) => {
  const [selectedTransition, setSelectedTransition] = React.useState(null);

  const handleMarkerClick = (transition) => {
    setSelectedTransition(transition);
    onTransitionClick?.(transition);
  };

  const handlePopupClose = () => {
    setSelectedTransition(null);
  };

  // Connection lines between sequential handovers
  const connectionPaths = useMemo(() => {
    if (!showConnections || transitions.length < 2) return [];
    
    const paths = [];
    for (let i = 0; i < transitions.length - 1; i++) {
      const current = transitions[i];
      const next = transitions[i + 1];
      
      // Only connect if they're from the same session
      if (current.session_id === next.session_id) {
        paths.push({
          id: `connection-${i}`,
          path: [
            { lat: current.lat, lng: current.lng },
            { lat: next.lat, lng: next.lng },
          ],
        });
      }
    }
    return paths;
  }, [transitions, showConnections]);

  if (!show || !transitions.length) return null;

  // Use compact mode if there are many transitions
  const useCompact = compactMode || transitions.length > 20;
  const MarkerComponent = useCompact ? CompactHandoverMarker : HandoverMarker;

  return (
    <>
      {/* Connection Lines */}
      {showConnections &&
        connectionPaths.map((connection) => (
          <Polyline
            key={connection.id}
            path={connection.path}
            options={{
              strokeColor: "#F59E0B",
              strokeOpacity: 0.5,
              strokeWeight: 2,
              geodesic: true,
              icons: [
                {
                  icon: {
                    path: window.google?.maps?.SymbolPath?.FORWARD_CLOSED_ARROW,
                    scale: 3,
                    fillColor: "#F59E0B",
                    fillOpacity: 1,
                    strokeWeight: 0,
                  },
                  offset: "50%",
                },
              ],
            }}
          />
        ))}

      {/* Handover Markers */}
      {transitions.map((transition, index) => (
        <MarkerComponent
          key={`handover-${transition.session_id}-${transition.atIndex}-${index}`}
          transition={transition}
          onClick={handleMarkerClick}
          isSelected={selectedTransition === transition}
        />
      ))}

      {/* Info Popup */}
      {selectedTransition && (
        <HandoverPopup
          transition={selectedTransition}
          onClose={handlePopupClose}
        />
      )}
    </>
  );
};

export default memo(TechHandoverMarkers);