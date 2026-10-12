import { useEffect, useState } from "react";

/**
 * L'ora corrente, aggiornata ogni `intervalMs` finché `enabled`: per le
 * etichette relative («tra 3 min») che devono scorrere senza un refetch.
 * Spento non tiene timer.
 */
export function useNow(intervalMs: number, enabled = true): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!enabled) return;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs, enabled]);
    return now;
}
