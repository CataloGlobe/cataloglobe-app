import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/Button/IconButton";
import Text from "@/components/ui/Text/Text";
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
    /** Id della riga d'errore del FormField, per `aria-describedby`. */
    errorId?: string;
    /** Nome accessibile della striscia dei giorni (la label del campo). */
    ariaLabel?: string;
    invalid?: boolean;
};

// Memoized formatter instances — cheap to construct but no reason to do it
// on every render.
const monthFormatter = new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric"
});
const weekdayFormatter = new Intl.DateTimeFormat("it-IT", { weekday: "short" });
const fullDayFormatter = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long"
});

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
    invalid,
    ariaLabel = "Data"
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

    // Striscia dei giorni = radiogroup con tabindex mobile: un solo giorno nel
    // giro del Tab (quello scelto, o il primo), le frecce si spostano e
    // scelgono, Home/Fine vanno ai capi (scheda RadioGroup).
    const stripRef = useRef<HTMLDivElement>(null);
    const focusIso = days.some(d => d.iso === value) ? value : (days[0]?.iso ?? "");
    const handleStripKey = (event: KeyboardEvent<HTMLDivElement>) => {
        const idx = days.findIndex(d => d.iso === (event.target as HTMLElement).dataset.iso);
        if (idx < 0) return;
        const next =
            event.key === "ArrowRight" || event.key === "ArrowDown"
                ? Math.min(days.length - 1, idx + 1)
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? Math.max(0, idx - 1)
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? days.length - 1
                      : -1;
        if (next < 0 || next === idx) return;
        event.preventDefault();
        const iso = days[next].iso;
        handlePick(iso);
        stripRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${iso}"]`)?.focus();
    };

    return (
        <div
            className={styles.wrapper}
            data-invalid={invalid ? "true" : undefined}
        >
            <div className={styles.header}>
                <IconButton
                    icon={<ChevronLeft size={16} strokeWidth={2} />}
                    aria-label="Mese precedente"
                    size="sm"
                    onClick={goPrev}
                    disabled={!canPrev}
                />
                <Text as="span" variant="body-sm" weight={600} className={styles.monthLabel} aria-live="polite">
                    {monthLabel}
                </Text>
                <IconButton
                    icon={<ChevronRight size={16} strokeWidth={2} />}
                    aria-label="Mese successivo"
                    size="sm"
                    onClick={goNext}
                    disabled={!canNext}
                />
            </div>

            {days.length === 0 ? (
                <Text as="p" variant="caption" colorVariant="muted" className={styles.emptyMonth}>
                    Nessun giorno disponibile in questo mese.
                </Text>
            ) : (
                <div
                    ref={stripRef}
                    className={styles.strip}
                    role="radiogroup"
                    aria-label={ariaLabel}
                    aria-describedby={errorId}
                    aria-invalid={invalid || undefined}
                    onKeyDown={handleStripKey}
                >
                    {days.map(d => {
                        const isSelected = d.iso === value;
                        // Admin permissivo: i giorni di chiusura restano
                        // sceglibili, con il segno «chiuso».
                        const isClosed = d.disabled;
                        const isPast = d.iso < today;
                        const date = parseLocalDate(d.iso);
                        const fullName = date ? fullDayFormatter.format(date) : d.iso;
                        return (
                            <button
                                key={d.iso}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                tabIndex={d.iso === focusIso ? 0 : -1}
                                data-iso={d.iso}
                                onClick={() => handlePick(d.iso)}
                                className={styles.dayBtn}
                                data-selected={isSelected ? "true" : undefined}
                                data-closed={isClosed ? "true" : undefined}
                                data-past={isPast ? "true" : undefined}
                                aria-label={`${fullName}${d.isToday ? ", oggi" : ""}${isClosed ? ", chiuso" : ""}`}
                            >
                                <Text as="span" variant="caption-xs" weight={600} className={styles.weekday}>
                                    {d.weekdayShort}
                                </Text>
                                <Text as="span" variant="title-sm" weight={700} className={styles.dayNum}>
                                    {d.dayNum}
                                </Text>
                                {isClosed && (
                                    <Text as="span" variant="caption-xs" weight={600} className={styles.closedTag}>
                                        chiuso
                                    </Text>
                                )}
                                {!isClosed && d.isToday && (
                                    <span className={styles.todayDot} aria-hidden="true" />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
