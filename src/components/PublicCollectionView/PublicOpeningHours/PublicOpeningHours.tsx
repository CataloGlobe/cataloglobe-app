import styles from "./PublicOpeningHours.module.scss";
import type { ClosureSlot } from "@/types/activity-closures";

export type OpeningHoursEntry = {
    day_of_week: number;
    slot_index: number;
    opens_at: string | null;
    closes_at: string | null;
    is_closed: boolean;
};

export type UpcomingClosure = {
    closure_date: string;    // "YYYY-MM-DD"
    end_date: string | null; // "YYYY-MM-DD" or null
    label: string | null;
    is_closed: boolean;
    slots: ClosureSlot[] | null;
};

type Props = {
    openingHours: OpeningHoursEntry[];
    upcomingClosures?: UpcomingClosure[];
    showHeading?: boolean;
};

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const IT_MONTH_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function parseDate(s: string): Date {
    return new Date(s + "T12:00:00");
}

function formatShort(dateStr: string): string {
    const d = parseDate(dateStr);
    return `${d.getDate()} ${IT_MONTH_SHORT[d.getMonth()]}`;
}

function formatClosureDateLabel(c: UpcomingClosure): string {
    if (c.end_date) {
        return `${formatShort(c.closure_date)} – ${formatShort(c.end_date)}`;
    }
    return formatShort(c.closure_date);
}

export default function PublicOpeningHours({ openingHours, upcomingClosures, showHeading = true }: Props) {
    const byDay = new Map<number, OpeningHoursEntry[]>();
    for (const entry of openingHours) {
        const list = byDay.get(entry.day_of_week) ?? [];
        list.push(entry);
        byDay.set(entry.day_of_week, list);
    }

    return (
        <div className={styles.hoursSection}>
            {showHeading !== false && (
                <h3 className={styles.hoursTitle}>Orari di apertura</h3>
            )}
            <dl className={styles.hoursList}>
                {DAY_NAMES.map((name, i) => {
                    const slots = byDay.get(i) ?? [];
                    const isClosed = slots.length > 0 && slots[0].is_closed;
                    const openSlots = slots.filter(s => !s.is_closed && s.opens_at && s.closes_at);
                    return (
                        <div key={i} className={styles.hoursRow}>
                            <dt className={styles.hoursDay}>{name}</dt>
                            <dd className={styles.hoursSlotsCol}>
                                {isClosed || slots.length === 0 ? (
                                    <span className={`${styles.hoursSlot} ${styles.hoursSlotClosed}`}>
                                        {isClosed ? "Chiuso" : "—"}
                                    </span>
                                ) : openSlots.length === 0 ? (
                                    <span className={`${styles.hoursSlot} ${styles.hoursSlotClosed}`}>—</span>
                                ) : (
                                    openSlots.map((s, idx) => (
                                        <span key={idx} className={styles.hoursSlot}>
                                            {s.opens_at!.slice(0, 5)} – {s.closes_at!.slice(0, 5)}
                                        </span>
                                    ))
                                )}
                            </dd>
                        </div>
                    );
                })}
            </dl>

            {upcomingClosures && upcomingClosures.length > 0 && (
                <div className={styles.closuresSection}>
                    <h4 className={styles.closuresTitle}>Prossime chiusure</h4>
                    <dl className={styles.closuresList}>
                        {upcomingClosures.map((c) => (
                            <div key={c.closure_date} className={styles.closureRow}>
                                <dt className={styles.closureDate}>
                                    {formatClosureDateLabel(c)}
                                </dt>
                                <dd className={styles.closureInfo}>
                                    {c.label && (
                                        <span className={styles.closureLabel}>{c.label}</span>
                                    )}
                                    {c.is_closed ? (
                                        <span className={styles.closureStatus}>Chiuso</span>
                                    ) : (
                                        c.slots?.map((slot, i) => (
                                            <span key={i} className={styles.closureStatus}>
                                                {slot.opens_at} – {slot.closes_at}
                                            </span>
                                        ))
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
        </div>
    );
}
