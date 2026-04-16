import { useEffect, useRef, useState, Children, isValidElement } from "react";
import FocusLock from "react-focus-lock";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./ModalLayout.module.scss";

import { ChevronLeft } from "lucide-react";

import { ReactNode } from "react";

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

export function ModalLayoutSidebar({ children }: SlotProps) {
    return <>{children}</>;
}

export function ModalLayoutContent({ children }: SlotProps) {
    return <>{children}</>;
}

export function ModalLayoutDrawer({ children }: SlotProps) {
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
    isDrawerOpen?: boolean;
    onCloseDrawer?: () => void;
    width?: ModalWidth;
    height?: ModalHeight;
};

export default function ModalLayout({
    isOpen,
    onClose,
    children,
    isDrawerOpen,
    onCloseDrawer,
    width = "xl",
    height = "lg"
}: Props) {
    const modalRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);
    const mouseDownOnOverlay = useRef(false);

    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const header = getSlot(children, ModalLayoutHeader);
    const sidebar = getSlot(children, ModalLayoutSidebar);
    const content = getSlot(children, ModalLayoutContent);
    const drawer = getSlot(children, ModalLayoutDrawer);
    const footer = getSlot(children, ModalLayoutFooter);

    const hasDrawer = Boolean(drawer);

    /* --------------------------------------------------
     * ACCESSIBILITY / FOCUS / ESC
     * -------------------------------------------------- */
    useEffect(() => {
        if (!isOpen) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;

            e.preventDefault();

            if (hasDrawer && isDrawerOpen && onCloseDrawer) {
                onCloseDrawer();
                return;
            }

            onClose();
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, isDrawerOpen, onCloseDrawer, onClose, hasDrawer]);

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

    const sidebarWidth = 360;

    return (
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
                            if (hasDrawer && isDrawerOpen && onCloseDrawer) {
                                onCloseDrawer();
                            } else {
                                onClose();
                            }
                        }
                        mouseDownOnOverlay.current = false;
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <FocusLock autoFocus={false} returnFocus>
                        <motion.div
                            className={styles.modal}
                            data-width={width}
                            data-height={height}
                            ref={modalRef}
                            tabIndex={-1}
                            onClick={e => e.stopPropagation()}
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: "spring", duration: 0.4, bounce: 0.3 }}
                        >
                            {/* HEADER */}
                            <header className={styles.header}>{header}</header>

                            {/* BODY */}
                            <motion.div
                                className={styles.body}
                                initial={false}
                                animate={{
                                    gridTemplateColumns: sidebar
                                        ? isSidebarOpen
                                            ? `${sidebarWidth}px 1fr`
                                            : `0px 1fr`
                                        : `1fr`
                                }}
                                transition={{
                                    type: "spring",
                                    stiffness: 300,
                                    damping: 30,
                                    restDelta: 0.5
                                }}
                            >
                                {sidebar && (
                                    <>
                                        <motion.aside
                                            className={styles.left}
                                            initial={false}
                                            animate={{
                                                x: isSidebarOpen ? 0 : -sidebarWidth,
                                                opacity: isSidebarOpen ? 1 : 0
                                            }}
                                            transition={{
                                                type: "spring",
                                                stiffness: 300,
                                                damping: 30
                                            }}
                                        >
                                            {/* Wrapper extra per bloccare la larghezza del contenuto */}
                                            <div style={{ width: sidebarWidth - 40 }}>
                                                {sidebar}
                                            </div>
                                        </motion.aside>

                                        <motion.button
                                            className={styles.collapseToggle}
                                            onClick={() => setIsSidebarOpen(v => !v)}
                                            initial={false}
                                            animate={{
                                                left: isSidebarOpen ? 360 - 16 : 0,
                                                borderTopLeftRadius: "50%",
                                                borderBottomLeftRadius: "50%",
                                                borderTopRightRadius: isSidebarOpen ? "50%" : "0%",
                                                borderBottomRightRadius: isSidebarOpen
                                                    ? "50%"
                                                    : "0%",
                                                rotate: isSidebarOpen ? 0 : 180,
                                                x: isSidebarOpen ? 0 : 0
                                            }}
                                            transition={{
                                                type: "spring",
                                                stiffness: 300,
                                                damping: 30
                                            }}
                                        >
                                            <ChevronLeft />
                                        </motion.button>
                                    </>
                                )}

                                <section className={styles.right}>
                                    <div
                                        className={styles.contentWrapper}
                                        aria-hidden={hasDrawer && isDrawerOpen}
                                    >
                                        {content}
                                    </div>

                                    <AnimatePresence>
                                        {hasDrawer && isDrawerOpen && (
                                            <motion.div
                                                className={styles.drawerSlot}
                                                initial={{ x: 24, opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                exit={{ x: 24, opacity: 0 }}
                                                transition={{
                                                    type: "spring",
                                                    stiffness: 300,
                                                    damping: 30
                                                }}
                                            >
                                                {drawer}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </section>

                                <AnimatePresence>
                                    {hasDrawer && isDrawerOpen && (
                                        <motion.div
                                            className={styles.contentScrim}
                                            onClick={() => onCloseDrawer?.()}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.18 }}
                                        />
                                    )}
                                </AnimatePresence>
                            </motion.div>

                            {/* FOOTER */}
                            {footer && <footer className={styles.footer}>{footer}</footer>}
                        </motion.div>
                    </FocusLock>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
