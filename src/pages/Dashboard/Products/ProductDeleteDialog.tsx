import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import {
    deleteProduct,
    countProductDeleteImpact,
    type V2Product,
    type ProductDeleteImpact
} from "@/services/supabase/products";
import styles from "./ProductDeleteDialog.module.scss";

type Props = {
    open: boolean;
    onClose: () => void;
    productData: V2Product | null;
    onSuccess: () => void;
};

type ImpactItem = { count: number; singular: string; plural: string };

/**
 * Elimina un prodotto o una variante (lotto Prodotti P4): `ConfirmDialog` con
 * l'impatto — dove è usato e, per un prodotto base, le varianti che se ne
 * vanno con lui. Era un drawer di conferma: le conferme irreversibili stanno
 * su `ConfirmDialog` (CLAUDE.md M17).
 */
export function ProductDeleteDialog({ open, onClose, productData, onSuccess }: Props) {
    const { showToast } = useToast();
    const verticalConfig = useVerticalConfig();
    const [impact, setImpact] = useState<ProductDeleteImpact | null>(null);

    const isVariant = !!productData?.parent_product_id;
    const variantsCount = productData?.variants?.length ?? 0;
    const noun = isVariant ? "variante" : verticalConfig.productLabel.toLowerCase();
    const article = isVariant ? "la" : "il";

    useEffect(() => {
        if (!open || !productData) return;
        setImpact(null);
        let cancelled = false;
        countProductDeleteImpact(productData.id, productData.tenant_id)
            .then(result => {
                if (!cancelled) setImpact(result);
            })
            .catch(err => {
                // Fail-open come prima: il bug è nel mucchio 2 del registro, PR a parte.
                console.warn("[ProductDeleteDialog] impact fetch failed:", err);
            });
        return () => {
            cancelled = true;
        };
    }, [open, productData]);

    const impactItems: ImpactItem[] = impact
        ? [
              {
                  count: impact.catalogs,
                  singular: verticalConfig.catalogLabel.toLowerCase(),
                  plural: verticalConfig.catalogLabelPlural.toLowerCase()
              },
              { count: impact.featured, singular: "contenuto in evidenza", plural: "contenuti in evidenza" },
              { count: impact.schedules, singular: "regola di programmazione", plural: "regole di programmazione" }
          ].filter(item => item.count > 0)
        : [];
    const impactText = impactItems
        .map(item => `${item.count} ${item.count === 1 ? item.singular : item.plural}`)
        .join(", ");

    const handleConfirm = async (): Promise<boolean> => {
        if (!productData) return false;
        try {
            await deleteProduct(productData.id, productData.tenant_id);
            const withVariants = variantsCount > 0 ? " e le sue varianti" : "";
            showToast({
                message: `«${productData.name}»${withVariants} ${variantsCount > 0 ? "eliminati" : isVariant ? "eliminata" : "eliminato"}.${impactText ? ` Tolto da ${impactText}.` : ""}`,
                type: "success"
            });
            onSuccess();
            return true;
        } catch (error) {
            console.error("Eliminazione prodotto:", error);
            showToast({ message: `Non è stato possibile eliminare ${article} ${noun}.`, type: "error" });
            return false;
        }
    };

    if (!productData) return null;

    return (
        <ConfirmDialog
            isOpen={open}
            onClose={onClose}
            onConfirm={handleConfirm}
            title={`Eliminare «${productData.name}»?`}
            message={
                variantsCount > 0
                    ? `Se ne vanno anche le sue ${variantsCount} ${variantsCount === 1 ? "variante" : "varianti"}, e non si torna indietro.`
                    : "Non si torna indietro."
            }
            confirmLabel={variantsCount > 0 ? "Elimina tutto" : "Elimina"}
        >
            {impactItems.length > 0 && (
                <div className={styles.impact}>
                    <Text variant="body-sm" weight={600}>
                        Oggi è usat{isVariant ? "a" : "o"} in:
                    </Text>
                    <ul className={styles.impactList}>
                        {impactItems.map(item => (
                            <li key={item.singular}>
                                <Text variant="body-sm">
                                    {item.count} {item.count === 1 ? item.singular : item.plural}
                                </Text>
                            </li>
                        ))}
                    </ul>
                    <Text variant="body-sm" colorVariant="muted">
                        Eliminando, si toglie da tutti.
                    </Text>
                </div>
            )}
        </ConfirmDialog>
    );
}
