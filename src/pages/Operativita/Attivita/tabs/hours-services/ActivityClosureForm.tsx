import React, { useState, useMemo, useCallback } from "react";
import { X, Plus } from "lucide-react";
import { Switch } from "@/components/ui/Switch/Switch";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import { createActivityClosure, updateActivityClosure } from "@/services/supabase/activityClosures";
import { useToast } from "@/context/Toast/ToastContext";
import type { V2ActivityClosure, ClosureSlot } from "@/types/activity-closures";
import Text from "@/components/ui/Text/Text";
import styles from "./HoursServices.module.scss";

const MAX_SLOTS = 5;

function timesToMinutes(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}

function slotsOverlap(a: ClosureSlot, b: ClosureSlot): boolean {
    const aS = timesToMinutes(a.opens_at);
    const aE = a.closes_next_day ? timesToMinutes(a.closes_at) + 1440 : timesToMinutes(a.closes_at);
    const bS = timesToMinutes(b.opens_at);
    const bE = b.closes_next_day ? timesToMinutes(b.closes_at) + 1440 : timesToMinutes(b.closes_at);
    return aS < bE && bS < aE;
}

type SlotDraft = { opens_at: string | null; closes_at: string | null; closes_next_day: boolean };
type SlotError = { index: number; message: string };

function validateSlots(slots: SlotDraft[]): SlotError[] {
    const errors: SlotError[] = [];
    for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        const hasOpen = !!s.opens_at;
        const hasClose = !!s.closes_at;
        if (!hasOpen || !hasClose) {
            if (hasOpen || hasClose) {
                errors.push({ index: i, message: "Inserisci entrambi gli orari." });
            }
            continue;
        }
        if (s.closes_at === s.opens_at) {
            errors.push({ index: i, message: "L'orario di apertura e chiusura non possono essere identici." });
            continue;
        }
        for (let j = i + 1; j < slots.length; j++) {
            const b = slots[j];
            if (b.opens_at && b.closes_at &&
                slotsOverlap(
                    { opens_at: s.opens_at!, closes_at: s.closes_at!, closes_next_day: s.closes_next_day },
                    { opens_at: b.opens_at, closes_at: b.closes_at, closes_next_day: b.closes_next_day }
                )
            ) {
                errors.push({ index: i, message: "Le fasce orarie si sovrappongono." });
                break;
            }
        }
    }
    return errors;
}

interface ActivityClosureFormProps {
    formId: string;
    mode: "create" | "edit";
    activityId: string;
    entityData?: V2ActivityClosure;
    tenantId: string;
    onSuccess: () => void | Promise<void>;
    onSavingChange: (saving: boolean) => void;
}

export const ActivityClosureForm: React.FC<ActivityClosureFormProps> = ({
    formId,
    mode,
    activityId,
    entityData,
    tenantId,
    onSuccess,
    onSavingChange,
}) => {
    const { showToast } = useToast();

    const [closureDate, setClosureDate] = useState(entityData?.closure_date ?? "");
    const [endDate, setEndDate] = useState(entityData?.end_date ?? "");
    const [label, setLabel] = useState(entityData?.label ?? "");
    const [isClosed, setIsClosed] = useState(entityData?.is_closed ?? true);
    const [slots, setSlots] = useState<SlotDraft[]>(
        entityData?.slots
            ? entityData.slots.map(s => ({ opens_at: s.opens_at, closes_at: s.closes_at, closes_next_day: s.closes_next_day ?? false }))
            : [{ opens_at: null, closes_at: null, closes_next_day: false }]
    );

    const [dateError, setDateError] = useState<string>();
    const [endDateError, setEndDateError] = useState<string>();
    const slotErrors = useMemo(() => validateSlots(slots), [slots]);

    const hasEndDate = endDate.trim() !== "";

    const handleEndDateChange = useCallback((val: string) => {
        setEndDate(val);
        setEndDateError(undefined);
        if (val) {
            setIsClosed(true);
        }
    }, []);

    const handleIsClosedChange = useCallback((checked: boolean) => {
        setIsClosed(checked);
        if (!checked && slots.length === 0) {
            setSlots([{ opens_at: null, closes_at: null, closes_next_day: false }]);
        }
    }, [slots.length]);

    const updateSlot = useCallback((i: number, patch: Partial<SlotDraft>) => {
        setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
    }, []);

    const addSlot = useCallback(() => {
        setSlots(prev => prev.length < MAX_SLOTS ? [...prev, { opens_at: null, closes_at: null, closes_next_day: false }] : prev);
    }, []);

    const removeSlot = useCallback((i: number) => {
        setSlots(prev => {
            if (prev.length <= 1) {
                setIsClosed(true);
                return [{ opens_at: null, closes_at: null, closes_next_day: false }];
            }
            return prev.filter((_, idx) => idx !== i);
        });
    }, []);

    const validate = (): boolean => {
        let ok = true;
        if (!closureDate) {
            setDateError("La data è obbligatoria.");
            ok = false;
        }
        if (endDate && endDate <= closureDate) {
            setEndDateError("La data di fine deve essere successiva alla data di inizio.");
            ok = false;
        }
        if (!isClosed && slotErrors.length > 0) {
            ok = false;
        }
        return ok;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        onSavingChange(true);
        try {
            const payload = {
                closure_date: closureDate,
                end_date: endDate || null,
                label: label.trim() || null,
                is_closed: isClosed,
                slots: isClosed
                    ? null
                    : slots
                          .filter(s => s.opens_at && s.closes_at)
                          .map(s => ({ opens_at: s.opens_at!, closes_at: s.closes_at!, closes_next_day: s.closes_next_day })),
            };
            if (mode === "create") {
                await createActivityClosure(tenantId, { ...payload, activity_id: activityId });
                showToast({ message: "Chiusura aggiunta.", type: "success" });
            } else {
                await updateActivityClosure(entityData!.id, tenantId, payload);
                showToast({ message: "Chiusura aggiornata.", type: "success" });
            }
            await onSuccess();
        } catch (err: unknown) {
            const code = (err as { code?: string }).code;
            if (code === "23505") {
                setDateError("Esiste già una chiusura per questa data.");
            } else if (code === "23514") {
                showToast({ message: "Dati non validi, controlla gli orari inseriti.", type: "error" });
            } else {
                showToast({ message: (err as Error).message ?? "Errore durante il salvataggio.", type: "error" });
            }
        } finally {
            onSavingChange(false);
        }
    };

    const getSlotError = (i: number) => slotErrors.find(e => e.index === i)?.message;

    return (
        <form id={formId} onSubmit={handleSubmit} noValidate>
            <div className={styles.closureFormLayout}>

                {/* Data inizio */}
                <div className={styles.closureFormField}>
                    <label htmlFor={`${formId}-date`} className={styles.closureFormLabel}>
                        Data
                    </label>
                    <input
                        id={`${formId}-date`}
                        type="date"
                        value={closureDate}
                        onChange={(e) => { setClosureDate(e.target.value); setDateError(undefined); }}
                        className={`${styles.closureFormInput}${dateError ? ` ${styles.closureFormInputError}` : ""}`}
                    />
                    {dateError && <span className={styles.closureFormError}>{dateError}</span>}
                </div>

                {/* Data fine */}
                <div className={styles.closureFormField}>
                    <label htmlFor={`${formId}-end-date`} className={styles.closureFormLabel}>
                        Data fine
                        <span className={styles.closureFormLabelOptional}>opzionale</span>
                    </label>
                    <Text variant="caption" colorVariant="muted">
                        Per chiusure su più giorni consecutivi (es. ferie estive).
                    </Text>
                    <input
                        id={`${formId}-end-date`}
                        type="date"
                        value={endDate}
                        onChange={(e) => handleEndDateChange(e.target.value)}
                        className={`${styles.closureFormInput}${endDateError ? ` ${styles.closureFormInputError}` : ""}`}
                    />
                    {endDateError && <span className={styles.closureFormError}>{endDateError}</span>}
                    {hasEndDate && (
                        <Text variant="caption" colorVariant="muted">
                            Le chiusure su più giorni sono sempre totali.
                        </Text>
                    )}
                </div>

                {/* Etichetta */}
                <div className={styles.closureFormField}>
                    <label htmlFor={`${formId}-label`} className={styles.closureFormLabel}>
                        Etichetta
                        <span className={styles.closureFormLabelOptional}>opzionale</span>
                    </label>
                    <input
                        id={`${formId}-label`}
                        type="text"
                        placeholder="es. Natale, Ferie, Manutenzione"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        className={styles.closureFormInput}
                        maxLength={120}
                    />
                </div>

                {/* is_closed toggle */}
                {!hasEndDate && (
                    <div className={styles.closureFormToggleRow}>
                        <div className={styles.closureFormToggleText}>
                            <span className={styles.closureFormToggleLabel}>
                                {isClosed ? "Chiuso tutto il giorno" : "Orari speciali"}
                            </span>
                            <span className={styles.closureFormToggleHint}>
                                {isClosed
                                    ? "La sede sarà completamente chiusa in questa data."
                                    : "La sede aprirà con orari diversi dal solito."}
                            </span>
                        </div>
                        <Switch
                            checked={isClosed}
                            onChange={handleIsClosedChange}
                        />
                    </div>
                )}

                {/* Multi-slot editor */}
                {!isClosed && !hasEndDate && (
                    <div className={styles.closureFormField}>
                        <label className={styles.closureFormLabel}>Fasce orarie</label>
                        <div className={styles.daySlotsCol}>
                            {slots.map((slot, i) => {
                                const err = getSlotError(i);
                                return (
                                    <div key={i} className={styles.slotRow}>
                                        <div className={styles.slotInputs}>
                                            <TimeInput
                                                value={slot.opens_at ?? ""}
                                                onChange={e => updateSlot(i, { opens_at: e.target.value || null })}
                                                aria-label={`Fascia ${i + 1} apertura`}
                                            />
                                            <span className={styles.slotSeparator}>–</span>
                                            <TimeInput
                                                value={slot.closes_at ?? ""}
                                                onChange={e => {
                                                    const newClosesAt = e.target.value || null;
                                                    const cnd =
                                                        newClosesAt !== null && slot.opens_at !== null
                                                            ? timesToMinutes(newClosesAt) < timesToMinutes(slot.opens_at)
                                                            : false;
                                                    updateSlot(i, { closes_at: newClosesAt, closes_next_day: cnd });
                                                }}
                                                aria-label={`Fascia ${i + 1} chiusura`}
                                            />
                                            {slot.closes_next_day && (
                                                <span
                                                    className={styles.overnightBadge}
                                                    title="Chiude il giorno successivo"
                                                    aria-label="Chiude il giorno successivo"
                                                >
                                                    +1
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                className={styles.removeSlotBtn}
                                                onClick={() => removeSlot(i)}
                                                aria-label={`Rimuovi fascia ${i + 1}`}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                        {err && <span className={styles.slotError}>{err}</span>}
                                    </div>
                                );
                            })}
                            {slots.length < MAX_SLOTS && (
                                <button
                                    type="button"
                                    className={styles.addSlotBtn}
                                    onClick={addSlot}
                                >
                                    <Plus size={14} />
                                    Aggiungi fascia
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </form>
    );
};
