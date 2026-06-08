import { useCallback, useEffect, useMemo, useState } from "react";
import {
    findDefaultPeriodIndex,
    type ReservationPeriodGroup,
    type ReservationSlot
} from "@pages/ReservationPage/utils/reservationSlots";
import styles from "./ReservationTimePicker.module.scss";

type Props = {
    /** "HH:MM" or empty string when no time is selected yet. */
    value: string;
    onChange: (time: string) => void;
    /** Pre-computed by the caller from `getReservationPeriodsForDate`. The
     *  picker is mode-agnostic (continua vs turni) and does not know about
     *  hours or closures — it only renders what it receives. */
    periods: ReservationPeriodGroup[];
    /** Caller-controlled disabled state (e.g. while date is missing). */
    disabled?: boolean;
    /** Copy shown when `disabled=true` (prompt to pick a date first). */
    disabledMessage?: string;
    /** Optional id wired by parent for aria-describedby on the field error. */
    errorId?: string;
    invalid?: boolean;
};

function slotIsInteractive(slot: ReservationSlot): boolean {
    return slot.state === "available";
}

function slotAriaLabel(slot: ReservationSlot): string | undefined {
    if (slot.state === "soldout") return `${slot.time} (esaurito)`;
    if (slot.state === "past") return `${slot.time} (orario passato)`;
    return undefined;
}

export default function ReservationTimePicker({
    value,
    onChange,
    periods,
    disabled,
    disabledMessage,
    errorId,
    invalid
}: Props) {
    // Recompute `now` (and the default period) only when `periods` change —
    // typically on date pick. The picker does not ticker-refresh: "past"
    // labels are best-effort and the server is the final gate via capacity
    // + availability soft-validation upstream in the form.
    const defaultIdx = useMemo(
        () => findDefaultPeriodIndex(periods, new Date()),
        [periods]
    );
    const [activeIdx, setActiveIdx] = useState<number>(defaultIdx);

    // When the parent swaps `periods` (date change), realign to the natural
    // default. Also re-pin if the currently-selected `value` lives in a
    // specific period — keeps the segmented in sync with the picked slot.
    useEffect(() => {
        if (value) {
            const idx = periods.findIndex(p => p.slots.some(s => s.time === value));
            if (idx >= 0) {
                setActiveIdx(idx);
                return;
            }
        }
        setActiveIdx(defaultIdx);
    }, [periods, defaultIdx, value]);

    const handlePick = useCallback(
        (time: string) => {
            if (time === value) return;
            onChange(time);
        },
        [onChange, value]
    );

    if (disabled) {
        return (
            <div
                className={styles.wrapper}
                data-invalid={invalid ? "true" : undefined}
                aria-describedby={errorId}
            >
                <p className={styles.placeholder}>
                    {disabledMessage ?? "Scegli prima la data."}
                </p>
            </div>
        );
    }

    if (periods.length === 0) {
        return (
            <div
                className={styles.wrapper}
                data-invalid={invalid ? "true" : undefined}
                aria-describedby={errorId}
            >
                <p className={styles.placeholder}>
                    Nessun orario disponibile per la data selezionata.
                </p>
            </div>
        );
    }

    const safeIdx = Math.min(Math.max(0, activeIdx), periods.length - 1);
    const activePeriod = periods[safeIdx]!;

    return (
        <div
            className={styles.wrapper}
            data-invalid={invalid ? "true" : undefined}
            aria-describedby={errorId}
        >
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

            <ul
                className={styles.grid}
                role="listbox"
                aria-label="Seleziona l'orario"
            >
                {activePeriod.slots.map(slot => {
                    const isSelected = slot.time === value;
                    const interactive = slotIsInteractive(slot);
                    const label = slotAriaLabel(slot);
                    return (
                        <li key={slot.time} className={styles.cell}>
                            <button
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                aria-label={label}
                                disabled={!interactive}
                                onClick={() => handlePick(slot.time)}
                                className={styles.slotBtn}
                                data-selected={isSelected ? "true" : undefined}
                                data-state={slot.state}
                            >
                                <span className={styles.slotTime}>{slot.time}</span>
                                {slot.state === "soldout" && (
                                    <span className={styles.slotTag}>esaurito</span>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
