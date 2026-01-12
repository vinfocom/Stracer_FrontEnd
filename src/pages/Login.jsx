import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Spinner from '../components/common/Spinner';
import vinfocom from '../assets/vinfocom.png';
import axios from 'axios'; // Import axios to fetch IP

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [ipAddress, setIpAddress] = useState(''); // State to store IP
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    // Fetch User IP on component mount
    useEffect(() => {
        const fetchIp = async () => {
            try {
                const response = await axios.get('https://api.ipify.org?format=json');
                if (response.data && response.data.ip) {
                    setIpAddress(response.data.ip);
                }
            } catch (error) {
                console.error("Failed to fetch IP address:", error);
                // Optional: set a fallback or leave empty
            }
        };

        fetchIp();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        if (!email || !password) {
            toast.error("Please enter both email and password.");
            setLoading(false);
            return;
        }

        try {
            // Pass the fetched IP address here
            const response = await login({ 
                Email: email, 
                Password: password, 
                IP: ipAddress 
            });

            // Note: login() in AuthContext returns an object { success: boolean, ... }
            // If it returns { success: false }, we handle it here.
            // If it THROWS an error (e.g. network fail, 401, 500), it goes to catch.
            if (response.success) {
                toast.success('Login successful!');
                navigate('/dashboard');
            } else {
                // Handle logical failure (API returned 200 OK but success: false)
                console.warn("Login failed (Logic):", response);
                toast.error(response.message || 'Login failed. Please check your credentials.');
            }
        } catch (error) {
            // --- ENHANCED LOGGING START ---
            console.group("🔴 Login Error Debugging");
            console.error("Original Error Object:", error);

            let displayMessage = 'An unexpected error occurred.';

            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                console.error("❌ Server Response Data:", error.response.data);
                console.error("❌ Status Code:", error.response.status);
                console.error("❌ Headers:", error.response.headers);

                // Try to extract a meaningful message from backend error format
                const data = error.response.data;
                displayMessage = data?.message || data?.Message || data?.error || error.message;
            } else if (error.request) {
                // The request was made but no response was received
                console.error("⚠️ No response received from server:", error.request);
                displayMessage = "Server did not respond. Please check your network.";
            } else {
                // Something happened in setting up the request that triggered an Error
                console.error("⚠️ Request Setup Error:", error.message);
                displayMessage = error.message || (typeof error === 'string' ? error : displayMessage);
            }
            console.groupEnd();
            // --- ENHANCED LOGGING END ---

            toast.error(displayMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-100 via-white to-indigo-200 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 px-4">
            
            {/* Card wrapper with relative for overlay */}
            <div className="relative w-full max-w-md p-8 bg-white/80 dark:bg-gray-800/90 backdrop-blur-md rounded-2xl shadow-lg space-y-6">
                
                {/* Overlay spinner */}
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-800/70 rounded-2xl z-10">
                        <Spinner />
                    </div>
                )}

                {/* Branding / vinfocom */}
                <div className="text-center">
                    <div className="flex justify-center mb-4">
                        <span className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gray-800/90 backdrop-blur-3xl shadow-white text-white text-xl font-bold shadow-md">
                            <img src={vinfocom} alt="vinfocom" />
                        </span>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome Back</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Sign in to continue to your account
                    </p>
                </div>

                {/* Form */}
                <form className="space-y-5" onSubmit={handleSubmit}>
                    <div>
                        <label
                            htmlFor="email-address"
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                            Email address
                        </label>
                        <input
                            id="email-address"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            className="block w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="password"
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                            Password
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            className="block w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <div>
                        <button
                            type="submit"
                            className="w-full px-4 py-2 text-sm font-medium text-white rounded-lg bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 shadow-md transition-all duration-200"
                            disabled={loading}
                        >
                            Sign In
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;