import { type KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import Text from "@/components/ui/Text/Text";
import { snapTimeToQuarter } from "@pages/ReservationPage/validators";
import type {
    OpeningHoursEntry,
    UpcomingClosure
} from "@pages/ReservationPage/availability";
import {
    findDefaultPeriodIndex,
    getReservationPeriodsForDate,
    SLOT_STEP_MIN
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
    /** Id della riga d'errore del FormField, per `aria-describedby`. */
    errorId?: string;
    /** Nome accessibile della griglia degli orari (la label del campo). */
    ariaLabel?: string;
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
    invalid,
    ariaLabel = "Ora"
}: Props) {
    const customInputId = useId();
    const gridRef = useRef<HTMLDivElement>(null);
    // Passo cablato a SLOT_STEP_MIN, MAI al pacing della sede: i vincoli di
    // pacing chiudono il canale online, non l'operatore. Deve poter piazzare
    // una prenotazione a un quarto d'ora qualsiasi anche su una sede con
    // fascia da 30 o 60 — "Altro orario" resta comunque disponibile sotto.
    const periods = useMemo(() => {
        if (!date) return [];
        return getReservationPeriodsForDate(date, hours, closures, new Date(), SLOT_STEP_MIN);
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

    // Griglia degli orari = radiogroup con tabindex mobile, come la striscia
    // dei giorni: un orario nel giro del Tab, le frecce si spostano e scelgono.
    const slots = activePeriod?.slots ?? [];
    const focusTime = slots.some(sl => sl.time === value) ? value : (slots[0]?.time ?? "");
    const handleGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
        const idx = slots.findIndex(sl => sl.time === (event.target as HTMLElement).dataset.time);
        if (idx < 0) return;
        const next =
            event.key === "ArrowRight" || event.key === "ArrowDown"
                ? Math.min(slots.length - 1, idx + 1)
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? Math.max(0, idx - 1)
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? slots.length - 1
                      : -1;
        if (next < 0 || next === idx) return;
        event.preventDefault();
        const time = slots[next].time;
        handlePickSlot(time);
        gridRef.current?.querySelector<HTMLButtonElement>(`[data-time="${time}"]`)?.focus();
    };

    if (!date) {
        return (
            <div className={styles.wrapper} data-invalid={invalid ? "true" : undefined}>
                <Text as="p" variant="caption" colorVariant="muted" className={styles.placeholder}>
                    Scegli prima la data.
                </Text>
            </div>
        );
    }

    return (
        <div className={styles.wrapper} data-invalid={invalid ? "true" : undefined}>
            {loading ? (
                <Text as="p" variant="caption" colorVariant="muted" className={styles.placeholder}>
                    Caricamento orari…
                </Text>
            ) : error ? (
                <InlineBanner variant="warning">{error}</InlineBanner>
            ) : periods.length === 0 ? (
                <Text as="p" variant="caption" colorVariant="muted" className={styles.placeholder}>
                    Nessun orario proposto per questo giorno. Usa «Altro orario…» per inserirlo a mano.
                </Text>
            ) : (
                <>
                    {periods.length > 1 && (
                        <div role="group" aria-label="Fascia oraria" className={styles.periods}>
                            <SegmentedControl<number>
                                size="sm"
                                value={safeIdx}
                                onChange={setActiveIdx}
                                options={periods.map((p, i) => ({ value: i, label: p.label }))}
                            />
                        </div>
                    )}

                    {activePeriod && (
                        <div
                            ref={gridRef}
                            className={styles.grid}
                            role="radiogroup"
                            aria-label={ariaLabel}
                            aria-describedby={errorId}
                            aria-invalid={invalid || undefined}
                            onKeyDown={handleGridKey}
                        >
                            {activePeriod.slots.map(slot => {
                                const isSelected = slot.time === value;
                                return (
                                    <button
                                        key={slot.time}
                                        type="button"
                                        role="radio"
                                        aria-checked={isSelected}
                                        tabIndex={slot.time === focusTime ? 0 : -1}
                                        data-time={slot.time}
                                        onClick={() => handlePickSlot(slot.time)}
                                        className={styles.slotBtn}
                                        data-selected={isSelected ? "true" : undefined}
                                    >
                                        <Text as="span" variant="body-sm" weight={600} className={styles.slotTime}>
                                            {slot.time}
                                        </Text>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            <div className={styles.customRow}>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleToggleCustom}
                    aria-expanded={customMode}
                    aria-controls={customInputId}
                >
                    {customMode ? "Nascondi orario libero" : "Altro orario…"}
                </Button>
                {customMode && (
                    <TimeInput
                        id={customInputId}
                        label="Orario libero"
                        step={900}
                        value={customDraft}
                        onChange={e => handleCustomChange(e.target.value)}
                        onBlur={e => commitCustom(e.target.value)}
                        helperText="Arrotondato al quarto d'ora."
                        containerClassName={styles.customField}
                    />
                )}
            </div>
        </div>
    );
}
