import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "@components/layout/Sidebar/Sidebar";
import Navbar from "@components/layout/Navbar/Navbar";
import styles from "./MainLayout.module.scss";

export default function MainLayout() {
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    const toggleSidebar = () => setSidebarOpen(prev => !prev);
    const closeSidebar = () => setSidebarOpen(false);

    return (
        <div className={styles.layout}>
            <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

            <div className={styles.main}>
                <Navbar onMenuClick={toggleSidebar} />
                <div className={styles.content}>
                    <Outlet />
                </div>
            </div>
        </div>
    );
}
