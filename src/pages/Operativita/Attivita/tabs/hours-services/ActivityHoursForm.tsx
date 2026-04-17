import React, { useState, useEffect, useCallback, useMemo } from "react";
import { X, Plus } from "lucide-react";
import { Switch } from "@/components/ui/Switch/Switch";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import { upsertActivityHours } from "@/services/supabase/activityHours";
import { updateActivityHoursPublic } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import { useToast } from "@/context/Toast/ToastContext";
import Text from "@/components/ui/Text/Text";
import formStyles from "./HoursServices.module.scss";

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const MAX_SLOTS_PER_DAY = 5;

/* ── Types ──────────────────────────────────────────────── */

interface TimeSlot {
    opens_at: string | null;
    closes_at: string | null;
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

function timesToMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

function slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
    if (!a.opens_at || !a.closes_at || !b.opens_at || !b.closes_at) return false;
    const aStart = timesToMinutes(a.opens_at);
    const aEnd = timesToMinutes(a.closes_at);
    const bStart = timesToMinutes(b.opens_at);
    const bEnd = timesToMinutes(b.closes_at);
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

            if (timesToMinutes(slot.closes_at!) <= timesToMinutes(slot.opens_at!)) {
                errors.push({
                    day,
                    slotIndex: si,
                    message: "L'orario di chiusura deve essere successivo all'apertura."
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

/* ── Helpers ─────────────────────────────────────────────── */

function buildDefaultDays(): DaysByIndex {
    const days: DaysByIndex = {};
    for (let i = 0; i < 7; i++) {
        days[i] = { is_closed: false, slots: [{ opens_at: null, closes_at: null }] };
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
                    .map(r => ({ opens_at: r.opens_at, closes_at: r.closes_at }))
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
}> {
    const result: Array<{
        day_of_week: number;
        slot_index: number;
        opens_at: string | null;
        closes_at: string | null;
        is_closed: boolean;
    }> = [];

    for (let day = 0; day < 7; day++) {
        const dayData = days[day];
        if (dayData.is_closed) {
            result.push({
                day_of_week: day,
                slot_index: 0,
                opens_at: null,
                closes_at: null,
                is_closed: true
            });
        } else {
            dayData.slots.forEach((slot, si) => {
                result.push({
                    day_of_week: day,
                    slot_index: si,
                    opens_at: slot.opens_at,
                    closes_at: slot.closes_at,
                    is_closed: false
                });
            });
        }
    }

    return result;
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

    const handleClosedToggle = useCallback((dayIndex: number, checked: boolean) => {
        if (checked) {
            updateDay(dayIndex, { is_closed: true, slots: [] });
        } else {
            updateDay(dayIndex, {
                is_closed: false,
                slots: [{ opens_at: null, closes_at: null }]
            });
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
                    slots: [...day.slots, { opens_at: null, closes_at: null }]
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

    /* ── Submit ── */

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (hasErrors) return;

            onSavingChange(true);
            try {
                const payload = daysToPayload(days);
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
                    return (
                        <div key={dayIndex} className={formStyles.dayRow}>
                            {/* Day name */}
                            <div className={formStyles.dayName}>
                                {DAY_NAMES[dayIndex]}
                            </div>

                            {/* Slots or closed label */}
                            <div className={formStyles.daySlotsCol}>
                                {dayData.is_closed ? (
                                    <span className={formStyles.closedLabel}>Chiuso</span>
                                ) : (
                                    <>
                                        {dayData.slots.map((slot, si) => {
                                            const error = getSlotError(dayIndex, si);
                                            return (
                                                <div key={si} className={formStyles.slotRow}>
                                                    <div className={formStyles.slotInputs}>
                                                        <TimeInput
                                                            value={slot.opens_at ?? ""}
                                                            onChange={e =>
                                                                updateSlot(dayIndex, si, {
                                                                    opens_at: e.target.value || null
                                                                })
                                                            }
                                                            aria-label={`${DAY_NAMES[dayIndex]} fascia ${si + 1} apertura`}
                                                        />
                                                        <span className={formStyles.slotSeparator}>–</span>
                                                        <TimeInput
                                                            value={slot.closes_at ?? ""}
                                                            onChange={e =>
                                                                updateSlot(dayIndex, si, {
                                                                    closes_at: e.target.value || null
                                                                })
                                                            }
                                                            aria-label={`${DAY_NAMES[dayIndex]} fascia ${si + 1} chiusura`}
                                                        />
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
                                    </>
                                )}
                            </div>

                            {/* Closed toggle */}
                            <div className={formStyles.dayClosedCol}>
                                <Switch
                                    checked={dayData.is_closed}
                                    onChange={checked => handleClosedToggle(dayIndex, checked)}
                                    aria-label={`${DAY_NAMES[dayIndex]} chiuso`}
                                />
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
                        />
                    </div>
                </div>
            </div>
        </form>
    );
}
