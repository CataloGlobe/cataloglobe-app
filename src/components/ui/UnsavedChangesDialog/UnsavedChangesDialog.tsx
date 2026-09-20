import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { ConfirmDialogShell } from "@/components/ui/ConfirmDialog/ConfirmDialogShell";
import styles from "@/components/ui/ConfirmDialog/ConfirmDialog.module.scss";

type Props = {
    isOpen: boolean;
    /** Resta dove sei (anche backdrop/ESC). Le modifiche restano intatte. */
    onCancel: () => void;
    /** Scarta le modifiche e procedi. */
    onDiscard: () => void;
    /**
     * Salva (STESSA funzione di salvataggio della pagina — un solo percorso)
     * e procedi. Deve restituire true se il salvataggio è riuscito.
     * Assente = dialogo a due opzioni (guardia di navigazione, che non
     * conosce il salvataggio della pagina).
     */
    onSaveAndExit?: () => Promise<boolean>;
    title?: string;
    message?: string;
    /** Etichetta del "resta qui". Default «Annulla»; la guardia usa «Resta». */
    cancelLabel?: string;
};

/**
 * La variante «esci senza salvare» di ConfirmDialog (scheda «ConfirmDialog»):
 * 3 opzioni (2 senza `onSaveAndExit`) per la guardia su uscita con
 * modifiche non salvate — cambio tab intercettato dalla pagina, o
 * navigazione interna bloccata da `UnsavedChangesGuardHost`. Stesso
 * contenitore di ConfirmDialog; il focus iniziale è su «Resta».
 */
export function UnsavedChangesDialog({
    isOpen,
    onCancel,
    onDiscard,
    onSaveAndExit,
    title = "Modifiche non salvate",
    message = "Hai modifiche non salvate. Cosa vuoi fare?",
    cancelLabel = "Annulla",
}: Props) {
    const [saving, setSaving] = useState(false);

    const handleSaveAndExit = async () => {
        if (!onSaveAndExit) return;
        setSaving(true);
        // Su successo è il parent a procedere (e chiudere il dialog); su errore
        // il toast arriva dalla funzione di salvataggio e il dialog resta
        // aperto, così l'utente può riprovare o uscire senza salvare.
        await onSaveAndExit();
        setSaving(false);
    };

    return (
        <ConfirmDialogShell
            isOpen={isOpen}
            onClose={onCancel}
            locked={saving}
            title={title}
            message={message}
            footer={
                <>
                    <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving} data-autofocus>
                        {cancelLabel}
                    </Button>
                    <div className={styles.footerRight}>
                        <Button variant="secondary" size="sm" onClick={onDiscard} disabled={saving}>
                            Esci senza salvare
                        </Button>
                        {onSaveAndExit && (
                            <Button variant="primary" size="sm" onClick={handleSaveAndExit} loading={saving}>
                                Salva ed esci
                            </Button>
                        )}
                    </div>
                </>
            }
        />
    );
}
