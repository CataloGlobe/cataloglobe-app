import { forwardRef, useImperativeHandle, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { Item } from "@/types/database";
import { CatalogType } from "@/types/catalog";
import styles from "./EditItemDrawer.module.scss";

export interface EditItemDrawerRef {
    submit: () => Promise<void>;
}

interface EditItemDrawerProps {
    item: Item;
    collectionType: CatalogType;
    onSubmit: (data: {
        id: string;
        name: string;
        description?: string;
        base_price?: number;
        duration?: number;
    }) => Promise<void>;
}

export const EditItemDrawer = forwardRef<EditItemDrawerRef, EditItemDrawerProps>(
    function EditItemDrawer({ item, collectionType, onSubmit }, ref) {
        const [name, setName] = useState(item.name);
        const [description, setDescription] = useState(item.description ?? "");
        const [basePrice, setBasePrice] = useState(
            item.base_price != null ? String(item.base_price) : ""
        );
        const [duration, setDuration] = useState(
            item.duration != null ? String(item.duration) : ""
        );
        const [loading, setLoading] = useState(false);

        useImperativeHandle(ref, () => ({
            submit: async () => {
                if (!name.trim()) return;

                setLoading(true);
                try {
                    await onSubmit({
                        id: item.id,
                        name: name.trim(),
                        description: description || undefined,
                        base_price: basePrice ? Number(basePrice) : undefined,
                        duration:
                            collectionType === "services" && duration ? Number(duration) : undefined
                    });
                } finally {
                    setLoading(false);
                }
            }
        }));

        return (
            <div className={styles.form} aria-label="Modifica elemento">
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
