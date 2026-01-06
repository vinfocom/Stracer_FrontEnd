import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import SideBar from "../SideBar";
import Header from "../Header";

const AppLayout = ({ children }) => {
  const [visible, setVisible] = useState(true);
  const location = useLocation();

  const changeValue = () => {
    setVisible(!visible);
  };

  // Routes where the header should NOT show
  const pathsWithoutHeader = [
    "/mapview",
    "/prediction-map",
    "/map",
    "/unified-map"
  ];

  // Routes where the sidebar should NOT show
  const pathsWithoutSidebar = [
    "/unified-map",
    
  ];

  const shouldShowHeader = !pathsWithoutHeader.some((path) =>
    location.pathname.startsWith(path)
  );

  const shouldShowSidebar = !pathsWithoutSidebar.some((path) =>
    location.pathname.startsWith(path)
  );

  return (
    <div className="flex h-screen bg-gray-100 ">

      {/* Sidebar */}
      {shouldShowSidebar && (
        <>
        <div
          className={`fixed left-0 top-0 h-full z-40 transform transition-transform duration-500 ease-in-out
          ${visible ? "translate-x-0" : "-translate-x-full"} 
          bg-slate-900 shadow-xl flex`}
          style={{ width: "250px" }}
        >

          <div className="flex-1">
            <SideBar collapsed={!visible} />
          </div>
          <div className="w-2  relative">
            <button
              onClick={changeValue}
              className="absolute top-1/2 -right-4 transform -translate-y-1/2 rounded-r-2xl 
                bg-slate-950 text-white p-2 hover:bg-purple-500 transition-all duration-300"
            >
              {visible ? "⟨" : "⟩"}
            </button>
          </div>
        </div>

        </>
      )}

      {/* Main content */}
      <div
        className={`flex-1 flex flex-col transition-all duration-500 ease-in-out 
        ${shouldShowSidebar && visible ? "ml-[250px]" : "ml-0"}`}
      >
        {shouldShowHeader && <Header />}

        <main className={`flex-1 overflow-y-auto ${!shouldShowHeader ? "h-full" : ""}`}>
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
