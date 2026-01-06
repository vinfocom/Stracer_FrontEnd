// src/api/pythonApiService.js
import axios from 'axios';

const PYTHON_BASE_URL = import.meta.env.VITE_PYTHON_API_URL;

/**
 * Create axios instance for Python backend
 */
const pythonAxios = axios.create({
  baseURL: PYTHON_BASE_URL,
  timeout: 300000, // 5 minutes default
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request Interceptor
 */
pythonAxios.interceptors.request.use(
  (config) => {
    console.log(`🚀 Python API Request: ${config.method?.toUpperCase()} ${config.url}`);
    
    // Handle FormData
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    return config;
  },
  (error) => {
    console.error('❌ Python API Request Error:', error);
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor
 */
pythonAxios.interceptors.response.use(
  (response) => {
    console.log(`✅ Python API Response: ${response.config.url}`, response.data);
    return response;
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      console.error(`❌ Python API Error [${status}]:`, data);
      
      const errorMessage = 
        data?.error || 
        data?.message || 
        data?.Message || 
        error.message || 
        'Unknown error occurred';
      
      error.message = `Python API error! Status: ${status} - ${errorMessage}`;
    } else if (error.request) {
      console.error('❌ Python API No Response:', error.request);
      error.message = 'No response from Python backend. Server may be down.';
    } else {
      console.error('❌ Python API Request Setup Error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

/**
 * Python API Service - Fixed to properly handle config
 */
const pythonApiService = async (endpoint, options = {}) => {
  try {
    // Extract only valid axios config options
    const { method = 'GET', data, params, headers, timeout, ...rest } = options;
    
    const config = {
      url: endpoint,
      method,
      ...(data && { data }),
      ...(params && { params }),
      ...(headers && { headers }),
      ...(timeout && { timeout }),
    };
    
    const response = await pythonAxios(config);
    
    if (response.status === 204) {
      return null;
    }
    
    return response.data;
  } catch (error) {
    console.error(`Python API call to ${endpoint} failed:`, error.message);
    throw error;
  }
};

/**
 * Exported Python API methods
 */
export const pythonApi = {
  get: (endpoint, params = {}, options = {}) =>
    pythonApiService(endpoint, { 
      method: 'GET', 
      params,
      ...options 
    }),
  
  post: (endpoint, body, options = {}) =>
    pythonApiService(endpoint, { 
      method: 'POST', 
      data: body,
      ...options 
    }),
  
  put: (endpoint, body, options = {}) =>
    pythonApiService(endpoint, { 
      method: 'PUT', 
      data: body,
      ...options 
    }),
  
  delete: (endpoint, options = {}) =>
    pythonApiService(endpoint, { 
      method: 'DELETE',
      ...options 
    }),
};

export const PYTHON_BASE_URL_EXPORT = PYTHON_BASE_URL;
export const pythonAxiosInstance = pythonAxios;