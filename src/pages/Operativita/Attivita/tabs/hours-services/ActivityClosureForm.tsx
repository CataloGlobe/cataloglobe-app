import React, { useState, useMemo, useCallback } from "react";
import { X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { FormField } from "@/components/ui/FormField/FormField";
import { FormGrid } from "@/components/ui/FormGrid/FormGrid";
import { DateInput } from "@/components/ui/Input/DateInput";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Switch } from "@/components/ui/Switch/Switch";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { createActivityClosure, updateActivityClosure } from "@/services/supabase/activityClosures";
import { useToast } from "@/context/Toast/ToastContext";
import type { V2ActivityClosure, ClosureSlot } from "@/types/activity-closures";
import Text from "@/components/ui/Text/Text";
import styles from "./ActivityHoursForm.module.scss";

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
            <FormGrid cols={1} autoFocus>
                <DateInput
                    label="Data inizio"
                    value={closureDate}
                    onChange={e => {
                        setClosureDate(e.target.value);
                        setDateError(undefined);
                    }}
                    error={dateError}
                    required
                />
                <DateInput
                    label="Data fine (opzionale)"
                    value={endDate}
                    onChange={e => handleEndDateChange(e.target.value)}
                    error={endDateError}
                    helperText={
                        hasEndDate
                            ? "Con la data di fine è chiusura piena per tutto il periodo."
                            : "Per chiusure su più giorni consecutivi, come le ferie."
                    }
                />
                <TextInput
                    label="Etichetta (opzionale)"
                    placeholder="es. Natale, Ferie, Manutenzione"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    maxLength={120}
                />
                {!hasEndDate && (
                    <Switch
                        label={isClosed ? "Chiuso tutto il giorno" : "Orari speciali"}
                        description={
                            isClosed
                                ? "La sede è chiusa per tutta la giornata."
                                : "La sede apre con orari diversi dal solito, fino a cinque fasce."
                        }
                        checked={isClosed}
                        onChange={handleIsClosedChange}
                    />
                )}
                {!isClosed && !hasEndDate && (
                    <FormField label="Fasce orarie">
                        {() => (
                            <div className={styles.slots}>
                                {slots.map((slot, i) => {
                                    const err = getSlotError(i);
                                    return (
                                        <div key={i} className={styles.slot}>
                                            <div className={styles.slotInputs}>
                                                <TimeInput
                                                    containerClassName={styles.time}
                                                    value={slot.opens_at ?? ""}
                                                    onChange={e => updateSlot(i, { opens_at: e.target.value || null })}
                                                    aria-label={`Fascia ${i + 1} apertura`}
                                                />
                                                <Text as="span" variant="body-sm" colorVariant="muted" aria-hidden>
                                                    –
                                                </Text>
                                                <TimeInput
                                                    containerClassName={styles.time}
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
                                                    <Tooltip content="Chiude il giorno successivo: si ricava dagli orari.">
                                                        <span>
                                                            <Badge variant="neutral">→ giorno dopo</Badge>
                                                        </span>
                                                    </Tooltip>
                                                )}
                                                <IconButton
                                                    icon={<X size={16} />}
                                                    size="sm"
                                                    aria-label={`Rimuovi fascia ${i + 1}`}
                                                    onClick={() => removeSlot(i)}
                                                />
                                            </div>
                                            {err && (
                                                <Text variant="caption" colorVariant="error" role="alert">
                                                    {err}
                                                </Text>
                                            )}
                                        </div>
                                    );
                                })}
                                {slots.length < MAX_SLOTS && (
                                    <div>
                                        <Button type="button" variant="ghost" size="sm" leftIcon={<Plus size={14} />} onClick={addSlot}>
                                            Fascia
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </FormField>
                )}
            </FormGrid>
        </form>
    );
};
