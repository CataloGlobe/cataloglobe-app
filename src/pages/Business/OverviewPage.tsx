import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, Plus, ChevronRight, ExternalLink } from "lucide-react";
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
import { getActiveCatalogForActivities } from "@/services/supabase/activeCatalog";
import { QrCode } from "@/components/ui/QrCode/QrCode";
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
 *  da una fetch separata e molto più lenta (vedi `catalogNames`). */
type PublicLocation = {
    id: string;
    name: string;
    slug: string;
    publicUrl: string;
};

/** Nome del catalogo risolto ORA, per activity id. Il valore è `null` quando
 *  nessuna regola copre questo istante (es. regola solo serale, guardata di
 *  mattina); la MAPPA è `null` finché la risoluzione è in corso. */
type CatalogNameByActivity = Record<string, string | null>;

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

export default function OverviewPage() {
    const { selectedTenant, loading: tenantLoading } = useTenant();
    const tenantId = useTenantId();
    const navigate = useNavigate();
    const { permissions } = usePermissions();
    const { showToast } = useToast();

    const [stats, setStats] = useState<Stats | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);
    const [setup, setSetup] = useState<TenantSetupStatus | null>(null);
    const [loadingSetup, setLoadingSetup] = useState(true);
    const [publicLocations, setPublicLocations] = useState<PublicLocation[] | null>(null);
    const [catalogNames, setCatalogNames] = useState<CatalogNameByActivity | null>(null);

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
        setCatalogNames(null);
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
                    setCatalogNames({});
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
                const catalogs = await getActiveCatalogForActivities(active.map(a => a.id));
                if (cancelled) return;

                const names: CatalogNameByActivity = {};
                for (const location of active) {
                    names[location.id] = catalogs[location.id]?.catalogName ?? null;
                }
                setCatalogNames(names);
            } catch (error) {
                // La struttura è già a schermo e resta valida: un fallimento qui
                // toglie solo la riga del menù, non l'intero blocco.
                console.error("[OverviewPage] active catalogs failed:", error);
                if (cancelled) return;
                setCatalogNames({});
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
            description: "Piatti, bevande, prezzi: li crei una volta e li riusi in ogni menù.",
            to: `${b}/products`
        },
        {
            id: "catalog",
            done: setup?.hasPopulatedCatalog ?? false,
            doneTitle: "Menù pronto",
            todoTitle: "Crea un menù",
            description: "I prodotti vanno organizzati in un menù per essere mostrati ai clienti.",
            to: `${b}/catalogs`
        },
        {
            id: "rule",
            done: setup?.hasActiveLayoutRule ?? false,
            doneTitle: "Regola attiva",
            todoTitle: "Attiva una regola",
            description: "Decide quale menù mostrare in quale sede. Senza, la pagina resta vuota.",
            to: `${b}/scheduling`
        }
    ];

    const completedSteps = setupSteps.filter(step => step.done).length;
    const missingSteps = setupSteps.length - completedSteps;
    // `next` è la PRIMA voce non soddisfatta: le successive restano spente.
    const nextStepIndex = setupSteps.findIndex(step => !step.done);
    const setupComplete = nextStepIndex === -1;
    // Tag sulla voce `next`: solo quando dice qualcosa in più del titolo —
    // l'inizio della sequenza o la sua chiusura. Negli altri casi resta muto.
    const nextStepTag = missingSteps === 1
        ? "Ultimo passo"
        : nextStepIndex === 0
            ? "Inizia da qui"
            : null;

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
    // Fase 2 conclusa: la riga del menù passa da skeleton a testo. La mappa
    // vuota conta come risolta (nessuna sede, o risoluzione fallita).
    const menuIsResolved = catalogNames != null;
    const singleMenuName = singleLocation ? catalogNames?.[singleLocation.id] ?? null : null;
    const visibleLocations = publicLocations?.slice(0, MAX_VISIBLE_LOCATIONS) ?? [];
    const hiddenLocationsCount = Math.max(
        (publicLocations?.length ?? 0) - MAX_VISIBLE_LOCATIONS,
        0
    );

    const quickActions = [
        { label: "Nuovo prodotto", to: `${b}/products` },
        { label: "Nuovo catalogo", to: `${b}/catalogs` },
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
                                {stats.catalogs} {stats.catalogs === 1 ? "catalogo" : "cataloghi"}
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
                                        Il tuo menù non è ancora online
                                    </Text>
                                    <Text variant="body-sm" colorVariant="muted">
                                        {missingSteps === 1
                                            ? "Manca un passaggio: resta solo da dire dove e quando mostrare il menù."
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

                            <div className={styles.configList}>
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
                    <div className={styles.publicCard}>
                        <div className={styles.publicQr}>
                            <QrCode
                                value={singleLocation.publicUrl}
                                size={132}
                                fileName={`${singleLocation.slug}-qr`}
                                showActions
                            />
                        </div>
                        <div className={styles.publicInfo}>
                            <Badge variant={singleMenuName ? "success" : "secondary"}>
                                {menuIsResolved
                                    ? (singleMenuName ? "Menù online" : "Nessun menù attivo")
                                    : "Pagina pubblica"}
                            </Badge>
                            <Text variant="title-sm" weight={600}>{singleLocation.name}</Text>
                            <a
                                className={styles.publicUrl}
                                href={singleLocation.publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {singleLocation.publicUrl}
                            </a>
                            {/* `as="span"`: il placeholder è un <div>, che dentro
                                un <p> sarebbe HTML invalido. */}
                            <Text
                                as="span"
                                variant="body-sm"
                                colorVariant="muted"
                                className={styles.menuLine}
                            >
                                {menuIsResolved ? (
                                    singleMenuName
                                        ? `Il menù ${singleMenuName} è visibile adesso.`
                                        : "Nessun menù attivo in questo momento."
                                ) : (
                                    <MenuLineSkeleton width="70%" />
                                )}
                            </Text>
                            <div className={styles.publicActions}>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    leftIcon={<ExternalLink size={14} />}
                                    onClick={() =>
                                        window.open(singleLocation.publicUrl, "_blank", "noopener,noreferrer")
                                    }
                                >
                                    Apri la pagina
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showPublicBlock && !singleLocation && (
                <div className={styles.section}>
                    <Text variant="title-sm" weight={600}>Le tue pagine pubbliche</Text>
                    <div className={styles.publicList}>
                        {visibleLocations.map(location => (
                            <a
                                key={location.id}
                                className={styles.publicRow}
                                href={location.publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <span className={styles.publicRowBody}>
                                    <Text variant="body-sm" weight={600}>{location.name}</Text>
                                    <span className={styles.publicRowUrl}>{location.publicUrl}</span>
                                    <Text
                                        as="span"
                                        variant="caption"
                                        colorVariant="muted"
                                        className={styles.menuLine}
                                    >
                                        {menuIsResolved ? (
                                            catalogNames?.[location.id]
                                                ? `Il menù ${catalogNames[location.id]} è visibile adesso.`
                                                : "Nessun menù attivo in questo momento."
                                        ) : (
                                            <MenuLineSkeleton width="60%" />
                                        )}
                                    </Text>
                                </span>
                                <ExternalLink size={14} className={styles.configArrow} />
                            </a>
                        ))}
                    </div>
                    {hiddenLocationsCount > 0 && (
                        <button
                            className={styles.publicMore}
                            onClick={() => navigate(`${b}/locations`)}
                        >
                            {`Vedi tutte le sedi (+${hiddenLocationsCount})`}
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
                    <StatCard label="Cataloghi" value={stats?.catalogs} loading={loadingStats} />
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
