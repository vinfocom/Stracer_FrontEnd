// src/pages/DriveTestSessionsPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../api/apiEndpoints';
import { toast } from 'react-toastify';
import Spinner from '../components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox'; 
import { Input } from "@/components/ui/input"; 
import { Search, Calendar, X } from 'lucide-react'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Trash2, Map, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DriveTestSessionsPage = () => {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSessions, setSelectedSessions] = useState([]); 
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState(""); 
    
    // Date filter states
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    const [currentPage, setCurrentPage] = useState(1);
    const [sessionsPerPage] = useState(10); 

    const fetchSessions = useCallback(async () => {
        try {
            setLoading(true);
            const data = await adminApi.getSessions();
            setSessions(Array.isArray(data) ? data : []);
        } catch (error) {
            toast.error(`Failed to fetch sessions: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    // Reset current page to 1 whenever the search term or date filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, startDate, endDate]);

    // Toggle single session selection
    const toggleSessionSelection = (sessionId) => {
        setSelectedSessions(prev => 
            prev.includes(sessionId) 
                ? prev.filter(id => id !== sessionId)
                : [...prev, sessionId]
        );
    };

    // Clear date filters
    const clearDateFilters = () => {
        setStartDate("");
        setEndDate("");
    };

    // Filter sessions based on search term and date range
    const filteredSessions = sessions.filter(session => {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        
        // Text search filter
        const matchesSearch = 
            session.id.toString().toLowerCase().includes(lowerCaseSearchTerm) ||
            (session.CreatedBy && session.CreatedBy.toLowerCase().includes(lowerCaseSearchTerm)) ||
            (session.mobile && session.mobile.toLowerCase().includes(lowerCaseSearchTerm));
        
        // Date filter
        let matchesDateRange = true;
        if (startDate || endDate) {
            const sessionDate = session.start_time ? new Date(session.start_time) : null;
            
            if (sessionDate) {
                // Set time to start of day for comparison
                sessionDate.setHours(0, 0, 0, 0);
                
                if (startDate) {
                    const start = new Date(startDate);
                    start.setHours(0, 0, 0, 0);
                    if (sessionDate < start) {
                        matchesDateRange = false;
                    }
                }
                
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    if (sessionDate > end) {
                        matchesDateRange = false;
                    }
                }
            } else {
                matchesDateRange = false;
            }
        }
        
        return matchesSearch && matchesDateRange;
    });

    // Toggle select all on current page
    const toggleSelectAll = () => {
        const currentPageIds = currentSessions.map(s => s.id);
        const allSelectedOnPage = currentPageIds.every(id => selectedSessions.includes(id));
        
        if (allSelectedOnPage) {
            // Deselect all on current page
            setSelectedSessions(prev => prev.filter(id => !currentPageIds.includes(id)));
        } else {
            // Select all on current page
            setSelectedSessions(prev => [...new Set([...prev, ...currentPageIds])]);
        }
    };

    // Clear all selections
    const clearSelection = () => {
        setSelectedSessions([]);
    };

    const handleDelete = async (sessionId) => {
        if (window.confirm('Are you sure you want to delete this session? This will also remove all associated log data.')) {
            try {
                await adminApi.deleteSession(sessionId);
                toast.success('Session deleted successfully');
                // Remove from selection if it was selected
                setSelectedSessions(prev => prev.filter(id => id !== sessionId));
                fetchSessions();
            } catch (error) {
                toast.error(`Failed to delete session: ${error.message}`);
            }
        }
    };

    // View single session on map
    const handleViewOnMap = (sessionId) => {
        console.log("🗺️ Navigating to map for session:", sessionId);
        navigate(`/debug-map?sessionId=${encodeURIComponent(String(sessionId))}`);
    };

    // View multiple selected sessions on map
    const handleViewSelectedOnMap = () => {
        if (selectedSessions.length === 0) {
            toast.warning('Please select at least one session');
            return;
        }
        
        // Join session IDs with comma
        const sessionIdsParam = selectedSessions.join(',');
        console.log("🗺️ Navigating to map for sessions:", selectedSessions);
        navigate(`/debug-map?sessionId=${encodeURIComponent(sessionIdsParam)}`);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString();
    };

    // Pagination logic now based on filteredSessions
    const indexOfLastSession = currentPage * sessionsPerPage;
    const indexOfFirstSession = indexOfLastSession - sessionsPerPage;
    const currentSessions = filteredSessions.slice(indexOfFirstSession, indexOfLastSession);
    const totalPages = Math.ceil(filteredSessions.length / sessionsPerPage);

    // Check if all current page sessions are selected
    const allCurrentPageSelected = currentSessions.length > 0 && 
        currentSessions.every(s => selectedSessions.includes(s.id));

    const paginate = (pageNumber) => {
        if (pageNumber > 0 && pageNumber <= totalPages) {
            setCurrentPage(pageNumber);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-full"><Spinner /></div>;
    }

    return (
        <div className="p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4 gap-4">
                <h1 className="text-2xl font-bold whitespace-nowrap">Manage Drive Test Sessions</h1>
                
                <div className="flex items-center gap-3 flex-grow justify-end flex-wrap">
                    {/* Date Filters */}
                    <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-36 h-9"
                            placeholder="Start Date"
                        />
                        <span className="text-sm text-muted-foreground">to</span>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-36 h-9"
                            placeholder="End Date"
                        />
                        {(startDate || endDate) && (
                            <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={clearDateFilters}
                                className="h-9 px-2"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    {/* Search Input */}
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                            type="text"
                            placeholder="Search by ID, User, Mobile"
                            className="pl-9 pr-3 h-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Multi-select actions */}
                    {selectedSessions.length > 0 && (
                        <>
                            <span className="text-sm text-muted-foreground whitespace-nowrap">
                                {selectedSessions.length} selected
                            </span>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={clearSelection}
                                className="h-9"
                            >
                                Clear
                            </Button>
                            <Button 
                                variant="default" 
                                size="sm"
                                onClick={handleViewSelectedOnMap}
                                className="bg-blue-600 hover:bg-blue-700 h-9"
                            >
                                <MapPin className="h-4 w-4 mr-2" />
                                View on Map
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div className="rounded-lg border shadow-sm flex-grow overflow-y-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {/* Select All Checkbox */}
                            <TableHead className="w-[50px]">
                                <Checkbox
                                    checked={allCurrentPageSelected}
                                    onCheckedChange={toggleSelectAll}
                                    aria-label="Select all on this page"
                                />
                            </TableHead>
                            <TableHead>SessionId</TableHead>
                            <TableHead>User Details</TableHead>
                            <TableHead>Start Time </TableHead>
                            <TableHead>End Time</TableHead>
                            <TableHead>Start Location</TableHead>
                            <TableHead>End Location</TableHead>
                            <TableHead>Distance(in Km)</TableHead>
                            <TableHead>Capture Frequency</TableHead>
                            <TableHead>Session Remarks</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {currentSessions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
                                    No sessions found matching your search criteria.
                                </TableCell>
                            </TableRow>
                        ) : (
                            currentSessions.map((session) => (
                                <TableRow 
                                    key={session.id}
                                    className={selectedSessions.includes(session.id) ? 'bg-blue-900/30' : ''}
                                >
                                    {/* Row Checkbox */}
                                    <TableCell>
                                        <Checkbox
                                            checked={selectedSessions.includes(session.id)}
                                            onCheckedChange={() => toggleSessionSelection(session.id)}
                                            aria-label={`Select session ${session.id}`}
                                        />
                                    </TableCell>
                                    <TableCell className="whitespace-normal break-words max-w-[150px]">
                                        <div className="font-medium">{session.id || 'N/A'} </div>
                                    </TableCell>
                                    <TableCell className="whitespace-normal break-words max-w-[200px]">
                                        <div className="font-medium">{session.CreatedBy || 'Unknown User'} ({session.mobile || 'N/A'})</div>
                                        <div className="text-sm text-muted-foreground">
                                            {session.make}, {session.model}, {session.os}, {session.operator_name}
                                        </div>
                                    </TableCell>
                                    <TableCell className="whitespace-normal break-words max-w-[200px]">
                                        <div>{formatDate(session.start_time)}</div>
                                    </TableCell>
                                    <TableCell className="whitespace-normal break-words max-w-[200px]">
                                        <div>{formatDate(session.end_time)}</div>
                                    </TableCell>
                                    <TableCell className="whitespace-normal break-words max-w-[200px]">{session.start_address}</TableCell>
                                    <TableCell className="whitespace-normal break-words max-w-[200px]">{session.end_address}</TableCell>
                                    <TableCell className="whitespace-normal break-words max-w-[100px]">{session.distance_km ? `${session.distance_km.toFixed(2)} km` : 'N/A'}</TableCell>
                                    <TableCell className="font-medium whitespace-normal break-words max-w-[150px]">
                                        <div>{session.capture_frequency || 'N/A'}</div>
                                    </TableCell>
                                    <TableCell className="font-medium whitespace-normal break-words max-w-[200px]">{session.notes || 'No Remarks'}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="outline" size="sm" onClick={() => handleViewOnMap(session.id)}>
                                            <Map className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="flex items-center justify-between p-4 border-t">
                <div className="text-sm text-muted-foreground">
                    Showing {indexOfFirstSession + 1} to {Math.min(indexOfLastSession, filteredSessions.length)} of {filteredSessions.length} entries.
                    {selectedSessions.length > 0 && (
                        <span className="ml-2 text-blue-400">
                            ({selectedSessions.length} selected across all pages)
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => paginate(currentPage - 1)}
                        disabled={currentPage === 1}
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                    </Button>
                    <span className="text-sm">
                        Page {currentPage} of {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => paginate(currentPage + 1)}
                        disabled={currentPage === totalPages || totalPages === 0}
                    >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default DriveTestSessionsPage;