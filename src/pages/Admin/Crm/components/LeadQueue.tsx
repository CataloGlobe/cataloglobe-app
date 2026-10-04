import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/Card/Card";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { listCrmVenues } from "@/services/supabase/crm";
import { listCrmAgentDrafts } from "@/services/supabase/crmAgentTrial";
import type { CrmAgentDraftRow, CrmVenueListItem } from "@/types/crm";
import { homeTodos, type HomeTodo } from "@/utils/crm/crmHome";
import styles from "../Crm.module.scss";

const ROW_CLASS: Record<HomeTodo["level"], string | undefined> = {
    normale: undefined,
    arancio: styles.waitRowOrange,
    rosso: styles.waitRowRed
};

/** Un tasto senza modificatori, fuori dai campi di testo. */
function isPlainKey(event: KeyboardEvent, key: string): boolean {
    if (event.key.toLowerCase() !== key || event.metaKey || event.ctrlKey || event.altKey) return false;
    const target = event.target as HTMLElement | null;
    return !target?.closest("input, textarea, select, [contenteditable='true']");
}

/**
 * «Da lavorare» a sinistra della scheda del lead (grafica decisa il
 * 2026-10-05): i lead che aspettano voi, il più urgente in cima, col filo
 * colorato. J e K passano al successivo e al precedente. Si vede solo da
 * 1280 px; se non si carica, la scheda resta senza.
 */
export function LeadQueue({ currentVenueId }: { currentVenueId: string }) {
    const navigate = useNavigate();
    const [venues, setVenues] = useState<CrmVenueListItem[]>([]);
    const [drafts, setDrafts] = useState<CrmAgentDraftRow[]>([]);
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        let alive = true;
        Promise.all([listCrmVenues(), listCrmAgentDrafts(100)])
            .then(([v, d]) => {
                if (!alive) return;
                setVenues(v);
                setDrafts(d);
                setNow(new Date());
            })
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [currentVenueId]);

    const queue = useMemo(() => {
        const seen = new Set<string>();
        return homeTodos({ drafts, venues, callsWithoutOutcome: [], now }).filter(t => {
            if (seen.has(t.venueId)) return false;
            seen.add(t.venueId);
            return true;
        });
    }, [drafts, venues, now]);

    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            const step = isPlainKey(event, "j") ? 1 : isPlainKey(event, "k") ? -1 : 0;
            if (step === 0 || queue.length === 0) return;
            const at = queue.findIndex(t => t.venueId === currentVenueId);
            const next = queue[at === -1 ? 0 : Math.min(queue.length - 1, Math.max(0, at + step))];
            if (next && next.venueId !== currentVenueId) {
                event.preventDefault();
                navigate(`/admin/lead/${next.venueId}`);
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [queue, currentVenueId, navigate]);

    return (
        <nav className={styles.leadQueue} aria-label="Da lavorare">
            <Card title="Da lavorare" subtitle="J e K per passare al prossimo." flush>
                {queue.length === 0 ? (
                    <div className={styles.cardPadding}>
                        <EmptyState variant="inline" title="Nessuno aspetta voi" />
                    </div>
                ) : (
                    queue.map(t => (
                        <ListRow
                            key={t.venueId}
                            className={ROW_CLASS[t.level]}
                            dense
                            to={`/admin/lead/${t.venueId}`}
                            selected={t.venueId === currentVenueId}
                            title={t.venueName}
                            subtitle={t.draftText ?? t.text}
                            meta={
                                t.wait ? (
                                    <span className={styles.waitTime} data-level={t.level}>
                                        {t.wait}
                                    </span>
                                ) : undefined
                            }
                            metaInline
                        />
                    ))
                )}
            </Card>
        </nav>
    );
}
