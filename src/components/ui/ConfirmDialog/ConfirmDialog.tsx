import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { ConfirmDialogShell } from "./ConfirmDialogShell";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    /**
     * L'azione. `true` → il dialog si chiude; `false` → resta aperto (errore
     * già gestito); `void` → resta com'è: è l'handler a chiudere (i consumer
     * che chiudono da soli passano la loro funzione senza wrapper).
     */
    onConfirm: () => Promise<boolean | void> | boolean | void;
    title: string;
    /** Una riga: cosa succede e cosa si perde. */
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** `danger` per eliminare/sospendere (default); `primary` per confermare. */
    confirmVariant?: "danger" | "primary";
    /**
     * Campo di conferma: il bottone distruttivo si abilita solo quando il testo
     * digitato coincide (es. il nome dell'azienda da eliminare).
     */
    confirmText?: string;
    /** Etichetta del campo di conferma. Default «Digita "<confirmText>" per confermare». */
    confirmFieldLabel?: string;
    /** Azione in corso pilotata dal consumer (altrimenti è interna, durante `onConfirm`). */
    isLoading?: boolean;
    /** Errore dell'azione: InlineBanner error sopra i bottoni. */
    error?: string | null;
    /** Dettaglio fra la riga e i bottoni (es. l'elenco di cosa cambia). Non un form. */
    children?: ReactNode;
};

/**
 * «Sei sicuro?» — solo per l'irreversibile (scheda «ConfirmDialog»,
 * regola 1). Titolo · una riga · 0–1 campo di conferma · Annulla a sinistra
 * e il distruttivo a destra in `danger`; focus iniziale sul bottone non
 * distruttivo; con l'azione in corso Annulla, ESC e scrim sono disabilitati.
 */
export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = "Conferma",
    cancelLabel = "Annulla",
    confirmVariant = "danger",
    confirmText,
    confirmFieldLabel,
    isLoading,
    error,
    children
}: Props) {
    const [busy, setBusy] = useState(false);
    const [typed, setTyped] = useState("");

    useEffect(() => {
        if (!isOpen) setTyped("");
    }, [isOpen]);

    const loading = isLoading ?? busy;
    const canConfirm = !loading && (!confirmText || typed === confirmText);

    const handleConfirm = async () => {
        if (!canConfirm) return;
        setBusy(true);
        try {
            const ok = await onConfirm();
            if (ok === true) onClose();
        } finally {
            setBusy(false);
        }
    };

    return (
        <ConfirmDialogShell
            isOpen={isOpen}
            onClose={onClose}
            locked={loading}
            title={title}
            message={message}
            error={error}
            footer={
                <>
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={loading} data-autofocus>
                        {cancelLabel}
                    </Button>
                    <Button
                        variant={confirmVariant}
                        size="sm"
                        onClick={handleConfirm}
                        loading={loading}
                        disabled={!canConfirm}
                    >
                        {confirmLabel}
                    </Button>
                </>
            }
        >
            {confirmText && (
                <TextInput
                    label={confirmFieldLabel ?? `Digita "${confirmText}" per confermare`}
                    placeholder={confirmText}
                    value={typed}
                    onChange={e => setTyped(e.target.value)}
                    disabled={loading}
                    autoComplete="off"
                />
            )}
            {children}
        </ConfirmDialogShell>
    );
}
