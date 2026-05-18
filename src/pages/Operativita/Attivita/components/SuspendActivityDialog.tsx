import { useEffect, useState } from "react";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
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

export function SuspendActivityDialog({
    isOpen,
    onClose,
    onConfirm,
    mode = "suspend",
    initialReason
}: SuspendActivityDialogProps) {
    const [reason, setReason] = useState<InactiveReason>(
        initialReason ?? "maintenance"
    );
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setReason(initialReason ?? "maintenance");
        }
    }, [isOpen, initialReason]);

    const handleConfirm = async () => {
        setLoading(true);
        const ok = await onConfirm(reason);
        setLoading(false);
        if (ok) onClose();
    };

    const isEditMode = mode === "edit-reason";
    const title = isEditMode ? "Modifica motivo sospensione" : "Sospendi attività";
    const description = isEditMode
        ? "Aggiorna il motivo della sospensione. Verrà mostrato ai visitatori della pagina pubblica."
        : "Seleziona il motivo della sospensione. Verrà mostrato ai visitatori della pagina pubblica.";
    const ctaLabel = isEditMode ? "Aggiorna" : "Sospendi";
    const ctaVariant: "primary" | "danger" = isEditMode ? "primary" : "danger";

    return (
        <ModalLayout isOpen={isOpen} onClose={onClose} width="sm" height="fit">
            <ModalLayoutHeader>
                <Text variant="title-sm" weight={600}>
                    {title}
                </Text>
            </ModalLayoutHeader>

            <ModalLayoutContent>
                <Text variant="body-sm" colorVariant="muted" style={{ marginBottom: 16 }}>
                    {description}
                </Text>
                <RadioGroup
                    value={reason}
                    onChange={v => setReason(v as InactiveReason)}
                    options={REASON_OPTIONS}
                />
            </ModalLayoutContent>

            <ModalLayoutFooter>
                <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
                    Annulla
                </Button>
                <Button variant={ctaVariant} size="sm" onClick={handleConfirm} loading={loading}>
                    {ctaLabel}
                </Button>
            </ModalLayoutFooter>
        </ModalLayout>
    );
}
