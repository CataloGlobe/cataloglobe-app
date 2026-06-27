import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useTenantId } from "@/context/useTenantId";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTranslationCoverage } from "@/hooks/useTranslationCoverage";
import type { BusinessOutletContext } from "./outletContext";

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

    // ── Indicatore globale traduzioni ──────────────────────────────────
    // Fonte UNICA della coverage: l'hook è montato qui (persiste in tutta
    // l'area business) → un solo poll condizionato + un solo toast di
    // completamento, indipendentemente dalla pagina aperta. `wake()` bumpa
    // refreshKey per un refetch immediato dopo un enqueue (vedi Outlet context).
    const tenantId = useTenantId();
    const [translationRefreshKey, setTranslationRefreshKey] = useState(0);
    const translationCoverage = useTranslationCoverage(tenantId, translationRefreshKey);
    const wakeTranslations = useCallback(
        () => setTranslationRefreshKey(k => k + 1),
        []
    );
    const translationPendingCount = useMemo(
        () =>
            translationCoverage
                ? Object.values(translationCoverage).reduce((acc, c) => acc + c.pending, 0)
                : 0,
        [translationCoverage]
    );
    const outletContext = useMemo<BusinessOutletContext>(
        () => ({ translationCoverage, wakeTranslations }),
        [translationCoverage, wakeTranslations]
    );

    // Tenant without subscription → redirect to workspace with resume param.
    // WorkspacePage will auto-open CreateBusinessWizard in resume mode with
    // plan + seats pre-populated from the existing tenant row.
    if (!loading && selectedTenant && !selectedTenant.stripe_subscription_id) {
        return <Navigate to={`/workspace?resume=${selectedTenant.id}`} replace />;
    }

    // Terminal subscription (canceled) → wall the admin behind the reactivation
    // screen. SubscriptionPage already self-serves reactivation (portal/checkout).
    // A canceled tenant KEEPS its stripe_subscription_id — the
    // `customer.subscription.deleted` webhook only flips subscription_status — so
    // it falls through the workspace-resume branch above and reaches this one.
    // Allow-list /subscription itself to avoid a redirect loop AND so the
    // post-reactivation success return is never trapped even while the webhook
    // hasn't yet synced the status back to 'active'.
    if (
        !loading &&
        selectedTenant &&
        selectedTenant.subscription_status === "canceled" &&
        !pathname.endsWith("/subscription")
    ) {
        return <Navigate to={`/business/${selectedTenant.id}/subscription`} replace />;
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
                                translationPendingCount={translationPendingCount}
                            />

                            <main className={styles.main}>
                                <PageHeaderSlot scrollContainerRef={contentRef} />
                                <div ref={contentRef} className={styles.content}>
                                    <SubscriptionBanner />
                                    <Outlet context={outletContext} />
                                </div>
                            </main>
                        </div>
                    </PageHeaderProvider>
                </BreadcrumbProvider>
            </DrawerProvider>
        </div>
    );
}
