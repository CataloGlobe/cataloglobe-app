import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { getProduct } from "@/services/supabase/products";
import type { StoryProductBlock } from "@/services/supabase/stories";
import { StoryProductPicker } from "../StoryProductPicker";
import styles from "./ProductBlock.module.scss";

interface ProductBlockProps {
    block: StoryProductBlock;
    onChange: (next: StoryProductBlock) => void;
    tenantId: string | null;
    disabled?: boolean;
}

/**
 * Blocco Prodotto — ponte storia→menu. Salva SOLO `productId` (mai nome/prezzo
 * snapshot, ripescati al render). Riusa `StoryProductPicker` per la selezione
 * (mini-card foto/nome/prezzo + Cambia/Rimuovi già implementate lì).
 *
 * In più: lettura diretta `getProduct` per rilevare un id dangling
 * (`body_blocks` è JSONB senza FK — a differenza di `stories.product_id` un
 * prodotto cancellato non azzera il blocco). Contesto back office → lettura
 * diretta è corretta qui (a differenza del pubblico, che riusa il catalogo
 * già risolto in CollectionView per non duplicare la logica di visibilità).
 * Quando l'id è dangling, `StoryProductPicker` degrada da solo allo stato
 * "Collega un prodotto" (il prodotto non è nella sua lista) — il banner sotto
 * spiega perché.
 */
export function ProductBlock({ block, onChange, tenantId, disabled }: ProductBlockProps) {
    const [dangling, setDangling] = useState(false);

    useEffect(() => {
        if (!block.productId || !tenantId) {
            setDangling(false);
            return;
        }
        let cancelled = false;
        getProduct(block.productId, tenantId)
            .then(() => {
                if (!cancelled) setDangling(false);
            })
            .catch(() => {
                if (!cancelled) setDangling(true);
            });
        return () => {
            cancelled = true;
        };
    }, [block.productId, tenantId]);

    return (
        <div className={styles.root}>
            {dangling && (
                <InlineBanner variant="warning">
                    <div className={styles.warningRow}>
                        <AlertTriangle size={16} strokeWidth={2} className={styles.warningIcon} aria-hidden="true" />
                        <span>
                            Questo prodotto non è più disponibile nel catalogo. Non comparirà nella storia
                            pubblicata. Scegline un altro.
                        </span>
                    </div>
                </InlineBanner>
            )}
            <StoryProductPicker
                tenantId={tenantId}
                value={block.productId}
                onChange={productId => onChange({ ...block, productId })}
                disabled={disabled}
            />
        </div>
    );
}
