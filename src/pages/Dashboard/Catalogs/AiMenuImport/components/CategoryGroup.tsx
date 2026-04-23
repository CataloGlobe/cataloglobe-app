import type { AiProduct } from "../AiMenuImportWizard";
import { Checkbox } from "./Checkbox";
import { ProductReviewCard } from "./ProductReviewCard";
import styles from "../aiMenuImport.module.scss";

interface CategoryGroupProps {
    categoryKey: string;
    displayName: string;
    products: AiProduct[];
    onCategoryNameChange: (key: string, name: string) => void;
    onToggleCategory: (key: string) => void;
    onUpdateProduct: (id: string, updates: Partial<AiProduct>) => void;
    onRemoveProduct: (id: string) => void;
}

export function CategoryGroup({
    categoryKey,
    displayName,
    products,
    onCategoryNameChange,
    onToggleCategory,
    onUpdateProduct,
    onRemoveProduct
}: CategoryGroupProps) {
    const selectedCount = products.filter(p => p._selected).length;
    const allSelected = selectedCount === products.length;
    const someSelected = selectedCount > 0 && !allSelected;

    return (
        <div className={styles.categoryGroup}>
            <div className={styles.categoryHeader}>
                <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={() => onToggleCategory(categoryKey)}
                />
                <input
                    type="text"
                    className={styles.categoryNameInput}
                    value={displayName}
                    onChange={e => onCategoryNameChange(categoryKey, e.target.value)}
                />
                <span className={styles.categoryBadge}>
                    {selectedCount}/{products.length}
                </span>
            </div>
            <div className={styles.categoryProducts}>
                {products.map(product => (
                    <ProductReviewCard
                        key={product._id}
                        product={product}
                        onUpdate={updates => onUpdateProduct(product._id, updates)}
                        onRemove={() => onRemoveProduct(product._id)}
                    />
                ))}
            </div>
        </div>
    );
}
