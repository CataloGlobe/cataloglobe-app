import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import Text from "@/components/ui/Text/Text";
import BusinessCard from "@/components/Businesses/BusinessCard";
import { CreateBusinessDrawer } from "@/components/Businesses/CreateBusinessDrawer";
import type { V2Tenant } from "@/types/v2/tenant";
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

    useEffect(() => {
        if (!user) return;
        supabase
            .from("v2_tenants")
            .select("id, owner_user_id, name, vertical_type, created_at")
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

                <div className={styles.grid}>
                    {tenants.map(tenant => (
                        <BusinessCard
                            key={tenant.id}
                            tenant={tenant}
                            locationCount={locationCounts[tenant.id] ?? 0}
                            productCount={productCounts[tenant.id] ?? 0}
                            catalogCount={catalogCounts[tenant.id] ?? 0}
                            onSelect={handleSelect}
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
        </div>
    );
}
