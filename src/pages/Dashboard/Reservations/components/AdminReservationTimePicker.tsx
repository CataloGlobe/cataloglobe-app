import { useCallback, useEffect, useMemo, useState } from "react";
import { snapTimeToQuarter } from "@pages/ReservationPage/validators";
import type {
    OpeningHoursEntry,
    UpcomingClosure
} from "@pages/ReservationPage/availability";
import {
    findDefaultPeriodIndex,
    getReservationPeriodsForDate
} from "@pages/ReservationPage/utils/reservationSlots";
import styles from "./AdminReservationTimePicker.module.scss";

type Props = {
    /** "HH:MM" or empty string when no time is selected. */
    value: string;
    onChange: (time: string) => void;
    /** "YYYY-MM-DD" of the currently selected date. Empty = no date yet. */
    date: string;
    hours: OpeningHoursEntry[];
    closures: UpcomingClosure[];
    /** Pass-through state for the venue-hours fetch happening upstream. */
    loading?: boolean;
    /** Pass-through error message for the upstream fetch failure. */
    error?: string;
    /** Optional id wired by parent for aria-describedby on the field error. */
    errorId?: string;
    invalid?: boolean;
};

const TIME_RE = /^\d{2}:\d{2}$/;
const PARTIAL_TIME_RE = /^\d{0,2}:?\d{0,2}$/;

function timeMatchesAnyPeriod(
    time: string,
    periods: ReturnType<typeof getReservationPeriodsForDate>
): boolean {
    if (!time) return false;
    for (const p of periods) {
        if (p.slots.some(s => s.time === time)) return true;
    }
    return false;
}

export default function AdminReservationTimePicker({
    value,
    onChange,
    date,
    hours,
    closures,
    loading,
    error,
    errorId,
    invalid
}: Props) {
    const periods = useMemo(() => {
        if (!date) return [];
        return getReservationPeriodsForDate(date, hours, closures, new Date());
    }, [date, hours, closures]);

    const valueInGrid = useMemo(
        () => timeMatchesAnyPeriod(value, periods),
        [value, periods]
    );

    // Admin escape: free-form HH:MM input. Auto-opens when the current value
    // doesn't match any grid slot (typical edit case for off-hours bookings),
    // or when the day has no slots at all (closed day).
    const [customMode, setCustomMode] = useState<boolean>(() => {
        if (loading) return false;
        if (!value) return false;
        if (periods.length === 0) return true;
        return !valueInGrid;
    });
    const [customDraft, setCustomDraft] = useState<string>(() =>
        !valueInGrid && value ? value : ""
    );

    // Default period for the segmented selector.
    const defaultIdx = useMemo(
        () => findDefaultPeriodIndex(periods, new Date()),
        [periods]
    );
    const [activeIdx, setActiveIdx] = useState<number>(defaultIdx);

    // Re-sync when periods/value change (date pick, fetch settles, etc.).
    useEffect(() => {
        if (value && valueInGrid) {
            const idx = periods.findIndex(p => p.slots.some(s => s.time === value));
            if (idx >= 0) {
                setActiveIdx(idx);
                setCustomMode(false);
                setCustomDraft("");
                return;
            }
        }
        if (value && !valueInGrid) {
            setCustomMode(true);
            setCustomDraft(value);
            return;
        }
        // No value yet: keep default period; if the day has no grid slots,
        // surface the custom field directly (operator MUST pick something).
        setActiveIdx(defaultIdx);
        if (periods.length === 0 && !loading && date) {
            setCustomMode(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [periods, value, defaultIdx, date, loading]);

    const handlePickSlot = useCallback(
        (time: string) => {
            if (time === value) return;
            onChange(time);
        },
        [onChange, value]
    );

    const commitCustom = useCallback(
        (raw: string) => {
            const trimmed = raw.trim();
            if (!trimmed) {
                if (value) onChange("");
                return;
            }
            if (!TIME_RE.test(trimmed)) return;
            const snapped = snapTimeToQuarter(trimmed);
            setCustomDraft(snapped);
            if (snapped !== value) onChange(snapped);
        },
        [onChange, value]
    );

    const handleCustomChange = (raw: string) => {
        // Allow incremental typing without prematurely calling onChange.
        if (!PARTIAL_TIME_RE.test(raw) && !TIME_RE.test(raw)) return;
        setCustomDraft(raw);
        if (TIME_RE.test(raw)) {
            const snapped = snapTimeToQuarter(raw);
            if (snapped !== value) onChange(snapped);
        }
    };

    const handleToggleCustom = () => {
        setCustomMode(prev => {
            const next = !prev;
            if (next && value && !valueInGrid) {
                setCustomDraft(value);
            }
            return next;
        });
    };

    const safeIdx = Math.min(Math.max(0, activeIdx), Math.max(0, periods.length - 1));
    const activePeriod = periods[safeIdx];

    if (!date) {
        return (
            <div
                className={styles.wrapper}
                data-invalid={invalid ? "true" : undefined}
                aria-describedby={errorId}
            >
                <p className={styles.placeholder}>Scegli prima la data.</p>
            </div>
        );
    }

    return (
        <div
            className={styles.wrapper}
            data-invalid={invalid ? "true" : undefined}
            aria-describedby={errorId}
        >
            {loading ? (
                <p className={styles.placeholder}>Caricamento orari…</p>
            ) : error ? (
                <p className={styles.errorHint} role="alert">
                    {error}
                </p>
            ) : periods.length === 0 ? (
                <p className={styles.placeholder}>
                    Nessuno slot negli orari di apertura — usa “Altro orario”.
                </p>
            ) : (
                <>
                    {periods.length > 1 && (
                        <div
                            className={styles.segmented}
                            role="radiogroup"
                            aria-label="Fascia oraria"
                        >
                            {periods.map((p, i) => {
                                const isActive = i === safeIdx;
                                return (
                                    <button
                                        key={p.key}
                                        type="button"
                                        role="radio"
                                        aria-checked={isActive}
                                        onClick={() => setActiveIdx(i)}
                                        className={styles.segment}
                                        data-active={isActive ? "true" : undefined}
                                    >
                                        {p.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {activePeriod && (
                        <ul
                            className={styles.grid}
                            role="listbox"
                            aria-label="Seleziona l'orario"
                        >
                            {activePeriod.slots.map(slot => {
                                const isSelected = slot.time === value;
                                return (
                                    <li key={slot.time} className={styles.cell}>
                                        <button
                                            type="button"
                                            role="option"
                                            aria-selected={isSelected}
                                            onClick={() => handlePickSlot(slot.time)}
                                            className={styles.slotBtn}
                                            data-selected={isSelected ? "true" : undefined}
                                        >
                                            {slot.time}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </>
            )}

            <div className={styles.customRow}>
                <button
                    type="button"
                    className={styles.customToggle}
                    onClick={handleToggleCustom}
                    aria-expanded={customMode}
                    aria-controls="admin-time-custom-input"
                >
                    {customMode ? "Nascondi orario libero" : "Altro orario…"}
                </button>
                {customMode && (
                    <div className={styles.customField}>
                        <input
                            id="admin-time-custom-input"
                            type="time"
                            step={900}
                            value={customDraft}
                            placeholder="--:--"
                            className={styles.customInput}
                            onChange={e => handleCustomChange(e.target.value)}
                            onBlur={e => commitCustom(e.target.value)}
                            aria-label="Inserisci un orario libero"
                        />
                        <span className={styles.customHelp}>
                            Snap automatico al quarto d'ora più vicino.
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
