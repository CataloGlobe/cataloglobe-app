import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/services/supabase/client";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { Select } from "@/components/ui/Select/Select";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions, TableRowAction } from "@/components/ui/TableRowActions/TableRowActions";
import { InviteMemberDrawer } from "@/components/Businesses/InviteMemberDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader,
} from "@/components/ui/ModalLayout/ModalLayout";
import { Ban, Send, Trash2, UserCog, UserMinus } from "lucide-react";
import { MEMBER_STATUS_LABEL, MEMBER_STATUS_BADGE } from "@/types/v2/memberStatus";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import styles from "./TeamPage.module.scss";

type TenantMemberRow = {
    membership_id: string;
    tenant_id: string;
    user_id: string | null;
    email: string | null;
    role: string;
    status: string;
    invited_by: string | null;
    inviter_email: string | null;
    invite_token: string | null;
    invite_expires_at: string | null;
    created_at: string;
};


function formatExpiry(expiresAt: string): string {
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
    if (days <= 0) return "scade oggi";
    if (days === 1) return "scade domani";
    return `tra ${days} gg`;
}

export default function TeamPage() {
    const { selectedTenant, selectedTenantId, userRole } = useTenant();
    const { showToast } = useToast();

    const [members, setMembers] = useState<TenantMemberRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const [inviteDrawerOpen, setInviteDrawerOpen] = useState(false);
    const [memberToRemove, setMemberToRemove] = useState<TenantMemberRow | null>(null);
    const [memberToChangeRole, setMemberToChangeRole] = useState<TenantMemberRow | null>(null);
    const [pendingRole, setPendingRole] = useState("member");
    const [changingRole, setChangingRole] = useState(false);

    // Filter state — default: show only active + invited members (exclude 'left')
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("active_invited");
    const [roleFilter, setRoleFilter] = useState("");

    const isAdmin = userRole === "owner" || userRole === "admin";

    const filteredMembers = useMemo(() => {
        let result = members;

        if (search.trim()) {
            const q = search.trim().toLowerCase();
            result = result.filter(m => m.email?.toLowerCase().includes(q));
        }

        if (statusFilter === "active_invited") {
            result = result.filter(m => m.status === "active" || m.status === "invited");
        } else if (statusFilter) {
            result = result.filter(m => m.status === statusFilter);
        }

        if (roleFilter) {
            result = result.filter(m => m.role === roleFilter);
        }

        return result;
    }, [members, search, statusFilter, roleFilter]);

    useEffect(() => {
        if (!selectedTenantId) return;
        let cancelled = false;

        const fetchMembers = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from("v2_tenant_members_view")
                .select("membership_id, tenant_id, user_id, email, role, status, invited_by, inviter_email, invite_token, invite_expires_at, created_at")
                .eq("tenant_id", selectedTenantId)
                .order("created_at", { ascending: true });

            if (cancelled) return;

            if (error) {
                console.error("[BusinessTeamPage] failed to fetch members:", error);
                setMembers([]);
                setLoading(false);
                return;
            }

            setMembers((data as TenantMemberRow[]) ?? []);
            setLoading(false);
        };

        fetchMembers();
        return () => { cancelled = true; };
    }, [selectedTenantId, refreshKey]);

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
            showToast({ type: "error", message: `Errore: ${error.message}` });
            return false;
        }

        setRefreshKey(k => k + 1);
        return true;
    }, [memberToRemove, selectedTenantId, showToast]);

    const handleChangeRole = useCallback((member: TenantMemberRow) => {
        setPendingRole(member.role === "owner" ? "admin" : member.role);
        setMemberToChangeRole(member);
    }, []);

    const handleConfirmChangeRole = useCallback(async () => {
        if (!memberToChangeRole || !selectedTenantId) return;
        setChangingRole(true);

        const { error } = await supabase.rpc("change_member_role", {
            p_tenant_id: selectedTenantId,
            p_user_id: memberToChangeRole.user_id,
            p_role: pendingRole,
        });

        setChangingRole(false);

        if (error) {
            showToast({ type: "error", message: `Errore: ${error.message}` });
            return;
        }

        showToast({ type: "success", message: "Ruolo aggiornato." });
        setMemberToChangeRole(null);
        setRefreshKey(k => k + 1);
    }, [memberToChangeRole, selectedTenantId, pendingRole, showToast]);

    const handleCancelInvite = useCallback(async (member: TenantMemberRow) => {
        const { error } = await supabase.rpc("revoke_invite", {
            p_membership_id: member.membership_id,
        });

        if (error) {
            showToast({ type: "error", message: `Errore: ${error.message}` });
            return;
        }

        showToast({ type: "success", message: "Invito annullato." });
        setRefreshKey(k => k + 1);
    }, [showToast]);

    const handleResendInvite = useCallback(async (member: TenantMemberRow) => {
        const { error } = await supabase.rpc("resend_invite", {
            p_membership_id: member.membership_id,
        });

        if (error) {
            showToast({ type: "error", message: `Errore: ${error.message}` });
            return;
        }

        showToast({ type: "success", message: "Invito inviato di nuovo." });
        setRefreshKey(k => k + 1);
    }, [showToast]);

    const handleDeleteInvite = useCallback(async (member: TenantMemberRow) => {
        const { error } = await supabase.rpc("delete_invite", {
            p_membership_id: member.membership_id,
        });

        if (error) {
            showToast({ type: "error", message: `Errore: ${error.message}` });
            return;
        }

        showToast({ type: "success", message: "Invito eliminato." });
        setRefreshKey(k => k + 1);
    }, [showToast]);

    const columns = useMemo<ColumnDefinition<TenantMemberRow>[]>(() => {
        const base: ColumnDefinition<TenantMemberRow>[] = [
            {
                id: "email",
                header: "Email",
                width: "2fr",
                cell: (_, row) => (
                    <Text variant="body-sm" className={styles.emailCell}>
                        {row.email ?? "—"}
                    </Text>
                ),
            },
            {
                id: "role",
                header: "Ruolo",
                width: "140px",
                cell: (_, row) => (
                    <Badge variant={row.role === "owner" ? "primary" : "secondary"}>
                        {row.role === "owner" ? "Owner" : row.role === "admin" ? "Admin" : "Member"}
                    </Badge>
                ),
            },
            {
                id: "status",
                header: "Stato",
                width: "160px",
                cell: (_, row) => (
                    <div className={styles.statusCell}>
                        <Badge variant={MEMBER_STATUS_BADGE[row.status] ?? "secondary"}>
                            {MEMBER_STATUS_LABEL[row.status] ?? row.status}
                        </Badge>
                        {row.status === "pending" && row.invite_expires_at && (
                            <Text variant="body-sm" colorVariant="muted" className={styles.expiryHint}>
                                {formatExpiry(row.invite_expires_at)}
                            </Text>
                        )}
                    </div>
                ),
            },
            {
                id: "invited_by",
                header: "Invitato da",
                width: "2fr",
                cell: (_, row) => (
                    <Text variant="body-sm" colorVariant="muted">
                        {row.inviter_email ?? "—"}
                    </Text>
                ),
            },
        ];

        if (isAdmin) {
            base.push({
                id: "actions",
                header: "",
                width: "56px",
                align: "right",
                cell: (_, row) => {
                    let actions: TableRowAction[];

                    if (row.status === "active") {
                        actions = [
                            {
                                label: "Cambia ruolo",
                                icon: UserCog,
                                onClick: () => handleChangeRole(row),
                                hidden: row.role === "owner",
                            },
                            {
                                label: "Rimuovi membro",
                                icon: UserMinus,
                                onClick: () => handleRemove(row),
                                variant: "destructive",
                                separator: true,
                                hidden: row.role === "owner",
                            },
                        ];
                    } else if (row.status === "pending") {
                        actions = [
                            {
                                label: "Rinvia invito",
                                icon: Send,
                                onClick: () => handleResendInvite(row),
                            },
                            {
                                label: "Annulla invito",
                                icon: Ban,
                                onClick: () => handleCancelInvite(row),
                                variant: "destructive",
                                separator: true,
                            },
                        ];
                    } else {
                        // declined | revoked | expired
                        actions = [
                            {
                                label: "Reinvia invito",
                                icon: Send,
                                onClick: () => handleResendInvite(row),
                            },
                            {
                                label: "Elimina invito",
                                icon: Trash2,
                                onClick: () => handleDeleteInvite(row),
                                variant: "destructive",
                                separator: true,
                            },
                        ];
                    }

                    if (actions.filter(a => !a.hidden).length === 0) return null;

                    return (
                        <div className={styles.actionsCell} data-row-click-ignore="true">
                            <TableRowActions actions={actions} />
                        </div>
                    );
                },
            });
        }

        return base;
    }, [isAdmin, handleChangeRole, handleRemove, handleResendInvite, handleCancelInvite, handleDeleteInvite]);

    const emptyState = (
        <div className={styles.emptyState}>
            <Text variant="body">Nessun membro trovato.</Text>
        </div>
    );

    const loadingState = (
        <div className={styles.emptyState}>
            <Text variant="body">Caricamento membri...</Text>
        </div>
    );

    return (
        <>
            <div className={styles.page}>
                <PageHeader
                    title="Team"
                    subtitle="Gestisci i membri del team per questo business."
                    businessName={selectedTenant?.name}
                />

                <Card className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardHeaderText}>
                            <Text variant="title-sm" weight={600}>
                                Membri
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Visualizza ruoli e stato degli inviti per questo tenant.
                            </Text>
                        </div>
                        {isAdmin && selectedTenantId && (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => setInviteDrawerOpen(true)}
                            >
                                Invite member
                            </Button>
                        )}
                    </div>

                    {!selectedTenantId ? (
                        <div className={styles.emptyState}>
                            <Text variant="body">Seleziona un&apos;azienda per vedere i membri.</Text>
                        </div>
                    ) : (
                        <>
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
                                        label="Stato"
                                        value={statusFilter}
                                        onChange={e => setStatusFilter(e.target.value)}
                                        options={[
                                            { value: "active_invited", label: "Attivi e invitati" },
                                            { value: "",               label: "Tutti" },
                                            { value: "active",         label: "Attivi" },
                                            { value: "invited",        label: "Invitati" },
                                            { value: "left",           label: "Ex membri" },
                                        ]}
                                    />
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
                                        ]}
                                    />
                                </div>
                            }
                        />
                        </div>
                        <DataTable<TenantMemberRow>
                            data={filteredMembers}
                            columns={columns}
                            isLoading={loading}
                            emptyState={emptyState}
                            loadingState={loadingState}
                            density="extended"
                        />
                        </>
                    )}
                </Card>
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

            <ModalLayout
                isOpen={memberToChangeRole !== null}
                onClose={() => setMemberToChangeRole(null)}
                width="sm"
                height="fit"
            >
                <ModalLayoutHeader>
                    <Text variant="title-sm" weight={600}>
                        Cambia ruolo
                    </Text>
                </ModalLayoutHeader>
                <ModalLayoutContent>
                    <div className={styles.roleDialogContent}>
                        <Text variant="body-sm" colorVariant="muted">
                            {memberToChangeRole?.email}
                        </Text>
                        <Select
                            label="Nuovo ruolo"
                            value={pendingRole}
                            onChange={e => setPendingRole(e.target.value)}
                            options={[
                                { value: "admin", label: "Admin" },
                                { value: "member", label: "Member" },
                            ]}
                        />
                    </div>
                </ModalLayoutContent>
                <ModalLayoutFooter>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setMemberToChangeRole(null)}
                        disabled={changingRole}
                    >
                        Annulla
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleConfirmChangeRole}
                        loading={changingRole}
                    >
                        Salva
                    </Button>
                </ModalLayoutFooter>
            </ModalLayout>
        </>
    );
}
