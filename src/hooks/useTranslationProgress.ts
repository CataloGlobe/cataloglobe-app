import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    getTranslationProgress,
    type TranslationProgress
} from "@/services/supabase/tenantLanguages";
import { useToast } from "@/context/Toast/ToastContext";

const POLL_INTERVAL_MS = 5000;

export function useTranslationProgress(
    tenantId: string | null | undefined,
    refreshKey?: number
): TranslationProgress | null {
    const [progress, setProgress] = useState<TranslationProgress | null>(null);
    const isMountedRef = useRef(true);
    // Track precedente total_pending per detect transition pending→done.
    // Reset a null al cambio tenantId/refreshKey (re-attivazione lingua):
    // il prossimo "done" sarà la prima completion osservata e merita il toast.
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

    const fetchProgress = useCallback(async () => {
        if (!tenantId) return;
        try {
            const data = await getTranslationProgress(tenantId);
            if (!isMountedRef.current) return;

            const prev = prevPendingRef.current;
            const curr = data.total_pending;
            // Transition pending>0 → 0 senza errori = traduzione completata.
            // prev=null al primo fetch evita toast spurio al mount con stato già done.
            if (prev !== null && prev > 0 && curr === 0 && data.total_error === 0) {
                showToast({
                    message: t("languages.progress.completed", { count: data.total_done }),
                    type: "success"
                });
            }
            prevPendingRef.current = curr;

            setProgress(data);
        } catch (err) {
            console.error("[useTranslationProgress]", err);
        }
    }, [tenantId, showToast, t]);

    useEffect(() => {
        if (!tenantId) return;
        fetchProgress();
    }, [tenantId, fetchProgress, refreshKey]);

    useEffect(() => {
        if (!progress || progress.total_pending === 0) return;
        const interval = setInterval(fetchProgress, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [progress, fetchProgress]);

    return progress;
}
