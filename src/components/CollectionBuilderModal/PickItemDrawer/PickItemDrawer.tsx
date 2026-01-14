import { useEffect, useMemo, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { ItemWithCategory } from "@/types/database";
import { CatalogType } from "@/types/catalog";
import { listItems } from "@/services/supabase/collections";
import styles from "./PickItemDrawer.module.scss";

type Diff = {
    add: string[];
    remove: string[];
};

type Props = {
    collectionType: CatalogType;
    existingItemIds: Set<string>;
    onChange: (diff: Diff) => void;
};

export function PickItemDrawer({ collectionType, existingItemIds, onChange }: Props) {
    const [items, setItems] = useState<ItemWithCategory[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(existingItemIds));
    const [search, setSearch] = useState("");

    /* load items */
    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            const data = await listItems(collectionType);
            if (!cancelled) setItems(data);
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [collectionType]);

    const filteredItems = useMemo(() => {
        if (!search.trim()) return items;

        const q = search.toLowerCase();
        return items.filter(item => item.name.toLowerCase().includes(q));
    }, [items, search]);

    /* group by category */
    const grouped = useMemo(() => {
        const map = new Map<string, ItemWithCategory[]>();

        for (const item of filteredItems) {
            const key = item.category.name;
            const arr = map.get(key) ?? [];
            arr.push(item);
            map.set(key, arr);
        }

        return map;
    }, [filteredItems]);

    /* toggle item */
    const toggleItem = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);

            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
    };

    /* toggle all in category */
    const toggleAllInCategory = (items: ItemWithCategory[]) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            const allSelected = items.every(item => next.has(item.id));

            for (const item of items) {
                if (allSelected) {
                    next.delete(item.id);
                } else {
                    next.add(item.id);
                }
            }

            return next;
        });
    };

    /* diff */
    const diff = useMemo<Diff>(() => {
        return {
            add: [...selectedIds].filter(id => !existingItemIds.has(id)),
            remove: [...existingItemIds].filter(id => !selectedIds.has(id))
        };
    }, [selectedIds, existingItemIds]);

    useEffect(() => {
        onChange(diff);
    }, [diff, onChange]);

    return (
        <div className={styles.wrapper}>
            <div className={styles.search}>
                <SearchInput
                    placeholder="Cerca elemento…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    aria-label="Cerca elemento nel catalogo"
                />
            </div>

            {Array.from(grouped.entries()).map(([category, items]) => {
                const allSelected = items.every(i => selectedIds.has(i.id));

                return (
                    <section key={category} className={styles.category}>
                        <div className={styles.categoryHeader}>
                            <Text variant="caption" weight={600}>
                                {category}
                            </Text>

                            <button
                                type="button"
                                className={styles.toggleAll}
                                onClick={() => toggleAllInCategory(items)}
                            >
                                {allSelected ? "Deseleziona tutti" : "Seleziona tutti"}
                            </button>
                        </div>

                        <ul className={styles.list}>
                            {items.map(item => {
                                const checked = selectedIds.has(item.id);
                                const alreadyInCollection = existingItemIds.has(item.id);

                                return (
                                    <li key={item.id}>
                                        <label className={styles.row}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleItem(item.id)}
                                            />
                                            <Text className={styles.itemName}>{item.name}</Text>

                                            {alreadyInCollection && (
                                                <Text variant="caption" colorVariant="muted">
                                                    Presente
                                                </Text>
                                            )}
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}
