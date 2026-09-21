import { useCallback, useEffect, useMemo, useState } from "react";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { canDoOnTenant, canChangeRoleOf, canRemoveMember, isOwnerOrAdmin } from "@/lib/permissions";
import { usePermissions } from "@/context/PermissionsContext";
import { useAuth } from "@/context/useAuth";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { Card } from "@/components/ui/Card/Card";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { getActivities } from "@/services/supabase/activities";
import { Button } from "@/components/ui/Button/Button";
import { Select } from "@/components/ui/Select/Select";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions, TableRowAction } from "@/components/ui/TableRowActions/TableRowActions";
import { InviteMemberDrawer } from "@/components/Businesses/InviteMemberDrawer/InviteMemberDrawer";
import { MemberDrawer } from "@/components/Businesses/MemberDrawer/MemberDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { Lock, Send, UserCog, UserMinus, X } from "lucide-react";
import { ROLE_LABEL, ROLE_ORDER, ROLE_PHRASE } from "@/constants/roles";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import styles from "./TeamPage.module.scss";

import type { TenantMemberRow, EffectiveRole } from "@/types/team";
import { listTenantMembers, removeTenantMember, resendInvite, revokeInvite } from "@/services/supabase/team";

function formatExpiry(expiresAt: string): string {
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
    if (days <= 0) return "scade oggi";
    if (days === 1) return "scade domani";
    return `scade tra ${days} giorni`;
}

/** Messaggio utente per gli errori delle RPC sugli inviti. */
function inviteErrorMessage(err: unknown, fallback: string): string {
    const msg = (err as { message?: string })?.message ?? "";
    if (msg.includes("cannot resend invite to an active member")) return "L'invito è già stato accettato.";
    if (msg.includes("not allowed")) return "Non hai i permessi per questo invito.";
    if (msg.includes("member not found")) return "Invito non trovato.";
    return fallback;
}

/** Ruolo e cosa può fare: cella a due righe (§44.8) — il nome non basta a
 *  chi non ha letto `role_permissions`. */
function roleCell(role: EffectiveRole) {
    return (
        <span className={styles.twoLines}>
            <span>
                <Badge variant="neutral">{ROLE_LABEL[role]}</Badge>
            </span>
            <Text as="span" variant="caption" colorVariant="muted">
                {ROLE_PHRASE[role]}
            </Text>
        </span>
    );
}

/** Su quali sedi: lo scope activity-granulare, oggi invisibile in lista. */
function activitiesCell(member: TenantMemberRow, totalActivities: number | null) {
    if (member.effective_role === "owner" || member.effective_role === "admin") {
        return (
            <Text variant="body-sm" colorVariant="muted">
                {totalActivities == null
                    ? "Tutte le sedi"
                    : totalActivities === 1
                        ? "L'unica sede"
                        : `Tutte le ${totalActivities} sedi`}
            </Text>
        );
    }
    if (member.activity_names.length === 0) {
        return <Text variant="body-sm" colorVariant="muted">—</Text>;
    }
    if (member.activity_names.length <= 2) {
        return <Text variant="body-sm">{member.activity_names.join(", ")}</Text>;
    }
    return (
        <Tooltip content={member.activity_names.join(" · ")}>
            <span>
                <Badge variant="neutral">{member.activity_names.length} sedi</Badge>
            </span>
        </Tooltip>
    );
}

export default function TeamPage() {
    const { selectedTenantId } = useTenant();
    const { showToast } = useToast();

    const [members, setMembers] = useState<TenantMemberRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    // Quante sedi ha l'azienda: «Tutte le 4 sedi» dice più di «Tutte le sedi».
    const [totalActivities, setTotalActivities] = useState<number | null>(null);
    const [activityIds, setActivityIds] = useState<string[] | null>(null);

    const [inviteDrawerOpen, setInviteDrawerOpen] = useState(false);
    const [memberToRemove, setMemberToRemove] = useState<TenantMemberRow | null>(null);
    const [memberDrawerTarget, setMemberDrawerTarget] = useState<TenantMemberRow | null>(null);

    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("");

    type TeamTab = "members" | "invites";
    const [activeTab, setActiveTab] = useState<TeamTab>("members");
    const handleTabChange = useCallback((next: TeamTab) => setActiveTab(next), []);

    const { permissions, loading: permissionsLoading } = usePermissions();
    const { user } = useAuth();
    const callerUserId = user?.id;
    const canInvite = permissions ? canDoOnTenant(permissions, "team.invite") : false;
    const canReadTeam = permissions ? canDoOnTenant(permissions, "team.read") : false;
    const canRemoveAny = permissions ? canDoOnTenant(permissions, "team.remove") : false;

    const filteredActiveMembers = useMemo(() => {
        // "Active" include owner synthetic (status=NULL) e membership status='active'
        let result = members.filter(m => m.status === "active" || m.effective_role === "owner");
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            result = result.filter(m => m.email?.toLowerCase().includes(q));
        }
        if (roleFilter) {
            result = result.filter(m => m.effective_role === roleFilter);
        }
        return result;
    }, [members, search, roleFilter]);

    const filteredPendingInvites = useMemo(() => {
        let result = members.filter(m => m.status === "pending");
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            result = result.filter(m => m.email?.toLowerCase().includes(q));
        }
        if (roleFilter) {
            result = result.filter(m => m.effective_role === roleFilter);
        }
        return result;
    }, [members, search, roleFilter]);

    // Id completi (pre-ricerca) per tab, cosi la prune-selection distingue
    // "membro rimosso" da "membro filtrato dalla ricerca".
    const allActiveMemberIds = useMemo(
        () =>
            members
                .filter(m => m.status === "active" || m.effective_role === "owner")
                .map(m => m.membership_id),
        [members]
    );
    const allPendingInviteIds = useMemo(
        () => members.filter(m => m.status === "pending").map(m => m.membership_id),
        [members]
    );

    const pendingCount = useMemo(
        () => members.filter(m => m.status === "pending").length,
        [members]
    );

    // Annullato l'ultimo invito la tab si spegne: si torna a Membri.
    useEffect(() => {
        if (!loading && pendingCount === 0 && activeTab === "invites") setActiveTab("members");
    }, [loading, pendingCount, activeTab]);

    // ── Header band: leading (tab line) + actions (search + filtro + CTA) ──
    const leading = useMemo(() => (
        <Tabs<TeamTab>
            value={activeTab}
            onChange={handleTabChange}
            variant="line"
        >
            <Tabs.List>
                <Tabs.Tab value="members">Membri</Tabs.Tab>
                {/* A zero resta elencata ma spenta (§42.2): una tab che sparisce
                    fa sembrare che la funzione non esista. */}
                <Tabs.Tab
                    value="invites"
                    badge={pendingCount}
                    disabled={pendingCount === 0}
                    disabledTooltip="Nessun invito in attesa"
                >
                    Inviti in attesa
                </Tabs.Tab>
            </Tabs.List>
        </Tabs>
    ), [activeTab, handleTabChange, pendingCount]);

    // Opzioni condivise fra il `Select` della toolbar comoda e l'overlay
    // filtro di quella compatta: un elenco solo, nessun rischio di divergenza.
    const roleFilterOptions = useMemo(() => [
        { value: "", label: "Tutti i ruoli" },
        ...ROLE_ORDER.map(role => ({ value: role, label: ROLE_LABEL[role] }))
    ], []);

    const headerActions = useMemo(() => (
        <>
            <ToolbarSearch
                value={search}
                onChange={setSearch}
                placeholder="Cerca per email"
            />
            <Select
                aria-label="Filtra per ruolo"
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                containerClassName={styles.toolbarFilter}
                selectClassName={styles.toolbarFilterSelect}
                options={roleFilterOptions}
            />
            {canInvite && (
                <Button
                    variant="primary"
                    onClick={() => setInviteDrawerOpen(true)}
                    className={styles.toolbarCta}
                >
                    Invita membro
                </Button>
            )}
        </>
    ), [search, roleFilter, canInvite, roleFilterOptions]);

    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        sections: [
            { value: "members", label: "Membri" },
            {
                value: "invites",
                label: pendingCount > 0 ? `Inviti in attesa · ${pendingCount}` : "Inviti in attesa"
            }
        ],
        activeSection: activeTab,
        onSectionChange: value => handleTabChange(value as TeamTab),
        search: {
            value: search,
            onChange: setSearch,
            placeholder: "Cerca per email"
        },
        filterControls: [
            {
                label: "Ruolo",
                options: roleFilterOptions,
                value: roleFilter,
                // "" = "Tutti i ruoli": è il valore a riposo, quindi nessun pallino.
                defaultValue: "",
                onChange: setRoleFilter
            }
        ],
        primaryAction: canInvite
            ? { label: "Invita membro", onClick: () => setInviteDrawerOpen(true) }
            : undefined
    }), [activeTab, handleTabChange, pendingCount, search, roleFilter, roleFilterOptions, canInvite]);

    usePageHeader({
        leading: canReadTeam ? leading : undefined,
        actions: canReadTeam ? headerActions : undefined,
        compact: canReadTeam ? headerCompact : undefined,
    });

    useEffect(() => {
        if (!selectedTenantId) return;
        // Skip fetch se il caller non ha team.read (la RPC tornerebbe 42501).
        // Il render mostra il locked state — niente network roundtrip.
        if (permissions && !canReadTeam) {
            setMembers([]);
            setLoading(false);
            return;
        }
        let cancelled = false;

        const fetchMembers = async () => {
            setLoading(true);
            setLoadError(false);
            try {
                const data = await listTenantMembers(selectedTenantId);
                if (cancelled) return;
                setMembers(data);
            } catch (error) {
                // Niente lista vuota silenziosa: la pagina lo dichiara con un
                // banner e un «Riprova».
                if (cancelled) return;
                console.error("[BusinessTeamPage] failed to fetch members:", error);
                setMembers([]);
                setLoadError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchMembers();
        return () => { cancelled = true; };
    }, [selectedTenantId, refreshKey, permissions, canReadTeam]);

    useEffect(() => {
        if (!selectedTenantId || (permissions && !canReadTeam)) return;
        let cancelled = false;
        getActivities(selectedTenantId)
            .then(rows => {
                if (cancelled) return;
                setTotalActivities(rows.length);
                setActivityIds(rows.map(a => a.id));
            })
            .catch(error => {
                // Il conteggio è un dettaglio della colonna: senza, «Tutte le sedi».
                console.error("[BusinessTeamPage] activities count failed:", error);
            });
        return () => { cancelled = true; };
    }, [selectedTenantId, permissions, canReadTeam]);

    const handleRemove = useCallback((member: TenantMemberRow) => {
        setMemberToRemove(member);
    }, []);

    const handleConfirmRemove = useCallback(async (): Promise<boolean> => {
        if (!memberToRemove) return false;

        try {
            await removeTenantMember(memberToRemove.membership_id);
        } catch (err) {
            console.error("[BusinessTeamPage] remove member failed:", err);
            const error = err as { code?: string; message?: string };
            let userMessage = "Impossibile rimuovere il membro. Riprova più tardi.";
            if (error.code === "42501") userMessage = error.message || "Permesso negato.";
            else if (error.code === "44000") userMessage = "Membro non trovato.";
            else if (error.code === "22023") userMessage = error.message || "Operazione non valida.";
            showToast({ type: "error", message: userMessage });
            return false;
        }

        setRefreshKey(k => k + 1);
        return true;
    }, [memberToRemove, showToast]);

    const handleChangeRole = useCallback((member: TenantMemberRow) => {
        setMemberDrawerTarget(member);
    }, []);

    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
    const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);

    // Annullare un invito chiede conferma, singolo e in blocco: il link che
    // la persona ha ricevuto smette di funzionare.
    const [invitesToCancel, setInvitesToCancel] = useState<TenantMemberRow[]>([]);
    const handleCancelInvite = useCallback((member: TenantMemberRow) => {
        setInvitesToCancel([member]);
    }, []);

    const handleConfirmCancelInvites = useCallback(async (): Promise<boolean> => {
        if (invitesToCancel.length === 0) return false;
        const results = await Promise.allSettled(
            invitesToCancel.map(m => revokeInvite(m.membership_id))
        );
        const failed = results.filter(r => r.status === "rejected");
        const ok = results.length - failed.length;
        if (invitesToCancel.length === 1) {
            if (failed.length === 0) {
                showToast({ type: "success", message: "Invito annullato." });
            } else {
                const reason = (failed[0] as PromiseRejectedResult).reason;
                showToast({
                    type: "error",
                    message: inviteErrorMessage(reason, "Impossibile annullare l'invito. Riprova più tardi.")
                });
            }
        } else {
            if (ok > 0) showToast({ type: "success", message: `${ok} inviti annullati` });
            if (failed.length > 0) {
                showToast({
                    type: "error",
                    message: failed.length === 1 ? "1 invito non annullato" : `${failed.length} inviti non annullati`
                });
            }
        }
        setSelectedInviteIds([]);
        setRefreshKey(k => k + 1);
        return true;
    }, [invitesToCancel, showToast]);

    const [bulkRemovePendingIds, setBulkRemovePendingIds] = useState<string[]>([]);
    const bulkRemoveConfirmOpen = bulkRemovePendingIds.length > 0;

    const handleBulkRemoveMembers = useCallback((ids: string[]) => {
        if (!selectedTenantId || ids.length === 0) return;
        const removableIds = members
            .filter(
                m => m.status === "active"
                  && ids.includes(m.membership_id)
                  && m.effective_role !== "owner"
            )
            .map(m => m.membership_id);
        if (removableIds.length === 0) {
            showToast({ type: "error", message: "Nessun membro rimovibile selezionato." });
            setSelectedMemberIds([]);
            return;
        }
        setBulkRemovePendingIds(removableIds);
    }, [selectedTenantId, members, showToast]);

    const handleBulkRemoveConfirm = useCallback(async (): Promise<boolean> => {
        if (bulkRemovePendingIds.length === 0) return false;
        const results = await Promise.allSettled(
            bulkRemovePendingIds.map(id => removeTenantMember(id))
        );
        const failed = results.filter(r => r.status === "rejected").length;
        const ok = results.length - failed;
        if (ok > 0) {
            showToast({
                type: "success",
                message: ok === 1 ? "1 membro rimosso" : `${ok} membri rimossi`,
            });
        }
        if (failed > 0) {
            showToast({
                type: "error",
                message: failed === 1
                    ? "1 membro non rimosso"
                    : `${failed} membri non rimossi`,
            });
        }
        setSelectedMemberIds([]);
        setRefreshKey(k => k + 1);
        return true;
    }, [bulkRemovePendingIds, showToast]);

    const handleBulkCancelInvites = useCallback((ids: string[]) => {
        const targets = members.filter(m => m.status === "pending" && ids.includes(m.membership_id));
        if (targets.length === 0) return;
        setInvitesToCancel(targets);
    }, [members]);

    const handleResendInvite = useCallback(async (member: TenantMemberRow) => {
        try {
            await resendInvite(member.membership_id);
        } catch (err) {
            console.error("[BusinessTeamPage] resend invite failed:", err);
            showToast({
                type: "error",
                message: inviteErrorMessage(err, "Impossibile rispedire l'invito. Riprova più tardi.")
            });
            return;
        }
        showToast({ type: "success", message: `Invito inviato di nuovo a ${member.email}.` });
        setRefreshKey(k => k + 1);
    }, [showToast]);

    const activeColumns = useMemo<ColumnDefinition<TenantMemberRow>[]>(() => {
        const base: ColumnDefinition<TenantMemberRow>[] = [
            {
                id: "person",
                header: "Persona",
                width: "2fr",
                cell: (_, row) => {
                    const isSelf = callerUserId && row.user_id === callerUserId;
                    return (
                        <span className={styles.person}>
                            {/* Iniziali dall'email: i membri non hanno ancora un nome. */}
                            <Avatar size="sm" name={row.email} />
                            <Text variant="body-sm" className={styles.emailCell}>
                                {row.email || "—"}
                            </Text>
                            {isSelf && <Badge variant="brand">Tu</Badge>}
                        </span>
                    );
                },
            },
            {
                id: "role",
                header: "Ruolo e cosa può fare",
                width: "2fr",
                cell: (_, row) => roleCell(row.effective_role),
            },
            {
                id: "activities",
                header: "Su quali sedi",
                width: "1.5fr",
                cell: (_, row) => activitiesCell(row, totalActivities),
            },
        ];

        base.push({
            id: "actions",
            header: "",
            width: "56px",
            align: "right",
            cell: (_, row) => {
                const target = {
                    role: row.effective_role,
                    activityIds: row.activity_ids,
                    userId: row.user_id ?? undefined
                };
                const canEdit = permissions ? canChangeRoleOf(permissions, target, callerUserId) : false;
                const canRemove = permissions ? canRemoveMember(permissions, target, callerUserId) : false;

                const actions: TableRowAction[] = [
                    {
                        label: "Gestisci accessi",
                        icon: UserCog,
                        onClick: () => handleChangeRole(row),
                        hidden: !canEdit,
                    },
                    {
                        label: "Rimuovi",
                        icon: UserMinus,
                        onClick: () => handleRemove(row),
                        variant: "destructive",
                        separator: true,
                        hidden: !canRemove,
                    },
                ];

                if (actions.filter(a => !a.hidden).length === 0) return null;
                return <TableRowActions actions={actions} />;
            },
        });

        return base;
    }, [permissions, callerUserId, totalActivities, handleChangeRole, handleRemove]);

    const pendingColumns = useMemo<ColumnDefinition<TenantMemberRow>[]>(() => {
        const base: ColumnDefinition<TenantMemberRow>[] = [
            {
                id: "person",
                header: "Persona",
                width: "2fr",
                // Senza Avatar: non è ancora un utente.
                cell: (_, row) => (
                    <Text variant="body-sm" className={styles.emailCell}>
                        {row.email || "—"}
                    </Text>
                ),
            },
            {
                id: "role",
                header: "Ruolo e cosa può fare",
                width: "2fr",
                cell: (_, row) => roleCell(row.effective_role),
            },
            {
                id: "activities",
                header: "Su quali sedi",
                width: "1.5fr",
                cell: (_, row) => activitiesCell(row, totalActivities),
            },
            {
                id: "invited_by",
                header: "Invitato da",
                width: "1.5fr",
                cell: (_, row) => (
                    <Text variant="body-sm" colorVariant="muted">
                        {row.invited_by_email ?? "—"}
                    </Text>
                ),
            },
            {
                id: "expiry",
                header: "Scadenza",
                width: "150px",
                cell: (_, row) => (
                    <Text variant="body-sm" colorVariant="muted">
                        {row.invite_expires_at ? formatExpiry(row.invite_expires_at) : "—"}
                    </Text>
                ),
            },
        ];

        base.push({
            id: "actions",
            header: "",
            width: "56px",
            align: "right",
            cell: (_, row) => {
                const target = {
                    role: row.effective_role,
                    activityIds: row.activity_ids,
                    userId: row.user_id ?? undefined
                };
                const canEdit = permissions ? canChangeRoleOf(permissions, target, callerUserId) : false;
                const canRemove = permissions ? canRemoveMember(permissions, target, callerUserId) : false;

                const actions: TableRowAction[] = [
                    {
                        label: "Gestisci accessi",
                        icon: UserCog,
                        onClick: () => handleChangeRole(row),
                        hidden: !canEdit,
                    },
                    {
                        label: "Rinvia invito",
                        icon: Send,
                        onClick: () => handleResendInvite(row),
                        hidden: !canEdit,
                    },
                    {
                        label: "Annulla invito",
                        icon: X,
                        onClick: () => handleCancelInvite(row),
                        variant: "destructive",
                        separator: true,
                        hidden: !canRemove,
                    },
                ];

                if (actions.filter(a => !a.hidden).length === 0) return null;
                return <TableRowActions actions={actions} />;
            },
        });

        return base;
    }, [permissions, callerUserId, totalActivities, handleChangeRole, handleResendInvite, handleCancelInvite]);

    // Sedi su cui il caller può assegnare ruoli scoped: tutte per owner/admin,
    // le sue per un manager. Serve al drawer di invito (banner «senza sedi»).
    const assignableActivityCount =
        activityIds == null || !permissions
            ? null
            : isOwnerOrAdmin(permissions)
                ? activityIds.length
                : activityIds.filter(id => permissions.activityIds.includes(id)).length;

    const isFiltered = search.trim().length > 0 || roleFilter !== "";
    const clearFilters = useCallback(() => {
        setSearch("");
        setRoleFilter("");
    }, []);
    const filteredEmptyState = {
        title: search.trim() ? `Nessun risultato per “${search.trim()}”` : "Nessun risultato per questo ruolo"
    };
    const activeCount = allActiveMemberIds.length;
    // «Solo tu» (§42.2): lo stato reale di ogni azienda in produzione. Al
    // posto della tabella, il motivo per invitare qualcuno.
    const onlyMe = !loading && !loadError && activeCount === 1 && pendingCount === 0;
    const me = onlyMe ? members.find(m => m.effective_role === "owner" || m.status === "active") : undefined;

    const loadErrorBanner = (
        <InlineBanner
            variant="error"
            action={
                <Button variant="secondary" size="sm" onClick={() => setRefreshKey(k => k + 1)}>
                    Riprova
                </Button>
            }
        >
            Non riusciamo a caricare il team.
        </InlineBanner>
    );

    const seatsNote = (
        <Text as="p" variant="caption" colorVariant="muted">
            I posti pagati contano le sedi, non le persone: invitare non costa.
        </Text>
    );

    return (
        <>
            <div className={styles.page}>
                {!permissionsLoading && permissions && !canReadTeam ? (
                    // Permesso negato: sezione «Non hai accesso», senza CTA
                    // (scheda EmptyState).
                    <EmptyState
                        variant="page"
                        icon={<Lock />}
                        title="Non hai accesso al Team"
                        description="Lo gestiscono il proprietario, gli amministratori e i manager."
                    />
                ) : loadError ? (
                    loadErrorBanner
                ) : activeTab === "members" && onlyMe && me ? (
                    <>
                        <Card flush bodyClassName={styles.rows}>
                            <ListRow
                                leading={<Avatar size="sm" name={me.email} />}
                                title={me.email}
                                subtitle={ROLE_PHRASE[me.effective_role]}
                                meta={
                                    <span className={styles.badges}>
                                        <Badge variant="brand">Tu</Badge>
                                        <Badge variant="neutral">{ROLE_LABEL[me.effective_role]}</Badge>
                                    </span>
                                }
                            />
                        </Card>
                        <Card>
                            <EmptyState
                                variant="inline"
                                title="Per ora ci sei solo tu"
                                description="Invita chi lavora con te: ognuno vede solo quello che gli serve."
                                action={
                                    canInvite ? (
                                        <Button variant="primary" onClick={() => setInviteDrawerOpen(true)}>
                                            Invita membro
                                        </Button>
                                    ) : undefined
                                }
                            >
                                <dl className={styles.roleList}>
                                    {ROLE_ORDER.filter(role => role !== "owner").map(role => (
                                        <div key={role} className={styles.roleRow}>
                                            <Text as="dt" variant="body-sm" weight={500}>
                                                {ROLE_LABEL[role]}
                                            </Text>
                                            <Text as="dd" variant="body-sm" colorVariant="muted">
                                                {ROLE_PHRASE[role]}
                                            </Text>
                                        </div>
                                    ))}
                                </dl>
                            </EmptyState>
                            <div className={styles.notes}>
                                <Text as="p" variant="caption" colorVariant="muted">
                                    Chi inviti riceve un'email e sceglie la password da sé: non devi dargli le tue credenziali.
                                </Text>
                                {seatsNote}
                            </div>
                        </Card>
                    </>
                ) : activeTab === "members" ? (
                    <div className={styles.tableBlock}>
                    <DataTable<TenantMemberRow>
                        data={filteredActiveMembers}
                        columns={activeColumns}
                        isLoading={loading}
                        isFiltered={isFiltered}
                        onClearFilters={clearFilters}
                        emptyState={filteredEmptyState}
                        getRowId={row => row.membership_id}
                        allRowIds={allActiveMemberIds}
                        selectable={canRemoveAny}
                        isRowSelectable={row =>
                            permissions
                                ? canRemoveMember(
                                      permissions,
                                      {
                                          role: row.effective_role,
                                          activityIds: row.activity_ids,
                                          userId: row.user_id ?? undefined
                                      },
                                      callerUserId
                                  )
                                : false
                        }
                        selectedRowIds={selectedMemberIds}
                        onSelectedRowsChange={setSelectedMemberIds}
                        onBulkDelete={handleBulkRemoveMembers}
                        bulkActionLabel="Rimuovi dal team"
                    />
                    {seatsNote}
                    </div>
                ) : (
                    <DataTable<TenantMemberRow>
                        data={filteredPendingInvites}
                        columns={pendingColumns}
                        isLoading={loading}
                        isFiltered={isFiltered}
                        onClearFilters={clearFilters}
                        emptyState={filteredEmptyState}
                        getRowId={row => row.membership_id}
                        allRowIds={allPendingInviteIds}
                        selectable={canRemoveAny}
                        isRowSelectable={row =>
                            permissions
                                ? canRemoveMember(
                                      permissions,
                                      {
                                          role: row.effective_role,
                                          activityIds: row.activity_ids,
                                          userId: row.user_id ?? undefined
                                      },
                                      callerUserId
                                  )
                                : false
                        }
                        selectedRowIds={selectedInviteIds}
                        onSelectedRowsChange={setSelectedInviteIds}
                        onBulkDelete={handleBulkCancelInvites}
                        bulkActionLabel="Annulla inviti"
                    />
                )}
            </div>

            {selectedTenantId && (
                <InviteMemberDrawer
                    open={inviteDrawerOpen}
                    onClose={() => setInviteDrawerOpen(false)}
                    tenantId={selectedTenantId}
                    activityCount={assignableActivityCount}
                    onSuccess={() => setRefreshKey(k => k + 1)}
                />
            )}

            <ConfirmDialog
                isOpen={memberToRemove !== null}
                onClose={() => setMemberToRemove(null)}
                onConfirm={handleConfirmRemove}
                title="Rimuovi dal team"
                message={`Rimuovere ${memberToRemove?.email || "questo membro"} dal team? Non avrà più accesso a questa azienda. Potrà essere invitato di nuovo.`}
                confirmLabel="Rimuovi"
            />

            <ConfirmDialog
                isOpen={bulkRemoveConfirmOpen}
                onClose={() => setBulkRemovePendingIds([])}
                onConfirm={handleBulkRemoveConfirm}
                title={
                    bulkRemovePendingIds.length === 1
                        ? "Rimuovi 1 membro dal team?"
                        : `Rimuovi ${bulkRemovePendingIds.length} membri dal team?`
                }
                message="I membri rimossi non avranno più accesso a questa azienda. Potranno essere invitati di nuovo."
                confirmLabel="Rimuovi"
            />

            <ConfirmDialog
                isOpen={invitesToCancel.length > 0}
                onClose={() => setInvitesToCancel([])}
                onConfirm={handleConfirmCancelInvites}
                title={invitesToCancel.length === 1 ? "Annulla l'invito" : `Annulla ${invitesToCancel.length} inviti?`}
                message={
                    invitesToCancel.length === 1
                        ? `Annullare l'invito a ${invitesToCancel[0].email}? Il link che ha ricevuto smetterà di funzionare.`
                        : "I link ricevuti smetteranno di funzionare."
                }
                confirmLabel={invitesToCancel.length === 1 ? "Annulla invito" : "Annulla inviti"}
            />

            <MemberDrawer
                open={memberDrawerTarget !== null}
                member={memberDrawerTarget}
                tenantId={selectedTenantId ?? ""}
                onClose={() => setMemberDrawerTarget(null)}
                onSuccess={() => setRefreshKey(k => k + 1)}
            />
        </>
    );
}
