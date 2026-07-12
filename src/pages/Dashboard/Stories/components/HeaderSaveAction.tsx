import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import styles from "./HeaderSaveAction.module.scss";

interface HeaderSaveActionProps {
    /** true quando il draft differisce dallo stato salvato. */
    isDirty: boolean;
    isSaving: boolean;
    onSave: () => void;
    /**
     * Riallinea il draft al baseline salvato (stessa funzione usata da
     * `UnsavedChangesDialog` per "Esci senza salvare"). Se passato, mostra il
     * bottone "Annulla" (solo quando `isDirty`) con conferma — resta sulla
     * pagina, non è una navigazione. Omesso → nessun bottone Annulla.
     */
    onDiscard?: () => void;
}

/**
 * Azione Salva (+ Annulla opzionale) iniettata nell'header di pagina via
 * `usePageHeader`. Stato "quiet" (Salvato ✓) quando tutto è allineato; stato
 * attivo (Annulla + Salva, nessun badge) quando ci sono modifiche pendenti —
 * la comparsa stessa dei bottoni è il segnale, il badge "Non salvato" sarebbe
 * ridondante. Il dialog di conferma per Annulla vive qui: unico punto,
 * garantisce lo stesso comportamento su tutte le pagine che passano `onDiscard`.
 */
export function HeaderSaveAction({ isDirty, isSaving, onSave, onDiscard }: HeaderSaveActionProps) {
    const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

    if (!isDirty && !isSaving) {
        return (
            <span className={styles.savedPill} role="status">
                <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                Salvato
            </span>
        );
    }

    return (
        <div className={styles.dirtyGroup}>
            {onDiscard && (
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => setConfirmDiscardOpen(true)}
                >
                    Annulla
                </Button>
            )}
            <Button variant="primary" size="sm" loading={isSaving} onClick={onSave}>
                Salva
            </Button>

            {onDiscard && (
                <ConfirmDialog
                    isOpen={confirmDiscardOpen}
                    onClose={() => setConfirmDiscardOpen(false)}
                    onConfirm={async () => {
                        onDiscard();
                        return true;
                    }}
                    title="Scartare le modifiche non salvate?"
                    message="Le modifiche non salvate andranno perse. Resti sulla pagina."
                    confirmLabel="Scarta"
                    confirmVariant="danger"
                />
            )}
        </div>
    );
}
