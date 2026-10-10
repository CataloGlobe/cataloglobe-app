import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import TenantSidebar from "@components/layout/Sidebar/TenantSidebar";
import { useNavGroups } from "@components/layout/Sidebar/useNavGroups";
import { AppHeader } from "@components/layout/AppHeader/AppHeader";
import { HeaderNotifications } from "@components/layout/AppHeader/HeaderNotifications";
import { AiUsagePill } from "@components/layout/AppHeader/AiUsagePill";
import { OperationalAlerts } from "@components/layout/OperationalAlerts/OperationalAlerts";
import { PageHeaderSlot } from "@components/layout/PageHeaderSlot";
import { PageTitleBar } from "@components/layout/PageTitleBar/PageTitleBar";
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
import { ACTIVITY_SECTION_LABELS } from "@/pages/Operativita/Attivita/ActivityDetailContext";
import { useAiImportSession } from "@/hooks/useAiImportSession";
import { useAiUsage } from "@/hooks/useAiUsage";
import { useCheckoutReturnSync } from "@/hooks/useCheckoutReturnSync";
import { AiMenuImportDrawer } from "@/pages/Dashboard/Catalogs/AiMenuImport/AiMenuImportDrawer";
import { hasUnreadReply, listMyTickets } from "@/services/supabase/support";
import { useSedeScope } from "@/hooks/useSedeScope";
import { readSedeScopeLocal, rememberLastSede } from "@/hooks/sedeScopeStore";
import { resolveNavContext } from "@/utils/navModel";
import type { BusinessOutletContext } from "./outletContext";
import { useCurrentUserProfile } from "@/hooks/useCurrentUserProfile";

import { DetailPaneHostContext, type DetailPaneHost } from "@/components/layout/DetailPane/DetailPaneContext";
import styles from "./MainLayout.module.scss";
import { isCanceledAllowedPath } from "./canceledAllowedPath";

const SIDEBAR_COLLAPSED_KEY = "cg:sidebar-collapsed";

/** Le pagine che vivono dentro una sede: quelle della scheda più le
 *  operative, montate sul contesto. */
const SEDE_PAGE_LABELS: Record<string, string | undefined> = {
    ...ACTIVITY_SECTION_LABELS,
    servizio: "In servizio",
    comande: "Comande",
    storico: "Storico",
    prenotazioni: "Prenotazioni",
    analitiche: "Andamento",
    recensioni: "Recensioni",
    programmazione: "Regole",
    "cosa-vedono": "Cosa vedono i clienti"
};

/** `/business/:businessId/locations/:activityId[/...]` — dentro una sede. */
const SEDE_CONTEXT_PATH = /^\/business\/[^/]+\/locations\/([^/]+)/;

const CREA_TITLES: Record<string, string> = {
    menu: 'Nuovo menù',
    stile: 'Nuovo stile',
    evidenza: 'Nuovo contenuto in evidenza',
    storia: 'Nuova storia',
};

/**
 * Titolo di pagina per il <title> del browser. `resolvePageTitle` è
 * module-level e non può chiamare `useVerticalConfig()`: `catalogLabel` arriva
 * come argomento, letto dal componente. Le route di dettaglio restano
 * parsate a mano (servono i segment 2/3, non solo la top-level key); per le
 * route piatte la label passa da `businessRouteLabel` — fonte unica condivisa
 * con breadcrumb e sidebar.
 */
function resolvePageTitle(
    businessId: string,
    pathname: string,
    search: string,
    catalogLabel: string,
    sedeName: (id: string) => string | undefined
): string | undefined {
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
        // Le pagine della sede sono rotte: il titolo dice in quale sei,
        // altrimenti le schede del browser si chiamano tutte uguale.
        // La parte prima della sede (D143): «In servizio · Garbagnate».
        const params = new URLSearchParams(search);
        const label = third === 'servizio' && params.get('modo') === 'sala' ? 'Sala' : SEDE_PAGE_LABELS[third];
        const name = sedeName(second);
        if (!label) return name ?? 'Scheda';
        return name ? `${label} · ${name}` : label;
    }
    // Le tab di Impostazioni (§51.12) tengono il nome della pagina di prima.
    if (first === 'settings' && second === 'team') return businessRouteLabel('team');
    if (first === 'settings' && second === 'abbonamento') return businessRouteLabel('subscription');
    if (second && first === 'scheduling') return 'Dettaglio regola';
    if (second && first === 'featured') return 'Dettaglio in evidenza';
    if (second && first === 'styles') return 'Editor stile';
    // I tunnel di creazione (D124): il titolo dice cosa si sta creando.
    if (first === 'crea') return CREA_TITLES[second] ?? 'Crea';

    // Una pagina, due parti: «Regole» e, con la vista, «Calendario».
    if (first === 'scheduling') return new URLSearchParams(search).get('vista') === 'calendario' ? 'Calendario' : 'Regole';

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
    const { pathname, search } = useLocation();
    // Return from Stripe (re-subscribe lands on /settings/abbonamento?checkout_session=):
    // link the tenant before the "no subscription" gate below can bounce it.
    const checkoutSync = useCheckoutReturnSync();

    const { catalogLabel } = useVerticalConfig();
    // Il contesto della sidebar (§51.2): dalle sedi che chi guarda legge e dal
    // path. Una sede: sidebar unica, ovunque. Più sedi: dentro una sede la
    // sidebar è la sua; `/locations` senza id resta azienda.
    const pathActivityId = SEDE_CONTEXT_PATH.exec(pathname)?.[1] ?? null;
    const { readableActivities, isLoaded: sediLoaded } = useSedeScope();
    // Una volta qui, non nel pulsante dell'account: quello si rimonta fra la
    // sidebar della sede e quella dell'azienda, e il nome tornerebbe l'email.
    const profile = useCurrentUserProfile();
    const navContext = resolveNavContext(sediLoaded ? readableActivities.length : null, pathActivityId !== null);
    const soleActivityId = readableActivities.length === 1 ? readableActivities[0].id : null;
    // Entrare in una sede la fa diventare l'ultima usata (§51.9): `/orders` e
    // `/reservations` ci tornano. Solo una sede leggibile: un id sbagliato
    // nell'indirizzo non si ricorda.
    const rememberedSedeId =
        pathActivityId && readableActivities.some(a => a.id === pathActivityId) ? pathActivityId : null;
    useEffect(() => {
        if (rememberedSedeId) rememberLastSede(rememberedSedeId);
    }, [rememberedSedeId]);
    // Con una sede sola il nome della sede non aggiunge niente all'azienda.
    const sedeName = (id: string) =>
        readableActivities.length > 1 ? readableActivities.find(a => a.id === id)?.name : undefined;
    const pageName = businessId ? resolvePageTitle(businessId, pathname, search, catalogLabel, sedeName) : undefined;
    const tenantName = selectedTenant?.name;
    usePageTitle(pageName && tenantName ? `${pageName} · ${tenantName}` : pageName);

    const contentRef = useRef<HTMLDivElement>(null);
    // L'aside del dettaglio dal vivo: le pagine ci aprono il loro `DetailPane`.
    const [detailSlot, setDetailSlot] = useState<HTMLElement | null>(null);
    const [detailCount, setDetailCount] = useState(0);
    const registerDetail = useCallback(() => {
        setDetailCount(c => c + 1);
        return () => setDetailCount(c => c - 1);
    }, []);
    const detailHost = useMemo<DetailPaneHost>(
        () => ({ slot: detailSlot, open: detailCount > 0, register: registerDetail }),
        [detailSlot, detailCount, registerDetail]
    );
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

    // ⌘B / Ctrl+B apre e chiude la sidebar (desktop), come Claude e VS Code.
    // Non dentro un campo: lì è il grassetto o una lettera.
    useEffect(() => {
        if (isMobile) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "b") return;
            const target = e.target;
            if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) return;
            e.preventDefault();
            setSidebarCollapsed(v => !v);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
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

    // Le sei sezioni (artifact v4, Alex 2026-10-09), una volta per la sidebar
    // e per le tab della pagina. La sede in vista è quella del path o l'unica;
    // le parti di sede senza una sede in vista vanno nell'ultima usata, o nella prima.
    const viewedActivityId = rememberedSedeId ?? soleActivityId;
    const lastSede = readSedeScopeLocal();
    const defaultActivityId =
        viewedActivityId ??
        (lastSede && readableActivities.some(a => a.id === lastSede) ? lastSede : (readableActivities[0]?.id ?? null));
    const nav = useNavGroups({
        context: navContext,
        activityId: viewedActivityId,
        defaultActivityId,
        loading: !sediLoaded,
        signals: { translationPendingCount, importInProgress, supportUnread }
    });

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
    // Allow-list in `isCanceledAllowedPath`: Abbonamento (no redirect loop, and
    // the post-reactivation return is never trapped before the webhook syncs),
    // the old /subscription, and the billing details at /settings.
    if (
        !loading &&
        selectedTenant &&
        selectedTenant.subscription_status === "canceled" &&
        !isCanceledAllowedPath(pathname, selectedTenant.id)
    ) {
        return <Navigate to={`/business/${selectedTenant.id}/settings/abbonamento`} replace />;
    }

    const sidebarBrand = {
        homeTo: selectedTenant ? `/business/${selectedTenant.id}` : null
    };
    // Notifiche in alto a destra della pagina (Lorenzo, 2026-10-09), non più
    // in cima alla sidebar. Sotto 768 le tiene la testata (`AppHeader`).
    const titleBarActions = isMobile ? undefined : (
        <>
            <AiUsagePill usage={aiUsage.usage} />
            <HeaderNotifications scope="tenant" tenantId={selectedTenant?.id ?? null} />
        </>
    );

    return (
        <div className={styles.appLayout}>
            <DrawerProvider>
                <BreadcrumbProvider>
                    <PageHeaderProvider>
                        <OperationalAlerts />
                        {/* Sul desktop la sidebar va a tutta altezza e prende logo,
                            campanella e dove sei (Officina): la testata resta al telefono. */}
                        {isMobile && (
                            <header className={styles.globalHeader}>
                                <AppHeader
                                    onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
                                    aiUsage={aiUsage.usage}
                                />
                            </header>
                        )}

                        <div className={styles.body}>
                            <TenantSidebar
                                nav={nav}
                                profile={profile}
                                isMobile={isMobile}
                                mobileOpen={mobileSidebarOpen}
                                collapsed={!isMobile && sidebarCollapsed}
                                onRequestClose={() => setMobileSidebarOpen(false)}
                                onToggleCollapse={() => setSidebarCollapsed(v => !v)}
                                brand={sidebarBrand}
                            />

                            <main className={styles.main}>
                                <PageTitleBar actions={titleBarActions} groups={nav.groups} />
                                {/* Il dettaglio dal vivo si apre nell'aside, accanto al
                                    contenuto (D131): la pagina si stringe, non si copre. */}
                                <div className={styles.split}>
                                    <div className={styles.column}>
                                        <PageHeaderSlot scrollContainerRef={contentRef} />
                                        <div ref={contentRef} className={styles.content}>
                                            <SubscriptionBanner />
                                            <DetailPaneHostContext.Provider value={detailHost}>
                                                <Outlet context={outletContext} />
                                            </DetailPaneHostContext.Provider>
                                        </div>
                                    </div>
                                    <aside ref={setDetailSlot} className={styles.detail} aria-label="Dettaglio" />
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
