// src/hooks/useFileUpload.js

import { useState } from 'react';
import { toast } from 'react-toastify';
// FIX: Changed import to use the correct API endpoint definition
import { excelApi } from '../api/apiEndpoints';

export const useFileUpload = () => {
  const [loading, setLoading] = useState(false);
  const [errorLog, setErrorLog] = useState("");

  const uploadFile = async (formData) => {
    setLoading(true);
    setErrorLog("");
    try {
      // FIX: Changed uploadApi.uploadFile to excelApi.uploadFile
      const resp = await excelApi.uploadFile(formData);
      if (resp.Status === 1) {
        return { success: true };
      } else {
        setErrorLog(resp.Message || "Processing failed.");
        toast.error("Upload failed. See error log.");
        return { success: false };
      }
    } catch (e) {
      const errorMessage = e.message || "An unknown error occurred during the request.";
      setErrorLog(errorMessage);
      toast.error("Upload request failed.");
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  return { loading, errorLog, uploadFile, setErrorLog };
};