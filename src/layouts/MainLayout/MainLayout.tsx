import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "@components/layout/Sidebar/Sidebar";
import { Menu } from "lucide-react";
import { IconButton } from "@/components/ui/Button/IconButton";
import { DrawerProvider } from "@/context/Drawer/DrawerProvider";
import { SubscriptionBanner } from "@/components/Subscription/SubscriptionBanner";
import { ActivationRequired } from "@/components/Subscription/ActivationRequired";
import { useTenant } from "@/context/useTenant";

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
    const { selectedTenant, loading } = useTenant();

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
