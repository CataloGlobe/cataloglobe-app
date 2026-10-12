import { useCallback, useEffect, useState, useMemo } from "react";
import { getFieldTranslationStatus } from "@/services/supabase/translationStatus";
import { listAvailableLanguages } from "@/services/supabase/tenantLanguages";
import type { ProdottoLingua } from "./prodottoModel";
import { waitingRefetchDelayMs } from "@/services/translation/waiting";

const POLLING_INTERVAL_MS = 5000;

/**
 * Le lingue dei menù per la descrizione del prodotto, ognuna col suo stato
 * (la tessera «Traduzioni» e il problema di «Oggi»). Si ricarica quando cambia
 * `refreshKey` (la descrizione salvata) e ogni 5 secondi finché una è in corso.
 * Spento (per una variante) dà sempre una lista vuota.
 */
export function useProdottoLingue(
    tenantId: string,
    productId: string,
    refreshKey: string,
    enabled: boolean
): ProdottoLingua[] | null {
    const [states, setStates] = useState<{ code: string; state: ProdottoLingua["state"] }[] | null>(null);
    const [names, setNames] = useState<Record<string, string>>({});

    const fetchStatus = useCallback(async () => {
        if (!enabled) return;
        try {
            const status = await getFieldTranslationStatus(tenantId, "product", productId, "description");
            setStates(status.languages ?? []);
        } catch (err) {
            console.error("[useProdottoLingue] fetch failed:", err);
            setStates([]);
        }
    }, [tenantId, productId, enabled]);

    useEffect(() => {
        void fetchStatus();
    }, [fetchStatus, refreshKey]);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        listAvailableLanguages()
            .then(list => {
                if (cancelled) return;
                setNames(Object.fromEntries(list.map(l => [l.code, (l.name_it || l.name_native).toLowerCase()])));
            })
            .catch(err => console.error("[useProdottoLingue] languages failed:", err));
        return () => {
            cancelled = true;
        };
    }, [enabled]);

    const hasPending = states?.some(l => l.state === "pending") ?? false;
    useEffect(() => {
        if (!hasPending) return;
        const interval = setInterval(() => void fetchStatus(), POLLING_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [hasPending, fetchStatus]);

    // Lingue in attesa dei 10 minuti: una ricarica quando parte la prima.
    // Calcolato solo quando cambiano gli stati: con Date.now() a ogni render il
    // timer si riarmerebbe e slitterebbe.
    const waitingDelay = useMemo(
        () => (hasPending ? null : waitingRefetchDelayMs(states)),
        [hasPending, states]
    );
    useEffect(() => {
        if (waitingDelay === null) return;
        const timer = setTimeout(() => void fetchStatus(), waitingDelay);
        return () => clearTimeout(timer);
    }, [waitingDelay, fetchStatus]);

    if (!enabled) return [];
    if (states === null) return null;
    return states.map(l => ({ ...l, name: names[l.code] ?? l.code }));
}
