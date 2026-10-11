import { useEffect, useRef, useState } from "react";
import styles from "./CopyButton.module.scss";

const COPIED_MS = 1800;

type CopyButtonProps = {
    text: string;
    /** Nome accessibile del bottone, es. «Copia l'indirizzo email». */
    label: string;
    /** Fumetto sopra il bottone dopo la copia, letto anche dagli screen reader. */
    copiedLabel: string;
};

/**
 * Copia negli appunti; l'icona diventa una spunta e compare il fumetto per
 * 1,8 s. Su `data-tone="dark"` prende i colori del tono scuro (footer).
 */
export default function CopyButton({ text, label, copiedLabel }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);
    const timer = useRef(0);

    useEffect(() => () => window.clearTimeout(timer.current), []);

    // «Copiato» solo se la copia è riuscita (su http o senza permesso fallisce).
    const copy = () => {
        navigator.clipboard
            ?.writeText(text)
            .then(() => {
                setCopied(true);
                window.clearTimeout(timer.current);
                timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
            })
            .catch(() => undefined);
    };

    return (
        <span className={styles.copyWrap}>
            <button type="button" className={copied ? `${styles.copy} ${styles.copied}` : styles.copy} aria-label={label} onClick={copy}>
                <svg className={styles.icCopy} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="12" height="12" rx="2.5" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <svg className={styles.icOk} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
            </button>
            <span className={styles.tip} aria-hidden="true">
                {copiedLabel}
            </span>
            <span className={styles.srOnly} role="status">
                {copied ? copiedLabel : ""}
            </span>
        </span>
    );
}
