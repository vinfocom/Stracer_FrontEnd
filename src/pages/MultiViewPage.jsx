// src/pages/MultiViewPage.jsx
import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useJsApiLoader } from "@react-google-maps/api";
import { Plus, LayoutGrid, Maximize } from 'lucide-react';

// Hooks
import { useNetworkSamples } from '@/hooks/useNetworkSamples';
import { useSessionNeighbors } from '@/hooks/useSessionNeighbors';
import useColorForLog from '@/hooks/useColorForLog';
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";

// Components
import MapChild from '../components/multiMap/MapChild';
import Spinner from '../components/common/Spinner';

const MultiViewPage = () => {
  const [searchParams] = useSearchParams();
  const sessionIds = useMemo(() => {
     return searchParams.get("session")?.split(",") || [];
  }, [searchParams]);

  // --- 1. Fetch Shared Data ONCE ---
  const { locations, loading: samplesLoading } = useNetworkSamples(sessionIds, true);
  const { neighborData, loading: neighborsLoading } = useSessionNeighbors(sessionIds, true);
  const { thresholds } = useColorForLog(); // Fetch thresholds once
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  // --- 2. State for Map Instances ---
  const [maps, setMaps] = useState([
    { id: 1, title: "Map 1" },
    { id: 2, title: "Map 2" }
  ]);

  const addMap = () => {
    const newId = maps.length > 0 ? Math.max(...maps.map(m => m.id)) + 1 : 1;
    setMaps([...maps, { id: newId, title: `Map ${newId}` }]);
  };

  const removeMap = (id) => {
    setMaps(maps.filter(m => m.id !== id));
  };

  const isLoading = samplesLoading || neighborsLoading || !isLoaded;

  if (isLoading) return <div className="h-screen flex items-center justify-center"><Spinner /></div>;

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <div className="h-14 bg-white border-b flex items-center justify-between px-4 shadow-sm z-10">
        <h1 className="font-bold text-lg text-gray-800">Multi-Map Analysis</h1>
        <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>Total Points: <strong>{locations.length.toLocaleString()}</strong></span>
            <button 
              onClick={addMap} 
              className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition"
            >
              <Plus size={16} /> Add View
            </button>
        </div>
      </div>

      {/* Grid Container */}
      <div className={`flex-grow p-2 grid gap-2 overflow-hidden ${
         maps.length === 1 ? 'grid-cols-1' :
         maps.length === 2 ? 'grid-cols-2' :
         maps.length <= 4 ? 'grid-cols-2 grid-rows-2' :
         'grid-cols-3 grid-rows-2'
      }`}>
        {maps.map((mapInstance) => (
          <MapChild
            key={mapInstance.id}
            id={mapInstance.id}
            title={mapInstance.title}
           
            allLocations={locations} 
            allNeighbors={neighborData}
            thresholds={thresholds}
            onRemove={removeMap}
          />
        ))}
      </div>
    </div>
  );
};

export default MultiViewPage;