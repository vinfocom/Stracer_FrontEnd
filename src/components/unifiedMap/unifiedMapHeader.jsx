import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LogOut,
  Filter,
  ChartBar,
  Plus,
  Minus,
  UploadCloud,
  Settings as SettingsIcon,
  Droplets,
  CircleDot,
  Radio,
  Globe,
  ChevronDown,
} from "lucide-react";
import { useLocation, Link, useSearchParams } from "react-router-dom";
import { mapViewApi, predictionApi } from "@/api/apiEndpoints";
import { toast } from "react-toastify";
import { useMapContext } from "@/context/MapContext";
import Spinner from "@/components/common/Spinner";
import ProjectsDropdown from "../project/ProjectsDropdown";
import DrawingControlsPanel from "../map/layout/DrawingControlsPanel";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import SettingsPage from "@/pages/Setting";

const REQUIRED_SITE_COLUMNS = [
  "site",
  "sector",
  "cell_id",
  "longitude",
  "latitude",
  "pci",
  "azimuth",
  "band",
  "earfcn",
  "cluster",
  "technology",
];

const SITE_COLUMN_ALIASES = {
  site: ["site", "siteid", "site_id", "sitename", "site_name", "nodeb", "enodeb", "gnodeb"],
  sector: ["sector", "sectorid", "sector_id", "sectorname", "sector_name"],
  cell_id: ["cell_id", "cellid", "cell", "cellname", "cell_name", "cid", "ecgi"],
  longitude: ["longitude", "long", "lon", "lng", "x"],
  latitude: ["latitude", "lat", "y"],
  pci: ["pci", "physicalcellid", "physical_cell_id", "psc"],
  azimuth: ["azimuth", "azimuthdeg", "azimuth_deg", "bearing", "direction"],
  band: ["band", "frequencyband", "frequency_band", "freqband"],
  earfcn: ["earfcn", "dl_earfcn", "arfcn", "uarfcn", "nrarfcn"],
  cluster: ["cluster", "operator", "network", "provider", "circle"],
  technology: ["technology", "tech", "rat", "networktype", "network_type"],
};

const normalizeHeaderToken = (value = "") =>
  String(value)
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const parseCsvLine = (line = "") => {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out;
};

const toCsvField = (value = "") => {
  const str = String(value ?? "");
  if (!/[",\r\n]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
};

const normalizeSiteCsvHeaders = async (file) => {
  const content = await file.text();
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const firstNewlineIndex = content.indexOf("\n");

  const rawHeaderLine =
    firstNewlineIndex === -1
      ? content.replace(/\r$/, "")
      : content.slice(0, firstNewlineIndex).replace(/\r$/, "");

  const restContent = firstNewlineIndex === -1 ? "" : content.slice(firstNewlineIndex + 1);
  const rawHeaders = parseCsvLine(rawHeaderLine);

  const normalizedAliasMap = new Map();
  Object.entries(SITE_COLUMN_ALIASES).forEach(([canonical, aliases]) => {
    aliases.forEach((alias) => normalizedAliasMap.set(normalizeHeaderToken(alias), canonical));
  });

  const normalizedHeaders = rawHeaders.map((header) => {
    const aliasKey = normalizeHeaderToken(header);
    return normalizedAliasMap.get(aliasKey) || header.trim();
  });

  const normalizedHeaderSet = new Set(
    normalizedHeaders.map((header) => normalizeHeaderToken(header))
  );
  const missingColumns = REQUIRED_SITE_COLUMNS.filter(
    (required) => !normalizedHeaderSet.has(normalizeHeaderToken(required))
  );

  if (missingColumns.length > 0) {
    return {
      ok: false,
      missingColumns,
    };
  }

  const headersChanged = normalizedHeaders.some((header, idx) => header !== rawHeaders[idx]);
  if (!headersChanged) {
    return { ok: true, file };
  }

  const normalizedHeaderLine = normalizedHeaders.map(toCsvField).join(",");
  const normalizedContent = normalizedHeaderLine + (firstNewlineIndex === -1 ? "" : `${newline}${restContent}`);

  const normalizedFile = new File([normalizedContent], file.name, { type: file.type || "text/csv" });
  return { ok: true, file: normalizedFile };
};

export default function UnifiedHeader({
  onToggleControls,
  isControlsOpen,
  isLeftOpen,
  onLeftToggle,
  onOpenOperatorComparison,
  showAnalytics,
  projectId,
  sessionIds,
  opacity,
  project,
  setProject,
  setOpacity,
  logRadius = 12,
  setLogRadius,
  neighborLogsAvailable = false,
  neighborSquareSize = 8,
  setNeighborSquareSize,
  onUIChange,
  ui,
  
  onSettingsSaved,
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const effectiveProjectId =
    projectId || searchParams.get("project_id") || searchParams.get("project");
  const sessionParam =
    searchParams.get("sessionId") || searchParams.get("session");
  const effectiveSessionIds =
    sessionIds ||
    (sessionParam
      ? sessionParam
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id)
      : []);
  // const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [activeQuickControl, setActiveQuickControl] = useState(null);

  // Prediction Prompt State
  const [showPredictionPrompt, setShowPredictionPrompt] = useState(false);
  const [gridValue, setGridValue] = useState(25.0);
  const [radiusM, setRadiusM] = useState(5000.0);
  const [isPredicting, setIsPredicting] = useState(false);

  // Grab polygonContext to send drawn area to API
  const mapContext = useMapContext();
  const polygonStats = mapContext?.polygonStats;

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleQuickUpload = async () => {
    if (!selectedFile) {
      toast.warn("Please select a file first.");
      return;
    }
    if (!effectiveProjectId) {
      toast.error("ProjectId is missing. Open a project first, then upload.");
      return;
    }

    let uploadFile = selectedFile;
    try {
      const normalizedCsv = await normalizeSiteCsvHeaders(selectedFile);
      if (!normalizedCsv.ok) {
        toast.error(
          `Missing required CSV columns: ${normalizedCsv.missingColumns.join(", ")}`
        );
        return;
      }
      uploadFile = normalizedCsv.file;
    } catch (e) {
      toast.error("Unable to read CSV file. Please verify file format.");
      return;
    }

    const formData = new FormData();
    // Send both keys for compatibility with older/newer backend binders.
    formData.append("File", uploadFile);
    formData.append("UploadFile", uploadFile);
    formData.append("ProjectId", String(effectiveProjectId));

    setIsUploading(true);
    try {
      const resp = await mapViewApi.uploadSitePredictionCsv(formData); 
      if (resp?.Status === 1 || resp?.status === 1) {
        toast.success("File uploaded successfully!");
        setSelectedFile(null);
        // Open the LTE prediction prompt dialog
        setShowPredictionPrompt(true);
      } else {
        toast.error(resp?.Message || resp?.message || "Upload failed");
      }
    } catch (error) {
      const errorMsg =
        error?.data?.Message ||
        error?.data?.message ||
        error?.response?.data?.Message ||
        error?.response?.data?.message ||
        error?.message ||
        "Upload request failed.";
      toast.error(errorMsg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRunPrediction = async () => {
    if (!effectiveProjectId) {
      toast.error("Project ID is missing.");
      return;
    }
    if (!effectiveSessionIds || effectiveSessionIds.length === 0) {
      toast.error("No active session IDs selected.");
      return;
    }

    let polygonAreaCoords = [];
    if (polygonStats?.geometry?.type === "polygon" && polygonStats.geometry.polygon) {
      // Map [{lat, lng}] to [[lng, lat], ...] as commonly expected by PostGIS/Python WKT or GeoJSON
      polygonAreaCoords = polygonStats.geometry.polygon.map(pt => [pt.lng, pt.lat]);
      // Ensure it's closed (first point == last point) to be a valid coordinate ring
      if (polygonAreaCoords.length > 0) {
        const first = polygonAreaCoords[0];
        const last = polygonAreaCoords[polygonAreaCoords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          polygonAreaCoords.push([first[0], first[1]]);
        }
      }
    }

    setIsPredicting(true);
    try {
      await predictionApi.runLtePrediction({
        project_id: effectiveProjectId,
        session_ids: effectiveSessionIds,
        grid_value: parseFloat(gridValue) || 25.0,
        radius_m: parseFloat(radiusM) || 5000.0,
        polygon_area: polygonAreaCoords,
        building: true
      });
      toast.success("LTE Prediction started successfully.");
      setShowPredictionPrompt(false);
    } catch (error) {
      toast.error(error.message || "Failed to start LTE prediction");
    } finally {
      setIsPredicting(false);
    }
  };

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const response = await mapViewApi.getProjects();
        const allProjects = response?.Data || [];

        if (!Array.isArray(allProjects)) {
          return;
        }

        const matchedProject = allProjects.find(
          (project) => project.id === Number(effectiveProjectId)
        );

        if (matchedProject) {
          setProject(matchedProject);
        }
      } catch (error) {
       console.error("Failed to fetch project info", error);
      } finally {
        setLoading(false);
      }
    };

    if (effectiveProjectId) {
      fetchProject();
    }
  }, [effectiveProjectId]);

  const isMapPage = location.pathname.includes("unified-map");
  const currentOpacityPercent = Math.round((opacity ?? 0.8) * 100);
  const currentLogRadius = Number.isFinite(Number(logRadius))
    ? Number(logRadius)
    : 12;
  const currentNeighborSquareSize = Number.isFinite(Number(neighborSquareSize))
    ? Number(neighborSquareSize)
    : 8;

  const adjustOpacity = (deltaPercent) => {
    const nextPercent = Math.max(
      0,
      Math.min(100, currentOpacityPercent + deltaPercent),
    );
    setOpacity(nextPercent / 100);
  };

  const updateOpacityFromInput = (rawValue) => {
    const nextPercent = Number(rawValue);
    if (!Number.isFinite(nextPercent)) return;
    setOpacity(Math.max(0, Math.min(100, nextPercent)) / 100);
  };

  const adjustLogRadius = (delta) => {
    if (!setLogRadius) return;
    const nextRadius = Math.max(4, Math.min(40, currentLogRadius + delta));
    setLogRadius(nextRadius);
  };

  const updateLogRadiusFromInput = (rawValue) => {
    if (!setLogRadius) return;
    const nextRadius = Number(rawValue);
    if (!Number.isFinite(nextRadius)) return;
    setLogRadius(Math.max(2, Math.min(40, Math.round(nextRadius))));
  };

  const adjustNeighborSquareSize = (delta) => {
    if (!setNeighborSquareSize) return;
    const nextSize = Math.max(3, Math.min(80, currentNeighborSquareSize + delta));
    setNeighborSquareSize(nextSize);
  };

  const updateNeighborSquareSizeFromInput = (rawValue) => {
    if (!setNeighborSquareSize) return;
    const nextSize = Number(rawValue);
    if (!Number.isFinite(nextSize)) return;
    setNeighborSquareSize(Math.max(3, Math.min(80, Math.round(nextSize))));
  };

  const toggleQuickControl = (controlKey) => {
    setActiveQuickControl((prev) => (prev === controlKey ? null : controlKey));
  };

  useEffect(() => {
    if (!neighborLogsAvailable && activeQuickControl === "neighbors") {
      setActiveQuickControl(null);
    }
  }, [neighborLogsAvailable, activeQuickControl]);

  const openInNewTab = (path) => {
    if (typeof window === "undefined") return;
    window.open(path, "_blank", "noopener,noreferrer");
  };

  return (
    <header className="h-14 bg-gray-800 text-white shadow-sm flex items-center justify-between px-6 flex-shrink-0 relative z-10">
      <div className="flex items-center gap-4">
        {isMapPage && (
          <>
            <h1 className="text-lg md:text-xl font-semibold">
              {project?.project_name || "Unified Map"}
              <span className="text-sm font-normal text-gray-400 ml-2">
                {effectiveProjectId && `(Project: ${effectiveProjectId})`}
              </span>
            </h1>

            <Button
              onClick={onToggleControls}
              size="sm"
              className="flex gap-1 items-center bg-blue-600 hover:bg-blue-500 text-white"
            >
              <Filter className="h-4 w-4" />
              {isControlsOpen ? "Close" : "Open"} Filter
            </Button>

            <Button
              onClick={onLeftToggle}
              size="sm"
              className={`flex gap-1 items-center ${
                showAnalytics
                  ? "bg-green-600 hover:bg-green-500"
                  : "bg-blue-600 hover:bg-blue-500"
              } text-white`}
            >
              <ChartBar className="h-4 w-4" />
              {showAnalytics ? "Hide" : "Show"} Analytics
            </Button>

            

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => toggleQuickControl("opacity")}
                className={`${activeQuickControl === "opacity" ? "bg-blue-600 hover:bg-blue-500" : "bg-slate-700 hover:bg-slate-600"} text-white border-slate-600`}
                title="Opacity"
              >
                <Droplets className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => toggleQuickControl("radius")}
                className={`${activeQuickControl === "radius" ? "bg-blue-600 hover:bg-blue-500" : "bg-slate-700 hover:bg-slate-600"} text-white border-slate-600`}
                title="Log Radius"
              >
                <CircleDot className="h-4 w-4" />
              </Button>
              {neighborLogsAvailable && (
                <Button
                  size="sm"
                  onClick={() => toggleQuickControl("neighbors")}
                  className={`${activeQuickControl === "neighbors" ? "bg-blue-600 hover:bg-blue-500" : "bg-slate-700 hover:bg-slate-600"} text-white border-slate-600`}
                  title="Secondary Logs"
                >
                  <Radio className="h-4 w-4" />
                </Button>
              )}
            </div>

            {activeQuickControl === "opacity" && (
              <div className="flex items-center gap-2 bg-gray-700/80 rounded-lg px-3 py-1.5 border border-gray-600">
                <span className="text-xs text-gray-300 font-medium">Opacity</span>
                <button
                  type="button"
                  onClick={() => adjustOpacity(-5)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Decrease opacity"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={currentOpacityPercent}
                  onChange={(e) => updateOpacityFromInput(e.target.value)}
                  className="h-7 w-14 bg-slate-800 border-slate-600 text-white text-xs text-center px-1"
                />
                <button
                  type="button"
                  onClick={() => adjustOpacity(5)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Increase opacity"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <span className="text-xs text-blue-300 font-medium">%</span>
              </div>
            )}

            {activeQuickControl === "radius" && (
              <div className="flex items-center gap-2 bg-gray-700/80 rounded-lg px-3 py-1.5 border border-gray-600">
                <span className="text-xs text-gray-300 font-medium">Log Radius</span>
                <button
                  type="button"
                  onClick={() => adjustLogRadius(-1)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Decrease log radius"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <Input
                  type="number"
                  min={4}
                  max={40}
                  value={currentLogRadius}
                  onChange={(e) => updateLogRadiusFromInput(e.target.value)}
                  className="h-7 w-14 bg-slate-800 border-slate-600 text-white text-xs text-center px-1"
                />
                <button
                  type="button"
                  onClick={() => adjustLogRadius(1)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Increase log radius"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            )}

            {activeQuickControl === "neighbors" && neighborLogsAvailable && (
              <div className="flex items-center gap-2 bg-gray-700/80 rounded-lg px-3 py-1.5 border border-gray-600">
                <span className="text-xs text-gray-300 font-medium">Neighbor Size</span>
                <button
                  type="button"
                  onClick={() => adjustNeighborSquareSize(-1)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Decrease neighbor square size"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <Input
                  type="number"
                  min={3}
                  max={80}
                  value={currentNeighborSquareSize}
                  onChange={(e) => updateNeighborSquareSizeFromInput(e.target.value)}
                  className="h-7 w-14 bg-slate-800 border-slate-600 text-white text-xs text-center px-1"
                />
                <button
                  type="button"
                  onClick={() => adjustNeighborSquareSize(1)}
                  className="h-6 w-6 rounded bg-slate-600 hover:bg-slate-500 flex items-center justify-center"
                  title="Increase neighbor square size"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div>
        {isMapPage && <DrawingControlsPanel position="relative" onUIChange={onUIChange} ui={ui} />}
      </div>

      <div className="flex items-center space-x-4">
        <Button
              onClick={() => onOpenOperatorComparison?.()}
              size="sm"
              className="flex gap-1 items-center bg-indigo-600 hover:bg-indigo-500 text-white"
              title="Open Operator Comparison"
            >
              BenchMark
            </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="bg-slate-700 hover:bg-slate-600 text-white border-slate-600 flex items-center gap-1">
              Views
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-white border border-gray-200 shadow-lg">
            <DropdownMenuItem onClick={() => openInNewTab("/dashboard")} className="cursor-pointer">
              Dashboard
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openInNewTab("/mapview")} className="cursor-pointer">
              Map View
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog>
    <DialogTrigger asChild>
      <Button size="sm" className="bg-slate-700 hover:bg-slate-600 text-white border-slate-600" title="Settings">
        <SettingsIcon className="h-4 w-4" />
      </Button>
    </DialogTrigger>
    <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0">
      <SettingsPage onSaveSuccess={onSettingsSaved} />
    </DialogContent>
    
  </Dialog>

  <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-gray-800 text-white border-gray-700">
            <div className="p-6 text-center">
              <h2 className="text-lg font-semibold mb-4">Quick Upload Session Data</h2>
              <div className="flex flex-col items-center gap-4">
                <label className="w-full flex flex-col items-center px-4 py-6 bg-gray-700 rounded-lg border-2 border-dashed border-gray-500 cursor-pointer hover:border-blue-500 transition-colors">
                  <UploadCloud className="h-10 w-10 text-gray-400 mb-2" />
                  <span className="text-sm">
                    {selectedFile ? selectedFile.name : "Select .csv file"}
                  </span>
                  <input 
                    type="file" 
                    className="hidden" 
                    onChange={handleFileChange}
                    accept=".csv"
                  />
                </label>
                
                <Button 
                  onClick={handleQuickUpload} 
                  disabled={isUploading || !selectedFile}
                  className="w-full bg-blue-600 hover:bg-blue-500"
                >
                  {isUploading ? <Spinner /> : "Upload Now"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* LTE Prediction Prompt Dialog */}
        <Dialog open={showPredictionPrompt} onOpenChange={setShowPredictionPrompt}>
          <DialogContent className="sm:max-w-md bg-gray-800 text-white border-gray-700">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2">Run LTE Prediction</h2>
              <p className="text-sm text-gray-400 mb-6">
                Do you want to run prediction on the uploaded site data? This will use the drawn polygon area if present.
              </p>
              
              <div className="flex flex-col gap-4 mb-6">
                <div>
                  <label className="text-sm text-gray-300 font-medium block mb-1">Grid Value</label>
                  <input
                    type="number"
                    value={gridValue}
                    onChange={(e) => setGridValue(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    placeholder="e.g. 25.0"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-300 font-medium block mb-1">Radius (m)</label>
                  <input
                    type="number"
                    value={radiusM}
                    onChange={(e) => setRadiusM(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    placeholder="e.g. 5000.0"
                  />
                </div>
                {polygonStats?.geometry?.type === "polygon" && polygonStats.geometry.polygon?.length > 0 && (
                  <div className="text-xs text-green-400 font-medium mt-1">
                    ✓ Using active drawn polygon area ({polygonStats.geometry.polygon.length} points)
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end">
                <Button 
                  variant="ghost" 
                  onClick={() => setShowPredictionPrompt(false)}
                  disabled={isPredicting}
                  className="hover:bg-gray-700 hover:text-white"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleRunPrediction} 
                  disabled={isPredicting}
                  className="bg-blue-600 hover:bg-blue-500"
                >
                  {isPredicting ? <Spinner /> : "Run Prediction"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <ProjectsDropdown currentProjectId={effectiveProjectId} />
        
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <span className="text-sm text-gray-300">
            <span className="font-medium text-white">{user?.name || "User"}</span>
          </span>
        </div>
        
        <Button
          onClick={logout}
          variant="default"
          size="sm"
          className="text-white bg-red-600"
        >
          <LogOut className="h-4 w-4 mr-2 text-white" />
          Logout
        </Button>
      </div>
    </header>
  );
}
