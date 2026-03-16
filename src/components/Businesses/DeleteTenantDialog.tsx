import { useEffect, useState } from "react";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader,
} from "@/components/ui/ModalLayout/ModalLayout";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";

interface Props {
    isOpen: boolean;
    tenantName: string;
    onClose: () => void;
    /** Deve resolvere normalmente in caso di successo, lanciare in caso di errore. */
    onConfirm: () => Promise<void>;
}

export function DeleteTenantDialog({ isOpen, tenantName, onClose, onConfirm }: Props) {
    const [confirmName, setConfirmName] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset state ogni volta che la dialog viene aperta/chiusa
    useEffect(() => {
        if (!isOpen) {
            setConfirmName("");
            setError(null);
        }
    }, [isOpen]);

    const canConfirm = confirmName === tenantName && !loading;

    const handleConfirm = async () => {
        if (!canConfirm) return;
        setLoading(true);
        setError(null);
        try {
            await onConfirm();
            // onConfirm gestisce il redirect — non chiudiamo manualmente
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Errore durante l'eliminazione. Riprova."
            );
            setLoading(false);
        }
    };

    return (
        <ModalLayout isOpen={isOpen} onClose={onClose} width="sm" height="fit">
            <ModalLayoutHeader>
                <Text variant="title-sm" weight={600}>
                    Eliminare &ldquo;{tenantName}&rdquo;?
                </Text>
            </ModalLayoutHeader>

            <ModalLayoutContent>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <Text variant="body-sm" colorVariant="muted">
                        L&apos;azienda verrà spostata nell&apos;area &ldquo;In eliminazione&rdquo; nel workspace.
                        <br /><br />
                        Potrai ripristinarla entro 30 giorni.<br />
                        Dopo questo periodo verrà eliminata definitivamente.
                    </Text>

                    <TextInput
                        label={`Digita "${tenantName}" per confermare`}
                        placeholder={tenantName}
                        value={confirmName}
                        onChange={e => setConfirmName(e.target.value)}
                        disabled={loading}
                        autoComplete="off"
                    />

                    {error && (
                        <Text variant="body-sm" style={{ color: "var(--color-red-600, #dc2626)" }}>
                            {error}
                        </Text>
                    )}
                </div>
            </ModalLayoutContent>

            <ModalLayoutFooter>
                <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
                    Annulla
                </Button>
                <Button
                    variant="danger"
                    size="sm"
                    onClick={handleConfirm}
                    disabled={!canConfirm}
                    loading={loading}
                >
                    Elimina azienda
                </Button>
            </ModalLayoutFooter>
        </ModalLayout>
    );
}
