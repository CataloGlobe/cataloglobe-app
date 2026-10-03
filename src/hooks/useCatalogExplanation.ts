import { useCallback, useEffect, useState } from "react";
import { getCatalogExplanation, type CatalogExplanationData } from "@/services/supabase/activeCatalog";

export type CatalogExplanationState = {
    data: CatalogExplanationData | null;
    loading: boolean;
    error: boolean;
    /** Rilegge dopo una scrittura; `silent` non rimette lo scheletro. */
    reload: (silent?: boolean) => Promise<void>;
};

/**
 * Cosa vedono i clienti della sede adesso, e perché (§50.20). `enabled`
 * viene da `canExplainActivityCatalog`: senza, non si legge niente.
 */
export function useCatalogExplanation(activityId: string, tenantId: string | null, enabled: boolean): CatalogExplanationState {
    const [data, setData] = useState<CatalogExplanationData | null>(null);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState(false);

    const reload = useCallback(
        async (silent = false) => {
            if (!enabled || !tenantId) return;
            if (!silent) setLoading(true);
            setError(false);
            try {
                setData(await getCatalogExplanation(activityId, tenantId));
            } catch (e) {
                console.error("[useCatalogExplanation] load failed:", e);
                setError(true);
            } finally {
                setLoading(false);
            }
        },
        [activityId, tenantId, enabled]
    );

    useEffect(() => {
        void reload();
    }, [reload]);

    return { data, loading, error, reload };
}
