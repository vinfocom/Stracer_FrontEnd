import React, { useState, useMemo } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { useJsApiLoader } from "@react-google-maps/api";

// Hooks
import { useNetworkSamples } from "@/hooks/useNetworkSamples";
import { useSessionNeighbors } from "@/hooks/useSessionNeighbors";
import useColorForLog from "@/hooks/useColorForLog";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader";

// Components
import MapChild from "../components/multiMap/MapChild";
import Spinner from "../components/common/Spinner";
import Header from "@/components/multiMap/Header";

const MultiViewPage = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const sessionIds = useMemo(() => {
    return searchParams.get("session")?.split(",") || [];
  }, [searchParams]);

  const projectId =
    searchParams.get("project_id") || location.state?.project?.id;

  // Check if data was passed via navigation state
  const passedState = location.state;
  const passedLocations = passedState?.locations;
  const passedNeighbors = passedState?.neighborData;
  const passedThresholds = passedState?.thresholds;
  const project = passedState?.project;

  const shouldFetch = !passedLocations;

  // --- 1. Fetch Shared Data (if not passed) ---
  const { locations: fetchedLocations, loading: samplesLoading } =
    useNetworkSamples(sessionIds, shouldFetch);
  const { neighborData: fetchedNeighbors, loading: neighborsLoading } =
    useSessionNeighbors(sessionIds, shouldFetch);

  // Always call hooks to obey React rules, but ignore result if passed data exists
  const { thresholds: hookThresholds } = useColorForLog();
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  // Combine passed data with fetched fallback
  const locations = passedLocations || fetchedLocations;
  const neighborData = passedNeighbors || fetchedNeighbors;
  const thresholds = passedThresholds || hookThresholds;

  //  yeh jo map ko sara hold kar raha ki kitne map banana hai
  const [maps, setMaps] = useState([
    { id: 1, title: "Map 1" },
    { id: 2, title: "Map 2" },
  ]);

  const addMap = () => {
    const newId = maps.length > 0 ? Math.max(...maps.map((m) => m.id)) + 1 : 1;
    setMaps([...maps, { id: newId, title: `Map ${newId}` }]);
  };

  const removeMap = (id) => {
    setMaps(maps.filter((m) => m.id !== id));
  };

  const isLoading =
    (shouldFetch && (samplesLoading || neighborsLoading)) || !isLoaded;

  if (isLoading)
    return (
      <div className="h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <Header project={project} addMap={addMap} />

      {/* Grid Container */}
      <div
        className={`flex-grow p-2 grid gap-2 overflow-hidden ${
          maps.length === 1
            ? "grid-cols-1"
            : maps.length === 2
              ? "grid-cols-2"
              : maps.length <= 4
                ? "grid-cols-2 grid-rows-2"
                : "grid-cols-3 grid-rows-2"
        }`}
      >
        {maps.map((mapInstance) => (
          // yaha pe data pass karke ja raha har ek map ko`
          <MapChild
            key={mapInstance.id}
            id={mapInstance.id}
            title={mapInstance.title}
            projectId={projectId}    // yaha pe polygon ko bhej ko logs ko polygoin ke hisab se filter kar sake
            allLocations={locations} // use Netwo rk Samples hook se aaya sara data
            allNeighbors={neighborData} // use Session Neighbors hook se aaya sara data
            thresholds={thresholds} // useColorForLog se aaya thresholds
            project={project}
            onRemove={removeMap}
          />
        ))}
      </div>
    </div>
  );
};

export default MultiViewPage;
