import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/services/supabase/client";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import { canManage, isOwner, canDoOnTenant, canChangeRoleOf, canRemoveMember } from "@/lib/permissions";
import { usePermissions } from "@/context/PermissionsContext";
import { useAuth } from "@/context/useAuth";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { Select } from "@/components/ui/Select/Select";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions, TableRowAction } from "@/components/ui/TableRowActions/TableRowActions";
import { InviteMemberDrawer } from "@/components/Businesses/InviteMemberDrawer/InviteMemberDrawer";
import { MemberDrawer } from "@/components/Businesses/MemberDrawer/MemberDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { Lock, Send, UserCog, UserMinus, X } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import styles from "./TeamPage.module.scss";

import type { TenantMemberRow, EffectiveRole } from "@/types/team";
import { listTenantMembers } from "@/services/supabase/team";

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
    const { selectedTenant, selectedTenantId, userRole } = useTenant();
    const { showToast } = useToast();

    const [members, setMembers] = useState<TenantMemberRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const [inviteDrawerOpen, setInviteDrawerOpen] = useState(false);
    const [memberToRemove, setMemberToRemove] = useState<TenantMemberRow | null>(null);
    const [memberDrawerTarget, setMemberDrawerTarget] = useState<TenantMemberRow | null>(null);

    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("");

    const isAdmin = canManage(userRole);
    const { permissions, loading: permissionsLoading } = usePermissions();
    const { user } = useAuth();
    const callerUserId = user?.id;
    const canInvite = permissions ? canDoOnTenant(permissions, "team.invite") : false;
    const canReadTeam = permissions ? canDoOnTenant(permissions, "team.read") : false;

    usePageHeader({
        title: "Team",
        subtitle: "Gestisci i membri del team per questo business.",
        sticky: true,
    });

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
        if (!memberToRemove || !selectedTenantId) return false;

        const { error } = await supabase.rpc("remove_tenant_member", {
            p_tenant_id: selectedTenantId,
            p_user_id: memberToRemove.user_id,
        });

        if (error) {
            console.error("[BusinessTeamPage] remove member failed:", error);
            const msg = error.message ?? "";
            let userMessage = "Impossibile rimuovere il membro. Riprova più tardi.";
            if (msg.includes("cannot remove yourself")) {
                userMessage = "Non puoi rimuovere te stesso. Esci dal tenant invece.";
            } else if (msg.includes("cannot remove owner")) {
                userMessage = "Non puoi rimuovere il proprietario del tenant.";
            } else if (msg.includes("not allowed")) {
                userMessage = "Non hai i permessi per rimuovere questo membro.";
            } else if (msg.includes("member not found")) {
                userMessage = "Membro non trovato.";
            }
            showToast({ type: "error", message: userMessage });
            return false;
        }

        setRefreshKey(k => k + 1);
        return true;
    }, [memberToRemove, selectedTenantId, showToast]);

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

    const handleBulkRemoveMembers = useCallback(async (ids: string[]) => {
        if (!selectedTenantId || ids.length === 0) return;
        const rows = members.filter(
            m => m.status === "active"
              && ids.includes(m.membership_id)
              && m.effective_role !== "owner"
        );
        if (rows.length === 0) {
            showToast({ type: "error", message: "Nessun membro rimovibile selezionato." });
            setSelectedMemberIds([]);
            return;
        }
        const results = await Promise.allSettled(
            rows.map(r =>
                supabase
                    .rpc("remove_tenant_member", {
                        p_tenant_id: selectedTenantId,
                        p_user_id: r.user_id,
                    })
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
    }, [selectedTenantId, members, showToast]);

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
                        label: "Cambia ruolo",
                        icon: UserCog,
                        onClick: () => handleChangeRole(row),
                        hidden: !canEdit,
                    },
                    {
                        label: "Rimuovi membro",
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
                        label: "Cambia ruolo",
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
                ) : (
                    <>
                        <Card noHoverLift>
                            <div className={styles.cardHeader}>
                                <div className={styles.cardHeaderText}>
                                    <Text variant="title-sm" weight={600}>Membri</Text>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Membri attivi con accesso a questa attività.
                                    </Text>
                                </div>
                                {canInvite && (
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => setInviteDrawerOpen(true)}
                                    >
                                        Invita membro
                                    </Button>
                                )}
                            </div>

                            <div className={styles.filterBarWrapper}>
                                <FilterBar
                                    search={{
                                        value: search,
                                        onChange: setSearch,
                                        placeholder: "Cerca per email...",
                                    }}
                                    advancedFilters={
                                        <div className={styles.filterControls}>
                                            <Select
                                                label="Ruolo"
                                                value={roleFilter}
                                                onChange={e => setRoleFilter(e.target.value)}
                                                options={[
                                                    { value: "",        label: "Tutti" },
                                                    { value: "owner",   label: "Owner" },
                                                    { value: "admin",   label: "Admin" },
                                                    { value: "manager", label: "Manager" },
                                                    { value: "staff",   label: "Staff" },
                                                    { value: "viewer",  label: "Viewer" },
                                                ]}
                                            />
                                        </div>
                                    }
                                />
                            </div>

                            <DataTable<TenantMemberRow>
                                data={filteredActiveMembers}
                                columns={activeColumns}
                                isLoading={loading}
                                emptyState={membersEmptyState}
                                loadingState={membersLoadingState}
                                getRowId={row => row.membership_id}
                                selectable={isAdmin}
                                selectedRowIds={selectedMemberIds}
                                onSelectedRowsChange={setSelectedMemberIds}
                                onBulkDelete={handleBulkRemoveMembers}
                            />
                        </Card>

                        {members.some(m => m.status === "pending") && (
                            <Card noHoverLift>
                                <div className={styles.cardHeader}>
                                    <div className={styles.cardHeaderText}>
                                        <Text variant="title-sm" weight={600}>
                                            {`Inviti in attesa (${filteredPendingInvites.length})`}
                                        </Text>
                                        <Text variant="body-sm" colorVariant="muted">
                                            Inviti inviati in attesa di accettazione.
                                        </Text>
                                    </div>
                                </div>

                                <DataTable<TenantMemberRow>
                                    data={filteredPendingInvites}
                                    columns={pendingColumns}
                                    isLoading={loading}
                                    emptyState={invitesEmptyState}
                                    loadingState={membersLoadingState}
                                    getRowId={row => row.membership_id}
                                    selectable={isAdmin}
                                    selectedRowIds={selectedInviteIds}
                                    onSelectedRowsChange={setSelectedInviteIds}
                                    onBulkDelete={handleBulkCancelInvites}
                                />
                            </Card>
                        )}
                    </>
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
                title="Rimuovi membro"
                message={`Rimuovere ${memberToRemove?.email ?? memberToRemove?.user_id} dal team?`}
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
