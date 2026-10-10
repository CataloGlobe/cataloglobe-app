import { useEffect, useRef, useState } from "react";
import { listWritableScheduleIds } from "@/services/supabase/scheduleTargets";

/**
 * Per i ruoli di sede: cosa dice il database (`can_write_schedule`) delle
 * regole `ruleIds`. Una regola manca dalla mappa finché la risposta non c'è.
 * Le risposte già avute restano: se l'elenco cambia (duplica, elimina) si
 * chiedono solo le regole nuove, senza far lampeggiare le altre. Con
 * `enabled` falso (owner e admin) nessuna chiamata, mappa vuota.
 */
export function useDbWritableRules(ruleIds: readonly string[], enabled: boolean): ReadonlyMap<string, boolean> {
    const [answers, setAnswers] = useState<Map<string, boolean>>(() => new Map());
    // Cambia chi chiede (ruolo): si riparte da zero e le risposte in volo si scartano.
    const generation = useRef(0);
    useEffect(() => {
        generation.current += 1;
        setAnswers(new Map());
    }, [enabled]);

    const missingKey = enabled
        ? Array.from(new Set(ruleIds))
              .filter(id => !answers.has(id))
              .sort()
              .join(",")
        : "";
    useEffect(() => {
        if (!missingKey) return;
        const asked = missingKey.split(",");
        const current = generation.current;
        // Un rifiuto conta come «no» (come gli errori della RPC): nessun id
        // resta senza risposta, quindi niente dettaglio fermo in attesa.
        listWritableScheduleIds(asked)
            .catch(() => new Set<string>())
            .then(writable => {
                if (generation.current !== current) return;
                setAnswers(prev => {
                    const next = new Map(prev);
                    for (const id of asked) next.set(id, writable.has(id));
                    return next;
                });
            });
    }, [missingKey]);
    return answers;
}
