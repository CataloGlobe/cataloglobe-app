import { useMemo } from "react";
import { CalendarCheck, Globe, MessageSquare, PencilLine } from "lucide-react";
import { EmptyState } from "@components/ui/EmptyState/EmptyState";
import type { V2Reservation } from "@/types/reservation";
import type { DeferredAction } from "./useDeferredCommit";
import ChannelMark from "./ChannelMark";
import styles from "./Reservations.module.scss";

interface Props {
    /** Pending reservations within the current scope (already filtered). */
    pendingItems: V2Reservation[];
    /** Activity name lookup for site pill. */
    activityNames: Map<string, string>;
    /** When true the inbox shows the site pill on each row (scope = "All sites"). */
    showSitePill: boolean;
    /** Per-row gate: action buttons only render if the caller has manage on that activity. */
    canManageActivity: (activityId: string) => boolean;
    /** Click row → open detail drawer. */
    onOpenDetail: (r: V2Reservation) => void;
    /** Inline action — caller schedules deferred commit + shows undo toast. */
    onAction: (r: V2Reservation, action: DeferredAction) => void;
}

function todayIsoDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

export default function ReservationsInbox({
    pendingItems,
    activityNames,
    showSitePill,
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
        const siteName = activityNames.get(r.activity_id);
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
                    <div className={styles.rowTopLine}>
                        <ChannelMark source={r.source} />
                        <span className={styles.rowName}>{r.customer_name}</span>
                        <span className={styles.rowMeta}>
                            {formatRowDate(r.reservation_date)} ·{" "}
                            {r.reservation_time.slice(0, 5)} · {r.party_size}{" "}
                            {r.party_size === 1 ? "persona" : "persone"}
                        </span>
                    </div>
                    <div className={styles.rowMetaDim}>
                        {r.notes && (
                            <span className={styles.rowNoteIcon} title="Contiene una nota">
                                <MessageSquare size={13} strokeWidth={2} />
                            </span>
                        )}
                        {showSitePill && siteName && (
                            <span className={styles.rowSitePill}>{siteName}</span>
                        )}
                    </div>
                </div>
                <div className={styles.rowRight}>
                    {canManage && (
                        <div
                            className={styles.rowActions}
                            onClick={e => e.stopPropagation()}
                        >
                            <button
                                type="button"
                                className={styles.actionBtnDanger}
                                onClick={() => onAction(r, "decline")}
                            >
                                Rifiuta
                            </button>
                            {!isStale && (
                                <button
                                    type="button"
                                    className={styles.actionBtnPrimary}
                                    onClick={() => onAction(r, "confirm")}
                                >
                                    Conferma
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className={styles.inbox}>
            <div className={styles.channelLegend} aria-label="Legenda origine">
                <span className={styles.channelLegendItem}>
                    <span className={styles.channelLegendIcon}>
                        <Globe size={12} strokeWidth={2} aria-hidden />
                    </span>
                    online
                </span>
                <span className={styles.channelLegendItem}>
                    <span className={styles.channelLegendIcon}>
                        <PencilLine size={12} strokeWidth={2} aria-hidden />
                    </span>
                    a mano
                </span>
            </div>
            {live.length > 0 && (
                <section className={styles.inboxSection}>
                    <div className={styles.inboxSectionHeader}>
                        <h2 className={styles.inboxSectionTitle}>Da gestire</h2>
                        <span className={styles.inboxSectionCount}>{live.length}</span>
                    </div>
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
