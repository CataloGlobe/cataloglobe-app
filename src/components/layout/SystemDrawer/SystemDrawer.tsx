import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { resolveDrawerSize, SYSTEM_DRAWER_MOTION_MS, type SystemDrawerSize } from "./drawerSize";
import styles from "./SystemDrawer.module.scss";

export type { SystemDrawerSize } from "./drawerSize";

/**
 * SystemDrawer — il CRUD: creare o modificare una cosa senza lasciare la
 * lista (design system §5). Tre taglie dai token `--drawer-*`: `sm` 420
 * (una scelta, un filtro, una conferma con campo) · `md` 520 (il CRUD
 * normale, default) · `lg` 720 (form a due colonne, picker con anteprima).
 * Sopra `lg` non esiste: è una route (regola 2).
 */
export interface SystemDrawerProps {
    open: boolean;
    onClose: () => void;
    /** Taglia del pannello. Default `md`. */
    size?: SystemDrawerSize;
    /**
     * @deprecated Usa `size`. Una larghezza numerica viene mappata alla taglia
     * più vicina (≤ 460 → sm, ≤ 620 → md, ≤ 800 → lg) con un avviso in dev;
     * oltre 800 resta com'è: quel drawer diventa una route nel lotto 5.
     */
    width?: number;
    children: ReactNode;
    "aria-labelledby"?: string;
    "aria-describedby"?: string;
    /**
     * All'apertura porta il focus sul primo campo del drawer. Default `true`:
     * è il comportamento giusto per i drawer di CRUD, che esistono per essere
     * compilati.
     *
     * Passare `false` sui drawer di CONSULTAZIONE che contengono comunque un
     * campo editabile (es. la scheda cliente, dove le note sono un di più):
     * lì il focus automatico mette il cursore in un campo che l'utente non ha
     * chiesto di compilare, e il focus ring fa sembrare la scrittura l'azione
     * principale. Con `false` il focus resta sul contenitore del dialog, che
     * ha `tabIndex={-1}`: screen reader e trappola del focus continuano a
     * funzionare identici.
     */
    autoFocusFirstInput?: boolean;
}

const FIRST_INPUT_SELECTOR =
    'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])';

export const SystemDrawer = ({
    open,
    onClose,
    size: sizeProp,
    width: widthProp,
    children,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    autoFocusFirstInput = true
}: SystemDrawerProps) => {
    const previousActiveElement = useRef<HTMLElement | null>(null);
    const drawerRef = useRef<HTMLDivElement>(null);
    const openRef = useRef(open);
    useEffect(() => { openRef.current = open; }, [open]);
    const reducedMotion = useReducedMotion();

    const { size, explicitWidth } = resolveDrawerSize(sizeProp, widthProp);

    // Focus management
    useEffect(() => {
        if (open) {
            previousActiveElement.current = document.activeElement as HTMLElement;
            // Small timeout ensures the element is mounted and ready to receive focus
            requestAnimationFrame(() => {
                drawerRef.current?.focus();
            });
        } else {
            if (previousActiveElement.current && document.contains(previousActiveElement.current)) {
                previousActiveElement.current.focus();
            }
            previousActiveElement.current = null;
        }
    }, [open]);

    // Scroll locking
    useEffect(() => {
        if (!open) return;

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [open]);

    // Focus Trap
    useEffect(() => {
        if (!open) return;

        const drawerEl = drawerRef.current;
        if (!drawerEl) return;

        const focusableSelectors =
            'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';

        const handleTab = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;

            const focusableElements = drawerEl.querySelectorAll<HTMLElement>(focusableSelectors);

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (focusableElements.length === 0) {
                e.preventDefault();
                return;
            }

            if (e.shiftKey) {
                if (document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement?.focus();
                }
            } else {
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement?.focus();
                }
            }
        };

        drawerEl.addEventListener("keydown", handleTab);

        return () => {
            drawerEl.removeEventListener("keydown", handleTab);
        };
    }, [open]);

    // Esc chiude solo il livello più in alto. Menu, select e dialog Radix
    // aperti sopra il drawer ascoltano Esc sul document in cattura e, quando
    // si chiudono, fanno `preventDefault`: qui l'evento arriva dopo, già
    // consumato, e il drawer resta aperto.
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !e.defaultPrevented) onClose();
        };
        if (open) {
            window.addEventListener("keydown", handleEsc);
            return () => window.removeEventListener("keydown", handleEsc);
        }
    }, [open, onClose]);

    // motion-base (200 ms, easing-surface) su transform e opacity; con
    // prefers-reduced-motion nessuna animazione.
    const transition = reducedMotion
        ? { duration: 0 }
        : { duration: SYSTEM_DRAWER_MOTION_MS / 1000, ease: [0.4, 0, 0.2, 1] as const };

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div className={styles.root}>
                    <motion.div
                        key="backdrop"
                        className={styles.backdrop}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={transition}
                        onClick={onClose}
                        role="presentation"
                    />
                    <motion.div
                        key="drawer"
                        className={`${styles.drawer} ${styles[`size_${size}`]}`}
                        ref={drawerRef}
                        style={explicitWidth !== undefined ? { width: explicitWidth } : undefined}
                        initial={{ x: "100%", opacity: reducedMotion ? 1 : 0.6 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: "100%", opacity: reducedMotion ? 1 : 0.6 }}
                        transition={transition}
                        onAnimationComplete={() => {
                            if (!openRef.current || !autoFocusFirstInput) return;
                            const firstInput = drawerRef.current?.querySelector<HTMLElement>(FIRST_INPUT_SELECTOR);
                            firstInput?.focus();
                        }}
                        role="dialog"
                        aria-modal={open ? "true" : undefined}
                        aria-labelledby={ariaLabelledBy}
                        aria-describedby={ariaDescribedBy}
                        tabIndex={-1}
                        onClick={e => e.stopPropagation()}
                    >
                        {children}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};
