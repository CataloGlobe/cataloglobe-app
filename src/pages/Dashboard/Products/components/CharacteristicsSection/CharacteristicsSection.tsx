import { useCallback, useEffect, useMemo, useState } from "react";
import { Tag, RotateCw } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { Pill } from "@/components/ui/Pill/Pill";
import CharacteristicIcon from "@/components/ui/CharacteristicIcon/CharacteristicIcon";
import { listCharacteristics } from "@/services/supabase/productCharacteristics";
import type {
    ProductCharacteristic,
    ProductCharacteristicCategory
} from "@/types/productCharacteristic";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./CharacteristicsSection.module.scss";

interface CharacteristicsSectionProps {
    /** Tenant vertical (`food_beverage` | `retail` | `hotel` | `generic` | legacy aliases). */
    vertical?: string;
    /** Currently selected characteristic IDs. */
    value: string[];
    /** Emits the next selection. Mutex groups handled internally. */
    onChange: (next: string[]) => void;
    disabled?: boolean;
}

/**
 * Fixed display order for the 6 categories. Diet first as it carries the
 * primary dietary claims; spicy follows because mutex semantics differ;
 * origin/preparation/warning are descriptive metadata; status closes the
 * list as the most operational layer (chef pick, new, out_of_stock).
 */
export const CATEGORY_ORDER: ProductCharacteristicCategory[] = [
    "diet",
    "spicy",
    "origin",
    "preparation",
    "warning",
    "status"
];

export const CATEGORY_LABELS: Record<ProductCharacteristicCategory, string> = {
    diet: "Dieta",
    spicy: "Piccantezza",
    origin: "Origine e qualità",
    preparation: "Preparazione",
    warning: "Avvertenze",
    status: "Stato"
};

type LoadState =
    | { status: "loading" }
    | { status: "ready"; available: ProductCharacteristic[] }
    | { status: "empty" }
    | { status: "error"; message: string };

function groupByCategory(
    available: ProductCharacteristic[]
): Map<ProductCharacteristicCategory, ProductCharacteristic[]> {
    const map = new Map<ProductCharacteristicCategory, ProductCharacteristic[]>();
    for (const cat of CATEGORY_ORDER) {
        map.set(cat, []);
    }
    for (const c of available) {
        const list = map.get(c.category);
        if (list) list.push(c);
    }
    return map;
}

export default function CharacteristicsSection({
    vertical,
    value,
    onChange,
    disabled = false
}: CharacteristicsSectionProps) {
    const { showToast } = useToast();
    const [state, setState] = useState<LoadState>({ status: "loading" });
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setState({ status: "loading" });
        listCharacteristics(vertical)
            .then(rows => {
                if (cancelled) return;
                if (rows.length === 0) {
                    setState({ status: "empty" });
                } else {
                    setState({ status: "ready", available: rows });
                }
            })
            .catch(err => {
                if (cancelled) return;
                const message = err instanceof Error ? err.message : "Errore nel caricamento";
                setState({ status: "error", message });
                showToast({ message: "Errore nel caricamento delle caratteristiche.", type: "error" });
            });
        return () => {
            cancelled = true;
        };
    }, [vertical, reloadKey, showToast]);

    const valueSet = useMemo(() => new Set(value), [value]);

    const toggle = useCallback(
        (item: ProductCharacteristic) => {
            if (disabled) return;
            const isSelected = valueSet.has(item.id);

            if (isSelected) {
                onChange(value.filter(id => id !== item.id));
                return;
            }

            // Mutex group: replace any sibling currently selected in the same group.
            if (item.mutex_group && state.status === "ready") {
                const siblingIds = new Set(
                    state.available
                        .filter(c => c.mutex_group === item.mutex_group)
                        .map(c => c.id)
                );
                const next = value.filter(id => !siblingIds.has(id));
                next.push(item.id);
                onChange(next);
                return;
            }

            onChange([...value, item.id]);
        },
        [disabled, value, valueSet, onChange, state]
    );

    if (state.status === "loading") {
        return (
            <div className={styles.root} aria-busy="true">
                <Text variant="body-sm" colorVariant="muted">
                    Caricamento caratteristiche...
                </Text>
                <div className={styles.skeletonGrid}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={styles.skeletonChip} />
                    ))}
                </div>
            </div>
        );
    }

    if (state.status === "error") {
        return (
            <div className={styles.errorState}>
                <Text variant="body-sm" colorVariant="muted">
                    {state.message}
                </Text>
                <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<RotateCw size={14} />}
                    onClick={() => setReloadKey(k => k + 1)}
                >
                    Riprova
                </Button>
            </div>
        );
    }

    if (state.status === "empty") {
        return (
            <div className={styles.emptyState}>
                <span className={styles.emptyIcon} aria-hidden>
                    <Tag size={28} />
                </span>
                <Text variant="body" weight={600}>
                    Nessuna caratteristica disponibile
                </Text>
                <Text variant="body-sm" colorVariant="muted">
                    Le caratteristiche per il tuo settore non sono ancora disponibili.
                </Text>
            </div>
        );
    }

    const grouped = groupByCategory(state.available);

    return (
        <div className={styles.root}>
            {CATEGORY_ORDER.map(category => {
                const items = grouped.get(category) ?? [];
                if (items.length === 0) return null;
                const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
                const isMutex = sorted.some(s => s.mutex_group !== null);
                return (
                    <section key={category} className={styles.categorySection}>
                        <div className={styles.categoryHeader}>
                            <Text variant="body-sm" weight={700}>
                                {CATEGORY_LABELS[category]}
                            </Text>
                            {isMutex && (
                                <Text variant="caption" colorVariant="muted">
                                    Selezione singola
                                </Text>
                            )}
                        </div>
                        <div
                            className={styles.chipGrid}
                            role={isMutex ? "radiogroup" : "group"}
                            aria-label={CATEGORY_LABELS[category]}
                        >
                            {sorted.map(item => {
                                const active = valueSet.has(item.id);
                                return (
                                    <Pill
                                        key={item.id}
                                        label={item.label_it}
                                        icon={<CharacteristicIcon icon={item.icon} size={16} variant="bare" />}
                                        active={active}
                                        disabled={disabled}
                                        onClick={() => toggle(item)}
                                    />
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
