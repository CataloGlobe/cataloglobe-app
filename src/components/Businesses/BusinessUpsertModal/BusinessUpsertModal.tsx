import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Text from "@components/ui/Text/Text";
import type { BusinessFormValues } from "@/types/Businesses";
import { BusinessCreateCard } from "../BusinessCreateCard/BusinessCreateCard";
import styles from "./BusinessUpsertModal.module.scss";

type Mode = "create" | "edit";

type Props = {
    open: boolean;
    mode: Mode;

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
};

function getFocusable(container: HTMLElement) {
    const selectors =
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll<HTMLElement>(selectors)).filter(el => {
        const style = window.getComputedStyle(el);
        const hidden = style.display === "none" || style.visibility === "hidden";
        return !hidden && !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true";
    });
}

export const BusinessUpsertModal: React.FC<Props> = React.memo(
    ({
        open,
        mode,
        values,
        errors,
        loading,
        previewBaseUrl,
        onFieldChange,
        onCoverChange,
        onSubmit,
        onClose
    }) => {
        const titleId = useId();
        const descId = useId();

        const dialogRef = useRef<HTMLDivElement | null>(null);
        const didSetInitialFocusRef = useRef(false);

        const [closing, setClosing] = useState(false);

        const modalTitle = useMemo(
            () => (mode === "create" ? "Aggiungi attività" : "Modifica attività"),
            [mode]
        );

        const modalDescription = useMemo(
            () =>
                mode === "create"
                    ? "Compila i campi per creare una nuova attività."
                    : "Aggiorna i dati di questa attività.",
            [mode]
        );

        const primaryLabel = useMemo(
            () => (mode === "create" ? "Crea attività" : "Salva modifiche"),
            [mode]
        );

        const formId = useMemo(
            () => (mode === "create" ? "create-business-form" : "edit-business-form"),
            [mode]
        );

        const safeClose = useCallback(() => {
            setClosing(true);
            window.setTimeout(() => {
                setClosing(false);
                onClose();
            }, 200);
        }, [onClose]);

        useEffect(() => {
            if (!open) return;

            const dialogEl = dialogRef.current;
            if (!dialogEl) return;

            if (!didSetInitialFocusRef.current) {
                didSetInitialFocusRef.current = true;

                const raf = requestAnimationFrame(() => {
                    const list = getFocusable(dialogEl);
                    (list[0] ?? dialogEl).focus();
                });

                return () => cancelAnimationFrame(raf);
            }

            const onKeyDown = (e: KeyboardEvent) => {
                if (e.key === "Escape") {
                    e.preventDefault();
                    safeClose();
                    return;
                }

                if (e.key !== "Tab") return;

                const focusables = getFocusable(dialogEl);
                if (focusables.length === 0) {
                    e.preventDefault();
                    dialogEl.focus();
                    return;
                }

                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                const active = document.activeElement as HTMLElement | null;

                if (!e.shiftKey && active === last) {
                    e.preventDefault();
                    first.focus();
                } else if (e.shiftKey && active === first) {
                    e.preventDefault();
                    last.focus();
                }
            };

            window.addEventListener("keydown", onKeyDown);

            return () => {
                window.removeEventListener("keydown", onKeyDown);
            };
        }, [open, safeClose]);

        useEffect(() => {
            if (!open) {
                didSetInitialFocusRef.current = false;
            }
        }, [open]);

        // Render guard DOPO gli hook (qui non rompe le rules of hooks)
        if (!open || !values) return null;

        return createPortal(
            <div
                className={`${styles.overlay} ${closing ? styles.fadeOut : ""}`}
                role="presentation"
                onMouseDown={e => {
                    if (e.target === e.currentTarget) safeClose();
                }}
            >
                <div
                    ref={dialogRef}
                    className={`${styles.dialog} ${closing ? styles.slideOut : ""}`}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    aria-describedby={descId}
                    tabIndex={-1}
                    onMouseDown={e => e.stopPropagation()}
                >
                    <div className={styles.modalHeader}>
                        <Text as="h2" variant="title-sm" weight={600} id={titleId}>
                            {modalTitle}
                        </Text>
                        <Text variant="body" colorVariant="muted" id={descId}>
                            {modalDescription}
                        </Text>
                    </div>

                    <BusinessCreateCard
                        formId={formId}
                        values={values}
                        errors={errors}
                        onFieldChange={onFieldChange}
                        onCoverChange={onCoverChange}
                        onSubmit={onSubmit}
                        onCancel={safeClose}
                        loading={loading}
                        previewBaseUrl={previewBaseUrl}
                        title="" // header gestito dalla modale
                        description=""
                        primaryLabel={primaryLabel}
                    />
                </div>
            </div>,
            document.body
        );
    }
);

BusinessUpsertModal.displayName = "BusinessUpsertModal";
