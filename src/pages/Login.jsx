import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Spinner from '../components/common/Spinner';
import vinfocom from '../assets/vinfocom.png';

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        if (!email || !password) {
            toast.error("Please enter both email and password.");
            setLoading(false);
            return;
        }

        try {
            const response = await login({ Email: email, Password: password, IP: '' });

            if (response.success) {
                toast.success('Login successful!');
                navigate('/dashboard');
            } else {
                toast.error(response.message || 'Login failed. Please check your credentials.');
            }
        } catch (error) {
            console.error("Login API call failed:", error);
            toast.error(error.message || 'An unexpected error occurred.');
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
