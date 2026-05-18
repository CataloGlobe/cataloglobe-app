import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import styles from "./UnsavedChangesBar.module.scss";

export interface UnsavedChangesBarProps {
    isSaving: boolean;
    onCancel: () => void;
    onSave: () => void;
    label?: string;
    cancelLabel?: string;
    saveLabel?: string;
}

export function UnsavedChangesBar({
    isSaving,
    onCancel,
    onSave,
    label = "Modifiche non salvate",
    cancelLabel = "Annulla",
    saveLabel = "Salva"
}: UnsavedChangesBarProps) {
    return (
        <div className={styles.bar} role="status" aria-live="polite">
            <div className={styles.label}>
                <span className={styles.dot} aria-hidden />
                <Text variant="body-sm" weight={600}>
                    {label}
                </Text>
            </div>
            <div className={styles.buttons}>
                <Button
                    type="button"
                    variant="secondary"
                    onClick={onCancel}
                    disabled={isSaving}
                >
                    {cancelLabel}
                </Button>
                <Button
                    type="button"
                    variant="primary"
                    onClick={onSave}
                    loading={isSaving}
                    disabled={isSaving}
                >
                    {saveLabel}
                </Button>
            </div>
        </div>
    );
}

export default UnsavedChangesBar;
