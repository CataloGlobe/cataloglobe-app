import { useState } from "react";
import styles from "./PublicProductCard.module.scss";
import type {
    ResolvedProduct,
    ResolvedVariant,
    ResolvedAllergen,
    ResolvedIngredient
} from "@/services/supabase/resolveActivityCatalogs";
import Text from "@/components/ui/Text/Text";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { Button } from "@/components/ui";
import type { StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";

type Props = {
    product: ResolvedProduct;
    tokens: StyleTokenModel;
};

type ProductAttribute = {
    definition?: { label?: string | null } | null;
    value_text?: string | null;
    value_number?: number | null;
    value_boolean?: boolean | null;
    value_json?: unknown | null;
};

const ALLERGEN_EMOJI: Record<string, string> = {
    gluten: "🌾",
    crustaceans: "🦐",
    eggs: "🥚",
    fish: "🐟",
    peanuts: "🥜",
    soy: "🫘",
    milk: "🥛",
    nuts: "🌰",
    celery: "🥬",
    mustard: "🌿",
    sesame: "🫙",
    sulphites: "🍇",
    lupin: "🌼",
    molluscs: "🦪"
};

// Returns displayable string for an attribute value, or null if empty.
function getAttrDisplayValue(attr: ProductAttribute): string | null {
    if (attr.value_text) return attr.value_text;
    if (typeof attr.value_number === "number") return String(attr.value_number);
    if (attr.value_boolean != null) return attr.value_boolean ? "Sì" : "No";
    if (Array.isArray(attr.value_json) && attr.value_json.length > 0) {
        return (attr.value_json as string[]).join(", ");
    }
    return null;
}

export default function PublicProductCard({ product, tokens }: Props) {
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    if (!product.is_visible) return null;

    const isDisabled = product.is_disabled === true;
    const isList = tokens.card.layout === "list";
    const showImage = tokens.card.image.mode === "show";
    const imagePos = tokens.card.image.position;

    const hasVariants = (product.variants?.length ?? 0) > 0;
    const hasOptions = (product.optionGroups?.length ?? 0) > 0;
    const hasAttributes = (product.attributes as ProductAttribute[] | undefined)?.some(
        a => getAttrDisplayValue(a) !== null
    ) ?? false;
    const hasAllergens = (product.allergens?.length ?? 0) > 0;
    const hasIngredients = (product.ingredients?.length ?? 0) > 0;
    const hasDetail = !isDisabled && (!!product.description || hasVariants || hasOptions || hasAttributes || hasAllergens || hasIngredients);

    // Indicators shown on the card
    const indicators: string[] = [];
    if (hasVariants) indicators.push("Varianti disponibili");
    if (hasOptions) indicators.push("Personalizzabile");

    // ── Price badge ───────────────────────────────────────────────────────────
    const renderPriceBadge = () => {
        if (product.from_price != null) {
            return (
                <div className={styles.priceBlock}>
                    <Text variant="body" weight={700} className={styles.price}>
                        da {product.from_price.toFixed(2)} €
                    </Text>
                </div>
            );
        }
        const displayPrice = product.effective_price ?? product.price;
        if (typeof displayPrice === "number") {
            return (
                <div className={styles.priceBlock}>
                    <Text variant="body" weight={700} className={styles.price}>
                        € {displayPrice.toFixed(2)}
                    </Text>
                    {typeof product.original_price === "number" && (
                        <Text variant="caption" colorVariant="muted" className={styles.originalPrice}>
                            € {product.original_price.toFixed(2)}
                        </Text>
                    )}
                </div>
            );
        }
        return null;
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
            <article
                className={`${styles.card} ${isList ? styles.listLayout : styles.gridLayout} ${
                    isDisabled ? styles.disabledCard : ""
                }`}
                onClick={hasDetail ? () => setIsDetailOpen(true) : undefined}
                style={{
                    ...(hasDetail ? { cursor: "pointer" } : undefined),
                    ...(isList && imagePos === "right" ? { flexDirection: "row-reverse" } : undefined)
                }}
                tabIndex={hasDetail ? 0 : undefined}
                onKeyDown={
                    hasDetail
                        ? e => { if (e.key === "Enter" || e.key === " ") setIsDetailOpen(true); }
                        : undefined
                }
                role={hasDetail ? "button" : undefined}
                aria-label={hasDetail ? `Vedi dettagli per ${product.name}` : undefined}
                aria-disabled={isDisabled || undefined}
            >
                {showImage && (
                    <div className={styles.imageContainer}>
                        {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className={styles.image} />
                        ) : (
                            <div className={styles.imagePlaceholder}>
                                <div className={styles.placeholderIcon} />
                            </div>
                        )}
                    </div>
                )}

                <div className={styles.content}>
                    <div className={styles.baseProduct}>
                        <div className={styles.headerRow}>
                            <Text variant="body" weight={700} className={styles.name}>
                                {product.name}
                            </Text>
                            {renderPriceBadge()}
                        </div>

                        {isDisabled && (
                            <Text variant="caption" className={styles.unavailableBadge}>
                                Non disponibile
                            </Text>
                        )}

                        {hasAllergens && (
                            <div className={styles.allergenEmojis}>
                                {(product.allergens as ResolvedAllergen[]).slice(0, 6).map(al => (
                                    <span
                                        key={al.code}
                                        className={styles.allergenEmoji}
                                        title={al.label_it}
                                        aria-label={al.label_it}
                                        role="img"
                                    >
                                        {ALLERGEN_EMOJI[al.code] ?? "⚠️"}
                                    </span>
                                ))}
                                {(product.allergens as ResolvedAllergen[]).length > 6 && (
                                    <Text variant="caption" colorVariant="muted" className={styles.allergenMore}>
                                        +{(product.allergens as ResolvedAllergen[]).length - 6}
                                    </Text>
                                )}
                            </div>
                        )}

                        {indicators.length > 0 && (
                            <Text variant="caption" colorVariant="muted" style={{ marginTop: 6 }}>
                                {indicators.join(" • ")}
                            </Text>
                        )}
                    </div>
                </div>
            </article>

            {/* Informational detail modal */}
            {hasDetail && (
                <ModalLayout
                    isOpen={isDetailOpen}
                    onClose={() => setIsDetailOpen(false)}
                    width="sm"
                    height="sm"
                >
                    <ModalLayoutHeader>
                        <Text as="h2" variant="title-md" weight={700}>
                            {product.name}
                        </Text>
                        <Button variant="secondary" onClick={() => setIsDetailOpen(false)}>
                            Chiudi
                        </Button>
                    </ModalLayoutHeader>

                    <ModalLayoutContent>
                        <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "4px 0" }}>

                            {/* Prezzo */}
                            {renderPriceBadge()}

                            {/* Descrizione */}
                            {product.description && (
                                <Text variant="body" colorVariant="muted">
                                    {product.description}
                                </Text>
                            )}

                            {/* Varianti */}
                            {hasVariants && (
                                <div className={styles.variantsContainer}>
                                    {(product.variants as ResolvedVariant[]).map(v => (
                                        <div key={v.id} className={styles.variantRow}>
                                            <div className={styles.variantHeader}>
                                                <Text variant="body-sm" weight={600}>{v.name}</Text>
                                                {typeof v.price === "number" && (
                                                    <Text variant="body-sm" weight={600}>
                                                        € {v.price.toFixed(2)}
                                                    </Text>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Configurazioni */}
                            {hasOptions && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                    {product.optionGroups!.map(group => (
                                        <div key={group.id}>
                                            <Text variant="body-sm" weight={700}>
                                                {group.name}
                                                {group.max_selectable != null
                                                    ? ` (max ${group.max_selectable})`
                                                    : ""}
                                            </Text>
                                            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                                                {group.values.map(v => (
                                                    <div
                                                        key={v.id}
                                                        style={{
                                                            display: "flex",
                                                            justifyContent: "space-between",
                                                            alignItems: "center"
                                                        }}
                                                    >
                                                        <Text variant="body-sm">{v.name}</Text>
                                                        {group.group_kind === "PRIMARY_PRICE" &&
                                                            v.absolute_price != null && (
                                                                <Text variant="body-sm" weight={600}>
                                                                    € {v.absolute_price.toFixed(2)}
                                                                </Text>
                                                            )}
                                                        {group.group_kind === "ADDON" &&
                                                            v.price_modifier != null &&
                                                            v.price_modifier > 0 && (
                                                                <Text variant="body-sm" weight={600}>
                                                                    +{v.price_modifier.toFixed(2)} €
                                                                </Text>
                                                            )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Attributi — solo se valorizzati */}
                            {hasAttributes && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    {(product.attributes as ProductAttribute[]).map((a, i) => {
                                        const val = getAttrDisplayValue(a);
                                        if (!val) return null;
                                        return (
                                            <div
                                                key={i}
                                                style={{ display: "flex", gap: 8, alignItems: "baseline" }}
                                            >
                                                <Text variant="caption" colorVariant="muted">
                                                    {a.definition?.label ?? "—"}:
                                                </Text>
                                                <Text variant="caption">{val}</Text>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Allergeni */}
                            {hasAllergens && (
                                <div className={styles.allergenSection}>
                                    <Text variant="caption" colorVariant="muted" className={styles.allergenSectionLabel}>
                                        Allergeni
                                    </Text>
                                    <div className={styles.allergenBadges}>
                                        {(product.allergens as ResolvedAllergen[]).map(al => (
                                            <span
                                                key={al.code}
                                                className={styles.allergenBadge}
                                                title={al.label_it}
                                            >
                                                {ALLERGEN_EMOJI[al.code] ?? "⚠️"} {al.label_it}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Ingredienti */}
                            {hasIngredients && (
                                <div className={styles.ingredientSection}>
                                    <Text variant="caption" colorVariant="muted" className={styles.ingredientSectionLabel}>
                                        Ingredienti
                                    </Text>
                                    <Text variant="caption" colorVariant="muted" className={styles.ingredientList}>
                                        {(product.ingredients as ResolvedIngredient[]).map(i => i.name).join(", ")}
                                    </Text>
                                </div>
                            )}

                        </div>
                    </ModalLayoutContent>
                </ModalLayout>
            )}
        </>
    );
}
