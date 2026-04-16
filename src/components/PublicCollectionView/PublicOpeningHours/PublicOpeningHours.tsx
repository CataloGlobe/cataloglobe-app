import styles from "./PublicOpeningHours.module.scss";

export type OpeningHoursEntry = {
    day_of_week: number;
    slot_index: number;
    opens_at: string | null;
    closes_at: string | null;
    is_closed: boolean;
};

type Props = {
    openingHours: OpeningHoursEntry[];
};

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

function formatDaySlots(slots: OpeningHoursEntry[]): string {
    if (slots.length === 0) return "—";
    if (slots[0].is_closed) return "Chiuso";
    const parts = slots
        .filter(s => !s.is_closed && s.opens_at && s.closes_at)
        .map(s => `${s.opens_at} – ${s.closes_at}`);
    return parts.length > 0 ? parts.join(" · ") : "—";
}

export default function PublicOpeningHours({ openingHours }: Props) {
    // Group by day_of_week
    const byDay = new Map<number, OpeningHoursEntry[]>();
    for (const entry of openingHours) {
        const list = byDay.get(entry.day_of_week) ?? [];
        list.push(entry);
        byDay.set(entry.day_of_week, list);
    }

    return (
        <div className={styles.hoursSection}>
            <h3 className={styles.hoursTitle}>Orari</h3>
            <dl className={styles.hoursList}>
                {DAY_NAMES.map((name, i) => {
                    const slots = byDay.get(i) ?? [];
                    const isClosed = slots.length > 0 && slots[0].is_closed;
                    return (
                        <div key={i} className={styles.hoursRow}>
                            <dt className={styles.hoursDay}>{name}</dt>
                            <dd
                                className={`${styles.hoursTime} ${
                                    isClosed ? styles.hoursTimeClosed : ""
                                }`}
                            >
                                {formatDaySlots(slots)}
                            </dd>
                        </div>
                    );
                })}
            </dl>
        </div>
    );
}
