import { ChevronRight, Package } from "lucide-react";
import { FramedMedia } from "@components/ui/FramedMedia";
import { FRAMING_DEFAULTS } from "@components/ui/ImageReframeEditor/types";
import type { StoryProductBlock } from "@/services/supabase/stories";
import type { CollectionViewSectionItem } from "@/components/PublicCollectionView/CollectionView/CollectionView";
import styles from "./PublicProductBlock.module.scss";

// Stesso pattern di formatPrice in SearchOverlay.tsx: CollectionViewSectionItem
// espone price/effective_price/from_price (non base_price/option_groups come
// V2Product) — getDisplayPrice (priceDisplay.ts) non è lo strumento giusto qui.
function formatPrice(item: CollectionViewSectionItem): string | null {
    if (item.from_price != null) return `da €${item.from_price.toFixed(2)}`;
    const p = item.effective_price ?? item.price;
    return p != null ? `€${p.toFixed(2)}` : null;
}

type PublicProductBlockProps = {
    block: StoryProductBlock;
    /** Ripescaggio dal catalogo già risolto in CollectionView (stessa fonte del menu, niente logica duplicata). null = non trovato / non visibile per questa sede. */
    resolveProduct: (productId: string) => CollectionViewSectionItem | null;
    /** Apre l'ItemDetail nel menu. Assente/prodotto non risolvibile → la card non compare. */
    onOpenProduct?: (productId: string) => void;
};

/**
 * Card compatta "vedi nel menu". Non salva mai nome/prezzo: entrambi ripescati
 * qui ad ogni render dal catalogo pubblico corrente, così il prezzo resta
 * dinamico e la card non può divergere dalla visibilità del menu (stessa
 * fonte, non uno snapshot). Prodotto cancellato o non visibile per la sede →
 * `resolveProduct` torna null → nessuna card, nessun buco: la storia continua.
 */
export default function PublicProductBlock({ block, resolveProduct, onOpenProduct }: PublicProductBlockProps) {
    if (!block.productId || !onOpenProduct) return null;

    const product = resolveProduct(block.productId);
    if (!product) return null;

    const price = formatPrice(product);

    return (
        <button type="button" className={styles.card} onClick={() => onOpenProduct(product.id)}>
            <div className={styles.thumb}>
                {product.image ? (
                    <FramedMedia
                        source={product.image}
                        framing={product.image_framing ?? FRAMING_DEFAULTS}
                        aspectRatio={product.image_aspect_ratio ?? null}
                        frameRatio={1}
                        alt=""
                    />
                ) : (
                    <span className={styles.thumbPlaceholder} aria-hidden="true">
                        <Package size={18} strokeWidth={1.5} />
                    </span>
                )}
            </div>
            <div className={styles.body}>
                <span className={styles.eyebrow}>Vedi nel menu</span>
                <span className={styles.name}>{product.name}</span>
                {price && <span className={styles.price}>{price}</span>}
            </div>
            <ChevronRight size={18} strokeWidth={2} className={styles.chevron} aria-hidden="true" />
        </button>
    );
}
