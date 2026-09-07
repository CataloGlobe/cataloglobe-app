import React, { useState } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { useToast } from "@/context/Toast/ToastContext";
import { bindPrinter, PrinterServiceError } from "@/services/supabase/printers";
import styles from "../PrintersSection.module.scss";

interface PrinterBindFormProps {
    formId: string;
    tenantId: string;
    activityId: string;
    /** SN gia' collegati a questa sede (normalizzati uppercase): blocco client-side dei duplicati. */
    existingSns: string[];
    onSuccess: (alreadyBound: boolean) => Promise<void> | void;
    onSavingChange: (saving: boolean) => void;
}

// Serial number Sunmi: alfanumerico. Stesso vincolo dell'edge function
// (SN_RE in sunmi-bind-printer), qui solo per feedback immediato.
const SN_RE = /^[A-Z0-9]{6,32}$/;
const MAX_LABEL_LENGTH = 60;

/**
 * Form puro di collegamento stampante. Nessuna logica drawer: il submit e'
 * collegato dal footer del DrawerLayout via attributo `form={formId}`.
 */
export const PrinterBindForm: React.FC<PrinterBindFormProps> = ({
    formId,
    tenantId,
    activityId,
    existingSns,
    onSuccess,
    onSavingChange
}) => {
    const { showToast } = useToast();
    const [sn, setSn] = useState("");
    const [label, setLabel] = useState("");
    const [snError, setSnError] = useState<string | undefined>();
    const [labelError, setLabelError] = useState<string | undefined>();
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isSaving) return;

        const normalizedSn = sn.trim().toUpperCase();
        const normalizedLabel = label.trim();
        let valid = true;

        if (!SN_RE.test(normalizedSn)) {
            setSnError("Inserisci un numero di serie valido (6-32 caratteri, lettere e cifre).");
            valid = false;
        } else if (existingSns.includes(normalizedSn)) {
            // Duplicato nella stessa sede: blocco locale, nessuna chiamata Edge.
            setSnError("Questa stampante è già collegata a questa sede.");
            valid = false;
        } else {
            setSnError(undefined);
        }
        if (normalizedLabel.length === 0 || normalizedLabel.length > MAX_LABEL_LENGTH) {
            setLabelError(`Inserisci un nome (massimo ${MAX_LABEL_LENGTH} caratteri).`);
            valid = false;
        } else {
            setLabelError(undefined);
        }
        if (!valid) return;

        setIsSaving(true);
        onSavingChange(true);
        try {
            const result = await bindPrinter(tenantId, activityId, {
                sn: normalizedSn,
                label: normalizedLabel
            });
            await onSuccess(result.already_bound);
        } catch (err) {
            if (err instanceof PrinterServiceError) {
                if (err.code === "SUNMI_DEVICE_REJECTED") {
                    setSnError(err.message);
                } else if (err.code === "PRINTER_SN_IN_USE") {
                    // Collegata a un'ALTRA sede: non e' un errore di input, e' uno
                    // stato da risolvere altrove → toast informativo.
                    showToast({ message: err.message, type: "info" });
                } else {
                    showToast({ message: err.message, type: "error" });
                }
            } else {
                showToast({
                    message: "Impossibile collegare la stampante. Riprova.",
                    type: "error"
                });
            }
        } finally {
            setIsSaving(false);
            onSavingChange(false);
        }
    };

    return (
        <form id={formId} onSubmit={handleSubmit} className={styles.form}>
            <InlineBanner variant="info">
                Trovi il numero di serie (SN) sull'etichetta sotto la stampante o nel
                menu di configurazione del dispositivo. La stampante deve essere accesa
                e connessa alla rete.
            </InlineBanner>
            <TextInput
                label="Numero di serie (SN)"
                required
                value={sn}
                onChange={e => {
                    setSn(e.target.value);
                    if (snError) setSnError(undefined);
                }}
                placeholder="es. N411XXXXXXXXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                error={snError}
                disabled={isSaving}
            />
            <TextInput
                label="Nome"
                required
                value={label}
                onChange={e => {
                    setLabel(e.target.value);
                    if (labelError) setLabelError(undefined);
                }}
                placeholder="es. Cucina, Bar, Pizzeria"
                maxLength={MAX_LABEL_LENGTH}
                helperText="Come vuoi chiamare questa stampante. Serve a riconoscerla quando ne colleghi più di una."
                error={labelError}
                disabled={isSaving}
            />
        </form>
    );
};
