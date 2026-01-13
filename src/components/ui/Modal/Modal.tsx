import { useEffect, useRef } from "react";
import styles from "./Modal.module.scss";

type ModalSize = "sm" | "md" | "lg";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;

    size?: ModalSize;
    closeOnOverlayClick?: boolean;

    ariaLabelledBy?: string;
    ariaDescribedBy?: string;
};

export default function Modal({
    isOpen,
    onClose,
    children,
    size = "lg",
    closeOnOverlayClick = true,
    ariaLabelledBy,
    ariaDescribedBy
}: Props) {
    const modalRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);

    /* ------------------------------------------------
     * EFFECTS
     * ---------------------------------------------- */
    useEffect(() => {
        if (!isOpen) return;

        previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }

            if (e.key === "Tab" && modalRef.current) {
                trapFocus(e, modalRef.current);
            }
        };

        window.addEventListener("keydown", onKeyDown);

        // focus iniziale
        setTimeout(() => modalRef.current?.focus(), 0);

        return () => {
            window.removeEventListener("keydown", onKeyDown);
            previouslyFocusedRef.current?.focus();
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className={styles.overlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            onClick={closeOnOverlayClick ? onClose : undefined}
        >
            <div
                ref={modalRef}
                tabIndex={-1}
                className={`${styles.modal} ${styles[size]}`}
                onClick={e => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}

/* ------------------------------------------------
 * UTILS
 * ---------------------------------------------- */
function trapFocus(e: KeyboardEvent, container: HTMLElement) {
    const focusable = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}
