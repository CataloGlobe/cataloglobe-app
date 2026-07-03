import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/services/supabase/client";
import { TenantContext } from "./TenantContext";
import { useAuth } from "./useAuth";
import type { V2Tenant } from "@/types/tenant";
import { TENANT_KEY, LEGACY_TENANT_KEY } from "@/constants/storageKeys";

// One-time migration: copy legacy key to new key if present.
const legacyValue = localStorage.getItem(LEGACY_TENANT_KEY);
if (legacyValue !== null && localStorage.getItem(TENANT_KEY) === null) {
    localStorage.setItem(TENANT_KEY, legacyValue);
}
if (legacyValue !== null) {
    localStorage.removeItem(LEGACY_TENANT_KEY);
}

export function TenantProvider({ children }: { children: ReactNode }) {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();

    const [tenants, setTenants] = useState<V2Tenant[]>([]);
    const [loading, setLoading] = useState(true);

    // Derived state: explicitly derive selected tenant from the URL to be synchronous
    const selectedTenant = businessId ? (tenants.find(t => t.id === businessId) ?? null) : null;
    const userRole = selectedTenant?.user_role ?? null;

    const fetchIdRef = useRef(0);

    const fetchTenants = useCallback(async () => {
        if (!user) {
            setTenants([]);
            setLoading(false);
            return;
        }

        const fetchId = ++fetchIdRef.current;
        setLoading(true);

        try {
            const { data, error } = await supabase
                .from("user_tenants_view")
                .select("id, owner_user_id, name, vertical_type, business_subtype, created_at, user_role, logo_url, plan, subscription_status, trial_until, stripe_customer_id, stripe_subscription_id, paid_seats, is_founder, current_period_end")
                .order("created_at", { ascending: true });

            if (fetchId !== fetchIdRef.current) return;

            if (error) {
                console.error("[TenantProvider] failed to fetch tenants:", error);
                setTenants([]);
                setLoading(false);
                return;
            }

            setTenants(data ?? []);
            setLoading(false);
        } catch (err) {
            if (fetchId !== fetchIdRef.current) return;
            console.error("[TenantProvider] unexpected error:", err);
            setTenants([]);
            setLoading(false);
        }
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Effect 1: fetch the tenant list when the authenticated user changes.
    useEffect(() => {
        if (!user) {
            setTenants([]);
            if (!authLoading) setLoading(false);
            return;
        }

        fetchTenants();
    }, [user?.id, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

    // Effect 2: sync selected tenant to local storage and perform final fallback redirects.
    // Runs whenever the tenant list or the route businessId changes.
    useEffect(() => {
        if (loading) return;

        if (tenants.length === 0) {
            navigate("/workspace", { replace: true });
            return;
        }

        if (!selectedTenant) {
            // businessId absent, or user does not own this tenant → send to workspace.
            navigate("/workspace", { replace: true });
            return;
        }

        localStorage.setItem(TENANT_KEY, selectedTenant.id);
    }, [tenants.length, selectedTenant, loading, navigate]);

    // Optimistically update context when switching businesses (BusinessSwitcher calls this
    // before navigate(), so the UI responds immediately without waiting for the effect).
    function selectTenant(id: string) {
        if (id) {
            localStorage.setItem(TENANT_KEY, id);
        }
    }

    // In-memory patch of the selected tenant only (matched by the route businessId).
    // Reflects authoritative post-commit values immediately, ahead of the async
    // Stripe webhook that syncs `tenants` in the DB. No network refetch, no race.
    const patchSelectedTenant = useCallback(
        (patch: Partial<Pick<V2Tenant, "plan" | "paid_seats">>) => {
            if (!businessId) return;
            setTenants(prev =>
                prev.map(t => (t.id === businessId ? { ...t, ...patch } : t))
            );
        },
        [businessId]
    );

    return (
        <TenantContext.Provider
            value={{
                tenants,
                selectedTenant,
                selectedTenantId: selectedTenant?.id ?? null,
                userRole,
                loading,
                selectTenant,
                refreshTenants: fetchTenants,
                patchSelectedTenant
            }}
        >
            {children}
        </TenantContext.Provider>
    );
}
