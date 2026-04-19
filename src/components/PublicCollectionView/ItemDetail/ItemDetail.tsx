import { useEffect, useMemo, useState } from "react";
import { Package, X } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import AllergenIcon from "@/components/ui/AllergenIcon/AllergenIcon";
import PublicSheet from "../PublicSheet/PublicSheet";
import styles from "./ItemDetail.module.scss";
import type { CollectionViewSectionItem } from "../CollectionView/CollectionView";
import type { SelectedAddon, SelectedFormat } from "../SelectionSheet/SelectionSheet";

type Props = {
    item: CollectionViewSectionItem | null;
    isOpen: boolean;
    onClose: () => void;
    mode: "public" | "preview";
    onAddToSelection?: (
        productId: string,
        productName: string,
        basePrice: number,
        selectedFormat?: SelectedFormat | null,
        selectedAddons?: SelectedAddon[]
    ) => void;
    /** Pre-compila il formato selezionato (modalità modifica). */
    initialFormat?: SelectedFormat | null;
    /** Pre-compila gli add-on selezionati (modalità modifica). */
    initialAddons?: SelectedAddon[];
    /** Etichetta del pulsante CTA. Default: "Aggiungi alla selezione". */
    submitLabel?: string;
    /** Se false, non mostra né immagine né placeholder. Default: true. */
    showImage?: boolean;
};

export default function ItemDetail({
    item,
    isOpen,
    onClose,
    mode,
    onAddToSelection,
    initialFormat,
    initialAddons,
    submitLabel = "Aggiungi alla selezione",
    showImage = true
}: Props) {
    // displayItem persiste durante l'animazione di chiusura.
    const [displayItem, setDisplayItem] = useState(item);
    const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
    const [selectedAddonIds, setSelectedAddonIds] = useState<Map<string, Set<string>>>(new Map());

    useEffect(() => {
        if (item) {
            setDisplayItem(item);
            const ppg = item.optionGroups?.find(g => g.group_kind?.toUpperCase() === "PRIMARY_PRICE");
            // Pre-compila da initialFormat (edit mode) o auto-seleziona se unico formato
            if (initialFormat?.id) {
                setSelectedFormatId(initialFormat.id);
            } else if (ppg && ppg.values.length === 1) {
                setSelectedFormatId(ppg.values[0].id);
            } else {
                setSelectedFormatId(null);
            }
            // Pre-compila add-on (edit mode) o reset
            if (initialAddons?.length) {
                const map = new Map<string, Set<string>>();
                for (const addon of initialAddons) {
                    const existing = map.get(addon.groupId) ?? new Set<string>();
                    existing.add(addon.id);
                    map.set(addon.groupId, existing);
                }
                setSelectedAddonIds(map);
            } else {
                setSelectedAddonIds(new Map());
            }
        }
        // initialFormat/initialAddons intentionally omitted — they are always in sync
        // with item changes (set together by CollectionView before setting selectedItem).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item]);

    const primaryPriceGroup = displayItem?.optionGroups?.find(
        g => g.group_kind?.toUpperCase() === "PRIMARY_PRICE"
    );
    const nonPrimaryGroups =
        displayItem?.optionGroups?.filter(g => g.group_kind?.toUpperCase() !== "PRIMARY_PRICE") ?? [];

    const computedPrice = useMemo(() => {
        if (!displayItem) return 0;
        let base = 0;
        if (selectedFormatId && primaryPriceGroup) {
            const fmt = primaryPriceGroup.values.find(v => v.id === selectedFormatId);
            base = fmt?.absolutePrice ?? 0;
        } else {
            base = displayItem.effective_price ?? displayItem.price ?? 0;
        }
        let addonsTotal = 0;
        for (const [groupId, valueIds] of selectedAddonIds) {
            const group = displayItem.optionGroups?.find(g => g.id === groupId);
            if (group) {
                for (const valueId of valueIds) {
                    const value = group.values.find(v => v.id === valueId);
                    addonsTotal += value?.priceModifier ?? 0;
                }
            }
        }
        return base + addonsTotal;
    }, [selectedFormatId, selectedAddonIds, displayItem, primaryPriceGroup]);

    const isAddDisabled = !!primaryPriceGroup && !selectedFormatId;

    const handleAddToSelection = () => {
        if (!onAddToSelection || !displayItem) return;
        const ppg = displayItem.optionGroups?.find(g => g.group_kind?.toUpperCase() === "PRIMARY_PRICE");
        const format: SelectedFormat | null = selectedFormatId && ppg
            ? (() => {
                const v = ppg.values.find(val => val.id === selectedFormatId);
                return v ? { id: v.id, name: v.name, price: v.absolutePrice ?? 0 } : null;
            })()
            : null;

        const addons: SelectedAddon[] = [];
        for (const [groupId, valueIds] of selectedAddonIds) {
            const group = displayItem.optionGroups?.find(g => g.id === groupId);
            if (group) {
                for (const valueId of valueIds) {
                    const value = group.values.find(v => v.id === valueId);
                    if (value) {
                        addons.push({
                            id: value.id,
                            groupId,
                            name: value.name,
                            priceDelta: value.priceModifier ?? 0,
                        });
                    }
                }
            }
        }

        const basePrice = format?.price ?? displayItem.effective_price ?? displayItem.price ?? 0;
        onAddToSelection(displayItem.id, displayItem.name, basePrice, format, addons);
        onClose();
    };

    if (!displayItem) return null;

    const shouldShowImage = showImage && mode === "public" && !!displayItem.image;
    const displayPrice = displayItem.effective_price ?? displayItem.price;

    return (
        <PublicSheet isOpen={isOpen} onClose={onClose} ariaLabel={displayItem.name}>
            {/* Header */}
            <div className={styles.header}>
                <Text as="h2" variant="title-md" weight={700} className={styles.headerTitle} color="var(--pub-surface-text)">
                    {displayItem.name}
                </Text>
                <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Chiudi">
                    <X size={16} strokeWidth={2} />
                    <span>Chiudi</span>
                </button>
            </div>

            {/* Scrollable body */}
            <div className={styles.body}>
                <div className={styles.root}>
                    {/* IMMAGINE — mostrata solo se showImage=true; placeholder se immagine assente */}
                    {showImage && (
                        shouldShowImage ? (
                            <img
                                src={displayItem.image!}
                                alt={displayItem.name}
                                className={styles.image}
                                loading="lazy"
                            />
                        ) : (
                            <div className={styles.placeholderImage} aria-hidden="true">
                                <Package
                                    size={40}
                                    strokeWidth={1.5}
                                    color="var(--pub-text-muted, var(--pub-text-secondary))"
                                />
                            </div>
                        )
                    )}

                    {/* CONTENUTO */}
                    <div className={styles.content}>
                        {/* Prezzo statico — nascosto se c'è un gruppo PRIMARY_PRICE (le pill mostrano i prezzi) */}
                        {!primaryPriceGroup && (
                            displayItem.from_price != null ? (
                                <Text variant="body" weight={600} className={styles.price} color="var(--pub-surface-text)">
                                    {displayItem.original_price != null && (
                                        <span className={styles.priceOriginal}>
                                            da € {displayItem.original_price.toFixed(2)}
                                        </span>
                                    )}
                                    <span className={styles.priceCurrent}>
                                        da € {displayItem.from_price.toFixed(2)}
                                    </span>
                                </Text>
                            ) : displayPrice != null ? (
                                <Text variant="body" weight={600} className={styles.price} color="var(--pub-surface-text)">
                                    {displayItem.original_price != null && (
                                        <span className={styles.priceOriginal}>
                                            € {displayItem.original_price.toFixed(2)}
                                        </span>
                                    )}
                                    <span className={styles.priceCurrent}>
                                        € {displayPrice.toFixed(2)}
                                    </span>
                                </Text>
                            ) : null
                        )}

                        {/* FORMATO (PRIMARY_PRICE) */}
                        {primaryPriceGroup && (
                            onAddToSelection ? (
                                /* Pill interattive */
                                <div className={styles.formatSection}>
                                    <div className={styles.sectionLabelRow}>
                                        <Text variant="body-sm" weight={700} color="var(--pub-surface-text)">
                                            {primaryPriceGroup.name}
                                        </Text>
                                        {primaryPriceGroup.isRequired && (
                                            <span className={styles.requiredBadge}>obbligatorio</span>
                                        )}
                                    </div>
                                    <div className={styles.formatPills}>
                                        {primaryPriceGroup.values.map(v => (
                                            <button
                                                key={v.id}
                                                type="button"
                                                className={[
                                                    styles.formatPill,
                                                    selectedFormatId === v.id ? styles.formatPillActive : ""
                                                ].filter(Boolean).join(" ")}
                                                onClick={() => setSelectedFormatId(v.id)}
                                            >
                                                <span className={styles.formatPillName}>{v.name}</span>
                                                {v.absolutePrice != null && (
                                                    <span className={styles.formatPillPrice}>
                                                        {v.originalPrice != null && (
                                                            <span className={styles.formatPillPriceOriginal}>
                                                                € {v.originalPrice.toFixed(2)}
                                                            </span>
                                                        )}
                                                        € {v.absolutePrice.toFixed(2)}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                /* Lista read-only */
                                <div className={styles.formatPrices}>
                                    {primaryPriceGroup.values.map(v => (
                                        <div key={v.id} className={styles.formatPriceRow}>
                                            <Text variant="body-sm" color="var(--pub-surface-text)">{v.name}</Text>
                                            {v.absolutePrice != null && (
                                                <div className={styles.formatPriceValue}>
                                                    {v.originalPrice != null && (
                                                        <span className={styles.priceOriginal}>
                                                            € {v.originalPrice.toFixed(2)}
                                                        </span>
                                                    )}
                                                    <Text variant="body-sm" weight={600} color="var(--pub-surface-text)">
                                                        € {v.absolutePrice.toFixed(2)}
                                                    </Text>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        {displayItem.description && (
                            <Text
                                variant="body"
                                className={styles.description}
                                color="var(--pub-surface-text-muted)"
                            >
                                {displayItem.description}
                            </Text>
                        )}

                        {/* ADD-ON (non-PRIMARY_PRICE) */}
                        {nonPrimaryGroups.length > 0 && (
                            onAddToSelection ? (
                                /* Checkbox interattivi */
                                <div className={styles.addonsSection}>
                                    {nonPrimaryGroups.map(group => {
                                        const selectedInGroup = selectedAddonIds.get(group.id) ?? new Set<string>();
                                        const maxReached = group.maxSelectable != null && selectedInGroup.size >= group.maxSelectable;
                                        return (
                                            <div key={group.id} className={styles.addonGroup}>
                                                <div className={styles.sectionLabelRow}>
                                                    <Text variant="body-sm" weight={700} color="var(--pub-surface-text)">
                                                        {group.name}
                                                    </Text>
                                                    {group.maxSelectable != null && (
                                                        <span className={styles.sectionLabelHint}>
                                                            max {group.maxSelectable}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={styles.addonList}>
                                                    {group.values.map(v => {
                                                        const isChecked = selectedInGroup.has(v.id);
                                                        const isDisabled = !isChecked && maxReached;
                                                        return (
                                                            <label
                                                                key={v.id}
                                                                className={[
                                                                    styles.addonRow,
                                                                    isDisabled ? styles.addonRowDisabled : ""
                                                                ].filter(Boolean).join(" ")}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    className={styles.addonCheckbox}
                                                                    checked={isChecked}
                                                                    disabled={isDisabled}
                                                                    onChange={() => {
                                                                        setSelectedAddonIds(prev => {
                                                                            const next = new Map(prev);
                                                                            const groupSet = new Set(next.get(group.id) ?? []);
                                                                            if (groupSet.has(v.id)) {
                                                                                groupSet.delete(v.id);
                                                                            } else {
                                                                                groupSet.add(v.id);
                                                                            }
                                                                            if (groupSet.size === 0) {
                                                                                next.delete(group.id);
                                                                            } else {
                                                                                next.set(group.id, groupSet);
                                                                            }
                                                                            return next;
                                                                        });
                                                                    }}
                                                                />
                                                                <span className={styles.addonName}>{v.name}</span>
                                                                {v.priceModifier != null && (
                                                                    <span className={[
                                                                        styles.addonPrice,
                                                                        v.priceModifier > 0 ? styles.addonPricePositive : "",
                                                                        v.priceModifier < 0 ? styles.addonPriceNegative : ""
                                                                    ].filter(Boolean).join(" ")}>
                                                                        {v.priceModifier === 0
                                                                            ? "incluso"
                                                                            : v.priceModifier > 0
                                                                                ? `+ € ${v.priceModifier.toFixed(2)}`
                                                                                : `- € ${Math.abs(v.priceModifier).toFixed(2)}`}
                                                                    </span>
                                                                )}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                /* Lista read-only */
                                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                    {nonPrimaryGroups.map(group => (
                                        <div key={group.id}>
                                            <Text variant="body-sm" weight={700} color="var(--pub-surface-text)">
                                                {group.name}
                                            </Text>
                                            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                                                {group.values.map(v => (
                                                    <div
                                                        key={v.id}
                                                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                                                    >
                                                        <Text variant="body-sm" color="var(--pub-surface-text)">{v.name}</Text>
                                                        {v.priceModifier != null && (
                                                            <Text
                                                                variant="body-sm"
                                                                weight={v.priceModifier === 0 ? 400 : 600}
                                                                color={v.priceModifier === 0 ? "var(--pub-surface-text-muted)" : "var(--pub-surface-text)"}
                                                            >
                                                                {v.priceModifier === 0
                                                                    ? "incluso"
                                                                    : v.priceModifier > 0
                                                                        ? `+${v.priceModifier.toFixed(2)} €`
                                                                        : `${v.priceModifier.toFixed(2)} €`}
                                                            </Text>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        {/* ATTRIBUTI */}
                        {displayItem.attributes && displayItem.attributes.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                                {displayItem.attributes.map((a, idx) => {
                                    if (!a.value || a.value.trim() === "") return null;
                                    return (
                                        <Text key={idx} variant="body-sm" color="var(--pub-surface-text-muted)">
                                            <strong>{a.label}:</strong> {a.value}
                                        </Text>
                                    );
                                })}
                            </div>
                        )}

                        {/* ALLERGENI */}
                        {displayItem.allergens && displayItem.allergens.length > 0 && (
                            <div className={styles.allergenSection}>
                                <Text variant="body-sm" weight={700} className={styles.allergenSectionLabel} color="var(--pub-surface-text)">
                                    Allergeni
                                </Text>
                                <div className={styles.allergenBadges}>
                                    {displayItem.allergens.map(a => (
                                        <span key={a.id} className={styles.allergenBadge}>
                                            <AllergenIcon code={a.code} size={14} variant="bare" />
                                            {a.label_it}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* INGREDIENTI */}
                        {displayItem.ingredients && displayItem.ingredients.length > 0 && (
                            <div className={styles.ingredientSection}>
                                <Text variant="body-sm" weight={700} className={styles.ingredientSectionLabel} color="var(--pub-surface-text)">
                                    Ingredienti
                                </Text>
                                <Text variant="body-sm" className={styles.ingredientList} color="var(--pub-surface-text-muted)">
                                    {displayItem.ingredients.map(i => i.name).join(", ")}
                                </Text>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Sticky CTA bar — solo in modalità pubblica con addToSelection */}
            {onAddToSelection && (
                <div className={styles.addToSelectionBar}>
                    <button
                        type="button"
                        className={styles.addToSelectionBtn}
                        disabled={isAddDisabled}
                        onClick={handleAddToSelection}
                    >
                        {isAddDisabled ? (
                            "Scegli un formato per continuare"
                        ) : (
                            <>
                                <span>{submitLabel}</span>
                                <span>€ {computedPrice.toFixed(2)}</span>
                            </>
                        )}
                    </button>
                </div>
            )}
        </PublicSheet>
    );
}
