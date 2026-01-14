// src/components/multiMap/MapChild.jsx
import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react'; 
import { normalizeProviderName, normalizeTechName } from '@/utils/colorUtils'; 
import MapwithMultipleCircle from '../MapwithMultipleCircle';

const MapChild = ({
    id,
    title,
    allNeighbors, 
    allLocations = [],
    onRemove,
    thresholds, 
}) => {

    const [metric, setMetric] = useState("rsrp"); 
    const [provider, setProvider] = useState("All");
    const [band, setBand] = useState("All");
    const [tech, setTech] = useState("All");

    // --- 1. Filter Data ---
    const filteredData = useMemo(() => {
        if(!allLocations) return [];

        return allLocations.filter(loc => {
            // Tech Filter
            if(tech !== "All"){
                const t = normalizeTechName(loc.technology);
                if(t !== tech) return false;
            }
            // Provider Filter
            if(provider !== "All"){
                const p = normalizeProviderName(loc.provider);
                if(p !== provider) return false;
            }
            // Band Filter (using string comparison safely)
            if(band !== "All"){
                const b = String(loc.band || "");
                if(b !== band) return false;
            }
            return true;
        });
    }, [allLocations, tech, provider, band]);

    // --- 2. Generate Options ---
    const options = useMemo(() => {
        const techSet = new Set(["All"]);
        const providerSet = new Set(["All"]);
        // const bandSet = new Set(["All"]); // Uncomment if you want band options

        allLocations.forEach(loc => {
            if (loc.technology) techSet.add(normalizeTechName(loc.technology));
            if (loc.provider) providerSet.add(normalizeProviderName(loc.provider));
        });

        // ✅ CRITICAL FIX: Return the object
        return {
            tech: Array.from(techSet).sort(),
            provs: Array.from(providerSet).sort()
        };
    }, [allLocations]);

    return (
        <div className="relative w-full h-full flex flex-col border rounded-lg bg-white shadow-sm overflow-hidden">
            {/* --- Mini Toolbar --- */}
            <div className="flex items-center justify-between p-2 bg-gray-50 border-b h-12">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-gray-700">{title}</span>
                    
                    {/* Metric Selector */}
                    <select 
                        value={metric} 
                        onChange={(e) => setMetric(e.target.value)}
                        className="text-xs border rounded px-1 py-1 bg-white"
                    >
                        <option value="rsrp">RSRP</option>
                        <option value="rsrq">RSRQ</option>
                        <option value="sinr">SINR</option>
                        <option value="dl_tpt">DL Tpt</option>
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    {/* Tech Filter */}
                    <select 
                        value={tech} 
                        onChange={(e) => setTech(e.target.value)}
                        className="text-xs border rounded px-1 py-1 bg-white max-w-[80px]"
                    >
                        {options.tech.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>

                    {/* Provider Filter */}
                    <select 
                        value={provider} 
                        onChange={(e) => setProvider(e.target.value)}
                        className="text-xs border rounded px-1 py-1 bg-white max-w-[80px]"
                    >
                        {options.provs.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>

                    <button onClick={() => onRemove(id)} className="text-gray-400 hover:text-red-500">
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* --- The Map --- */}
            <div className="flex-grow relative">
                <MapwithMultipleCircle
                   
                    isLoaded={true}
                    
                    locations={filteredData}
                    selectedMetric={metric}
                    thresholds={thresholds}
                    neighborData={allNeighbors} 
                    showNeighbors={false} 
                    fitToLocations={true} 
                    showControls={false} 
                />
                
                {/* Stats Overlay */}
                <div className="absolute bottom-2 left-2 bg-white/90 p-1 rounded text-[10px] shadow z-10">
                    Pts: {filteredData.length} | Avg: {
                        filteredData.length > 0 
                        ? (filteredData.reduce((acc, curr) => acc + (parseFloat(curr[metric]) || 0), 0) / filteredData.length).toFixed(1)
                        : 0
                    }
                </div>
            </div>
        </div>
    );
};

export default MapChild;