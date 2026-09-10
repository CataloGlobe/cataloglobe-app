import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Plus, X, Pencil, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAutoGrow } from "./useAutoGrow";
import type { NoteEditorHandle } from "./noteEditorHandle";
import styles from "./OrderNoteEditor.module.scss";

const ORDER_NOTE_MAX = 300;
const WARN_THRESHOLD = 30;

interface Props {
    note: string | null;
    onSave: (note: string) => void;
    onRemove: () => void;
}

type Mode = "hidden" | "editing" | "saved";

function OrderNoteEditor({ note, onSave, onRemove }: Props, ref: React.Ref<NoteEditorHandle>) {
    const { t } = useTranslation("public");
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

    const commitDraft = (): string | undefined => {
        const trimmed = draft.trim().replace(/\s+/g, " ");
        if (trimmed === "") {
            onRemove();
            setMode("hidden");
            setDraft("");
            return undefined;
        }
        onSave(trimmed);
        setMode("saved");
        setDraft(trimmed);
        return trimmed;
    };

    const handleConfirm = () => {
        commitDraft();
    };

    useImperativeHandle(ref, () => ({
        flushPendingNote: () => {
            if (mode !== "editing" || draft.trim() === "") return undefined;
            return commitDraft();
        }
    }));

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
            <div className={styles.label}>{t("ordering.order_note_label")}</div>

            {mode === "hidden" && (
                <button
                    type="button"
                    onClick={() => handleOpenEditor("")}
                    className={styles.addBtn}
                >
                    <Plus size={12} />
                    {t("ordering.order_note_add")}
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
                        aria-label={t("ordering.note_remove_aria")}
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
                            placeholder={t("ordering.order_note_placeholder")}
                            rows={2}
                            maxLength={ORDER_NOTE_MAX}
                            className={styles.textarea}
                            aria-label={t("ordering.order_note_label")}
                        />
                        <div className={styles.footer}>
                            <button
                                type="button"
                                onClick={handleCancelEdit}
                                className={styles.cancelBtn}
                            >
                                {t("ordering.note_cancel")}
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
                                {t("ordering.note_confirm")}
                            </button>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

export default forwardRef(OrderNoteEditor);
