import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    CheckCircle2,
    Circle,
    Plus,
    ChevronRight,
    Download,
    Link as LinkIcon,
    Image as ImageIcon,
    PauseCircle,
    Wand2
} from "lucide-react";
import { useTenant } from "@/context/useTenant";
import { useTenantId } from "@/context/useTenantId";
import { usePageHeader } from "@/context/usePageHeader";
import { usePermissions } from "@/context/PermissionsContext";
import { useToast } from "@/context/Toast/ToastContext";
import { isOwnerOrAdmin } from "@/lib/permissions";
import { supabase } from "@/services/supabase/client";
import Text from "@/components/ui/Text/Text";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { Badge } from "@/components/ui/Badge/Badge";
import { getTenantLogoPublicUrl } from "@/services/supabase/tenants";
import { getTenantSetupStatus, type TenantSetupStatus } from "@/services/supabase/overviewStats";
import { getActivities } from "@/services/supabase/activities";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import type { V2Activity } from "@/types/activity";
import { formatInactiveReason } from "@/utils/activityStatus";
import { getActiveCatalogForActivities, type ActiveCatalogMeta } from "@/services/supabase/activeCatalog";
import {
    ACTIVE_CATALOG_ERROR_LABEL,
    ACTIVE_CATALOG_NONE_LABEL,
    activeCatalogDisplayName,
    deriveActiveCatalogState,
    type ActiveCatalogState,
    type CatalogFetchStatus
} from "@/utils/activeCatalogStatus";
import { QrCode, type QrCodeHandle } from "@/components/ui/QrCode/QrCode";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { Button } from "@/components/ui/Button/Button";
import { buildPublicUrl } from "@/utils/publicUrl";
import { SUBTYPE_LABELS, VERTICAL_LABELS } from "@/constants/verticalTypes";
import styles from "./OverviewPage.module.scss";

const AVATAR_PALETTE = [
    { bg: "#ede9fe", text: "#7c3aed" },
    { bg: "#dbeafe", text: "#1d4ed8" },
    { bg: "#d1fae5", text: "#065f46" },
    { bg: "#fef3c7", text: "#b45309" },
    { bg: "#fce7f3", text: "#be185d" },
    { bg: "#e0f2fe", text: "#0369a1" }
];

function avatarColors(name: string) {
    return AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length];
}

interface Stats {
    locations: number;
    products: number;
    catalogs: number;
    featuredContents: number;
    schedules: number;
}

/** Sede attiva raggiungibile dal pubblico. Il menù attivo NON sta qui: arriva
 *  da una fetch separata e molto più lenta (vedi `catalogFetch`). */
type PublicLocation = {
    id: string;
    name: string;
    slug: string;
    publicUrl: string;
};

/**
 * Sede sospesa: esiste, ma adesso non ha una pagina pubblica.
 *
 * Niente `slug` né `publicUrl` nel tipo, di proposito: un QR o un link qui
 * porterebbero a una pagina che non risponde, e il blocco starebbe promettendo
 * una vetrina chiusa.
 */
type SuspendedLocation = {
    id: string;
    name: string;
    /** Valore grezzo dal DB: `null` quando la sospensione non dichiara un
     *  motivo. Formattato solo al momento di renderlo. */
    reason: V2Activity["inactive_reason"];
};

/**
 * Esito della risoluzione del menù attivo per l'intero blocco.
 *
 * `status` è tenuto separato dai dati proprio per non ricadere nell'inferenza
 * "mappa vuota = nessun menù": una risoluzione fallita e una vetrina davvero
 * spenta producevano lo stesso stato, e la pagina dichiarava spento ciò che non
 * aveva potuto leggere.
 */
type CatalogFetchState = {
    status: CatalogFetchStatus;
    byActivity: Record<string, ActiveCatalogMeta>;
};

/**
 * Larghezza del placeholder, in px assoluti.
 *
 * NON in percentuale: `.menuLine` è un flex item senza `flex-grow` né `width`,
 * quindi la sua larghezza dipende dal contenuto. Una percentuale si risolverebbe
 * su un contenitore a larghezza indefinita e collasserebbe a 0 — placeholder
 * invisibile. 110px è la lunghezza tipica del nome di un catalogo (10-16
 * caratteri a `caption`/`body-sm`), leggermente in difetto: uno skeleton più
 * corto del testo che arriva non lascia buco, uno più lungo sì.
 */
const MENU_SKELETON_WIDTH = "110px";

/**
 * Placeholder della riga "menù attivo", reso DENTRO lo stesso `<Text>` che
 * ospiterà il testo finale.
 *
 * L'altezza non è mai in px: lo skeleton è inline-block alto `1em`, quindi
 * l'altezza della riga resta quella dello strut del paragrafo — il line-height
 * della variante tipografica. Cambiando `body-sm` o `caption` l'allineamento
 * segue da sé, senza costanti da riallineare a mano.
 */
function MenuLineSkeleton({ width }: { width: string }) {
    return <Skeleton height="1em" width={width} radius="6px" className={styles.menuLineSkeleton} />;
}

/**
 * Le due forme della riga pubblica: scheda (sede unica) ed elenco (più sedi).
 *
 * Prima queste differenze erano dedotte da `qrSize > 60` sparso in tre punti
 * del JSX: una misura in px usata come nome in codice della variante. Qui la
 * variante è dichiarata e le differenze discendono da lei, così aggiungerne una
 * quarta non richiede di ricordarsi della soglia.
 */
const PUBLIC_ROW_VARIANTS = {
    card: {
        qrSize: 104,
        // QR grande: la correzione alta regge un logo sovrapposto e la stampa.
        qrLevel: "H",
        nameVariant: "title-sm",
        statusVariant: "body-sm"
    },
    list: {
        qrSize: 42,
        // A 42px la ridondanza di livello H mangerebbe i moduli: 'M' resta
        // leggibile a schermo, che è l'unico uso di questa taglia.
        qrLevel: "M",
        nameVariant: "body-sm",
        statusVariant: "caption"
    }
} as const;

type PublicRowVariant = keyof typeof PUBLIC_ROW_VARIANTS;

/** Elementi che gestiscono il proprio click: la riga non deve rubarglielo.
 *  Stesso elenco di `DataTable` — l'`a` dell'URL e il trigger del menu ⋯
 *  restano quindi indipendenti senza bisogno di `stopPropagation` sparsi. */
const NESTED_INTERACTIVE_SELECTOR =
    'button, a, input, select, textarea, [role="menuitem"], [data-row-click-ignore="true"]';

/**
 * Riga di una pagina pubblica: QR · info · azioni.
 *
 * Usata da ENTRAMBE le varianti del blocco. La differenza è una sola prop
 * (`variant`), da cui discendono taglia del QR, cornice, livello di correzione
 * e scala tipografica: tenerle in un solo componente rende il disallineamento
 * impossibile per costruzione invece che per disciplina — etichette, ordine e
 * stile delle azioni non possono divergere.
 *
 * L'intera riga apre la pagina pubblica. È l'azione che il gestore compie ogni
 * volta: chiederle un bersaglio da 100px quando la riga intera è disponibile
 * sarebbe avarizia di superficie, soprattutto su telefono.
 */
function PublicLocationRow({
    location,
    variant,
    qrRef,
    onOpen,
    onCopyLink,
    onDownloadPng,
    onDownloadSvg,
    menuState,
    menuName
}: {
    location: PublicLocation;
    variant: PublicRowVariant;
    qrRef: (handle: QrCodeHandle | null) => void;
    onOpen: () => void;
    onCopyLink: () => void;
    onDownloadPng: () => void;
    onDownloadSvg: () => void;
    menuState: ActiveCatalogState;
    menuName: string | null;
}) {
    const v = PUBLIC_ROW_VARIANTS[variant];

    return (
        // Il click di riga è una comodità per il mouse; la tastiera passa dal
        // link vero sul nome. `DataTable` non offriva un pattern da riusare: la
        // sua riga cliccabile è solo `onClick`, quindi muta per chi non ha un
        // mouse. Un `role="link"` sul contenitore avrebbe annidato un `<a>` e un
        // `<button>` dentro un collegamento — ARIA finto con dentro interattivi
        // veri, la cosa peggiore delle due.
        <div
            className={styles.publicRow}
            data-variant={variant}
            onClick={event => {
                const target = event.target as HTMLElement | null;
                if (target?.closest(NESTED_INTERACTIVE_SELECTOR)) return;
                onOpen();
            }}
        >
            <span className={variant === "card" ? styles.qrFrame : styles.qrFrameSm}>
                <QrCode
                    ref={qrRef}
                    value={location.publicUrl}
                    size={v.qrSize}
                    level={v.qrLevel}
                    fileName={`${location.slug}-qr`}
                />
            </span>

            <span className={styles.publicRowBody}>
                <Text variant={v.nameVariant} weight={600}>
                    {/* Il nome È il collegamento: Tab lo raggiunge, Invio lo
                        apre, il ring di focus lo prende la riga intera. */}
                    <a
                        className={styles.publicRowName}
                        href={location.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {location.name}
                    </a>
                </Text>
                <a
                    className={styles.publicRowUrl}
                    href={location.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {location.publicUrl}
                </a>
                <MenuStatusLine variant={v.statusVariant} state={menuState} menuName={menuName} />
            </span>

            <span className={styles.publicRowActions}>
                {/* Trigger sempre visibile, mai on-hover: su telefono l'hover
                    non esiste, e un'azione che non si trova non esiste. */}
                <TableRowActions
                    actions={[
                        { label: "Copia link", icon: LinkIcon, onClick: onCopyLink },
                        { label: "Scarica QR (PNG)", icon: ImageIcon, onClick: onDownloadPng },
                        { label: "Scarica QR (SVG)", icon: Download, onClick: onDownloadSvg }
                    ]}
                />
            </span>
        </div>
    );
}

/**
 * Riga di una sede sospesa.
 *
 * Deliberatamente più povera della riga pubblicata: niente QR, niente URL,
 * nessun click sull'intera riga. Una sede sospesa non ha una pagina pubblica —
 * darle gli stessi appigli significherebbe offrire di scaricare il QR di una
 * vetrina chiusa. L'unica azione è esplicita e porta dove si risolve il
 * problema, cioè al dettaglio della sede.
 */
function SuspendedLocationRow({
    location,
    onOpen
}: {
    location: SuspendedLocation;
    onOpen: () => void;
}) {
    // `formatInactiveReason(null)` risponde "Sospesa": usarlo qui produrrebbe
    // "Bar Porto è sospesa · Sospesa". Il motivo si formatta solo se esiste.
    const reason = location.reason ? formatInactiveReason(location.reason) : null;

    return (
        <div className={styles.suspendedRow}>
            <span className={styles.suspendedIcon} aria-hidden="true">
                <PauseCircle size={16} strokeWidth={2} />
            </span>

            <Text variant="body-sm" colorVariant="muted" className={styles.suspendedText}>
                <strong className={styles.suspendedName}>{location.name}</strong> è sospesa
                {reason ? ` · ${reason}` : ""}
            </Text>

            <Button variant="secondary" size="sm" onClick={onOpen}>
                Apri sede
            </Button>
        </div>
    );
}

/**
 * Riga di stato del menù: puntino + testo, mai il colore da solo.
 *
 * `DESIGN.md` fissa la regola per gli stati semantici ("color is always paired
 * with a dot + label") e la misura del puntino (6px); qui è applicata inline
 * invece che con `StatusBadge`, perché una pill sopra ogni riga dell'elenco
 * peserebbe più dell'informazione che porta.
 */
function MenuStatusLine({
    variant,
    state,
    menuName
}: {
    variant: "body-sm" | "caption";
    /** Quattro stati distinti: `error` non è `none`. */
    state: ActiveCatalogState;
    /** Valorizzato solo a stato `resolved`. */
    menuName: string | null;
}) {
    // Il puntino ha uno stato dedicato per l'errore: riusare "off" (vetrina
    // spenta) direbbe una cosa falsa col colore, che è il canale letto per primo.
    const dotState =
        state === "resolved" ? "live" : state === "none" ? "off" : state === "error" ? "unknown" : "loading";

    return (
        <span className={styles.statusLine}>
            <span className={styles.statusDot} data-state={dotState} aria-hidden="true" />
            {/* `as="span"`: lo skeleton è un <div>, che dentro un <p> sarebbe
                HTML invalido (hydration error). */}
            <Text as="span" variant={variant} colorVariant="muted" className={styles.menuLine}>
                {state === "loading" ? (
                    <MenuLineSkeleton width={MENU_SKELETON_WIDTH} />
                ) : state === "error" ? (
                    ACTIVE_CATALOG_ERROR_LABEL
                ) : state === "resolved" ? (
                    <strong className={styles.menuName}>{menuName}</strong>
                ) : (
                    ACTIVE_CATALOG_NONE_LABEL
                )}
            </Text>
        </span>
    );
}

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
    // "Menù" per food & beverage, "Catalogo" per retail/hotel/generic: la
    // pagina non può dire una parola nella checklist e l'altra nelle
    // statistiche, o si contraddice da sola sulla stessa schermata.
    const { catalogLabel, catalogLabelPlural } = useVerticalConfig();
    const catalogLower = catalogLabel.toLowerCase();
    const catalogLowerPlural = catalogLabelPlural.toLowerCase();
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

    const [stats, setStats] = useState<Stats | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);
    const [setup, setSetup] = useState<TenantSetupStatus | null>(null);
    const [loadingSetup, setLoadingSetup] = useState(true);
    const [publicLocations, setPublicLocations] = useState<PublicLocation[] | null>(null);
    const [catalogFetch, setCatalogFetch] = useState<CatalogFetchState>({
        status: "loading",
        byActivity: {}
    });
    /** Sedi non pubblicate. Ricavate dalla stessa `getActivities` già chiamata
     *  per le sedi attive — `select("*")`, quindi il motivo arriva senza una
     *  query in più. Prima qui viveva solo un contatore: un numero dice che
     *  qualcosa è fermo, non quale sede né perché. */
    const [suspendedLocations, setSuspendedLocations] = useState<SuspendedLocation[]>([]);

    // Un handle per sede: ogni QR scarica il proprio file. La mappa è un ref,
    // non uno state — cambiarla non deve far ri-renderizzare la lista.
    const qrRefs = useRef<Record<string, QrCodeHandle | null>>({});
    const setQrRef = useCallback(
        (id: string) => (handle: QrCodeHandle | null) => {
            qrRefs.current[id] = handle;
        },
        []
    );

    const handleOpenPublicPage = useCallback((url: string) => {
        window.open(url, "_blank", "noopener,noreferrer");
    }, []);

    /** La copia negli appunti non lascia traccia visibile: senza conferma il
     *  gestore non sa se è successo e ripete il gesto. Il toast è la ricevuta.
     *  `writeText` rifiuta in contesti non sicuri o senza permesso — il catch
     *  non è teorico. */
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
    // dati del precedente — nome sede, URL pubblico e variante del blocco di un
    // altro tenant. Azzerare dentro l'effect non basterebbe, lascerebbe comunque
    // un frame con i dati sbagliati.
    // Pattern React "adjusting state when a prop changes".
    const [loadedTenantId, setLoadedTenantId] = useState<string | null>(tenantId);
    if (tenantId !== loadedTenantId) {
        setLoadedTenantId(tenantId);
        setStats(null);
        setLoadingStats(true);
        setSetup(null);
        setLoadingSetup(true);
        setPublicLocations(null);
        setCatalogFetch({ status: "loading", byActivity: {} });
        setSuspendedLocations([]);
        qrRefs.current = {};
    }

    usePageHeader({ title: "Panoramica", sticky: true });

    // La checklist è per owner/admin: per i ruoli activity-scoped i count sono
    // filtrati da RLS e possono valere 0 per mancanza di permesso, indistinguibile
    // da "non configurato".
    const canSeeSetup = permissions != null && isOwnerOrAdmin(permissions);

    // Totali grezzi per l'header e le Statistiche rapide. Restano count
    // "quanti ce ne sono", distinti dai criteri severi della checklist.
    useEffect(() => {
        if (!tenantId) return;
        let cancelled = false;

        async function loadStats() {
            setLoadingStats(true);
            const [locations, products, catalogs, featuredContents, schedules] = await Promise.all([
                supabase.from("activities").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!),
                supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!),
                supabase.from("catalogs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!),
                supabase.from("featured_contents").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!),
                supabase.from("schedules").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!)
            ]);
            // Cambio tenant rapido: una risposta tardiva non deve scrivere sullo
            // stato del tenant nuovo.
            if (cancelled) return;
            setStats({
                locations: locations.count ?? 0,
                products: products.count ?? 0,
                catalogs: catalogs.count ?? 0,
                featuredContents: featuredContents.count ?? 0,
                schedules: schedules.count ?? 0
            });
            setLoadingStats(false);
        }

        loadStats();
        return () => { cancelled = true; };
    }, [tenantId]);

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

    // Il setup completo è il prerequisito: finché la checklist ha voci aperte
    // questo blocco non si vede, quindi non ne paghiamo il costo.
    const setupIsComplete = setup != null
        && setup.hasActiveLocation
        && setup.hasProducts
        && setup.hasPopulatedCatalog
        && setup.hasActiveLayoutRule;

    useEffect(() => {
        if (!tenantId || !canSeeSetup || !setupIsComplete) return;
        let cancelled = false;

        // Due fasi indipendenti, non incatenate: `getActivities` è una query
        // secca e porta già tutto ciò che serve a rendere QR, nome e URL, mentre
        // `getActiveCatalogForActivities` risolve le regole di ogni sede e costa
        // ~1,5s. Attendere la seconda per mostrare la prima terrebbe il blocco
        // vuoto senza motivo.
        async function loadPublicLocations() {
            let active: PublicLocation[];

            // ── Fase 1: struttura ────────────────────────────────────────────
            try {
                const activities = await getActivities(tenantId!);
                if (cancelled) return;

                setSuspendedLocations(
                    activities
                        .filter(activity => activity.status !== "active")
                        .sort((a, b) => a.name.localeCompare(b.name, "it"))
                        .map(activity => ({
                            id: activity.id,
                            name: activity.name,
                            reason: activity.inactive_reason
                        }))
                );

                active = activities
                    .filter(activity => activity.status === "active")
                    .sort((a, b) => a.name.localeCompare(b.name, "it"))
                    .map(activity => ({
                        id: activity.id,
                        name: activity.name,
                        slug: activity.slug,
                        publicUrl: buildPublicUrl(activity.slug)
                    }));

                setPublicLocations(active);
                if (active.length === 0) {
                    // Nessuna sede da risolvere: la fase 2 non parte, ma è
                    // conclusa — non "in errore" e non "in caricamento".
                    setCatalogFetch({ status: "ready", byActivity: {} });
                    return;
                }
            } catch (error) {
                console.error("[OverviewPage] public locations failed:", error);
                if (cancelled) return;
                showToast({
                    message: "Non è stato possibile caricare le pagine pubbliche.",
                    type: "error"
                });
                return;
            }

            // ── Fase 2: menù attivo per sede ─────────────────────────────────
            // Batch: una sola chiamata per tutte le sedi, mai una per sede.
            // Riusa il resolver frontend, nessuna logica duplicata qui.
            try {
                const catalogs = await getActiveCatalogForActivities(
                    tenantId!,
                    active.map(a => a.id)
                );
                if (cancelled) return;
                setCatalogFetch({ status: "ready", byActivity: catalogs });
            } catch (error) {
                // La struttura è già a schermo e resta valida: un fallimento qui
                // degrada solo la riga del menù, non l'intero blocco. Lo stato
                // resta `error` — la riga lo dichiara invece di mostrare "spento".
                console.error("[OverviewPage] active catalogs failed:", error);
                if (cancelled) return;
                setCatalogFetch({ status: "error", byActivity: {} });
            }
        }

        loadPublicLocations();
        return () => { cancelled = true; };
    }, [tenantId, canSeeSetup, setupIsComplete, showToast]);

    if (tenantLoading || !selectedTenant) {
        return (
            <div className={styles.page}>
                <Skeleton height="80px" radius="12px" />
                <Skeleton height="160px" radius="12px" />
                <div className={styles.kpiGrid}>
                    {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} height="88px" radius="10px" />
                    ))}
                </div>
            </div>
        );
    }

    const b = `/business/${tenantId}`;
    const verticalLabel = (selectedTenant.business_subtype && SUBTYPE_LABELS[selectedTenant.business_subtype])
        ?? VERTICAL_LABELS[selectedTenant.vertical_type]
        ?? selectedTenant.vertical_type;
    const { bg, text } = avatarColors(selectedTenant.name);
    const initial = selectedTenant.name.charAt(0).toUpperCase();

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
    // Tag sulla voce `next`: resta solo la chiusura della sequenza. L'"Inizia da
    // qui" sul primo passo è caduto quando la procedura guidata è salita in cima
    // alla card: due punti d'inizio in concorrenza, e quello manuale non è
    // nemmeno il consigliato.
    const nextStepTag = missingSteps === 1 ? "Ultimo passo" : null;

    // Il blocco compare solo a owner/admin, solo a dati caricati e solo finché
    // c'è qualcosa da fare: a configurazione completa cede il posto al blocco
    // delle pagine pubbliche.
    const showSetupBlock = canSeeSetup && (loadingSetup || !setupComplete);

    // Con una sola sede la card porta il QR; con più sedi diventa un elenco,
    // perché non esiste una sede "principale" da cui prendere il QR.
    const MAX_VISIBLE_LOCATIONS = 6;
    // `setupIsComplete` (non `setupComplete`) è la stessa condizione che governa
    // la fetch: usarla qui evita che il blocco compaia in una combinazione di
    // stato che l'effect non ha ancora coperto. `!loadingSetup` chiude il caso
    // del ricaricamento della checklist su un tenant appena selezionato.
    const showPublicBlock =
        canSeeSetup
        && !loadingSetup
        && setupIsComplete
        && publicLocations != null
        && publicLocations.length > 0;
    const singleLocation = publicLocations?.length === 1 ? publicLocations[0] : null;
    // Stato per-sede: la riga del menù non deriva più dalla sola presenza della
    // mappa, così "non risolto" e "nessun menù" restano due cose diverse.
    const menuStateFor = (activityId: string): ActiveCatalogState =>
        deriveActiveCatalogState(catalogFetch.status, catalogFetch.byActivity[activityId]);
    const menuNameFor = (activityId: string): string | null =>
        menuStateFor(activityId) === "resolved"
            ? activeCatalogDisplayName(catalogFetch.byActivity[activityId])
            : null;
    const visibleLocations = publicLocations?.slice(0, MAX_VISIBLE_LOCATIONS) ?? [];
    // Solo le pubblicate: le sospese non sono più un numero qui, sono righe con
    // un nome e un motivo in fondo al blocco. Ripeterne il conteggio a due
    // righe di distanza sarebbe la stessa notizia data due volte, peggio.
    const publishedCount = publicLocations?.length ?? 0;
    const locationsSummary =
        publishedCount === 1 ? "1 sede pubblicata" : `${publishedCount} sedi pubblicate`;
    const hiddenLocationsCount = Math.max(
        (publicLocations?.length ?? 0) - MAX_VISIBLE_LOCATIONS,
        0
    );

    /**
     * Coda del blocco, identica nelle due varianti: un tenant con una sola sede
     * pubblicata e una sospesa deve vedere la seconda esattamente come chi ne
     * ha dieci.
     *
     * Nessun gate di permesso sull'azione: l'intero blocco è già dietro
     * `canSeeSetup` (`isOwnerOrAdmin`), quindi chi legge questa riga ha scope
     * tenant-wide e la pagina sede non ha un gate di lettura proprio — le sue
     * azioni si proteggono da sole con `activity.manage`. Aggiungerne uno qui
     * sarebbe una guardia che non può mai scattare.
     *
     * Nessun cap: le sospese sono normalmente una o due, e da quando l'header
     * non le conta più, troncarle in silenzio le farebbe sparire del tutto.
     */
    const suspendedBlock =
        suspendedLocations.length > 0 ? (
            <div className={styles.suspendedList}>
                {suspendedLocations.map(location => (
                    <SuspendedLocationRow
                        key={location.id}
                        location={location}
                        onOpen={() => navigate(`${b}/locations/${location.id}`)}
                    />
                ))}
            </div>
        ) : null;

    const quickActions = [
        { label: "Nuovo prodotto", to: `${b}/products` },
        { label: `Nuovo ${catalogLower}`, to: `${b}/catalogs` },
        { label: "Nuova programmazione", to: `${b}/scheduling` },
        { label: "Nuovo contenuto in evidenza", to: `${b}/featured` }
    ];

    return (
        <div className={styles.page}>
            {/* ===== Section 1 — Business Header ===== */}
            <div className={styles.section}>
                <div className={styles.businessHeader}>
                    {selectedTenant.logo_url ? (
                        <img
                            src={getTenantLogoPublicUrl(selectedTenant.logo_url)}
                            alt={`Logo ${selectedTenant.name}`}
                            className={styles.businessAvatarImg}
                        />
                    ) : (
                        <div className={styles.businessAvatar} style={{ background: bg, color: text }}>
                            {initial}
                        </div>
                    )}
                    <div className={styles.businessInfo}>
                        <Text variant="title-md" weight={700}>{selectedTenant.name}</Text>
                        <div style={{ marginTop: 6 }}>
                            <Badge variant="secondary">{verticalLabel}</Badge>
                        </div>
                        {!loadingStats && stats && (
                            <Text variant="body-sm" colorVariant="muted" style={{ marginTop: 8 }}>
                                {stats.locations} {stats.locations === 1 ? "sede" : "sedi"}&nbsp;&bull;&nbsp;
                                {stats.products} prodotti&nbsp;&bull;&nbsp;
                                {stats.catalogs} {stats.catalogs === 1 ? catalogLower : catalogLowerPlural}
                            </Text>
                        )}
                    </div>
                </div>
            </div>

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

                            {/* Percorso consigliato in testa, non in coda: chi
                                arriva qui senza sedi ha davanti quattro
                                passaggi manuali, e la guida era una didascalia
                                in fondo che nessuno leggeva come azione.
                                Solo a zero sedi: la procedura parte sempre
                                dalla creazione di una sede e non sa riprenderne
                                una esistente. */}
                            {!setup.hasAnyLocation && (
                                <>
                                    {/* Blocco, non barra: `Button fullWidth` in una
                                        card larga lasciava l'etichetta a galleggiare
                                        al centro di un vuoto, con la riga di supporto
                                        staccata sotto come una didascalia orfana.
                                        Stessa anatomia delle voci della checklist —
                                        icona, testo, chevron — così i due modi di
                                        procedere si leggono come parenti. */}
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

                            {/* Stessa condizione del pulsante: con la guida in
                                cima la voce `next` rinuncia all'evidenziazione,
                                che competerebbe con lei. Senza guida la
                                checklist è l'unico contenuto e la mantiene. */}
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

            {/* ===== Section 2b — Tutto pronto: pagine pubbliche ===== */}
            {showPublicBlock && singleLocation && (
                <div className={styles.section}>
                    <div className={styles.publicHeader}>
                        <Text variant="title-sm" weight={600}>La tua pagina pubblica</Text>
                        <Text variant="caption" colorVariant="muted">Aggiornata in tempo reale</Text>
                    </div>

                    <div className={styles.publicList}>
                        <PublicLocationRow
                            location={singleLocation}
                            variant="card"
                            qrRef={setQrRef(singleLocation.id)}
                            onOpen={() => handleOpenPublicPage(singleLocation.publicUrl)}
                            onCopyLink={() => void handleCopyPublicUrl(singleLocation.publicUrl)}
                            onDownloadPng={() =>
                                void qrRefs.current[singleLocation.id]?.downloadPng()
                            }
                            onDownloadSvg={() => qrRefs.current[singleLocation.id]?.downloadSvg()}
                            menuState={menuStateFor(singleLocation.id)}
                            menuName={menuNameFor(singleLocation.id)}
                        />
                    </div>

                    {suspendedBlock}
                </div>
            )}

            {showPublicBlock && !singleLocation && (
                <div className={styles.section}>
                    <div className={styles.publicHeader}>
                        <Text variant="title-sm" weight={600}>Le tue pagine pubbliche</Text>
                        <Text variant="caption" colorVariant="muted">{locationsSummary}</Text>
                    </div>

                    <div className={styles.publicList}>
                        {visibleLocations.map(location => (
                            <PublicLocationRow
                                key={location.id}
                                location={location}
                                variant="list"
                                qrRef={setQrRef(location.id)}
                                onOpen={() => handleOpenPublicPage(location.publicUrl)}
                                onCopyLink={() => void handleCopyPublicUrl(location.publicUrl)}
                                onDownloadPng={() => void qrRefs.current[location.id]?.downloadPng()}
                                onDownloadSvg={() => qrRefs.current[location.id]?.downloadSvg()}
                                menuState={menuStateFor(location.id)}
                                menuName={menuNameFor(location.id)}
                            />
                        ))}
                    </div>

                    {suspendedBlock}

                    {hiddenLocationsCount > 0 && (
                        <button
                            className={styles.publicMore}
                            onClick={() => navigate(`${b}/locations`)}
                        >
                            Vedi tutte le sedi
                            <ChevronRight size={14} />
                        </button>
                    )}
                </div>
            )}

            {/* ===== Section 3 — Quick Stats ===== */}
            <div className={styles.section}>
                <Text variant="title-sm" weight={600}>Statistiche rapide</Text>
                <div className={styles.kpiGrid}>
                    <StatCard label="Sedi" value={stats?.locations} loading={loadingStats} />
                    <StatCard label="Prodotti" value={stats?.products} loading={loadingStats} />
                    <StatCard label={catalogLabelPlural} value={stats?.catalogs} loading={loadingStats} />
                    <StatCard label="Programmi" value={stats?.schedules} loading={loadingStats} />
                    <StatCard label="Contenuti in evidenza" value={stats?.featuredContents} loading={loadingStats} />
                </div>
            </div>

            {/* ===== Section 4 — Quick Actions ===== */}
            <div className={styles.section}>
                <Text variant="title-sm" weight={600}>Azioni rapide</Text>
                <div className={styles.actionsGrid}>
                    {quickActions.map((action, i) => (
                        <button
                            key={i}
                            className={styles.actionBtn}
                            onClick={() => navigate(action.to)}
                        >
                            <Plus size={14} />
                            {action.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    loading
}: {
    label: string;
    value: number | undefined;
    loading: boolean;
}) {
    return (
        <div className={styles.kpiCard}>
            <Text variant="caption" colorVariant="muted">{label}</Text>
            {loading
                ? <Skeleton height="28px" width="40px" radius="6px" />
                : <Text variant="title-md" weight={600}>{value ?? 0}</Text>
            }
        </div>
    );
}
