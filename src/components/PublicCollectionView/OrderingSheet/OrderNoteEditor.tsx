import { useState, useEffect } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Plus, X, Pencil, Check } from "lucide-react";
import { useAutoGrow } from "./useAutoGrow";
import styles from "./OrderNoteEditor.module.scss";

const ORDER_NOTE_MAX = 300;
const WARN_THRESHOLD = 30;

interface Props {
    note: string | null;
    onSave: (note: string) => void;
    onRemove: () => void;
}

type Mode = "hidden" | "editing" | "saved";

export default function OrderNoteEditor({ note, onSave, onRemove }: Props) {
    const [mode, setMode] = useState<Mode>(note ? "saved" : "hidden");
    const [draft, setDraft] = useState(note ?? "");
    const textareaRef = useAutoGrow(draft, 5);

    useEffect(() => {
        if (note === null && mode === "saved") {
            setMode("hidden");
            setDraft("");
        } else if (note !== null && mode === "hidden") {
            setMode("saved");
            setDraft(note);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [note]);

    const handleOpenEditor = (existing: string) => {
        setDraft(existing);
        setMode("editing");
        setTimeout(() => textareaRef.current?.focus(), 50);
    };

    const handleConfirm = () => {
        const trimmed = draft.trim().replace(/\s+/g, " ");
        if (trimmed === "") {
            onRemove();
            setMode("hidden");
            setDraft("");
        } else {
            onSave(trimmed);
            setMode("saved");
            setDraft(trimmed);
        }
    };

    const handleCancelEdit = () => {
        if (note) {
            setDraft(note);
            setMode("saved");
        } else {
            setDraft("");
            setMode("hidden");
        }
    };

    const handleRemoveSaved = (e: ReactMouseEvent) => {
        e.stopPropagation();
        onRemove();
        setMode("hidden");
        setDraft("");
    };

    return (
        <div className={styles.section}>
            <div className={styles.label}>Note per la cucina</div>

            {mode === "hidden" && (
                <button
                    type="button"
                    onClick={() => handleOpenEditor("")}
                    className={styles.addBtn}
                >
                    <Plus size={12} />
                    Aggiungi nota per l’ordine
                </button>
            )}

            {mode === "saved" && (
                <button
                    type="button"
                    onClick={() => handleOpenEditor(note ?? "")}
                    className={styles.savedPill}
                >
                    <Pencil size={12} className={styles.savedIcon} />
                    <span className={styles.savedText}>“{note}”</span>
                    <span
                        onClick={handleRemoveSaved}
                        className={styles.savedRemove}
                        aria-label="Rimuovi nota"
                        role="button"
                        tabIndex={-1}
                    >
                        <X size={12} />
                    </span>
                </button>
            )}

            {mode === "editing" && (() => {
                const len = draft.length;
                const isNearLimit = len >= ORDER_NOTE_MAX - WARN_THRESHOLD;
                return (
                    <div className={styles.editor}>
                        <textarea
                            ref={textareaRef}
                            value={draft}
                            onChange={e =>
                                setDraft(e.target.value.slice(0, ORDER_NOTE_MAX))
                            }
                            placeholder="Es. consegnare tutto insieme, senza fretta…"
                            rows={2}
                            maxLength={ORDER_NOTE_MAX}
                            className={styles.textarea}
                            aria-label="Note per la cucina"
                        />
                        <div className={styles.footer}>
                            <button
                                type="button"
                                onClick={handleCancelEdit}
                                className={styles.cancelBtn}
                            >
                                Annulla
                            </button>
                            <span
                                className={`${styles.counter} ${
                                    isNearLimit ? styles.counterWarn : ""
                                }`}
                            >
                                {len} / {ORDER_NOTE_MAX}
                            </span>
                            <button
                                type="button"
                                onClick={handleConfirm}
                                className={styles.confirmBtn}
                            >
                                <Check size={11} />
                                Conferma
                            </button>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
