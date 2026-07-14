import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import type { ProductNote } from "@/services/supabase/products";
import styles from "./ProductNotesSection.module.scss";

const MAX_NOTES = 10;
const MAX_LABEL_LENGTH = 100;
const MAX_VALUE_LENGTH = 500;

interface ProductNotesSectionProps {
    /** Current list of notes (controlled). */
    value: ProductNote[];
    /** Emits the next list on every keystroke / add / remove. */
    onChange: (next: ProductNote[]) => void;
    disabled?: boolean;
}

/**
 * Editable list of {label, value} pairs attached to a product.
 *
 * Pure controlled component (no internal state). Validation is permissive at
 * UI level — empty rows show a hint but never block save. Authoritative
 * validation/normalization runs server-side via `validateProductNotes`
 * (trim, skip-empty, length caps); the parent re-syncs the snapshot from the
 * cleaned array returned by `updateProduct`.
 *
 * `maxLength` HTML caps prevent typing past 100 chars (label) / 500 chars
 * (value) at the browser level.
 */
export default function ProductNotesSection({
    value,
    onChange,
    disabled = false
}: ProductNotesSectionProps) {
    const isAtCap = value.length >= MAX_NOTES;
    const isEmpty = value.length === 0;

    const addRow = () => {
        if (isAtCap || disabled) return;
        onChange([...value, { label: "", value: "" }]);
    };

    const removeRow = (idx: number) => {
        if (disabled) return;
        onChange(value.filter((_, i) => i !== idx));
    };

    const updateRow = (idx: number, field: "label" | "value", next: string) => {
        if (disabled) return;
        onChange(value.map((row, i) => (i === idx ? { ...row, [field]: next } : row)));
    };

    return (
        <section className={styles.root}>
            {isEmpty ? (
                <EmptyState
                    variant="inline"
                    icon={null}
                    title="Nessuna nota"
                    action={
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={addRow}
                            disabled={disabled}
                            leftIcon={<Plus size={14} />}
                        >
                            Aggiungi nota
                        </Button>
                    }
                />
            ) : (
                <>
                    <ul className={styles.list}>
                        {value.map((note, idx) => {
                            const labelHasError =
                                note.label.length > 0 && note.label.trim() === "";
                            return (
                                <li key={idx} className={styles.row}>
                                    <div className={styles.rowFields}>
                                        <TextInput
                                            label="Etichetta"
                                            placeholder="es. Provenienza"
                                            value={note.label}
                                            onChange={e => updateRow(idx, "label", e.target.value)}
                                            maxLength={MAX_LABEL_LENGTH}
                                            error={
                                                labelHasError
                                                    ? "Etichetta obbligatoria"
                                                    : undefined
                                            }
                                            disabled={disabled}
                                        />
                                        <TextInput
                                            label="Valore"
                                            placeholder="es. Carne italiana 100%"
                                            value={note.value}
                                            onChange={e => updateRow(idx, "value", e.target.value)}
                                            maxLength={MAX_VALUE_LENGTH}
                                            disabled={disabled}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        className={styles.removeBtn}
                                        onClick={() => removeRow(idx)}
                                        disabled={disabled}
                                        aria-label={`Rimuovi nota ${idx + 1}`}
                                    >
                                        <X size={16} />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={addRow}
                        disabled={disabled || isAtCap}
                        leftIcon={<Plus size={14} />}
                        className={styles.addButton}
                    >
                        Aggiungi nota
                    </Button>
                </>
            )}
        </section>
    );
}
