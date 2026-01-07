import React, { useEffect, useRef, useState } from "react";
import { BusinessFormValues } from "@/types/Businesses";
import { BusinessCreateCard } from "../BusinessCreateCard/BusinessCreateCard";
import styles from "./BusinessEditModal.module.scss";

interface Props {
    open: boolean;
    values: BusinessFormValues | null;
    errors?: Partial<Record<keyof BusinessFormValues, string>>;
    loading: boolean;
    previewBaseUrl: string;
    onFieldChange: <K extends keyof BusinessFormValues>(
        field: K,
        value: BusinessFormValues[K]
    ) => void;
    onCoverChange: (file: File | null) => void;
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    onClose: () => void;
}

export const BusinessEditModal: React.FC<Props> = ({
    open,
    values,
    errors,
    loading,
    previewBaseUrl,
    onFieldChange,
    onCoverChange,
    onSubmit,
    onClose
}) => {
    const [isOverflowing, setIsOverflowing] = useState(false);
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        if (open) {
            // Blocca lo scroll
            document.body.style.overflow = "hidden";
        } else {
            // Ripristina lo scroll
            document.body.style.overflow = "auto";
        }

        return () => {
            // Pulizia nel caso la modale venga smontata
            document.body.style.overflow = "auto";
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;

        function handleEscape(e: KeyboardEvent) {
            if (e.key === "Escape") {
                onClose();
            }
        }

        window.addEventListener("keydown", handleEscape);

        return () => {
            window.removeEventListener("keydown", handleEscape);
        };
    }, [open, onClose]);

    useEffect(() => {
        if (!open || !dialogRef.current) return;

        const el = dialogRef.current;
        const overflowing = el.scrollHeight > el.clientHeight;

        setIsOverflowing(overflowing);
    }, [open, values]);

    function handleSafeClose() {
        setClosing(true);

        setTimeout(() => {
            setClosing(false);
            onClose();
        }, 200); // stesso timing dell'animazione
    }

    if (!open || !values) return null;

    return (
        <div
            className={`${styles.overlay} ${closing ? styles.fadeOut : ""}`}
            onMouseDown={e => {
                if (e.target === e.currentTarget) handleSafeClose();
            }}
            role="dialog"
            aria-modal="true"
        >
            <div
                className={`${styles.dialog} 
                ${isOverflowing ? styles.noRadiusRight : ""} 
                ${closing ? styles.slideOut : ""}`}
                onClick={e => e.stopPropagation()}
                ref={dialogRef}
            >
                <BusinessCreateCard
                    values={values}
                    errors={errors}
                    onFieldChange={onFieldChange}
                    onCoverChange={onCoverChange}
                    onSubmit={onSubmit}
                    onCancel={handleSafeClose}
                    loading={loading}
                    previewBaseUrl={previewBaseUrl}
                    title="Modifica attività"
                    description="Aggiorna i dati di questa attività."
                    primaryLabel="Salva modifiche"
                />
            </div>
        </div>
    );
};
