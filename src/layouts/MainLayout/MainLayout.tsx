import { Outlet } from "react-router-dom";

import Sidebar from "./components/Sidebar/Sidebar";
import Topbar from "./components/Topbar/Topbar";

import "./MainLayout.css";

function MainLayout() {
  return (
    <div className="layout">
      <Sidebar />

      <div className="layout-content">
        <Topbar />

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default MainLayout;