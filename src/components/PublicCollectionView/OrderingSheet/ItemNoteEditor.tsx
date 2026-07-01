import { useState, useEffect } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Plus, X, Pencil, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAutoGrow } from "./useAutoGrow";
import styles from "./ItemNoteEditor.module.scss";

const ITEM_NOTE_MAX = 140;
const WARN_THRESHOLD = 20;

interface Props {
    note: string | null;
    onSave: (note: string) => void;
    onRemove: () => void;
}

type Mode = "hidden" | "editing" | "saved";

export default function ItemNoteEditor({ note, onSave, onRemove }: Props) {
    const { t } = useTranslation("public");
    const [mode, setMode] = useState<Mode>(note ? "saved" : "hidden");
    const [draft, setDraft] = useState(note ?? "");
    const textareaRef = useAutoGrow(draft, 4);

    // Sync mode when parent flips note externally (cart clear, post-submit, edit
    // from menu sheet). Editing mode is intentionally not interrupted: a mid-edit
    // user wouldn't expect their draft to vanish.
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

    if (mode === "hidden") {
        return (
            <button
                type="button"
                onClick={() => handleOpenEditor("")}
                className={styles.addBtn}
            >
                <Plus size={12} />
                {t("ordering.item_note_add")}
            </button>
        );
    }

    if (mode === "saved") {
        return (
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
        );
    }

    const len = draft.length;
    const isNearLimit = len >= ITEM_NOTE_MAX - WARN_THRESHOLD;

    return (
        <div className={styles.editor}>
            <textarea
                ref={textareaRef}
                value={draft}
                onChange={e => setDraft(e.target.value.slice(0, ITEM_NOTE_MAX))}
                placeholder={t("ordering.item_note_placeholder")}
                rows={1}
                maxLength={ITEM_NOTE_MAX}
                className={styles.textarea}
                aria-label={t("ordering.item_note_aria")}
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
                    className={`${styles.counter} ${isNearLimit ? styles.counterWarn : ""}`}
                >
                    {len} / {ITEM_NOTE_MAX}
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
}
