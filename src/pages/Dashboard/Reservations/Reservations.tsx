import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarCheck, Clock, Lock, Plus } from "lucide-react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/PermissionsContext";
import { usePageHeader } from "@/context/usePageHeader";
import { canDoOnActivity, canDoOnAnyActivity } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";
import { Select } from "@/components/ui/Select/Select";
import type { SelectOption } from "@/components/ui/Select/Select";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { useSedeScope, SCOPE_ALL } from "@/hooks/useSedeScope";
import { todayIsoDate } from "@/utils/dateLocal";
import { listReservations } from "@/services/supabase/reservations";
import { getActivities } from "@/services/supabase/activities";
import { getTenantMemberNames } from "@/services/supabase/team";
import type { V2Activity } from "@/types/activity";
import type { V2Reservation } from "@/types/reservation";
import ReservationDetailDrawer from "./ReservationDetailDrawer";
import ReservationCreateEditDrawer from "./ReservationCreateEditDrawer";
import ReservationsInbox from "./ReservationsInbox";
import ReservationsAgenda from "./ReservationsAgenda";
import { useDeferredCommit, type DeferredAction } from "./useDeferredCommit";
import { useReservationsRealtime } from "./hooks/useReservationsRealtime";
import styles from "./Reservations.module.scss";

type TabKey = "inbox" | "agenda";
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

const ACTION_LABEL: Record<DeferredAction, string> = {
    confirm: "Prenotazione confermata.",
    decline: "Prenotazione rifiutata.",
    cancel:  "Prenotazione annullata."
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
    const [isLoading, setIsLoading] = useState(true);

    const initialTab: TabKey = useMemo(() => {
        const t = searchParams.get("tab");
        return t === "agenda" ? "agenda" : "inbox";
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

    const manageableActivities = useMemo(
        () =>
            activities
                .filter(a => canManageActivity(a.id))
                .map(a => ({
                    id: a.id,
                    name: a.name,
                    reservation_capacity: a.reservation_capacity ?? null,
                    reservation_duration_minutes: a.reservation_duration_minutes ?? 120
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
            setReservations(rows);
            setActivities(acts);
            setOperatorNames(names);
        } catch {
            showToast({ message: "Errore nel caricamento delle prenotazioni.", type: "error" });
        } finally {
            setIsLoading(false);
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
            </Tabs.List>
        </Tabs>
    ), [tab, handleTabChange, pendingInScope.length]);

    // Plan gate (computed early; the actual lock screen render is below,
    // after all hooks, to respect the Rules of Hooks).
    const isLocked = !hasFeature("table_reservation");

    // When locked, pass null so the PageHeaderSlot stays empty (toolbar/tab
    // are owned by MainLayout via context, not by this component's render).
    const headerConfig = useMemo(
        () => isLocked
            ? null
            : { leading: headerLeading, actions: pageActions, sticky: true },
        [isLocked, headerLeading, pageActions]
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

    const selectedActivity = useMemo(
        () =>
            selectedReservation
                ? activities.find(a => a.id === selectedReservation.activity_id) ?? null
                : null,
        [selectedReservation, activities]
    );

    // ── Today bar ─────────────────────────────────────────────────────
    const today = todayIsoDate();
    const todayItems = useMemo(
        () =>
            scopedReservations.filter(
                r =>
                    r.reservation_date === today &&
                    (r.status === "pending" || r.status === "confirmed")
            ),
        [scopedReservations, today]
    );

    const todayCovers = useMemo(
        () =>
            scope === "__all__"
                ? null
                : todayItems
                      .filter(r => r.status === "confirmed")
                      .reduce((s, r) => s + r.party_size, 0),
        [todayItems, scope]
    );

    const nextToday = useMemo(() => {
        const now = nowHmm();
        const upcoming = todayItems
            .filter(r => r.reservation_time.slice(0, 5) >= now)
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

    if (isLoading) {
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
                        activityNames={activityNames}
                        showSitePill={showSitePill}
                        canManageActivity={canManageActivity}
                        onOpenDetail={handleOpenDetail}
                        onAction={handleAction}
                    />
                ) : (
                    <ReservationsAgenda
                        items={scopedReservations}
                        activityName={scopedActivityName}
                        onOpenDetail={handleOpenDetail}
                    />
                )}
            </div>

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
                allReservations={effectiveReservations}
                activityCapacity={selectedActivity?.reservation_capacity ?? null}
                activityDurationMinutes={
                    selectedActivity?.reservation_duration_minutes ?? undefined
                }
                canManage={
                    selectedReservation ? canManageActivity(selectedReservation.activity_id) : false
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
