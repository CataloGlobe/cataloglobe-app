import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/Button/Button";
import type {
    ResolvedOptionGroup,
    ResolvedOptionValue,
    ResolvedProduct
} from "@/services/supabase/resolveActivityCatalogs";

import type { SelectionItem } from "../CreateOrderDrawer";

import styles from "./ItemConfigurator.module.scss";

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

function formatDelta(n: number): string {
    if (n === 0) return "";
    const sign = n > 0 ? "+" : "−";
    return `${sign} ${formatEur(Math.abs(n))}`;
}

const ITEM_NOTE_MAX_LEN = 140;

export interface ItemConfiguratorProps {
    product: ResolvedProduct;
    onCancel: () => void;
    onAdd: (item: SelectionItem) => void;
}

export function ItemConfigurator({ product, onCancel, onAdd }: ItemConfiguratorProps) {
    const primaryGroup: ResolvedOptionGroup | undefined = useMemo(
        () => (product.optionGroups ?? []).find(g => g.group_kind === "PRIMARY_PRICE"),
        [product.optionGroups]
    );

    const addonGroups: ResolvedOptionGroup[] = useMemo(
        () => (product.optionGroups ?? []).filter(g => g.group_kind === "ADDON"),
        [product.optionGroups]
    );

    const [primaryValueId, setPrimaryValueId] = useState<string | undefined>(() => {
        if (!primaryGroup || (primaryGroup.values ?? []).length === 0) return undefined;
        return primaryGroup.values[0]?.id;
    });

    const [selectedAddonIds, setSelectedAddonIds] = useState<Record<string, string[]>>({});
    const [qty, setQty] = useState<number>(1);
    const [note, setNote] = useState<string>("");

    const primaryValue: ResolvedOptionValue | undefined = useMemo(() => {
        if (!primaryGroup || !primaryValueId) return undefined;
        return (primaryGroup.values ?? []).find(v => v.id === primaryValueId);
    }, [primaryGroup, primaryValueId]);

    const basePrice: number = useMemo(() => {
        if (primaryValue && primaryValue.absolute_price != null) {
            return Number(primaryValue.absolute_price);
        }
        if (product.price != null) return Number(product.price);
        return 0;
    }, [primaryValue, product.price]);

    const addonsDelta: number = useMemo(() => {
        let delta = 0;
        for (const group of addonGroups) {
            const ids = selectedAddonIds[group.id] ?? [];
            for (const id of ids) {
                const v = (group.values ?? []).find(x => x.id === id);
                if (!v) continue;
                if (v.price_modifier != null) delta += Number(v.price_modifier);
                else if (v.absolute_price != null) delta += Number(v.absolute_price);
            }
        }
        return delta;
    }, [addonGroups, selectedAddonIds]);

    const unitPrice = basePrice + addonsDelta;
    const totalPrice = unitPrice * qty;

    function toggleAddon(groupId: string, valueId: string, maxSelectable: number | null): void {
        setSelectedAddonIds(prev => {
            const current = prev[groupId] ?? [];
            const isSelected = current.includes(valueId);
            if (isSelected) {
                return { ...prev, [groupId]: current.filter(id => id !== valueId) };
            }
            if (maxSelectable != null && current.length >= maxSelectable) {
                return { ...prev, [groupId]: [...current.slice(1), valueId] };
            }
            return { ...prev, [groupId]: [...current, valueId] };
        });
    }

    function handleAdd(): void {
        if (primaryGroup && primaryGroup.is_required && !primaryValueId) return;
        const addonIds: string[] = [];
        const addonLabels: string[] = [];
        for (const group of addonGroups) {
            const ids = selectedAddonIds[group.id] ?? [];
            for (const id of ids) {
                const v = (group.values ?? []).find(x => x.id === id);
                if (!v) continue;
                addonIds.push(v.id);
                addonLabels.push(v.name);
            }
        }
        const trimmedNote = note.trim();
        const item: SelectionItem = {
            rowId:
                typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `${product.id}-${Date.now()}-${Math.random()}`,
            product_id: product.id,
            product_name: product.name,
            addon_value_ids: addonIds,
            addon_labels: addonLabels,
            qty,
            unitPrice
        };
        if (primaryValue) {
            item.primary_option_value_id = primaryValue.id;
            item.primary_option_label = primaryValue.name;
        }
        if (trimmedNote.length > 0) {
            item.item_notes = trimmedNote;
        }
        onAdd(item);
    }

    const canAdd =
        qty > 0 &&
        (!primaryGroup || !primaryGroup.is_required || primaryValueId != null);

    return (
        <div className={styles.wrapper}>
            {primaryGroup && (primaryGroup.values ?? []).length > 0 && (
                <div className={styles.group}>
                    <div className={styles.groupTitle}>{primaryGroup.name}</div>
                    {(primaryGroup.values ?? []).map(v => {
                        const checked = primaryValueId === v.id;
                        const priceLabel =
                            v.absolute_price != null
                                ? formatEur(Number(v.absolute_price))
                                : "";
                        return (
                            <label
                                key={v.id}
                                className={
                                    checked ? styles.optionRowActive : styles.optionRow
                                }
                            >
                                <span className={styles.optionLabel}>
                                    <input
                                        type="radio"
                                        name={`primary-${primaryGroup.id}`}
                                        checked={checked}
                                        onChange={() => setPrimaryValueId(v.id)}
                                        className={styles.optionInput}
                                    />
                                    <span>{v.name}</span>
                                </span>
                                {priceLabel && (
                                    <span className={styles.optionPrice}>{priceLabel}</span>
                                )}
                            </label>
                        );
                    })}
                </div>
            )}

            {addonGroups.map(group => {
                const selected = selectedAddonIds[group.id] ?? [];
                return (
                    <div key={group.id} className={styles.group}>
                        <div className={styles.groupTitle}>
                            {group.name}
                            {group.max_selectable != null && (
                                <span className={styles.groupTitleHint}>
                                    max {group.max_selectable}
                                </span>
                            )}
                        </div>
                        {(group.values ?? []).map(v => {
                            const isChecked = selected.includes(v.id);
                            const delta =
                                v.price_modifier != null
                                    ? Number(v.price_modifier)
                                    : v.absolute_price != null
                                      ? Number(v.absolute_price)
                                      : 0;
                            return (
                                <label
                                    key={v.id}
                                    className={
                                        isChecked ? styles.optionRowActive : styles.optionRow
                                    }
                                >
                                    <span className={styles.optionLabel}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() =>
                                                toggleAddon(group.id, v.id, group.max_selectable)
                                            }
                                            className={styles.optionInput}
                                        />
                                        <span>{v.name}</span>
                                    </span>
                                    {delta !== 0 && (
                                        <span className={styles.optionPrice}>
                                            {formatDelta(delta)}
                                        </span>
                                    )}
                                </label>
                            );
                        })}
                    </div>
                );
            })}

            <div className={styles.group}>
                <div className={styles.groupTitle}>Nota</div>
                <textarea
                    value={note}
                    onChange={e => {
                        const next = e.target.value.slice(0, ITEM_NOTE_MAX_LEN);
                        setNote(next);
                    }}
                    placeholder="Es. senza cipolla, ben cotto..."
                    className={styles.noteInput}
                    maxLength={ITEM_NOTE_MAX_LEN}
                    rows={2}
                />
                <div className={styles.noteHint}>
                    {note.length}/{ITEM_NOTE_MAX_LEN}
                </div>
            </div>

            <div className={styles.qtyBlock}>
                <div className={styles.groupTitle}>Quantita'</div>
                <div className={styles.qtyStepper}>
                    <button
                        type="button"
                        className={styles.qtyButton}
                        onClick={() => setQty(q => Math.max(1, q - 1))}
                        disabled={qty <= 1}
                        aria-label="Diminuisci quantita'"
                    >
                        <Minus size={16} />
                    </button>
                    <span className={styles.qtyValue}>{qty}</span>
                    <button
                        type="button"
                        className={styles.qtyButton}
                        onClick={() => setQty(q => q + 1)}
                        aria-label="Aumenta quantita'"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            <div className={styles.actions}>
                <Button variant="ghost" size="sm" onClick={onCancel}>
                    Annulla
                </Button>
                <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAdd}
                    disabled={!canAdd}
                >
                    Aggiungi · {formatEur(totalPrice)}
                </Button>
            </div>
        </div>
    );
}
