import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import type { StoryProductBlock } from "@/services/supabase/stories";
import { StoryProductPicker, type StoryProductOptions } from "../StoryProductPicker";
import styles from "./ProductBlock.module.scss";

interface ProductBlockProps {
    block: StoryProductBlock;
    onChange: (next: StoryProductBlock) => void;
    tenantId: string | null;
    productOptions: StoryProductOptions;
    disabled?: boolean;
}

/**
 * Blocco Prodotto — ponte storia→menu. Salva SOLO `productId` (mai nome/prezzo
 * snapshot, ripescati al render). Riusa `StoryProductPicker` per la selezione
 * (mini-card foto/nome/prezzo + Cambia/Rimuovi già implementate lì).
 *
 * Id dangling: `body_blocks` è JSONB senza FK, quindi un prodotto cancellato
 * non azzera il blocco. Lo si riconosce dall'elenco dei prodotti base che la
 * pagina legge una volta sola: caricato e senza quell'id = non più nel
 * catalogo. Il picker lo dice nella riga, il banner sotto spiega perché.
 */
export function ProductBlock({ block, onChange, tenantId, productOptions, disabled }: ProductBlockProps) {
    const dangling =
        block.productId !== null &&
        productOptions.items !== null &&
        !productOptions.items.some(p => p.id === block.productId);

    return (
        <div className={styles.root}>
            {dangling && (
                <InlineBanner variant="warning">
                    Questo prodotto non è più disponibile nel catalogo. Non comparirà nella storia
                    pubblicata. Scegline un altro.
                </InlineBanner>
            )}
            <StoryProductPicker
                tenantId={tenantId}
                value={block.productId}
                onChange={productId => onChange({ ...block, productId })}
                options={productOptions}
                disabled={disabled}
            />
        </div>
    );
}
