import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { BreadcrumbProvider } from "@/context/BreadcrumbProvider";
import { PageHeaderProvider } from "@/context/PageHeaderProvider";
import { AppHeaderWorkspace } from "@/components/layout/AppHeader/AppHeaderWorkspace";
import { PageHeaderSlot } from "@/components/layout/PageHeaderSlot";
import WorkspaceSidebar from "./WorkspaceSidebar";
import styles from "./WorkspaceLayout.module.scss";

export default function WorkspaceLayout() {
    usePageTitle('Workspace');
    const contentRef = useRef<HTMLDivElement>(null);
    const { pathname } = useLocation();

    const isMobile = useMediaQuery("(max-width: 767px)");
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    useEffect(() => {
        contentRef.current?.scrollTo(0, 0);
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
        <div className={styles.appLayout}>
            <BreadcrumbProvider>
                <PageHeaderProvider>
                    <header className={styles.globalHeader}>
                        <AppHeaderWorkspace
                            onOpenMobileSidebar={isMobile ? () => setMobileSidebarOpen(true) : undefined}
                        />
                    </header>
                    <div className={styles.body}>
                        <WorkspaceSidebar
                            isMobile={isMobile}
                            mobileOpen={mobileSidebarOpen}
                            collapsed={!isMobile && sidebarCollapsed}
                            onRequestClose={() => setMobileSidebarOpen(false)}
                            onToggleCollapse={() => setSidebarCollapsed(v => !v)}
                        />
                        <main className={styles.main}>
                            <PageHeaderSlot scrollContainerRef={contentRef} />
                            <div ref={contentRef} className={styles.content}>
                                <Outlet />
                            </div>
                        </main>
                    </div>
                </PageHeaderProvider>
            </BreadcrumbProvider>
        </div>
    );
}
