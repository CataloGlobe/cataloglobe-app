import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/services/supabase/client";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import { canDoOnTenant, canChangeRoleOf, canRemoveMember } from "@/lib/permissions";
import { usePermissions } from "@/context/PermissionsContext";
import { useAuth } from "@/context/useAuth";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
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
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import styles from "./TeamPage.module.scss";

import type { TenantMemberRow, EffectiveRole } from "@/types/team";
import { listTenantMembers, removeTenantMember } from "@/services/supabase/team";

function formatExpiry(expiresAt: string): string {
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
    if (days <= 0) return "scade oggi";
    if (days === 1) return "scade domani";
    return `tra ${days} gg`;
}

const ROLE_BADGE_LABEL: Record<EffectiveRole, string> = {
    owner: "Owner",
    admin: "Admin",
    manager: "Manager",
    staff: "Staff",
    viewer: "Viewer"
};

const ROLE_BADGE_CLASS: Record<EffectiveRole, string> = {
    owner: styles.roleOwner,
    admin: styles.roleAdmin,
    manager: styles.roleManager,
    staff: styles.roleStaff,
    viewer: styles.roleViewer
};

function RoleBadge({ role }: { role: EffectiveRole }) {
    return (
        <span className={`${styles.roleBadge} ${ROLE_BADGE_CLASS[role]}`}>
            {ROLE_BADGE_LABEL[role]}
        </span>
    );
}

function ActivitiesCell({ member }: { member: TenantMemberRow }) {
    if (member.effective_role === "owner" || member.effective_role === "admin") {
        return (
            <Text variant="body-sm" colorVariant="muted">
                Tutte le sedi
            </Text>
        );
    }
    if (member.activity_names.length === 0) {
        return (
            <Text variant="body-sm" colorVariant="muted">
                —
            </Text>
        );
    }
    if (member.activity_names.length <= 2) {
        return (
            <Text variant="body-sm">
                {member.activity_names.join(", ")}
            </Text>
        );
    }
    return (
        <Text variant="body-sm" title={member.activity_names.join(", ")}>
            {member.activity_names.length} sedi
        </Text>
    );
}

export default function TeamPage() {
    const { selectedTenant, selectedTenantId } = useTenant();
    const { showToast } = useToast();

    const [members, setMembers] = useState<TenantMemberRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

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
        return result;
    }, [members, search]);

    const pendingCount = useMemo(
        () => members.filter(m => m.status === "pending").length,
        [members]
    );

    // ── Header band: leading (tab line) + actions (search + filtro + CTA) ──
    const leading = useMemo(() => (
        <Tabs<TeamTab>
            value={activeTab}
            onChange={handleTabChange}
            variant="line"
        >
            <Tabs.List>
                <Tabs.Tab value="members">Membri</Tabs.Tab>
                <Tabs.Tab value="invites">
                    {pendingCount > 0
                        ? `Inviti in attesa · ${pendingCount}`
                        : "Inviti in attesa"}
                </Tabs.Tab>
            </Tabs.List>
        </Tabs>
    ), [activeTab, handleTabChange, pendingCount]);

    const headerActions = useMemo(() => (
        <>
            <ToolbarSearch
                value={search}
                onChange={setSearch}
                placeholder="Cerca per email..."
            />
            <Select
                aria-label="Filtra per ruolo"
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                containerClassName={styles.toolbarFilter}
                selectClassName={styles.toolbarFilterSelect}
                options={[
                    { value: "", label: "Tutti i ruoli" },
                    { value: "owner", label: "Owner" },
                    { value: "admin", label: "Admin" },
                    { value: "manager", label: "Manager" },
                    { value: "staff", label: "Staff" },
                    { value: "viewer", label: "Viewer" }
                ]}
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
    ), [search, roleFilter, canInvite]);

    usePageHeader({
        leading: canReadTeam ? leading : undefined,
        actions: canReadTeam ? headerActions : undefined,
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
            try {
                const data = await listTenantMembers(selectedTenantId);
                if (cancelled) return;
                setMembers(data);
            } catch (error) {
                if (cancelled) return;
                console.error("[BusinessTeamPage] failed to fetch members:", error);
                setMembers([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchMembers();
        return () => { cancelled = true; };
    }, [selectedTenantId, refreshKey, permissions, canReadTeam]);

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

    const handleCancelInvite = useCallback(async (member: TenantMemberRow) => {
        const { error } = await supabase.rpc("revoke_invite", {
            p_membership_id: member.membership_id,
        });

        if (error) {
            console.error("[BusinessTeamPage] revoke invite failed:", error);
            const msg = error.message ?? "";
            let userMessage = "Impossibile annullare l'invito. Riprova più tardi.";
            if (msg.includes("not allowed")) {
                userMessage = "Non hai i permessi per annullare questo invito.";
            } else if (msg.includes("member not found")) {
                userMessage = "Invito non trovato.";
            }
            showToast({ type: "error", message: userMessage });
            return;
        }

        showToast({ type: "success", message: "Invito annullato." });
        setRefreshKey(k => k + 1);
    }, [showToast]);

    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
    const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);
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

    const handleBulkCancelInvites = useCallback(async (ids: string[]) => {
        if (ids.length === 0) return;
        const results = await Promise.allSettled(
            ids.map(id =>
                supabase
                    .rpc("revoke_invite", { p_membership_id: id })
                    .then(({ error }) => {
                        if (error) throw error;
                    })
            )
        );
        const failed = results.filter(r => r.status === "rejected").length;
        const ok = results.length - failed;
        if (ok > 0) {
            showToast({
                type: "success",
                message: ok === 1 ? "1 invito annullato" : `${ok} inviti annullati`,
            });
        }
        if (failed > 0) {
            showToast({
                type: "error",
                message: failed === 1
                    ? "1 invito non annullato"
                    : `${failed} inviti non annullati`,
            });
        }
        setSelectedInviteIds([]);
        setRefreshKey(k => k + 1);
    }, [showToast]);

    const handleResendInvite = useCallback(async (member: TenantMemberRow) => {
        const { error } = await supabase.rpc("resend_invite", {
            p_membership_id: member.membership_id,
        });

        if (error) {
            console.error("[BusinessTeamPage] resend invite failed:", error);
            const msg = error.message ?? "";
            let userMessage = "Impossibile rispedire l'invito. Riprova più tardi.";
            if (msg.includes("cannot resend invite to an active member")) {
                userMessage = "L'invito è già stato accettato. Non serve rispedirlo.";
            } else if (msg.includes("not allowed")) {
                userMessage = "Non hai i permessi per rispedire questo invito.";
            }
            showToast({ type: "error", message: userMessage });
            return;
        }

        showToast({ type: "success", message: "Invito inviato di nuovo." });
        setRefreshKey(k => k + 1);
    }, [showToast]);

    const activeColumns = useMemo<ColumnDefinition<TenantMemberRow>[]>(() => {
        const base: ColumnDefinition<TenantMemberRow>[] = [
            {
                id: "email",
                header: "Email",
                width: "2fr",
                cell: (_, row) => {
                    const isSelf = callerUserId && row.user_id === callerUserId;
                    return (
                        <span className={styles.emailWithBadge}>
                            <Text variant="body-sm" className={styles.emailCell}>
                                {row.email || "—"}
                            </Text>
                            {isSelf && <Badge variant="secondary">Tu</Badge>}
                        </span>
                    );
                },
            },
            {
                id: "role",
                header: "Ruolo",
                width: "120px",
                cell: (_, row) => <RoleBadge role={row.effective_role} />,
            },
            {
                id: "activities",
                header: "Sedi",
                width: "2fr",
                cell: (_, row) => <ActivitiesCell member={row} />,
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
    }, [permissions, callerUserId, handleChangeRole, handleRemove]);

    const pendingColumns = useMemo<ColumnDefinition<TenantMemberRow>[]>(() => {
        const base: ColumnDefinition<TenantMemberRow>[] = [
            {
                id: "email",
                header: "Email",
                width: "2fr",
                cell: (_, row) => (
                    <Text variant="body-sm" className={styles.emailCell}>
                        {row.email || "—"}
                    </Text>
                ),
            },
            {
                id: "role",
                header: "Ruolo",
                width: "120px",
                cell: (_, row) => <RoleBadge role={row.effective_role} />,
            },
            {
                id: "activities",
                header: "Sedi",
                width: "1.5fr",
                cell: (_, row) => <ActivitiesCell member={row} />,
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
                width: "120px",
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
    }, [permissions, callerUserId, handleChangeRole, handleResendInvite, handleCancelInvite]);

    const membersEmptyState = { title: "Nessun membro trovato." };
    const membersLoadingState = { message: "Caricamento membri..." };
    const invitesEmptyState = { title: "Nessun invito in attesa." };

    return (
        <>
            <div className={styles.page}>
                {!selectedTenantId ? (
                    <Card noHoverLift>
                        <div className={styles.emptyState}>
                            <Text variant="body">Seleziona un&apos;attività per vedere i membri.</Text>
                        </div>
                    </Card>
                ) : !permissionsLoading && permissions && !canReadTeam ? (
                    <div className={styles.lockedWrap}>
                        <EmptyState
                            icon={<Lock size={40} strokeWidth={1.5} />}
                            title="Non hai accesso alla gestione del team"
                            description="La gestione dei membri del team è riservata a proprietario, amministratori e manager. Contatta il proprietario o un amministratore se hai bisogno di accedere a queste informazioni."
                        />
                    </div>
                ) : activeTab === "members" ? (
                    <DataTable<TenantMemberRow>
                        data={filteredActiveMembers}
                        columns={activeColumns}
                        isLoading={loading}
                        emptyState={membersEmptyState}
                        loadingState={membersLoadingState}
                        getRowId={row => row.membership_id}
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
                ) : (
                    <DataTable<TenantMemberRow>
                        data={filteredPendingInvites}
                        columns={pendingColumns}
                        isLoading={loading}
                        emptyState={invitesEmptyState}
                        loadingState={membersLoadingState}
                        getRowId={row => row.membership_id}
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
                    onSuccess={() => setRefreshKey(k => k + 1)}
                />
            )}

            <ConfirmDialog
                isOpen={memberToRemove !== null}
                onClose={() => setMemberToRemove(null)}
                onConfirm={handleConfirmRemove}
                title="Rimuovi dal team"
                message={`Rimuovere ${memberToRemove?.email ?? memberToRemove?.user_id} dal team? Non avrà più accesso a questa azienda. Può essere reinvitato in futuro.`}
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
                message="I membri rimossi non avranno più accesso a questa azienda. Possono essere reinvitati in futuro."
                confirmLabel="Rimuovi"
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
