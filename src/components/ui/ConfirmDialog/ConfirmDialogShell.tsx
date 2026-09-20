import { ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import FocusLock from "react-focus-lock";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import Text from "@/components/ui/Text/Text";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import styles from "./ConfirmDialog.module.scss";

export interface ConfirmDialogShellProps {
    isOpen: boolean;
    /** Chiusura da ESC o dallo scrim (= il bottone non distruttivo). */
    onClose: () => void;
    /** Con l'azione in corso ESC e scrim non chiudono. */
    locked?: boolean;
    title: string;
    /** Una riga: cosa succede e cosa si perde. */
    message?: ReactNode;
    /** Fra la riga e i bottoni: il campo di conferma, o il dettaglio. */
    children?: ReactNode;
    /** Errore dell'azione: InlineBanner error sopra i bottoni, resta finché non si riprova. */
    error?: string | null;
    /** I bottoni: chi compone mette il non distruttivo a sinistra con `data-autofocus`. */
    footer: ReactNode;
}

/**
 * Il contenitore di ConfirmDialog e UnsavedChangesDialog (scheda
 * «ConfirmDialog»): scrim · pannello 420 al centro, padding 24,
 * radius-surface, shadow-overlay, z-overlay · titolo title-sm · una riga
 * body-sm muta · contenuto · errore · bottoni. Apertura in motion-base;
 * il focus iniziale va sull'elemento marcato `data-autofocus` (il bottone
 * non distruttivo), mai sul distruttivo.
 */
export function ConfirmDialogShell({
    isOpen,
    onClose,
    locked = false,
    title,
    message,
    children,
    error,
    footer
}: ConfirmDialogShellProps) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);
    const mouseDownOnOverlay = useRef(false);
    const reducedMotion = useReducedMotion();
    const titleId = useId();
    const descriptionId = useId();

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            if (!locked) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, locked, onClose]);

    useEffect(() => {
        if (!isOpen) return;
        const original = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = original;
        };
    }, [isOpen]);

    // Focus: sull'elemento non distruttivo all'apertura, indietro alla chiusura.
    useEffect(() => {
        if (!isOpen) {
            previouslyFocused.current?.focus();
            previouslyFocused.current = null;
            return;
        }
        previouslyFocused.current = document.activeElement as HTMLElement | null;
        const frame = requestAnimationFrame(() => {
            const target =
                panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panelRef.current;
            target?.focus();
        });
        return () => cancelAnimationFrame(frame);
    }, [isOpen]);

    if (typeof document === "undefined") return null;

    const transition = reducedMotion
        ? { duration: 0 }
        : { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const };

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={styles.overlay}
                    onMouseDown={e => {
                        mouseDownOnOverlay.current = e.target === e.currentTarget;
                    }}
                    onMouseUp={e => {
                        if (mouseDownOnOverlay.current && e.target === e.currentTarget && !locked) {
                            onClose();
                        }
                        mouseDownOnOverlay.current = false;
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={transition}
                >
                    <FocusLock autoFocus={false} returnFocus={false}>
                        <motion.div
                            ref={panelRef}
                            className={styles.panel}
                            role="alertdialog"
                            aria-modal="true"
                            aria-labelledby={titleId}
                            aria-describedby={message ? descriptionId : undefined}
                            tabIndex={-1}
                            initial={reducedMotion ? false : { opacity: 0, scale: 0.98, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={reducedMotion ? undefined : { opacity: 0, scale: 0.98, y: 8 }}
                            transition={transition}
                        >
                            <Text as="h2" id={titleId} variant="title-sm" weight={600} className={styles.title}>
                                {title}
                            </Text>
                            {message && (
                                <Text id={descriptionId} variant="body-sm" colorVariant="muted">
                                    {message}
                                </Text>
                            )}
                            {children && <div className={styles.content}>{children}</div>}
                            {error && <InlineBanner variant="error">{error}</InlineBanner>}
                            <div className={styles.footer}>{footer}</div>
                        </motion.div>
                    </FocusLock>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
