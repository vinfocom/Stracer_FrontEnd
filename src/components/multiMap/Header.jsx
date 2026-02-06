// src/components/multiMap/Header.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Plus } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { mapViewApi } from "@/api/apiEndpoints";

export default function Header({
  projectId,
  project, 
  sessionIds,
  addMap,
  locations,
  neighborData,
  thresholds
}) {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const effectiveProjectId =
    projectId || searchParams.get("project_id") || searchParams.get("project");
 
  const [fetchedProject, setFetchedProject] = useState(null);

  const displayProject = project || fetchedProject;

  useEffect(() => {
    const fetchProject = async () => {
      if (project) return; 

      if (!effectiveProjectId) return;
      try {
        const response = await mapViewApi.getProjects();
        const allProjects = response?.Data || [];

        if (Array.isArray(allProjects)) {
          const matchedProject = allProjects.find(
            (p) => p.id === Number(effectiveProjectId)
          );
          if (matchedProject) setFetchedProject(matchedProject);
        }
      } catch (error) {
        console.error("Failed to fetch project info", error);
      }
    };

    fetchProject();
  }, [effectiveProjectId, project]);

  const handleUnifiedNavigation = () => {
    navigate(`/unified-map?${searchParams.toString()}`, {
        state: {
            locations,
            neighborData,
            thresholds,
            project: displayProject
        }
    });
  };

  return (
    <header className="h-14 bg-slate-800 border-b flex items-center justify-between px-4 shadow-sm z-10 flex-shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="font-bold text-lg text-white">
          {displayProject ? `${displayProject.project_name || displayProject.name}` : ""}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Navigation Buttons */}
        <Button size="sm" className="bg-blue-600 text-white" onClick={() => navigate("/dashboard")}>
          Dashboard
        </Button>
        
        {/* Updated Unified Map Button */}
        <Button 
            size="sm" 
            className="bg-blue-600 text-white" 
            onClick={handleUnifiedNavigation}
        >
            Unified Map
        </Button>

        <div className="h-6 w-px bg-gray-300 mx-1" />

        <button
          onClick={addMap}
          className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition text-sm font-medium"
        >
          <Plus size={16} /> Add View
        </button>

        <Button
          onClick={logout}
          variant="destructive"
          size="sm"
          className="ml-2 bg-red-600 hover:bg-red-700"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>
    </header>
  );
}