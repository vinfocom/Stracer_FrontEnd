import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { useJsApiLoader } from "@react-google-maps/api";
import { Trash2, Map as MapIcon, ChevronRight } from "lucide-react";


import { useNetworkSamples } from "@/hooks/useNetworkSamples";
import { useSessionNeighbors } from "@/hooks/useSessionNeighbors";
import useColorForLog from "@/hooks/useColorForLog";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";

import MapChild from "../components/multiMap/MapChild";
import Spinner from "../components/common/Spinner";
import Header from "@/components/multiMap/Header";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";

const MultiViewPage = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const sessionIds = useMemo(() => {
    return searchParams.get("session")?.split(",") || [];
  }, [searchParams]);

  const projectId =
    searchParams.get("project_id") || location.state?.project?.id;

  const passedState = location.state;
  const passedLocations = passedState?.locations;
  const passedNeighbors = passedState?.neighborData;
  const passedThresholds = passedState?.thresholds;
  const project = passedState?.project;
  const hasPassedLocations =
    Array.isArray(passedLocations) && passedLocations.length > 0;
  const hasPassedNeighbors =
    Array.isArray(passedNeighbors) && passedNeighbors.length > 0;

  const shouldFetch = !hasPassedLocations;

  const { locations: fetchedLocations, loading: samplesLoading } =
    useNetworkSamples(sessionIds, shouldFetch);
  const { neighborData: fetchedNeighbors, loading: neighborsLoading } =
    useSessionNeighbors(sessionIds, shouldFetch);

  const { thresholds: hookThresholds } = useColorForLog();
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  const locations = hasPassedLocations ? passedLocations : fetchedLocations;
  const neighborData = hasPassedNeighbors ? passedNeighbors : fetchedNeighbors;
  const thresholds = passedThresholds || hookThresholds;

  // --- Map State Management ---
  const [maps, setMaps] = useState([
    { id: 1, title: "Map 1" },
    { id: 2, title: "Map 2" },
  ]);

  // Controls which map is displayed in the first slot
  const [activeStartIndex, setActiveStartIndex] = useState(0);

  const addMap = () => {
    const newId = maps.length > 0 ? Math.max(...maps.map((m) => m.id)) + 1 : 1;
    const newMaps = [...maps, { id: newId, title: `Map ${newId}` }];
    setMaps(newMaps);
    if (newMaps.length > 2) {
      setActiveStartIndex(newMaps.length - 2); 
    }
  };

  const removeMap = (id, e) => {
    if(e) e.stopPropagation(); 
    
    const newMaps = maps.filter((m) => m.id !== id);
    setMaps(newMaps);
    
    if (activeStartIndex >= newMaps.length) {
      setActiveStartIndex(Math.max(0, newMaps.length - 1));
    }
  };

  const visibleMaps = useMemo(() => {
    return maps.slice(activeStartIndex, activeStartIndex + 2);
  }, [maps, activeStartIndex]);

  const isLoading =
    (shouldFetch && (samplesLoading || neighborsLoading)) || !isLoaded;

  if (isLoading)
    return (
      <div className="h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      <Header 
        project={project} 
        projectId={projectId}
        sessionIds={sessionIds} // Pass sessionIds here
        addMap={addMap} 
        locations={locations}
        neighborData={neighborData}
        thresholds={thresholds}
      />

      {/* Main Content Area with Sidebar */}
      <div className="flex flex-grow overflow-hidden">
        
        {/* --- Sidebar (PPT Style) --- */}
        <div className="w-64 bg-white border-r flex flex-col shadow-lg z-10 flex-shrink-0">
          <div className="p-3 border-b bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <MapIcon size={16} />
              Map Slides ({maps.length})
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Select a map to view it and the next one.
            </p>
          </div>
          
          <ScrollArea className="flex-grow">
            <div className="p-2 space-y-2">
              {maps.map((mapInstance, index) => {
                const isActive = index >= activeStartIndex && index < activeStartIndex + 2;
                const isPrimary = index === activeStartIndex;

                return (
                  <Card
                    key={mapInstance.id}
                    onClick={() => setActiveStartIndex(index)}
                    className={`
                      p-3 cursor-pointer transition-all hover:bg-slate-50 relative group
                      ${isActive ? "border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-500" : "border-gray-200"}
                    `}
                  >
                    <div className="flex justify-between items-center mb-2">
                       <span className={`text-sm font-medium ${isActive ? "text-blue-700" : "text-gray-700"}`}>
                         {mapInstance.title}
                       </span>
                       <span className="text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 rounded">
                         #{index + 1}
                       </span>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <div className="text-[10px] text-gray-500">
                        {isActive ? (isPrimary ? "View (Left)" : "View (Right)") : "Hidden"}
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => removeMap(mapInstance.id, e)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* --- Main Grid Area --- */}
        <div className="flex-grow p-2 bg-slate-100 relative">
          <div 
            className={`h-full grid gap-2 ${
              visibleMaps.length === 1 ? "grid-cols-1" : "grid-cols-2"
            }`}
          >
            {visibleMaps.length > 0 ? (
              visibleMaps.map((mapInstance) => (
                <MapChild
                  key={mapInstance.id}
                  id={mapInstance.id}
                  title={mapInstance.title}
                  projectId={projectId}
                  allLocations={locations}
                  allNeighbors={neighborData}
                  thresholds={thresholds}
                  project={project}
                  onRemove={(id) => removeMap(id)}
                />
              ))
            ) : (
              <div className="col-span-2 flex items-center justify-center text-gray-400 flex-col gap-2 border-2 border-dashed border-gray-300 rounded-lg m-4">
                <MapIcon size={48} className="opacity-20" />
                <p>No maps active. Click "Add View" to start.</p>
              </div>
            )}
          </div>
          
           {maps.length > activeStartIndex + 2 && (
             <button 
               onClick={() => setActiveStartIndex(prev => Math.min(maps.length - 1, prev + 1))}
               className="absolute right-0 top-1/2 -translate-y-1/2 bg-white/80 p-1 rounded-l shadow-md hover:bg-white z-20"
             >
               <ChevronRight size={24} />
             </button>
           )}
        </div>
      </div>
    </div>
  );
};

export default MultiViewPage;
