import { useState, useEffect, useCallback } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { Pill } from "@/components/ui/Pill/Pill";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import {
    listAllergens,
    getProductAllergens,
    setProductAllergens,
    V2SystemAllergen
} from "@/services/supabase/allergens";
import {
    listIngredients,
    getProductIngredients,
    setProductIngredients,
    createIngredient,
    V2Ingredient
} from "@/services/supabase/ingredients";
import { IngredientCombobox } from "@/pages/Dashboard/Products/components/IngredientCombobox";
import styles from "./ProductSpecsEditDrawer.module.scss";

interface ProductSpecsEditDrawerProps {
    open: boolean;
    onClose: () => void;
    productId: string;
    tenantId: string;
    onSuccess: () => void;
}

export function ProductSpecsEditDrawer({
    open,
    onClose,
    productId,
    tenantId,
    onSuccess
}: ProductSpecsEditDrawerProps) {
    const { showToast } = useToast();
    const verticalConfig = useVerticalConfig();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [systemAllergens, setSystemAllergens] = useState<V2SystemAllergen[]>([]);
    const [selectedAllergenIds, setSelectedAllergenIds] = useState<number[]>([]);

    const [systemIngredients, setSystemIngredients] = useState<V2Ingredient[]>([]);
    const [selectedIngredientIds, setSelectedIngredientIds] = useState<string[]>([]);

    const loadData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [allAllergens, assignedAllergenIds, allIngredients, assignedIngredients] =
                await Promise.all([
                    listAllergens(),
                    getProductAllergens(productId, tenantId),
                    listIngredients(tenantId),
                    getProductIngredients(productId)
                ]);
            setSystemAllergens(allAllergens);
            setSelectedAllergenIds(assignedAllergenIds);
            setSystemIngredients(allIngredients);
            setSelectedIngredientIds(assignedIngredients.map(i => i.ingredient_id));
        } catch {
            showToast({ message: "Errore nel caricamento delle specifiche", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [productId, tenantId, showToast]);

    useEffect(() => {
        if (open) {
            loadData();
        }
    }, [open, loadData]);

    const toggleAllergen = (id: number) => {
        setSelectedAllergenIds(prev =>
            prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
        );
    };

    const toggleIngredient = (id: string) => {
        setSelectedIngredientIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleCreateIngredient = async (name: string): Promise<string> => {
        const newIngredient = await createIngredient(tenantId, name);
        setSystemIngredients(prev => [...prev, newIngredient]);
        return newIngredient.id;
    };

    const handleSave = async () => {
        try {
            setIsSaving(true);
            await Promise.all([
                setProductAllergens(tenantId, productId, selectedAllergenIds),
                setProductIngredients(tenantId, productId, selectedIngredientIds)
            ]);
            onSuccess();
            onClose();
            showToast({ message: "Specifiche aggiornate", type: "success" });
        } catch {
            showToast({ message: "Errore nel salvataggio", type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={500}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Modifica specifiche prodotto
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSave}
                            loading={isSaving}
                            disabled={isSaving || isLoading}
                        >
                            Salva
                        </Button>
                    </>
                }
            >
                {isLoading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento specifiche...
                    </Text>
                ) : (
                    <div className={styles.content}>
                        {verticalConfig.hasAllergens && (
                            <div className={styles.specsField}>
                                <Text variant="body-sm" weight={600}>
                                    Allergeni
                                </Text>
                                <div className={styles.allergenGrid}>
                                    {systemAllergens.map(allergen => (
                                        <Pill
                                            key={allergen.id}
                                            label={allergen.label_it}
                                            active={selectedAllergenIds.includes(allergen.id)}
                                            onClick={() => toggleAllergen(allergen.id)}
                                            disabled={isSaving}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {verticalConfig.hasIngredients && (
                            <div className={styles.specsField}>
                                <Text variant="body-sm" weight={600}>
                                    Ingredienti
                                </Text>
                                <IngredientCombobox
                                    ingredients={systemIngredients}
                                    selectedIds={selectedIngredientIds}
                                    onToggle={toggleIngredient}
                                    onCreate={handleCreateIngredient}
                                    isLoadingIngredients={false}
                                />
                            </div>
                        )}
                    </div>
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}
