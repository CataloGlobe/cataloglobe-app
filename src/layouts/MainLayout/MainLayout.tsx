import { useEffect, useState } from "react";
import { Outlet, useLocation, useParams } from "react-router-dom";
import Sidebar from "@components/layout/Sidebar/Sidebar";
import { Menu } from "lucide-react";
import { IconButton } from "@/components/ui/Button/IconButton";
import { DrawerProvider } from "@/context/Drawer/DrawerProvider";
import { SubscriptionBanner } from "@/components/Subscription/SubscriptionBanner";
import { ActivationRequired } from "@/components/Subscription/ActivationRequired";
import { useTenant } from "@/context/useTenant";
import { usePageTitle } from "@/hooks/usePageTitle";

import styles from "./MainLayout.module.scss";

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
    const { selectedTenant, loading } = useTenant();
    const { businessId } = useParams<{ businessId: string }>();
    const { pathname } = useLocation();

    const pageName = businessId ? resolvePageTitle(businessId, pathname) : undefined;
    const tenantName = selectedTenant?.name;
    usePageTitle(pageName && tenantName ? `${pageName} — ${tenantName}` : pageName);

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

    // Tenant without subscription → standalone activation page (no sidebar)
    if (!loading && selectedTenant && !selectedTenant.stripe_subscription_id) {
        return <ActivationRequired />;
    }

    return (
        <div className={styles.appLayout}>
            <div className={styles.body}>
                <DrawerProvider>
                    <Sidebar
                        isMobile={isMobile}
                        mobileOpen={mobileSidebarOpen}
                        collapsed={!isMobile && sidebarCollapsed}
                        onRequestClose={() => setMobileSidebarOpen(false)}
                        onToggleCollapse={() => setSidebarCollapsed(v => !v)}
                    />

                    <main className={styles.main}>
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
                        <div className={styles.content}>
                            <SubscriptionBanner />
                            <Outlet />
                        </div>
                    </main>
                </DrawerProvider>
            </div>
        </div>
    );
}
