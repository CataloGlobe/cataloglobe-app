import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    getTranslationCoverage,
    type TranslationCoverage
} from "@/services/supabase/tenantLanguages";
import { useToast } from "@/context/Toast/ToastContext";

// Intervallo base del polling. Alzato da 5s a 15s: 5s era aggressivo e, con la
// tab lasciata aperta, raddoppiava il carico di baseline sull'RPC.
const BASE_POLL_INTERVAL_MS = 15000;
// Tetto del backoff esponenziale sugli errori (5 min).
const MAX_BACKOFF_MS = 300000;

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

    // Poller self-scheduling (setTimeout ricorsivo) invece di setInterval fisso:
    // serve per variare il delay tra un tick e l'altro (backoff sull'errore) e
    // per potersi mettere in pausa quando la tab non è visibile.
    //
    //  - Successo con pending>0  → prossimo tick all'intervallo base.
    //  - Successo con pending==0 → stop (lavoro concluso).
    //  - Errore (500/timeout)    → backoff esponenziale con tetto, NIENTE ripoll
    //    immediato: sotto carico l'RPC va in timeout e ripollare subito
    //    alimenterebbe la saturazione (loop autoalimentato, incident 2026-06-29).
    //  - Tab hidden              → pausa (nessun timer); alla ripresa di
    //    visibilità un refetch immediato e poi ritmo base.
    useEffect(() => {
        if (!tenantId) return;

        let cancelled = false;
        let failures = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const clearTimer = () => {
            if (timer !== undefined) {
                clearTimeout(timer);
                timer = undefined;
            }
        };

        const scheduleNext = () => {
            const delay = failures === 0
                ? BASE_POLL_INTERVAL_MS
                : Math.min(BASE_POLL_INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS);
            clearTimer();
            timer = setTimeout(() => { void tick(); }, delay);
        };

        const tick = async (): Promise<void> => {
            let keepPolling: boolean;
            try {
                const data = await getTranslationCoverage(tenantId);
                if (cancelled || !isMountedRef.current) return;
                failures = 0; // reset backoff al primo successo

                const prev = prevPendingRef.current;
                const currPending = sumPending(data);
                const currFailed = sumFailed(data);
                // Transition pending>0 → 0 senza errori = lavoro concluso.
                // prev=null al primo fetch evita toast spurio al mount con stato già done.
                if (prev !== null && prev > 0 && currPending === 0 && currFailed === 0) {
                    showToast({
                        message: t("languages.progress.completed"),
                        type: "success"
                    });
                }
                prevPendingRef.current = currPending;
                setCoverage(data);

                keepPolling = currPending > 0;
            } catch (err) {
                if (cancelled || !isMountedRef.current) return;
                console.error("[useTranslationCoverage]", err);
                failures += 1;
                keepPolling = true; // ritenta, ma con backoff
            }

            if (cancelled) return;
            if (!keepPolling) { clearTimer(); return; }   // pending==0 → stop
            if (document.hidden) { clearTimer(); return; } // tab non visibile → pausa
            scheduleNext();
        };

        const handleVisibility = () => {
            if (document.hidden) {
                clearTimer(); // niente polling in background
                return;
            }
            // Tornati visibili: refetch immediato (che poi rischedula al ritmo base).
            clearTimer();
            void tick();
        };

        // Kickoff (mount / cambio tenantId|refreshKey).
        void tick();
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            cancelled = true;
            clearTimer();
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [tenantId, refreshKey, showToast, t]);

    return coverage;
}
