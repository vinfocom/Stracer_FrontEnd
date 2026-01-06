// src/pages/ViewProjectsPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Map, Folder, Calendar, Building2, RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Spinner from "@/components/common/Spinner";
import { mapViewApi } from "@/api/apiEndpoints";

const ViewProjectsPage = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : "N/A");

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mapViewApi.getProjects();
      if (res?.Data && Array.isArray(res.Data)) {
        setProjects(res.Data);
      } else {
        setProjects([]);
        toast.warn("No projects found.");
      }
    } catch (error) {
      console.error("❌ Failed to fetch projects:", error);
      toast.error("Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleViewOnMap = (project) => {
    if (!project || !project.id) {
      toast.warn("Project has no ID to view on map.");
      return;
    }

    const params = new URLSearchParams({ project_id: project.id });
    if (project.ref_session_id) params.set("session", project.ref_session_id);
    navigate(`/unified-map?${params.toString()}`);
  };

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Existing Projects</h1>
          <p className="text-gray-600 mt-1">
            Browse and open your previously created projects.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchProjects}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Projects Card */}
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Project List</CardTitle>
          
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <Spinner />
            </div>
          ) : projects.length ? (
            <div className="max-h-[500px] overflow-y-auto pr-2">
              <div className="  grid 
      gap-4 
      sm:grid-cols-2 
      md:grid-cols-3 
      lg:grid-cols-4 
      xl:grid-cols-5 
      2xl:grid-cols-6">
              {/* <div className=" flex justify-start flex-wrap w-full gap-4"> */}
            
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className="group relative flex wrap-normal border-1 rounded-md flex-col items-center p-4 min-w-[100px] hover:bg-gray-50 transition-all duration-200 cursor-pointer"
                    onClick={() => handleViewOnMap(p)}
                  >
                    <div className="relative mb-3 ">
                      <Map />
                      <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                        
                      </div>
                    </div>

                    <h3 className="text-sm font-medium text-center text-gray-900 mb-1 line-clamp-2 w-full">
                      {p.project_name}
                    </h3>

                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1 mb-1">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(p.created_on)}</span>
                        </div>
                        {p.provider && (
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            <span>{p.provider}</span>
                          </div>
                        )}
                        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
                          <div className="border-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    </div>

                    <span className="text-xs text-gray-500">
                      {formatDate(p.created_on)}
                    </span>
                    
                  </div>
                  
                ))}
                
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-gray-500">
              <Folder className="h-12 w-12 mb-2 text-gray-300" />
              <span>No projects found.</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ViewProjectsPage;
