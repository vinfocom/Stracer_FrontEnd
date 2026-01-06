// src/pages/ProjectMapView.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api"; // For the map
import { useSearchParams } from 'react-router-dom'; // To read URL parameters
import { toast } from "react-toastify"; // For notifications

// Your API functions (make sure paths are correct)
import { mapViewApi, settingApi } from "@/api/apiEndpoints";

// Reusable UI Components
import Spinner from "@/components/common/Spinner";
import MapLegend from "@/components/map/MapLegend"; // Reusable legend
// You'll create these next:
// import ProjectMapHeader from "@/components/map/layout/ProjectMapHeader";
// import ProjectMapSidebar from "@/components/map/layout/ProjectMapSidebar";

// Layer Components (reuse existing ones)
import LogCirclesLayer from "@/components/map/layers/LogCirclesLayer";
import ProjectPolygonsLayer from "@/components/map/overlays/ProjectPolygonsLayer";

// Utils
import { loadSavedViewport, saveViewport } from "@/utils/viewport"; // Map position saving
import { parseWKTToCoordinates } from "@/utils/wkt"; // WKT polygon parser
import { GOOGLE_MAPS_LOADER_OPTIONS } from "@/lib/googleMapsLoader"; // Map loader config

// Constants
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID; // Your Map ID
const DEFAULT_CENTER = { lat: 28.6139, lng: 77.2090 }; // Default map center (e.g., Delhi)
const MAP_CONTAINER_STYLE = { height: "calc(100vh - 64px)", width: "100%" }; // Adjust height based on your header

// --- Main Component Function ---
const ProjectMapView = () => {
    // Hook to load Google Maps API script
    const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

    // Hook to read URL parameters like projectId and sessionIds
    const [searchParams] = useSearchParams();

    // Ref to hold the Google Map instance once it's loaded
    const mapRef = useRef(null);

    // --- State Variables ---
    const [map, setMap] = useState(null); // Holds the map instance
    const [dataType, setDataType] = useState('prediction'); // 'prediction' or 'session' - current view
    const [loading, setLoading] = useState(true); // General loading state for the page
    const [displayData, setDisplayData] = useState([]); // Array holding points/logs to show on map
    const [thresholds, setThresholds] = useState({}); // Color thresholds for metrics
    const [projectPolygons, setProjectPolygons] = useState([]); // Parsed polygons for the project
    const [selectedMetric, setSelectedMetric] = useState("rsrp"); // Metric being visualized
    const [sidebarFilters, setSidebarFilters] = useState({}); // Filters from the sidebar (e.g., date range, band)
    const [uiToggles, setUiToggles] = useState({ // UI display options
        showCircles: true,
        showHeatmap: false,
        showPolygons: true,
        renderVisibleOnly: true,
        basemapStyle: 'clean',
    });
    const [visibleBounds, setVisibleBounds] = useState(null); // Current map viewport bounds

    // Extract projectId and sessionIds from URL parameters
    const projectId = searchParams.get('projectId');
    const sessionIdsParam = searchParams.get('sessionIds');
    const parsedSessionIds = useMemo(() => {
        // Convert comma-separated string from URL into an array of numbers
        return sessionIdsParam
            ? sessionIdsParam.split(',').map(id => parseInt(id.trim(), 10)).filter(Number.isFinite)
            : [];
    }, [sessionIdsParam]);

    // --- Placeholder for useEffect hooks (Data Fetching, Map Setup) ---
    useEffect(()=>{
        const fetchpolygon = async()=>{
            try {
                
            } catch (error) {
                
            }
        }
    })



    // --- Event Handlers (Map Load, Viewport Change, UI Changes) ---
    // We'll fill these in later

    // --- Conditional Rendering based on loading state ---
    if (loadError) return <div className="error-message">Error loading Google Maps script.</div>;
    if (!isLoaded || loading) return <div className="loading-container"><Spinner /></div>; // Show spinner while loading map or initial data

    // --- Main JSX Return ---
    return (
        <div className="project-map-page"> {/* Use appropriate CSS classes */}
            {/* We will add Header, Sidebar, and Map components here */}
            <p>Project Map View Placeholder - Project ID: {projectId}</p>
            {/* Display fetched data count for testing */}
            <p>Displaying {displayData.length} points for {dataType} data.</p>
        </div>
    );
};

export default ProjectMapView;