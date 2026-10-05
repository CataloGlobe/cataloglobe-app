import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { listAllTickets } from "@/services/supabase/support";
import type { AdminOutletContext } from "./outletContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { BreadcrumbProvider } from "@/context/BreadcrumbProvider";
import { PageHeaderProvider } from "@/context/PageHeaderProvider";
import AdminSidebar from "./AdminSidebar";
import { CrmBottomBar } from "./CrmBottomBar";
import { CrmNavBrand } from "./CrmNavBrand";
import { CrmPageHeader } from "./CrmPageHeader";
import { CrmSearchDialog } from "./CrmSearchDialog";
import { useCrmNavData } from "./useCrmNavData";
import styles from "../shared/layoutShell.module.scss";
import adminStyles from "./AdminLayout.module.scss";

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
 *
 * Grafica del CRM (canvas, versione finale del 2026-10-05): niente testata in
 * alto, la barra indaco porta marchio, Cerca ⌘K e contatori; il titolo sta
 * nella pagina. Sulla scheda di un lead la barra parte chiusa. Al telefono la
 * barra in basso (Home · Lead · Agenda · Altro) prende il posto del menu.
 */
export default function AdminLayout() {
    usePageTitle("Area admin");
    const contentRef = useRef<HTMLDivElement>(null);
    const { pathname } = useLocation();

    const isMobile = useMediaQuery("(max-width: 767px)");
    const isNarrow = useMediaQuery("(max-width: 1023px)");
    // Due preferenze: le pagine normali (aperta, chiusa tra 768 e 1023) e i
    // lead (chiusa: la colonna delle viste, le nove colonne, elenco, chat e
    // dati della scheda hanno bisogno di spazio; canvas V4 e V5).
    const isLeadDetail = /^\/admin\/lead(\/|$)/.test(pathname);
    const [pagesCollapsed, setPagesCollapsed] = useState<boolean | null>(null);
    const [detailCollapsed, setDetailCollapsed] = useState(true);
    const sidebarCollapsed = isLeadDetail ? detailCollapsed : (pagesCollapsed ?? isNarrow);
    const toggleCollapse = () =>
        isLeadDetail ? setDetailCollapsed(v => !v) : setPagesCollapsed(() => !sidebarCollapsed);

    const nav = useCrmNavData(pathname);
    const [searchOpen, setSearchOpen] = useState(false);
    const closeSearch = useCallback(() => setSearchOpen(false), []);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setSearchOpen(v => !v);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    useEffect(() => {
        contentRef.current?.scrollTo(0, 0);
    }, [pathname]);


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


    return (
        <div className={styles.appLayout}>
            <BreadcrumbProvider>
                <PageHeaderProvider>
                    <div className={styles.body}>
                        {!isMobile && (
                            <div className={adminStyles.crmNav}>
                                <AdminSidebar
                                    isMobile={false}
                                    mobileOpen={false}
                                    collapsed={sidebarCollapsed}
                                    onRequestClose={() => undefined}
                                    onToggleCollapse={toggleCollapse}
                                    supportPending={supportPending}
                                    home={nav.home}
                                    lead={nav.lead}
                                    headerSlot={
                                        <CrmNavBrand collapsed={sidebarCollapsed} onSearch={() => setSearchOpen(true)} />
                                    }
                                />
                            </div>
                        )}
                        <main className={`${styles.main} ${adminStyles.main}`}>
                            <div ref={contentRef} className={`${styles.content} ${adminStyles.content}`}>
                                <CrmPageHeader />
                                <Outlet context={outletContext} />
                            </div>
                        </main>
                    </div>
                    {isMobile && <CrmBottomBar home={nav.home} lead={nav.lead} />}
                    <CrmSearchDialog isOpen={searchOpen} onClose={closeSearch} venues={nav.venues} />
                </PageHeaderProvider>
            </BreadcrumbProvider>
        </div>
    );
}
