import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Filter, ChartBar, ChevronDown, ChevronUp } from "lucide-react";
import { useLocation, Link, useSearchParams } from "react-router-dom";
import { mapViewApi } from "@/api/apiEndpoints";
import ProjectsDropdown from "../project/ProjectsDropdown";
import DrawingControlsPanel from "../map/layout/DrawingControlsPanel";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import SettingsPage from "@/pages/Setting";

export default function UnifiedHeader({
  onToggleControls,
  isControlsOpen,
  isLeftOpen,
  onLeftToggle,
  showAnalytics,
  projectId,
  sessionIds,
  isOpacityCollapsed,
  setIsOpacityCollapsed,
  opacity,
  project,
  setProject,
  setOpacity,
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

            <div className="flex items-center gap-2 bg-gray-700/80 rounded-lg px-3 py-1.5 border border-gray-600">
              <span className="text-xs text-gray-300 font-medium">Opacity</span>

              {!isOpacityCollapsed ? (
                <>
                  <span className="text-xs font-bold text-blue-400 min-w-[40px] text-center">
                    {Math.round((opacity ?? 0.8) * 100)}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={(opacity ?? 0.8) * 100}
                    onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                    className="w-24 h-2 bg-gray-500 rounded-lg cursor-pointer accent-blue-500"
                  />
                  <button
                    onClick={() => setIsOpacityCollapsed(true)}
                    className="text-gray-400 hover:text-white transition-colors p-0.5 rounded hover:bg-gray-600"
                    title="Collapse"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="text-xs text-blue-400 font-medium">
                    {Math.round((opacity ?? 0.8) * 100)}%
                  </span>
                  <button
                    onClick={() => setIsOpacityCollapsed(false)}
                    className="text-gray-400 hover:text-white transition-colors p-0.5 rounded hover:bg-gray-600"
                    title="Expand"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div>
        {isMapPage && <DrawingControlsPanel position="relative" onUIChange={onUIChange} ui={ui} />}
      </div>

      <div className="flex items-center space-x-4">
        <Button size="sm" className="bg-slate-700 hover:bg-slate-600 text-white border-slate-600">
          <Link to="/dashboard">Dashboard</Link>
        </Button>
        <Button size="sm" className="bg-slate-700 hover:bg-slate-600 text-white border-slate-600">
          <Link to="/mapview">Map View</Link>
        </Button>

        <Dialog>
    <DialogTrigger asChild>
      <Button  size="sm" className="bg-slate-700 hover:bg-slate-600 text-white border-slate-600">
        Settings
      </Button>
    </DialogTrigger>
    <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0">
      <SettingsPage onSaveSuccess={onSettingsSaved} />
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