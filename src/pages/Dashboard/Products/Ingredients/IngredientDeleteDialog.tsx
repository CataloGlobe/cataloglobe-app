import { useState } from "react";
import { ConfirmDialogShell } from "@/components/ui/ConfirmDialog/ConfirmDialogShell";
import { Button } from "@/components/ui/Button/Button";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { deleteIngredient, type V2Ingredient } from "@/services/supabase/ingredients";
import { isPostgrestFKError } from "@/utils/supabaseErrors";

type Props = {
    open: boolean;
    onClose: () => void;
    ingredient: V2Ingredient | null;
    /** Prodotti che lo usano (§26.2): il vincolo si dice prima, non fallendo. */
    usedBy: number;
    tenantId: string;
    onSuccess: () => void;
};

/**
 * Elimina un ingrediente (lotto Prodotti P5, §50.9/4). Se un prodotto lo usa
 * il dialogo lo dice e «Elimina» è spento: prima lo si scopriva dal 23503.
 */
export function IngredientDeleteDialog({ open, onClose, ingredient, usedBy, tenantId, onSuccess }: Props) {
    const { showToast } = useToast();
    const { productLabel, productLabelPlural } = useVerticalConfig();
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!ingredient) return null;

    const products = (n: number) => `${n} ${n === 1 ? productLabel.toLowerCase() : productLabelPlural.toLowerCase()}`;

    const handleDelete = async () => {
        setIsDeleting(true);
        setError(null);
        try {
            await deleteIngredient(ingredient.id, tenantId);
            showToast({ message: `Ingrediente «${ingredient.name}» eliminato.`, type: "success" });
            onSuccess();
            onClose();
        } catch (err) {
            if (isPostgrestFKError(err)) {
                setError(`Un ${productLabel.toLowerCase()} lo usa da poco: toglilo da lì prima di eliminarlo.`);
            } else {
                console.error("Eliminazione ingrediente:", err);
                setError("Eliminazione non riuscita. Riprova.");
            }
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <ConfirmDialogShell
            isOpen={open}
            onClose={() => {
                setError(null);
                onClose();
            }}
            locked={isDeleting}
            title={`Eliminare «${ingredient.name}»?`}
            message={usedBy > 0 ? undefined : "Non si torna indietro."}
            error={error}
            footer={
                <>
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={isDeleting} data-autofocus>
                        Annulla
                    </Button>
                    <Button variant="danger" size="sm" onClick={handleDelete} loading={isDeleting} disabled={usedBy > 0}>
                        Elimina
                    </Button>
                </>
            }
        >
            {usedBy > 0 && (
                <InlineBanner variant="info">
                    È usato da {products(usedBy)}: toglilo da lì prima di eliminarlo.
                </InlineBanner>
            )}
        </ConfirmDialogShell>
    );
}
