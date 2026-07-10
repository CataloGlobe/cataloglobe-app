import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import styles from "./HeaderSaveAction.module.scss";

interface HeaderSaveActionProps {
    /** true quando il draft differisce dallo stato salvato. */
    isDirty: boolean;
    isSaving: boolean;
    onSave: () => void;
}

/**
 * Azione Salva iniettata nell'header di pagina via `usePageHeader`.
 * Stato "quiet" (Salvato ✓) quando tutto è allineato; stato attivo
 * (pill "Non salvato" + bottone Salva) quando ci sono modifiche pendenti.
 * Presentazionale — nessuna logica di salvataggio, delega a `onSave`.
 */
export function HeaderSaveAction({ isDirty, isSaving, onSave }: HeaderSaveActionProps) {
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
            <span className={styles.unsaved} role="status">
                <span className={styles.dot} aria-hidden="true" />
                Non salvato
            </span>
            <Button variant="primary" size="sm" loading={isSaving} onClick={onSave}>
                Salva
            </Button>
        </div>
    );
}
