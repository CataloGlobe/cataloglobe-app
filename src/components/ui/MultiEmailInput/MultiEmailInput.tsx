import { useCallback, useId, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import styles from "./MultiEmailInput.module.scss";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
    value: string[];
    onChange: (next: string[]) => void;
    placeholder?: string;
    disabled?: boolean;
    /** Optional cap. When reached, the input stops accepting new entries. */
    maxItems?: number;
    /** Label/aria-label for the text input itself. */
    ariaLabel?: string;
    /** External id used by an associated <label htmlFor=...>. */
    id?: string;
};

// Normalize: trim + lowercase. Keeps comparisons and storage consistent.
function normalize(s: string): string {
    return s.trim().toLowerCase();
}

function isValidEmail(s: string): boolean {
    if (s.length === 0 || s.length > 320) return false;
    return EMAIL_RE.test(s);
}

// Used by quick-pick callers and by paste-handling: split on common
// separators (comma / semicolon / whitespace / newline).
function splitCandidates(s: string): string[] {
    return s.split(/[\s,;]+/).map(p => p.trim()).filter(p => p.length > 0);
}

export function MultiEmailInput({
    value,
    onChange,
    placeholder = "email@esempio.it",
    disabled = false,
    maxItems,
    ariaLabel,
    id
}: Props) {
    const [text, setText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const reactId = useId();
    const inputId = id ?? `multiemail-${reactId}`;
    const errorId = `${inputId}-err`;
    const atLimit = typeof maxItems === "number" && value.length >= maxItems;

    const commit = useCallback(
        (raw: string): boolean => {
            const candidates = splitCandidates(raw);
            if (candidates.length === 0) return false;

            const accepted: string[] = [];
            const rejected: string[] = [];
            const existing = new Set(value.map(normalize));

            for (const c of candidates) {
                const n = normalize(c);
                if (existing.has(n)) continue; // dedup silently
                if (!isValidEmail(n)) {
                    rejected.push(c);
                    continue;
                }
                if (typeof maxItems === "number" && value.length + accepted.length >= maxItems) {
                    break;
                }
                accepted.push(n);
                existing.add(n);
            }

            if (accepted.length > 0) {
                onChange([...value, ...accepted]);
            }
            if (rejected.length > 0) {
                setError(
                    rejected.length === 1
                        ? "Email non valida."
                        : "Alcune email non sono valide."
                );
            } else if (accepted.length > 0) {
                setError(null);
            }
            return accepted.length > 0;
        },
        [value, onChange, maxItems]
    );

    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLInputElement>) => {
            if (disabled) return;
            if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                if (text.length === 0) return;
                const added = commit(text);
                if (added) setText("");
                return;
            }
            if (e.key === "Backspace" && text.length === 0 && value.length > 0) {
                e.preventDefault();
                onChange(value.slice(0, -1));
                setError(null);
                return;
            }
        },
        [text, value, commit, onChange, disabled]
    );

    const handleBlur = useCallback(() => {
        if (text.trim().length === 0) return;
        const added = commit(text);
        if (added) setText("");
    }, [text, commit]);

    const handlePaste = useCallback(
        (e: React.ClipboardEvent<HTMLInputElement>) => {
            const pasted = e.clipboardData.getData("text");
            if (!pasted.includes(",") && !/\s/.test(pasted) && !pasted.includes(";")) return;
            e.preventDefault();
            const added = commit(pasted);
            if (added) setText("");
        },
        [commit]
    );

    const handleRemove = useCallback(
        (email: string) => {
            onChange(value.filter(v => v !== email));
            setError(null);
            inputRef.current?.focus();
        },
        [value, onChange]
    );

    return (
        <div className={styles.wrapper} data-disabled={disabled ? "true" : undefined}>
            <div
                className={styles.field}
                role="group"
                aria-labelledby={ariaLabel ? undefined : inputId}
                aria-label={ariaLabel}
                onClick={() => inputRef.current?.focus()}
            >
                {value.map(email => (
                    <span key={email} className={styles.chip}>
                        <span className={styles.chipText}>{email}</span>
                        <button
                            type="button"
                            className={styles.chipRemove}
                            onClick={() => handleRemove(email)}
                            disabled={disabled}
                            aria-label={`Rimuovi ${email}`}
                        >
                            <X size={12} />
                        </button>
                    </span>
                ))}
                <input
                    ref={inputRef}
                    id={inputId}
                    type="email"
                    className={styles.input}
                    value={text}
                    onChange={e => {
                        setText(e.target.value);
                        if (error) setError(null);
                    }}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    onPaste={handlePaste}
                    placeholder={value.length === 0 ? placeholder : atLimit ? "" : "+ aggiungi"}
                    disabled={disabled || atLimit}
                    aria-invalid={error ? "true" : undefined}
                    aria-describedby={error ? errorId : undefined}
                    autoComplete="off"
                />
            </div>
            {error && (
                <span id={errorId} className={styles.error} role="alert">
                    {error}
                </span>
            )}
        </div>
    );
}

export { isValidEmail as isValidEmailAddress };
