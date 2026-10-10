import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    useState,
    type ChangeEvent,
    type CSSProperties,
    type MouseEvent,
    type ReactNode
} from "react";
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
    /** Errore o aiuto subito sotto le caselle, sopra «Incolla» e «Cancella». */
    message?: ReactNode;
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
    { id, label, value, onChange, onComplete, length = 6, disabled, invalid, describedBy, autoFocus, message },
    ref
) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [focused, setFocused] = useState(false);
    // Dove sta il cursore vero dell'input nascosto: la casella accesa lo segue,
    // così le frecce e il clic su una casella si vedono.
    const [caret, setCaret] = useState(0);
    const syncCaret = () => {
        const input = inputRef.current;
        if (input) setCaret(input.selectionStart ?? input.value.length);
    };
    const moveCaret = (position: number) => {
        const input = inputRef.current;
        if (!input) return;
        input.setSelectionRange(position, position);
        setCaret(position);
    };
    // Dove rimettere il cursore dopo un cambio fatto da qui: React riscrive il
    // valore dell'input e il cursore vero andrebbe in fondo. Si applica prima
    // del disegno, così una seconda cifra scritta subito lo trova già al posto.
    const pendingCaretRef = useRef<number | null>(null);
    useLayoutEffect(() => {
        const position = pendingCaretRef.current;
        if (position === null) return;
        pendingCaretRef.current = null;
        const input = inputRef.current;
        if (input && document.activeElement === input) moveCaret(Math.min(position, input.value.length));
    });
    // Codice svuotato o accorciato da fuori (errore, «Cancella»): il cursore torna dentro.
    useEffect(() => {
        setCaret(c => Math.min(c, value.length));
    }, [value]);

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
            pendingCaretRef.current = sanitizeCode(text, length).length;
            apply(text);
        } catch {
            // Permesso negato o niente testo: resta il campo, dove si incolla a mano.
        }
        inputRef.current?.focus();
    };

    const handleClear = () => {
        pendingCaretRef.current = 0;
        onChange("");
        inputRef.current?.focus();
    };

    // Una cifra scritta su una casella già piena la sostituisce, come nelle
    // caselle vere: prima si inseriva in mezzo e le cifre scivolavano avanti
    // (sembravano invertite) e, a campo pieno, l'ultima cadeva. Si guarda il
    // valore nuovo e non il tasto, così vale anche per le tastiere dei
    // telefoni, che non dicono quale tasto è stato premuto.
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        const caretAfter = e.target.selectionStart ?? raw.length;
        const at = caretAfter - 1;
        const insertedOneInside =
            raw.length === value.length + 1 &&
            at >= 0 &&
            at < value.length &&
            /\d/.test(raw[at]) &&
            raw === value.slice(0, at) + raw[at] + value.slice(at);
        if (insertedOneInside) {
            pendingCaretRef.current = Math.min(at + 1, length);
            apply(value.slice(0, at) + raw[at] + value.slice(at + 1));
            return;
        }
        // Codice intero incollato (o dall'autofill) con cifre già scritte:
        // sostituisce tutto invece di infilarsi a metà («123456» + «654321» non è «126543»).
        const added = raw.length - value.length;
        if (added >= 2 && value.length > 0) {
            const pasted = sanitizeCode(raw.slice(Math.max(0, caretAfter - added), caretAfter), length);
            if (pasted.length === length) {
                pendingCaretRef.current = length;
                apply(pasted);
                return;
            }
        }
        // Le cifre prima del cursore, pulite, dicono dove resta il cursore.
        pendingCaretRef.current = sanitizeCode(raw.slice(0, caretAfter), length).length;
        apply(raw);
    };

    // Il clic cade sull'input trasparente: si porta il cursore sulla casella toccata.
    const handleClick = (e: MouseEvent<HTMLInputElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width <= 0) return;
        const index = Math.floor(((e.clientX - rect.left) / rect.width) * length);
        moveCaret(Math.max(0, Math.min(index, value.length)));
    };

    const activeIndex = focused && !disabled ? Math.min(caret, length - 1) : -1;
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
                    onChange={handleChange}
                    onClick={handleClick}
                    onSelect={syncCaret}
                    onFocus={() => {
                        setFocused(true);
                        syncCaret();
                    }}
                    onBlur={() => setFocused(false)}
                />
            </div>
            {message}
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
