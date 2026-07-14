import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Package, ScrollText, X } from "lucide-react";
import { IconLink } from "@tabler/icons-react";
import Text from "@/components/ui/Text/Text";
import AllergenIcon from "@/components/ui/AllergenIcon/AllergenIcon";
import CharacteristicIcon from "@/components/ui/CharacteristicIcon/CharacteristicIcon";
import PublicSheet from "../PublicSheet/PublicSheet";
import PairingDetailCard from "../PairingDetailCard/PairingDetailCard";
import styles from "./ItemDetail.module.scss";
import type { CollectionViewSectionItem } from "../CollectionView/CollectionView";
import type { SelectedAddon, SelectedFormat } from "../OrderingSheet/OrderingSheet";

type Props = {
    item: CollectionViewSectionItem | null;
    /**
     * Contatore incrementato dal parent ad OGNI apertura (anche se l'item è lo stesso).
     * Necessario perché React bailoutta `setSelectedItem(stessoRef)` → contentKey
     * basato solo su item.id non cambierebbe → close-interruption non scatterebbe per
     * riapertura A→A durante la chiusura.
     */
    openSeq?: number;
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
    /**
     * Se true: ordinazione sospesa (es. tavolo chiuso o table_maintenance).
     * La CTA resta visibile ma disabilitata, etichetta sostituita con
     * "Ordinazioni sospese". Il dettaglio prodotto resta leggibile.
     */
    orderingDisabled?: boolean;
    /** Reverse-link storia (sub-fase 6): apre il lettore sulla storia collegata
     *  (chiude questo detail + switch tab Storia, gestito dal parent). Assente
     *  → nessuna card rimando anche se item.story_ref è presente. */
    onOpenStory?: (storyId: string) => void;
    /**
     * Universale (entrambe le modalità): tap sul corpo della card "Perfetto
     * con" naviga al dettaglio completo dell'abbinato (swap contenuto nella
     * stessa sheet, nessuna sheet impilata). Assente → card non cliccabile.
     */
    onOpenPairing?: (productId: string) => void;
    /** Etichetta breadcrumb "Torna a {label}", visibile solo se si è arrivati
     *  qui navigando da un abbinamento (stack non vuoto). */
    pairingBackLabel?: string;
    /** Click sul breadcrumb "Torna a" — pop dello stack lato parent. */
    onPairingBack?: () => void;
    /**
     * Ramo CON ordinazioni: quick-add diretto di un abbinato NON configurabile
     * — bottone "+" separato dal tap-to-navigate del corpo card (stopPropagation
     * interno). Stesso meccanismo dell'upsell post-aggiunta. Abbinati
     * configurabili non ricevono questo bottone: il tap sul corpo naviga al
     * loro detail, dove l'utente configura e aggiunge normalmente.
     */
    onAddPairing?: (productId: string) => void;
    /** Abbinato configurabile (ha optionGroups) → niente bottone "+", solo
     *  tap-to-navigate (via `onOpenPairing`). */
    isPairingConfigurable?: (productId: string) => boolean;
    /** Abbinato già in selezione → card mostra "✓ Aggiunto" al posto del "+". */
    isPairingAdded?: (productId: string) => boolean;
};

export default function ItemDetail({
    item,
    openSeq,
    isOpen,
    onClose,
    mode,
    onAddToSelection,
    initialFormat,
    initialAddons,
    submitLabel,
    showImage = true,
    orderingDisabled = false,
    onOpenStory,
    onOpenPairing,
    pairingBackLabel,
    onPairingBack,
    onAddPairing,
    isPairingConfigurable,
    isPairingAdded
}: Props) {
    const { t } = useTranslation("public");
    const submitLabelResolved = submitLabel ?? t("item_detail.submit_default");
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

    // ── Warm della cache immagini al mount/cambio item ───────────────────────
    // Il fetch parte subito, in parallelo all'animazione d'entrata: anticipa il
    // lazy-loading nativo (thumb storia/pairing sotto il fold del body scrollabile
    // partirebbero solo allo scroll) — niente pop-in su rete lenta (4G in sala).
    // Prefetch limitato a ciò che verrà davvero renderizzato (stesse condizioni
    // dei rispettivi blocchi JSX): niente banda sprecata.
    useEffect(() => {
        if (!item) return;
        const urls = [
            showImage && mode === "public" ? item.image : null,
            onOpenStory ? item.story_ref?.cover : null,
            ...(showImage ? (item.pairings ?? []).map(p => p.imageUrl) : []),
        ];
        for (const url of urls) {
            if (!url) continue;
            const img = new Image();
            img.decoding = "async";
            img.src = url;
        }
    }, [item, showImage, mode, onOpenStory]);

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
        // Niente onClose() qui: il parent (onAddToSelection) decide l'esito —
        // chiudere, o tornare al padre se raggiunto via "Perfetto con"
        // (pairingBackStack). Chiamarlo qui sovrascriverebbe quella scelta
        // (stessa batch React, ultimo setSelectedItem vince).
        onAddToSelection(displayItem.id, displayItem.name, basePrice, format, addons);
    };

    if (!displayItem) return null;

    const shouldShowImage = showImage && mode === "public" && !!displayItem.image;
    const displayPrice = displayItem.effective_price ?? displayItem.price;

    return (
        <PublicSheet
            isOpen={isOpen}
            onClose={onClose}
            contentKey={item ? `${item.id}:${openSeq ?? 0}` : undefined}
            ariaLabel={displayItem.name}
            headerContent={
                <div className={styles.header}>
                    <div className={styles.headerTitleBlock}>
                        {/* BREADCRUMB "Torna a" — solo se aperto navigando da un
                            abbinamento (stack non vuoto lato parent). Riga piccola
                            sopra il titolo: prima da dove vieni, poi dove sei. */}
                        {pairingBackLabel && onPairingBack && (
                            <button
                                type="button"
                                className={styles.pairingBackBtn}
                                onClick={onPairingBack}
                            >
                                <ChevronLeft size={16} strokeWidth={2.5} />
                                {t("item_detail.pairing_back", { name: pairingBackLabel })}
                            </button>
                        )}
                        <Text as="h2" variant="title-md" weight={700} className={styles.headerTitle} color="var(--pub-surface-text)">
                            {displayItem.name}
                        </Text>
                    </div>
                    <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t("item_detail.close_aria")}>
                        {t("selection.close_label")}
                    </button>
                </div>
            }
        >
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
                                decoding="async"
                                width={1600}
                                height={900}
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
                                            {t("product.price_from", { price: `€ ${displayItem.original_price.toFixed(2)}` })}
                                        </span>
                                    )}
                                    <span className={styles.priceCurrent}>
                                        {t("product.price_from", { price: `€ ${displayItem.from_price.toFixed(2)}` })}
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
                                            <span className={styles.requiredBadge}>{t("product.required")}</span>
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

                        {/* ABBINAMENTI — consiglio "Perfetto con", dopo la descrizione,
                            prima del meta. Resa identica con ordinazione ON/OFF. */}
                        {displayItem.pairings && displayItem.pairings.length > 0 && (
                            <div className={styles.pairingSection}>
                                <Text
                                    variant="body-sm"
                                    weight={700}
                                    className={styles.pairingSectionLabel}
                                    color="var(--pub-surface-text)"
                                >
                                    <IconLink size={14} className={styles.pairingSectionIcon} />
                                    {t("product.pairing_prefix")}
                                </Text>
                                <div className={styles.pairingCards}>
                                    {displayItem.pairings.map(p => (
                                        <PairingDetailCard
                                            key={p.id}
                                            pairing={p}
                                            showThumbnail={showImage}
                                            isAdded={isPairingAdded?.(p.id) ?? false}
                                            isConfigurable={isPairingConfigurable?.(p.id) ?? false}
                                            onAdd={
                                                onAddPairing && !(isPairingConfigurable?.(p.id) ?? false)
                                                    ? () => onAddPairing(p.id)
                                                    : undefined
                                            }
                                            onOpenPairing={
                                                onOpenPairing ? () => onOpenPairing(p.id) : undefined
                                            }
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* RIMANDO STORIA — reverse-link (sub-fase 6), card simmetrica del
                            "Dal menu → prodotto" nel lettore storia. Assente se il prodotto
                            non ha una storia collegata (o onOpenStory non fornito, es. preview). */}
                        {displayItem.story_ref && onOpenStory && (
                            <button
                                type="button"
                                className={styles.storyLinkCard}
                                onClick={() => onOpenStory(displayItem.story_ref!.id)}
                            >
                                {displayItem.story_ref.cover ? (
                                    <img
                                        src={displayItem.story_ref.cover}
                                        alt=""
                                        className={styles.storyLinkThumb}
                                        loading="lazy"
                                        decoding="async"
                                        width={44}
                                        height={44}
                                    />
                                ) : (
                                    <div className={styles.storyLinkThumbPlaceholder}>
                                        <ScrollText size={18} strokeWidth={1.5} />
                                    </div>
                                )}
                                <div className={styles.storyLinkBody}>
                                    <span className={styles.storyLinkLabel}>
                                        {t("story.discover_label")}
                                    </span>
                                    <Text
                                        variant="body-sm"
                                        weight={700}
                                        className={styles.storyLinkTitle}
                                        color="var(--pub-surface-text)"
                                    >
                                        {displayItem.story_ref.title}
                                    </Text>
                                </div>
                                <ChevronRight size={18} className={styles.storyLinkArrow} />
                            </button>
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
                                                            {t("product.max_select", { count: group.maxSelectable })}
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
                                                                            ? t("product.included")
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
                                                                    ? t("product.included")
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

                        {/* ALLERGENI */}
                        {displayItem.allergens && displayItem.allergens.length > 0 && (
                            <div className={styles.allergenSection}>
                                <Text variant="body-sm" weight={700} className={styles.allergenSectionLabel} color="var(--pub-surface-text)">
                                    {t("allergens.title")}
                                </Text>
                                <div className={styles.allergenBadges}>
                                    {displayItem.allergens.map(a => (
                                        <span key={a.id} className={styles.allergenBadge}>
                                            <AllergenIcon code={a.code} size={14} variant="bare" />
                                            {a.label}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* CARATTERISTICHE — flat layout, sort_order from server */}
                        {displayItem.characteristics && displayItem.characteristics.length > 0 && (
                            <div className={styles.characteristicSection}>
                                <Text variant="body-sm" weight={700} className={styles.characteristicSectionLabel} color="var(--pub-surface-text)">
                                    {t("characteristics.title")}
                                </Text>
                                <div className={styles.characteristicBadges}>
                                    {displayItem.characteristics.map(c => (
                                        <span key={c.id} className={styles.characteristicBadge}>
                                            <CharacteristicIcon icon={c.icon} size={14} variant="bare" />
                                            {c.label}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* INGREDIENTI */}
                        {displayItem.ingredients && displayItem.ingredients.length > 0 && (
                            <div className={styles.ingredientSection}>
                                <Text variant="body-sm" weight={700} className={styles.ingredientSectionLabel} color="var(--pub-surface-text)">
                                    {t("product.ingredients")}
                                </Text>
                                <Text variant="body-sm" className={styles.ingredientList} color="var(--pub-surface-text-muted)">
                                    {displayItem.ingredients.map(i => i.name).join(", ")}
                                </Text>
                            </div>
                        )}

                        {/* INFORMAZIONI — note libere {label, value} dichiarate dal ristoratore */}
                        {displayItem.notes && displayItem.notes.length > 0 && (
                            <div className={styles.notesSection}>
                                <Text variant="body-sm" weight={700} className={styles.notesSectionLabel} color="var(--pub-surface-text)">
                                    {t("info.title")}
                                </Text>
                                <dl className={styles.notesList}>
                                    {displayItem.notes.map((note, idx) => (
                                        <div key={idx} className={styles.notesRow}>
                                            <dt className={styles.notesLabel}>{note.label}</dt>
                                            <dd className={styles.notesValue}>{note.value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </div>
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
                    </div>
                </div>
            </div>

            {/* Sticky CTA bar — solo in modalità pubblica con addToSelection */}
            {onAddToSelection && (
                <div className={styles.addToSelectionBar}>
                    <button
                        type="button"
                        className={styles.addToSelectionBtn}
                        disabled={isAddDisabled || orderingDisabled}
                        onClick={orderingDisabled ? undefined : handleAddToSelection}
                    >
                        {orderingDisabled ? (
                            t("ordering.suspended")
                        ) : isAddDisabled ? (
                            t("item_detail.format_required")
                        ) : (
                            <>
                                <span>{submitLabelResolved}</span>
                                <span>€ {computedPrice.toFixed(2)}</span>
                            </>
                        )}
                    </button>
                </div>
            )}
        </PublicSheet>
    );
}
