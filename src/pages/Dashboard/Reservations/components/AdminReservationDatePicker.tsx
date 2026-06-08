import { useCallback, useEffect, useMemo, useState } from "react";
import { todayIsoDate } from "@/utils/dateLocal";
import {
    parseLocalDate,
    type OpeningHoursEntry,
    type UpcomingClosure
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
import styles from "./AdminReservationDatePicker.module.scss";

type Props = {
    /** "YYYY-MM-DD" or empty string when no date is selected. */
    value: string;
    onChange: (iso: string) => void;
    hours: OpeningHoursEntry[];
    closures: UpcomingClosure[];
    /** Admin-only: allow selecting past dates (typical in edit mode for
     *  reservations that were already in the past at edit time). When true
     *  the horizon expands backwards to the earliest of `value` and today. */
    allowPast?: boolean;
    /** Optional id used by parent for aria-describedby on the field error. */
    errorId?: string;
    invalid?: boolean;
};

function ChevronLeft() {
    return (
        <svg
            width={16}
            height={16}
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
            width={16}
            height={16}
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

function diffInDays(later: string, earlier: string): number {
    const a = parseLocalDate(later);
    const b = parseLocalDate(earlier);
    if (!a || !b) return 0;
    const ms = a.getTime() - b.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
}

export default function AdminReservationDatePicker({
    value,
    onChange,
    hours,
    closures,
    allowPast = false,
    errorId,
    invalid
}: Props) {
    const today = useMemo(() => todayIsoDate(), []);

    // Effective start: today by default, or the earlier of (today, value)
    // when allowPast=true so an edit-mode past date stays visible + cliccable.
    const effectiveStart = useMemo(() => {
        if (!allowPast) return today;
        if (!value) return today;
        return value < today ? value : today;
    }, [allowPast, value, today]);

    // Extend the horizon backwards by the gap between effectiveStart and
    // actualToday so the future window remains a full RESERVATION_HORIZON_DAYS
    // (90 days) past today even when starting from an older anchor.
    const effectiveHorizon = useMemo(() => {
        if (effectiveStart === today) return RESERVATION_HORIZON_DAYS;
        return RESERVATION_HORIZON_DAYS + diffInDays(today, effectiveStart);
    }, [effectiveStart, today]);

    const minView = useMemo(() => monthOfIso(effectiveStart), [effectiveStart]);
    const maxView = useMemo(
        () => monthOfHorizonEnd(effectiveStart, effectiveHorizon),
        [effectiveStart, effectiveHorizon]
    );

    const [view, setView] = useState<CalendarMonthView>(() =>
        monthOfIso(value || effectiveStart)
    );

    // Sync view with externally-controlled value (e.g. activity change resets
    // the date). Avoid feedback loops by not depending on `view`.
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
                effectiveHorizon,
                effectiveStart,
                formatWeekdayShort
            ),
        [view, hours, closures, effectiveHorizon, effectiveStart]
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
                    aria-label="Mese precedente"
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
                    aria-label="Mese successivo"
                >
                    <ChevronRight />
                </button>
            </div>

            {days.length === 0 ? (
                <p className={styles.emptyMonth}>
                    Nessun giorno disponibile in questo mese.
                </p>
            ) : (
                <ul
                    className={styles.strip}
                    role="listbox"
                    aria-label="Seleziona la data"
                >
                    {days.map(d => {
                        const isSelected = d.iso === value;
                        // Admin permissivo: i giorni di chiusura restano
                        // cliccabili, contrassegnati con badge "Chiuso".
                        const isClosed = d.disabled;
                        const isPast = d.iso < today;
                        return (
                            <li key={d.iso} className={styles.cell}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => handlePick(d.iso)}
                                    className={styles.dayBtn}
                                    data-selected={isSelected ? "true" : undefined}
                                    data-today={d.isToday ? "true" : undefined}
                                    data-closed={isClosed ? "true" : undefined}
                                    data-past={isPast ? "true" : undefined}
                                    aria-label={
                                        isClosed
                                            ? `${d.weekdayShort} ${d.dayNum} (chiuso)`
                                            : undefined
                                    }
                                >
                                    <span className={styles.weekday}>{d.weekdayShort}</span>
                                    <span className={styles.dayNum}>{d.dayNum}</span>
                                    {isClosed && (
                                        <span className={styles.closedTag}>chiuso</span>
                                    )}
                                    {!isClosed && d.isToday && (
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

