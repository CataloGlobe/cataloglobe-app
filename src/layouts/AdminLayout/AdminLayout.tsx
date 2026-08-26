import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { BreadcrumbProvider } from "@/context/BreadcrumbProvider";
import { PageHeaderProvider } from "@/context/PageHeaderProvider";
import { AppHeaderAdmin } from "@/components/layout/AppHeader/AppHeaderAdmin";
import { PageHeaderSlot } from "@/components/layout/PageHeaderSlot";
import AdminSidebar from "./AdminSidebar";
import styles from "../shared/layoutShell.module.scss";

/**
 * Layout dell'area admin di piattaforma (`/admin/*`).
 *
 * CLAUDE.md vieta di creare nuovi layout: questa è un'eccezione motivata.
 * `MainLayout` e `WorkspaceLayout` presuppongono entrambi un contesto tenant
 * (tenant pill, notifiche account, `PermissionsProvider`), mentre `/admin` è
 * un'area di piattaforma con un modello di autorizzazione proprio
 * (`platform_admins` / `is_platform_admin()`), cross-tenant e senza tenant
 * selezionato. Il guscio (shell SCSS, sidebar) resta condiviso: la divergenza
 * è solo header e navigazione.
 */
export default function AdminLayout() {
    usePageTitle("Area admin");
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
                        <AppHeaderAdmin
                            onOpenMobileSidebar={isMobile ? () => setMobileSidebarOpen(true) : undefined}
                        />
                    </header>
                    <div className={styles.body}>
                        <AdminSidebar
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
