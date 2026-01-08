import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../api/apiEndpoints';
import { toast } from 'react-toastify';
import DataTable from '../components/common/DataTable';
import Spinner from '../components/common/Spinner';
import UserFormDialog from '../components/users/UserFormDialog';
import { Button } from "@/components/ui/button";
import { MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from '@/components/ui/label';

const ManageUsersPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [filters, setFilters] = useState({ UserName: '', MobileNo: '', EmailId: '' });
    const [isFetchingDetails, setIsFetchingDetails] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [usersPerPage] = useState(10);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const apiFilters = {
                UserName: filters.UserName,
                Mobile: filters.MobileNo,
                Email: filters.EmailId,
            };
            const response = await adminApi.getUsers(apiFilters);
            const userData = response.Data?.map(item => item.ob_user) || [];
            setUsers(Array.isArray(userData) ? userData : []);
        } catch (error) {
            toast.error(error.message || 'Failed to fetch users.');
            setUsers([]);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleOpenDialog = async (user = null) => {
        if (user) {
            setIsDialogOpen(true);
            setIsFetchingDetails(true);
            try {
                const response = await adminApi.getUserById(user.id);
                const userData = response.Data?.ob_user || response.Data || response;
                setCurrentUser(userData);
            } catch (error) {
                toast.error("Failed to fetch latest user details.");
                setIsDialogOpen(false);
            } finally {
                setIsFetchingDetails(false);
            }
        } else {
            setCurrentUser(null);
            setIsDialogOpen(true);
        }
    };

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setCurrentUser(null);
    };

    const handleSaveUser = () => {
        fetchUsers();
        handleCloseDialog();
    };

    const handleDeleteUser = async (userOrId) => {
        const userId = typeof userOrId === 'object'
            ? (userOrId.id ?? userOrId.UserId ?? userOrId.user_id ?? userOrId.userId)
            : userOrId;

        if (!userId) {
            toast.error('Cannot determine user id for delete.');
            return;
        }

        if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await adminApi.deleteUser(userId);
            const ok =
                response?.Status === 1 ||
                response?.Status === '1' ||
                response?.status === 200 ||
                response?.status === '200' ||
                response?.Success === true ||
                response?.success === true ||
                response?.IsSuccess === true ||
                (typeof response?.Message === 'string' && /success/i.test(response.Message));

            if (ok) {
                const successMsg = response?.Message || 'User deleted successfully!';
                toast.success(successMsg);
                fetchUsers();
            } else {
                const msg = response?.Message || response?.message || 'Failed to delete user.';
                toast.error(msg);
            }
        } catch (error) {
            toast.error(error?.message || 'Failed to delete user.');
        }
    };

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleReset = () => {
        setFilters({ UserName: '', MobileNo: '', EmailId: '' });
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [users.length]);

    const indexOfLastUser = currentPage * usersPerPage;
    const indexOfFirstUser = indexOfLastUser - usersPerPage;
    const currentUsers = users.slice(indexOfFirstUser, indexOfLastUser);
    const totalPages = users.length > 0 ? Math.ceil(users.length / usersPerPage) : 1;

    const paginate = (pageNumber) => {
        if (pageNumber > 0 && pageNumber <= totalPages) {
            setCurrentPage(pageNumber);
        }
    };

    const getUserTypeLabel = (typeId) => {
        const userTypes = {
            0: 'Default',
            1: 'Admin',
            2: 'User',
            3: 'Manager',
        };
        return userTypes[typeId] !== undefined ? userTypes[typeId] : typeId || '-';
    };

    const getStatusBadge = (isActive) => {
        const statusConfig = {
            1: { label: 'Active', className: 'bg-green-100 text-green-700 border border-green-300' },
            2: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700 border border-yellow-300' },
            0: { label: 'Inactive', className: 'bg-red-100 text-red-700 border border-red-300' },
        };
        const config = statusConfig[isActive] || { label: 'Unknown', className: 'bg-gray-100 text-gray-700 border border-gray-300' };
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>
                {config.label}
            </span>
        );
    };

    const columns = [
        {
            header: 'S. No.',
            render: (row, index) => <span className="text-gray-700 font-medium">{indexOfFirstUser + index + 1}</span>
        },
        {
            header: 'User Name',
            accessor: 'name',
            render: (row) => <span className="text-gray-800 font-medium">{row.name || '-'}</span>
        },
        {
            header: 'User Type',
            accessor: 'm_user_type_id',
            render: (row) => <span className="text-gray-700">{getUserTypeLabel(row.m_user_type_id)}</span>
        },
        {
            header: 'Email ID',
            accessor: 'email',
            render: (row) => <span className="text-gray-700">{row.email || '-'}</span>
        },
        {
            header: 'Mobile No.',
            accessor: 'mobile',
            render: (row) => <span className="text-gray-700">{row.mobile || '-'}</span>
        },
        {
            header: 'Status',
            accessor: 'isactive',
            render: (row) => getStatusBadge(row.isactive)
        },
        {
            header: 'Action',
            render: (user) => (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0 text-gray-600 hover:text-gray-800 hover:bg-gray-100">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white border border-gray-200 shadow-lg">
                        <DropdownMenuLabel className="text-gray-800">Actions</DropdownMenuLabel>
                        <DropdownMenuItem 
                            onClick={() => handleOpenDialog(user)}
                            className="text-gray-700 hover:bg-gray-100 cursor-pointer"
                        >
                            Edit
                        </DropdownMenuItem>
                        {/* <DropdownMenuItem
                            onClick={() => handleDeleteUser(user)}
                            className="text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                            Delete
                        </DropdownMenuItem> */}
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ];

    if (loading && users.length === 0) return <Spinner />;

    return (
        <div className="space-y-6 bg-gray-50 min-h-screen p-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Manage Users</h1>
            </div>

            <Card className="bg-white border border-gray-200 shadow-sm">
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="space-y-1.5">
                            <Label htmlFor="UserName" className="text-gray-700 font-medium">User Name</Label>
                            <Input
                                id="UserName"
                                name="UserName"
                                placeholder="Search by name..."
                                value={filters.UserName}
                                onChange={handleFilterChange}
                                className="bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="MobileNo" className="text-gray-700 font-medium">Mobile No</Label>
                            <Input
                                id="MobileNo"
                                name="MobileNo"
                                placeholder="Search by mobile..."
                                value={filters.MobileNo}
                                onChange={handleFilterChange}
                                className="bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="EmailId" className="text-gray-700 font-medium">Email ID</Label>
                            <Input
                                id="EmailId"
                                name="EmailId"
                                placeholder="Search by email..."
                                value={filters.EmailId}
                                onChange={handleFilterChange}
                                className="bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button 
                                onClick={fetchUsers} 
                                disabled={loading}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                {loading ? 'Searching...' : 'Search'}
                            </Button>
                            <Button 
                                variant="outline" 
                                onClick={handleReset} 
                                disabled={loading}
                                className="border-gray-300 text-gray-700 hover:bg-gray-100"
                            >
                                Reset
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-white border border-gray-200 shadow-sm">
                <CardHeader className="border-b border-gray-200">
                    <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold text-gray-800">
                            Users List ({users.length} total)
                        </span>
                        <Button 
                            onClick={() => handleOpenDialog()}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            Add New User
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="h-64 flex items-center justify-center">
                            <Spinner />
                        </div>
                    ) : users.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-gray-500">
                            No users found. Try adjusting your filters or add a new user.
                        </div>
                    ) : (
                        <DataTable columns={columns} data={currentUsers} />
                    )}
                </CardContent>

                {users.length > 0 && (
                    <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
                        <div className="text-sm text-gray-600">
                            Showing {indexOfFirstUser + 1} to {Math.min(indexOfLastUser, users.length)} of {users.length} entries
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => paginate(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                            >
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Previous
                            </Button>
                            <span className="text-sm text-gray-700 px-3">
                                Page {currentPage} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => paginate(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                            >
                                Next
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            <UserFormDialog
                isOpen={isDialogOpen}
                onClose={handleCloseDialog}
                onSave={handleSaveUser}
                user={currentUser}
                isLoading={isFetchingDetails}
            />
        </div>
    );
};

export default ManageUsersPage;