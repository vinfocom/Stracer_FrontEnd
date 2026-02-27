import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { companyApi } from '../api/apiEndpoints';
import { toast } from 'react-toastify';
import DataTable from '../components/common/DataTable';
import Spinner from '../components/common/Spinner';
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const CompanyLicensesPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const companyIdQuery = searchParams.get('companyId');
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const apiFilters = {
                ...(companyIdQuery ? { companyId: companyIdQuery } : {})
            };
            const response = await companyApi.licensesDetails(apiFilters);
            const userData = response.Data || [];
            setUsers(Array.isArray(userData) ? userData : []);
        } catch (error) {
            toast.error(error.message || 'Failed to fetch users.');
            setUsers([]);
        } finally {
            setLoading(false);
        }
    }, [companyIdQuery]);

    useEffect(() => {
        if (companyIdQuery) {
            fetchUsers();
        } else {
            setLoading(false);
            toast.error("No Company ID provided.");
        }
    }, [fetchUsers, companyIdQuery]);

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
            0: { label: 'Inactive', className: 'bg-yellow-100 text-yellow-700 border border-yellow-300' },
            2: { label: 'Deleted', className: 'bg-red-100 text-red-700 border border-red-300' },
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
            render: (row, index) => <span className="text-gray-700 font-medium">{index + 1}</span>
        },
        {
            header: 'License Id',
            accessor: 'license_id',
            render: (row) => <span className="text-gray-700">{getUserTypeLabel(row.license_id)}</span>
        },
        {
            header: 'User Name',
            accessor: 'name',
            render: (row) => <span className="text-gray-800 font-medium">{row.user_name || '-'}</span>
        },
        {
            header: 'Email ID',
            accessor: 'email',
            render: (row) => <span className="text-gray-700">{row.user_email || '-'}</span>
        },
        {
            header: 'Mobile No.',
            accessor: 'user_mobile',
            render: (row) => <span className="text-gray-700">{row.user_mobile || '-'}</span>
        },{
            header: 'Company',
            accessor: 'company_name',
            render: (row) => <span className="text-gray-700">{row.company_name || '-'}</span>
        },{
            header: 'Created On',
            accessor: 'created_on',
            render: (row) => row.created_on ? new Date(row.created_on).toLocaleDateString() : '-'
        },
        {
            header: 'Licenses Code',
            accessor: 'licenses_code',
            render: (row) => <span className="text-gray-700">{row.license_code || '-'}</span>
        },
        {
            header: 'Status',
            accessor: 'user_isactive',
            render: (row) => getStatusBadge(row.user_isactive)
        }
    ];

    if (loading && users.length === 0) return <Spinner />;

    return (
        <div className="space-y-6 bg-gray-50 min-h-screen p-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => navigate('/companies')}
                        className="h-10 w-10 bg-white border-gray-300 hover:bg-gray-100 text-gray-700"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-3xl font-bold text-gray-800">Company Licenses</h1>
                </div>
            </div>

            <Card className="bg-white border border-gray-200 shadow-sm">
                <CardContent className="pt-6">
                    {loading ? (
                        <div className="flex justify-center p-8"><Spinner /></div>
                    ) : (
                        <DataTable
                            data={users}
                            columns={columns}
                            emptyMessage="No licenses found for this company."
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default CompanyLicensesPage;
