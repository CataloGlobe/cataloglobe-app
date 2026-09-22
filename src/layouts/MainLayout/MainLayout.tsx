import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import TenantSidebar from "@components/layout/Sidebar/TenantSidebar";
import { AppHeader } from "@components/layout/AppHeader/AppHeader";
import { OperationalAlerts } from "@components/layout/OperationalAlerts/OperationalAlerts";
import { PageHeaderSlot } from "@components/layout/PageHeaderSlot";
import { DrawerProvider } from "@/context/Drawer/DrawerProvider";
import { BreadcrumbProvider } from "@/context/BreadcrumbProvider";
import { PageHeaderProvider } from "@/context/PageHeaderProvider";
import { SubscriptionBanner } from "@/components/Subscription/SubscriptionBanner";
import { CheckoutConfirmScreen } from "@/components/Subscription/CheckoutConfirmScreen";
import { UnsavedChangesGuardHost } from "@/components/ui/UnsavedChangesBar/UnsavedChangesGuardHost";
import { useTenant } from "@/context/useTenant";
import { useTenantId } from "@/context/useTenantId";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTranslationCoverage } from "@/hooks/useTranslationCoverage";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { resolveBusinessRoute, businessRouteLabel } from "@components/layout/AppHeader/navbarBreadcrumbRoutes";
import { ACTIVITY_SECTION_LABELS, type ActivitySection } from "@/pages/Operativita/Attivita/ActivityDetailContext";
import { useAiImportSession } from "@/hooks/useAiImportSession";
import { useAiUsage } from "@/hooks/useAiUsage";
import { useCheckoutReturnSync } from "@/hooks/useCheckoutReturnSync";
import { AiMenuImportDrawer } from "@/pages/Dashboard/Catalogs/AiMenuImport/AiMenuImportDrawer";
import { hasUnreadReply, listMyTickets } from "@/services/supabase/support";
import type { BusinessOutletContext } from "./outletContext";

import styles from "./MainLayout.module.scss";

const SIDEBAR_COLLAPSED_KEY = "cg:sidebar-collapsed";

/**
 * Titolo di pagina per il <title> del browser. `resolvePageTitle` è
 * module-level e non può chiamare `useVerticalConfig()`: `catalogLabel` arriva
 * come argomento, letto dal componente. Le route di dettaglio restano
 * parsate a mano (servono i segment 2/3, non solo la top-level key); per le
 * route piatte la label passa da `businessRouteLabel` — fonte unica condivisa
 * con breadcrumb e sidebar.
 */
function resolvePageTitle(businessId: string, pathname: string, catalogLabel: string): string | undefined {
    const prefix = `/business/${businessId}/`;
    const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
    const segments = rest.split('/').filter(Boolean);
    const first = segments[0] ?? '';
    const second = segments[1] ?? '';
    const third = segments[2] ?? '';

    if (first === 'scheduling' && second === 'featured' && third) return 'Regola in evidenza';
    if (second && first === 'products') return 'Dettaglio prodotto';
    if (second && first === 'catalogs') return `Dettaglio ${catalogLabel.toLowerCase()}`;
    if (second && first === 'locations') {
        // Le sei pagine della sede sono rotte: il titolo dice in quale sei,
        // altrimenti sei schede del browser si chiamano tutte uguale.
        const label = ACTIVITY_SECTION_LABELS[third as ActivitySection];
        return label ? `Sede · ${label}` : 'Dettaglio sede';
    }
    if (second && first === 'scheduling') return 'Dettaglio regola';
    if (second && first === 'featured') return 'Dettaglio in evidenza';
    if (second && first === 'styles') return 'Editor stile';

    const { key } = resolveBusinessRoute(pathname, businessId);
    return key ? businessRouteLabel(key, { catalogLabel }) : undefined;
}

export default function MainLayout() {
    // Sotto 768 la sidebar è un cassetto; fra 768 e 1024 parte collassata
    // (design system §2, breakpoint-sidebar): la scelta manuale resta
    // possibile, ma non viene salvata finché la finestra è stretta.
    const isMobile = useMediaQuery("(max-width: 767px)");
    const isNarrow = useMediaQuery("(max-width: 1023px)");
    const { selectedTenant, loading } = useTenant();
    const { businessId } = useParams<{ businessId: string }>();
    const { pathname } = useLocation();
    // Return from Stripe (re-subscribe lands on /subscription?checkout_session=):
    // link the tenant before the "no subscription" gate below can bounce it.
    const checkoutSync = useCheckoutReturnSync();

    const { catalogLabel } = useVerticalConfig();
    const pageName = businessId ? resolvePageTitle(businessId, pathname, catalogLabel) : undefined;
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
        if (typeof window === "undefined" || isNarrow) return;
        try {
            window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
        } catch {
            // localStorage può fallire in modalità privata o quota piena, ignorare
        }
    }, [sidebarCollapsed, isNarrow]);

    useEffect(() => {
        if (isNarrow && !isMobile) setSidebarCollapsed(true);
    }, [isNarrow, isMobile]);

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
    // ── Sessione import AI sollevata ───────────────────────────────────
    // Montata una sola volta qui (come la coverage traduzioni): stato e
    // richiesta `menu-ai-import` vivono nel layout → sopravvivono all'unmount
    // della pagina. Il drawer è reso fuori dall'Outlet e riceve la sessione per
    // props; le pagine ricevono `openAiImport` + `importRefreshKey` via context.
    // ── Stato quota AI sollevato (FASE 5) ──────────────────────────────
    // Montato una sola volta qui (come coverage/import): header pill + sezione
    // Abbonamento leggono da qui. `refresh` viene passato all'import per
    // aggiornare la pill dopo un'operazione che consuma quota.
    const aiUsage = useAiUsage(tenantId);
    const aiImport = useAiImportSession(tenantId, aiUsage.refresh);
    // Booleano largo per la pillola sidebar: cambia solo alle transizioni di
    // status (non a ogni tick di createProgress) → niente rerender per tick.
    const importInProgress = aiImport.status === "analyzing" || aiImport.status === "creating";

    // ── Pallino "risposta di supporto non letta" ───────────────────────────
    // Fonte UNICA, montata qui come coverage traduzioni e quota AI: la sidebar
    // è renderizzata su OGNI pagina, quindi non deve interrogare il DB da sé.
    // Un solo fetch al mount dell'area business, nessun polling; il dettaglio
    // richiesta chiama `refreshSupportUnread` dopo markTicketRead o l'invio di
    // un messaggio, che sono gli unici due eventi locali che lo cambiano.
    //
    // Un errore lascia il pallino spento: se non riusciamo a sapere se ci sono
    // risposte non lette, meglio non segnalarne di inesistenti. La pagina
    // Assistenza resta comunque raggiungibile.
    const [supportUnread, setSupportUnread] = useState(false);
    const [supportRefreshKey, setSupportRefreshKey] = useState(0);
    const refreshSupportUnread = useCallback(() => setSupportRefreshKey(k => k + 1), []);
    useEffect(() => {
        if (!tenantId) return;
        let cancelled = false;
        void listMyTickets(tenantId)
            .then(rows => {
                if (!cancelled) setSupportUnread(rows.some(hasUnreadReply));
            })
            .catch(() => {
                if (!cancelled) setSupportUnread(false);
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId, supportRefreshKey]);

    const outletContext = useMemo<BusinessOutletContext>(
        () => ({
            translationCoverage,
            wakeTranslations,
            openAiImport: aiImport.open,
            importRefreshKey: aiImport.importRefreshKey,
            importStatus: aiImport.status,
            aiUsage: aiUsage.usage,
            refreshAiUsage: aiUsage.refresh,
            refreshSupportUnread
        }),
        [
            translationCoverage,
            wakeTranslations,
            aiImport.open,
            aiImport.importRefreshKey,
            aiImport.status,
            aiUsage.usage,
            aiUsage.refresh,
            refreshSupportUnread
        ]
    );

    // Payment just completed: the webhook may not have linked the tenant yet.
    // Hold the gates until stripe-checkout-confirm has done it (or given up).
    if (checkoutSync.status !== "idle") {
        return (
            <CheckoutConfirmScreen
                variant={checkoutSync.status}
                reference={checkoutSync.reference}
                onRetry={checkoutSync.retry}
            />
        );
    }

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
                            <AppHeader
                                onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
                                aiUsage={aiUsage.usage}
                            />
                        </header>

                        <div className={styles.body}>
                            <TenantSidebar
                                isMobile={isMobile}
                                mobileOpen={mobileSidebarOpen}
                                collapsed={!isMobile && sidebarCollapsed}
                                onRequestClose={() => setMobileSidebarOpen(false)}
                                onToggleCollapse={() => setSidebarCollapsed(v => !v)}
                                translationPendingCount={translationPendingCount}
                                importInProgress={importInProgress}
                                supportUnread={supportUnread}
                            />

                            <main className={styles.main}>
                                <PageHeaderSlot scrollContainerRef={contentRef} />
                                <div ref={contentRef} className={styles.content}>
                                    <SubscriptionBanner />
                                    <Outlet context={outletContext} />
                                </div>
                            </main>
                        </div>

                        {/* Drawer import AI: reso a livello di layout, FUORI dall'Outlet,
                            così stato e richiesta sopravvivono ai cambi route. */}
                        <AiMenuImportDrawer session={aiImport} />

                        {/* Guardia "modifiche non salvate": unica per il layout
                            (un solo useBlocker), alimentata da useUnsavedChangesGuard
                            nelle pagine con draft. */}
                        <UnsavedChangesGuardHost />
                    </PageHeaderProvider>
                </BreadcrumbProvider>
            </DrawerProvider>
        </div>
    );
}
