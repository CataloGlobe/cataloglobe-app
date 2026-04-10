import { useEffect, useState } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import styles from "./PublicSheet.module.scss";

function useIsMobile(breakpoint = 640) {
    const [isMobile, setIsMobile] = useState(
        () => typeof window !== "undefined" && window.innerWidth < breakpoint
    );
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        setIsMobile(mq.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, [breakpoint]);
    return isMobile;
}

type Props = {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    ariaLabel?: string;
};

export default function PublicSheet({ isOpen, onClose, children, ariaLabel }: Props) {
    const isMobile = useIsMobile();
    const dragControls = useDragControls();

    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [isOpen]);

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

    const panelVariants = isMobile
        ? { hidden: { y: "100%" }, visible: { y: 0 }, exit: { y: "100%" } }
        : {
              hidden: { opacity: 0, y: 28, scale: 0.98 },
              visible: { opacity: 1, y: 0, scale: 1 },
              exit: { opacity: 0, y: 20, scale: 0.98 },
          };

    const panelTransition = isMobile
        ? ({ type: "spring", damping: 32, stiffness: 320 } as const)
        : ({ type: "spring", duration: 0.32, bounce: 0.15 } as const);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={styles.overlay}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    onClick={onClose}
                    role="presentation"
                >
                    <motion.div
                        className={styles.panel}
                        role="dialog"
                        aria-modal="true"
                        aria-label={ariaLabel}
                        variants={panelVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        transition={panelTransition}
                        drag={isMobile ? "y" : false}
                        dragControls={dragControls}
                        dragListener={false}
                        dragConstraints={{ top: 0 }}
                        dragElastic={{ top: 0, bottom: 0.35 }}
                        onDragEnd={(_, info) => {
                            if (info.offset.y > 100 || info.velocity.y > 400) onClose();
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {isMobile && (
                            <div
                                className={styles.handle}
                                onPointerDown={e => dragControls.start(e)}
                            >
                                <span className={styles.handleBar} />
                            </div>
                        )}
                        {children}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
