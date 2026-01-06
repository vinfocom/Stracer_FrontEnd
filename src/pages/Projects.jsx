// src/pages/CreateProjectPage.jsx
import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import { mapViewApi } from "../api/apiEndpoints";
import { ProjectForm } from "../components/project/ProjectForm";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const CreateProjectPage = () => {
  const [polygons, setPolygons] = useState([]);
  const [backendHealth, setBackendHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchPolygons = useCallback(async () => {
    setLoading(true);
    try {
      const polygonsRes = await mapViewApi.getAvailablePolygons();
      console.log("✅ Polygon API response:", polygonsRes);

      // ✅ Extract data array from response object
      const shapeList = Array.isArray(polygonsRes?.data) 
        ? polygonsRes.data 
        : [];

      console.log("📦 Shape list:", shapeList, "Count:", shapeList.length);

      // ✅ UPDATED: Include sessionIds in mapped polygons
      const mappedPolygons = shapeList.map((p) => ({
        value: p.id,
        label: p.name,
        wkt: p.wkt,
        sessionIds: Array.isArray(p.sessionIds) ? p.sessionIds : [], // ✅ Include sessions
        geometry: null,
        geojson: null,
      }));

      console.log("🗺️ Mapped polygons:", mappedPolygons);
      setPolygons(mappedPolygons);
      
      if (mappedPolygons.length > 0) {
        toast.success(`Loaded ${mappedPolygons.length} polygons`);
      }
      
    } catch (error) {
      console.error("❌ Polygon fetch error:", error);
      toast.error("Failed to load polygons.");
      setPolygons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolygons();
  }, [fetchPolygons]);

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Create Project</h1>
          <p className="text-gray-600 mt-1">
            Create a new project using available building extraction areas.
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchPolygons}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Project Form */}
      {loading && polygons.length === 0 ? (
        <div className="text-center py-8">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
          <p className="mt-2 text-gray-600">Loading polygons...</p>
        </div>
      ) : (
        <ProjectForm
          polygons={polygons}
          loading={loading}
          backendHealthy={{
            python: backendHealth?.python?.healthy || false,
            csharp: backendHealth?.csharp?.healthy || false,
          }}
          onProjectCreated={fetchPolygons}
        />
      )}
    </div>
  );
};

export default CreateProjectPage;