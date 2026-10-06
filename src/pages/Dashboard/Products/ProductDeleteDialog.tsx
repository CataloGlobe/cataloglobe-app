import { useCallback, useEffect, useState } from "react";
import { ConfirmDialogShell } from "@/components/ui/ConfirmDialog/ConfirmDialogShell";
import { Button } from "@/components/ui/Button/Button";
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
 * su `ConfirmDialog` (CLAUDE.md M17). Fail-closed come In evidenza (E1,
 * §50.17): se il conteggio non arriva il dialogo lo dice, «Elimina» resta
 * spento e «Riprova» rilegge; mai una conferma che tace dove è usato.
 */
export function ProductDeleteDialog({ open, onClose, productData, onSuccess }: Props) {
    const { showToast } = useToast();
    const verticalConfig = useVerticalConfig();
    const [impact, setImpact] = useState<ProductDeleteImpact | null>(null);
    const [impactFailed, setImpactFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);

    const isVariant = !!productData?.parent_product_id;
    const variantsCount = productData?.variants?.length ?? 0;
    const noun = isVariant ? "variante" : verticalConfig.productLabel.toLowerCase();
    const article = isVariant ? "la" : "il";

    useEffect(() => {
        if (!open || !productData) return;
        setImpact(null);
        setImpactFailed(false);
        let cancelled = false;
        countProductDeleteImpact(productData.id, productData.tenant_id)
            .then(result => {
                if (!cancelled) setImpact(result);
            })
            .catch(err => {
                console.warn("[ProductDeleteDialog] impact fetch failed:", err);
                if (!cancelled) setImpactFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [open, productData, attempt]);

    const retry = useCallback(() => setAttempt(n => n + 1), []);

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

    const handleConfirm = async (): Promise<void> => {
        if (!productData || impactFailed) return;
        setIsDeleting(true);
        try {
            await deleteProduct(productData.id, productData.tenant_id);
            const withVariants =
                variantsCount === 1 ? " e la sua variante" : variantsCount > 1 ? " e le sue varianti" : "";
            showToast({
                message: `«${productData.name}»${withVariants} ${variantsCount > 0 ? "eliminati" : isVariant ? "eliminata" : "eliminato"}.${impactText ? ` Tolto da ${impactText}.` : ""}`,
                type: "success"
            });
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Eliminazione prodotto:", error);
            showToast({ message: `Non è stato possibile eliminare ${article} ${noun}.`, type: "error" });
        } finally {
            setIsDeleting(false);
        }
    };

    if (!productData) return null;

    return (
        <ConfirmDialogShell
            isOpen={open}
            onClose={onClose}
            locked={isDeleting}
            title={`Eliminare «${productData.name}»?`}
            message={
                variantsCount === 1
                    ? "Se ne va anche la sua variante, e non si torna indietro."
                    : variantsCount > 1
                      ? `Se ne vanno anche le sue ${variantsCount} varianti, e non si torna indietro.`
                      : "Non si torna indietro."
            }
            error={
                impactFailed
                    ? `Non riesco a controllare dove è usat${isVariant ? "a" : "o"}: senza saperlo non ${isVariant ? "la" : "lo"} elimino.`
                    : null
            }
            footer={
                <>
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={isDeleting} data-autofocus>
                        Annulla
                    </Button>
                    {impactFailed && (
                        <Button variant="secondary" size="sm" onClick={retry}>
                            Riprova
                        </Button>
                    )}
                    <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void handleConfirm()}
                        loading={isDeleting}
                        disabled={impactFailed}
                    >
                        {variantsCount > 0 ? "Elimina tutto" : "Elimina"}
                    </Button>
                </>
            }
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
        </ConfirmDialogShell>
    );
}
