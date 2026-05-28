import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/services/supabase/client";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import { canManage, isOwner } from "@/lib/permissions";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { Select } from "@/components/ui/Select/Select";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions, TableRowAction } from "@/components/ui/TableRowActions/TableRowActions";
import { InviteMemberDrawer } from "@/components/Businesses/InviteMemberDrawer";
import { MemberDrawer } from "@/components/Businesses/MemberDrawer/MemberDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { Send, UserCog, UserMinus, X } from "lucide-react";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import styles from "./TeamPage.module.scss";

import type { TenantMemberRow } from "@/types/team";
import { listTenantMembers } from "@/services/supabase/team";

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
    const [memberDrawerTarget, setMemberDrawerTarget] = useState<TenantMemberRow | null>(null);

    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("");

    const isAdmin = canManage(userRole);

    usePageHeader({
        title: "Team",
        subtitle: "Gestisci i membri del team per questo business.",
        sticky: true,
    });

    const filteredActiveMembers = useMemo(() => {
        let result = members.filter(m => m.status === "active");
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            result = result.filter(m => m.email?.toLowerCase().includes(q));
        }
        if (roleFilter) {
            result = result.filter(m => m.role === roleFilter);
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
            m => m.status === "active" && ids.includes(m.membership_id) && !isOwner(m.role)
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
        ];

        if (isAdmin) {
            base.push({
                id: "actions",
                header: "",
                width: "56px",
                align: "right",
                cell: (_, row) => {
                    const actions: TableRowAction[] = [
                        {
                            label: "Cambia ruolo",
                            icon: UserCog,
                            onClick: () => handleChangeRole(row),
                            hidden: isOwner(row.role),
                        },
                        {
                            label: "Rimuovi membro",
                            icon: UserMinus,
                            onClick: () => handleRemove(row),
                            variant: "destructive",
                            separator: true,
                            hidden: isOwner(row.role),
                        },
                    ];

                    if (actions.filter(a => !a.hidden).length === 0) return null;

                    return <TableRowActions actions={actions} />;
                },
            });
        }

        return base;
    }, [isAdmin, handleChangeRole, handleRemove]);

    const pendingColumns = useMemo<ColumnDefinition<TenantMemberRow>[]>(() => {
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
                width: "120px",
                cell: (_, row) => (
                    <Badge variant="secondary">
                        {row.role === "admin" ? "Admin" : "Member"}
                    </Badge>
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

        if (isAdmin) {
            base.push({
                id: "actions",
                header: "",
                width: "56px",
                align: "right",
                cell: (_, row) => {
                    const actions: TableRowAction[] = [
                        {
                            label: "Rinvia invito",
                            icon: Send,
                            onClick: () => handleResendInvite(row),
                        },
                        {
                            label: "Annulla invito",
                            icon: X,
                            onClick: () => handleCancelInvite(row),
                            variant: "destructive",
                            separator: true,
                        },
                    ];

                    return <TableRowActions actions={actions} />;
                },
            });
        }

        return base;
    }, [isAdmin, handleResendInvite, handleCancelInvite]);

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
                                {isAdmin && (
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
                                                    { value: "member",  label: "Member" },
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
