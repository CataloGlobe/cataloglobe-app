import { AlertTriangle, Trash2 } from "lucide-react";
import type { AiProduct } from "../AiMenuImportWizard";
import { Checkbox } from "./Checkbox";
import styles from "../aiMenuImport.module.scss";

interface ProductReviewCardProps {
    product: AiProduct;
    onUpdate: (updates: Partial<AiProduct>) => void;
    onRemove: () => void;
}

export function ProductReviewCard({ product, onUpdate, onRemove }: ProductReviewCardProps) {
    // Defensive guard: skip rendering if AI returned malformed product data
    if (!product || typeof product.name !== "string") {
        return null;
    }

    const isLow = product.confidence === "low";

    const rowClass = [
        styles.productRow,
        !product._selected ? styles.productRowDeselected : "",
        isLow && product._selected ? styles.productRowLowConf : ""
    ]
        .filter(Boolean)
        .join(" ");

    const priceDisplay =
        product.product_type === "simple" && product.base_price != null
            ? `€ ${product.base_price.toFixed(2)}`
            : null;

    return (
        <div className={rowClass}>
            <Checkbox
                checked={product._selected}
                onChange={() => onUpdate({ _selected: !product._selected })}
                className={styles.productCheckbox}
            />

            <div className={styles.productContent}>
                <div className={styles.productMainRow}>
                    <input
                        type="text"
                        className={styles.productName}
                        value={product.name}
                        onChange={e => onUpdate({ name: e.target.value })}
                    />
                    {priceDisplay && (
                        <span className={styles.productPrice}>{priceDisplay}</span>
                    )}
                    {isLow && (
                        <span className={styles.lowConfBadge}>
                            <AlertTriangle size={10} />
                            Verifica
                        </span>
                    )}
                </div>

                {product.description ? (
                    <div className={styles.productDescription}>{product.description}</div>
                ) : (
                    <div className={`${styles.productDescription} ${styles.productDescriptionPlaceholder}`}>
                        Nessuna descrizione
                    </div>
                )}

                {product.product_type === "formats" && Array.isArray(product.formats) && product.formats.length > 0 && (
                    <div className={styles.productFormats}>
                        {product.formats.map((f, i) => {
                            if (!f || typeof f.name !== "string") return null;
                            const priceStr = f.price != null ? f.price.toFixed(2) : null;
                            return (
                                <span key={i} className={styles.formatTag}>
                                    {f.name}{priceStr ? ` €${priceStr}` : ""}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>

            <button type="button" className={styles.productTrash} onClick={onRemove}>
                <Trash2 size={15} />
            </button>
        </div>
    );
}
