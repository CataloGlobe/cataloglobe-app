import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    CheckCircle2,
    Circle,
    ChevronRight,
    Copy,
    Download,
    ExternalLink,
    Image as ImageIcon,
    PauseCircle,
    Wand2
} from "lucide-react";
import { useTenant } from "@/context/useTenant";
import { useTenantId } from "@/context/useTenantId";
import { usePageHeader } from "@/context/usePageHeader";
import { usePermissions } from "@/context/PermissionsContext";
import { useToast } from "@/context/Toast/ToastContext";
import { canDoOnActivity, isOwnerOrAdmin } from "@/lib/permissions";
import Text from "@/components/ui/Text/Text";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { getTenantSetupStatus, type TenantSetupStatus } from "@/services/supabase/overviewStats";
import { getActivities } from "@/services/supabase/activities";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import type { V2Activity } from "@/types/activity";
import { formatInactiveReason } from "@/utils/activityStatus";
import { getActiveCatalogForActivities, type ActiveCatalogMeta } from "@/services/supabase/activeCatalog";
import {
    activeCatalogDisplayName,
    deriveActiveCatalogState,
    type ActiveCatalogState,
    type CatalogFetchStatus
} from "@/utils/activeCatalogStatus";
import { QrCode, type QrCodeHandle } from "@/components/ui/QrCode/QrCode";
import { TableRowActions, type TableRowAction } from "@/components/ui/TableRowActions/TableRowActions";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { Checklist } from "@/components/ui/Checklist/Checklist";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { businessRouteLabel } from "@/components/layout/AppHeader/navbarBreadcrumbRoutes";
import { buildPublicUrl } from "@/utils/publicUrl";
import styles from "./OverviewPage.module.scss";

/** Sede attiva raggiungibile dal pubblico. Il menù attivo NON sta qui: arriva
 *  da una fetch separata e molto più lenta (vedi `catalogFetch`). */
type PublicLocation = {
    id: string;
    name: string;
    slug: string;
    publicUrl: string;
};

/** Sede sospesa: esiste, ma adesso non ha una pagina pubblica. Niente `slug`
 *  né `publicUrl` di proposito: un QR qui porterebbe a una vetrina chiusa. */
type SuspendedLocation = {
    id: string;
    name: string;
    /** `null` quando la sospensione non dichiara un motivo. */
    reason: V2Activity["inactive_reason"];
};

type Locations = { active: PublicLocation[]; suspended: SuspendedLocation[] };

/** `idle` = non ancora richiesto (il blocco non si vede); `error` è distinto
 *  da «vuoto», così la pagina dichiara ciò che non ha potuto leggere. */
type FetchStatus = "idle" | "loading" | "ready" | "error";

/**
 * Esito della risoluzione del menù attivo per l'intero blocco. `status` è
 * separato dai dati per non inferire "mappa vuota = nessun menù": una
 * risoluzione fallita e una vetrina spenta non sono la stessa cosa.
 */
type CatalogFetchState = {
    status: CatalogFetchStatus;
    byActivity: Record<string, ActiveCatalogMeta>;
};

/** Con più sedi l'elenco si ferma qui e rimanda a Sedi: in produzione il
 *  massimo è 7, quasi sempre si vede tutto. */
const MAX_VISIBLE_LOCATIONS = 6;

/** Larghezza dello skeleton a pillola del menù in caricamento: la lunghezza
 *  tipica del nome di un catalogo, in difetto (uno più corto non lascia buco). */
const MENU_SKELETON_WIDTH = "110px";

type SetupStep = {
    id: string;
    done: boolean;
    /** Titolo a passo compiuto (constatazione). */
    doneTitle: string;
    /** Titolo a passo da compiere (azione), usato sia per `next` che per `todo`. */
    todoTitle: string;
    description: string;
    to: string;
};

/**
 * Stato lasciato da `SetupWizardPage` all'uscita dal percorso guidato. Vive
 * nella sola navigazione: niente colonne, flag persistiti o storage.
 * - `resumable`        → sede non ancora creata, il percorso si può riprendere
 * - `activity-created` → sede creata, il wizard non riparte (lo blocca il gate)
 */
type SetupExitState = { setupExit?: "resumable" | "activity-created" };

export default function OverviewPage() {
    const { selectedTenant, loading: tenantLoading } = useTenant();
    const tenantId = useTenantId();
    // "Menù" per food & beverage, "Catalogo" per retail/hotel/generic: una
    // parola sola su tutta la pagina.
    const { catalogLabel } = useVerticalConfig();
    const catalogLower = catalogLabel.toLowerCase();
    const navigate = useNavigate();
    const { permissions } = usePermissions();
    const { showToast } = useToast();

    // Uscita dal percorso guidato: `SetupWizardPage` lascia la distinzione nello
    // stato della navigazione. Letti come primitive, non come oggetto: l'intera
    // `location` nelle dipendenze farebbe rientrare l'effect a ogni sua nuova
    // identità, e il reset qui sotto ne produce una.
    const { pathname, state: navigationState } = useLocation();
    const setupExit = (navigationState as SetupExitState | null)?.setupExit ?? null;
    const setupExitShownRef = useRef(false);

    useEffect(() => {
        if (!setupExit || setupExitShownRef.current) return;
        // Il link "Riprendi" ha bisogno del tenant: senza, si aspetta il render
        // in cui arriva invece di bruciare il toast su un'azione monca.
        if (!tenantId) return;

        setupExitShownRef.current = true;

        if (setupExit === "activity-created") {
            // Sede creata: il gate del wizard rimanda indietro chi ne ha già una,
            // quindi qui un "Riprendi" sarebbe un pulsante rotto.
            showToast({
                message: `La tua sede è salvata. ${catalogLabel} e pubblicazione li completi da qui.`,
                type: "success"
            });
        } else {
            showToast({
                message: "Setup interrotto. Puoi riprenderlo quando vuoi.",
                type: "info",
                actionLabel: "Riprendi",
                onAction: () => navigate(`/business/${tenantId}/setup`)
            });
        }

        // Svuota lo stato della history: senza, un ricaricamento della Panoramica
        // rileggerebbe lo stesso `state` e il toast tornerebbe. `replace` per non
        // impilare una voce in più, e il ref regge il doppio invoke di StrictMode
        // nella finestra prima che il reset si propaghi.
        navigate(pathname, { replace: true, state: null });
        // `catalogLabel` entra fra le dipendenze perché il messaggio lo usa: un
        // rientro è innocuo, il ref e il guard su `setupExit` lo fermano subito.
    }, [setupExit, pathname, navigate, showToast, tenantId, catalogLabel]);

    const [setup, setSetup] = useState<TenantSetupStatus | null>(null);
    const [loadingSetup, setLoadingSetup] = useState(true);
    const [locations, setLocations] = useState<Locations | null>(null);
    const [locationsStatus, setLocationsStatus] = useState<FetchStatus>("idle");
    const [locationsRetry, setLocationsRetry] = useState(0);
    const [catalogFetch, setCatalogFetch] = useState<CatalogFetchState>({
        status: "loading",
        byActivity: {}
    });

    // Un handle per sede: ogni QR scarica il proprio file. La mappa è un ref,
    // non uno state — cambiarla non deve far ri-renderizzare la lista.
    const qrRefs = useRef<Record<string, QrCodeHandle | null>>({});
    const setQrRef = useCallback(
        (id: string) => (handle: QrCodeHandle | null) => {
            qrRefs.current[id] = handle;
        },
        []
    );

    /** La copia negli appunti non lascia traccia visibile: il toast è la
     *  ricevuta. `writeText` rifiuta in contesti non sicuri o senza permesso. */
    const handleCopyPublicUrl = useCallback(
        async (url: string) => {
            try {
                await navigator.clipboard.writeText(url);
                showToast({ message: "Link copiato negli appunti.", type: "success" });
            } catch {
                showToast({ message: "Impossibile copiare il link.", type: "error" });
            }
        },
        [showToast]
    );

    // Reset sincrono al cambio tenant, prima del paint. Gli effect girano DOPO
    // il render: senza questo, il primo render sul tenant nuovo rende ancora i
    // dati del precedente. Pattern React "adjusting state when a prop changes".
    const [loadedTenantId, setLoadedTenantId] = useState<string | null>(tenantId);
    if (tenantId !== loadedTenantId) {
        setLoadedTenantId(tenantId);
        setSetup(null);
        setLoadingSetup(true);
        setLocations(null);
        setLocationsStatus("idle");
        setCatalogFetch({ status: "loading", byActivity: {} });
        qrRefs.current = {};
    }

    // La checklist è per owner/admin: per i ruoli activity-scoped i count sono
    // filtrati da RLS e possono valere 0 per mancanza di permesso, indistinguibile
    // da "non configurato". La vetrina invece è per tutti (§38.4): la RLS
    // restringe le sedi a quelle del ruolo senza una riga di codice in più.
    const canSeeSetup = permissions != null && isOwnerOrAdmin(permissions);
    const isScoped = permissions != null && !isOwnerOrAdmin(permissions);

    useEffect(() => {
        if (!tenantId || !canSeeSetup) return;
        let cancelled = false;

        async function loadSetup() {
            setLoadingSetup(true);
            try {
                const status = await getTenantSetupStatus(tenantId!);
                if (cancelled) return;
                setSetup(status);
            } catch (error) {
                console.error("[OverviewPage] setup status failed:", error);
                if (cancelled) return;
                showToast({
                    message: "Non è stato possibile verificare lo stato della configurazione.",
                    type: "error"
                });
            } finally {
                if (!cancelled) setLoadingSetup(false);
            }
        }

        loadSetup();
        return () => { cancelled = true; };
    }, [tenantId, canSeeSetup, showToast]);

    // Le basi complete sono il prerequisito della vetrina per owner/admin
    // (§42.1: finché mancano, la pagina è solo la checklist).
    const setupIsComplete = setup != null
        && setup.hasActiveLocation
        && setup.hasProducts
        && setup.hasPopulatedCatalog
        && setup.hasActiveLayoutRule;
    const showcaseWanted = isScoped || (canSeeSetup && setupIsComplete);

    useEffect(() => {
        if (!tenantId || !showcaseWanted) return;
        let cancelled = false;

        // Due fasi indipendenti, non incatenate: `getActivities` è una query
        // secca e porta già tutto ciò che serve a rendere QR, nome e URL, mentre
        // `getActiveCatalogForActivities` risolve le regole di ogni sede e costa
        // ~1,5s. Attendere la seconda per mostrare la prima terrebbe il blocco
        // vuoto senza motivo.
        async function loadLocations() {
            let active: PublicLocation[];
            setLocationsStatus("loading");

            // ── Fase 1: struttura ────────────────────────────────────────────
            try {
                const activities = await getActivities(tenantId!);
                if (cancelled) return;

                const byName = (a: { name: string }, b: { name: string }) =>
                    a.name.localeCompare(b.name, "it");
                active = activities
                    .filter(activity => activity.status === "active")
                    .sort(byName)
                    .map(activity => ({
                        id: activity.id,
                        name: activity.name,
                        slug: activity.slug,
                        publicUrl: buildPublicUrl(activity.slug)
                    }));
                const suspended = activities
                    .filter(activity => activity.status !== "active")
                    .sort(byName)
                    .map(activity => ({
                        id: activity.id,
                        name: activity.name,
                        reason: activity.inactive_reason
                    }));

                setLocations({ active, suspended });
                setLocationsStatus("ready");
                if (active.length === 0) {
                    // Nessuna sede da risolvere: la fase 2 non parte, ma è
                    // conclusa — non "in errore" e non "in caricamento".
                    setCatalogFetch({ status: "ready", byActivity: {} });
                    return;
                }
            } catch (error) {
                console.error("[OverviewPage] public locations failed:", error);
                if (cancelled) return;
                setLocationsStatus("error");
                return;
            }

            // ── Fase 2: menù attivo per sede ─────────────────────────────────
            // Batch: una sola chiamata per tutte le sedi, mai una per sede.
            try {
                const catalogs = await getActiveCatalogForActivities(
                    tenantId!,
                    active.map(a => a.id)
                );
                if (cancelled) return;
                setCatalogFetch({ status: "ready", byActivity: catalogs });
            } catch (error) {
                // La struttura è già a schermo e resta valida: un fallimento qui
                // degrada solo il badge del menù, non l'intero blocco.
                console.error("[OverviewPage] active catalogs failed:", error);
                if (cancelled) return;
                setCatalogFetch({ status: "error", byActivity: {} });
            }
        }

        loadLocations();
        return () => { cancelled = true; };
    }, [tenantId, showcaseWanted, locationsRetry]);

    const activeCount = locations?.active.length ?? 0;
    // Sottotitolo solo per i ruoli scoped: la RLS non dice quante sedi ha
    // l'azienda in tutto, quindi il testo dice cosa si vede, non cosa manca.
    const scopedSubtitle =
        isScoped && locationsStatus === "ready"
            ? activeCount === 1
                ? "1 sede nel tuo ruolo · le altre non si vedono"
                : `${activeCount} sedi nel tuo ruolo · le altre non si vedono`
            : undefined;

    usePageHeader({ title: "Panoramica", subtitle: scopedSubtitle });

    if (tenantLoading || !selectedTenant || permissions == null) {
        // La forma della pagina che arriva: la vetrina (due righe) e le basi.
        return (
            <div className={styles.page}>
                <Card flush bodyClassName={styles.rows}>
                    <ListRow loading />
                    <ListRow loading />
                </Card>
                <Checklist loading items={[]} />
            </div>
        );
    }

    const b = `/business/${tenantId}`;

    // I passi sono una sequenza, non una lista paritaria: ognuno serve al
    // successivo. Lo stato è derivato dai dati, niente flag persistiti.
    const setupSteps: SetupStep[] = [
        {
            id: "location",
            done: setup?.hasActiveLocation ?? false,
            doneTitle: "Sede pubblicata",
            // Zero sedi e sede sospesa sono due situazioni diverse: nel secondo
            // caso la sede c'è già e l'azione è riattivarla, non crearne una.
            todoTitle: setup?.hasAnyLocation ? "Pubblica una sede" : "Crea la prima sede",
            description: setup?.hasAnyLocation
                ? "Hai una sede sospesa: finché resta così, la pagina non è raggiungibile."
                : "È il locale che i clienti raggiungono con il QR.",
            to: `${b}/locations`
        },
        {
            id: "products",
            done: setup?.hasProducts ?? false,
            doneTitle: "Prodotti aggiunti",
            todoTitle: "Aggiungi i primi prodotti",
            description: `Piatti, bevande, prezzi: li crei una volta e li riusi in ogni ${catalogLower}.`,
            to: `${b}/products`
        },
        {
            id: "catalog",
            done: setup?.hasPopulatedCatalog ?? false,
            doneTitle: `${catalogLabel} pronto`,
            todoTitle: `Crea un ${catalogLower}`,
            description: `I prodotti vanno organizzati in un ${catalogLower} per essere mostrati ai clienti.`,
            to: `${b}/catalogs`
        },
        {
            id: "rule",
            done: setup?.hasActiveLayoutRule ?? false,
            doneTitle: "Regola attiva",
            todoTitle: "Attiva una regola",
            description: `Decide quale ${catalogLower} mostrare in quale sede. Senza, la pagina resta vuota.`,
            to: `${b}/scheduling`
        }
    ];

    const completedSteps = setupSteps.filter(step => step.done).length;
    const missingSteps = setupSteps.length - completedSteps;
    // `next` è la PRIMA voce non soddisfatta: le successive restano spente.
    const nextStepIndex = setupSteps.findIndex(step => !step.done);
    const setupComplete = nextStepIndex === -1;
    const nextStepTag = missingSteps === 1 ? "Ultimo passo" : null;

    // Il blocco compare solo a owner/admin, solo a dati caricati e solo finché
    // c'è qualcosa da fare: a configurazione completa cede il posto alla vetrina.
    const showSetupBlock = canSeeSetup && (loadingSetup || !setupComplete);

    // ── Vetrina ──────────────────────────────────────────────────────────────
    const menuStateFor = (activityId: string): ActiveCatalogState =>
        deriveActiveCatalogState(catalogFetch.status, catalogFetch.byActivity[activityId]);

    /** Stato del menù: puntino + parola, mai il colore da solo. `error` non è
     *  `none`: il badge lo dichiara invece di dire «spento». `loading` non è
     *  uno stato del badge: è uno skeleton a pillola. */
    const menuBadge = (activityId: string) => {
        const state = menuStateFor(activityId);
        if (state === "loading") {
            return <Skeleton height="22px" width={MENU_SKELETON_WIDTH} radius="var(--radius-pill)" />;
        }
        if (state === "resolved") {
            return (
                <StatusBadge
                    variant="success"
                    label={activeCatalogDisplayName(catalogFetch.byActivity[activityId])}
                />
            );
        }
        if (state === "error") return <StatusBadge variant="danger" label="Stato non disponibile" />;
        return <StatusBadge variant="warning" label={`Nessun ${catalogLower} attivo`} />;
    };

    /** «Risolvi» accompagna solo la vetrina accesa senza menù: il guasto
     *  silenzioso del prodotto (§38.3). */
    const resolveButton = (activityId: string) =>
        menuStateFor(activityId) === "none" ? (
            <Button variant="ghost" size="sm" onClick={() => navigate(`${b}/scheduling`)}>
                Risolvi
            </Button>
        ) : null;

    /** Collegamenti operativi per sede (§38.4), filtrati dai permessi di chi
     *  guarda: le pagine della sede stanno nel contesto sede, a tre click da
     *  qui. Nomi = voci di sidebar. */
    const operationalLinks = (activityId: string): TableRowAction[] => [
        {
            label: businessRouteLabel("orders"),
            separator: true,
            hidden: !canDoOnActivity(permissions, "orders.read", activityId),
            onClick: () => navigate(`${b}/orders`)
        },
        {
            label: businessRouteLabel("reservations"),
            hidden: !canDoOnActivity(permissions, "reservations.read", activityId),
            onClick: () => navigate(`${b}/reservations`)
        },
        {
            label: "Disponibilità",
            hidden: !canDoOnActivity(permissions, "product_availability.write", activityId),
            onClick: () => navigate(`${b}/locations/${activityId}?tab=availability`)
        },
        {
            label: "Tavoli",
            hidden: !canDoOnActivity(permissions, "tables.read", activityId),
            onClick: () => navigate(`${b}/locations/${activityId}?tab=sala`)
        }
    ];

    const rowActions = (location: PublicLocation): TableRowAction[] => [
        { label: "Apri", icon: ExternalLink, onClick: () => window.open(location.publicUrl, "_blank", "noopener,noreferrer") },
        { label: "Copia link", icon: Copy, onClick: () => void handleCopyPublicUrl(location.publicUrl) },
        { label: "Scarica QR (PNG)", icon: ImageIcon, onClick: () => void qrRefs.current[location.id]?.downloadPng() },
        { label: "Scarica QR (SVG)", icon: Download, onClick: () => qrRefs.current[location.id]?.downloadSvg() },
        ...operationalLinks(location.id)
    ];

    const publicLink = (location: PublicLocation, className: string, text: string) => (
        <a className={className} href={location.publicUrl} target="_blank" rel="noopener noreferrer">
            {text}
        </a>
    );

    /**
     * Coda del blocco, identica nelle due forme: niente QR né URL, un solo
     * bottone che porta dove si risolve. Nessun cap: le sospese sono una o due,
     * e troncarle in silenzio le farebbe sparire del tutto.
     */
    const suspendedRows = (locations?.suspended ?? []).map(location => {
        // `formatInactiveReason(null)` risponde "Sospesa": qui il motivo si
        // formatta solo se esiste, il badge dice già che è sospesa.
        const reason = location.reason ? formatInactiveReason(location.reason) : undefined;
        return (
            <ListRow
                key={location.id}
                leading={<PauseCircle size={20} className={styles.suspendedIcon} aria-hidden="true" />}
                title={location.name}
                subtitle={reason}
                meta={<StatusBadge variant="danger" label="Sospesa" />}
                trailing={
                    <Button variant="secondary" size="sm" onClick={() => navigate(`${b}/locations/${location.id}`)}>
                        Apri sede
                    </Button>
                }
            />
        );
    });

    const showcaseTitle = isScoped ? "Le tue sedi adesso" : "La vetrina adesso";
    const showcaseSubtitle =
        locationsStatus !== "ready"
            ? undefined
            : isScoped
                ? activeCount === 1 ? "1 sede" : `${activeCount} sedi`
                : activeCount === 1 ? "1 sede pubblicata" : `${activeCount} sedi pubblicate`;
    const hiddenLocationsCount = Math.max(activeCount - MAX_VISIBLE_LOCATIONS, 0);
    const single = activeCount === 1 ? locations!.active[0] : null;

    let showcaseBody;
    if (locationsStatus === "error") {
        showcaseBody = (
            <InlineBanner
                variant="error"
                action={
                    <Button variant="secondary" size="sm" onClick={() => setLocationsRetry(n => n + 1)}>
                        Riprova
                    </Button>
                }
            >
                Non riusciamo a caricare le pagine pubbliche.
            </InlineBanner>
        );
    } else if (locationsStatus !== "ready") {
        showcaseBody = (
            <>
                <ListRow loading />
                <ListRow loading />
            </>
        );
    } else if (activeCount === 0) {
        // Solo per i ruoli scoped: a owner/admin senza sedi attive la pagina
        // mostra la checklist, non la vetrina.
        showcaseBody = (
            <EmptyState
                variant="inline"
                title="Nessuna sede nel tuo ruolo"
                description="Chiedi al proprietario di assegnartene una."
            />
        );
    } else if (single) {
        // Una sede sola (5 aziende su 8): scheda con QR grande e azioni
        // esplicite — nasconderne tre dietro tre puntini non risparmia niente.
        showcaseBody = (
            <>
                <div className={styles.single}>
                    <QrCode
                        ref={setQrRef(single.id)}
                        value={single.publicUrl}
                        size="lg"
                        level="H"
                        label={single.name}
                        fileName={`${single.slug}-qr`}
                        showActions
                        onCopyLink={() => void handleCopyPublicUrl(single.publicUrl)}
                        openHref={single.publicUrl}
                    />
                    <div className={styles.singleInfo}>
                        <Text variant="title-sm" weight={600}>
                            {publicLink(single, styles.name, single.name)}
                        </Text>
                        {publicLink(single, styles.url, single.publicUrl)}
                        <div className={styles.status}>
                            {menuBadge(single.id)}
                            {resolveButton(single.id)}
                        </div>
                        <div className={styles.singleActions}>
                            <TableRowActions actions={operationalLinks(single.id)} />
                        </div>
                    </div>
                </div>
                {suspendedRows}
            </>
        );
    } else {
        showcaseBody = (
            <>
                {locations!.active.slice(0, MAX_VISIBLE_LOCATIONS).map(location => (
                    <ListRow
                        key={location.id}
                        leading={
                            <QrCode
                                ref={setQrRef(location.id)}
                                value={location.publicUrl}
                                size="sm"
                                level="M"
                                fileName={`${location.slug}-qr`}
                            />
                        }
                        title={publicLink(location, styles.name, location.name)}
                        subtitle={publicLink(location, styles.url, location.publicUrl)}
                        meta={menuBadge(location.id)}
                        trailing={
                            <>
                                {resolveButton(location.id)}
                                <TableRowActions actions={rowActions(location)} />
                            </>
                        }
                    />
                ))}
                {suspendedRows}
            </>
        );
    }

    return (
        <div className={styles.page}>
            {/* ===== Section 2 — Configuration Status ===== */}
            {showSetupBlock && (
                <div className={styles.section}>
                    {loadingSetup || !setup ? (
                        <>
                            <Skeleton height="44px" radius="8px" />
                            <div className={styles.configList}>
                                {[...Array(4)].map((_, i) => (
                                    <Skeleton key={i} height="56px" radius="8px" />
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className={styles.setupHeader}>
                                <div className={styles.setupHeading}>
                                    <Text variant="title-sm" weight={600}>
                                        Il tuo {catalogLower} non è ancora online
                                    </Text>
                                    <Text variant="body-sm" colorVariant="muted">
                                        {missingSteps === 1
                                            ? `Manca un passaggio: resta solo da dire dove e quando mostrare il ${catalogLower}.`
                                            : `Mancano ${missingSteps} passaggi. Si fanno in quest'ordine: ognuno serve al successivo.`}
                                    </Text>
                                </div>
                                <div className={styles.setupProgress}>
                                    <Text variant="caption" colorVariant="muted">
                                        {completedSteps} di {setupSteps.length}
                                    </Text>
                                    <div
                                        className={styles.setupProgressTrack}
                                        role="progressbar"
                                        aria-valuenow={completedSteps}
                                        aria-valuemin={0}
                                        aria-valuemax={setupSteps.length}
                                    >
                                        <div
                                            className={styles.setupProgressFill}
                                            style={{ transform: `scaleX(${completedSteps / setupSteps.length})` }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {!setup.hasAnyLocation && (
                                <>
                                    <button
                                        type="button"
                                        className={styles.setupGuided}
                                        onClick={() => navigate(`${b}/setup`)}
                                    >
                                        <span className={styles.setupGuidedIcon} aria-hidden>
                                            <Wand2 size={18} />
                                        </span>
                                        <span className={styles.setupGuidedBody}>
                                            <Text variant="body-sm" weight={600}>
                                                Configura con la procedura guidata
                                            </Text>
                                            <Text variant="caption" colorVariant="muted">
                                                Sede, {catalogLower} e pubblicazione in pochi minuti.
                                            </Text>
                                        </span>
                                        <ChevronRight
                                            size={16}
                                            className={styles.setupGuidedArrow}
                                        />
                                    </button>

                                    <div className={styles.setupDivider}>
                                        <Text variant="caption" colorVariant="muted">
                                            Oppure procedi un passo alla volta
                                        </Text>
                                    </div>
                                </>
                            )}

                            <div
                                className={styles.configList}
                                data-guided={!setup.hasAnyLocation || undefined}
                            >
                                {setupSteps.map((step, i) => {
                                    const state = step.done
                                        ? "done"
                                        : i === nextStepIndex
                                            ? "next"
                                            : "todo";

                                    return (
                                        <button
                                            key={step.id}
                                            className={styles.configItem}
                                            data-state={state}
                                            onClick={() => navigate(step.to)}
                                        >
                                            <span className={styles.configIcon}>
                                                {step.done
                                                    ? <CheckCircle2 size={18} />
                                                    : <Circle size={18} />
                                                }
                                            </span>
                                            <span className={styles.configBody}>
                                                <span className={styles.configTitleRow}>
                                                    <Text variant="body-sm" weight={state === "next" ? 600 : 500}>
                                                        {step.done ? step.doneTitle : step.todoTitle}
                                                    </Text>
                                                    {state === "next" && nextStepTag && (
                                                        <span className={styles.configTag}>{nextStepTag}</span>
                                                    )}
                                                </span>
                                                {!step.done && (
                                                    <Text variant="caption" colorVariant="muted">
                                                        {step.description}
                                                    </Text>
                                                )}
                                            </span>
                                            <ChevronRight size={14} className={styles.configArrow} />
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ===== B — La vetrina adesso ===== */}
            {showcaseWanted && (
                <Card
                    title={showcaseTitle}
                    subtitle={showcaseSubtitle}
                    flush={!single}
                    bodyClassName={single ? undefined : styles.rows}
                    actions={
                        hiddenLocationsCount > 0 ? (
                            <Button variant="ghost" size="sm" onClick={() => navigate(`${b}/locations`)}>
                                Vedi tutte le sedi
                            </Button>
                        ) : undefined
                    }
                >
                    {showcaseBody}
                </Card>
            )}
        </div>
    );
}
