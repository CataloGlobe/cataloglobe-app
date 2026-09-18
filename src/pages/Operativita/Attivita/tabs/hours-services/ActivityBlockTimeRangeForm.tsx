import React, { useMemo, useState } from "react";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import { createActivityClosure } from "@/services/supabase/activityClosures";
import { useToast } from "@/context/Toast/ToastContext";
import type { V2ActivityClosure } from "@/types/activity-closures";
import type { V2ActivityHours } from "@/types/activity-hours";
import Text from "@/components/ui/Text/Text";
import { blockEndMinutes, computeBlockedDay, formatSlotList, type BlockTimeRangeResult } from "./blockTimeRange";
import styles from "./HoursServices.module.scss";

// FASE 5.5 — l'operatore toglie una fascia da un giorno; la riga di
// `activity_closures` che ne risulta la calcola `computeBlockedDay`. Il form
// mostra PRIMA di salvare cosa resta aperto: la riga scritta è quella
// dell'anteprima, senza sorprese.

/** "2026-09-29" → "29 settembre", per il toast. */
function formatDayLong(iso: string): string {
    return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" }).format(new Date(`${iso}T12:00:00`));
}

function timeToMin(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}

/** Perché non si può salvare, nelle parole dell'operatore. `null` = si può. */
function blockingMessage(r: BlockTimeRangeResult): string | null {
    switch (r.kind) {
        case "already-closure":
            return "Questa data ha già una chiusura: modificala dall'elenco qui sotto.";
        case "no-hours":
            return "In questa data la sede non è aperta: non c'è niente da bloccare.";
        case "no-overlap":
            return "In questa fascia la sede è già chiusa: il giorno resterebbe uguale.";
        case "not-representable":
            return "Questo giorno resta aperto oltre la mezzanotte: una fascia che finisce a mezzanotte non si può salvare. Scegli una fine prima della mezzanotte.";
        default:
            return null;
    }
}

interface ActivityBlockTimeRangeFormProps {
    formId: string;
    activityId: string;
    tenantId: string;
    hours: V2ActivityHours[];
    closures: V2ActivityClosure[];
    onSuccess: () => void | Promise<void>;
    onSavingChange: (saving: boolean) => void;
}

export const ActivityBlockTimeRangeForm: React.FC<ActivityBlockTimeRangeFormProps> = ({
    formId,
    activityId,
    tenantId,
    hours,
    closures,
    onSuccess,
    onSavingChange
}) => {
    const { showToast } = useToast();

    const [date, setDate] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [label, setLabel] = useState("");
    const [dateError, setDateError] = useState<string>();
    const [submitAttempted, setSubmitAttempted] = useState(false);

    const rangeError = useMemo(() => {
        if (!from || !to) return null;
        if (blockEndMinutes(to) <= timeToMin(from)) {
            return "La fine deve essere dopo l'inizio. Per bloccare fino a mezzanotte scrivi 00:00 come fine.";
        }
        return null;
    }, [from, to]);

    const result = useMemo<BlockTimeRangeResult | null>(() => {
        if (!date || !from || !to || rangeError) return null;
        return computeBlockedDay({ isoDate: date, hours, closures, from, to });
    }, [date, from, to, rangeError, hours, closures]);

    const blocking = result ? blockingMessage(result) : null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitAttempted(true);
        if (!date) {
            setDateError("Scegli una data.");
            return;
        }
        if (!from || !to || rangeError || !result || blocking) return;
        if (result.kind !== "partial" && result.kind !== "closed-all-day") return;

        onSavingChange(true);
        try {
            await createActivityClosure(tenantId, {
                activity_id: activityId,
                closure_date: date,
                end_date: null,
                label: label.trim() || null,
                is_closed: result.kind === "closed-all-day",
                slots: result.kind === "partial" ? result.slots : null
            });
            showToast({ message: `Fascia bloccata per il ${formatDayLong(date)}.`, type: "success" });
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

    const showRangeHint = submitAttempted && (!from || !to);

    return (
        <form id={formId} onSubmit={handleSubmit} noValidate>
            <div className={styles.closureFormLayout}>
                <div className={styles.closureFormField}>
                    <label htmlFor={`${formId}-date`} className={styles.closureFormLabel}>
                        Data
                    </label>
                    <input
                        id={`${formId}-date`}
                        type="date"
                        value={date}
                        onChange={e => {
                            setDate(e.target.value);
                            setDateError(undefined);
                        }}
                        className={`${styles.closureFormInput}${dateError ? ` ${styles.closureFormInputError}` : ""}`}
                    />
                    {dateError && <span className={styles.closureFormError}>{dateError}</span>}
                </div>

                <div className={styles.closureFormField}>
                    <label className={styles.closureFormLabel}>Fascia da bloccare</label>
                    <Text variant="caption" colorVariant="muted">
                        In questa fascia la sede risulta chiusa: non compare negli orari di apertura e non
                        accetta prenotazioni. Gli orari si riferiscono al giorno scelto: per bloccare una fascia
                        dopo la mezzanotte, scegli il giorno dopo.
                    </Text>
                    <div className={styles.slotInputs}>
                        <TimeInput
                            value={from}
                            onChange={e => setFrom(e.target.value)}
                            aria-label="Inizio della fascia bloccata"
                        />
                        <span className={styles.slotSeparator}>–</span>
                        <TimeInput
                            value={to}
                            onChange={e => setTo(e.target.value)}
                            aria-label="Fine della fascia bloccata"
                        />
                    </div>
                    {rangeError && <span className={styles.closureFormError}>{rangeError}</span>}
                    {showRangeHint && !rangeError && (
                        <span className={styles.closureFormError}>Inserisci inizio e fine della fascia.</span>
                    )}
                </div>

                {result && (
                    <div
                        className={`${styles.blockRangePreview}${blocking ? ` ${styles.blockRangePreviewError}` : ""}`}
                        role="status"
                    >
                        {blocking ? (
                            <span>{blocking}</span>
                        ) : (
                            <>
                                <div className={styles.blockRangePreviewRow}>
                                    <span className={styles.blockRangePreviewKey}>Orari del giorno</span>
                                    <span>{formatSlotList(result.kind === "partial" || result.kind === "closed-all-day" ? result.before : [])}</span>
                                </div>
                                <div className={styles.blockRangePreviewRow}>
                                    <span className={styles.blockRangePreviewKey}>Dopo il blocco</span>
                                    <span>
                                        {result.kind === "partial"
                                            ? formatSlotList(result.slots)
                                            : "Chiusa tutto il giorno: la fascia copre l'intera apertura."}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                )}

                <div className={styles.closureFormField}>
                    <label htmlFor={`${formId}-label`} className={styles.closureFormLabel}>
                        Etichetta
                        <span className={styles.closureFormLabelOptional}>opzionale</span>
                    </label>
                    <input
                        id={`${formId}-label`}
                        type="text"
                        placeholder="es. Evento privato, Manutenzione"
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        className={styles.closureFormInput}
                        maxLength={120}
                    />
                </div>
            </div>
        </form>
    );
};
