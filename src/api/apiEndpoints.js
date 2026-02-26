// src/api/apiEndpoints.js
import { CleaningServices } from "@mui/icons-material";
import { api } from "./apiService"; // C# Backend
import { pythonApi } from "./pythonApiService"; // Python Backend
import axios from "axios";
import { isCancelledError } from './apiService'; // Import the utility

const isRequestCancelled = (error) => {
  if (!error) return false;
  return (
    error.isCancelled === true ||
    error.name === 'AbortError' ||
    error.name === 'CanceledError' ||
    error.code === 'ERR_CANCELED' ||
    error.message?.toLowerCase().includes('cancel') ||
    error.message?.toLowerCase().includes('abort')
  );
};

export const generalApi = {
  healthCheck: async () => {
    try {
      return await pythonApi.get("/health");
    } catch (error) {
      console.error("Python backend health check failed:", error);
      throw error;
    }
  },

  getInfo: async () => {
    try {
      return await pythonApi.get("/");
    } catch (error) {
      console.error("API Info Error:", error);
      throw error;
    }
  },
};

export const buildingApi = {
  generateBuildings: async (polygonData) => {
    try {
      return await pythonApi.post("/api/buildings/generate", polygonData);
    } catch (error) {
      console.error("Building API Error:", error);
      throw error;
    }
  },

  saveBuildingsWithProject: async (data) => {
    try {
      return await pythonApi.post("/api/buildings/save", data);
    } catch (error) {
      console.error("Save buildings error:", error);
      throw error;
    }
  },

  getProjectBuildings: async (projectId) => {
    try {
      return await pythonApi.get(`/api/buildings/project/${projectId}`);
    } catch (error) {
      console.error("Get project buildings error:", error);
      throw error;
    }
  },

  healthCheck: async () => {
    try {
      return await pythonApi.get("/api/buildings/health");
    } catch (error) {
      console.error("Building service health check failed:", error);
      throw error;
    }
  },
};

export const cellSiteApi = {
  /**
   * Verify project exists
   */

  checkSiteData: async (projectId) => {
    try {
      const response = await pythonApi.get(
        `/api/cell-site/site-noml/${projectId}`
      );

      const count = response?.count || response?.data?.length || 0;

      return {
        exists: count > 0,
        count: count,
        data: response,
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return { exists: false, count: 0 };
      }
      console.error(" Check site data error:", error);
      return { exists: false, count: 0, error: error.message };
    }
  },
  verifyProject: async (projectId) => {
    try {
      const response = await pythonApi.get(
        `/api/cell-site/verify-project/${projectId}`
      );
      return response;
    } catch (error) {
      console.error("Project verification failed:", error);
      throw error;
    }
  },

  /**
   * Upload site file with progress tracking
   */
  uploadSite: async (formData, onUploadProgress = null) => {
    try {



      const response = await pythonApi.post("/api/process-and-save", formData, {
        timeout: 300000, // 5 minutes
        onUploadProgress:
          onUploadProgress ||
          ((progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
          }),
      });

      return response;
    } catch (error) {
      console.error(" Cell Site upload error:", error);

      if (error.code === "ECONNABORTED") {
        throw new Error("Upload timed out. File may be too large.");
      }

      throw error;
    }
  },


  uploadSessions: async (payload) => {
    try {

      const response = await pythonApi.post(
        "/api/cell-site/process-session",
        payload,
        {
          timeout: 300000, // 5 minutes
        }
      );

      return response;
    } catch (error) {
      console.error(" Session upload error:", error);
      throw error;
    }
  },

  /**
   * Get site data by project with cancellation support
   */
  siteNoml: async (projectId, cancelToken = null) => {
    try {

      const config = {
        timeout: 30000, // 30 seconds
      };

      if (cancelToken) {
        config.cancelToken = cancelToken;
      }

      const response = await pythonApi.get(
        `/api/cell-site/site-noml/${projectId}`,
        config
      );


      return response;
    } catch (error) {
      // Handle cancellation
      if (axios.isCancel(error)) {
        return null;
      }

      console.error(" siteNoml error:", error);

      // Return empty data for 404
      if (error.response?.status === 404) {
        console.warn(` No site data found for project ${projectId}`);
        return {
          success: true,
          project_id: projectId,
          count: 0,
          data: [],
          message: "No site data found",
        };
      }

      throw error;
    }
  },

  /**
   * Update project ID
   */
  updateProjectId: async (filename, projectId) => {
    try {

      const response = await pythonApi.post(
        "/api/cell-site/update-project-id",
        {
          filename: filename,
          project_id: projectId,
        }
      );

      return response;
    } catch (error) {
      console.error(" Update project ID error:", error);
      throw error;
    }
  },

  /**
   * Get project cell sites
   */
  getProjectCellSites: async (projectId) => {
    try {
      const response = await pythonApi.get(
        `/api/cell-site/project/${projectId}`
      );
      return response;
    } catch (error) {
      console.error(" Get project cell sites error:", error);
      throw error;
    }
  },

  /**
   * Download file (opens in new tab)
   */
  downloadFile: (outputDir, filename) => {
    const baseUrl =
      import.meta.env.VITE_PYTHON_API_URL || "http://localhost:8080";
    const url = `${baseUrl}/api/cell-site/download/${outputDir}/${filename}`;
    window.open(url, "_blank");
  },

  /**
   * Download file as blob using axios
   */
  downloadFileBlob: async (outputDir, filename) => {
    try {

      const response = await pythonApi.get(
        `/api/cell-site/download/${outputDir}/${filename}`,
        {
          responseType: "blob", // Important for file downloads
        }
      );

      // Create download link
      const blob = new Blob([response]);
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);

      return blob;
    } catch (error) {
      console.error("Download error:", error);
      throw error;
    }
  },

  /**
   * List output files
   */
  listOutputs: async (outputDir) => {
    try {
      return await pythonApi.get(`/api/cell-site/outputs/${outputDir}`);
    } catch (error) {
      console.error("List outputs error:", error);
      throw error;
    }
  },

  /**
   * Health check
   */
  healthCheck: async () => {
    try {
      return await pythonApi.get("/api/cell-site/health");
    } catch (error) {
      console.error("Cell Site health check failed:", error);
      throw error;
    }
  },
};

export const areaBreakdownApi = {
  getAreaBreakdown: (params) => {
    const response = pythonApi.post("/api/area-breakup/process", params);
    return response;
  },

  getAreaPolygons: (projectId, config = {}) =>
    pythonApi.get(`/api/area-breakup/fetch/${projectId}`, config),
};

export const predictionApi = {
  runPrediction: async (params) => {
    try {


      if (!params.Project_id) {
        throw new Error("Project_id is required");
      }
      if (
        !params.Session_ids ||
        !Array.isArray(params.Session_ids) ||
        params.Session_ids.length === 0
      ) {
        throw new Error("Session_ids array is required and must not be empty");
      }

      const payload = {
        Project_id: params.Project_id,
        Session_ids: params.Session_ids,
        indoor_mode: params.indoor_mode || "heuristic",
        grid: params.grid || 10.0,
      };

      const response = await pythonApi.post("/api/prediction/run", payload, {
        timeout: 600000, // 10 minutes
      });

      return response;
    } catch (error) {
      console.error(" Prediction pipeline error:", error);

      if (error.code === "ECONNABORTED") {
        throw new Error("Prediction timed out. The dataset may be too large.");
      }

      if (error.response?.data?.detail) {
        throw new Error(`Prediction failed: ${error.response.data.detail}`);
      }

      throw error;
    }
  },


  debugDatabase: async (projectId) => {
    try {
      const response = await pythonApi.get(
        `/api/prediction/debug-db/${projectId}`
      );
      return response;
    } catch (error) {
      console.error(" Debug database error:", error);
      throw error;
    }
  },


  verifySiteData: async (projectId) => {
    try {
      const response = await pythonApi.get(
        `/api/prediction/debug-db/${projectId}`
      );

      const result = {
        hasData: (response?.site_noMl_count || 0) > 0,
        count: response?.site_noMl_count || 0,
        projectExists: response?.project_exists === "YES",
        tables: response?.all_tables || [],
        details: response,
      };

      return result;
    } catch (error) {
      console.error(" Verify site data error:", error);
      return {
        hasData: false,
        count: 0,
        projectExists: false,
        error: error.message,
      };
    }
  },


  waitForSiteData: async (projectId, maxRetries = 5, delayMs = 2000) => {


    for (let attempt = 1; attempt <= maxRetries; attempt++) {

      try {
        const result = await predictionApi.verifySiteData(projectId);

        if (result.hasData && result.count > 0) {

          return {
            success: true,
            count: result.count,
            attempts: attempt,
            details: result,
          };
        }

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.error(` Attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    console.error(" Site data not available after all retries");
    return {
      success: false,
      count: 0,
      attempts: maxRetries,
      error: "Site data not found after retries",
    };
  },

  /**
   * Health check for prediction service
   */
  healthCheck: async () => {
    try {
      return await pythonApi.get("/api/prediction/health");
    } catch (error) {
      console.error("Prediction service health check failed:", error);
      throw error;
    }
  },
};

export const reportApi = {
  generateReport: (payload) => pythonApi.post("/api/report/generate", payload),
  downloadReport: (reportId) =>
    pythonApi.get(`/api/report/download/${reportId}`, {
      responseType: 'blob',
    }),
};

export const authApi = {
  checkStatus: () => api.get("/api/auth/status"),
};

export const adminApi = {
  getReactDashboardData: () => api.get("/Admin/GetReactDashboardData"),
  getDashboardGraphData: () => api.get("/Admin/GetDashboardGraphData"),
  getIndoorCount: () => api.get("/Admin/IndoorCount"),
  getOutdoorCount: () => api.get("/Admin/OutdoorCount"),
  getAllUsers: (filters) => api.post("/Admin/GetAllUsers", filters),

  getAppValue: (startDate, endDate) =>
    api.get("/Admin/AppQualityFlatV2", {
      params: { from: startDate, to: endDate },
    }),

  getHoles: () => api.get("/Admin/holes"),
  getBoxData: (metric) => api.get(`/Admin/box-plot/operators?metric=${metric}`),
  getIndoorOutdoor: () => api.get("/Admin/operator-indoor-outdoor-avg"),

  getNetworkDurations: async (startDate, endDate) => {
    const formatDateLocal = (d) => {
      if (!d) return null;
      const dateObj = new Date(d);
      if (isNaN(dateObj)) return null;
      return dateObj.toISOString().split("T")[0];
    };

    const from = formatDateLocal(startDate);
    const to = formatDateLocal(endDate);

    if (!from || !to) throw new Error("Invalid date range");

    try {
      const response = await api.get("/Admin/GetNetworkDurations", {
        params: { fromDate: from, toDate: to },
      });
      return response;
    } catch (err) {
      console.error(" Network durations error:", err);
      throw err;
    }
  },

  getFilteredLocations: async (payload) => {
    try {
      const response = await api.get("/Admin/GetNetworkDurations", payload);
      return response.data;
    } catch (error) {
      console.error("Error fetching filtered locations:", error);
      throw error;
    }
  },

  getUsers: (params) => api.get("/Admin/GetUsers", { params }),
  getOnlineUsers: () => api.get("/Admin/GetOnlineUsers"),

  getOperatorCoverageRanking: ({ min, max }) =>
    api.get("/Admin/GetOperatorCoverageRanking", { params: { min, max } }),

  getOperatorQualityRanking: ({ min, max }) =>
    api.get("/Admin/GetOperatorQualityRanking", { params: { min, max } }),

  getUserById: (userId) => {
    const formData = new FormData();
    formData.append("UserID", userId);
    formData.append("token", "");
    return api.post("/Admin/GetUser", formData);
  },

  getTotalsV2: () => api.get("/Admin/TotalsV2"),
  getMonthlySamplesV2: (params) =>
    api.get("/Admin/MonthlySamplesV2", { params }),
  getOperatorSamplesV2: (params) =>
    api.get("/Admin/OperatorSamplesV2", { params }),
  getNetworkTypeDistributionV2: (params) =>
    api.get("/Admin/NetworkTypeDistributionV2", { params }),
  getAvgRsrpV2: (params) => api.get("/Admin/AvgRsrpV2", { params }),
  getAvgRsrqV2: (params) => api.get("/Admin/AvgRsrqV2", { params }),
  getAvgSinrV2: (params) => api.get("/Admin/AvgSinrV2", { params }),
  getAvgMosV2: (params) => api.get("/Admin/AvgMosV2", { params }),
  getAvgJitterV2: (params) => api.get("/Admin/AvgJitterV2", { params }),
  getAvgLatencyV2: (params) => api.get("/Admin/AvgLatencyV2", { params }),
  getAvgPacketLossV2: (params) => api.get("/Admin/AvgPacketLossV2", { params }),
  getAvgDlTptV2: (params) => api.get("/Admin/AvgDlTptV2", { params }),
  getAvgUlTptV2: (params) => api.get("/Admin/AvgUlTptV2", { params }),
  getBandDistributionV2: (params) =>
    api.get("/Admin/BandDistributionV2", { params }),
  getHandsetDistributionV2: (params) =>
    api.get("/Admin/HandsetDistributionV2", { params }),

  getOperatorsV2: () => api.get("/Admin/OperatorsV2"),
  getNetworksV2: () => api.get("/Admin/NetworksV2"),

  saveUserDetails: (data) => api.post("/Admin/SaveUserDetails", data),
  deleteUser: (id) => api.post(`/Admin/DeleteUser`, { id }),
  activateUser: (id) => api.post(`/Admin/ActivateUser`, { id }),
  userResetPassword: (data) => api.post("/Admin/UserResetPassword", data),
  changePassword: (data) => api.post("/Admin/ChangePassword", data),
  getSessions: () => api.get("/Admin/GetSessions"),
  getAllNetworkLogs: (params) =>
    api.get("/Admin/GetAllNetworkLogs", { params }),
  deleteSession: (sessionId) =>
    api.delete(`/Admin/DeleteSession?id=${parseInt(sessionId, 10)}`),
  getSessionsByFilter: (filters) =>
    api.get("/Admin/GetSessionsByDateRange", { params: filters }),
};

export const mapViewApi = {
  addSitePrediction: (payload) => api.post("/api/Mapview/AddSitePrediction", payload),
  getLtePfrection: (params) => api.get("/api/MapView/GetLtePredictionLocationStats", { params }),

  signup: (user) => api.post("/api/MapView/user_signup", user),
  startSession: (data) => api.post("/api/MapView/start_session", data),
  endSession: (data) => api.post("/api/MapView/end_session", data),
  getDuration: ({ sessionIds }) => api.get(`/api/MapView/session/provider-network-time/combined`, { params: { sessionIds } }),
  getIOAnalysis: (params) =>
    api.get(`/api/MapView/GetIndoorOutdoorSessionAnalytics`, { params }),

  // ==================== Polygon Management ====================
  getProjectPolygons: (projectId) =>
    api.get("/api/MapView/GetProjectPolygons", {
      params: { projectId },
    }),


  getProjectPolygonsV2: (projectId, source = "map") =>
    api.get("/api/MapView/GetProjectPolygonsV2", {
      params: { projectId, source },
    }),

  savePolygon: (payload) => api.post("/api/MapView/SavePolygon", payload),

  savePolygonWithLogs: (payload) =>
    api.post("/api/MapView/SavePolygonWithLogs", payload),

  getAvailablePolygons: (projectId) => {
    const params =
      projectId !== undefined && projectId !== null ? { projectId } : {};
    return api.get("/api/MapView/GetAvailablePolygons", { params });
  },

  getPolygonLogCount: (polygonId, from, to) =>
    api.get("/api/MapView/GetPolygonLogCount", {
      params: { polygonId, from, to },
    }),

  listSavedPolygons: (projectId, limit = 200, offset = 0) =>
    api.get("/api/MapView/ListSavedPolygons", {
      params: { projectId, limit, offset },
    }),

  assignPolygonToProject: (polygonId, projectId) =>
    api.post("/api/MapView/AssignPolygonToProject", null, {
      params: { polygonId, projectId },
    }),

  // src/api/apiEndpoints.js
  getPciDistribution: async (sessionIds) => {
    try {
      const response = await api.get(`/api/MapView/GetPciDistribution`, {
        params: { session_ids: sessionIds.join(',') }
      });
      // REMOVE .data here because api.get already returns the JSON body
      return response;
    } catch (error) {
      console.error("Error fetching PCI distribution:", error);
      return null;
    }
  },

  // ==================== Project Management ====================
  getProjects: () => api.get("/api/MapView/GetProjects"),

  /**
   * Create project with polygons and sessions
   */
  createProjectWithPolygons: async (payload) => {
    try {
      const response = await api.post(
        "/api/MapView/CreateProjectWithPolygons",
        payload
      );

      return response;
    } catch (error) {
      console.error(" Project creation error:", error);

      // Enhanced error handling
      if (error.response?.data) {
        const data = error.response.data;

        if (data.InnerException) {
          throw new Error(`Database Error: ${data.InnerException}`);
        } else if (data.Message) {
          throw new Error(data.Message);
        } else if (data.errors) {
          const validationErrors = Object.entries(data.errors)
            .map(
              ([field, messages]) =>
                `${field}: ${Array.isArray(messages) ? messages.join(", ") : messages
                }`
            )
            .join("; ");
          throw new Error(`Validation Error: ${validationErrors}`);
        }
      }

      throw error;
    }
  },

  createProject: async (payload) => {
    try {
      const response = await api.post("/api/MapView/createProject", payload);
      return response;
    } catch (error) {
      console.error(" Project creation error:", error);
      throw error;
    }
  },

  deleteProject: async (projectId) => {
    try {
      const response = await api.delete("/api/MapView/DeleteProject", {
        params: { projectId },
      });
      return response;
    } catch (error) {
      console.error(" Project deletion error:", error);
      throw error;
    }
  },

  // ==================== Network Logs ====================
  // In apiEndpoints.js
  getNetworkLog: async ({ session_ids, page = 1, limit = 10000, signal }) => {
    const sid = Array.isArray(session_ids) ? session_ids.join(",") : session_ids;


    const response = await api.get("/api/MapView/GetNetworkLog", {
      params: {
        session_Ids: sid,
        page: page,
        limit: limit,
      },
      signal: signal,
    });



    return response;
  },

  // apiEndpoints.js

  // apiEndpoints.js
  getSessionNeighbour: async ({ sessionIds, signal }) => {
    try {
      const idsParam = Array.isArray(sessionIds) ? sessionIds.join(",") : sessionIds;


      const response = await api.get(
        '/api/MapView/GetN78Neighbours',
        {
          params: {
            session_Ids: idsParam
          },
          signal,
          dedupe: false
        }
      );


      if (response?.data) {
        return response.data;
      }

      if (response?.Status !== undefined) {
        return response;
      }

      console.warn(" Unexpected response structure:", response);
      return response;

    } catch (error) {
      // ✅ Don't log cancelled requests as errors
      if (isCancelledError(error) || isRequestCancelled(error)) {
        // Silently re-throw - the calling hook will handle this
        throw error;
      }

      console.error(" N78 API Error:", error);
      throw error;
    }
  },

  getDominanceDetails: (sessionIds) => {
    const ids = Array.isArray(sessionIds) ? sessionIds.join(',') : sessionIds;
    return api.get(`/api/MapView/GetDominanceDetails`, {
      params: { session_ids: ids }
    });
  },


  getDistanceSession: (session) =>
    api.get("/api/MapView/sessionsDistance", {
      params: session
    }),

  getLogsByDateRange: (filters) =>
    api.get("/api/MapView/GetLogsByDateRange", { withCredentials: true, params: filters }),

  logNetwork: (data) => api.post("/api/MapView/log_networkAsync", data),

  getLogsByneighbour: (params) => {
    return api.get("/api/MapView/GetNeighbourLogsByDateRange", {
      params: params
    });
  },
  getproviderVolume: (params) =>
    api.get("/api/MapView/GetProviderWiseVolume", { params }),
  // ==================== Filter Options ====================
  getProviders: () => api.get("/api/MapView/GetProviders"),
  getTechnologies: () => api.get("/api/MapView/GetTechnologies"),
  getBands: () => api.get("/api/MapView/GetBands"),

  // ==================== Prediction Data ====================
  getPredictionLog: (params) =>
    api.get("/api/MapView/GetPredictionLog", { params }),

  getPredictionLogPost: (payload) =>
    api.post("/api/MapView/GetPredictionLog", payload),

  getPredictionDataForBuildings: (projectId, metric) =>
    api.get("/api/MapView/GetPredictionDataForSelectedBuildingPolygonsRaw", {
      params: { projectId, metric },
    }),

  // ==================== Site Prediction ====================
  uploadSitePredictionCsv: (formData) =>
    api.post("/api/MapView/UploadSitePredictionCsv", formData),

  getSitePrediction: (params) =>
    api.get("/api/MapView/GetSitePrediction", { params }),

  assignSitePredictionToProject: (projectId, siteIds) => {
    const params = new URLSearchParams();
    params.append("projectId", projectId);
    siteIds.forEach((id) => params.append("siteIds", id));
    return api.post(
      `/api/MapView/AssignExistingSitePredictionToProject?${params.toString()}`
    );
  },

  // ==================== ML Site Data ====================
  getSiteNoMl: (params) => api.get("/api/MapView/GetSiteNoMl", { params }),
  getSiteMl: (params) => api.get("/api/MapView/GetSiteMl", { params }),

  // ==================== Image Upload ====================
  uploadImage: (formData) => api.post("/api/MapView/UploadImage", formData),
  uploadImageLegacy: (formData) =>
    api.post("/api/MapView/UploadImageLegacy", formData),
};

export const homeApi = {
  login: (credentials) => api.post("/Home/UserLogin", credentials),
  getStateInfo: () => api.post("/Home/GetStateIformation"),
  forgotPassword: (data) => api.post("/Home/GetUserForgotPassword", data),
  resetPassword: (data) => api.post("/Home/ForgotResetPassword", data),
  logout: (ip) => api.get("/Home/Logout", { params: { IP: ip || "" } }),
  getLoggedUser: (ip) => api.post("/Home/GetLoggedUser", { ip }),
  getMasterUserTypes: () => api.get("/Home/GetMasterUserTypes"),

  // ✅ ADD THIS METHOD
  getAuthStatus: () => api.get("/api/auth/status"),
};

export const settingApi = {
  checkSession: async () => {
    try {
      const response = await api.get("/api/Setting/CheckSession");
      return response;
    } catch (error) {
      console.error("CheckSession error:", error);
      throw error;
    }
  },

  getThresholdSettings: async () => {
    try {
      const response = await api.get("/api/Setting/GetThresholdSettings");
      return response;
    } catch (error) {
      console.error("GetThresholdSettings error:", error);
      throw error;
    }
  },

  saveThreshold: async (payload) => {
    try {

      const response = await api.post("/api/Setting/SaveThreshold", payload);
      return response;
    } catch (error) {
      console.error("SaveThreshold error:", error);
      throw error;
    }
  },
};

export const excelApi = {
  uploadFile: (formData, onUploadProgress = null) =>
    api.post("/ExcelUpload/UploadExcelFile", formData, {
      onUploadProgress:
        onUploadProgress ||
        ((progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
        }),
    }),

  downloadTemplate: (fileType) => {
    const url = `https://api.stracer.vinfocom.co.in/ExcelUpload/DownloadExcel?fileType=${fileType}`;
    window.open(url, "_blank");
    return Promise.resolve({ success: true });
  },

  getUploadedFiles: (type) =>
    api.get("/ExcelUpload/GetUploadedExcelFiles", {
      params: { FileType: type },
    }),

  getSessions: (fromDate, toDate) =>
    api.get("/ExcelUpload/GetSessions", {
      params: {
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
      },
    }),
};


export const checkAllServices = async () => {
  try {
    const [pythonHealth, csharpHealth] = await Promise.allSettled([
      generalApi.healthCheck(),
      authApi.checkStatus(),
    ]);

    return {
      python: {
        healthy: pythonHealth.status === "fulfilled",
        data: pythonHealth.value,
        error: pythonHealth.reason?.message,
      },
      csharp: {
        healthy: csharpHealth.status === "fulfilled",
        data: csharpHealth.value,
        error: csharpHealth.reason?.message,
      },
    };
  } catch (error) {
    console.error("Service check failed:", error);
    return {
      python: { healthy: false, error: error.message },
      csharp: { healthy: false, error: error.message },
    };
  }
};


export const validateProjectExists = async (projectId) => {
  try {
    if (!projectId) return false;

    const pythonCheck = await cellSiteApi.verifyProject(projectId);
    return pythonCheck.exists === true;
  } catch (error) {
    console.error("Project validation error:", error);
    return false;
  }
};

export const companyApi = {
  getAll: (id) => api.get("/api/company/GetAll", { params: { id } }),

  createCompany: (data) => api.post("/api/company/SaveCompanyDetails", data),

  deleteCompany: (id) => api.delete("/api/company/deleteCompany", { params: { id } }),

  revokeLicense: (id) => api.post(`/api/company/revokeLicense`, null, { params: { licenseId: id } }),

  licensesDetails: (params) => api.get("/api/company/usedLicenses",
    { params, withCredentials: true }
  ),
};

export default {
  generalApi,
  buildingApi,
  cellSiteApi,

  authApi,
  adminApi,
  mapViewApi,
  homeApi,
  settingApi,
  excelApi,

  checkAllServices,
  validateProjectExists,
  companyApi,
};