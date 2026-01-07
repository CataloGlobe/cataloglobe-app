import { ReactElement, useEffect } from "react";
import Text from "@components/ui/Text/Text";
import styles from "./ConfirmModal.module.scss";

type ConfirmModalProps = {
    isOpen: boolean;
    title: string;
    description: string;
    children?: ReactElement;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
};

export default function ConfirmModal({
    isOpen,
    title,
    description,
    children,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel
}: ConfirmModalProps) {
    // Questa modale è chiudibile?
    const isClosable =
        typeof onCancel === "function" || (typeof onConfirm === "function" && confirmLabel);

    // Chiudi con ESC solo se è chiudibile
    useEffect(() => {
        if (!isOpen || !isClosable) return;

        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") {
                if (onCancel) onCancel();
                else if (onConfirm) onConfirm();
            }
        }

        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [isOpen, isClosable, onCancel, onConfirm]);

    if (!isOpen) return null;

    return (
        <div
            className={styles.overlay}
            onClick={
                isClosable
                    ? () => {
                          if (onCancel) onCancel();
                          else if (onConfirm) onConfirm();
                      }
                    : undefined
            }
        >
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <Text as="h2" variant="title-sm" weight={600} className={styles.title}>
                    {title}
                </Text>

                <Text variant="body" className={styles.description}>
                    {description}
                </Text>

                {children}

                <div className={styles.actions}>
                    {cancelLabel && onCancel && (
                        <button className={styles.cancel} onClick={onCancel} type="button">
                            <Text variant="body">{cancelLabel}</Text>
                        </button>
                    )}

                    {confirmLabel && onConfirm && (
                        <button className={styles.confirm} onClick={onConfirm} type="button">
                            <Text variant="body" colorVariant="white">
                                {confirmLabel}
                            </Text>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
