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
import { MemberDrawer } from "@/components/Businesses/MemberDrawer/MemberDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { Send, UserCog, UserMinus, X } from "lucide-react";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import styles from "./TeamPage.module.scss";

import type { TenantMemberRow } from "@/types/team";

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

    const isAdmin = userRole === "owner" || userRole === "admin";

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
            const { data, error } = await supabase
                .from("tenant_members_view")
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
        setMemberDrawerTarget(member);
    }, []);

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

                    return (
                        <div className={styles.actionsCell} data-row-click-ignore="true">
                            <TableRowActions actions={actions} />
                        </div>
                    );
                },
            });
        }

        return base;
    }, [isAdmin, handleResendInvite, handleCancelInvite]);

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

                {!selectedTenantId ? (
                    <Card className={styles.card}>
                        <div className={styles.emptyState}>
                            <Text variant="body">Seleziona un&apos;azienda per vedere i membri.</Text>
                        </div>
                    </Card>
                ) : (
                    <>
                        <Card className={styles.card}>
                            <div className={styles.cardHeader}>
                                <div className={styles.cardHeaderText}>
                                    <Text variant="title-sm" weight={600}>Membri</Text>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Membri attivi con accesso a questa azienda.
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
                                emptyState={emptyState}
                                loadingState={loadingState}
                                density="extended"
                            />
                        </Card>

                        {members.some(m => m.status === "pending") && (
                            <Card className={styles.card}>
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
                                    emptyState={
                                        <div className={styles.emptyState}>
                                            <Text variant="body">Nessun invito in attesa.</Text>
                                        </div>
                                    }
                                    loadingState={loadingState}
                                    density="compact"
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
