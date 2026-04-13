import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Text from "@/components/ui/Text/Text";
import { Badge, type BadgeVariant } from "@/components/ui/Badge/Badge";
import { useAuth } from "@/context/useAuth";
import { supabase } from "@/services/supabase/client";
import { useCallback, useEffect, useState } from "react";
import type { V2Tenant } from "@/types/tenant";
import type { SubscriptionStatus } from "@/types/tenant";
import styles from "./BillingPage.module.scss";

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
    active: "Attivo",
    trialing: "In prova",
    past_due: "Scaduto",
    canceled: "Cancellato",
    suspended: "Sospeso"
};

const STATUS_VARIANT: Record<SubscriptionStatus, BadgeVariant> = {
    active: "success",
    trialing: "primary",
    past_due: "warning",
    canceled: "danger",
    suspended: "danger"
};

function getTrialDaysLeft(trialUntil: string | null): number | null {
    if (!trialUntil) return null;
    const diff = new Date(trialUntil).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function BillingPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [tenants, setTenants] = useState<V2Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [activityCounts, setActivityCounts] = useState<Record<string, number>>({});

    const fetchTenants = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const { data } = await supabase
            .from("user_tenants_view")
            .select("id, owner_user_id, name, vertical_type, business_subtype, created_at, user_role, logo_url, plan, subscription_status, trial_until, stripe_customer_id, stripe_subscription_id, paid_seats")
            .order("created_at", { ascending: true });
        const tenantList = (data as V2Tenant[]) ?? [];
        setTenants(tenantList);
        setLoading(false);

        // Fetch activity counts for all tenants
        if (tenantList.length > 0) {
            const ids = tenantList.map(t => t.id);
            const { data: rows } = await supabase
                .from("activities")
                .select("tenant_id")
                .in("tenant_id", ids);

            const counts: Record<string, number> = {};
            for (const row of rows ?? []) {
                counts[row.tenant_id] = (counts[row.tenant_id] ?? 0) + 1;
            }
            setActivityCounts(counts);
        }
    }, [user?.id]);

    useEffect(() => {
        fetchTenants();
    }, [fetchTenants]);

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <PageHeader
                    title="Abbonamenti"
                    subtitle="Panoramica degli abbonamenti delle tue attività."
                />

                {loading ? null : tenants.length === 0 ? (
                    <Text variant="body" colorVariant="muted">
                        Nessuna attività trovata.
                    </Text>
                ) : (
                    <div className={styles.list}>
                        {tenants.map(tenant => {
                            const status = tenant.subscription_status;
                            const daysLeft = getTrialDaysLeft(tenant.trial_until);
                            const isOwner = tenant.user_role === "owner";
                            const needsActivation = !tenant.stripe_subscription_id;
                            const usedSeats = activityCounts[tenant.id] ?? 0;

                            return (
                                <button
                                    key={tenant.id}
                                    className={styles.tenantRow}
                                    onClick={() => navigate(`/business/${tenant.id}/subscription`)}
                                >
                                    <div className={styles.tenantInfo}>
                                        <div className={styles.tenantAvatar}>
                                            {tenant.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className={styles.tenantDetails}>
                                            <Text variant="body" weight={600}>
                                                {tenant.name}
                                            </Text>
                                            <Text variant="caption" colorVariant="muted">
                                                Piano Pro · {usedSeats}/{tenant.paid_seats} sed{tenant.paid_seats === 1 ? "e" : "i"}
                                                {!isOwner && " · Membro"}
                                            </Text>
                                        </div>
                                    </div>

                                    <div className={styles.tenantMeta}>
                                        {needsActivation ? (
                                            <Badge variant="warning">Da attivare</Badge>
                                        ) : (
                                            <>
                                                <Badge variant={STATUS_VARIANT[status]}>
                                                    {STATUS_LABEL[status]}
                                                </Badge>
                                                {status === "trialing" && daysLeft !== null && (
                                                    <Text variant="caption" colorVariant="muted">
                                                        {daysLeft} giorn{daysLeft === 1 ? "o" : "i"} rimast{daysLeft === 1 ? "o" : "i"}
                                                    </Text>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
