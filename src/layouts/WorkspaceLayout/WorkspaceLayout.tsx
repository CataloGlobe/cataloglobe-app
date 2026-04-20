import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Menu } from "lucide-react";
import { IconButton } from "@/components/ui/Button/IconButton";
import WorkspaceSidebar from "./WorkspaceSidebar";
import styles from "./WorkspaceLayout.module.scss";

function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(() => {
        if (typeof window === "undefined") return false;
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        const mql = window.matchMedia(query);
        const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
        mql.addEventListener("change", handler);
        setMatches(mql.matches);
        return () => mql.removeEventListener("change", handler);
    }, [query]);

    return matches;
}

export default function WorkspaceLayout() {
    usePageTitle('Workspace');
    const mainRef = useRef<HTMLElement>(null);
    const { pathname } = useLocation();

    const isMobile = useMediaQuery("(max-width: 1023px)");
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    useEffect(() => {
        mainRef.current?.scrollTo(0, 0);
    }, [pathname]);

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
        <div className={styles.layout}>
            <WorkspaceSidebar
                isMobile={isMobile}
                mobileOpen={mobileSidebarOpen}
                collapsed={!isMobile && sidebarCollapsed}
                onRequestClose={() => setMobileSidebarOpen(false)}
                onToggleCollapse={() => setSidebarCollapsed(v => !v)}
            />
            <main className={styles.main} ref={mainRef}>
                {isMobile && (
                    <div className={styles.mobileHeader}>
                        <IconButton
                            variant="ghost"
                            icon={<Menu size={24} />}
                            onClick={() => setMobileSidebarOpen(true)}
                            aria-label="Apri menu"
                        />
                        <div className={styles.mobileTitle}>CataloGlobe</div>
                    </div>
                )}
                <Outlet />
            </main>
        </div>
    );
}
