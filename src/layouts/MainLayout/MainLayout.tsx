import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import Sidebar from "@components/layout/Sidebar/Sidebar";
import { AppHeader } from "@components/layout/AppHeader/AppHeader";
import { OperationalAlerts } from "@components/layout/OperationalAlerts/OperationalAlerts";
import { PageHeaderSlot } from "@components/layout/PageHeaderSlot";
import { DrawerProvider } from "@/context/Drawer/DrawerProvider";
import { BreadcrumbProvider } from "@/context/BreadcrumbProvider";
import { PageHeaderProvider } from "@/context/PageHeaderProvider";
import { SubscriptionBanner } from "@/components/Subscription/SubscriptionBanner";
import { useTenant } from "@/context/useTenant";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useMediaQuery } from "@/hooks/useMediaQuery";

import styles from "./MainLayout.module.scss";

const SIDEBAR_COLLAPSED_KEY = "cg:sidebar-collapsed";

const PAGE_TITLES: Record<string, string> = {
    overview: 'Panoramica',
    products: 'Prodotti',
    catalogs: 'Cataloghi',
    locations: 'Sedi',
    scheduling: 'Programmazione',
    featured: 'In Evidenza',
    styles: 'Stili',
    attributes: 'Attributi',
    reviews: 'Recensioni',
    analytics: 'Analytics',
    team: 'Team',
    subscription: 'Abbonamento',
    settings: 'Impostazioni',
};

function resolvePageTitle(businessId: string, pathname: string): string | undefined {
    const prefix = `/business/${businessId}/`;
    const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
    const segments = rest.split('/').filter(Boolean);
    const first = segments[0] ?? '';
    const second = segments[1] ?? '';
    const third = segments[2] ?? '';

    if (first === 'scheduling' && second === 'featured' && third) return 'Regola In Evidenza';
    if (second && first === 'products') return 'Dettaglio Prodotto';
    if (second && first === 'catalogs') return 'Dettaglio Catalogo';
    if (second && first === 'locations') return 'Dettaglio Sede';
    if (second && first === 'scheduling') return 'Dettaglio Regola';
    if (second && first === 'featured') return 'Dettaglio In Evidenza';
    if (second && first === 'styles') return 'Editor Stile';

    return PAGE_TITLES[first];
}

export default function MainLayout() {
    const isMobile = useMediaQuery("(max-width: 767px)");
    const { selectedTenant, loading } = useTenant();
    const { businessId } = useParams<{ businessId: string }>();
    const { pathname } = useLocation();

    const pageName = businessId ? resolvePageTitle(businessId, pathname) : undefined;
    const tenantName = selectedTenant?.name;
    usePageTitle(pageName && tenantName ? `${pageName} — ${tenantName}` : pageName);

    const contentRef = useRef<HTMLDivElement>(null);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        try {
            return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
        } catch {
            return false;
        }
    });

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
        } catch {
            // localStorage può fallire in modalità privata o quota piena, ignorare
        }
    }, [sidebarCollapsed]);

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

    // Tenant without subscription → redirect to workspace with resume param.
    // WorkspacePage will auto-open CreateBusinessWizard in resume mode with
    // plan + seats pre-populated from the existing tenant row.
    if (!loading && selectedTenant && !selectedTenant.stripe_subscription_id) {
        return <Navigate to={`/workspace?resume=${selectedTenant.id}`} replace />;
    }

    return (
        <div className={styles.appLayout}>
            <DrawerProvider>
                <BreadcrumbProvider>
                    <PageHeaderProvider>
                        <OperationalAlerts />
                        <header className={styles.globalHeader}>
                            <AppHeader onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />
                        </header>

                        <div className={styles.body}>
                            <Sidebar
                                isMobile={isMobile}
                                mobileOpen={mobileSidebarOpen}
                                collapsed={!isMobile && sidebarCollapsed}
                                onRequestClose={() => setMobileSidebarOpen(false)}
                                onToggleCollapse={() => setSidebarCollapsed(v => !v)}
                            />

                            <main className={styles.main}>
                                <PageHeaderSlot scrollContainerRef={contentRef} />
                                <div ref={contentRef} className={styles.content}>
                                    <SubscriptionBanner />
                                    <Outlet />
                                </div>
                            </main>
                        </div>
                    </PageHeaderProvider>
                </BreadcrumbProvider>
            </DrawerProvider>
        </div>
    );
}
