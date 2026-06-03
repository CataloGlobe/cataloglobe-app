import React from "react";
import type { Toast } from "@/types/toast";
import styles from "./Toast.module.scss";

interface ToastItemProps {
    toast: Toast;
    onRemove: () => void;
}

const EXIT_ANIMATION_MS = 250; // deve combaciare con la durata in SCSS

export const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
    const [isLeaving, setIsLeaving] = React.useState(false);
    const [isPaused, setIsPaused] = React.useState(false);

    // Toast con azione (Annulla/Ripristina): mostra barra countdown e
    // sospende il timer su hover. I toast informativi senza azione restano
    // invariati (no barra, timer plain).
    const hasAction = !!(toast.actionLabel && toast.onAction);

    // Tracking del timer di auto-dismiss con pausa: salviamo l'inizio
    // assoluto della finestra corrente e quanto tempo e' gia' passato
    // PRIMA di entrare in pausa. Al resume ripartiamo per il tempo
    // rimanente. Il timeout puo' essere null se gia' in pausa o se in fase
    // di leaving.
    const startedAtRef = React.useRef<number>(Date.now());
    const elapsedBeforePauseRef = React.useRef<number>(0);
    const timeoutRef = React.useRef<number | null>(null);

    const armDismiss = React.useCallback(
        (remainingMs: number) => {
            if (timeoutRef.current !== null) {
                window.clearTimeout(timeoutRef.current);
            }
            const safe = Math.max(0, remainingMs);
            timeoutRef.current = window.setTimeout(() => {
                timeoutRef.current = null;
                setIsLeaving(true);
            }, safe);
            startedAtRef.current = Date.now();
        },
        []
    );

    React.useEffect(() => {
        if (isLeaving) return;
        if (isPaused) {
            // Su pausa, freeza il tempo trascorso e cancella il timeout.
            if (timeoutRef.current !== null) {
                window.clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            elapsedBeforePauseRef.current += Date.now() - startedAtRef.current;
            return;
        }
        // Resume (o primo arm): tempo residuo = duration - elapsed totale.
        const remaining = toast.duration - elapsedBeforePauseRef.current;
        armDismiss(remaining);
        return () => {
            if (timeoutRef.current !== null) {
                window.clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [isPaused, isLeaving, toast.duration, armDismiss]);

    React.useEffect(() => {
        if (!isLeaving) return;

        const removeTimer = window.setTimeout(() => {
            onRemove();
        }, EXIT_ANIMATION_MS);

        return () => {
            window.clearTimeout(removeTimer);
        };
    }, [isLeaving, onRemove]);

    const typeClass =
        toast.type === "success"
            ? styles.toastSuccess
            : toast.type === "error"
              ? styles.toastError
              : toast.type === "warning"
                ? styles.toastWarning
                : styles.toastInfo;

    const stateClass = isLeaving ? styles.toastLeaving : styles.toastEntering;

    // CSS custom property: la barra usa la duration del singolo toast.
    // Tipato come React.CSSProperties via cast: --toast-progress-duration
    // non e' nei tipi standard di React.
    const progressStyle = {
        ["--toast-progress-duration"]: `${toast.duration}ms`
    } as React.CSSProperties;

    return (
        <div
            className={`${styles.toast} ${typeClass} ${stateClass}`}
            onMouseEnter={hasAction ? () => setIsPaused(true) : undefined}
            onMouseLeave={hasAction ? () => setIsPaused(false) : undefined}
        >
            <div className={styles.toastContent}>
                <span className={styles.toastMessage}>{toast.message}</span>

                {toast.actionLabel && toast.onAction && (
                    <button
                        type="button"
                        className={styles.toastAction}
                        onClick={() => {
                            toast.onAction?.();
                            setIsLeaving(true);
                        }}
                    >
                        {toast.actionLabel}
                    </button>
                )}
            </div>

            <button
                type="button"
                className={styles.toastClose}
                onClick={() => setIsLeaving(true)}
                aria-label="Chiudi notifica"
            >
                ×
            </button>

            {hasAction && (
                <div
                    className={`${styles.toastProgress} ${isPaused ? styles.toastProgressPaused : ""}`}
                    style={progressStyle}
                    aria-hidden
                />
            )}
        </div>
    );
};
