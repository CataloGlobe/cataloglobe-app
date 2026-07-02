import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { todayIsoDate } from "@/utils/dateLocal";
import type {
    OpeningHoursEntry,
    UpcomingClosure
} from "@pages/ReservationPage/availability";
import {
    buildMonthDays,
    compareMonth,
    monthOfHorizonEnd,
    monthOfIso,
    RESERVATION_HORIZON_DAYS,
    shiftMonth,
    type CalendarMonthView,
    type ReservationDayCell
} from "@pages/ReservationPage/utils/reservationSlots";
import styles from "./ReservationDatePicker.module.scss";

type Props = {
    /** "YYYY-MM-DD" or empty string when no date is selected yet. */
    value: string;
    onChange: (iso: string) => void;
    hours: OpeningHoursEntry[];
    closures: UpcomingClosure[];
    /** Optional id wired by parent for aria-describedby on the field error. */
    errorId?: string;
    invalid?: boolean;
};

function ChevronLeft() {
    return (
        <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function ChevronRight() {
    return (
        <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

// Memoized formatter instances — cheap to construct but no reason to do it
// on every render.
const monthFormatter = new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric"
});
const weekdayFormatter = new Intl.DateTimeFormat("it-IT", { weekday: "short" });

function formatMonthLabel(view: CalendarMonthView): string {
    const sample = new Date(view.year, view.month, 1);
    const raw = monthFormatter.format(sample);
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatWeekdayShort(date: Date): string {
    return weekdayFormatter.format(date).replace(/\.$/, "");
}

export default function ReservationDatePicker({
    value,
    onChange,
    hours,
    closures,
    errorId,
    invalid
}: Props) {
    const { t } = useTranslation("public");
    const today = useMemo(() => todayIsoDate(), []);

    const minView = useMemo(() => monthOfIso(today), [today]);
    const maxView = useMemo(
        () => monthOfHorizonEnd(today, RESERVATION_HORIZON_DAYS),
        [today]
    );

    const [view, setView] = useState<CalendarMonthView>(() => monthOfIso(value || today));

    // Sync view with externally-controlled value: if parent flips the date
    // to a different month (e.g. CAPACITY_FULL refill, programmatic reset),
    // the carousel follows. Avoid feedback loop by not depending on `view`.
    useEffect(() => {
        if (!value) return;
        const target = monthOfIso(value);
        if (compareMonth(target, view) === 0) return;
        setView(target);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const days = useMemo<ReservationDayCell[]>(
        () =>
            buildMonthDays(
                view.year,
                view.month,
                hours,
                closures,
                RESERVATION_HORIZON_DAYS,
                today,
                formatWeekdayShort
            ),
        [view, hours, closures, today]
    );

    const canPrev = compareMonth(view, minView) > 0;
    const canNext = compareMonth(view, maxView) < 0;

    const goPrev = useCallback(() => {
        setView(prev => shiftMonth(prev, -1));
    }, []);
    const goNext = useCallback(() => {
        setView(prev => shiftMonth(prev, 1));
    }, []);

    const handlePick = useCallback(
        (iso: string) => {
            if (iso === value) return;
            onChange(iso);
        },
        [onChange, value]
    );

    const monthLabel = formatMonthLabel(view);

    return (
        <div
            className={styles.wrapper}
            data-invalid={invalid ? "true" : undefined}
            aria-describedby={errorId}
        >
            <div className={styles.header}>
                <button
                    type="button"
                    className={styles.navBtn}
                    onClick={goPrev}
                    disabled={!canPrev}
                    aria-label={t("reservation.prev_month")}
                >
                    <ChevronLeft />
                </button>
                <span className={styles.monthLabel} aria-live="polite">
                    {monthLabel}
                </span>
                <button
                    type="button"
                    className={styles.navBtn}
                    onClick={goNext}
                    disabled={!canNext}
                    aria-label={t("reservation.next_month")}
                >
                    <ChevronRight />
                </button>
            </div>

            {days.length === 0 ? (
                <p className={styles.emptyMonth}>{t("reservation.no_days")}</p>
            ) : (
                <ul
                    className={styles.strip}
                    role="listbox"
                    aria-label={t("reservation.select_date")}
                >
                    {days.map(d => {
                        const isSelected = d.iso === value;
                        return (
                            <li key={d.iso} className={styles.cell}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    disabled={d.disabled}
                                    onClick={() => handlePick(d.iso)}
                                    className={styles.dayBtn}
                                    data-selected={isSelected ? "true" : undefined}
                                    data-today={d.isToday ? "true" : undefined}
                                >
                                    <span className={styles.weekday}>{d.weekdayShort}</span>
                                    <span className={styles.dayNum}>{d.dayNum}</span>
                                    {d.isToday && (
                                        <span className={styles.todayDot} aria-hidden="true" />
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
