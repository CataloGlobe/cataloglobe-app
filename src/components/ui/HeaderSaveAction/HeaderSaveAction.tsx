import Text from "@/components/ui/Text/Text";
import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import styles from "./HeaderSaveAction.module.scss";
import { SAVES_INSTANTLY_NOTE, formatChangeCount } from "./saveActionText";

/**
 * Conferma per lo scarto delle modifiche. Estratta perché la stessa domanda va
 * fatta da due punti diversi — il bottone "Annulla" della toolbar comoda e la
 * voce "Annulla" nel kebab di quella compatta — e deve restare la stessa
 * domanda: testo, etichette e variante distruttiva in un posto solo.
 */
export function DiscardChangesConfirmDialog({
    isOpen,
    onClose,
    onDiscard
}: {
    isOpen: boolean;
    onClose: () => void;
    onDiscard: () => void;
}) {
    return (
        <ConfirmDialog
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={async () => {
                onDiscard();
                return true;
            }}
            title="Scartare le modifiche non salvate?"
            message="Le modifiche non salvate andranno perse. Resti sulla pagina."
            confirmLabel="Scarta"
            confirmVariant="danger"
        />
    );
}

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
    /** Salva spento (es. campo non valido): il bottone resta a vista. */
    saveDisabled?: boolean;
    /** Quante modifiche ci sono: «N modifiche» prima di Annulla. Omesso → nessun conteggio. */
    changeCount?: number;
    /**
     * La tab aperta salva a ogni modifica: accanto a «Salvato» lo dice
     * («· in questa tab ogni modifica si salva subito»), al posto di una frase
     * sopra il contenuto.
     */
    savesInstantly?: boolean;
}


/**
 * Azione Salva (+ Annulla opzionale) iniettata nell'header di pagina via
 * `usePageHeader`. Stato "quiet" (Salvato ✓) quando tutto è allineato; stato
 * attivo (Annulla + Salva, nessun badge) quando ci sono modifiche pendenti —
 * la comparsa stessa dei bottoni è il segnale, il badge "Non salvato" sarebbe
 * ridondante. Il dialog di conferma per Annulla vive qui: unico punto,
 * garantisce lo stesso comportamento su tutte le pagine che passano `onDiscard`.
 */
export function HeaderSaveAction({
    isDirty,
    isSaving,
    onSave,
    onDiscard,
    saveDisabled = false,
    changeCount,
    savesInstantly = false
}: HeaderSaveActionProps) {
    const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

    if (!isDirty && !isSaving) {
        return (
            <span className={styles.savedPill} role="status">
                <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                <Text as="span" variant="body-sm" weight={500}>Salvato</Text>
                {savesInstantly && (
                    <Text as="span" variant="body-sm" colorVariant="muted" className={styles.note}>
                        · {SAVES_INSTANTLY_NOTE}
                    </Text>
                )}
            </span>
        );
    }

    return (
        <div className={styles.dirtyGroup}>
            {changeCount != null && changeCount > 0 && (
                <Text as="span" variant="body-sm" colorVariant="muted" className={styles.count}>
                    {formatChangeCount(changeCount)}
                </Text>
            )}
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
            <Button variant="primary" size="sm" loading={isSaving} disabled={saveDisabled} onClick={onSave}>
                Salva
            </Button>

            {onDiscard && (
                <DiscardChangesConfirmDialog
                    isOpen={confirmDiscardOpen}
                    onClose={() => setConfirmDiscardOpen(false)}
                    onDiscard={onDiscard}
                />
            )}
        </div>
    );
}
