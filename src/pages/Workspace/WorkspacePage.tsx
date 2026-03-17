import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import Text from "@/components/ui/Text/Text";
import BusinessCard from "@/components/Businesses/BusinessCard";
import { CreateBusinessDrawer } from "@/components/Businesses/CreateBusinessDrawer";
import { InviteModal, PendingInviteData } from "@/components/Businesses/InviteModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { leaveTenant, restoreTenant, getDeletedTenants, purgeTenantNow } from "@/services/supabase/tenants";
import type { DeletedTenant } from "@/services/supabase/tenants";
import type { V2Tenant } from "@/types/tenant";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/context/Toast/ToastContext";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import styles from "./WorkspacePage.module.scss";

import { TENANT_KEY as STORAGE_KEY } from "@/constants/storageKeys";

function countByTenant(rows: { tenant_id: string }[] | null): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const row of rows ?? []) {
        counts[row.tenant_id] = (counts[row.tenant_id] ?? 0) + 1;
    }
    return counts;
}

export default function WorkspacePage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [tenants, setTenants] = useState<V2Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [locationCounts, setLocationCounts] = useState<Record<string, number>>({});
    const [productCounts, setProductCounts] = useState<Record<string, number>>({});
    const [catalogCounts, setCatalogCounts] = useState<Record<string, number>>({});
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [pendingInvites, setPendingInvites] = useState<PendingInviteData[]>([]);
    const [activeInvite, setActiveInvite] = useState<PendingInviteData | null>(null);
    const [leaveTarget, setLeaveTarget] = useState<{ id: string; name: string } | null>(null);
    const [deletedTenants, setDeletedTenants] = useState<DeletedTenant[]>([]);
    const [deletedSectionOpen, setDeletedSectionOpen] = useState(false);
    const [purgeTarget, setPurgeTarget] = useState<{ id: string; name: string } | null>(null);
    const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const fetchInvites = async () => {
            // Step 1: fetch pending membership rows with inviter info from the view
            const { data: rows } = await supabase
                .from("tenant_members_view")
                .select("membership_id, invite_token, role, tenant_id, inviter_email")
                .eq("status", "pending");

            if (!rows || rows.length === 0) {
                setPendingInvites([]);
                return;
            }

            // Step 2: batch-fetch tenant names
            const tenantIds = [...new Set(rows.map((r: any) => r.tenant_id as string))];
            const { data: tenantRows } = await supabase
                .from("tenants")
                .select("id, name")
                .in("id", tenantIds);

            const nameById: Record<string, string> = {};
            for (const t of tenantRows ?? []) {
                nameById[(t as any).id] = (t as any).name;
            }

            setPendingInvites(
                rows.map((r: any) => ({
                    id: r.membership_id as string,
                    invite_token: r.invite_token as string,
                    role: r.role as string,
                    tenant_id: r.tenant_id as string,
                    tenant_name: nameById[r.tenant_id] ?? "",
                    inviter_email: (r.inviter_email as string | null) ?? null,
                }))
            );
        };

        fetchInvites();
    }, [user?.id]);

    const loadTenants = async () => {
        if (!user) return;
        const [activeResult, deletedResult] = await Promise.all([
            supabase
                .from("user_tenants_view")
                .select("id, owner_user_id, name, vertical_type, created_at, user_role")
                .order("created_at", { ascending: true }),
            getDeletedTenants().catch(() => [] as DeletedTenant[])
        ]);
        setTenants((activeResult.data as V2Tenant[]) ?? []);
        setDeletedTenants(deletedResult);
        setLoading(false);
    };

    useEffect(() => {
        loadTenants();
    }, [user?.id]);

    // Batch-fetch stats for all tenants in parallel
    useEffect(() => {
        if (tenants.length === 0) return;
        const ids = tenants.map(t => t.id);

        Promise.all([
            supabase.from("activities").select("tenant_id").in("tenant_id", ids),
            supabase.from("products").select("tenant_id").in("tenant_id", ids),
            supabase.from("catalogs").select("tenant_id").in("tenant_id", ids)
        ]).then(([loc, prod, cat]) => {
            setLocationCounts(countByTenant(loc.data));
            setProductCounts(countByTenant(prod.data));
            setCatalogCounts(countByTenant(cat.data));
        });
    }, [tenants.length]);

    const handleSelect = (id: string) => {
        localStorage.setItem(STORAGE_KEY, id);
        navigate(`/business/${id}/overview`);
    };

    const handleInviteAccepted = (tenantId: string) => {
        setActiveInvite(null);
        localStorage.setItem(STORAGE_KEY, tenantId);
        navigate(`/business/${tenantId}/overview`);
    };

    const handleInviteDeclined = (inviteId: string) => {
        setActiveInvite(null);
        setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
    };

    const handleLeaveRequest = (id: string) => {
        const tenant = tenants.find(t => t.id === id);
        if (!tenant) return;
        setLeaveTarget({ id, name: tenant.name });
    };

    const getDaysLeft = (deletedAt: string): number => {
        const purgeDate = new Date(deletedAt);
        purgeDate.setDate(purgeDate.getDate() + 30);
        return Math.max(0, Math.ceil((purgeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    };

    const formatDeletedAt = (deletedAt: string): string =>
        new Date(deletedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

    const handleRestore = async (tenantId: string) => {
        setActionInProgressId(tenantId);
        try {
            await restoreTenant(tenantId);
            await loadTenants();
        } catch (err) {
            showToast({
                type: "error",
                message: err instanceof Error ? err.message : "Errore durante il ripristino."
            });
        } finally {
            setActionInProgressId(null);
        }
    };

    const handlePurgeConfirm = async (): Promise<boolean> => {
        if (!purgeTarget) return false;
        setActionInProgressId(purgeTarget.id);
        try {
            await purgeTenantNow(purgeTarget.id);
            setDeletedTenants(prev => prev.filter(t => t.id !== purgeTarget.id));
            return true;
        } catch (err) {
            if (err instanceof Error && err.message.includes("Azienda non trovata")) {
                await loadTenants();
            }
            showToast({
                type: "error",
                message: err instanceof Error ? err.message : "Errore durante l'eliminazione."
            });
            return false;
        } finally {
            setActionInProgressId(null);
        }
    };

    const handleLeaveConfirm = async (): Promise<boolean> => {
        if (!leaveTarget) return false;
        try {
            await leaveTenant(leaveTarget.id);
            setTenants(prev => prev.filter(t => t.id !== leaveTarget.id));
            return true;
        } catch {
            return false;
        }
    };

    const deletedColumns = useMemo<ColumnDefinition<DeletedTenant>[]>(() => [
        {
            id: "name",
            header: "Azienda",
            cell: (_, row) => <Text variant="body-sm" weight={600}>{row.name}</Text>,
        },
        {
            id: "deleted_at",
            header: "Eliminata il",
            width: "140px",
            cell: (_, row) => (
                <Text variant="body-sm" colorVariant="muted">{formatDeletedAt(row.deleted_at)}</Text>
            ),
        },
        {
            id: "purge_date",
            header: "Cancellazione definitiva",
            width: "200px",
            cell: (_, row) => {
                const daysLeft = getDaysLeft(row.deleted_at);
                const isUrgent = daysLeft <= 3;
                return (
                    <span className={isUrgent ? styles.purgeUrgent : styles.purgeNormal}>
                        {isUrgent
                            ? (daysLeft === 0 ? "⚠ Scaduta" : `⚠ tra ${daysLeft} giorn${daysLeft === 1 ? "o" : "i"}`)
                            : `In ${daysLeft} giorn${daysLeft === 1 ? "o" : "i"}`}
                    </span>
                );
            },
        },
        {
            id: "actions",
            header: "",
            width: "56px",
            align: "right",
            cell: (_, row) => (
                <TableRowActions
                    actions={[
                        {
                            label: "Ripristina",
                            onClick: () => handleRestore(row.id),
                        },
                        {
                            label: "Elimina definitivamente",
                            variant: "destructive",
                            separator: true,
                            onClick: () => setPurgeTarget({ id: row.id, name: row.name }),
                        },
                    ]}
                />
            ),
        },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [handleRestore]);

    const header = (
        <div className={styles.header}>
            <Text variant="title-lg" weight={700}>
                Workspace
            </Text>
            <Text variant="body" colorVariant="muted" style={{ marginTop: 6 }}>
                Gestisci le tue aziende e accedi alle loro dashboard.
            </Text>
        </div>
    );

    if (loading) {
        return (
            <div className={styles.page}>
                <div className={styles.container}>{header}</div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                {header}

                {pendingInvites.length > 0 && (
                    <div className={styles.pendingSection}>
                        <Text variant="body" weight={600}>
                            {pendingInvites.length === 1
                                ? "Hai un invito in attesa"
                                : `Hai ${pendingInvites.length} inviti in attesa`}
                        </Text>
                        <div className={styles.pendingList}>
                            {pendingInvites.map(invite => (
                                <div key={invite.id} className={styles.pendingCard}>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Sei stato invitato a partecipare a{" "}
                                        <strong>{invite.tenant_name}</strong>
                                        {invite.inviter_email && (
                                            <> da <strong>{invite.inviter_email}</strong></>
                                        )}
                                    </Text>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => setActiveInvite(invite)}
                                    >
                                        Visualizza invito
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className={styles.grid}>
                    {tenants.map(tenant => (
                        <BusinessCard
                            key={tenant.id}
                            tenant={tenant}
                            locationCount={locationCounts[tenant.id] ?? 0}
                            productCount={productCounts[tenant.id] ?? 0}
                            catalogCount={catalogCounts[tenant.id] ?? 0}
                            onSelect={handleSelect}
                            onOpenSettings={id => navigate(`/business/${id}/settings`)}
                            onLeave={handleLeaveRequest}
                        />
                    ))}

                    <button className={styles.createCard} onClick={() => setDrawerOpen(true)}>
                        <div className={styles.createIconWrapper}>
                            <Plus size={20} />
                        </div>
                        <Text variant="body" weight={600}>
                            Crea azienda
                        </Text>
                    </button>
                </div>

                {deletedTenants.length > 0 && (
                    <div className={styles.deletedSection}>
                        <div className={styles.deletedSectionHeader}>
                            <Text variant="body" weight={600}>
                                {`Aziende in eliminazione (${deletedTenants.length})`}
                            </Text>
                            <button
                                className={styles.deletedToggle}
                                onClick={() => setDeletedSectionOpen(o => !o)}
                            >
                                {deletedSectionOpen ? "Nascondi" : "Mostra"}
                            </button>
                        </div>

                        {deletedSectionOpen && (
                            <div className={styles.deletedTableWrapper}>
                                <DataTable<DeletedTenant>
                                    data={[...deletedTenants].sort((a, b) =>
                                        new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime()
                                    )}
                                    columns={deletedColumns}
                                    density="compact"
                                    rowClassName={row =>
                                        actionInProgressId === row.id ? styles.rowInProgress : undefined
                                    }
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            <CreateBusinessDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

            <ConfirmDialog
                isOpen={leaveTarget !== null}
                onClose={() => setLeaveTarget(null)}
                onConfirm={handleLeaveConfirm}
                title={`Lasciare "${leaveTarget?.name}"?`}
                message="Non avrai più accesso a questa azienda. Potrai essere reinvitato dal proprietario."
                confirmLabel="Lascia azienda"
            />

            <ConfirmDialog
                isOpen={purgeTarget !== null}
                onClose={() => setPurgeTarget(null)}
                onConfirm={handlePurgeConfirm}
                title="Eliminare definitivamente questa azienda?"
                message="Questa operazione è irreversibile. Tutti i dati dell'azienda verranno cancellati definitivamente."
                confirmLabel="Elimina definitivamente"
            />

            <InviteModal
                invite={activeInvite}
                onClose={() => setActiveInvite(null)}
                onAccepted={handleInviteAccepted}
                onDeclined={handleInviteDeclined}
            />
        </div>
    );
}
