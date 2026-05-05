import { useTranslation } from "react-i18next";
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
    /** Contesto di sfondo: "bg" (footer, default) o "surface" (modale Info). */
    surface?: "bg" | "surface";
};

const DAY_KEYS = [
    "opening_hours.days.monday",
    "opening_hours.days.tuesday",
    "opening_hours.days.wednesday",
    "opening_hours.days.thursday",
    "opening_hours.days.friday",
    "opening_hours.days.saturday",
    "opening_hours.days.sunday"
];
import type { TFunction } from "i18next";

function parseDate(s: string): Date {
    return new Date(s + "T12:00:00");
}

function formatShort(dateStr: string, t: TFunction): string {
    const d = parseDate(dateStr);
    return `${d.getDate()} ${t(`opening_hours.months_short.${d.getMonth() + 1}`)}`;
}

function formatClosureDateLabel(c: UpcomingClosure, t: TFunction): string {
    if (c.end_date) {
        return `${formatShort(c.closure_date, t)} – ${formatShort(c.end_date, t)}`;
    }
    return formatShort(c.closure_date, t);
}

export default function PublicOpeningHours({ openingHours, upcomingClosures, showHeading = true, surface = "bg" }: Props) {
    const { t } = useTranslation("public");
    const byDay = new Map<number, OpeningHoursEntry[]>();
    for (const entry of openingHours) {
        const list = byDay.get(entry.day_of_week) ?? [];
        list.push(entry);
        byDay.set(entry.day_of_week, list);
    }

    return (
        <div className={styles.hoursSection} data-surface={surface}>
            {showHeading !== false && (
                <h3 className={styles.hoursTitle}>{t("opening_hours.title")}</h3>
            )}
            <dl className={styles.hoursList}>
                {DAY_KEYS.map((dayKey, i) => {
                    const slots = byDay.get(i) ?? [];
                    const isClosed = slots.length > 0 && slots[0].is_closed;
                    const openSlots = slots.filter(s => !s.is_closed && s.opens_at && s.closes_at);
                    return (
                        <div key={i} className={styles.hoursRow}>
                            <dt className={styles.hoursDay}>{t(dayKey)}</dt>
                            <dd className={styles.hoursSlotsCol}>
                                {isClosed || slots.length === 0 ? (
                                    <span className={`${styles.hoursSlot} ${styles.hoursSlotClosed}`}>
                                        {isClosed ? t("opening_hours.closed") : "—"}
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
                    <h4 className={styles.closuresTitle}>{t("opening_hours.closures_title")}</h4>
                    <dl className={styles.closuresList}>
                        {upcomingClosures.map((c) => (
                            <div key={c.closure_date} className={styles.closureRow}>
                                <dt className={styles.closureDate}>
                                    {formatClosureDateLabel(c, t)}
                                </dt>
                                <dd className={styles.closureInfo}>
                                    {c.label && (
                                        <span className={styles.closureLabel}>{c.label}</span>
                                    )}
                                    {c.is_closed ? (
                                        <span className={styles.closureStatus}>{t("opening_hours.closures_status_closed")}</span>
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
