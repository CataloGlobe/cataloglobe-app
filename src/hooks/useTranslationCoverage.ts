import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    getTranslationCoverage,
    type TranslationCoverage
} from "@/services/supabase/tenantLanguages";
import { useToast } from "@/context/Toast/ToastContext";

const POLL_INTERVAL_MS = 5000;

/** Somma pending su tutte le lingue (lavoro live in corso). */
function sumPending(coverage: TranslationCoverage): number {
    return Object.values(coverage).reduce((acc, c) => acc + c.pending, 0);
}

/** Somma failed su tutte le lingue. */
function sumFailed(coverage: TranslationCoverage): number {
    return Object.values(coverage).reduce((acc, c) => acc + c.failed, 0);
}

/**
 * Dato sorgente ONESTO della pagina Lingue: copertura entity-level hash-aware per
 * lingua attiva (include pending → polling live). Single-source: nessuna seconda RPC.
 *
 * Fetch: al mount, a ogni cambio refreshKey (toggle/retry), e poll ogni 5s finché
 * esiste pending > 0 su qualche lingua. Stop quando pending == 0 ovunque.
 *
 * Toast di completamento alla transizione pending(>0) → 0 senza errori, SENZA numero
 * cumulativo (il vecchio "356 elementi" era la somma lifetime, fuorviante).
 */
export function useTranslationCoverage(
    tenantId: string | null | undefined,
    refreshKey?: number
): TranslationCoverage | null {
    const [coverage, setCoverage] = useState<TranslationCoverage | null>(null);
    const isMountedRef = useRef(true);
    // Track precedente pending totale per detect transition pending→0.
    // Reset a null al cambio tenantId/refreshKey: il prossimo "0" sarà la prima
    // completion osservata e merita il toast.
    const prevPendingRef = useRef<number | null>(null);
    const { showToast } = useToast();
    const { t } = useTranslation("admin");

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        prevPendingRef.current = null;
    }, [tenantId, refreshKey]);

    const fetchCoverage = useCallback(async () => {
        if (!tenantId) return;
        try {
            const data = await getTranslationCoverage(tenantId);
            if (!isMountedRef.current) return;

            const prev = prevPendingRef.current;
            const currPending = sumPending(data);
            const currFailed = sumFailed(data);
            // Transition pending>0 → 0 senza errori = lavoro di traduzione concluso.
            // prev=null al primo fetch evita toast spurio al mount con stato già done.
            if (prev !== null && prev > 0 && currPending === 0 && currFailed === 0) {
                showToast({
                    message: t("languages.progress.completed"),
                    type: "success"
                });
            }
            prevPendingRef.current = currPending;

            setCoverage(data);
        } catch (err) {
            console.error("[useTranslationCoverage]", err);
        }
    }, [tenantId, showToast, t]);

    useEffect(() => {
        if (!tenantId) return;
        fetchCoverage();
    }, [tenantId, fetchCoverage, refreshKey]);

    useEffect(() => {
        if (!coverage || sumPending(coverage) === 0) return;
        const interval = setInterval(fetchCoverage, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [coverage, fetchCoverage]);

    return coverage;
}
