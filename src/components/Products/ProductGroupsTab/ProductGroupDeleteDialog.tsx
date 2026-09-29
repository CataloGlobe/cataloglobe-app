import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { deleteProductGroup, type ProductGroupWithCount } from "@/services/supabase/productGroups";

type Props = {
    open: boolean;
    onClose: () => void;
    groupData: ProductGroupWithCount | null;
    onSuccess: () => void;
};

/**
 * Elimina un gruppo (lotto Prodotti P5): `ConfirmDialog` che dice cosa
 * succede davvero — i sottogruppi tornano gruppi principali (FK `SET NULL`),
 * i collegamenti ai prodotti cadono (`CASCADE`), i prodotti restano. Prima un
 * drawer diceva «se la base dati lo consente».
 */
export function ProductGroupDeleteDialog({ open, onClose, groupData, onSuccess }: Props) {
    const { showToast } = useToast();
    const { productLabel, productLabelPlural } = useVerticalConfig();

    const handleConfirm = async (): Promise<boolean> => {
        if (!groupData) return false;
        try {
            await deleteProductGroup(groupData.id);
            showToast({ message: `Gruppo «${groupData.name}» eliminato.`, type: "success" });
            onSuccess();
            return true;
        } catch (error) {
            console.error("Eliminazione gruppo:", error);
            showToast({ message: "Non è stato possibile eliminare il gruppo.", type: "error" });
            return false;
        }
    };

    if (!groupData) return null;

    const count = groupData.productsCount;
    const kept =
        count > 0
            ? `${count} ${count === 1 ? productLabel.toLowerCase() : productLabelPlural.toLowerCase()} del gruppo ${count === 1 ? "resta" : "restano"}, fuori dal gruppo. `
            : "";
    return (
        <ConfirmDialog
            isOpen={open}
            onClose={onClose}
            onConfirm={handleConfirm}
            title={`Eliminare «${groupData.name}»?`}
            message={`${kept}I sottogruppi diventano gruppi principali. Non si torna indietro.`}
            confirmLabel="Elimina"
        />
    );
}
