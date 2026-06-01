import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, Clock, Lock, Plus } from "lucide-react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/PermissionsContext";
import { usePageHeader } from "@/context/usePageHeader";
import { canDoOnActivity, canDoOnAnyActivity } from "@/lib/permissions";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";
import { listReservations } from "@/services/supabase/reservations";
import { getActivities } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import type { V2Reservation } from "@/types/reservation";
import ReservationDetailDrawer from "./ReservationDetailDrawer";
import ReservationCreateEditDrawer from "./ReservationCreateEditDrawer";
import ReservationsInbox from "./ReservationsInbox";
import ReservationsAgenda from "./ReservationsAgenda";
import { useDeferredCommit, type DeferredAction } from "./useDeferredCommit";
import styles from "./Reservations.module.scss";

type TabKey = "inbox" | "agenda";
type Scope = string | "__all__";

function todayIsoDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
    const { permissions, loading: permissionsLoading } = usePermissions();

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
    const [isLoading, setIsLoading] = useState(true);

    const [tab, setTab] = useState<TabKey>("inbox");
    const [scope, setScope] = useState<Scope>("__all__");

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
        () =>
            canCreate ? (
                <Button variant="primary" leftIcon={<Plus size={16} />} onClick={handleOpenCreate}>
                    Nuova prenotazione
                </Button>
            ) : null,
        [canCreate, handleOpenCreate]
    );

    usePageHeader({
        title: "Prenotazioni",
        subtitle: "Inbox per le richieste in arrivo, agenda per chi è atteso.",
        sticky: true,
        actions: pageActions
    });

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
    const showScopeSelect = readableActivities.length > 1;

    const canManageActivity = useCallback(
        (activityId: string) => {
            if (!permissions) return false;
            return canDoOnActivity(permissions, "reservations.manage", activityId);
        },
        [permissions]
    );

    const manageableActivities = useMemo(
        () => activities.filter(a => canManageActivity(a.id)).map(a => ({ id: a.id, name: a.name })),
        [activities, canManageActivity]
    );

    // ── Load ──────────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        if (!tenantId) return;
        setIsLoading(true);
        try {
            const [rows, acts] = await Promise.all([
                listReservations(tenantId),
                getActivities(tenantId)
            ]);
            setReservations(rows);
            setActivities(acts);
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

    // Default scope = first readable site (NOT "Tutte") so agenda is usable
    // immediately for single-site users and meaningful for multi-site too.
    useEffect(() => {
        if (readableActivities.length === 0) return;
        if (scope !== "__all__" && readableActivityIds.has(scope)) return;
        setScope(readableActivities[0].id);
    }, [readableActivities, readableActivityIds, scope]);

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

    // ── Scope filter ──────────────────────────────────────────────────
    const scopedReservations = useMemo(() => {
        return effectiveReservations.filter(r => {
            // Always gate by read scope (defensive — RLS already filters).
            if (!readableActivityIds.has(r.activity_id)) return false;
            if (scope === "__all__") return true;
            return r.activity_id === scope;
        });
    }, [effectiveReservations, readableActivityIds, scope]);

    const pendingInScope = useMemo(
        () => scopedReservations.filter(r => r.status === "pending"),
        [scopedReservations]
    );

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
                {/* ── Toolbar: scope + tabs ────────────────────────────── */}
                <div className={styles.toolbar}>
                    {showScopeSelect && (
                        <div className={styles.scopeRow}>
                            <span className={styles.scopeLabel}>Sede</span>
                            <select
                                className={styles.scopeSelect}
                                value={scope}
                                onChange={e => setScope(e.target.value as Scope)}
                            >
                                <option value="__all__">Tutte le sedi</option>
                                {readableActivities.map(a => (
                                    <option key={a.id} value={a.id}>
                                        {a.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className={styles.tabs} role="tablist">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={tab === "inbox"}
                            className={tab === "inbox" ? `${styles.tabBtn} ${styles.tabBtnActive}` : styles.tabBtn}
                            onClick={() => setTab("inbox")}
                        >
                            Da gestire
                            {pendingInScope.length > 0 && (
                                <span className={styles.tabBadge}>{pendingInScope.length}</span>
                            )}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={tab === "agenda"}
                            className={tab === "agenda" ? `${styles.tabBtn} ${styles.tabBtnActive}` : styles.tabBtn}
                            onClick={() => setTab("agenda")}
                        >
                            Agenda
                        </button>
                    </div>
                </div>

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
                allReservations={effectiveReservations}
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
                    selectedReservation={editingReservation ?? undefined}
                    onSuccess={handleCreateEditSuccess}
                />
            )}
        </>
    );
}
