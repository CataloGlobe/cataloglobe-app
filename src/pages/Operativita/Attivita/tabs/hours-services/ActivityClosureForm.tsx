import React, { useState } from "react";
import { createActivityClosure, updateActivityClosure } from "@/services/supabase/activityClosures";
import { useToast } from "@/context/Toast/ToastContext";
import type { V2ActivityClosure } from "@/types/activity-closures";
import styles from "./HoursServices.module.scss";

interface ActivityClosureFormProps {
    formId: string;
    mode: "create" | "edit";
    activityId: string;
    entityData?: V2ActivityClosure;
    tenantId: string;
    onSuccess: () => void | Promise<void>;
    onSavingChange: (saving: boolean) => void;
}

type FormErrors = {
    closure_date?: string;
    opens_at?: string;
    closes_at?: string;
};

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
    const [label, setLabel] = useState(entityData?.label ?? "");
    const [isClosed, setIsClosed] = useState(entityData?.is_closed ?? true);
    const [opensAt, setOpensAt] = useState(entityData?.opens_at?.slice(0, 5) ?? "");
    const [closesAt, setClosesAt] = useState(entityData?.closes_at?.slice(0, 5) ?? "");
    const [errors, setErrors] = useState<FormErrors>({});

    const validate = (): boolean => {
        const e: FormErrors = {};
        if (!closureDate) {
            e.closure_date = "La data è obbligatoria.";
        }
        if (!isClosed) {
            if (!opensAt) e.opens_at = "Orario di apertura obbligatorio.";
            if (!closesAt) e.closes_at = "Orario di chiusura obbligatorio.";
            if (opensAt && closesAt && closesAt <= opensAt) {
                e.closes_at = "La chiusura deve essere dopo l'apertura.";
            }
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        onSavingChange(true);
        try {
            const payload = {
                closure_date: closureDate,
                label: label.trim() || null,
                is_closed: isClosed,
                opens_at: isClosed ? null : opensAt || null,
                closes_at: isClosed ? null : closesAt || null,
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
                setErrors({ closure_date: "Esiste già una chiusura per questa data." });
            } else {
                const msg = (err as Error).message ?? "Errore durante il salvataggio.";
                showToast({ message: msg, type: "error" });
            }
        } finally {
            onSavingChange(false);
        }
    };

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
                        value={closureDate}
                        onChange={(e) => {
                            setClosureDate(e.target.value);
                            setErrors((prev) => ({ ...prev, closure_date: undefined }));
                        }}
                        className={`${styles.closureFormInput}${errors.closure_date ? ` ${styles.closureFormInputError}` : ""}`}
                    />
                    {errors.closure_date && (
                        <span className={styles.closureFormError}>{errors.closure_date}</span>
                    )}
                </div>

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
                    <input
                        type="checkbox"
                        checked={isClosed}
                        onChange={(e) => {
                            setIsClosed(e.target.checked);
                            setErrors({});
                        }}
                        aria-label="Chiuso tutto il giorno"
                    />
                </div>

                {!isClosed && (
                    <div className={styles.closureFormField}>
                        <label className={styles.closureFormLabel}>Orari speciali</label>
                        <div className={styles.closureFormTimeRow}>
                            <input
                                type="time"
                                value={opensAt}
                                onChange={(e) => {
                                    setOpensAt(e.target.value);
                                    setErrors((prev) => ({ ...prev, opens_at: undefined }));
                                }}
                                className={`${styles.closureFormTimeInput}${errors.opens_at ? ` ${styles.closureFormInputError}` : ""}`}
                            />
                            <span className={styles.closureFormTimeSep}>–</span>
                            <input
                                type="time"
                                value={closesAt}
                                onChange={(e) => {
                                    setClosesAt(e.target.value);
                                    setErrors((prev) => ({ ...prev, closes_at: undefined }));
                                }}
                                className={`${styles.closureFormTimeInput}${errors.closes_at ? ` ${styles.closureFormInputError}` : ""}`}
                            />
                        </div>
                        {(errors.opens_at || errors.closes_at) && (
                            <span className={styles.closureFormError}>
                                {errors.closes_at ?? errors.opens_at}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </form>
    );
};
