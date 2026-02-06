import React, { useState } from "react";
import { companyApi } from "../api/apiEndpoints";

const CompanyForm = () => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    company_name: "",
    contact_person: "",
    mobile: "",
    email: "",
    password: "",
    address: "",
    pincode: "",
    gst_id: "",
    license_validity_in_months: "",
    total_granted_licenses: "",
    otp_phone_number: "",
    ask_for_otp: false,
    blacklisted_phone_number: "",
    remarks: "",
    status: true,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // 1. STRICT PAYLOAD MAPPING (Matches CreateCompanyRequest DTO)
    const payload = {
      // Strings
      company_name: formData.company_name,
      contact_person: formData.contact_person,
      mobile: formData.mobile,
      email: formData.email,
      password: formData.password,
      address: formData.address || "",
      pincode: formData.pincode || "",
      gst_id: formData.gst_id || "",
      company_code: "", // DTO has this field, sending empty string is safe (Controller generates it)
      
      // Phone Numbers (Strings in DTO)
      otp_phone_number: formData.otp_phone_number || "",
      blacklisted_phone_number: formData.blacklisted_phone_number || "",
      remarks: formData.remarks || "",

      // Integers (Must be numbers)
      license_validity_in_months: formData.license_validity_in_months ? parseInt(formData.license_validity_in_months, 10) : 0,
      total_granted_licenses: formData.total_granted_licenses ? parseInt(formData.total_granted_licenses, 10) : 0,
      total_used_licenses: 0, 

      // Booleans (DTO defines these as bool, not int)
      ask_for_otp: Boolean(formData.ask_for_otp),
      status: Boolean(formData.status),
    };

    console.log("📤 Sending Payload:", JSON.stringify(payload, null, 2));

    try {
      const data = await companyApi.createCompany(payload);

      // Success Check
      if (data && data.Status === 1) {
        alert(`Success! Company Created.\nCode: ${data.CompanyCode}`);
        setFormData({
            company_name: "", contact_person: "", mobile: "", email: "", password: "",
            address: "", pincode: "", gst_id: "", license_validity_in_months: "",
            total_granted_licenses: "", otp_phone_number: "", ask_for_otp: false,
            blacklisted_phone_number: "", remarks: "", status: true,
        });
      } else {
        alert(data?.Message || "Failed to create company (Unknown Status).");
      }
    } catch (error) {
      console.error(" API Error Object:", error);

      // 2. CRITICAL DEBUGGING FOR 400 ERRORS
      if (error.response && error.response.data) {
        console.log(" Server Response Data:", error.response.data);

        // Case A: Validation Errors (Standard ASP.NET 400)
        if (error.response.data.errors) {
          const errors = error.response.data.errors;
          let errorMsg = "Validation Failed:\n";
          Object.keys(errors).forEach((field) => {
            errorMsg += `• ${field}: ${errors[field].join(", ")}\n`;
          });
          alert(errorMsg);
        }
        // Case B: Custom Error Message (e.g. "Email already exists")
        else if (error.response.data.Message) {
          alert(`Error: ${error.response.data.Message}`);
        }
        // Case C: Fallback
        else {
          alert("Bad Request: Please check the console for details.");
        }
      } else {
        alert("Network Error: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Styles
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";
  const inputClass = "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all";
  const checkboxContainerClass = "flex items-center space-x-3 bg-gray-50 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100 transition";

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center scrollbar-hide ">
      <div className="bg-white w-full  overflow-hidden">
        <div className="px-8 py-4 ">
          <h2 className="text-2xl font-bold text-black">Company Registration</h2>
          <p className="text-black text-sm mt-1">Enter company details.</p>
        </div>

        <form onSubmit={handleSubmit} className="py-2 px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="md:col-span-2">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Basic Information</h3>
            </div>

            {/* Required Fields */}
            <div>
              <label className={labelClass}>Company Name <span className="text-red-500">*</span></label>
              <input name="company_name" placeholder="e.g. Acme Industries" value={formData.company_name} onChange={handleChange} required className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Contact Person <span className="text-red-500">*</span></label>
              <input name="contact_person" placeholder="Full Name" value={formData.contact_person} onChange={handleChange} required className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Mobile Number <span className="text-red-500">*</span></label>
              <input name="mobile" placeholder="10-digit Mobile" value={formData.mobile} onChange={handleChange} required className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Email Address <span className="text-red-500">*</span></label>
              <input name="email" type="email" placeholder="admin@company.com" value={formData.email} onChange={handleChange} required className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Password <span className="text-red-500">*</span></label>
              <input name="password" type="password" placeholder="••••••••" value={formData.password} onChange={handleChange} required className={inputClass} />
            </div>

            {/* Optional Fields */}
            <div>
              <label className={labelClass}>GST ID</label>
              <input name="gst_id" placeholder="GSTIN Number" value={formData.gst_id} onChange={handleChange} className={inputClass} />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Address</label>
              <textarea name="address" placeholder="Street Address, City, State" rows="2" value={formData.address} onChange={handleChange} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Pincode</label>
              <input name="pincode" placeholder="e.g. 110001" value={formData.pincode} onChange={handleChange} className={inputClass} />
            </div>

            {/* License Details */}
            <div className="md:col-span-2 mt-4">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">License Details</h3>
            </div>

            <div>
              <label className={labelClass}>Validity (Months)</label>
              <input type="number" name="license_validity_in_months" placeholder="e.g. 12" value={formData.license_validity_in_months} onChange={handleChange} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Total Granted Licenses</label>
              <input type="number" name="total_granted_licenses" placeholder="e.g. 50" value={formData.total_granted_licenses} onChange={handleChange} className={inputClass} />
            </div>

            {/* Security & Settings */}
            <div className="md:col-span-2 mt-4">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Security & Settings</h3>
            </div>

            <div>
              <label className={labelClass}>OTP Phone Number</label>
              <input name="otp_phone_number" placeholder="Phone for OTP" value={formData.otp_phone_number} onChange={handleChange} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Blacklisted Phone</label>
              <input name="blacklisted_phone_number" placeholder="Blocked Number" value={formData.blacklisted_phone_number} onChange={handleChange} className={inputClass} />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Remarks</label>
              <textarea name="remarks" placeholder="Any additional notes..." rows="2" value={formData.remarks} onChange={handleChange} className={inputClass} />
            </div>

            {/* Checkboxes */}
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className={checkboxContainerClass}>
                <input type="checkbox" name="ask_for_otp" checked={formData.ask_for_otp} onChange={handleChange} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300" />
                <span className="text-sm font-medium text-gray-700">Ask for OTP on Login</span>
              </label>

              <label className={checkboxContainerClass}>
                <input type="checkbox" name="status" checked={formData.status} onChange={handleChange} className="w-5 h-5 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                <span className="text-sm font-medium text-gray-700">Active Account Status</span>
              </label>
            </div>
          </div>

          <div className="mt-8">
            <button
              type="submit"
              disabled={loading}
              className={`w-full text-white font-bold py-3 px-4 rounded-lg shadow-md transition duration-300 transform hover:-translate-y-0.5 
                ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 hover:shadow-lg"}`}
            >
              {loading ? "Registering..." : "Register Company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CompanyForm;