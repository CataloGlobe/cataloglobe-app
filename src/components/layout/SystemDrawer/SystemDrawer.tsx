import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./SystemDrawer.module.scss";

export interface SystemDrawerProps {
    open: boolean;
    onClose: () => void;
    width?: number;
    children: ReactNode;
    "aria-labelledby"?: string;
    "aria-describedby"?: string;
}

const FIRST_INPUT_SELECTOR =
    'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])';

export const SystemDrawer = ({
    open,
    onClose,
    width = 520,
    children,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy
}: SystemDrawerProps) => {
    const previousActiveElement = useRef<HTMLElement | null>(null);
    const drawerRef = useRef<HTMLDivElement>(null);
    const openRef = useRef(open);
    useEffect(() => { openRef.current = open; }, [open]);

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

        const focusableElements = drawerEl.querySelectorAll<HTMLElement>(focusableSelectors);
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

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

    // Handle ESC key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (open) {
            window.addEventListener("keydown", handleEsc);
            return () => window.removeEventListener("keydown", handleEsc);
        }
    }, [open, onClose]);

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
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        onClick={onClose}
                        role="presentation"
                    />
                    <motion.div
                        key="drawer"
                        className={styles.drawer}
                        ref={drawerRef}
                        style={{ width }}
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ duration: 0.25, type: "tween", ease: "easeOut" }}
                        onAnimationComplete={() => {
                            if (!openRef.current) return;
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
