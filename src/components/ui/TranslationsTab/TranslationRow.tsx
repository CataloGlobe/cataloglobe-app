import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import styles from "./TranslationRow.module.scss";

interface TranslationRowProps {
    /** Bandiera emoji della lingua (opzionale). */
    flag?: string | null;
    /** Nome nativo della lingua. */
    name: string;
    /** Badge di stato (auto / manuale / da rivedere). */
    badge: ReactNode;
    /** Anteprima troncata della traduzione corrente. */
    preview: string;
    /** Testo mostrato quando non c'è ancora una traduzione. */
    previewEmptyLabel: string;
    /** Riga aperta? (single-open gestito dal parent). */
    expanded: boolean;
    /** Toggle apertura/chiusura. */
    onToggle: () => void;
    /** Contenuto espanso (editor o vista read-only). */
    children?: ReactNode;
}

/**
 * Riga compatta espandibile per una singola lingua. Collassata mostra
 * bandiera + nome + badge + anteprima troncata; espansa rivela il contenuto
 * passato come children. Nessun accordion riusabile esiste in `ui/`, quindi
 * costruito ad hoc qui (animazione height via framer-motion, single-open
 * controllato dal parent).
 */
export function TranslationRow({
    flag,
    name,
    badge,
    preview,
    previewEmptyLabel,
    expanded,
    onToggle,
    children
}: TranslationRowProps) {
    const hasPreview = preview.trim().length > 0;

    return (
        <div className={clsx(styles.row, expanded && styles.rowOpen)}>
            <button
                type="button"
                className={clsx(styles.header, expanded && styles.headerOpen)}
                onClick={onToggle}
                aria-expanded={expanded}
            >
                {flag && (
                    <span className={styles.flag} aria-hidden>
                        {flag}
                    </span>
                )}
                <span className={styles.name}>{name}</span>
                <span className={styles.badgeSlot}>{badge}</span>
                {expanded ? (
                    <span className={styles.spacer} />
                ) : (
                    <span
                        className={clsx(
                            styles.preview,
                            !hasPreview && styles.previewEmpty
                        )}
                    >
                        {hasPreview ? preview : previewEmptyLabel}
                    </span>
                )}
                <ChevronDown
                    size={16}
                    className={clsx(styles.chevron, expanded && styles.chevronOpen)}
                    aria-hidden
                />
            </button>

            <AnimatePresence initial={false}>
                {expanded && children && (
                    <motion.div
                        className={styles.bodyWrap}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                        <div className={styles.body}>{children}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default TranslationRow;
