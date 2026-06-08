import { useMemo, useState } from "react";

import Text from "@/components/ui/Text/Text";
import type {
    ResolvedCatalog,
    ResolvedCategory,
    ResolvedProduct
} from "@/services/supabase/resolveActivityCatalogs";

import styles from "./ProductPicker.module.scss";

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

export interface ProductPickerProps {
    catalog: ResolvedCatalog;
    expandedProductId: string | null;
    onExpand: (productId: string | null) => void;
    renderConfigurator: (product: ResolvedProduct) => React.ReactNode;
}

export function ProductPicker({
    catalog,
    expandedProductId,
    onExpand,
    renderConfigurator
}: ProductPickerProps) {
    const categories = useMemo<ResolvedCategory[]>(() => {
        return (catalog.categories ?? []).filter(
            c => (c.products ?? []).some(p => p.is_visible !== false)
        );
    }, [catalog.categories]);

    const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
        categories[0]?.id ?? null
    );

    const activeCategory =
        categories.find(c => c.id === activeCategoryId) ?? categories[0];

    if (!activeCategory) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.emptyHint}>
                    <Text colorVariant="muted">
                        Nessuna categoria con prodotti disponibili.
                    </Text>
                </div>
            </div>
        );
    }

    const visibleProducts = (activeCategory.products ?? []).filter(
        p => p.is_visible !== false
    );

    return (
        <div className={styles.wrapper}>
            <div className={styles.categoryPills} role="tablist">
                {categories.map(c => (
                    <button
                        key={c.id}
                        type="button"
                        role="tab"
                        aria-selected={activeCategory.id === c.id}
                        className={
                            activeCategory.id === c.id
                                ? styles.pillActive
                                : styles.pill
                        }
                        onClick={() => {
                            setActiveCategoryId(c.id);
                            onExpand(null);
                        }}
                    >
                        {c.name}
                    </button>
                ))}
            </div>

            <div className={styles.productsList}>
                {visibleProducts.length === 0 ? (
                    <div className={styles.emptyHint}>
                        <Text colorVariant="muted">
                            Nessun prodotto disponibile in questa categoria.
                        </Text>
                    </div>
                ) : (
                    visibleProducts.map(p => {
                        const isExpanded = expandedProductId === p.id;
                        const hasFromPrice = p.from_price != null && p.price == null;
                        const priceLabel = hasFromPrice
                            ? `da ${formatEur(p.from_price as number)}`
                            : p.price != null
                              ? formatEur(p.price)
                              : "—";
                        return (
                            <div key={p.id} className={styles.productRow}>
                                <button
                                    type="button"
                                    className={styles.productHeader}
                                    aria-expanded={isExpanded}
                                    onClick={() => onExpand(isExpanded ? null : p.id)}
                                >
                                    <div className={styles.productMain}>
                                        <span className={styles.productName}>{p.name}</span>
                                        {p.description && (
                                            <Text variant="body-sm" colorVariant="muted">
                                                {p.description}
                                            </Text>
                                        )}
                                    </div>
                                    <span
                                        className={
                                            hasFromPrice
                                                ? styles.productPriceMuted
                                                : styles.productPrice
                                        }
                                    >
                                        {priceLabel}
                                    </span>
                                </button>
                                {isExpanded && (
                                    <div className={styles.expansion}>
                                        {renderConfigurator(p)}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
