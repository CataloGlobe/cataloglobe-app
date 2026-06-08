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

/**
 * Normalizza una stringa per match accent-insensitive. NFD decomposes
 * caratteri accentati in base + combining marks; il regex rimuove i
 * marks (range U+0300-U+036F). Output lowercased.
 */
function normalizeForMatch(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim();
}

export interface ProductPickerProps {
    catalog: ResolvedCatalog;
    expandedProductId: string | null;
    onExpand: (productId: string | null) => void;
    renderConfigurator: (product: ResolvedProduct) => React.ReactNode;
    /**
     * Free-text di ricerca. Vuoto / undefined → lista per categoria
     * attiva (comportamento base). Valore non vuoto → lista flat
     * cross-categoria filtrata per name (case + accent insensitive,
     * solo `name` per ora). In modalita' ricerca le pills categorie
     * vengono attenuate e ignorate dalla selezione.
     */
    query?: string;
}

export function ProductPicker({
    catalog,
    expandedProductId,
    onExpand,
    renderConfigurator,
    query
}: ProductPickerProps) {
    const categories = useMemo<ResolvedCategory[]>(() => {
        return (catalog.categories ?? []).filter(
            c => (c.products ?? []).some(p => p.is_visible !== false)
        );
    }, [catalog.categories]);

    const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
        categories[0]?.id ?? null
    );

    const trimmedQuery = (query ?? "").trim();
    const isSearching = trimmedQuery.length > 0;

    // Lista flat di TUTTI i prodotti visibili cross-categoria; usata in
    // modalita' ricerca. Memo per stabilita' (ricalcolata solo se il
    // catalogo cambia).
    const allVisibleProducts = useMemo<
        Array<{ category: ResolvedCategory; product: ResolvedProduct }>
    >(() => {
        const out: Array<{ category: ResolvedCategory; product: ResolvedProduct }> = [];
        for (const c of catalog.categories ?? []) {
            for (const p of c.products ?? []) {
                if (p.is_visible === false) continue;
                out.push({ category: c, product: p });
            }
        }
        return out;
    }, [catalog.categories]);

    const matchedProducts = useMemo<
        Array<{ category: ResolvedCategory; product: ResolvedProduct }>
    >(() => {
        if (!isSearching) return [];
        const needle = normalizeForMatch(trimmedQuery);
        return allVisibleProducts.filter(
            ({ product }) => normalizeForMatch(product.name).includes(needle)
        );
    }, [allVisibleProducts, isSearching, trimmedQuery]);

    const activeCategory =
        categories.find(c => c.id === activeCategoryId) ?? categories[0];

    if (!activeCategory && !isSearching) {
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

    const productsToRender: Array<{ category?: ResolvedCategory; product: ResolvedProduct }> =
        isSearching
            ? matchedProducts.map(({ category, product }) => ({ category, product }))
            : (activeCategory?.products ?? [])
                  .filter(p => p.is_visible !== false)
                  .map(p => ({ product: p }));

    return (
        <div className={styles.wrapper}>
            <div
                className={styles.categoryPills}
                role="tablist"
                aria-disabled={isSearching}
            >
                {categories.map(c => {
                    const isActive = !isSearching && activeCategory?.id === c.id;
                    const className = isSearching
                        ? styles.pillDisabled
                        : isActive
                          ? styles.pillActive
                          : styles.pill;
                    return (
                        <button
                            key={c.id}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            disabled={isSearching}
                            className={className}
                            onClick={() => {
                                setActiveCategoryId(c.id);
                                onExpand(null);
                            }}
                        >
                            {c.name}
                        </button>
                    );
                })}
            </div>

            <div className={styles.productsList}>
                {productsToRender.length === 0 ? (
                    <div className={styles.emptyHint}>
                        <Text colorVariant="muted">
                            {isSearching
                                ? "Nessun prodotto trovato per la ricerca."
                                : "Nessun prodotto disponibile in questa categoria."}
                        </Text>
                    </div>
                ) : (
                    productsToRender.map(({ category, product: p }) => {
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
                                        {isSearching && category && (
                                            <Text variant="caption" colorVariant="muted">
                                                {category.name}
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
