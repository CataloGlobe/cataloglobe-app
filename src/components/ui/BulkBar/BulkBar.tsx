import { createPortal } from "react-dom";
import { IconTrash, IconX } from "@tabler/icons-react";
import styles from "./BulkBar.module.scss";

export interface BulkBarProps {
    selectedCount: number;
    onDelete?: () => void;
    onClearSelection?: () => void;
    additionalActions?: React.ReactNode;
}

export function BulkBar({ selectedCount, onDelete, onClearSelection, additionalActions }: BulkBarProps) {
    if (selectedCount === 0) return null;

    return createPortal(
        <div className={styles.bulkBar}>
            <span className={styles.count}>{selectedCount} selezionati</span>
            <div className={styles.separator} />
            {additionalActions}
            {onDelete && (
                <button
                    type="button"
                    className={`${styles.action} ${styles.actionDanger}`}
                    onClick={onDelete}
                >
                    <IconTrash size={16} />
                    Elimina selezionati
                </button>
            )}
            {onClearSelection && (
                <button
                    type="button"
                    className={styles.closeButton}
                    onClick={onClearSelection}
                    aria-label="Annulla selezione"
                >
                    <IconX size={16} />
                </button>
            )}
        </div>,
        document.body
    );
}
