import styles from "./PublicOpeningHours.module.scss";

export type OpeningHoursEntry = {
    day_of_week: number;
    slot_index: number;
    opens_at: string | null;
    closes_at: string | null;
    is_closed: boolean;
};

export type UpcomingClosure = {
    closure_date: string; // "YYYY-MM-DD"
    label: string | null;
    is_closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
};

type Props = {
    openingHours: OpeningHoursEntry[];
    upcomingClosures?: UpcomingClosure[];
};

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const IT_DAY_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const IT_MONTH_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function formatDaySlots(slots: OpeningHoursEntry[]): string {
    if (slots.length === 0) return "—";
    if (slots[0].is_closed) return "Chiuso";
    const parts = slots
        .filter(s => !s.is_closed && s.opens_at && s.closes_at)
        .map(s => `${s.opens_at!.slice(0, 5)} – ${s.closes_at!.slice(0, 5)}`);
    return parts.length > 0 ? parts.join(" · ") : "—";
}

function formatClosureDate(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    return `${IT_DAY_SHORT[d.getDay()]} ${d.getDate()} ${IT_MONTH_SHORT[d.getMonth()]}`;
}

function formatClosureStatus(c: UpcomingClosure): string {
    if (c.is_closed) return "Chiuso";
    return `${c.opens_at?.slice(0, 5) ?? "?"} – ${c.closes_at?.slice(0, 5) ?? "?"}`;
}

export default function PublicOpeningHours({ openingHours, upcomingClosures }: Props) {
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

            {upcomingClosures && upcomingClosures.length > 0 && (
                <div className={styles.closuresSection}>
                    <h4 className={styles.closuresTitle}>Prossime chiusure</h4>
                    <dl className={styles.closuresList}>
                        {upcomingClosures.map((c) => (
                            <div key={c.closure_date} className={styles.closureRow}>
                                <dt className={styles.closureDate}>
                                    {formatClosureDate(c.closure_date)}
                                </dt>
                                <dd className={styles.closureInfo}>
                                    {c.label && (
                                        <span className={styles.closureLabel}>{c.label}</span>
                                    )}
                                    <span className={styles.closureStatus}>
                                        {formatClosureStatus(c)}
                                    </span>
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
        </div>
    );
}
