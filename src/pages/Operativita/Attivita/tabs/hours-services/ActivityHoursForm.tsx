import React, { useState, useEffect, useCallback, useMemo } from "react";
import { X, Plus, Copy } from "lucide-react";
import { Switch } from "@/components/ui/Switch/Switch";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import { upsertActivityHours } from "@/services/supabase/activityHours";
import { updateActivityHoursPublic } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import { useToast } from "@/context/Toast/ToastContext";
import Text from "@/components/ui/Text/Text";
import { timesToMinutes, deriveClosesNextDay } from "./hoursOvernight";
import formStyles from "./HoursServices.module.scss";

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
// Short labels for the "→ {next day}" overnight-close chip. day_of_week: 0=Lun … 6=Dom.
const DAY_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MAX_SLOTS_PER_DAY = 5;

/* ── Types ──────────────────────────────────────────────── */

interface TimeSlot {
    opens_at: string | null;
    closes_at: string | null;
    closes_next_day: boolean;
}

interface DaySlots {
    is_closed: boolean;
    slots: TimeSlot[];
}

type DaysByIndex = Record<number, DaySlots>;

/* ── Validation ─────────────────────────────────────────── */

interface SlotError {
    day: number;
    slotIndex: number;
    message: string;
}

function slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
    if (!a.opens_at || !a.closes_at || !b.opens_at || !b.closes_at) return false;
    const aStart = timesToMinutes(a.opens_at);
    const aEnd = a.closes_next_day
        ? timesToMinutes(a.closes_at) + 1440
        : timesToMinutes(a.closes_at);
    const bStart = timesToMinutes(b.opens_at);
    const bEnd = b.closes_next_day
        ? timesToMinutes(b.closes_at) + 1440
        : timesToMinutes(b.closes_at);
    return aStart < bEnd && bStart < aEnd;
}

function validateDays(days: DaysByIndex): SlotError[] {
    const errors: SlotError[] = [];
    for (let day = 0; day < 7; day++) {
        const dayData = days[day];
        if (dayData.is_closed) continue;

        for (let si = 0; si < dayData.slots.length; si++) {
            const slot = dayData.slots[si];
            const hasOpens = !!slot.opens_at;
            const hasCloses = !!slot.closes_at;

            if (!hasOpens || !hasCloses) {
                if (hasOpens || hasCloses) {
                    errors.push({
                        day,
                        slotIndex: si,
                        message: "Inserisci entrambi gli orari."
                    });
                }
                continue;
            }

            if (slot.closes_at === slot.opens_at) {
                errors.push({
                    day,
                    slotIndex: si,
                    message: "L'orario di apertura e chiusura non possono essere identici."
                });
                continue;
            }

            // Check overlap with subsequent slots in the same day
            for (let sj = si + 1; sj < dayData.slots.length; sj++) {
                if (slotsOverlap(slot, dayData.slots[sj])) {
                    errors.push({
                        day,
                        slotIndex: si,
                        message: "Le fasce orarie si sovrappongono."
                    });
                    break;
                }
            }
        }
    }
    return errors;
}

// A day can be copied onto all others only when its state is complete enough to
// replicate: a closed day always qualifies; an open day needs at least one slot,
// every slot with both times set, and no validation errors. "No errors" is
// derived from the existing validateDays output — no rule re-implementation.
function isDayCopyable(day: DaySlots, dayErrors: SlotError[]): boolean {
    if (day.is_closed) return true;
    if (day.slots.length === 0) return false;
    if (day.slots.some(s => !s.opens_at || !s.closes_at)) return false;
    return dayErrors.length === 0;
}

/* ── Helpers ─────────────────────────────────────────────── */

function buildDefaultDays(): DaysByIndex {
    const days: DaysByIndex = {};
    for (let i = 0; i < 7; i++) {
        days[i] = { is_closed: false, slots: [{ opens_at: null, closes_at: null, closes_next_day: false }] };
    }
    return days;
}

function hoursToDays(hours: V2ActivityHours[]): DaysByIndex {
    const days = buildDefaultDays();

    // Group existing hours by day_of_week
    const byDay = new Map<number, V2ActivityHours[]>();
    for (const h of hours) {
        const list = byDay.get(h.day_of_week) ?? [];
        list.push(h);
        byDay.set(h.day_of_week, list);
    }

    for (const [dayIndex, rows] of byDay) {
        // Sort by slot_index
        rows.sort((a, b) => a.slot_index - b.slot_index);

        if (rows.length === 1 && rows[0].is_closed) {
            days[dayIndex] = { is_closed: true, slots: [] };
        } else {
            days[dayIndex] = {
                is_closed: false,
                slots: rows
                    .filter(r => !r.is_closed)
                    .map(r => ({ opens_at: r.opens_at, closes_at: r.closes_at, closes_next_day: r.closes_next_day }))
            };
            // Fallback: if all rows were closed but >1, treat as closed
            if (days[dayIndex].slots.length === 0) {
                days[dayIndex] = { is_closed: true, slots: [] };
            }
        }
    }

    return days;
}

function daysToPayload(
    days: DaysByIndex
): Array<{
    day_of_week: number;
    slot_index: number;
    opens_at: string | null;
    closes_at: string | null;
    is_closed: boolean;
    closes_next_day: boolean;
}> {
    const result: Array<{
        day_of_week: number;
        slot_index: number;
        opens_at: string | null;
        closes_at: string | null;
        is_closed: boolean;
        closes_next_day: boolean;
    }> = [];

    for (let day = 0; day < 7; day++) {
        const dayData = days[day];
        if (dayData.is_closed) {
            result.push({
                day_of_week: day,
                slot_index: 0,
                opens_at: null,
                closes_at: null,
                is_closed: true,
                closes_next_day: false
            });
        } else {
            dayData.slots.forEach((slot, si) => {
                result.push({
                    day_of_week: day,
                    slot_index: si,
                    opens_at: slot.opens_at,
                    closes_at: slot.closes_at,
                    is_closed: false,
                    closes_next_day: slot.closes_next_day
                });
            });
        }
    }

    return result;
}

// Pure, in-memory copy: returns a new days map where every day mirrors the
// source day's is_closed + slots. Slots are deep-cloned (flat objects) so the
// seven days hold independent references. Nothing is persisted here.
function copyDayToAll(days: DaysByIndex, sourceIndex: number): DaysByIndex {
    const source = days[sourceIndex];
    const next: DaysByIndex = {};
    for (let i = 0; i < 7; i++) {
        next[i] = {
            is_closed: source.is_closed,
            slots: source.slots.map(s => ({ ...s }))
        };
    }
    return next;
}

/* ── Component ──────────────────────────────────────────── */

type ActivityHoursFormProps = {
    formId: string;
    entityData: V2ActivityHours[];
    activity: V2Activity;
    tenantId: string;
    onSuccess: () => void;
    onSavingChange: (saving: boolean) => void;
};

export function ActivityHoursForm({
    formId,
    entityData,
    activity,
    tenantId,
    onSuccess,
    onSavingChange
}: ActivityHoursFormProps) {
    const { showToast } = useToast();
    const [days, setDays] = useState<DaysByIndex>(() => hoursToDays(entityData));
    const [hoursPublic, setHoursPublic] = useState(activity.hours_public);

    useEffect(() => {
        setDays(hoursToDays(entityData));
    }, [entityData]);

    useEffect(() => {
        setHoursPublic(activity.hours_public);
    }, [activity.hours_public]);

    const errors = useMemo(() => validateDays(days), [days]);
    const hasErrors = errors.length > 0;

    const getSlotError = useCallback(
        (day: number, slotIndex: number): string | undefined =>
            errors.find(e => e.day === day && e.slotIndex === slotIndex)?.message,
        [errors]
    );

    /* ── Day mutations ── */

    const updateDay = useCallback((dayIndex: number, patch: Partial<DaySlots>) => {
        setDays(prev => ({ ...prev, [dayIndex]: { ...prev[dayIndex], ...patch } }));
    }, []);

    // Switch maps to is_closed (open = !is_closed). Closing keeps any typed
    // slots in state so re-opening within the same session restores them;
    // serialization (daysToPayload) ignores slots for a closed day, so the saved
    // row is still exactly { is_closed: true, opens_at/closes_at null }.
    const handleOpenToggle = useCallback((dayIndex: number, isOpen: boolean) => {
        if (isOpen) {
            setDays(prev => {
                const day = prev[dayIndex];
                const slots = day.slots.length > 0
                    ? day.slots
                    : [{ opens_at: null, closes_at: null, closes_next_day: false }];
                return { ...prev, [dayIndex]: { is_closed: false, slots } };
            });
        } else {
            updateDay(dayIndex, { is_closed: true });
        }
    }, [updateDay]);

    const updateSlot = useCallback(
        (dayIndex: number, slotIndex: number, patch: Partial<TimeSlot>) => {
            setDays(prev => {
                const day = prev[dayIndex];
                const newSlots = day.slots.map((s, i) =>
                    i === slotIndex ? { ...s, ...patch } : s
                );
                return { ...prev, [dayIndex]: { ...day, slots: newSlots } };
            });
        },
        []
    );

    const addSlot = useCallback((dayIndex: number) => {
        setDays(prev => {
            const day = prev[dayIndex];
            if (day.slots.length >= MAX_SLOTS_PER_DAY) return prev;
            return {
                ...prev,
                [dayIndex]: {
                    ...day,
                    slots: [...day.slots, { opens_at: null, closes_at: null, closes_next_day: false }]
                }
            };
        });
    }, []);

    const removeSlot = useCallback((dayIndex: number, slotIndex: number) => {
        setDays(prev => {
            const day = prev[dayIndex];
            if (day.slots.length <= 1) {
                // Last slot → mark day as closed
                return { ...prev, [dayIndex]: { is_closed: true, slots: [] } };
            }
            return {
                ...prev,
                [dayIndex]: {
                    ...day,
                    slots: day.slots.filter((_, i) => i !== slotIndex)
                }
            };
        });
    }, []);

    // Applies the copy immediately and offers an Undo via the toast action,
    // which restores the pre-copy snapshot. Purely in-memory — nothing is saved
    // until "Salva orari".
    const handleCopyToAllDays = useCallback(
        (dayIndex: number) => {
            // Defensive: the UI disables the button for non-copyable days, but
            // guard here too so the action can never propagate an invalid state.
            const sourceErrors = validateDays(days).filter(e => e.day === dayIndex);
            if (!isDayCopyable(days[dayIndex], sourceErrors)) return;

            const snapshot = days;
            setDays(prev => copyDayToAll(prev, dayIndex));
            showToast({
                message: `Orari di ${DAY_NAMES[dayIndex]} applicati a tutti i giorni.`,
                type: "success",
                actionLabel: "Annulla",
                onAction: () => setDays(snapshot)
            });
        },
        [days, showToast]
    );

    /* ── Submit ── */

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (hasErrors) return;

            onSavingChange(true);
            try {
                // Authoritative re-derivation: ignore any closes_next_day held in
                // state and recompute it from each open/close pair, so an
                // incoherent flag can never reach the DB CHECK by construction.
                const payload = daysToPayload(days).map(row =>
                    row.is_closed
                        ? row
                        : {
                              ...row,
                              closes_next_day: deriveClosesNextDay(row.opens_at, row.closes_at)
                          }
                );
                await upsertActivityHours(tenantId, activity.id, payload);

                // Update hours_public flag separately
                if (hoursPublic !== activity.hours_public) {
                    try {
                        await updateActivityHoursPublic(activity.id, tenantId, hoursPublic);
                    } catch {
                        showToast({
                            message: "Orari salvati, ma errore nell'aggiornamento della visibilità.",
                            type: "warning"
                        });
                        onSuccess();
                        return;
                    }
                }

                showToast({ message: "Orari salvati con successo.", type: "success" });
                onSuccess();
            } catch (err: unknown) {
                const code = (err as { code?: string })?.code;
                if (code === "23514") {
                    showToast({
                        message: "Orari non validi, controlla i dati inseriti.",
                        type: "error"
                    });
                } else {
                    showToast({
                        message: "Errore nel salvataggio degli orari.",
                        type: "error"
                    });
                }
            } finally {
                onSavingChange(false);
            }
        },
        [days, hoursPublic, activity.id, activity.hours_public, tenantId, hasErrors, onSuccess, onSavingChange, showToast]
    );

    return (
        <form id={formId} onSubmit={handleSubmit}>
            <div className={formStyles.hoursFormLayout}>
                {/* ── Day rows ── */}
                {Array.from({ length: 7 }, (_, dayIndex) => {
                    const dayData = days[dayIndex];
                    const isOpen = !dayData.is_closed;
                    const copyable = isDayCopyable(
                        dayData,
                        errors.filter(e => e.day === dayIndex)
                    );
                    return (
                        <div key={dayIndex} className={formStyles.dayRow}>
                            {/* Left stack: day name · status label · open/closed switch */}
                            <div className={formStyles.dayHeadCol}>
                                <span className={formStyles.dayName}>
                                    {DAY_NAMES[dayIndex]}
                                </span>
                                <span
                                    className={`${formStyles.dayStatusLabel} ${
                                        isOpen ? formStyles.dayStatusLabelOpen : ""
                                    }`}
                                >
                                    {isOpen ? "Aperto" : "Chiuso"}
                                </span>
                                <Switch
                                    checked={isOpen}
                                    onChange={open => handleOpenToggle(dayIndex, open)}
                                    aria-label={`${DAY_NAMES[dayIndex]} aperto`}
                                />
                            </div>

                            {/* Slots or closed message */}
                            <div className={formStyles.daySlotsCol}>
                                {dayData.is_closed ? (
                                    <span className={formStyles.closedDayMessage}>
                                        Nessun orario — la sede risulta chiusa.
                                    </span>
                                ) : (
                                    <>
                                        {dayData.slots.map((slot, si) => {
                                            const error = getSlotError(dayIndex, si);
                                            const overnight = deriveClosesNextDay(
                                                slot.opens_at,
                                                slot.closes_at
                                            );
                                            const nextDay = DAY_SHORT[(dayIndex + 1) % 7];
                                            return (
                                                <div key={si} className={formStyles.slotRow}>
                                                    <div className={formStyles.slotInputs}>
                                                        <TimeInput
                                                            value={slot.opens_at ?? ""}
                                                            onChange={e => {
                                                                const newOpensAt = e.target.value || null;
                                                                updateSlot(dayIndex, si, {
                                                                    opens_at: newOpensAt,
                                                                    closes_next_day: deriveClosesNextDay(
                                                                        newOpensAt,
                                                                        slot.closes_at
                                                                    )
                                                                });
                                                            }}
                                                            aria-label={`${DAY_NAMES[dayIndex]} fascia ${si + 1} apertura`}
                                                        />
                                                        <span className={formStyles.slotSeparator}>–</span>
                                                        <TimeInput
                                                            value={slot.closes_at ?? ""}
                                                            onChange={e => {
                                                                const newClosesAt = e.target.value || null;
                                                                updateSlot(dayIndex, si, {
                                                                    closes_at: newClosesAt,
                                                                    closes_next_day: deriveClosesNextDay(
                                                                        slot.opens_at,
                                                                        newClosesAt
                                                                    )
                                                                });
                                                            }}
                                                            aria-label={`${DAY_NAMES[dayIndex]} fascia ${si + 1} chiusura`}
                                                        />
                                                        {overnight && (
                                                            <span
                                                                className={formStyles.nextDayChip}
                                                                title={`Chiude ${DAY_NAMES[(dayIndex + 1) % 7]}`}
                                                                aria-label={`Chiude il giorno successivo, ${DAY_NAMES[(dayIndex + 1) % 7]}`}
                                                            >
                                                                → {nextDay}
                                                            </span>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className={formStyles.removeSlotBtn}
                                                            onClick={() => removeSlot(dayIndex, si)}
                                                            aria-label={`Rimuovi fascia ${si + 1} di ${DAY_NAMES[dayIndex]}`}
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                    {error && (
                                                        <span className={formStyles.slotError}>{error}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </>
                                )}

                                {/* Footer actions only for open days — a closed day has
                                    neither "+ Aggiungi fascia" nor the copy affordance. */}
                                {!dayData.is_closed && (
                                    <div className={formStyles.dayActions}>
                                        {dayData.slots.length < MAX_SLOTS_PER_DAY && (
                                            <button
                                                type="button"
                                                className={formStyles.addSlotBtn}
                                                onClick={() => addSlot(dayIndex)}
                                            >
                                                <Plus size={14} />
                                                Aggiungi fascia
                                            </button>
                                        )}
                                        {copyable ? (
                                            <button
                                                type="button"
                                                className={formStyles.copyAllBtn}
                                                onClick={() => handleCopyToAllDays(dayIndex)}
                                                aria-label={`Copia gli orari di ${DAY_NAMES[dayIndex]} su tutti i giorni`}
                                            >
                                                <Copy size={13} />
                                                Copia su tutti i giorni
                                            </button>
                                        ) : (
                                            <Tooltip content="Completa gli orari di questo giorno per copiarli su tutti i giorni.">
                                                <span className={formStyles.copyAllBtnWrap}>
                                                    <button
                                                        type="button"
                                                        className={formStyles.copyAllBtn}
                                                        disabled
                                                        aria-label={`Copia gli orari di ${DAY_NAMES[dayIndex]} su tutti i giorni`}
                                                    >
                                                        <Copy size={13} />
                                                        Copia su tutti i giorni
                                                    </button>
                                                </span>
                                            </Tooltip>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* ── Hours public toggle ── */}
                <div className={formStyles.hoursPublicSection}>
                    <div className={formStyles.hoursPublicRow}>
                        <div className={formStyles.hoursPublicText}>
                            <Text variant="body-sm" weight={500}>
                                Mostra orari sulla pagina pubblica
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                Se attivo, gli orari appaiono sull'hub visto dai clienti.
                            </Text>
                        </div>
                        <Switch
                            checked={hoursPublic}
                            onChange={setHoursPublic}
                            containerClassName={formStyles.hoursPublicSwitch}
                        />
                    </div>
                </div>
            </div>
        </form>
    );
}
