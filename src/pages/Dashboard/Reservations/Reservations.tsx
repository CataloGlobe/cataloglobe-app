import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarCheck, Clock, Lock, Plus } from "lucide-react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/PermissionsContext";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { canDoOnActivity, canDoOnAnyActivity, isTenantWide } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";
import { Select } from "@/components/ui/Select/Select";
import type { SelectOption } from "@/components/ui/Select/Select";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { useSedeScope, SCOPE_ALL } from "@/hooks/useSedeScope";
import { shiftIsoDate, todayIsoDate } from "@/utils/dateLocal";
import {
    listReservations,
    listReservationTablesForReservations,
    reassignActivityTables,
    resetReservationTablesToSystem,
    setReservationTables
} from "@/services/supabase/reservations";
import {
    closeSeating,
    getSeatingForReservation,
    getSeatingState,
    listSeatingsWithState,
    listSeatingTables,
    openSeatingForReservation,
    openWalkinSeating,
    setSeatingPartySize,
    setSeatingTables,
    undoSeating
} from "@/services/supabase/seatings";
import { listTables } from "@/services/supabase/tables";
import type { V2Table } from "@/types/orders";
import { getActivities } from "@/services/supabase/activities";
import { getTenantMemberNames } from "@/services/supabase/team";
import { getReservationGuest } from "@/services/supabase/reservationGuests";
import type { V2Activity } from "@/types/activity";
import type {
    ReservationTableAssignmentWithTable,
    V2Reservation
} from "@/types/reservation";
import type { ReservationGuestSummary } from "@/types/reservationGuest";
import type { SeatingTableWithTable, SeatingWithState } from "@/types/seating";
import {
    DEFAULT_TABLE_DURATION_MINUTES,
    OCCUPYING_STATUSES,
    detectReservationTableConflicts,
    reservationWindowsOverlap,
    type ReservationTableConflict
} from "@/utils/reservationTableConflicts";
import type { TableAssignmentView } from "@/components/ui/TableAssignmentBadge/TableAssignmentBadge";
import {
    bareTableLabel,
    compareTableLabels,
    formatTableLabels
} from "@/components/ui/TableAssignmentBadge/formatTableLabels";
import ReservationDetailDrawer from "./ReservationDetailDrawer";
import ReservationCreateEditDrawer from "./ReservationCreateEditDrawer";
import ReservationsInbox from "./ReservationsInbox";
import ReservationsAgenda from "./ReservationsAgenda";
import ReservationsService from "./ReservationsService";
import SeatingDetailDrawer from "./SeatingDetailDrawer";
import type { SeatingCloseAction, SeatingPendingOrders } from "./seatingClose";
import WalkinCreateDrawer from "./WalkinCreateDrawer";
import { composeServiceBoard, seatingDisplayName } from "./serviceBoard";
import { tableWriteTargetFor } from "./tableSection";
import { useDeferredCommit, type DeferredAction } from "./useDeferredCommit";
import { useReservationsRealtime } from "./hooks/useReservationsRealtime";
import { useSeatingsRealtime } from "./hooks/useSeatingsRealtime";
import styles from "./Reservations.module.scss";

type TabKey = "inbox" | "agenda" | "service";
type Scope = string | "__all__";
type ChannelFilter = "all" | "online" | "manual";

const CHANNEL_OPTIONS: SelectOption[] = [
    { value: "all", label: "Tutti i canali" },
    { value: "online", label: "Solo online" },
    { value: "manual", label: "Solo a mano" }
];

function nowHmm(): string {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const EMPTY_VIEWS: ReadonlyMap<string, TableAssignmentView> = new Map();

/**
 * I tavoli REALMENTE occupati da una tavolata, nella stessa forma del piano:
 * la sezione TAVOLO del drawer rende un elenco di etichette con la zona, e
 * quell'elenco non cambia a seconda di dove viene il dato.
 *
 * `proposed: false` perché "proposto" è una qualità del piano — il motore non
 * propone tavolate, le registra. `conflict: null` perché il rilevamento
 * conflitti lavora su `reservation_tables` (vedi il commento della sezione
 * TAVOLO nel drawer).
 */
function seatingTableView(rows: SeatingTableWithTable[]): TableAssignmentView {
    const mapped = rows
        .map(r => ({
            table_id: r.table_id,
            label: r.table?.label ?? "sconosciuto",
            zone_name: r.table?.zone_name ?? null,
            deleted: r.table === null || r.table.deleted_at !== null
        }))
        .sort((x, y) => compareTableLabels(x.label, y.label));
    return {
        labels: mapped.map(r => r.label),
        rows: mapped,
        proposed: false,
        conflict: null
    };
}

/**
 * Una riga di spiegazione per ogni conflitto, unite con " · ". Nomina le
 * altre prenotazioni con nome e ora: l'operatore deve sapere CHI, non solo
 * che c'è un problema.
 */
function describeConflicts(
    conflicts: ReservationTableConflict[],
    labelByTableId: Map<string, string>,
    reservationById: Map<string, V2Reservation>
): string {
    return conflicts
        .map(c => {
            const label = bareTableLabel(labelByTableId.get(c.table_id) ?? "sconosciuto");
            if (c.kind === "table_deleted") {
                return `Il tavolo ${label} è stato rimosso dalla sala`;
            }
            const others = c.other_reservation_ids
                .map(id => reservationById.get(id))
                .filter((r): r is V2Reservation => r !== undefined)
                .map(r => `${r.customer_name} (${r.reservation_time.slice(0, 5)})`);
            const who =
                others.length === 0
                    ? "un'altra prenotazione"
                    : others.length === 1
                      ? others[0]
                      : `${others.slice(0, -1).join(", ")} e ${others[others.length - 1]}`;
            return `Tavolo ${label} assegnato anche a ${who}`;
        })
        .join(" · ");
}

const ACTION_LABEL: Record<DeferredAction, string> = {
    confirm:      "Prenotazione confermata.",
    decline:      "Prenotazione rifiutata.",
    cancel:       "Prenotazione annullata.",
    mark_no_show: "Segnata come non presentato.",
    undo_no_show: "Non presentato annullato."
};

export default function Reservations() {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { hasFeature } = usePlanFeatures();
    const { permissions, loading: permissionsLoading } = usePermissions();
    const sedeScope = useSedeScope();
    const [searchParams, setSearchParams] = useSearchParams();

    const canRead = useMemo(
        () => (permissions ? canDoOnAnyActivity(permissions, "reservations.read") : false),
        [permissions]
    );

    const canCreate = useMemo(
        () => (permissions ? canDoOnAnyActivity(permissions, "reservations.manage") : false),
        [permissions]
    );

    // Rubrica clienti. Permesso distinto da `reservations.read`: la singola
    // prenotazione è il turno, la rubrica è l'archivio completo dei clienti
    // dell'azienda. Staff e viewer non ce l'hanno.
    const canReadGuests = useMemo(
        () => (permissions ? canDoOnAnyActivity(permissions, "guests.read") : false),
        [permissions]
    );
    // Owner/admin vedono l'intera azienda: a loro il "nelle tue sedi" sui
    // conteggi sarebbe rumore. A tutti gli altri serve, perché i loro numeri
    // sono parziali per costruzione (view security_invoker).
    const tenantWide = useMemo(
        () => (permissions ? isTenantWide(permissions) : false),
        [permissions]
    );

    const [reservations, setReservations] = useState<V2Reservation[]>([]);
    const [activities, setActivities] = useState<V2Activity[]>([]);
    // Tenant-scoped map (user_id → display name) used to attribute manual
    // reservations to the operator who created them. Mirrors the pattern in
    // Orders.tsx. Fetched once per tenant via the SECURITY DEFINER RPC
    // `get_tenant_member_names` — failure resolves to an empty map and the
    // drawer falls back to a generic "Staff" label.
    const [operatorNames, setOperatorNames] = useState<Map<string, string>>(
        () => new Map()
    );
    // Assegnazioni tavolo delle prenotazioni da ieri in avanti (vedi
    // `loadData`): le passate non si mostrano, non si pagano.
    const [tableAssignments, setTableAssignments] = useState<
        ReservationTableAssignmentWithTable[]
    >([]);
    // Tavoli per sede, caricati on-demand quando il drawer si apre con
    // `canManage` (servono solo al picker "Cambia tavolo"). Cache per sede:
    // la sala non cambia mentre si gestisce una serata.
    const [tablesByActivity, setTablesByActivity] = useState<Map<string, V2Table[]>>(
        () => new Map()
    );
    const [isLoading, setIsLoading] = useState(true);
    // Distingue "non ho ancora niente da mostrare" da "sto aggiornando ciò che
    // già mostro". Senza, lo scheletro sostituisce l'intera pagina a OGNI
    // `loadData` — drawer compreso, che viene smontato e rimontato: ogni gesto
    // lo fa lampeggiare due volte, una per il ricaricamento esplicito
    // dell'handler e una per quello che il realtime scatena sull'UPDATE della
    // riga. Un aggiornamento con dati in mano non deve cambiare il layout.
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

    const initialTab: TabKey = useMemo(() => {
        const t = searchParams.get("tab");
        return t === "agenda" || t === "service" ? t : "inbox";
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [tab, setTab] = useState<TabKey>(initialTab);
    const handleTabChange = useCallback((next: TabKey) => {
        setTab(next);
        setSearchParams(prev => {
            prev.set("tab", next);
            return prev;
        }, { replace: true });
    }, [setSearchParams]);

    // Scope deriva da useSedeScope (navbar). SCOPE_ALL → "__all__" downstream.
    const scope: Scope = sedeScope.value === SCOPE_ALL ? "__all__" : sedeScope.value;

    // Channel filter (toolbar dropdown). Client-side, applied to the in-memory
    // dataset together with the scope filter. "all" = no narrowing.
    const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");

    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
    const [createEditMode, setCreateEditMode] = useState<"create" | "edit">("create");
    const [editingReservation, setEditingReservation] = useState<V2Reservation | null>(null);

    const handleOpenCreate = useCallback(() => {
        setCreateEditMode("create");
        setEditingReservation(null);
        setIsCreateEditOpen(true);
    }, []);

    const pageActions = useMemo(
        () => (
            <div className={styles.toolbarActions}>
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
        [canCreate, channelFilter, handleOpenCreate]
    );

    // ── Sites the caller can READ ─────────────────────────────────────
    const readableActivityIds = useMemo(() => {
        if (!permissions) return new Set<string>();
        // Owner/admin = tenant-wide → all activities.
        if (permissions.activityIds.length === 0 && canRead) {
            return new Set(activities.map(a => a.id));
        }
        // Manager/staff/viewer: only the explicit set.
        return new Set(permissions.activityIds);
    }, [permissions, activities, canRead]);

    const readableActivities = useMemo(
        () => activities.filter(a => readableActivityIds.has(a.id)),
        [activities, readableActivityIds]
    );

    const activityNames = useMemo(() => {
        const m = new Map<string, string>();
        for (const a of activities) m.set(a.id, a.name);
        return m;
    }, [activities]);

    const showSitePill = readableActivities.length > 1 && scope === "__all__";

    const canManageActivity = useCallback(
        (activityId: string) => {
            if (!permissions) return false;
            return canDoOnActivity(permissions, "reservations.manage", activityId);
        },
        [permissions]
    );

    // Permesso separato da `reservations.manage`: chi gestisce la sala non è
    // necessariamente chi decide se accettare una prenotazione.
    const canManageSeatingsOn = useCallback(
        (activityId: string) => {
            if (!permissions) return false;
            return canDoOnActivity(permissions, "seatings.manage", activityId);
        },
        [permissions]
    );

    const manageableActivities = useMemo(
        () =>
            activities
                .filter(a => canManageActivity(a.id))
                .map(a => ({
                    id: a.id,
                    name: a.name,
                    reservation_capacity: a.reservation_capacity ?? null,
                    reservation_duration_minutes: a.reservation_duration_minutes ?? 120,
                    // Pacing: `?? null` è "nessun limite", non un default di
                    // comodo. Il passo ricade su 15 come il default a schema.
                    reservation_pacing_slot_minutes:
                        a.reservation_pacing_slot_minutes ?? 15,
                    reservation_pacing_max_covers:
                        a.reservation_pacing_max_covers ?? null,
                    reservation_pacing_max_bookings:
                        a.reservation_pacing_max_bookings ?? null
                })),
        [activities, canManageActivity]
    );

    // ── Load ──────────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        if (!tenantId) return;
        setIsLoading(true);
        try {
            const [rows, acts, names] = await Promise.all([
                listReservations(tenantId),
                getActivities(tenantId),
                getTenantMemberNames(tenantId)
            ]);
            // Una sola query aggiuntiva, sugli id da ieri in avanti. `loadData`
            // gira a ogni evento realtime e dopo ogni commit differito: il
            // costo va tenuto a UNA query, non una per riga.
            const sinceIso = shiftIsoDate(todayIsoDate(), -1);
            const recentIds = rows
                .filter(r => r.reservation_date >= sinceIso)
                .map(r => r.id);
            const assignments = await listReservationTablesForReservations(recentIds, tenantId);
            setReservations(rows);
            setActivities(acts);
            setOperatorNames(names);
            setTableAssignments(assignments);
            // La sala si ricarica insieme: ogni gesto della tavolata passa da
            // qui, e la scheda Servizio deve rispecchiarlo senza aspettare
            // l'evento realtime (che arriva, ma dopo).
            setServiceReloadToken(t => t + 1);
        } catch {
            showToast({ message: "Errore nel caricamento delle prenotazioni.", type: "error" });
        } finally {
            setIsLoading(false);
            // Nel `finally` e non nel `try`: anche un caricamento fallito ha
            // già mostrato il suo toast, e ripresentare lo scheletro al
            // tentativo successivo nasconderebbe la pagina invece di spiegare
            // cosa non va.
            setHasLoadedOnce(true);
        }
    }, [tenantId, showToast]);

    useEffect(() => {
        if (permissionsLoading || !permissions) return;
        if (!canRead) return;
        void loadData();
    }, [permissionsLoading, permissions, canRead, loadData]);

    // Live updates: encapsulated in a dedicated hook (mirrors the codebase
    // pattern of `useActiveOrdersRealtime.ts` / `useTablesLiveRealtime.ts`).
    useReservationsRealtime(
        tenantId,
        !permissionsLoading && !!permissions && canRead,
        loadData
    );

    // ── Deferred commit ───────────────────────────────────────────────
    const { overrides, schedule, cancel } = useDeferredCommit({
        onCommitSuccess: loadData,
        onCommitError: (id, message) => {
            void loadData();
            showToast({ message, type: "error" });
        }
    });

    // Apply optimistic overrides to the source list before any downstream
    // filtering/grouping. Keeps all derived views in sync without each
    // component knowing about the override layer.
    const effectiveReservations = useMemo<V2Reservation[]>(() => {
        if (overrides.size === 0) return reservations;
        return reservations.map(r => {
            const ov = overrides.get(r.id);
            return ov ? { ...r, status: ov } : r;
        });
    }, [reservations, overrides]);

    // ── Scope + channel filter ────────────────────────────────────────
    const scopedReservations = useMemo(() => {
        return effectiveReservations.filter(r => {
            // Always gate by read scope (defensive — RLS already filters).
            if (!readableActivityIds.has(r.activity_id)) return false;
            if (scope !== "__all__" && r.activity_id !== scope) return false;
            if (channelFilter !== "all" && r.source !== channelFilter) return false;
            return true;
        });
    }, [effectiveReservations, readableActivityIds, scope, channelFilter]);

    const pendingInScope = useMemo(
        () => scopedReservations.filter(r => r.status === "pending"),
        [scopedReservations]
    );

    // ── Tavoli: vista per prenotazione + conflitti ────────────────────
    // Calcolato UNA volta su `effectiveReservations` (con gli override
    // ottimistici: una prenotazione appena annullata smette subito di essere
    // in conflitto) e passato ai figli come i dati già esistenti.
    const tableViews = useMemo<ReadonlyMap<string, TableAssignmentView>>(() => {
        if (tableAssignments.length === 0) return EMPTY_VIEWS;

        const durationByActivity = new Map<string, number>();
        for (const a of activities) {
            durationByActivity.set(
                a.id,
                a.reservation_duration_minutes ?? DEFAULT_TABLE_DURATION_MINUTES
            );
        }
        const reservationById = new Map(effectiveReservations.map(r => [r.id, r]));
        const conflicts = detectReservationTableConflicts(
            effectiveReservations,
            tableAssignments,
            durationByActivity
        );

        const labelByTableId = new Map<string, string>();
        const byReservation = new Map<string, ReservationTableAssignmentWithTable[]>();
        for (const a of tableAssignments) {
            labelByTableId.set(a.table_id, a.table?.label ?? "sconosciuto");
            const list = byReservation.get(a.reservation_id);
            if (list) list.push(a);
            else byReservation.set(a.reservation_id, [a]);
        }

        const views = new Map<string, TableAssignmentView>();
        for (const [reservationId, list] of byReservation) {
            // Le righe arrivano ordinate per `table_id` (uuid): l'ordine
            // sensato è per etichetta, e si decide qui.
            const rows = list
                .map(a => ({
                    table_id: a.table_id,
                    label: a.table?.label ?? "sconosciuto",
                    zone_name: a.table?.zone_name ?? null,
                    deleted: a.table === null || a.table.deleted_at !== null
                }))
                .sort((x, y) => compareTableLabels(x.label, y.label));
            const own = conflicts.get(reservationId) ?? [];
            views.set(reservationId, {
                labels: rows.map(r => r.label),
                rows,
                // Basta UNA riga `manual` perché l'intera assegnazione sia
                // una decisione dell'operatore.
                proposed: !list.some(a => a.assignment_source === "manual"),
                conflict:
                    own.length > 0
                        ? {
                              kind: own[0].kind,
                              message: describeConflicts(own, labelByTableId, reservationById)
                          }
                        : null
            });
        }
        return views;
    }, [tableAssignments, effectiveReservations, activities]);

    const headerLeading = useMemo(() => (
        <Tabs<TabKey>
            value={tab}
            onChange={handleTabChange}
            variant="line"
        >
            <Tabs.List>
                <Tabs.Tab
                    value="inbox"
                    badge={pendingInScope.length > 0 ? pendingInScope.length : undefined}
                >
                    Da gestire
                </Tabs.Tab>
                <Tabs.Tab value="agenda">Agenda</Tabs.Tab>
                {/* "Servizio", non "Sala": Sala è dove i tavoli si definiscono
                    (tab della sede). Qui si dice cosa sta succedendo. */}
                <Tabs.Tab value="service">Servizio</Tabs.Tab>
            </Tabs.List>
        </Tabs>
    ), [tab, handleTabChange, pendingInScope.length]);

    // Plan gate (computed early; the actual lock screen render is below,
    // after all hooks, to respect the Rules of Hooks).
    const isLocked = !hasFeature("table_reservation");

    // When locked, pass null so the PageHeaderSlot stays empty (toolbar/tab
    // are owned by MainLayout via context, not by this component's render).
    // Il contatore degli inbox: nella toolbar comoda resta la prop `badge` di
    // `Tabs.Tab` (pill dedicata, più leggibile); qui è interpolato
    // nell'etichetta, come fa Team. Il picker compatto mostra una stringa sola,
    // quindi `PageHeaderSection` resta `{label, value}` senza campo badge.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        sections: [
            {
                value: "inbox",
                label: pendingInScope.length > 0
                    ? `Da gestire · ${pendingInScope.length}`
                    : "Da gestire"
            },
            { value: "agenda", label: "Agenda" },
            { value: "service", label: "Servizio" }
        ],
        activeSection: tab,
        onSectionChange: value => handleTabChange(value as TabKey),
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
        primaryAction: canCreate
            ? { label: "Nuova prenotazione", onClick: handleOpenCreate }
            : undefined
    }), [tab, handleTabChange, pendingInScope.length, channelFilter, canCreate, handleOpenCreate]);

    const headerConfig = useMemo(
        () => isLocked
            ? null
            : { leading: headerLeading, actions: pageActions, compact: headerCompact },
        [isLocked, headerLeading, pageActions, headerCompact]
    );
    usePageHeader(headerConfig);

    const handleAction = useCallback(
        (r: V2Reservation, action: DeferredAction) => {
            schedule(r.id, action);
            showToast({
                message: ACTION_LABEL[action],
                type: "info",
                duration: 5000,
                actionLabel: "Annulla",
                onAction: () => cancel(r.id)
            });
        },
        [schedule, cancel, showToast]
    );

    const handleOpenDetail = useCallback((r: V2Reservation) => {
        setSelectedId(r.id);
        setIsDrawerOpen(true);
    }, []);

    const handleCloseDrawer = useCallback(() => {
        setIsDrawerOpen(false);
    }, []);

    const handleOpenEdit = useCallback((r: V2Reservation) => {
        setEditingReservation(r);
        setCreateEditMode("edit");
        setIsDrawerOpen(false);
        setIsCreateEditOpen(true);
    }, []);

    const handleCloseCreateEdit = useCallback(() => {
        setIsCreateEditOpen(false);
    }, []);

    const handleCreateEditSuccess = useCallback(async () => {
        await loadData();
    }, [loadData]);

    const selectedReservation = useMemo(
        () =>
            selectedId
                ? effectiveReservations.find(r => r.id === selectedId) ?? null
                : null,
        [selectedId, effectiveReservations]
    );

    // Profilo del cliente della prenotazione aperta. Caricato on-demand
    // all'apertura del drawer: la lista prenotazioni non ha bisogno dei
    // profili, e caricarli tutti sarebbe una query per riga.
    const [detailGuest, setDetailGuest] = useState<ReservationGuestSummary | null>(null);
    const detailGuestId = selectedReservation?.guest_id ?? null;

    useEffect(() => {
        if (!isDrawerOpen || !detailGuestId || !tenantId || !canReadGuests) {
            setDetailGuest(null);
            return;
        }
        let alive = true;
        getReservationGuest(detailGuestId, tenantId)
            .then(g => { if (alive) setDetailGuest(g); })
            // Silenzioso: il profilo è un arricchimento del drawer, la sua
            // assenza non deve disturbare chi sta gestendo una prenotazione.
            .catch(() => { if (alive) setDetailGuest(null); });
        return () => { alive = false; };
    }, [isDrawerOpen, detailGuestId, tenantId, canReadGuests]);

    const selectedActivity = useMemo(
        () =>
            selectedReservation
                ? activities.find(a => a.id === selectedReservation.activity_id) ?? null
                : null,
        [selectedReservation, activities]
    );

    // ── Tavoli: dati e gesti per il drawer ────────────────────────────
    // I tavoli della sede servono al picker, che su una prenotazione seduta
    // sposta la TAVOLATA: il permesso che lo apre è `seatings.manage`, non
    // `reservations.manage`. Caricarli solo per il secondo lascerebbe l'host
    // di sala davanti a un "Carico i tavoli…" che non finisce mai.
    const selectedCanManage = selectedReservation
        ? canManageActivity(selectedReservation.activity_id) ||
          canManageSeatingsOn(selectedReservation.activity_id)
        : false;
    const selectedActivityId = selectedReservation?.activity_id ?? null;

    // Sede di cui servono i tavoli, ADESSO: quella della prenotazione aperta
    // nel drawer, oppure quella della scheda Servizio (walk-in e drawer
    // della tavolata usano lo stesso picker). Una sola cache per sede.
    const tablesWantedFor: string | null =
        isDrawerOpen && selectedActivityId && selectedCanManage
            ? selectedActivityId
            : tab === "service" && scope !== "__all__" && canManageSeatingsOn(scope)
              ? scope
              : null;

    useEffect(() => {
        if (!tenantId || !tablesWantedFor) return;
        if (tablesByActivity.has(tablesWantedFor)) return;
        let alive = true;
        listTables(tenantId, tablesWantedFor)
            .then(rows => {
                if (!alive) return;
                setTablesByActivity(prev => new Map(prev).set(tablesWantedFor, rows));
            })
            .catch(() => {
                if (!alive) return;
                showToast({ message: "Errore nel caricamento dei tavoli.", type: "error" });
            });
        return () => {
            alive = false;
        };
    }, [tenantId, tablesWantedFor, tablesByActivity, showToast]);

    const selectedTables = selectedActivityId
        ? tablesByActivity.get(selectedActivityId)
        : undefined;

    // Chi occupa ogni tavolo nella finestra della prenotazione aperta
    // (esclusa lei stessa). Stessa regola del motore, via l'util condivisa:
    // il picker lo MOSTRA, non impedisce la scelta.
    const selectedTableOccupancy = useMemo<ReadonlyMap<string, string>>(() => {
        const out = new Map<string, string>();
        if (!selectedReservation) return out;
        const duration =
            selectedActivity?.reservation_duration_minutes ?? DEFAULT_TABLE_DURATION_MINUTES;
        const byId = new Map(effectiveReservations.map(r => [r.id, r]));
        const names = new Map<string, string[]>();
        for (const a of tableAssignments) {
            if (a.activity_id !== selectedReservation.activity_id) continue;
            if (a.reservation_id === selectedReservation.id) continue;
            const other = byId.get(a.reservation_id);
            if (!other || !OCCUPYING_STATUSES.has(other.status)) continue;
            if (!reservationWindowsOverlap(selectedReservation, other, duration)) continue;
            const list = names.get(a.table_id) ?? [];
            list.push(`${other.customer_name} (${other.reservation_time.slice(0, 5)})`);
            names.set(a.table_id, list);
        }
        for (const [tableId, list] of names) out.set(tableId, list.join(", "));
        return out;
    }, [selectedReservation, selectedActivity, effectiveReservations, tableAssignments]);

    // ── La tavolata della prenotazione aperta ─────────────────────────
    // Serve solo a chi si è seduto: `seated` e `completed` sono gli unici
    // stati che hanno una tavolata, e sono anche gli unici in cui la sezione
    // TAVOLO del drawer guarda il fatto invece del piano.
    //
    // `undefined` = non ancora caricata; `{ id: null }` = cercata e non
    // trovata. Il drawer tratta i due casi diversamente, e vanno tenuti
    // distinti: "sto caricando" e "non c'è" dicono cose opposte all'operatore.
    const [detailSeating, setDetailSeating] = useState<
        | {
              id: string | null;
              view: TableAssignmentView | null;
              partySize: number | null;
              /** Dalla view: serve alla domanda di «Servizio concluso». */
              pending: SeatingPendingOrders | undefined;
          }
        | undefined
    >(undefined);
    // Le scritture sulla tavolata non passano da `loadData` (che ricarica
    // prenotazioni e piano): questo token le fa ricaricare.
    const [seatingReloadToken, setSeatingReloadToken] = useState(0);

    const detailReservationId = selectedReservation?.id ?? null;
    const detailReservationStatus = selectedReservation?.status ?? null;
    const detailHasSeating =
        detailReservationStatus === "seated" || detailReservationStatus === "completed";

    useEffect(() => {
        if (!isDrawerOpen || !tenantId || !detailReservationId || !detailHasSeating) {
            setDetailSeating(undefined);
            return;
        }
        let alive = true;
        setDetailSeating(undefined);
        (async () => {
            try {
                const seating = await getSeatingForReservation(detailReservationId, tenantId, {
                    // Una prenotazione conclusa ha una tavolata CHIUSA: senza
                    // questo la si cercherebbe solo fra le aperte e non la si
                    // troverebbe mai. Sola lettura: nessun gesto parte da qui.
                    includeClosed: detailReservationStatus === "completed"
                });
                if (!alive) return;
                if (!seating) {
                    setDetailSeating({ id: null, view: null, partySize: null, pending: undefined });
                    return;
                }
                const [rows, state] = await Promise.all([
                    listSeatingTables(seating.id, tenantId),
                    getSeatingState(seating.id, tenantId)
                ]);
                if (!alive) return;
                setDetailSeating({
                    id: seating.id,
                    view: seatingTableView(rows),
                    partySize: seating.party_size,
                    pending: state
                        ? {
                              pending_orders_count: state.pending_orders_count,
                              pending_orders_deliverable: state.pending_orders_deliverable
                          }
                        : undefined
                });
            } catch {
                if (!alive) return;
                // Non si ripiega su `{ id: null }` in silenzio: "non c'è
                // tavolata" e "non sono riuscito a leggerla" portano
                // l'operatore a due conclusioni diverse.
                setDetailSeating({ id: null, view: null, partySize: null, pending: undefined });
                showToast({ message: "Errore nel caricamento della tavolata.", type: "error" });
            }
        })();
        return () => {
            alive = false;
        };
    }, [
        isDrawerOpen,
        tenantId,
        detailReservationId,
        detailReservationStatus,
        detailHasSeating,
        seatingReloadToken,
        showToast
    ]);

    const labelForTableId = useCallback(
        (tableId: string): string => {
            const fromTables = selectedTables?.find(t => t.id === tableId)?.label;
            if (fromTables) return fromTables;
            const fromAssignments = tableAssignments.find(a => a.table_id === tableId)?.table?.label;
            return fromAssignments ?? "sconosciuto";
        },
        [selectedTables, tableAssignments]
    );

    // "Cambia tavolo" sceglie la destinazione dallo STATO della prenotazione,
    // non da dove si trova il bottone: prima del servizio riscrive il piano,
    // da quando sono seduti sposta la tavolata. La regola è la stessa che
    // decide cosa disegnare (`tableSection.ts`), così bottone e scrittura non
    // possono divergere.
    const handleSetTables = useCallback(
        async (tableIds: string[]): Promise<boolean> => {
            if (!selectedReservation || !tenantId) return false;
            const seatingId = detailSeating === undefined ? undefined : detailSeating.id;
            const target = tableWriteTargetFor({
                status: selectedReservation.status,
                seatingId,
                canManage: canManageActivity(selectedReservation.activity_id),
                canManageSeatings: canManageSeatingsOn(selectedReservation.activity_id)
            });

            if (target === null || (target === "seating" && !seatingId)) {
                // La tavolata non si trova (o il permesso è cambiato sotto le
                // mani). NON si ripiega sul piano: scrivere nel posto
                // sbagliato perché quello giusto non risponde produce due
                // verità. Stessa reazione di `handleCompleteService`.
                await loadData();
                setSeatingReloadToken(t => t + 1);
                showToast({
                    message:
                        selectedReservation.status === "seated"
                            ? "Nessuna tavolata aperta per questa prenotazione."
                            : "Questa prenotazione non accetta più cambi di tavolo.",
                    type: "error"
                });
                return false;
            }

            try {
                if (target === "seating" && seatingId) {
                    await setSeatingTables(seatingId, tableIds, tenantId);
                    setSeatingReloadToken(t => t + 1);
                } else {
                    await setReservationTables(selectedReservation.id, tableIds, tenantId);
                }
                await loadData();
                const labels = formatTableLabels(tableIds.map(labelForTableId));
                showToast({
                    message:
                        target === "seating"
                            ? // Frase intera invece di "Tavolo 4: tavolata spostata": lo
                              // spostamento è il fatto, il tavolo è dove è finito.
                              // `formatTableLabels` produce "Tavolo 4" o "Tavoli 3 + 4",
                              // quindi l'articolo va concordato col numero di tavoli.
                              `Tavolata spostata a${tableIds.length > 1 ? "i" : "l"} ${labels}.`
                            : `${labels}: assegnazione confermata.`,
                    type: "success"
                });
                return true;
            } catch (err) {
                showToast({
                    message: err instanceof Error ? err.message : "Errore inatteso",
                    type: "error"
                });
                return false;
            }
        },
        [
            selectedReservation,
            tenantId,
            detailSeating,
            canManageActivity,
            canManageSeatingsOn,
            loadData,
            showToast,
            labelForTableId
        ]
    );

    const handleResetTables = useCallback(async (): Promise<boolean> => {
        if (!selectedReservation || !tenantId) return false;
        try {
            const outcomes = await resetReservationTablesToSystem(selectedReservation.id, tenantId);
            await loadData();
            const assigned = outcomes
                .filter(o => o.assigned && o.table_id)
                .map(o => labelForTableId(o.table_id as string));
            showToast({
                message:
                    assigned.length > 0
                        ? `Il sistema propone ${formatTableLabels(assigned)}.`
                        : "Nessun tavolo libero in questa fascia: la prenotazione resta senza tavolo.",
                type: "info"
            });
            return true;
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore inatteso",
                type: "error"
            });
            return false;
        }
    }, [selectedReservation, tenantId, loadData, showToast, labelForTableId]);

    // ── Gesti della tavolata ──────────────────────────────────────────
    // Immediati, non differiti come `handleAction`: in sala cinque secondi di
    // finestra di annullamento sono cinque secondi in cui il tavolo risulta
    // libero a chiunque altro stia guardando. Stessa forma di
    // `handleSetTables`: RPC → loadData → toast, drawer aperto.

    const handleArrive = useCallback(async (): Promise<boolean> => {
        if (!selectedReservation || !tenantId) return false;
        try {
            await openSeatingForReservation(selectedReservation.id, tenantId);
            await loadData();
            showToast({ message: "Ospite al tavolo.", type: "success" });
            return true;
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore inatteso",
                type: "error"
            });
            return false;
        }
    }, [selectedReservation, tenantId, loadData, showToast]);

    // Chiusura e annullamento partono dalla prenotazione, non dalla tavolata:
    // il drawer conosce la prima e non la seconda. La si risolve al momento
    // del gesto invece di tenerla in stato — una tavolata caricata all'apertura
    // del drawer sarebbe già vecchia quando l'host preme il bottone.
    const resolveOpenSeatingId = useCallback(async (): Promise<string | null> => {
        if (!selectedReservation || !tenantId) return null;
        const seating = await getSeatingForReservation(selectedReservation.id, tenantId);
        return seating?.id ?? null;
    }, [selectedReservation, tenantId]);

    const handleCompleteService = useCallback(
        async (action?: SeatingCloseAction): Promise<boolean> => {
            if (!tenantId) return false;
            try {
                const seatingId = await resolveOpenSeatingId();
                if (!seatingId) {
                    // Nessuna tavolata aperta ma la prenotazione risulta
                    // `seated`: è una divergenza, e ricaricare è il modo di
                    // vederla invece di insistere su una riga che non c'è.
                    await loadData();
                    showToast({
                        message: "Nessuna tavolata aperta per questa prenotazione.",
                        type: "error"
                    });
                    return false;
                }
                await closeSeating(seatingId, "operator", tenantId, action);
                await loadData();
                showToast({ message: "Servizio concluso.", type: "success" });
                return true;
            } catch (err) {
                showToast({
                    message: err instanceof Error ? err.message : "Errore inatteso",
                    type: "error"
                });
                // La tavolata può essere cambiata sotto le mani (un ordine
                // arrivato mentre si chiudeva): si rilegge, così la prossima
                // pressione fa la domanda giusta.
                setSeatingReloadToken(t => t + 1);
                return false;
            }
        },
        [tenantId, resolveOpenSeatingId, loadData, showToast]
    );

    const handleUndoArrival = useCallback(async (): Promise<boolean> => {
        if (!tenantId) return false;
        try {
            const seatingId = await resolveOpenSeatingId();
            if (!seatingId) {
                await loadData();
                showToast({
                    message: "Nessuna tavolata aperta per questa prenotazione.",
                    type: "error"
                });
                return false;
            }
            await undoSeating(seatingId, tenantId);
            await loadData();
            showToast({ message: "Arrivo annullato.", type: "info" });
            return true;
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore inatteso",
                type: "error"
            });
            return false;
        }
    }, [tenantId, resolveOpenSeatingId, loadData, showToast]);

    const handleReassignDay = useCallback(
        async (date: string): Promise<boolean> => {
            if (scope === "__all__" || !tenantId) return false;
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

    // ── Servizio: la sala della sede in scope ─────────────────────────
    // Caricata solo quando la scheda è aperta, su UNA sede, e chi guarda ha
    // `seatings.read` su quella sede. Il gate va PRIMA del fetch: la view è
    // `security_invoker` e a chi non può leggere risponde `[]`, non un errore
    // — senza il pre-check, "nessuno in sala" e "non puoi vederlo" sarebbero
    // la stessa risposta.
    const serviceActivityId = scope === "__all__" ? null : scope;
    const canReadService =
        serviceActivityId !== null && permissions !== null
            ? canDoOnActivity(permissions, "seatings.read", serviceActivityId)
            : false;
    const serviceEnabled = tab === "service" && canReadService;

    const [serviceSeatings, setServiceSeatings] = useState<SeatingWithState[] | null>(null);
    // Le scritture della tavolata dal drawer passano tutte da `loadData`, che
    // ricarica prenotazioni e piano ma non la sala: questo token la fa
    // ricaricare insieme. Separato da `seatingReloadToken` (quello del
    // drawer) perché azzerare `detailSeating` a ogni `loadData` farebbe
    // lampeggiare "Caricamento della tavolata…" sotto ogni evento realtime.
    const [serviceReloadToken, setServiceReloadToken] = useState(0);

    const loadService = useCallback(async () => {
        if (!tenantId || !serviceActivityId || !canReadService) return;
        try {
            const rows = await listSeatingsWithState(serviceActivityId, tenantId, {
                date: todayIsoDate()
            });
            setServiceSeatings(rows);
        } catch {
            showToast({ message: "Errore nel caricamento della sala.", type: "error" });
        }
    }, [tenantId, serviceActivityId, canReadService, showToast]);

    useEffect(() => {
        // Cambiare sede azzera la sala: la precedente non deve restare a
        // schermo sotto il nome della nuova mentre arriva il fetch.
        setServiceSeatings(null);
        if (!serviceEnabled) return;
        void loadService();
    }, [serviceEnabled, loadService, serviceReloadToken]);

    useSeatingsRealtime(serviceActivityId, serviceEnabled, loadService);

    const serviceBoard = useMemo(() => {
        if (serviceSeatings === null || serviceActivityId === null) return null;
        return composeServiceBoard({
            seatings: serviceSeatings,
            reservations: effectiveReservations.filter(
                r => r.activity_id === serviceActivityId
            ),
            today: todayIsoDate(),
            now: new Date()
        });
    }, [serviceSeatings, serviceActivityId, effectiveReservations]);

    const reservationsById = useMemo(
        () => new Map(effectiveReservations.map(r => [r.id, r])),
        [effectiveReservations]
    );

    // ── La tavolata: drawer proprio (walk-in) e apertura senza prenotazione ──
    // La tavolata selezionata si legge DAL board, non da uno snapshot: così
    // il drawer segue il realtime (un collega la sposta, il drawer lo vede).
    const [isWalkinOpen, setIsWalkinOpen] = useState(false);
    const [isSeatingDrawerOpen, setIsSeatingDrawerOpen] = useState(false);
    const [selectedSeatingId, setSelectedSeatingId] = useState<string | null>(null);
    const selectedSeating = useMemo(
        () =>
            selectedSeatingId
                ? (serviceSeatings ?? []).find(s => s.id === selectedSeatingId) ?? null
                : null,
        [selectedSeatingId, serviceSeatings]
    );
    const serviceCanManage =
        serviceActivityId !== null ? canManageSeatingsOn(serviceActivityId) : false;
    const serviceTables = serviceActivityId ? tablesByActivity.get(serviceActivityId) : undefined;

    // table_id → chi lo occupa ADESSO (tavolate aperte), per il picker. Si
    // mostra, non si impedisce: la doppia occupazione è un fatto di sala che
    // va visto, non un errore da bloccare. Esclusa la tavolata che si sta
    // modificando: non può essere in conflitto con sé stessa.
    const serviceTableOccupancy = useMemo<ReadonlyMap<string, string>>(() => {
        const out = new Map<string, string>();
        for (const s of serviceBoard?.inRoom ?? []) {
            if (s.id === selectedSeatingId) continue;
            const name = seatingDisplayName(s);
            for (const t of s.tables) {
                const prev = out.get(t.table_id);
                out.set(t.table_id, prev ? `${prev}, ${name}` : name);
            }
        }
        return out;
    }, [serviceBoard, selectedSeatingId]);

    const handleOpenSeating = useCallback((s: SeatingWithState) => {
        setSelectedSeatingId(s.id);
        setIsSeatingDrawerOpen(true);
    }, []);

    // Stessa forma dei gesti del drawer della prenotazione: RPC → ricarica →
    // toast, ritorna true se riuscito. La ricarica passa dal token della
    // scheda Servizio, che è l'unica cosa che una tavolata senza
    // prenotazione può cambiare.
    const reloadService = useCallback(() => setServiceReloadToken(t => t + 1), []);

    const handleOpenWalkin = useCallback(
        async (tableIds: string[], partySize: number | null): Promise<boolean> => {
            if (!tenantId || !serviceActivityId) return false;
            try {
                await openWalkinSeating(serviceActivityId, tableIds, partySize, tenantId);
                reloadService();
                showToast({ message: "Tavolata aperta.", type: "success" });
                return true;
            } catch (err) {
                showToast({
                    message: err instanceof Error ? err.message : "Errore inatteso",
                    type: "error"
                });
                return false;
            }
        },
        [tenantId, serviceActivityId, reloadService, showToast]
    );

    const runSeatingGesture = useCallback(
        async (gesture: () => Promise<unknown>, successMessage: string, type: "success" | "info") => {
            try {
                await gesture();
                reloadService();
                showToast({ message: successMessage, type });
                return true;
            } catch (err) {
                showToast({
                    message: err instanceof Error ? err.message : "Errore inatteso",
                    type: "error"
                });
                return false;
            }
        },
        [reloadService, showToast]
    );

    const handleSeatingSetTables = useCallback(
        async (tableIds: string[]): Promise<boolean> => {
            if (!tenantId || !selectedSeatingId) return false;
            return runSeatingGesture(
                () => setSeatingTables(selectedSeatingId, tableIds, tenantId),
                tableIds.length === 0
                    ? "Tavolata senza tavolo."
                    : `Tavolata spostata a${tableIds.length > 1 ? "i" : "l"} ${formatTableLabels(tableIds.map(labelForTableId))}.`,
                "success"
            );
        },
        [tenantId, selectedSeatingId, runSeatingGesture, labelForTableId]
    );

    const handleSeatingSetPartySize = useCallback(
        async (partySize: number): Promise<boolean> => {
            if (!tenantId || !selectedSeatingId) return false;
            return runSeatingGesture(
                () => setSeatingPartySize(selectedSeatingId, partySize, tenantId),
                `Coperti al tavolo: ${partySize}.`,
                "success"
            );
        },
        [tenantId, selectedSeatingId, runSeatingGesture]
    );

    const handleSeatingComplete = useCallback(
        async (action?: SeatingCloseAction): Promise<boolean> => {
            if (!tenantId || !selectedSeatingId) return false;
            return runSeatingGesture(
                () => closeSeating(selectedSeatingId, "operator", tenantId, action),
                "Servizio concluso.",
                "success"
            );
        },
        [tenantId, selectedSeatingId, runSeatingGesture]
    );

    const handleSeatingUndo = useCallback(async (): Promise<boolean> => {
        if (!tenantId || !selectedSeatingId) return false;
        return runSeatingGesture(
            () => undoSeating(selectedSeatingId, tenantId),
            "Tavolata annullata.",
            "info"
        );
    }, [tenantId, selectedSeatingId, runSeatingGesture]);

    // I coperti reali dal drawer della PRENOTAZIONE (forma `seated`): scrive
    // sulla tavolata collegata, mai su `reservations.party_size`.
    const handleSetSeatingPartySizeFromReservation = useCallback(
        async (partySize: number): Promise<boolean> => {
            if (!tenantId) return false;
            const seatingId = detailSeating?.id ?? null;
            if (!seatingId) {
                await loadData();
                setSeatingReloadToken(t => t + 1);
                showToast({
                    message: "Nessuna tavolata aperta per questa prenotazione.",
                    type: "error"
                });
                return false;
            }
            try {
                const row = await setSeatingPartySize(seatingId, partySize, tenantId);
                setDetailSeating(prev =>
                    prev && prev.id === seatingId ? { ...prev, partySize: row.party_size } : prev
                );
                reloadService();
                showToast({ message: `Coperti al tavolo: ${partySize}.`, type: "success" });
                return true;
            } catch (err) {
                showToast({
                    message: err instanceof Error ? err.message : "Errore inatteso",
                    type: "error"
                });
                return false;
            }
        },
        [tenantId, detailSeating, loadData, reloadService, showToast]
    );

    // ── Today bar ─────────────────────────────────────────────────────
    // Il banner conta quello che il locale ha accettato e quello che è già
    // successo: `confirmed + seated + completed`, UN insieme solo per conteggio
    // e coperti. Due insiemi nella stessa frase ("2 prenotazioni · ~2
    // coperti" con due tavoli da due) producono una domanda senza risposta.
    //
    // Fuori le `pending`: non sono ancora parte del servizio e sono già
    // contate in "Da gestire", nella stessa barra — contarle due volte con
    // due significati non aiuta nessuno. Fuori le sedute? No: una
    // prenotazione al tavolo non è sparita, e un conteggio che scala man mano
    // che la gente si siede direbbe "Oggi · 0 prenotazioni" a fine serata,
    // nel momento in cui il locale è più pieno.
    const today = todayIsoDate();
    const todayItems = useMemo(
        () =>
            scopedReservations.filter(
                r =>
                    r.reservation_date === today &&
                    (r.status === "confirmed" ||
                        r.status === "seated" ||
                        r.status === "completed")
            ),
        [scopedReservations, today]
    );

    const todayCovers = useMemo(
        () =>
            scope === "__all__"
                ? null
                : todayItems.reduce((s, r) => s + r.party_size, 0),
        [todayItems, scope]
    );

    // "Prossima" è un arrivo futuro: solo le `confirmed` con orario ≥ adesso.
    // Se sono tutte in ritardo non si disegna — corretto: non c'è nessun
    // arrivo futuro, solo ritardi, e quelli sono segnalati uno per uno nella
    // scheda Servizio.
    const nextToday = useMemo(() => {
        const now = nowHmm();
        const upcoming = todayItems
            .filter(r => r.status === "confirmed" && r.reservation_time.slice(0, 5) >= now)
            .sort((a, b) => a.reservation_time.localeCompare(b.reservation_time));
        return upcoming[0] ?? null;
    }, [todayItems]);

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
                        <Button
                            variant="primary"
                            onClick={() => navigate(`/business/${businessId}/subscription`)}
                        >
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

    // SOLO al primo caricamento: dopo, la pagina resta in piedi e si aggiorna
    // sotto. Vedi la nota su `hasLoadedOnce`.
    if (isLoading && !hasLoadedOnce) {
        return (
            <div className={styles.page}>
                <div className={styles.cards}>
                    <div className={styles.skeleton} />
                    <div className={styles.skeleton} />
                    <div className={styles.skeleton} />
                </div>
            </div>
        );
    }

    const scopedActivityName =
        scope === "__all__" ? null : activityNames.get(scope) ?? null;

    return (
        <>
            <div className={styles.page}>
                {/* ── Today bar ────────────────────────────────────────── */}
                {todayItems.length > 0 && (
                    <div className={styles.todayBar}>
                        <span className={styles.todayBarIcon}>
                            <Clock size={16} strokeWidth={2} />
                        </span>
                        <span className={styles.todayBarText}>
                            <strong>Oggi</strong>
                            <span className={styles.todayBarSeparator}> · </span>
                            {todayItems.length}{" "}
                            {todayItems.length === 1 ? "prenotazione" : "prenotazioni"}
                            {todayCovers !== null && todayCovers > 0 && (
                                <>
                                    <span className={styles.todayBarSeparator}> · </span>
                                    ~{todayCovers} coperti
                                </>
                            )}
                            {nextToday && (
                                <>
                                    <span className={styles.todayBarSeparator}> · </span>
                                    prossima ore{" "}
                                    <strong>{nextToday.reservation_time.slice(0, 5)}</strong>
                                    {scope === "__all__" && (
                                        <span className={styles.todayBarHint}>
                                            {" "}
                                            ({activityNames.get(nextToday.activity_id) ?? "sede"})
                                        </span>
                                    )}
                                </>
                            )}
                        </span>
                    </div>
                )}

                {/* ── Empty: zero reservations at all ──────────────────── */}
                {effectiveReservations.length === 0 ? (
                    <div className={styles.emptyState}>
                        <EmptyState
                            icon={<CalendarCheck size={40} strokeWidth={1.5} />}
                            title="Nessuna prenotazione"
                            description="Quando i clienti invieranno richieste dalla pagina pubblica, compariranno qui."
                        />
                    </div>
                ) : tab === "inbox" ? (
                    <ReservationsInbox
                        pendingItems={pendingInScope}
                        tableViews={tableViews}
                        activityNames={activityNames}
                        showSitePill={showSitePill}
                        canManageActivity={canManageActivity}
                        onOpenDetail={handleOpenDetail}
                        onAction={handleAction}
                    />
                ) : tab === "agenda" ? (
                    <ReservationsAgenda
                        items={scopedReservations}
                        tableViews={tableViews}
                        activityName={scopedActivityName}
                        canManage={scope !== "__all__" && canManageActivity(scope)}
                        onReassignDay={handleReassignDay}
                        onOpenDetail={handleOpenDetail}
                    />
                ) : (
                    <ReservationsService
                        board={serviceBoard}
                        activityName={scopedActivityName}
                        canRead={canReadService}
                        reservationsById={reservationsById}
                        tableViews={tableViews}
                        onOpenDetail={handleOpenDetail}
                        onOpenSeating={handleOpenSeating}
                        onOpenWalkin={serviceCanManage ? () => setIsWalkinOpen(true) : undefined}
                    />
                )}
            </div>

            <SeatingDetailDrawer
                open={isSeatingDrawerOpen}
                onClose={() => setIsSeatingDrawerOpen(false)}
                seating={selectedSeating}
                tables={serviceTables}
                tableOccupancy={serviceTableOccupancy}
                canManageSeatings={serviceCanManage}
                onSetTables={handleSeatingSetTables}
                onSetPartySize={handleSeatingSetPartySize}
                onComplete={handleSeatingComplete}
                onUndo={handleSeatingUndo}
            />

            <WalkinCreateDrawer
                open={isWalkinOpen}
                onClose={() => setIsWalkinOpen(false)}
                tables={serviceTables}
                occupiedBy={serviceTableOccupancy}
                onSubmit={handleOpenWalkin}
            />

            <ReservationDetailDrawer
                open={isDrawerOpen}
                onClose={handleCloseDrawer}
                reservation={selectedReservation}
                activityName={
                    selectedReservation
                        ? activityNames.get(selectedReservation.activity_id) ?? null
                        : null
                }
                operatorNames={operatorNames}
                tableView={
                    selectedReservation ? tableViews.get(selectedReservation.id) ?? null : null
                }
                seatingTableView={detailSeating === undefined ? undefined : detailSeating.view}
                seatingId={detailSeating === undefined ? undefined : detailSeating.id}
                tables={selectedTables}
                tableOccupancy={selectedTableOccupancy}
                onSetTables={handleSetTables}
                onResetTables={handleResetTables}
                allReservations={effectiveReservations}
                activityCapacity={selectedActivity?.reservation_capacity ?? null}
                activityDurationMinutes={
                    selectedActivity?.reservation_duration_minutes ?? undefined
                }
                canManage={
                    selectedReservation ? canManageActivity(selectedReservation.activity_id) : false
                }
                activityReminderEnabled={selectedActivity?.reservation_reminder_enabled}
                canManageSeatings={
                    selectedReservation
                        ? canManageSeatingsOn(selectedReservation.activity_id)
                        : false
                }
                onArrive={handleArrive}
                onCompleteService={handleCompleteService}
                onUndoArrival={handleUndoArrival}
                seatingPartySize={detailSeating === undefined ? undefined : detailSeating.partySize}
                seatingPendingOrders={detailSeating === undefined ? undefined : detailSeating.pending}
                onSetSeatingPartySize={handleSetSeatingPartySizeFromReservation}
                guestSummary={detailGuest}
                tenantWide={tenantWide}
                onOpenGuest={
                    detailGuest
                        ? () => {
                              // La scheda completa vive nella pagina Clienti:
                              // il deep link `?guest=` la apre già aperta, così
                              // il link è condivisibile e la rubrica resta una
                              // sola implementazione.
                              setIsDrawerOpen(false);
                              navigate(
                                  `/business/${businessId}/guests?guest=${detailGuest.id}`
                              );
                          }
                        : undefined
                }
                onAction={action => {
                    if (selectedReservation) handleAction(selectedReservation, action);
                }}
                onEdit={
                    selectedReservation
                        ? () => handleOpenEdit(selectedReservation)
                        : undefined
                }
            />

            {tenantId && (
                <ReservationCreateEditDrawer
                    open={isCreateEditOpen}
                    onClose={handleCloseCreateEdit}
                    mode={createEditMode}
                    tenantId={tenantId}
                    manageableActivities={manageableActivities}
                    allReservations={effectiveReservations}
                    selectedReservation={editingReservation ?? undefined}
                    onSuccess={handleCreateEditSuccess}
                />
            )}
        </>
    );
}
