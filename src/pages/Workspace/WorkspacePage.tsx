import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import Text from "@/components/ui/Text/Text";
import BusinessCard from "@/components/Businesses/BusinessCard";
import { CreateBusinessDrawer } from "@/components/Businesses/CreateBusinessDrawer";
import { InviteModal, PendingInviteData } from "@/components/Businesses/InviteModal";
import type { V2Tenant } from "@/types/v2/tenant";
import { Button } from "@/components/ui/Button/Button";
import styles from "./WorkspacePage.module.scss";

const STORAGE_KEY = "cg_v2_selected_tenant_id";

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

    const [tenants, setTenants] = useState<V2Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [locationCounts, setLocationCounts] = useState<Record<string, number>>({});
    const [productCounts, setProductCounts] = useState<Record<string, number>>({});
    const [catalogCounts, setCatalogCounts] = useState<Record<string, number>>({});
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [pendingInvites, setPendingInvites] = useState<PendingInviteData[]>([]);
    const [activeInvite, setActiveInvite] = useState<PendingInviteData | null>(null);

    useEffect(() => {
        if (!user) return;

        const fetchInvites = async () => {
            // Step 1: fetch pending membership rows with inviter info from the view
            const { data: rows } = await supabase
                .from("v2_tenant_members_view")
                .select("membership_id, invite_token, role, tenant_id, inviter_email")
                .eq("status", "pending");

            if (!rows || rows.length === 0) {
                setPendingInvites([]);
                return;
            }

            // Step 2: batch-fetch tenant names
            const tenantIds = [...new Set(rows.map((r: any) => r.tenant_id as string))];
            const { data: tenantRows } = await supabase
                .from("v2_tenants")
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

    useEffect(() => {
        if (!user) return;
        supabase
            .from("v2_user_tenants_view")
            .select("id, owner_user_id, name, vertical_type, created_at, user_role")
            .order("created_at", { ascending: true })
            .then(({ data }) => {
                setTenants((data as V2Tenant[]) ?? []);
                setLoading(false);
            });
    }, [user?.id]);

    // Batch-fetch stats for all tenants in parallel
    useEffect(() => {
        if (tenants.length === 0) return;
        const ids = tenants.map(t => t.id);

        Promise.all([
            supabase.from("v2_activities").select("tenant_id").in("tenant_id", ids),
            supabase.from("v2_products").select("tenant_id").in("tenant_id", ids),
            supabase.from("v2_catalogs").select("tenant_id").in("tenant_id", ids)
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
                            onLeave={_id => { /* Step 2 */ }}
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
            </div>

            <CreateBusinessDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

            <InviteModal
                invite={activeInvite}
                onClose={() => setActiveInvite(null)}
                onAccepted={handleInviteAccepted}
                onDeclined={handleInviteDeclined}
            />
        </div>
    );
}
