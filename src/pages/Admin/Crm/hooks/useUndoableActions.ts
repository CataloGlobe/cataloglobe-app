import { useCallback, useEffect, useRef, useState } from "react";

interface Pending {
    timer: ReturnType<typeof setTimeout>;
    run: () => Promise<void>;
}

/**
 * Gesti che partono dopo un'attesa (canvas U8b, «Annulla» per 5 secondi).
 * Finché aspetta, la riga è nascosta; «Annulla» la rimette. Uscendo dalla
 * pagina i gesti in attesa partono subito: la persona li ha fatti.
 */
export function useUndoableActions(delayMs: number) {
    const [waiting, setWaiting] = useState<ReadonlySet<string>>(() => new Set());
    const pending = useRef(new Map<string, Pending>());

    const release = useCallback((id: string) => {
        pending.current.delete(id);
        setWaiting(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, []);

    /** `run` parte dopo l'attesa; la riga torna visibile quando ha finito, bene o male. */
    const schedule = useCallback(
        (id: string, run: () => Promise<void>) => {
            if (pending.current.has(id)) return;
            const timer = setTimeout(() => {
                // Partito: uscendo dalla pagina non va rifatto.
                pending.current.delete(id);
                void run().finally(() => release(id));
            }, delayMs);
            pending.current.set(id, { timer, run });
            setWaiting(prev => new Set(prev).add(id));
        },
        [delayMs, release]
    );

    const undo = useCallback(
        (id: string) => {
            const p = pending.current.get(id);
            if (!p) return;
            clearTimeout(p.timer);
            release(id);
        },
        [release]
    );

    useEffect(() => {
        const map = pending.current;
        return () => {
            for (const p of map.values()) {
                clearTimeout(p.timer);
                void p.run();
            }
            map.clear();
        };
    }, []);

    return { waiting, schedule, undo };
}
