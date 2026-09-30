import { useEffect, useRef, Children, isValidElement } from "react";
import { createPortal } from "react-dom";
import FocusLock from "react-focus-lock";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import styles from "./ModalLayout.module.scss";

import { ReactNode } from "react";

/**
 * ModalLayout — la modale centrata per guide e anteprime (regola 1): il
 * CRUD è un SystemDrawer, la conferma è un ConfirmDialog. Gli slot
 * Sidebar/Drawer (0 usi) sono stati rimossi nel lotto 3.
 */
export type ModalWidth = "xs" | "sm" | "md" | "lg" | "xl";

export type ModalHeight = "sm" | "md" | "lg" | "fit";

/* ------------------------------------------------------------------
 * SLOT COMPONENTS (MARKERS)
 * ------------------------------------------------------------------ */

type SlotProps = {
    children: ReactNode;
};

export function ModalLayoutHeader({ children }: SlotProps) {
    return <>{children}</>;
}

export function ModalLayoutContent({ children }: SlotProps) {
    return <>{children}</>;
}

export function ModalLayoutFooter({ children }: SlotProps) {
    return <>{children}</>;
}

/* ------------------------------------------------------------------
 * SLOT EXTRACTION
 * ------------------------------------------------------------------ */

function getSlot(children: ReactNode, slot: React.ElementType): ReactNode | null {
    return (
        Children.toArray(children).find(child => isValidElement(child) && child.type === slot) ??
        null
    );
}

/* ------------------------------------------------------------------
 * MODAL LAYOUT
 * ------------------------------------------------------------------ */

type Props = {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    /** @deprecated Lo slot Drawer non esiste più: ignorata. Si rimuove nel lotto 6. */
    isDrawerOpen?: boolean;
    /** @deprecated Lo slot Drawer non esiste più: ignorata. Si rimuove nel lotto 6. */
    onCloseDrawer?: () => void;
    width?: ModalWidth;
    height?: ModalHeight;
};

export default function ModalLayout({
    isOpen,
    onClose,
    children,
    width = "xl",
    height = "lg"
}: Props) {
    const modalRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);
    const mouseDownOnOverlay = useRef(false);
    const reducedMotion = useReducedMotion();

    const header = getSlot(children, ModalLayoutHeader);
    const content = getSlot(children, ModalLayoutContent);
    const footer = getSlot(children, ModalLayoutFooter);

    /* --------------------------------------------------
     * ACCESSIBILITY / FOCUS / ESC
     * -------------------------------------------------- */
    useEffect(() => {
        if (!isOpen) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            onClose();
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!isOpen) {
            previouslyFocusedRef.current?.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const original = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = original;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        previouslyFocusedRef.current = document.activeElement as HTMLElement;

        // focus "neutro"
        modalRef.current?.focus();
    }, [isOpen]);

    // SSR guard: createPortal requires document. Skip render in non-DOM
    // environments (build/test). In this Vite client-only app it never
    // triggers in practice, but the guard prevents future regressions.
    if (typeof document === "undefined") return null;

    const transition = reducedMotion
        ? { duration: 0 }
        : { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const };

    const overlayTree = (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={styles.overlay}
                    role="dialog"
                    aria-modal="true"
                    onMouseDown={e => {
                        mouseDownOnOverlay.current = e.target === e.currentTarget;
                    }}
                    onMouseUp={e => {
                        if (mouseDownOnOverlay.current && e.target === e.currentTarget) {
                            onClose();
                        }
                        mouseDownOnOverlay.current = false;
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={transition}
                >
                    <FocusLock autoFocus={false} returnFocus>
                        <motion.div
                            className={styles.modal}
                            data-width={width}
                            data-height={height}
                            ref={modalRef}
                            tabIndex={-1}
                            onClick={e => e.stopPropagation()}
                            initial={reducedMotion ? false : { opacity: 0, scale: 0.98, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={reducedMotion ? undefined : { opacity: 0, scale: 0.98, y: 8 }}
                            transition={transition}
                        >
                            {/* HEADER */}
                            <header className={styles.header}>{header}</header>

                            {/* BODY */}
                            <div className={styles.body}>
                                <div className={styles.contentWrapper}>{content}</div>
                            </div>

                            {/* FOOTER */}
                            {footer && <footer className={styles.footer}>{footer}</footer>}
                        </motion.div>
                    </FocusLock>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return createPortal(overlayTree, document.body);
}
