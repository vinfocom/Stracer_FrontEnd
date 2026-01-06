// src/components/SideBar.jsx
import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
    LayoutDashboard, 
    Upload, 
    History, 
    Map, 
    Settings, 
    FolderPlus, 
    Plus, 
    Users, 
    ReceiptPoundSterling, 
    BarChartHorizontal,
    ChevronDown,
    ChevronRight,
    FileText
} from 'lucide-react';
import vinfocomvinfocom from '../assets/vinfocom.png';

const SideBar = ({ collapsed }) => {
    const location = useLocation();
    const [openDropdowns, setOpenDropdowns] = useState({});

    const navLinks = [
        { icon: LayoutDashboard, text: 'Dashboard', path: '/dashboard' },
        { icon: Upload, text: 'Upload Data', path: '/upload-data' },
        { icon: History, text: 'Manage Drive Sessions', path: '/drive-test-sessions' },
        { icon: Map, text: 'Map View', path: '/mapview' },
        {
            icon: FolderPlus,
            text: 'Projects',
            hasDropdown: true, // Add this flag to identify dropdown items
            children: [
                { icon: Plus, text: 'Create Project', path: '/create-project' },
                { icon: FileText, text: 'View Projects', path: '/viewProject' },
            ]
        },
        { icon: Users, text: 'Manage Users', path: '/manage-users' },
        { icon: ReceiptPoundSterling, text: 'Get Reports', path: '/getreport' },
        { icon: Settings, text: 'Settings', path: '/settings' },
    ];

    const toggleDropdown = (text) => {
        setOpenDropdowns(prev => ({
            ...prev,
            [text]: !prev[text]
        }));
    };

    const isChildActive = (children) => {
        return children.some(child => location.pathname === child.path);
    };

    const renderNavItem = (link, index) => {
        const isOpen = openDropdowns[link.text];
        const hasChildren = link.hasDropdown && link.children;
        const isActive = link.path ? location.pathname === link.path : false;
        const isParentActive = hasChildren && isChildActive(link.children);

        return (
            <li key={index} className="mb-1 sm:mb-2">
                {hasChildren ? (
                    <>
                        {/* Parent item with dropdown */}
                        <button
                            onClick={() => !collapsed && toggleDropdown(link.text)}
                            className={`w-full flex items-center p-2 sm:p-3 rounded-lg transition-colors duration-200 
                                ${isParentActive ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}
                                ${collapsed ? 'justify-center' : 'justify-between'}`}
                            title={collapsed ? link.text : undefined}
                        >
                            <div className="flex items-center">
                                <link.icon className={`h-5 w-5 flex-shrink-0 ${!collapsed ? 'mr-3' : ''}`} />
                                {!collapsed && <span className="font-medium whitespace-nowrap">{link.text}</span>}
                            </div>
                            {!collapsed && (
                                <div className="transition-transform duration-200">
                                    {isOpen ? (
                                        <ChevronDown className="h-4 w-4" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4" />
                                    )}
                                </div>
                            )}
                        </button>

                        {/* Dropdown items */}
                        {!collapsed && (
                            <ul 
                                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                                    isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                                }`}
                            >
                                {link.children.map((child, childIndex) => (
                                    <li key={childIndex}>
                                        <NavLink
                                            to={child.path}
                                            className={({ isActive }) =>
                                                `flex items-center p-2 pl-11 rounded-lg transition-colors duration-200 ${
                                                    isActive
                                                        ? 'bg-blue-600 text-white'
                                                        : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                                                }`
                                            }
                                        >
                                            <child.icon className="h-4 w-4 mr-3" />
                                            <span className="text-sm whitespace-nowrap">{child.text}</span>
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                ) : (
                    // Regular nav item without dropdown
                    <NavLink
                        to={link.path}
                        className={({ isActive }) =>
                            `flex items-center p-2 sm:p-3 rounded-lg transition-colors duration-200 ${
                                isActive
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                            } ${collapsed ? 'justify-center' : ''}`
                        }
                        title={collapsed ? link.text : undefined}
                    >
                        <link.icon className={`h-5 w-5 flex-shrink-0 ${!collapsed ? 'mr-3' : ''}`} />
                        {!collapsed && <span className="font-medium whitespace-nowrap">{link.text}</span>}
                    </NavLink>
                )}
            </li>
        );
    };

    return (
        <div
            className={`h-screen bg-slate-950 text-white flex flex-col shadow-lg transition-width duration-300 ease-in-out
                ${collapsed ? 'w-16' : 'w-60'}`}
        >
            {/* vinfocom */}
            <div className="p-4 flex items-center justify-center   h-16 flex-shrink-0">
                <img src={vinfocomvinfocom} alt="vinfocom" className="h-8 sm:h-10 object-contain" />
                {!collapsed && <span className="ml-2 font-bold text-lg whitespace-nowrap">Vinfocom</span>}
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto p-2">
                <ul>
                    {navLinks.map(renderNavItem)}
                </ul>
            </nav>
        </div>
    );
};

export default SideBar;