import { useState } from "react";
import type { ReactNode } from "react";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader,
} from "@/components/ui/ModalLayout/ModalLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    /** Deve restituire true in caso di successo, false in caso di errore. */
    onConfirm: () => Promise<boolean>;
    title: string;
    message?: string;
    confirmLabel?: string;
    confirmVariant?: "danger" | "primary";
    children?: ReactNode;
};

export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = "Conferma",
    confirmVariant = "danger",
    children,
}: Props) {
    const [loading, setLoading] = useState(false);

    const handleConfirm = async () => {
        setLoading(true);
        const ok = await onConfirm();
        setLoading(false);
        if (ok) onClose();
    };

    return (
        <ModalLayout isOpen={isOpen} onClose={onClose} width="sm" height="fit">
            <ModalLayoutHeader>
                <Text variant="title-sm" weight={600}>
                    {title}
                </Text>
            </ModalLayoutHeader>
            <ModalLayoutContent>
                {message && (
                    <Text variant="body-sm" colorVariant="muted">
                        {message}
                    </Text>
                )}
                {children}
            </ModalLayoutContent>
            <ModalLayoutFooter>
                <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
                    Annulla
                </Button>
                <Button variant={confirmVariant} size="sm" onClick={handleConfirm} loading={loading}>
                    {confirmLabel}
                </Button>
            </ModalLayoutFooter>
        </ModalLayout>
    );
}
