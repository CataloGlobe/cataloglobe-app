import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/services/supabase/client";
import { useTenant } from "@/context/useTenant";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { InviteMemberDrawer } from "@/components/Businesses/InviteMemberDrawer";
import styles from "./TeamPage.module.scss";

type TenantMemberRow = {
    tenant_id: string;
    user_id: string;
    email: string | null;
    role: string;
    status: string;
    invited_by: string | null;
    created_at: string;
};

export default function TeamPage() {
    const { selectedTenant, selectedTenantId, userRole } = useTenant();
    const [members, setMembers] = useState<TenantMemberRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [inviteDrawerOpen, setInviteDrawerOpen] = useState(false);

    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (!selectedTenantId) return;
        let cancelled = false;

        const fetchMembers = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from("v2_tenant_members_view")
                .select("tenant_id, user_id, email, role, status, invited_by, created_at")
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

        return () => {
            cancelled = true;
        };
    }, [selectedTenantId, refreshKey]);

    const handleRemove = (member: TenantMemberRow) => {
        console.warn("[BusinessTeamPage] remove member not implemented", member);
    };

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
                )
            },
            {
                id: "role",
                header: "Role",
                width: "140px",
                cell: (_, row) => (
                    <Badge variant={row.role === "owner" ? "primary" : "secondary"}>
                        {row.role === "owner" ? "Owner" : "Member"}
                    </Badge>
                )
            },
            {
                id: "status",
                header: "Status",
                width: "140px",
                cell: (_, row) => (
                    <Badge variant={row.status === "active" ? "success" : "warning"}>
                        {row.status === "active" ? "Active" : "Pending"}
                    </Badge>
                )
            },
            {
                id: "invited_by",
                header: "Invited by",
                width: "2fr",
                cell: (_, row) => (
                    <Text variant="body-sm" colorVariant="muted">
                        {row.invited_by ?? "—"}
                    </Text>
                )
            }
        ];

        if (userRole === "owner") {
            base.push({
                id: "actions",
                header: "Actions",
                width: "160px",
                align: "right",
                cell: (_, row) => (
                    <div className={styles.actionsCell} data-row-click-ignore="true">
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleRemove(row)}
                            disabled={row.role === "owner"}
                        >
                            Remove member
                        </Button>
                    </div>
                )
            });
        }

        return base;
    }, [userRole]);

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
                        {userRole === "owner" && selectedTenantId && (
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
                        <DataTable<TenantMemberRow>
                            data={members}
                            columns={columns}
                            isLoading={loading}
                            emptyState={emptyState}
                            loadingState={loadingState}
                        />
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
        </>
    );
}
