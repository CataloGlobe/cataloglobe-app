import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { MEMBER_STATUS_LABEL, MEMBER_STATUS_BADGE } from "@/types/memberStatus";
import styles from "./TeamPage.module.scss";

import { TENANT_KEY as STORAGE_KEY } from "@/constants/storageKeys";

type TenantMemberRow = {
    tenant_id: string;
    user_id: string;
    email: string | null;
    role: string;
    status: string;
    invited_by: string | null;
    created_at: string;
};

type UserTenantRow = {
    id: string;
    name: string;
    user_role: "owner" | "member" | null;
};

export default function TeamPage() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
    const [selectedTenantName, setSelectedTenantName] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<"owner" | "member" | null>(null);
    const [members, setMembers] = useState<TenantMemberRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const [memberToRemove, setMemberToRemove] = useState<TenantMemberRow | null>(null);

    useEffect(() => {
        setSelectedTenantId(localStorage.getItem(STORAGE_KEY));
    }, []);

    useEffect(() => {
        if (!user || !selectedTenantId) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        const fetchData = async () => {
            setLoading(true);

            const [membersRes, tenantRes] = await Promise.all([
                supabase
                    .from("tenant_members_view")
                    .select("tenant_id, user_id, email, role, status, invited_by, created_at")
                    .eq("tenant_id", selectedTenantId)
                    .order("created_at", { ascending: true }),
                supabase
                    .from("user_tenants_view")
                    .select("id, name, user_role")
                    .eq("id", selectedTenantId)
                    .maybeSingle()
            ]);

            if (cancelled) return;

            if (membersRes.error) {
                console.error("[TeamPage] failed to fetch members:", membersRes.error);
                setMembers([]);
            } else {
                setMembers((membersRes.data as TenantMemberRow[]) ?? []);
            }

            if (tenantRes.error) {
                console.error("[TeamPage] failed to fetch tenant role:", tenantRes.error);
                setUserRole(null);
                setSelectedTenantName(null);
            } else {
                const tenant = tenantRes.data as UserTenantRow | null;
                setUserRole(tenant?.user_role ?? null);
                setSelectedTenantName(tenant?.name ?? null);
            }

            setLoading(false);
        };

        fetchData();

        return () => {
            cancelled = true;
        };
    }, [user?.id, selectedTenantId, refreshKey]);

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
            console.error("[TeamPage] remove member failed:", error);
            showToast({ type: "error", message: `Errore: ${error.message}` });
            return false;
        }

        setRefreshKey(k => k + 1);
        return true;
    }, [memberToRemove, selectedTenantId, showToast]);

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
                    <Badge variant={MEMBER_STATUS_BADGE[row.status] ?? "secondary"}>
                        {MEMBER_STATUS_LABEL[row.status] ?? row.status}
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
    }, [userRole, handleRemove]);

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
        <div className={styles.page}>
            <div className={styles.container}>
                <PageHeader
                    title="Team"
                    subtitle="Gestisci i membri del tuo business."
                    businessName={selectedTenantName ?? undefined}
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
                    </div>

                    {!selectedTenantId ? (
                        <div className={styles.emptyState}>
                            <Text variant="body">
                                Seleziona un&apos;attività dal workspace per vedere i membri.
                            </Text>
                        </div>
                    ) : (
                        <DataTable<TenantMemberRow>
                            data={members}
                            columns={columns}
                            isLoading={loading}
                            emptyState={emptyState}
                            loadingState={loadingState}
                            density="extended"
                        />
                    )}
                </Card>
            </div>

            <ConfirmDialog
                isOpen={memberToRemove !== null}
                onClose={() => setMemberToRemove(null)}
                onConfirm={handleConfirmRemove}
                title="Rimuovi membro"
                message={`Rimuovere ${memberToRemove?.email ?? memberToRemove?.user_id} dal team?`}
                confirmLabel="Rimuovi"
            />
        </div>
    );
}
