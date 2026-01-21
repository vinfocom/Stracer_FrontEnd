// src/components/multiMap/Header.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Plus } from "lucide-react";
import { useLocation, Link, useSearchParams } from "react-router-dom";
import { mapViewApi } from "@/api/apiEndpoints";

export default function Header({
  projectId,
  project, 
  sessionIds,
  addMap,
}) {
  const { logout } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const effectiveProjectId =
    projectId || searchParams.get("project_id") || searchParams.get("project");

 
  const [fetchedProject, setFetchedProject] = useState(null);

  // 3. Logic: Use the passed prop if available, otherwise use the locally fetched one
  const displayProject = project || fetchedProject;

  useEffect(() => {
    const fetchProject = async () => {
      // Optimization: If project is already passed via props, don't fetch again
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

  return (
    <header className="h-14 bg-slate-800 border-b flex items-center justify-between px-4 shadow-sm z-10 flex-shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="font-bold text-lg text-white">
          {/* 4. FIX: Handle both 'project_name' (used in UnifiedHeader) and 'name' */}
          {displayProject ? `${displayProject.project_name || displayProject.name}` : ""}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Navigation Buttons */}
        <Button  size="sm" className="bg-blue-600 text-white" asChild>
          <Link to="/dashboard">Dashboard</Link>
        </Button>
        <Button size="sm" className="bg-blue-600 text-white" asChild>
          <Link to={`/unified-map?${searchParams.toString()}`}>
            Unified Map
          </Link>
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