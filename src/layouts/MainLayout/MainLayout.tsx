import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "@components/layout/Sidebar/Sidebar";
import Navbar from "@components/layout/Navbar/Navbar";
import styles from "./MainLayout.module.scss";

function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(() => {
        if (typeof window === "undefined") return false;
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        const mql = window.matchMedia(query);

        const handler = (e: MediaQueryListEvent) => {
            setMatches(e.matches);
        };

        mql.addEventListener("change", handler);
        setMatches(mql.matches);

        return () => {
            mql.removeEventListener("change", handler);
        };
    }, [query]);

    return matches;
}

export default function MainLayout() {
    const isMobile = useMediaQuery("(max-width: 1023px)");

    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    useEffect(() => {
        if (isMobile) setMobileSidebarOpen(false);
    }, [isMobile]);

    useEffect(() => {
        if (mobileSidebarOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }

        return () => {
            document.body.style.overflow = "";
        };
    }, [mobileSidebarOpen]);

    return (
        <div className={styles.appLayout}>
            {/* 🔝 NAVBAR SEMPRE IN CIMA */}
            <Navbar
                isMobile={isMobile}
                onMobileMenuClick={() => setMobileSidebarOpen(v => !v)}
                mobileMenuOpen={mobileSidebarOpen}
            />

            {/* ⬇️ AREA SOTTO LA NAVBAR */}
            <div className={styles.body}>
                <Sidebar
                    isMobile={isMobile}
                    mobileOpen={mobileSidebarOpen}
                    collapsed={!isMobile && sidebarCollapsed}
                    onRequestClose={() => setMobileSidebarOpen(false)}
                    onToggleCollapse={() => setSidebarCollapsed(v => !v)}
                />

                <main className={styles.main}>
                    <div className={styles.content}>
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
