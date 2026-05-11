import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import styles from "./InlineEditableField.module.scss";

type InputType = "text" | "email" | "url" | "tel";

type InlineEditableFieldProps = {
    fieldId: string;
    label: string;
    value: string | null;
    emptyPlaceholder?: string;
    publicFlag?: boolean;
    inputType?: InputType;
    prefix?: string;
    validate?: (v: string) => string | null;
    onSave: (newValue: string) => Promise<void>;
    onTogglePublic?: (newValue: boolean) => Promise<void>;
    activeFieldId: string | null;
    onActivate: (fieldId: string | null) => void;
};

export const InlineEditableField: React.FC<InlineEditableFieldProps> = ({
    fieldId,
    label,
    value,
    emptyPlaceholder = "Non specificato",
    publicFlag,
    inputType = "text",
    prefix,
    validate,
    onSave,
    onTogglePublic,
    activeFieldId,
    onActivate
}) => {
    const isEditing = activeFieldId === fieldId;
    const [localValue, setLocalValue] = useState(value ?? "");
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isToggling, setIsToggling] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing) {
            setLocalValue(value ?? "");
            setError(null);
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [isEditing, value]);

    const commitSave = async () => {
        const trimmed = localValue.trim();
        const previous = (value ?? "").trim();

        if (validate && trimmed) {
            const err = validate(trimmed);
            if (err) {
                setError(err);
                return;
            }
        }

        if (trimmed === previous) {
            onActivate(null);
            return;
        }

        setIsSaving(true);
        try {
            await onSave(trimmed);
            onActivate(null);
        } catch {
            setError("Errore nel salvataggio.");
        } finally {
            setIsSaving(false);
        }
    };

    const cancel = () => {
        setError(null);
        setLocalValue(value ?? "");
        onActivate(null);
    };

    const handleRowClick = (e: React.MouseEvent) => {
        if (isEditing) return;
        if ((e.target as HTMLElement).closest("[data-eye-toggle]")) return;
        onActivate(fieldId);
    };

    const handleTogglePublic = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!onTogglePublic || publicFlag === undefined) return;
        setIsToggling(true);
        try {
            await onTogglePublic(!publicFlag);
        } finally {
            setIsToggling(false);
        }
    };

    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            void commitSave();
        } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
        }
    };

    const hasValue = !!(value && value.trim());
    const displayValue = hasValue && prefix ? `${prefix}${value}` : value;

    return (
        <div
            className={`${styles.row} ${isEditing ? styles.editing : ""}`}
            onClick={handleRowClick}
            role={isEditing ? undefined : "button"}
            tabIndex={isEditing ? -1 : 0}
            onKeyDown={e => {
                if (isEditing) return;
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onActivate(fieldId);
                }
            }}
        >
            <div className={styles.body}>
                <span className={styles.label}>{label}</span>
                {isEditing ? (
                    <input
                        ref={inputRef}
                        className={styles.input}
                        type={inputType}
                        value={localValue}
                        onChange={e => setLocalValue(e.target.value)}
                        onBlur={() => void commitSave()}
                        onKeyDown={handleKey}
                        onClick={e => e.stopPropagation()}
                        disabled={isSaving}
                        autoComplete="off"
                    />
                ) : (
                    <span className={hasValue ? styles.value : styles.empty}>
                        {hasValue ? displayValue : emptyPlaceholder}
                    </span>
                )}
                {isEditing && error && <span className={styles.error}>{error}</span>}
            </div>
            {publicFlag !== undefined && onTogglePublic && (
                <button
                    type="button"
                    className={`${styles.eye} ${publicFlag ? styles.eyeOn : styles.eyeOff}`}
                    onClick={handleTogglePublic}
                    disabled={isToggling}
                    aria-label={publicFlag ? "Nascondi pubblicamente" : "Mostra pubblicamente"}
                    title={publicFlag ? "Visibile pubblicamente" : "Nascosto pubblicamente"}
                    data-eye-toggle
                >
                    {publicFlag ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
            )}
        </div>
    );
};
