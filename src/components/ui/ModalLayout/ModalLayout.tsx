import { useEffect, useRef, useState, Children, isValidElement } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./ModalLayout.module.scss";

import { ChevronLeft } from "lucide-react";

import { ReactNode } from "react";

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
};

export default function ModalLayout({
    isOpen,
    onClose,
    children,
    isDrawerOpen,
    onCloseDrawer
}: Props) {
    const modalRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);

    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const header = getSlot(children, ModalLayoutHeader);
    const sidebar = getSlot(children, ModalLayoutSidebar);
    const content = getSlot(children, ModalLayoutContent);
    const drawer = getSlot(children, ModalLayoutDrawer);

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

    const sidebarWidth = 360;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={styles.overlay}
                    role="dialog"
                    aria-modal="true"
                    onClick={() => {
                        if (hasDrawer && isDrawerOpen && onCloseDrawer) {
                            onCloseDrawer();
                            return;
                        }
                        onClose();
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <motion.div
                        className={styles.modal}
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
                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    >
                                        {/* Wrapper extra per bloccare la larghezza del contenuto */}
                                        <div style={{ width: sidebarWidth - 40 }}>{sidebar}</div>
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
                                            borderBottomRightRadius: isSidebarOpen ? "50%" : "0%",
                                            rotate: isSidebarOpen ? 0 : 180,
                                            x: isSidebarOpen ? 0 : 0
                                        }}
                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
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
                                                stiffness: 420,
                                                damping: 36
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
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
