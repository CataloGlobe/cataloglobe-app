import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { CatalogType } from "@/types/catalog";
import { ItemCategory } from "@/types/database";
import { listItemCategories } from "@/services/supabase/collections";
import styles from "./CreateItemDrawer.module.scss";

export interface CreateItemDrawerRef {
    submit: () => Promise<void>;
}

interface CreateItemDrawerProps {
    collectionType: CatalogType;
    onSubmit: (data: {
        name: string;
        description?: string;
        base_price?: number;
        duration?: number;
        type: CatalogType;
        category_id: string;
    }) => Promise<void>;
}

export const CreateItemDrawer = forwardRef<CreateItemDrawerRef, CreateItemDrawerProps>(
    function CreateItemDrawer({ collectionType, onSubmit }, ref) {
        const [name, setName] = useState("");
        const [description, setDescription] = useState("");
        const [basePrice, setBasePrice] = useState("");
        const [duration, setDuration] = useState("");
        const [categoryId, setCategoryId] = useState("");
        const [categories, setCategories] = useState<ItemCategory[]>([]);
        const [loading, setLoading] = useState(false);

        useEffect(() => {
            listItemCategories().then(setCategories).catch(console.error);
        }, []);

        useImperativeHandle(ref, () => ({
            submit: async () => {
                if (!name.trim() || !categoryId) return;

                setLoading(true);
                try {
                    await onSubmit({
                        name: name.trim(),
                        description: description || undefined,
                        base_price: basePrice ? Number(basePrice) : undefined,
                        duration: duration ? Number(duration) : undefined,
                        type: collectionType,
                        category_id: categoryId
                    });
                } finally {
                    setLoading(false);
                }
            }
        }));

        return (
            <div className={styles.form} aria-label="Crea nuovo elemento">
                <div className={styles.fields}>
                    <div className={styles.field}>
                        <Text variant="caption" weight={600}>
                            Nome *
                        </Text>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            autoFocus
                            required
                        />
                    </div>

                    <div className={styles.field}>
                        <Text variant="caption" weight={600}>
                            Categoria *
                        </Text>

                        <select
                            value={categoryId}
                            onChange={e => setCategoryId(e.target.value)}
                            required
                        >
                            <option value="">Seleziona una categoria</option>

                            {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.field}>
                        <Text variant="caption" weight={600}>
                            Descrizione
                        </Text>
                        <textarea
                            rows={3}
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                        />
                    </div>

                    <div className={styles.field}>
                        <Text variant="caption" weight={600}>
                            Prezzo
                        </Text>
                        <input
                            type="number"
                            step="0.01"
                            value={basePrice}
                            onChange={e => setBasePrice(e.target.value)}
                        />
                    </div>

                    {collectionType === "services" && (
                        <div className={styles.field}>
                            <Text variant="caption" weight={600}>
                                Durata (minuti)
                            </Text>
                            <input
                                type="number"
                                value={duration}
                                onChange={e => setDuration(e.target.value)}
                            />
                        </div>
                    )}
                </div>

                {loading && (
                    <Text variant="caption" colorVariant="muted">
                        Salvataggio…
                    </Text>
                )}
            </div>
        );
    }
);
