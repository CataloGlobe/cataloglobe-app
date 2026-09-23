import { useMemo } from "react";
import { CalendarCheck, MessageSquare } from "lucide-react";
import { EmptyState } from "@components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";
import { todayIsoDate } from "@/utils/dateLocal";
import { PENDING_QUEUE_LIMIT } from "@/services/supabase/reservations";
import {
    TableAssignmentBadge,
    type TableAssignmentView
} from "@/components/ui/TableAssignmentBadge/TableAssignmentBadge";
import type { V2Reservation } from "@/types/reservation";
import type { DeferredAction } from "./useDeferredCommit";
import ChannelMark from "./ChannelMark";
import styles from "./Reservations.module.scss";

interface Props {
    /** Pending reservations within the current scope (already filtered). */
    pendingItems: V2Reservation[];
    /**
     * True se il server ha più pending del tetto (`PENDING_QUEUE_LIMIT`): la
     * coda mostrata è la più vecchia, non tutta. Si dice, non si tace.
     */
    truncated?: boolean;
    /** Tavoli assegnati per prenotazione: aiuta a decidere se confermare. */
    tableViews: ReadonlyMap<string, TableAssignmentView>;
    /** Per-row gate: action buttons only render if the caller has manage on that activity. */
    canManageActivity: (activityId: string) => boolean;
    /** Click row → open detail drawer. */
    onOpenDetail: (r: V2Reservation) => void;
    /** Inline action — caller schedules deferred commit + shows undo toast. */
    onAction: (r: V2Reservation, action: DeferredAction) => void;
}

function formatRowDate(isoDate: string): string {
    const [y, m, d] = isoDate.split("-").map(n => parseInt(n, 10));
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    const today = todayIsoDate();
    if (isoDate === today) return "Oggi";
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    if (isoDate === tIso) return "Domani";
    return new Intl.DateTimeFormat("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "short"
    }).format(dt);
}

// Il numero è la costante del service, non una cifra scritta a mano: se il
// tetto cambia, il banner lo segue.
const PENDING_TRUNCATED_TEXT = `Queste sono le ${PENDING_QUEUE_LIMIT} richieste in attesa da più tempo. Ce ne sono altre, che compaiono man mano che gestisci queste.`;

export default function ReservationsInbox({
    pendingItems,
    truncated = false,
    tableViews,
    canManageActivity,
    onOpenDetail,
    onAction
}: Props) {
    const today = todayIsoDate();

    const { live, stale } = useMemo(() => {
        const liveItems: V2Reservation[] = [];
        const staleItems: V2Reservation[] = [];
        for (const r of pendingItems) {
            if (r.reservation_date >= today) liveItems.push(r);
            else staleItems.push(r);
        }
        const ascend = (a: V2Reservation, b: V2Reservation) => {
            if (a.reservation_date !== b.reservation_date) {
                return a.reservation_date.localeCompare(b.reservation_date);
            }
            return a.reservation_time.localeCompare(b.reservation_time);
        };
        liveItems.sort(ascend);
        staleItems.sort(ascend);
        return { live: liveItems, stale: staleItems };
    }, [pendingItems, today]);

    // Il tetto vale per l'intero tenant: anche con lo scope su una sede la
    // coda potrebbe essere incompleta, e l'avviso resta.
    const truncatedNotice = truncated ? (
        <p className={styles.inboxTruncated} role="status">
            {PENDING_TRUNCATED_TEXT}
        </p>
    ) : null;

    if (pendingItems.length === 0) {
        return (
            <div className={styles.emptyState}>
                <EmptyState
                    icon={<CalendarCheck size={40} strokeWidth={1.5} />}
                    title="Nessuna richiesta in attesa"
                    description="Quando arriveranno nuove prenotazioni online, compariranno qui per essere confermate o rifiutate."
                />
            </div>
        );
    }

    const renderRow = (r: V2Reservation, isStale: boolean) => {
        const canManage = canManageActivity(r.activity_id);
        const tableView = tableViews.get(r.id);
        return (
            <div
                key={r.id}
                role="button"
                tabIndex={0}
                className={isStale ? styles.rowDimmed : styles.row}
                onClick={() => onOpenDetail(r)}
                onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenDetail(r);
                    }
                }}
            >
                <div className={styles.rowMain}>
                    <ChannelMark source={r.source} />
                    <div className={styles.rowContent}>
                        <div className={styles.rowTopLine}>
                            <span className={styles.rowName}>{r.customer_name}</span>
                            <span className={styles.rowMeta}>
                                {formatRowDate(r.reservation_date)} ·{" "}
                                {r.reservation_time.slice(0, 5)} · {r.party_size}{" "}
                                {r.party_size === 1 ? "persona" : "persone"}
                            </span>
                        </div>
                        {r.notes && (
                            <div className={styles.rowNote}>
                                <MessageSquare
                                    size={13}
                                    strokeWidth={2}
                                    aria-hidden
                                    className={styles.rowNoteIconInline}
                                />
                                <span className={styles.rowNoteText}>{r.notes}</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className={styles.rowRight}>
                    {tableView && <TableAssignmentBadge view={tableView} />}
                    {canManage && (
                        <div
                            className={styles.rowActions}
                            onClick={e => e.stopPropagation()}
                        >
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onAction(r, "decline")}
                            >
                                Rifiuta
                            </Button>
                            {!isStale && (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => onAction(r, "confirm")}
                                >
                                    Conferma
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className={styles.inbox}>
            {truncatedNotice}
            {live.length > 0 && (
                <section className={styles.inboxSection}>
                    <div className={styles.cards}>
                        {live.map(r => renderRow(r, false))}
                    </div>
                </section>
            )}

            {stale.length > 0 && (
                <section className={styles.inboxSection}>
                    <div className={styles.inboxSectionHeader}>
                        <h2 className={styles.inboxSectionTitle}>Scadute</h2>
                        <span className={styles.inboxSectionCount}>{stale.length}</span>
                    </div>
                    <p className={styles.inboxSectionHint}>
                        Richieste per date già passate, mai gestite.
                    </p>
                    <div className={styles.cards}>
                        {stale.map(r => renderRow(r, true))}
                    </div>
                </section>
            )}
        </div>
    );
}
