import React, { useEffect, useState } from "react";
import { companyApi } from "../api/apiEndpoints";
import DataTable from "../components/common/DataTable";
import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";
import Spinner from "../components/common/Spinner";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";  
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "react-toastify";

const SuperAdminCompanies = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const handleInactiveUser = async (id) =>{
    try{
      const res = await companyApi.deleteCompany(id);
      if(res?.Status === 1 ){
        toast.success("status updated Successfully")
      }
    } catch(err){
      console.error("Error deleting company:", err);
      toast.error("Failed to delete company. Please try again.");
    }
  }

  const handleDeleteUser = async (id) => {
    try{
      const res = await companyApi.revokeLicense(id);
      if(res?.Status === 1 ){
        toast.success("License revoked Successfully")
      }
    }catch(err){
      console.error("Error revoking license:", err);
      toast.error("Failed to revoke license. Please try again.");
    }
  }

  const columns = [
    { header: "ID", accessor: "id" },
    { header: "Company Name", accessor: "company_name" },
    { header: "Contact Person", accessor: "contact_person" },
    { header: "Email", accessor: "email" },
    { header: "Mobile", accessor: "mobile" },
    { 
      header: "Status", 
      accessor: "status",
      render: (row) => (
        <Badge variant={row.status === 1 ? "success" : "destructive"}>
          {row.status === 1 ? "Active" : "Inactive"}
        </Badge>
      )
    },
    { 
      header: "Licenses", 
      render: (row) => (
        <span className="text-sm">
          {row.total_used_licenses} / {row.total_granted_licenses}
        </span>
      )
    },
    {
      header: "Created On",
      render: (row) => row.created_on ? new Date(row.created_on).toLocaleDateString() : "-"
    },
    {
            header: 'Action',
            render: (user) => (
                <DropdownMenu >
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
                        <DropdownMenuItem
                            onClick={() => handleInactiveUser(user.id)}
                            className="text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                            Inactive
                        </DropdownMenuItem>
                    
                    <DropdownMenuItem
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                            Delete
                        </DropdownMenuItem>
                        </DropdownMenuContent>
                    
                </DropdownMenu>
            ),
        },
  ];

  
  useEffect(() => {
    // Only fetch if user is actually a Super Admin
    if (user?.m_user_type_id === 3) {
      fetchCompanies();
    }
  }, [user]);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const response = await companyApi.getAll();
      
      if (response?.Status === 1) {
        setData(response.Data);
      } else {
        setError(response?.Message || "Failed to fetch data");
      }
    } catch (err) {
      console.error("Error fetching companies:", err);
      setError("API Error: Could not load companies.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return <Spinner />;
  
 
  if (!user || user.m_user_type_id !== 3) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">Company Management</h1>
        <Button onClick={() => navigate("/company-form")}> <Plus /> Add Company</Button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center h-64 items-center">
          <Spinner />
        </div>
      ) : (
        <DataTable columns={columns} data={data} />
      )}
    </div>
  );
};

export default SuperAdminCompanies;