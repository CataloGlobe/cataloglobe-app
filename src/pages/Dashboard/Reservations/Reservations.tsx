import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Lock, Plus, Store } from "lucide-react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/usePermissions";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { canDoOnAnyActivity } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { Badge } from "@/components/ui/Badge/Badge";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import { Select } from "@/components/ui/Select/Select";
import type { SelectOption } from "@/components/ui/Select/Select";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { useActivityScope } from "@/hooks/useActivityScope";
import { todayIsoDate } from "@/utils/dateLocal";
import { reassignActivityTables, searchReservations, type ReservationSearchPage } from "@/services/supabase/reservations";
import { parseSearchQuery } from "@/utils/reservationSearch";
import type { V2Reservation } from "@/types/reservation";
import ReservationsInbox from "./ReservationsInbox";
import ReservationsAgenda from "./ReservationsAgenda";
import ReservationsSearchResults from "./ReservationsSearchResults";
import ReservationsTodayStrip from "./ReservationsTodayStrip";
import ReservationDrawers from "./ReservationDrawers";
import { agendaWeekRange, type DateRange } from "./loadWindow";
import { useReservationDesk } from "./hooks/useReservationDesk";
import styles from "./Reservations.module.scss";

const SEARCH_PLACEHOLDER = "Cerca per nome o telefono…";
const SEARCH_DEBOUNCE_MS = 300;
type ChannelFilter = "all" | "online" | "manual";

const CHANNEL_OPTIONS: SelectOption[] = [
    { value: "all", label: "Tutti i canali" },
    { value: "online", label: "Solo online" },
    { value: "manual", label: "Solo a mano" }
];

/**
 * Prenotazioni è l'Agenda e basta (lotto B-b). La sala del momento, che era
 * la scheda Servizio, è il modo Elenco della pagina Servizio: `?tab=service`
 * porta lì prima di montare la pagina. `?tab=inbox` e `?tab=agenda` dei
 * vecchi link aprono l'Agenda, che è tutta la pagina.
 */
export default function Reservations() {
    const [searchParams] = useSearchParams();
    if (searchParams.get("tab") === "service") {
        return <Navigate to="../servizio?modo=elenco" relative="path" replace />;
    }
    return <ReservationsAgendaPage />;
}

export function ReservationsAgendaPage() {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { hasFeature } = usePlanFeatures();
    const { permissions, loading: permissionsLoading, refresh: refreshPermissions } = usePermissions();
    const sedeScope = useActivityScope();

    const canRead = useMemo(
        () => (permissions ? canDoOnAnyActivity(permissions, "reservations.read") : false),
        [permissions]
    );

    const canCreate = useMemo(
        () => (permissions ? canDoOnAnyActivity(permissions, "reservations.manage") : false),
        [permissions]
    );

    // La sede è nel path: la pagina esiste solo dentro il contesto di sede
    // (`/reservations` reindirizza, §48.1). `null` solo nel frame prima che
    // la rotta risolva.
    const scope = sedeScope.activityId;

    // Channel filter (toolbar dropdown). Client-side, applied to the in-memory
    // dataset together with the scope filter. "all" = no narrowing.
    const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");

    // ── Ricerca (FASE 5.2b) ───────────────────────────────────────────
    // Una modalità, non una scheda: finché il campo ha del testo i risultati
    // sostituiscono l'Agenda; svuotandolo si torna sulla settimana di prima,
    // che non è stata toccata. La memoria della pagina copre una settimana:
    // cercare lì dentro mentirebbe, quindi la ricerca è una query sua su
    // tutte le date (`searchReservations`), fuori dalla finestra di
    // caricamento.
    const [searchInput, setSearchInput] = useState("");
    const [searchPage, setSearchPage] = useState<ReservationSearchPage | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const isSearchActive = parseSearchQuery(searchInput) !== null;

    // ── La finestra di caricamento ────────────────────────────────────────
    // FASE 5.2a: la pagina chiede al server solo le date che mostra. Qui la
    // settimana dell'Agenda; oggi e i giorni aperti nei drawer li aggiunge il
    // banco (`useReservationDesk`).
    const [weekOffset, setWeekOffset] = useState(0);
    const today = todayIsoDate();
    const baseRanges = useMemo<DateRange[]>(() => [agendaWeekRange(today, weekOffset)], [today, weekOffset]);

    const desk = useReservationDesk({
        activityId: scope,
        enabled: !permissionsLoading && !!permissions && canRead,
        baseRanges,
        snapshotRows: searchPage?.rows
    });
    const { effectiveReservations, handleOpenCreate, canManageActivity, loadData } = desk;

    const pageActions = useMemo(
        () => (
            <div className={styles.toolbarActions}>
                <ToolbarSearch value={searchInput} onChange={setSearchInput} placeholder={SEARCH_PLACEHOLDER} />
                <Select
                    containerClassName={styles.toolbarChannelSelect}
                    value={channelFilter}
                    onChange={e => setChannelFilter(e.target.value as ChannelFilter)}
                    aria-label="Filtra per canale"
                    options={CHANNEL_OPTIONS}
                />
                {canCreate && (
                    <Button
                        variant="primary"
                        className={styles.toolbarCta}
                        leftIcon={<Plus size={16} />}
                        onClick={handleOpenCreate}
                    >
                        Nuova prenotazione
                    </Button>
                )}
            </div>
        ),
        [canCreate, channelFilter, handleOpenCreate, searchInput]
    );

    // ── Sites the caller can READ ─────────────────────────────────────
    // Una regola sola per «quali sedi posso leggere»: quella dello scope
    // (owner/admin = tutte, gli altri le loro), non una copia locale.
    const readableActivityIds = useMemo(
        () => new Set(sedeScope.readableActivities.map(a => a.id)),
        [sedeScope.readableActivities]
    );

    // ── Scope + channel filter ────────────────────────────────────────
    const scopedReservations = useMemo(() => {
        return effectiveReservations.filter(r => {
            // Always gate by read scope (defensive — RLS already filters).
            if (!readableActivityIds.has(r.activity_id)) return false;
            if (r.activity_id !== scope) return false;
            if (channelFilter !== "all" && r.source !== channelFilter) return false;
            return true;
        });
    }, [effectiveReservations, readableActivityIds, scope, channelFilter]);

    const pendingInScope = useMemo(() => scopedReservations.filter(r => r.status === "pending"), [scopedReservations]);

    // ── Ricerca: la query ─────────────────────────────────────────────
    // Debounce sul testo; una risposta arrivata dopo una digitazione più
    // recente si scarta (contatore di richiesta). Lo scope di sede si passa
    // al server; il filtro canale NON si applica: chi cerca un nome vuole
    // trovarlo, da qualunque canale sia arrivato.
    const searchSeqRef = useRef(0);
    useEffect(() => {
        if (!tenantId || !isSearchActive) {
            searchSeqRef.current += 1;
            setSearchPage(null);
            setIsSearching(false);
            return;
        }
        const seq = ++searchSeqRef.current;
        setIsSearching(true);
        const timer = setTimeout(async () => {
            try {
                const page = await searchReservations(tenantId, searchInput, todayIsoDate(), scope);
                if (seq !== searchSeqRef.current) return;
                setSearchPage(page);
            } catch {
                if (seq !== searchSeqRef.current) return;
                showToast({ message: "Errore nella ricerca.", type: "error" });
            } finally {
                if (seq === searchSeqRef.current) setIsSearching(false);
            }
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [tenantId, isSearchActive, searchInput, scope, showToast]);

    // I risultati sono uno snapshot: se una riga è anche in memoria (il suo
    // giorno è caricato, o è pending) vince la copia in memoria, che ha gli
    // override ottimistici e il realtime. Gate di lettura difensivo come per
    // il resto della pagina.
    const searchRows = useMemo<V2Reservation[]>(() => {
        if (!searchPage) return [];
        const byId = new Map(effectiveReservations.map(r => [r.id, r]));
        return searchPage.rows.map(r => byId.get(r.id) ?? r).filter(r => readableActivityIds.has(r.activity_id));
    }, [searchPage, effectiveReservations, readableActivityIds]);

    // Plan gate (computed early; the actual lock screen render is below,
    // after all hooks, to respect the Rules of Hooks).
    const isLocked = !hasFeature("table_reservation");

    // When locked, pass null so the PageHeaderSlot stays empty (toolbar/tab
    // are owned by MainLayout via context, not by this component's render).
    // Una vista sola, l'Agenda: niente tab né selettore di sezione. Il
    // contatore delle richieste sta sulla card «Da gestire» e nella banda.
    const headerCompact = useMemo<PageHeaderCompactConfig>(
        () => ({
            search: { value: searchInput, onChange: setSearchInput, placeholder: SEARCH_PLACEHOLDER },
            filterControls: [
                {
                    label: "Canale",
                    options: CHANNEL_OPTIONS,
                    value: channelFilter,
                    // "all" = "Tutti i canali": valore a riposo, nessun pallino.
                    defaultValue: "all",
                    onChange: value => setChannelFilter(value as ChannelFilter)
                }
            ],
            primaryAction: canCreate ? { label: "Nuova prenotazione", onClick: handleOpenCreate } : undefined
        }),
        [channelFilter, canCreate, handleOpenCreate, searchInput]
    );

    const headerConfig = useMemo(
        () => (isLocked ? null : { actions: pageActions, compact: headerCompact }),
        [isLocked, pageActions, headerCompact]
    );
    usePageHeader(headerConfig);

    const handleReassignDay = useCallback(
        async (date: string): Promise<boolean> => {
            if (!scope || !tenantId) return false;
            try {
                const summary = await reassignActivityTables(scope, date, tenantId);
                await loadData();
                const parts = [
                    `Proposte rifatte per ${summary.reassigned} ${
                        summary.reassigned === 1 ? "prenotazione" : "prenotazioni"
                    }.`
                ];
                if (summary.unassigned > 0) {
                    parts.push(
                        summary.unassigned === 1
                            ? "1 è rimasta senza tavolo."
                            : `${summary.unassigned} sono rimaste senza tavolo.`
                    );
                }
                if (summary.skipped_manual > 0) {
                    parts.push(
                        summary.skipped_manual === 1
                            ? "1 sistemata a mano è rimasta com'era."
                            : `${summary.skipped_manual} sistemate a mano sono rimaste come erano.`
                    );
                }
                showToast({ message: parts.join(" "), type: "info", duration: 7000 });
                return true;
            } catch (err) {
                showToast({
                    message: err instanceof Error ? err.message : "Errore inatteso",
                    type: "error"
                });
                return false;
            }
        },
        [scope, tenantId, loadData, showToast]
    );

    // ── Render ────────────────────────────────────────────────────────

    // Plan gate render: feature "table_reservation" is Pro-only. Blocks all
    // roles before the permission gate. Real enforcement is server-side via
    // plans.features_json / activity_has_feature.
    if (isLocked) {
        return (
            <div className={styles.lockedWrap}>
                <EmptyState
                    icon={<Lock size={40} strokeWidth={1.5} />}
                    title="Le prenotazioni sono una funzione Pro"
                    description="Accetta richieste di prenotazione tavolo dalla pagina pubblica e gestiscile da qui. Disponibile con il piano Pro."
                    action={
                        <Button variant="primary" onClick={() => navigate(`/business/${businessId}/subscription`)}>
                            Passa a Pro
                        </Button>
                    }
                />
            </div>
        );
    }

    if (!permissionsLoading && permissions && !canRead) {
        return (
            <div className={styles.lockedWrap}>
                <EmptyState
                    icon={<Lock size={40} strokeWidth={1.5} />}
                    title="Non hai accesso alle prenotazioni"
                    description="L'accesso alle prenotazioni è riservato ai membri con il permesso di lettura sulle sedi. Contatta il proprietario o un amministratore se hai bisogno di accedere."
                />
            </div>
        );
    }

    // Permessi non arrivati (errore del provider): senza questo ramo il
    // caricamento non parte e lo scheletro resterebbe per sempre (#153).
    if (!permissionsLoading && !permissions) {
        return (
            <div className={styles.lockedWrap}>
                <EmptyState
                    variant="page"
                    icon={<Lock />}
                    title="Non riusciamo a leggere i tuoi permessi"
                    description="Senza, non sappiamo quali prenotazioni puoi vedere. Riprova tra un momento."
                    action={<Button onClick={() => void refreshPermissions()}>Riprova</Button>}
                />
            </div>
        );
    }

    // SOLO al primo caricamento: dopo, la pagina resta in piedi e si aggiorna
    // sotto. Vedi la nota su `hasLoadedOnce` in `useReservationDesk`.
    if (desk.isLoading && !desk.hasLoadedOnce) {
        return (
            <div className={styles.page} aria-busy="true">
                <Skeleton height={76} radius="var(--radius-surface)" />
                <Skeleton height={160} radius="var(--radius-surface)" />
                <Skeleton height={160} radius="var(--radius-surface)" />
            </div>
        );
    }

    // La sede del path non esiste, o non è leggibile: lo si dice, come la
    // scheda della sede (`ActivityDetailPage`), invece di mostrare liste vuote.
    // `activities.length > 0`: un caricamento fallito non è una sede sbagliata.
    if (
        sedeScope.fromRoute &&
        sedeScope.activityId &&
        desk.activities.length > 0 &&
        !readableActivityIds.has(sedeScope.activityId)
    ) {
        return (
            <div className={styles.lockedWrap}>
                <EmptyState
                    variant="page"
                    icon={<Store />}
                    title="Sede non trovata"
                    description="La sede che stai cercando non esiste o è stata eliminata."
                    action={
                        <Button onClick={() => navigate(`/business/${businessId}/locations`)}>Torna alle sedi</Button>
                    }
                />
            </div>
        );
    }

    return (
        <>
            <div className={styles.page}>
                {/* ── Oggi ─────────────────────────────────────────────────
                    In testa e sopra la ricerca. Sempre: con zero richieste è
                    lei a dire che non c'è niente da gestire (la coda, vuota,
                    non si mostra). */}
                <ReservationsTodayStrip items={scopedReservations} />

                {/* Niente stato vuoto di pagina: la memoria contiene solo la
                    finestra mostrata, e una settimana vuota non è «nessuna
                    prenotazione». L'Agenda ha il suo vuoto, con la sua
                    navigazione. */}
                {isSearchActive ? (
                    <ReservationsSearchResults
                        items={searchRows}
                        truncated={searchPage?.truncated ?? false}
                        isSearching={isSearching}
                        onOpenDetail={desk.handleOpenDetail}
                    />
                ) : (
                    <>
                        {/* §14: le richieste in cima all'agenda, indipendenti
                            dalla settimana scelta. Senza richieste la card non c'è. */}
                        {pendingInScope.length > 0 && (
                            <Card
                                title="Da gestire"
                                badge={<Badge variant="brand">{pendingInScope.length}</Badge>}
                                flush
                            >
                                <ReservationsInbox
                                    pendingItems={pendingInScope}
                                    truncated={desk.pendingTruncated}
                                    tableViews={desk.tableViews}
                                    canManageActivity={canManageActivity}
                                    onOpenDetail={desk.handleOpenDetail}
                                    onAction={desk.handleAction}
                                />
                            </Card>
                        )}
                        <ReservationsAgenda
                            items={scopedReservations}
                            weekOffset={weekOffset}
                            onWeekOffsetChange={setWeekOffset}
                            tableViews={desk.tableViews}
                            canManage={scope !== null && canManageActivity(scope)}
                            onReassignDay={handleReassignDay}
                            onOpenDetail={desk.handleOpenDetail}
                        />
                    </>
                )}
            </div>

            <ReservationDrawers desk={desk} />
        </>
    );
}
