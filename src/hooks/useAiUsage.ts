import { useCallback, useEffect, useRef, useState } from "react";
import { getAiUsageCurrentCycle } from "@/services/supabase/aiUsage";
import type { AiUsageCycle } from "@/types/aiUsage";

export interface UseAiUsageResult {
    usage: AiUsageCycle | null;
    loading: boolean;
    /** Refetch immediato (dopo un'operazione AI che consuma quota). */
    refresh: () => void;
}

/**
 * Stato quota AI del tenant. Montato UNA SOLA volta in `MainLayout` (persiste in
 * tutta l'area business), stesso pattern di `useTranslationCoverage`/
 * `useAiImportSession`. La pill dell'header e la sezione Abbonamento leggono da
 * qui → un solo fetch condiviso, non uno per pagina/render.
 *
 * Niente polling: la quota cambia solo su operazioni AI. Fetch al mount + a ogni
 * cambio tenant + su `refresh()` manuale (invocato dopo un import/una
 * generazione o all'apertura della pagina Abbonamento, per freschezza).
 */
export function useAiUsage(tenantId: string | null | undefined): UseAiUsageResult {
    const [usage, setUsage] = useState<AiUsageCycle | null>(null);
    const [loading, setLoading] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!tenantId) {
            setUsage(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        getAiUsageCurrentCycle(tenantId)
            .then(res => {
                if (!cancelled && isMountedRef.current) setUsage(res);
            })
            .catch(err => {
                if (cancelled) return;
                // Non azzeriamo lo stato: un dato stantìo è meglio di far sparire
                // la sezione/pill per un blip di rete.
                console.error("[useAiUsage] fetch failed:", err);
            })
            .finally(() => {
                if (!cancelled && isMountedRef.current) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId, refreshKey]);

    const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
    return { usage, loading, refresh };
}
