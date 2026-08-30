import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { listAllTickets } from "@/services/supabase/support";
import type { AdminOutletContext } from "./outletContext";
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

    // ── Pallino "richieste in attesa" ──────────────────────────────────────
    // Fonte UNICA, montata qui come il gemello lato cliente in `MainLayout`:
    // la sidebar è renderizzata su OGNI pagina admin e non deve interrogare il
    // DB da sé. Un solo fetch al mount dell'area, nessun polling.
    //
    // ── Il significato NON è simmetrico a quello lato cliente ──────────────
    // Lì il pallino dice "c'è una risposta che non hai letto", e si spegne con
    // `customer_last_read_at`. Qui dice "c'è un ticket che aspetta una
    // risposta": si spegne quando si risponde, non quando si guarda. Non
    // esiste uno stato di lettura per la piattaforma ed è voluto — in una coda
    // di supporto conta chi aspetta, non cosa hai già aperto. Non aggiungere
    // un `platform_last_read_at` per simmetria: renderebbe possibile spegnere
    // il segnale senza aver risposto a nessuno.
    //
    // Un errore lascia il pallino spento: meglio non segnalare code
    // inesistenti. La sezione Supporto resta comunque raggiungibile.
    const [supportPending, setSupportPending] = useState(false);
    const [supportRefreshKey, setSupportRefreshKey] = useState(0);
    // `useCallback` obbligatorio: finisce nel context dell'Outlet e nelle
    // dipendenze degli `useCallback` delle pagine a valle. Una funzione nuova a
    // ogni render le invaliderebbe tutte — lo stesso difetto di dipendenze
    // instabili da cui è nato il loop di `usePageHeader`.
    const refreshSupportPending = useCallback(() => setSupportRefreshKey(k => k + 1), []);
    useEffect(() => {
        let cancelled = false;
        void listAllTickets()
            .then(rows => {
                if (!cancelled) {
                    setSupportPending(
                        rows.some(t => t.last_message_kind === "customer" && t.status !== "closed")
                    );
                }
            })
            .catch(() => {
                if (!cancelled) setSupportPending(false);
            });
        return () => {
            cancelled = true;
        };
    }, [supportRefreshKey]);

    // Memoizzato per la stessa ragione: un oggetto nuovo a ogni render farebbe
    // rirenderizzare ogni consumer di `useAdminOutletContext`.
    const outletContext = useMemo<AdminOutletContext>(
        () => ({ refreshSupportPending }),
        [refreshSupportPending]
    );

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
                            supportPending={supportPending}
                        />
                        <main className={styles.main}>
                            <PageHeaderSlot scrollContainerRef={contentRef} />
                            <div ref={contentRef} className={styles.content}>
                                <Outlet context={outletContext} />
                            </div>
                        </main>
                    </div>
                </PageHeaderProvider>
            </BreadcrumbProvider>
        </div>
    );
}
