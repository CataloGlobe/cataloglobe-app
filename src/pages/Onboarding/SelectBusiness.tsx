import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import type { V2Tenant } from "@/types/tenant";

import { TENANT_KEY as STORAGE_KEY } from "@/constants/storageKeys";

const VERTICAL_LABELS: Record<string, string> = {
    restaurant: "Ristorante",
    bar: "Bar",
    retail: "Negozio",
    hotel: "Hotel",
    generic: "Generico"
};

export default function SelectBusiness() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [tenants, setTenants] = useState<V2Tenant[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        supabase
            .from("tenants")
            .select("id, owner_user_id, name, vertical_type, created_at")
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
                        Le tue aziende
                    </Text>
                    <div style={{ marginTop: "8px" }}>
                        <Text variant="body" colorVariant="muted">
                            Scegli l&apos;azienda con cui vuoi lavorare.
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
                                        {VERTICAL_LABELS[tenant.vertical_type] ??
                                            tenant.vertical_type}
                                    </Text>
                                </div>
                            </div>

                            <Button variant="secondary" onClick={() => handleSelect(tenant.id)}>
                                Apri azienda
                            </Button>
                        </div>
                    ))}
                </div>

                <div style={{ marginTop: "24px" }}>
                    <Link to="/onboarding/create-business" style={{ textDecoration: "none" }}>
                        <Text variant="body" colorVariant="primary">
                            + Aggiungi azienda
                        </Text>
                    </Link>
                </div>
            </div>
        </div>
    );
}
