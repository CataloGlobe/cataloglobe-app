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
    /**
     * Opzionale: contenuto header della sheet (titolo + pulsante chiudi).
     * Se fornito, viene renderizzato in una zona draggabile sopra i children,
     * espandendo l'area di drag oltre la sola handle bar (solo su mobile).
     */
    headerContent?: React.ReactNode;
};

export default function PublicSheet({ isOpen, onClose, children, ariaLabel, headerContent }: Props) {
    const isMobile = useIsMobile();
    const dragControls = useDragControls();

    useEffect(() => {
        if (!isOpen) return;
        // Su iOS Safari, overflow:hidden sul body non ferma il momentum scroll.
        // La tecnica position:fixed congela la pagina alla posizione corrente
        // e ripristina esattamente lo scroll quando il sheet si chiude.
        const scrollY = window.scrollY;
        const prevOverflow = document.body.style.overflow;
        const prevPosition = document.body.style.position;
        const prevTop = document.body.style.top;
        const prevWidth = document.body.style.width;

        document.body.style.overflow = "hidden";
        document.body.style.position = "fixed";
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = "100%";

        return () => {
            document.body.style.overflow = prevOverflow;
            document.body.style.position = prevPosition;
            document.body.style.top = prevTop;
            document.body.style.width = prevWidth;
            window.scrollTo(0, scrollY);
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
                        // override di framer-motion che altrimenti imposta touch-action:none
                        // sul panel intero, impedendo lo scroll del body
                        style={isMobile ? { touchAction: "pan-y" } : undefined}
                    >
                        {isMobile && (
                            <div
                                className={styles.handle}
                                onPointerDown={e => dragControls.start(e)}
                            >
                                <span className={styles.handleBar} />
                            </div>
                        )}
                        {headerContent && (
                            <div
                                className={styles.dragZone}
                                onPointerDown={isMobile ? e => {
                                    // Non avviare drag se il tap è su un button
                                    if ((e.target as HTMLElement).closest("button")) return;
                                    dragControls.start(e);
                                } : undefined}
                            >
                                {headerContent}
                            </div>
                        )}
                        {children}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
