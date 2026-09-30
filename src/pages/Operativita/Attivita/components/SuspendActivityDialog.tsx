import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { RadioGroup } from "@/components/ui/RadioGroup/RadioGroup";
import type { InactiveReason } from "@/utils/activityStatus";

const REASON_OPTIONS: { value: InactiveReason; label: string; description: string }[] = [
    {
        value: "maintenance",
        label: "Manutenzione",
        description: "Il locale è temporaneamente chiuso per lavori o aggiornamenti."
    },
    {
        value: "closed",
        label: "Chiusura temporanea",
        description: "Il locale è chiuso per ferie, festività o altro motivo temporaneo."
    },
    {
        value: "unavailable",
        label: "Non disponibile",
        description: "Il catalogo non è al momento consultabile per motivi generici."
    }
];

type DialogMode = "suspend" | "edit-reason";

interface SuspendActivityDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: InactiveReason) => Promise<boolean>;
    mode?: DialogMode;
    initialReason?: InactiveReason | null;
}

/**
 * Sospendere la pubblicazione è un'operazione di stato con una scelta da
 * spiegare: `ConfirmDialog` con il `RadioGroup card` dei tre motivi (come la
 * disdetta in Abbonamento), non una modale centrata (registro Sedi #84).
 */
export function SuspendActivityDialog({
    isOpen,
    onClose,
    onConfirm,
    mode = "suspend",
    initialReason
}: SuspendActivityDialogProps) {
    const [reason, setReason] = useState<InactiveReason>(initialReason ?? "maintenance");

    useEffect(() => {
        if (isOpen) {
            setReason(initialReason ?? "maintenance");
        }
    }, [isOpen, initialReason]);

    const isEditMode = mode === "edit-reason";

    return (
        <ConfirmDialog
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={() => onConfirm(reason)}
            title={isEditMode ? "Modifica il motivo" : "Sospendi la sede"}
            message={
                isEditMode
                    ? "Il motivo compare a chi apre la pagina pubblica mentre la sede è sospesa."
                    : "La pagina pubblica non è più raggiungibile: chi apre il link o il QR legge il motivo. Riprendi quando vuoi."
            }
            confirmLabel={isEditMode ? "Aggiorna" : "Sospendi"}
            confirmVariant={isEditMode ? "primary" : "danger"}
        >
            <RadioGroup
                label="Motivo"
                value={reason}
                onChange={v => setReason(v as InactiveReason)}
                options={REASON_OPTIONS}
                variant="card"
            />
        </ConfirmDialog>
    );
}
