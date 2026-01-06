// src/pages/ManageSession.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../api/apiEndpoints';
import { toast } from 'react-toastify';
import Spinner from '../components/common/Spinner';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Map } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ManageSessionsPage = () => {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

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

    const handleDelete = async (sessionId) => {
        if (window.confirm('Are you sure you want to delete this session? This will also remove all associated log data.')) {
            try {
                await adminApi.deleteSession(sessionId);
                toast.success('Session deleted successfully');
                fetchSessions();
            } catch (error) {
                toast.error(`Failed to delete session: ${error.message}`);
            }
        }
    };

    const handleViewOnMap = (sessionId) => {
        navigate(`/debug-map?sessionId=${sessionId}`);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString();
    };

    if (loading) {
        return <div className="flex items-center justify-center h-full"><Spinner /></div>;
    }

    return (
        <div className="p-6 h-full flex flex-col">
            <h1 className="text-2xl font-semibold mb-4">Manage Drive Test Sessions</h1>
            <div className="rounded-lg border shadow-sm flex-grow overflow-y-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Session Name</TableHead>
                            <TableHead>Created By</TableHead>
                            <TableHead>Start Time</TableHead>
                            <TableHead>End Time</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sessions.map((session) => (
                            <TableRow key={session.id}>
                                <TableCell className="font-medium">{session.session_name}</TableCell>
                                <TableCell>{session.CreatedBy || 'N/A'}</TableCell>
                                <TableCell>{formatDate(session.start_time)}</TableCell>
                                <TableCell>{formatDate(session.end_time)}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="outline" size="sm" onClick={() => handleViewOnMap(session.id)}>
                                        <Map className="h-4 w-4 mr-2" />
                                        View on Map
                                    </Button>
                                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 ml-2" onClick={() => handleDelete(session.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};

export default ManageSessionsPage;