// App.jsx
import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
} from "react-router-dom";
import { SWRConfig } from "swr";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import AuthProvider, { useAuth } from "./context/AuthContext";
import { indexedDBProvider } from "./utils/indexedDBProvider";
import Spinner from "./components/common/Spinner";
import { MapProvider } from './context/MapContext';

import LoginPage from "./pages/Login";
import DashboardPage from "./pages/Dashboard";
import SimpleMapView from "./pages/MapView";
import ManageUsersPage from "./pages/ManageUser";
import DriveTestSessionsPage from "./pages/DriveTestSessions";
import AppLayout from "./components/layout/AppLayout";
import UploadDataPage from "./pages/UploadData";
import SettingsPage from "./pages/Setting";
import UnifiedMapView from "./pages/UnifiedMapView";
import HighPerfMap from "@/pages/HighPerfMap";
import LogsCirclesPage from "@/pages/LogsCirclesPage";
import ProjectsPage from "./pages/Projects";
import PredictionMapPage from "./pages/PredictionMap";
import GetReportPage from "./pages/GetReport";
import ViewProjectsPage from "./pages/ViewProjects";
import SessionMapDebug from "./pages/SessionMapDebug";

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <Spinner />;
  }

  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  return <AppLayout>{children}</AppLayout>;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <Spinner />;
  }

  return isAuthenticated() ? <Navigate to="/dashboard" replace /> : children;
};

const NotFoundPage = () => (
  <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-gray-50 to-gray-100">
    <div className="text-center p-8 bg-white rounded-xl shadow-lg">
      <h1 className="text-6xl font-bold text-gray-800 mb-4">404</h1>
      <h2 className="text-2xl font-semibold text-gray-700 mb-2">
        Page Not Found
      </h2>
      <p className="text-gray-600 mb-6">
        The page you are looking for does not exist.
      </p>
      <Link
        to="/dashboard"
        className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >
        Go to Dashboard
      </Link>
    </div>
  </div>
);

const swrConfig = {
  provider: indexedDBProvider,
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  revalidateOnMount: true,
  revalidateIfStale: true,
  shouldRetryOnError: true,
  errorRetryCount: 2,
  errorRetryInterval: 3000,
  dedupingInterval: 5000,
  focusThrottleInterval: 30000,
  loadingTimeout: 10000,
  keepPreviousData: true,
  onLoadingSlow: (key, config) => {},
  onSuccess: (data, key, config) => {},
  onError: (error, key, config) => {},
  onErrorRetry: (error, key, config, revalidate, { retryCount }) => {
    if (error?.response?.status === 404) return;
    if (error?.response?.status === 401 || error?.response?.status === 403) return;
    if (retryCount >= config.errorRetryCount) return;
    const timeout = Math.min(1000 * Math.pow(2, retryCount), 10000);
    setTimeout(() => {
      revalidate({ retryCount });
    }, timeout);
  },
  compare: (a, b) => {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      if (a.length === 0 && b.length === 0) return true;
      return JSON.stringify(a[0]) === JSON.stringify(b[0]);
    }
    if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every((key) => a[key] === b[key]);
    }
    return a === b;
  },
};

function App() {
  return (
    <Router>
      <AuthProvider>
        {/* ✅ WRAP EVERYTHING WITH MapProvider */}
        <MapProvider>
          <SWRConfig value={swrConfig}>
            <ToastContainer
              position="top-right"
              autoClose={3000}
              hideProgressBar={false}
              newestOnTop={true}
              closeOnClick
              rtl={false}
              pauseOnFocusLoss
              draggable
              pauseOnHover
              theme="colored"
            />

            <Routes>
              <Route
                path="/"
                element={
                  <PublicRoute>
                    <LoginPage />
                  </PublicRoute>
                }
              />

              <Route
                path="/debug-map"
                element={
                  <PrivateRoute>
                    <SessionMapDebug />
                  </PrivateRoute>
                }
              />

              <Route
                path="/dashboard"
                element={
                  <PrivateRoute>
                    <DashboardPage />
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/drive-test-sessions"
                element={
                  <PrivateRoute>
                    <DriveTestSessionsPage />
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/mapview"
                element={
                  <PrivateRoute>
                    <HighPerfMap />
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/map"
                element={
                  <PrivateRoute>
                    <SimpleMapView />
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/manage-users"
                element={
                  <PrivateRoute>
                    <ManageUsersPage />
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/upload-data"
                element={
                  <PrivateRoute>
                    <UploadDataPage />
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/settings"
                element={
                  <PrivateRoute>
                    <SettingsPage />
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/logscircles"
                element={
                  <PrivateRoute>
                    <LogsCirclesPage />
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/create-project"
                element={
                  <PrivateRoute>
                    <ProjectsPage />
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/prediction-map"
                element={
                  <PrivateRoute>
                    <PredictionMapPage />
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/getreport"
                element={
                  <PrivateRoute>
                    <GetReportPage />
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/unified-map"
                element={
                  <PrivateRoute>
                    <UnifiedMapView />
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/viewProject"
                element={
                  <PrivateRoute>
                    <ViewProjectsPage />
                  </PrivateRoute>
                }
              />

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </SWRConfig>
        </MapProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;