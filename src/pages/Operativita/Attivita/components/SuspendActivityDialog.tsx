import { useState } from "react";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { RadioGroup } from "@/components/ui/RadioGroup/RadioGroup";
import type { V2Activity } from "@/types/activity";

type InactiveReason = NonNullable<V2Activity["inactive_reason"]>;

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

interface SuspendActivityDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: InactiveReason) => Promise<boolean>;
}

export function SuspendActivityDialog({ isOpen, onClose, onConfirm }: SuspendActivityDialogProps) {
    const [reason, setReason] = useState<InactiveReason>("maintenance");
    const [loading, setLoading] = useState(false);

    const handleConfirm = async () => {
        setLoading(true);
        const ok = await onConfirm(reason);
        setLoading(false);
        if (ok) onClose();
    };

    return (
        <ModalLayout isOpen={isOpen} onClose={onClose} width="sm" height="fit">
            <ModalLayoutHeader>
                <Text variant="title-sm" weight={600}>
                    Sospendi attività
                </Text>
            </ModalLayoutHeader>

            <ModalLayoutContent>
                <Text variant="body-sm" colorVariant="muted" style={{ marginBottom: 16 }}>
                    Seleziona il motivo della sospensione. Verrà mostrato ai visitatori della pagina
                    pubblica.
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
                <Button variant="danger" size="sm" onClick={handleConfirm} loading={loading}>
                    Sospendi
                </Button>
            </ModalLayoutFooter>
        </ModalLayout>
    );
}
