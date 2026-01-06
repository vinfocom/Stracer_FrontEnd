import React, { useEffect, useRef, useState, useCallback, memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { PenTool, XCircle, Download, ChevronDown, ChevronUp, Search, Map as MapIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useMapContext } from "@/context/MapContext";

const DrawingControlsPanel = memo(function DrawingControlsPanel({
  ui: propUi,
  onUIChange: propOnUIChange,
  hasLogs: propHasLogs,
  polygonStats: propPolygonStats,
  onDownloadStatsCsv: propOnDownloadStatsCsv,
  onDownloadRawCsv: propOnDownloadRawCsv,
  onFetchLogs: propOnFetchLogs,
  position = "top-right",
}) {
  const context = useMapContext();

  const ui = propUi || context?.ui || {};
  const onUIChange = propOnUIChange || context?.updateUI;
  const hasLogs = propHasLogs ?? context?.hasLogsRef?.current ?? false;
  const polygonStats = propPolygonStats || context?.polygonStatsRef?.current;
  const downloadHandlers = context?.downloadHandlersRef?.current || {};

  const handleDownloadStatsCsv = propOnDownloadStatsCsv || downloadHandlers.onDownloadStatsCsv;
  const handleDownloadRawCsv = propOnDownloadRawCsv || downloadHandlers.onDownloadRawCsv;
  const handleFetchLogs = propOnFetchLogs || downloadHandlers.onFetchLogs;

  const [dropOpen, setDropOpen] = useState(false);
  const dropdownRef = useRef(null);

  const safeUi = useMemo(() => ({
    drawEnabled: false,
    shapeMode: "polygon",
    drawPixelateRect: false,
    drawCellSizeMeters: 100,
    drawClearSignal: 0,
    colorizeCells: true,
    ...ui,
  }), [ui]);

  useEffect(() => {
    const onOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const toggleDropdown = useCallback(() => setDropOpen(p => !p), []);

  const startDrawPolygon = useCallback(() => {
    onUIChange?.({ drawEnabled: true, shapeMode: "polygon" });
    setDropOpen(false);
  }, [onUIChange]);

  const clearDrawings = useCallback(() => {
    onUIChange?.({ drawClearSignal: (safeUi.drawClearSignal || 0) + 1 });
  }, [onUIChange, safeUi.drawClearSignal]);

  const handleEnableChange = useCallback((e) => {
    onUIChange?.({ drawEnabled: e.target.checked });
  }, [onUIChange]);

  const handleShapeModeChange = useCallback((e) => {
    onUIChange?.({ shapeMode: e.target.value });
  }, [onUIChange]);

  const handlePixelateChange = useCallback((e) => {
    onUIChange?.({ drawPixelateRect: e.target.checked });
  }, [onUIChange]);

  const handleColorizeChange = useCallback((e) => {
    onUIChange?.({ colorizeCells: e.target.checked });
  }, [onUIChange]);

  const handleCellSizeChange = useCallback((e) => {
    onUIChange?.({ drawCellSizeMeters: Math.max(1, Number(e.target.value || 20)) });
  }, [onUIChange]);

  const handleFetchClick = useCallback(() => {
    setDropOpen(false);
    handleFetchLogs?.();
  }, [handleFetchLogs]);

  const positionClasses = {
    "top-right": "absolute top-20 right-4",
    "top-left": "absolute top-20 left-4",
    "bottom-right": "absolute bottom-4 right-4",
    "bottom-left": "absolute bottom-4 left-4",
    "relative": "relative",
  };

  const hasShape = polygonStats && (polygonStats.area > 0 || polygonStats.geometry);
  const sessionCount = polygonStats?.intersectingSessions?.length || 0;

  return (
    <div
      className={`${positionClasses[position] || positionClasses["top-right"]} ${position === 'relative' ? 'inline-block' : 'z-40'}`}
      ref={dropdownRef}
    >
      <button
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all shadow-md ${
          dropOpen
            ? "bg-blue-600 text-white shadow-lg"
            : "bg-slate-800 text-white hover:bg-slate-700 border border-slate-600"
        }`}
        onClick={toggleDropdown}
      >
        <PenTool className={`w-4 h-4 ${safeUi.drawEnabled ? 'text-green-400' : ''}`} />
        <span>Drawing Tools</span>
        {safeUi.drawEnabled && <span className="w-2 h-2 bg-green-400 rounded-full" />}
        {dropOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {dropOpen && (
        <div className={`bg-white text-gray-900 rounded-lg shadow-2xl ring-1 ring-gray-200 p-4 w-80 ${
          position === 'relative'
            ? 'absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50'
            : 'absolute top-full right-0 mt-2 z-50'
        }`}>
          <label className="flex items-center gap-2 font-medium text-sm mb-3 cursor-pointer hover:text-blue-600">
            <input
              type="checkbox"
              checked={!!safeUi.drawEnabled}
              onChange={handleEnableChange}
              className="w-4 h-4 accent-blue-600"
            />
            Enable Drawing Tools
          </label>

          <div className="mb-4">
            <Button
              size="sm"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium"
              onClick={startDrawPolygon}
              disabled={!safeUi.drawEnabled}
            >
              <PenTool className="h-4 w-4 mr-2" />
              Start Drawing Polygon
            </Button>
          </div>

          {!hasLogs && hasShape && (
            <div className="mb-4 p-3 bg-indigo-50 border border-indigo-100 rounded-md">
              <div className="text-xs text-indigo-700 mb-2 font-medium flex items-center gap-2">
                <MapIcon className="w-4 h-4" />
                {sessionCount > 0
                  ? `Found ${sessionCount} session${sessionCount > 1 ? 's' : ''}.`
                  : "Area defined."}
              </div>
              <Button
                size="sm"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={handleFetchClick}
                disabled={sessionCount === 0}
              >
                <Search className="w-4 h-4 mr-2" />
                {sessionCount > 0 ? `View ${sessionCount} Sessions` : "Fetch Logs"}
              </Button>
            </div>
          )}

          <div className={`space-y-3 text-sm ${safeUi.drawEnabled ? "" : "opacity-50 pointer-events-none"}`}>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-gray-700 font-medium">Shape Type</Label>
              <select
                value={safeUi.shapeMode}
                onChange={handleShapeModeChange}
                className="border border-gray-300 rounded px-2 py-1 text-sm outline-none"
              >
                <option value="polygon">Polygon</option>
                <option value="rectangle">Rectangle</option>
                <option value="circle">Circle</option>
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!safeUi.drawPixelateRect}
                onChange={handlePixelateChange}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-xs">Enable grid pixelation</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!safeUi.colorizeCells}
                onChange={handleColorizeChange}
                disabled={!safeUi.drawPixelateRect}
                className="w-4 h-4 accent-blue-600 disabled:opacity-50"
              />
              <span className="text-xs">Colorize cells by metric</span>
            </label>

            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-700">Cell size:</Label>
              <input
                type="number"
                min={1}
                step={5}
                value={safeUi.drawCellSizeMeters ?? 100}
                onChange={handleCellSizeChange}
                className="w-20 border border-gray-300 rounded px-2 py-1 text-sm outline-none disabled:bg-gray-100"
                disabled={!safeUi.drawPixelateRect}
              />
              <span className="text-xs text-gray-600">meters</span>
            </div>

            <div className="pt-3 border-t border-gray-200">
              <Button
                variant="secondary"
                size="sm"
                className="w-full bg-red-50 hover:bg-red-100 text-red-700"
                onClick={clearDrawings}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Clear Drawings
              </Button>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-200">
            <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
              <Download className="h-3.5 w-3.5" />
              Export Data
            </div>
            <div className="space-y-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={handleDownloadStatsCsv}
                disabled={!polygonStats?.stats}
              >
                <Download className="h-4 w-4 mr-2" />
                Stats CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={handleDownloadRawCsv}
                disabled={!polygonStats?.logs?.length}
              >
                <Download className="h-4 w-4 mr-2" />
                Raw Logs CSV
              </Button>
            </div>
          </div>

          {hasShape && (
            <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 space-y-1">
              {polygonStats?.area > 0 && (
                <div className="flex justify-between">
                  <span>Area:</span>
                  <span className="font-medium text-gray-700">
                    {polygonStats.area > 1000000
                      ? `${(polygonStats.area / 1000000).toFixed(2)} km²`
                      : `${polygonStats.area.toFixed(0)} m²`}
                  </span>
                </div>
              )}
              {polygonStats?.count !== undefined && (
                <div className="flex justify-between">
                  <span>Logs:</span>
                  <span className="font-medium text-gray-700">{polygonStats.count}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default DrawingControlsPanel;