import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { deleteAttributeDefinition, type V2ProductAttributeDefinition } from "@/services/supabase/attributes";

type Props = {
    open: boolean;
    onClose: () => void;
    attributeData: V2ProductAttributeDefinition | null;
    onSuccess: () => void;
};

/**
 * Elimina un attributo personalizzato (lotto Prodotti P5): `ConfirmDialog`,
 * con i valori sui prodotti che se ne vanno insieme. Quelli di piattaforma
 * non arrivano qui: la loro tabella non ha azioni.
 */
export function AttributeDeleteDialog({ open, onClose, attributeData, onSuccess }: Props) {
    const { showToast } = useToast();
    const { productLabelPlural } = useVerticalConfig();

    const handleConfirm = async (): Promise<boolean> => {
        if (!attributeData?.tenant_id) return false;
        try {
            await deleteAttributeDefinition(attributeData.id, attributeData.tenant_id);
            showToast({ message: `Attributo «${attributeData.label}» eliminato.`, type: "success" });
            onSuccess();
            return true;
        } catch (error) {
            console.error("Eliminazione attributo:", error);
            showToast({ message: "Non è stato possibile eliminare l'attributo.", type: "error" });
            return false;
        }
    };

    if (!attributeData) return null;

    return (
        <ConfirmDialog
            isOpen={open}
            onClose={onClose}
            onConfirm={handleConfirm}
            title={`Eliminare «${attributeData.label}»?`}
            message={`Se ne vanno anche i valori che i ${productLabelPlural.toLowerCase()} hanno per questo attributo. Non si torna indietro.`}
            confirmLabel="Elimina"
        />
    );
}
