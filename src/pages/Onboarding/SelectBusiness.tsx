import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import type { V2Tenant } from "@/types/tenant";

import { TENANT_KEY as STORAGE_KEY } from "@/constants/storageKeys";
import { SUBTYPE_LABELS, VERTICAL_LABELS } from "@/constants/verticalTypes";

export default function SelectBusiness() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [tenants, setTenants] = useState<V2Tenant[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        supabase
            .from("tenants")
            .select("id, owner_user_id, name, vertical_type, business_subtype, created_at, plan, subscription_status, trial_until, stripe_customer_id, stripe_subscription_id, paid_seats")
            .order("created_at", { ascending: true })
            .then(({ data }) => {
                setTenants((data as V2Tenant[]) ?? []);
                setLoading(false);
            });
    }, [user?.id]);

    const handleSelect = (id: string) => {
        localStorage.setItem(STORAGE_KEY, id);
        navigate(`/business/${id}/overview`);
    };

    if (loading) return null;

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px"
            }}
        >
            <div style={{ width: "100%", maxWidth: "480px" }}>
                <div style={{ marginBottom: "32px" }}>
                    <Text variant="title-lg" weight={700}>
                        Le tue attività
                    </Text>
                    <div style={{ marginTop: "8px" }}>
                        <Text variant="body" colorVariant="muted">
                            Scegli l&apos;attività con cui vuoi lavorare.
                        </Text>
                    </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {tenants.map(tenant => (
                        <div
                            key={tenant.id}
                            style={{
                                border: "1px solid var(--border-default)",
                                borderRadius: "8px",
                                padding: "16px 20px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "16px"
                            }}
                        >
                            <div>
                                <Text variant="body" weight={600}>
                                    {tenant.name}
                                </Text>
                                <div style={{ marginTop: "2px" }}>
                                    <Text variant="body-sm" colorVariant="muted">
                                        {(tenant.business_subtype && SUBTYPE_LABELS[tenant.business_subtype])
                                            ?? VERTICAL_LABELS[tenant.vertical_type]
                                            ?? tenant.vertical_type}
                                    </Text>
                                </div>
                            </div>

                            <Button variant="secondary" onClick={() => handleSelect(tenant.id)}>
                                Apri attività
                            </Button>
                        </div>
                    ))}
                </div>

                <div style={{ marginTop: "24px" }}>
                    <Link to="/onboarding/create-business" style={{ textDecoration: "none" }}>
                        <Text variant="body" colorVariant="primary">
                            + Aggiungi attività
                        </Text>
                    </Link>
                </div>
            </div>
        </div>
    );
}
