import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { CatalogType } from "@/types/catalog";
import { ItemCategory } from "@/types/database";
import { listItemCategories } from "@/services/supabase/collections";
import { ITEM_FORM_CONFIG, ItemFormField } from "@/domain/catalog/itemFormConfig";
import { Button } from "@/components/ui";
import { TextInput } from "@/components/ui/Input/TextInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { createItemCategory } from "@/services/supabase/categories";
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

        const [isCreatingCategory, setIsCreatingCategory] = useState(false);
        const [newCategoryName, setNewCategoryName] = useState("");
        const [isSavingCategory, setIsSavingCategory] = useState(false);

        const config = ITEM_FORM_CONFIG[collectionType];
        const hasField = (field: ItemFormField) => config.fields.includes(field);

        const isRequired = (field: ItemFormField) => config.required.includes(field);

        const filteredCategories = categories.filter(cat => cat.type === collectionType);

        useEffect(() => {
            listItemCategories().then(setCategories).catch(console.error);
        }, []);

        useEffect(() => {
            setCategoryId("");
            setIsCreatingCategory(false);
            setNewCategoryName("");
        }, [collectionType]);

        useImperativeHandle(ref, () => ({
            submit: async () => {
                const missingName = isRequired("name") && !name.trim();
                const missingCategory = isRequired("category") && !categoryId;
                const missingPrice = isRequired("price") && !basePrice;
                const missingDuration = isRequired("duration") && !duration;

                if (missingName || missingCategory || missingPrice || missingDuration) return;

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

        async function handleCreateCategory() {
            if (!newCategoryName.trim()) return;

            try {
                setIsSavingCategory(true);

                const category = await createItemCategory({
                    name: newCategoryName.trim(),
                    type: collectionType
                });

                // aggiorna lista locale
                setCategories(prev => [...prev, category]);

                // seleziona automaticamente
                setCategoryId(category.id);

                // reset UI
                setNewCategoryName("");
                setIsCreatingCategory(false);
            } catch (error) {
                console.error("Errore creazione categoria", error);
            } finally {
                setIsSavingCategory(false);
            }
        }

        return (
            <div className={styles.form} aria-label="Crea nuovo elemento">
                <div className={styles.fields}>
                    {hasField("name") && (
                        <div className={styles.field}>
                            <Text variant="caption" weight={600}>
                                Nome {isRequired("name") ? "*" : ""}
                            </Text>

                            <TextInput
                                value={name}
                                onChange={e => setName(e.target.value)}
                                autoFocus
                                required={isRequired("name")}
                            />
                        </div>
                    )}

                    {hasField("category") && (
                        <div className={styles.field}>
                            <Text variant="caption" weight={600}>
                                Categoria {isRequired("category") ? "*" : ""}
                            </Text>

                            <select
                                value={categoryId}
                                onChange={e => setCategoryId(e.target.value)}
                                required={isRequired("category")}
                            >
                                <option value="">Seleziona una categoria</option>
                                {filteredCategories.map(cat => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>

                            {filteredCategories.length === 0 && (
                                <Text variant="caption" colorVariant="muted">
                                    Nessuna categoria per questo tipo. Creane una nuova.
                                </Text>
                            )}

                            <Button
                                variant="ghost"
                                label={" + Crea nuova categoria"}
                                onClick={() => setIsCreatingCategory(true)}
                            ></Button>

                            {isCreatingCategory && (
                                <div className={styles.inlineCategory}>
                                    <TextInput
                                        label="Nome nuova categoria"
                                        value={newCategoryName}
                                        onChange={e => setNewCategoryName(e.target.value)}
                                        autoFocus
                                    />

                                    <div className={styles.actions}>
                                        <Button
                                            label={"Crea"}
                                            disabled={!newCategoryName || isSavingCategory}
                                            onClick={handleCreateCategory}
                                        ></Button>

                                        <Button
                                            label="Annulla"
                                            variant="ghost"
                                            onClick={() => {
                                                setIsCreatingCategory(false);
                                                setNewCategoryName("");
                                            }}
                                        ></Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {hasField("description") && (
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
                    )}

                    {hasField("price") && (
                        <div className={styles.field}>
                            <NumberInput
                                label="Prezzo"
                                step="0.01"
                                value={basePrice}
                                onChange={e => setBasePrice(e.target.value)}
                                required={isRequired("price")}
                                endAdornment="€"
                            />
                        </div>
                    )}

                    {hasField("duration") && (
                        <div className={styles.field}>
                            <NumberInput
                                label="Durata (minuti)"
                                value={duration}
                                onChange={e => setDuration(e.target.value)}
                                required={isRequired("duration")}
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
