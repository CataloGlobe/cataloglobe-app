import { useEffect, useState } from "react";
import { listWritableScheduleIds } from "@/services/supabase/scheduleTargets";

/**
 * Per i ruoli di sede: quali regole il database lascia modificare. `null`
 * finché la risposta non c'è (si mostra la sola lettura), o se non serve
 * (`enabled` falso, owner e admin).
 */
export function useDbWritableRules(ruleIds: readonly string[], enabled: boolean): Set<string> | null {
    const [writable, setWritable] = useState<Set<string> | null>(null);
    const key = enabled ? [...ruleIds].sort().join(",") : "";
    useEffect(() => {
        setWritable(null);
        if (!key) return;
        let cancelled = false;
        listWritableScheduleIds(key.split(",")).then(ids => {
            if (!cancelled) setWritable(ids);
        });
        return () => {
            cancelled = true;
        };
    }, [key]);
    return writable;
}
