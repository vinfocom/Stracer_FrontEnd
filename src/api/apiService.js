// src/api/apiService.js
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_CSHARP_API_URL;


let authErrorHandler = null;
let isRedirecting = false;

export const setAuthErrorHandler = (handler) => {
  authErrorHandler = handler;
};


class RequestQueue {
  constructor(maxConcurrent = 4) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  async add(fn, priority = 0) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, priority });
      this.queue.sort((a, b) => b.priority - a.priority); // Higher priority first
      this.process();
    });
  }

  async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;

    const { fn, resolve, reject } = this.queue.shift();
    this.running++;

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }

  clear() {
    this.queue = [];
  }
}

const requestQueue = new RequestQueue(4); // Max 4 concurrent requests

// ============================================
// REQUEST CACHE - Prevents duplicate in-flight requests
// ============================================
const inFlightRequests = new Map();

const dedupeRequest = async (key, fn) => {
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  const promise = fn().finally(() => {
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, promise);
  return promise;
};

// ============================================
// AXIOS INSTANCE
// ============================================
const csharpAxios = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Reduced from 60s to 30s
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
  },
});

// ============================================
// REQUEST INTERCEPTOR
// ============================================
csharpAxios.interceptors.request.use(
  (config) => {
    // Add request timestamp for performance tracking
    config.metadata = { startTime: Date.now() };
    
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// ============================================
// RESPONSE INTERCEPTOR
// ============================================
csharpAxios.interceptors.response.use(
  (response) => {
    // Track response time
    const duration = Date.now() - (response.config.metadata?.startTime || Date.now());
    if (duration > 5000) {
      console.warn(`Slow API: ${response.config.url} took ${duration}ms`);
    }
    return response;
  },
  (error) => {
    if (axios.isCancel(error)) {
      return Promise.reject(createError('Request cancelled', { isCancelled: true }));
    }

    if (!error.response) {
      return Promise.reject(
        createError(
          error.request 
            ? 'No response from server. Please check your connection.' 
            : error.message,
          { isNetworkError: true }
        )
      );
    }

    const { status, data, config } = error.response;

    if (status === 401 || status === 403) {
      handleAuthError(config);
      return Promise.reject(
        createError('Session expired. Please login again.', { 
          isAuthError: true, 
          status 
        })
      );
    }

    return Promise.reject(
      createError(`HTTP ${status}: ${extractErrorMessage(data)}`, { 
        status, 
        data 
      })
    );
  }
);

// ============================================
// HELPER FUNCTIONS
// ============================================
const createError = (message, props = {}) => {
  const error = new Error(message);
  Object.assign(error, props);
  return error;
};

const extractErrorMessage = (data) => {
  if (!data) return 'Unknown error';
  if (typeof data === 'string') return data;
  return data.message || data.Message || data.error || data.detail || data.title || 'Request failed';
};

const handleAuthError = (config) => {
  sessionStorage.removeItem('user');
  
  const isAuthEndpoint = config?.url?.includes('/auth/');
  if (isRedirecting || isAuthEndpoint) return;
  
  isRedirecting = true;
  
  if (authErrorHandler) {
    try {
      authErrorHandler();
    } catch {
      redirectToLogin();
    }
  } else {
    redirectToLogin();
  }
  
  setTimeout(() => { isRedirecting = false; }, 1000);
};

const redirectToLogin = () => {
  const currentPath = window.location.pathname;
  if (currentPath !== '/login') {
    sessionStorage.setItem('redirectAfterLogin', currentPath);
    window.location.href = '/login';
  }
};

// ============================================
// API SERVICE WITH QUEUE
// ============================================
const apiService = async (endpoint, options = {}) => {
  const { priority = 0, dedupe = true, ...axiosOptions } = options;
  
  const makeRequest = async () => {
    const response = await csharpAxios({ url: endpoint, ...axiosOptions });
    return response.status === 204 ? null : response.data;
  };

  // Use queue for non-priority requests
  if (priority === 0) {
    const cacheKey = `${axiosOptions.method || 'GET'}:${endpoint}`;
    
    if (dedupe) {
      return dedupeRequest(cacheKey, () => requestQueue.add(makeRequest, priority));
    }
    
    return requestQueue.add(makeRequest, priority);
  }

  // High priority requests bypass the queue
  return makeRequest();
};

// ============================================
// EXPORTED API METHODS
// ============================================
export const api = {
  get: (endpoint, options = {}) =>
    apiService(endpoint, { ...options, method: 'GET' }),

  post: (endpoint, body, options = {}) =>
    apiService(endpoint, { ...options, method: 'POST', data: body }),

  put: (endpoint, body, options = {}) =>
    apiService(endpoint, { ...options, method: 'PUT', data: body }),

  patch: (endpoint, body, options = {}) =>
    apiService(endpoint, { ...options, method: 'PATCH', data: body }),

  delete: (endpoint, options = {}) =>
    apiService(endpoint, { ...options, method: 'DELETE' }),

  upload: (endpoint, formData, options = {}) =>
    apiService(endpoint, { 
      ...options, 
      method: 'POST', 
      data: formData,
      timeout: 120000,
      priority: 1 // High priority
    }),

  // Priority request - bypasses queue
  getPriority: (endpoint, options = {}) =>
    apiService(endpoint, { ...options, method: 'GET', priority: 10 }),
};

// ============================================
// UTILITY EXPORTS
// ============================================
export const CSHARP_BASE_URL = API_BASE_URL;
export const csharpAxiosInstance = csharpAxios;

export const isAuthError = (error) => error?.isAuthError === true;
export const isNetworkError = (error) => error?.isNetworkError === true;
export const isCancelledError = (error) => error?.isCancelled === true;

export const cancelAllRequests = () => {
  requestQueue.clear();
  inFlightRequests.clear();
};

export default api;