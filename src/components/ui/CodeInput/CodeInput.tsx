import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from "react";
import { sanitizeCode } from "./sanitizeCode";
import styles from "./CodeInput.module.scss";

export type CodeInputHandle = {
    focus: () => void;
};

type CodeInputProps = {
    id: string;
    label: string;
    value: string;
    onChange: (code: string) => void;
    /** Chiamata quando le cifre arrivano a `length`, scritte o incollate. */
    onComplete?: (code: string) => void;
    length?: number;
    disabled?: boolean;
    invalid?: boolean;
    /** id del messaggio d'errore o d'aiuto, per aria-describedby. */
    describedBy?: string;
    autoFocus?: boolean;
};

function canReadClipboard(): boolean {
    return typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";
}

/**
 * Il codice di N cifre di OTP e registrazione. Un solo input vero, così
 * correggere una cifra è come in qualsiasi campo (cursore, Backspace,
 * selezione), più «Incolla» e «Cancella» a portata di dito.
 */
export const CodeInput = forwardRef<CodeInputHandle, CodeInputProps>(function CodeInput(
    { id, label, value, onChange, onComplete, length = 6, disabled, invalid, describedBy, autoFocus },
    ref
) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [focused, setFocused] = useState(false);

    // Un campo disabilitato non prende il focus: dopo un codice sbagliato la
    // pagina chiede il focus mentre la verifica è ancora in corso. La richiesta
    // resta in attesa e si applica quando il campo torna attivo.
    const pendingFocusRef = useRef(false);
    useImperativeHandle(ref, () => ({
        focus: () => {
            const input = inputRef.current;
            if (input && !input.disabled) input.focus();
            else pendingFocusRef.current = true;
        }
    }), []);
    useEffect(() => {
        if (!disabled && pendingFocusRef.current) {
            pendingFocusRef.current = false;
            inputRef.current?.focus();
        }
    }, [disabled]);

    const apply = (raw: string) => {
        const code = sanitizeCode(raw, length);
        onChange(code);
        if (code.length === length) onComplete?.(code);
    };

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            apply(text);
        } catch {
            // Permesso negato o niente testo: resta il campo, dove si incolla a mano.
        }
        inputRef.current?.focus();
    };

    const handleClear = () => {
        onChange("");
        inputRef.current?.focus();
    };

    const activeIndex = focused && !disabled ? Math.min(value.length, length - 1) : -1;
    const wrapperClass = [styles.wrapper, invalid ? styles.invalid : "", disabled ? styles.disabled : ""]
        .filter(Boolean)
        .join(" ");

    return (
        <div className={wrapperClass}>
            <label htmlFor={id} className={styles.label}>
                {label}
            </label>
            <div className={styles.field}>
                <div className={styles.boxes} style={{ "--code-length": length } as CSSProperties} aria-hidden="true">
                    {Array.from({ length }, (_, i) => (
                        <div key={i} className={`${styles.box} ${i === activeIndex ? styles.active : ""}`}>
                            {value[i] ?? ""}
                        </div>
                    ))}
                </div>
                <input
                    ref={inputRef}
                    id={id}
                    className={styles.input}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    value={value}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    onChange={e => apply(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                />
            </div>
            <div className={styles.actions}>
                {canReadClipboard() && (
                    <button type="button" className={styles.action} onClick={handlePaste} disabled={disabled}>
                        Incolla
                    </button>
                )}
                <button
                    type="button"
                    className={`${styles.action} ${styles.secondary}`}
                    onClick={handleClear}
                    disabled={disabled || value.length === 0}
                >
                    Cancella
                </button>
            </div>
        </div>
    );
});
