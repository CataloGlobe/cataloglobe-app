import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    BookOpenText,
    CalendarCheck,
    ClipboardList,
    Copy,
    Download,
    ExternalLink,
    Image as ImageIcon,
    Languages,
    MessageSquare,
    Wand2,
    Palette,
    PauseCircle,
    Pin,
    Users
} from "lucide-react";
import { useTenant } from "@/context/useTenant";
import { useTenantId } from "@/context/useTenantId";
import { usePageHeader } from "@/context/usePageHeader";
import { usePermissions } from "@/context/PermissionsContext";
import { useToast } from "@/context/Toast/ToastContext";
import { canDoOnActivity, isOwnerOrAdmin } from "@/lib/permissions";
import Text from "@/components/ui/Text/Text";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import {
    getTenantCapabilities,
    getTenantSetupStatus,
    type TenantCapabilities,
    type TenantSetupStatus
} from "@/services/supabase/overviewStats";
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
import { Checklist, type ChecklistItem } from "@/components/ui/Checklist/Checklist";
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
    const [setupStatus, setSetupStatus] = useState<FetchStatus>("idle");
    const [setupRetry, setSetupRetry] = useState(0);
    const [capabilities, setCapabilities] = useState<TenantCapabilities | null>(null);
    const [capabilitiesStatus, setCapabilitiesStatus] = useState<FetchStatus>("idle");
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
        setSetupStatus("idle");
        setCapabilities(null);
        setCapabilitiesStatus("idle");
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
            setSetupStatus("loading");
            try {
                const status = await getTenantSetupStatus(tenantId!);
                if (cancelled) return;
                setSetup(status);
                setSetupStatus("ready");
            } catch (error) {
                // Niente toast e niente skeleton perenne: la card lo dichiara
                // con un banner e un «Riprova».
                console.error("[OverviewPage] setup status failed:", error);
                if (cancelled) return;
                setSetupStatus("error");
            }
        }

        loadSetup();
        return () => { cancelled = true; };
    }, [tenantId, canSeeSetup, setupRetry]);

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

    // Le capacità seguono le basi: finché mancano, «Cosa hai attivato»
    // sarebbe un elenco di cose che non puoi ancora usare (§42.1).
    useEffect(() => {
        if (!tenantId || !canSeeSetup || !setupIsComplete) return;
        let cancelled = false;

        async function loadCapabilities() {
            setCapabilitiesStatus("loading");
            try {
                const result = await getTenantCapabilities(tenantId!);
                if (cancelled) return;
                setCapabilities(result);
                setCapabilitiesStatus("ready");
            } catch (error) {
                console.error("[OverviewPage] capabilities failed:", error);
                if (cancelled) return;
                setCapabilitiesStatus("error");
            }
        }

        loadCapabilities();
        return () => { cancelled = true; };
    }, [tenantId, canSeeSetup, setupIsComplete, locationsRetry]);

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
    // successivo. Lo stato è derivato dai dati, niente flag persistiti. Il
    // titolo è l'azione finché il passo è aperto, la constatazione quando è
    // fatto; la descrizione resta solo sui passi aperti.
    const step = (
        id: string,
        done: boolean,
        shortTitle: string,
        doneTitle: string,
        todoTitle: string,
        description: string,
        to: string
    ): ChecklistItem => ({
        id,
        done,
        shortTitle,
        title: done ? doneTitle : todoTitle,
        description: done ? undefined : description,
        onAction: () => navigate(to)
    });
    const checklistItems: ChecklistItem[] = [
        step(
            "location",
            setup?.hasActiveLocation ?? false,
            "Sede",
            "Sede pubblicata",
            // Zero sedi e sede sospesa sono due situazioni diverse: nel secondo
            // caso la sede c'è già e l'azione è riattivarla, non crearne una.
            setup?.hasAnyLocation ? "Pubblica una sede" : "Crea la prima sede",
            setup?.hasAnyLocation
                ? "Hai una sede sospesa: finché resta così, la pagina non è raggiungibile."
                : "È il locale che i clienti raggiungono con il QR.",
            `${b}/locations`
        ),
        step(
            "products",
            setup?.hasProducts ?? false,
            "Prodotti",
            "Prodotti aggiunti",
            "Aggiungi i primi prodotti",
            `Piatti, bevande, prezzi: li crei una volta e li riusi in ogni ${catalogLower}.`,
            `${b}/products`
        ),
        step(
            "catalog",
            setup?.hasPopulatedCatalog ?? false,
            catalogLabel,
            `${catalogLabel} pronto`,
            `Crea un ${catalogLower}`,
            `I prodotti vanno organizzati in un ${catalogLower} per essere mostrati ai clienti.`,
            `${b}/catalogs`
        ),
        step(
            "rule",
            setup?.hasActiveLayoutRule ?? false,
            "Regola",
            "Regola attiva",
            "Attiva una regola",
            `Decide quale ${catalogLower} mostrare in quale sede. Senza, la pagina resta vuota.`,
            `${b}/scheduling`
        )
    ];

    const missingSteps = checklistItems.filter(item => !item.done).length;

    // ── Le basi ──────────────────────────────────────────────────────────────
    let basesBlock = null;
    if (canSeeSetup) {
        if (setupStatus === "error") {
            basesBlock = (
                <Card title="Le basi">
                    <InlineBanner
                        variant="error"
                        action={
                            <Button variant="secondary" size="sm" onClick={() => setSetupRetry(n => n + 1)}>
                                Riprova
                            </Button>
                        }
                    >
                        Non riusciamo a verificare la configurazione.
                    </InlineBanner>
                </Card>
            );
        } else if (setupStatus !== "ready") {
            basesBlock = <Checklist loading items={[]} />;
        } else {
            basesBlock = <Checklist items={checklistItems} />;
        }
    }

    // ── Cosa hai attivato ────────────────────────────────────────────────────
    // Capacità con uno stato, non conteggi: «cosa di questo prodotto sto
    // usando» (§38.3). Nomi = voci di sidebar; Traduzioni è «In arrivo» per
    // definizione (§25.10).
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const capability = (
        key: string,
        icon: ReactNode,
        label: string,
        to: string,
        state: "active" | "todo" | "soon",
        detail: string
    ) => (
        <ListRow
            key={key}
            leading={icon}
            title={label}
            subtitle={detail}
            meta={
                state === "active" ? (
                    <StatusBadge variant="success" label="Attivo" />
                ) : state === "soon" ? (
                    <StatusBadge variant="info" label="In arrivo" />
                ) : (
                    <StatusBadge variant="neutral" label="Non ancora" />
                )
            }
            to={to}
        />
    );
    const c = capabilities;
    const capabilityRows = c
        ? [
              capability(
                  "styles",
                  <Palette size={20} />,
                  businessRouteLabel("styles"),
                  `${b}/styles`,
                  c.styles.active ? "active" : "todo",
                  c.styles.active
                      ? `${plural(c.styles.total, "stile", "stili")}, ${c.styles.inUse} in uso`
                      : `Colori e caratteri della tua pagina, senza toccare i ${catalogLower}.`
              ),
              capability(
                  "featured",
                  <Pin size={20} />,
                  businessRouteLabel("featured"),
                  `${b}/featured`,
                  c.featured.active ? "active" : "todo",
                  c.featured.active
                      ? `${plural(c.featured.published, "contenuto pubblicato", "contenuti pubblicati")} su ${c.featured.total}`
                      : `Un piatto del giorno o una promozione sopra il ${catalogLower}.`
              ),
              capability(
                  "orders",
                  <ClipboardList size={20} />,
                  businessRouteLabel("orders"),
                  `${b}/orders`,
                  c.ordering.active ? "active" : "todo",
                  c.ordering.active
                      ? `attivo su ${plural(c.ordering.locations, "sede", "sedi")} · ${plural(c.ordering.tables, "tavolo", "tavoli")} · ${plural(c.ordering.ordersToday, "ordine oggi", "ordini oggi")}`
                      : "I clienti ordinano dal QR del tavolo, tu vedi le comande live."
              ),
              capability(
                  "reservations",
                  <CalendarCheck size={20} />,
                  businessRouteLabel("reservations"),
                  `${b}/reservations`,
                  c.reservations.active ? "active" : "todo",
                  c.reservations.active
                      ? `attive su ${plural(c.reservations.locations, "sede", "sedi")} · ${c.reservations.pending} in attesa`
                      : "Prenotazioni online dalla pagina pubblica, con promemoria."
              ),
              capability(
                  "reviews",
                  <MessageSquare size={20} />,
                  businessRouteLabel("reviews"),
                  `${b}/reviews`,
                  c.reviews.active ? "active" : "todo",
                  c.reviews.active
                      ? `${plural(c.reviews.total, "ricevuta", "ricevute")}, ${c.reviews.pending} senza risposta`
                      : "La pagina pubblica può chiedere una recensione a fine pasto."
              ),
              capability(
                  "stories",
                  <BookOpenText size={20} />,
                  businessRouteLabel("stories"),
                  `${b}/stories`,
                  c.stories.active ? "active" : "todo",
                  c.stories.active
                      ? plural(c.stories.published, "pubblicata", "pubblicate")
                      : `Racconta il locale con testo e foto, sotto il ${catalogLower}.`
              ),
              capability(
                  "team",
                  <Users size={20} />,
                  businessRouteLabel("team"),
                  `${b}/team`,
                  c.team.active ? "active" : "todo",
                  c.team.active
                      ? plural(c.team.members, "persona", "persone")
                      : "Invita chi lavora con te, con i permessi giusti."
              ),
              capability(
                  "languages",
                  <Languages size={20} />,
                  businessRouteLabel("languages"),
                  `${b}/languages`,
                  "soon",
                  "Per questo il selettore di lingua non fa ancora niente."
              )
          ]
        : null;

    let capabilitiesBody;
    if (capabilitiesStatus === "error") {
        capabilitiesBody = (
            <InlineBanner
                variant="error"
                action={
                    <Button variant="secondary" size="sm" onClick={() => setLocationsRetry(n => n + 1)}>
                        Riprova
                    </Button>
                }
            >
                Non riusciamo a leggere cosa hai attivato.
            </InlineBanner>
        );
    } else if (capabilityRows == null) {
        capabilitiesBody = (
            <div className={styles.capabilities}>
                {[...Array(8)].map((_, i) => <ListRow key={i} loading />)}
            </div>
        );
    } else {
        capabilitiesBody = <div className={styles.capabilities}>{capabilityRows}</div>;
    }

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
            // Le prenotazioni di QUESTA sede, non la pagina d'azienda (§48.1).
            onClick: () => navigate(`${b}/locations/${activityId}/prenotazioni`)
        },
        {
            label: "Disponibilità",
            hidden: !canDoOnActivity(permissions, "product_availability.write", activityId),
            onClick: () => navigate(`${b}/locations/${activityId}/disponibilita`)
        },
        {
            label: "Tavoli",
            hidden: !canDoOnActivity(permissions, "tables.read", activityId),
            onClick: () => navigate(`${b}/locations/${activityId}/sala`)
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
                            <TableRowActions actions={operationalLinks(single.id)} ariaLabel={`Azioni per ${single.name}`} />
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
                                <TableRowActions actions={rowActions(location)} ariaLabel={`Azioni per ${location.name}`} />
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
            {/* ===== D — Configurazione incompleta (§42.1) =====
                Finché le basi mancano, la pagina è solo la checklist. A zero
                sedi la procedura guidata viene prima: è il modo consigliato,
                e il wizard non sa riprendere una sede esistente. */}
            {canSeeSetup && !setupIsComplete && (
                <>
                    {setupStatus === "ready" && !setup?.hasAnyLocation && (
                        <>
                            <EmptyState
                                variant="page"
                                icon={<Wand2 />}
                                title={`Il tuo ${catalogLower} non è ancora online`}
                                description={
                                    missingSteps === 1
                                        ? `Manca un passaggio: resta solo da dire dove e quando mostrare il ${catalogLower}.`
                                        : `Mancano ${missingSteps} passaggi: sede, prodotti, ${catalogLower} e una regola. La procedura guidata li fa in pochi minuti.`
                                }
                                action={
                                    <Button variant="primary" onClick={() => navigate(`${b}/setup`)}>
                                        Inizia la procedura guidata
                                    </Button>
                                }
                            />
                            <Text as="p" variant="caption" colorVariant="muted" className={styles.divider}>
                                Oppure procedi un passo alla volta
                            </Text>
                        </>
                    )}
                    {basesBlock}
                </>
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

            {/* ===== C — Cosa hai attivato: le basi collassate + le capacità ===== */}
            {canSeeSetup && setupIsComplete && (
                <>
                    {basesBlock}
                    <Card title="Cosa hai attivato" flush bodyClassName={styles.rows}>
                        {capabilitiesBody}
                    </Card>
                </>
            )}
        </div>
    );
}
