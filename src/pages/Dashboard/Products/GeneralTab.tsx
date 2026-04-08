import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/context/Toast/ToastContext";
import { V2Product } from "@/services/supabase/products";
import {
    ProductGroup,
    getProductGroups,
    getProductGroupAssignments
} from "@/services/supabase/productGroups";
import {
    listAllergens,
    getProductAllergens,
    V2SystemAllergen
} from "@/services/supabase/allergens";
import {
    listIngredients,
    getProductIngredients,
    V2Ingredient
} from "@/services/supabase/ingredients";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { ProductInfoEditDrawer } from "./ProductInfoEditDrawer";
import { ProductGroupsEditDrawer } from "./ProductGroupsEditDrawer";
import { ProductSpecsEditDrawer } from "./ProductSpecsEditDrawer";
import styles from "./GeneralTab.module.scss";

interface GeneralTabProps {
    product: V2Product;
    tenantId: string;
    onProductUpdated: (product: V2Product) => void;
}

export function GeneralTab({ product, tenantId, onProductUpdated }: GeneralTabProps) {
    const { showToast } = useToast();
    const navigate = useNavigate();
    const verticalConfig = useVerticalConfig();

    // --- Drawer states ---
    const [isInfoDrawerOpen, setIsInfoDrawerOpen] = useState(false);
    const [isGroupsDrawerOpen, setIsGroupsDrawerOpen] = useState(false);
    const [isSpecsDrawerOpen, setIsSpecsDrawerOpen] = useState(false);

    // --- Section B: Product Groups (view data) ---
    const [allGroups, setAllGroups] = useState<ProductGroup[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(true);
    const [assignedGroupIds, setAssignedGroupIds] = useState<Set<string>>(new Set());

    // --- Section C: Product Specs (view data) ---
    const [specsLoading, setSpecsLoading] = useState(true);
    const [systemAllergens, setSystemAllergens] = useState<V2SystemAllergen[]>([]);
    const [assignedAllergenIds, setAssignedAllergenIds] = useState<number[]>([]);
    const [systemIngredients, setSystemIngredients] = useState<V2Ingredient[]>([]);
    const [assignedIngredientIds, setAssignedIngredientIds] = useState<string[]>([]);

    const loadGroups = useCallback(async () => {
        try {
            setGroupsLoading(true);
            const [allG, assignments] = await Promise.all([
                getProductGroups(tenantId),
                getProductGroupAssignments(product.id)
            ]);
            setAllGroups(allG);
            setAssignedGroupIds(new Set(assignments.map(a => a.group_id)));
        } catch {
            showToast({ message: "Errore nel caricamento dei gruppi", type: "error" });
        } finally {
            setGroupsLoading(false);
        }
    }, [product.id, tenantId, showToast]);

    useEffect(() => { loadGroups(); }, [loadGroups]);

    const loadSpecs = useCallback(async () => {
        try {
            setSpecsLoading(true);
            const [allAllergens, allergenIds, allIngredients, assignedIngredients] =
                await Promise.all([
                    listAllergens(),
                    getProductAllergens(product.id, tenantId),
                    listIngredients(tenantId),
                    getProductIngredients(product.id)
                ]);
            setSystemAllergens(allAllergens);
            setAssignedAllergenIds(allergenIds);
            setSystemIngredients(allIngredients);
            setAssignedIngredientIds(assignedIngredients.map(i => i.ingredient_id));
        } catch {
            showToast({
                message: "Non è stato possibile caricare le specifiche del prodotto.",
                type: "error"
            });
        } finally {
            setSpecsLoading(false);
        }
    }, [product.id, tenantId, showToast]);

    useEffect(() => { loadSpecs(); }, [loadSpecs]);

    // --- Drawer success handlers ---
    const handleInfoSuccess = (updated: V2Product) => {
        onProductUpdated(updated);
    };

    const handleGroupsSuccess = async () => {
        await loadGroups();
    };

    const handleSpecsSuccess = async () => {
        await loadSpecs();
    };

    return (
        <div className={styles.root}>
            {/* Section A: Info */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <Text variant="title-sm" weight={600}>
                        Informazioni
                    </Text>
                    <Button variant="ghost" size="sm" onClick={() => setIsInfoDrawerOpen(true)}>
                        Modifica
                    </Button>
                </div>

                <div className={styles.infoDisplay}>
                    <div className={styles.infoRow}>
                        <Text variant="body-sm" colorVariant="muted">
                            Nome
                        </Text>
                        <Text variant="body">{product.name}</Text>
                    </div>
                    <div className={styles.infoRow}>
                        <Text variant="body-sm" colorVariant="muted">
                            Descrizione
                        </Text>
                        <Text variant="body" colorVariant={product.description ? undefined : "muted"}>
                            {product.description || "Nessuna descrizione"}
                        </Text>
                    </div>
                    <div className={styles.infoRow}>
                        <Text variant="body-sm" colorVariant="muted">
                            Immagine
                        </Text>
                        {product.image_url ? (
                            <img
                                src={product.image_url}
                                alt="Immagine prodotto"
                                className={styles.productThumbnail}
                            />
                        ) : (
                            <Text variant="body" colorVariant="muted">
                                Nessuna immagine
                            </Text>
                        )}
                    </div>
                </div>
            </section>

            <div className={styles.divider} />

            {/* Section B: Product Groups */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <Text variant="title-sm" weight={600}>
                        Gruppi prodotto
                    </Text>
                    {!groupsLoading && allGroups.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => setIsGroupsDrawerOpen(true)}>
                            Modifica
                        </Button>
                    )}
                </div>

                {groupsLoading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento gruppi...
                    </Text>
                ) : allGroups.length === 0 ? (
                    <div className={styles.emptyGroups}>
                        <Text variant="body-sm" colorVariant="muted">
                            Nessun gruppo disponibile.
                        </Text>
                        <button
                            className={styles.emptyLink}
                            onClick={() =>
                                navigate(`/business/${tenantId}/products?tab=groups`)
                            }
                        >
                            Crea un gruppo →
                        </button>
                    </div>
                ) : (
                    <div className={styles.groupsDisplay}>
                        {assignedGroupIds.size === 0 ? (
                            <Text variant="body" colorVariant="muted">
                                Nessun gruppo assegnato
                            </Text>
                        ) : (
                            <div className={styles.specsBadgeList}>
                                {allGroups
                                    .filter(g => assignedGroupIds.has(g.id))
                                    .map(g => (
                                        <span key={g.id} className={styles.groupBadge}>
                                            {g.name}
                                        </span>
                                    ))}
                            </div>
                        )}
                    </div>
                )}
            </section>

            {(verticalConfig.hasAllergens || verticalConfig.hasIngredients) && (
                <>
                    <div className={styles.divider} />

                    {/* Section C: Product Specs */}
                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <Text variant="title-sm" weight={600}>
                                Specifiche prodotto
                            </Text>
                            {!specsLoading && (
                                <Button variant="ghost" size="sm" onClick={() => setIsSpecsDrawerOpen(true)}>
                                    Modifica
                                </Button>
                            )}
                        </div>

                        {specsLoading ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento specifiche...
                            </Text>
                        ) : (
                            <div className={styles.specsDisplay}>
                                {verticalConfig.hasAllergens && (
                                    <div className={styles.specsRow}>
                                        <Text variant="body-sm" colorVariant="muted">
                                            Allergeni
                                        </Text>
                                        {assignedAllergenIds.length === 0 ? (
                                            <Text variant="body" colorVariant="muted">
                                                Nessun allergene specificato
                                            </Text>
                                        ) : (
                                            <div className={styles.specsBadgeList}>
                                                {systemAllergens
                                                    .filter(a => assignedAllergenIds.includes(a.id))
                                                    .map(a => (
                                                        <span key={a.id} className={styles.allergenBadge}>
                                                            {a.label_it}
                                                        </span>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {verticalConfig.hasIngredients && (
                                    <div className={styles.specsRow}>
                                        <Text variant="body-sm" colorVariant="muted">
                                            Ingredienti
                                        </Text>
                                        {assignedIngredientIds.length === 0 ? (
                                            <Text variant="body" colorVariant="muted">
                                                Nessun ingrediente specificato
                                            </Text>
                                        ) : (
                                            <div className={styles.specsBadgeList}>
                                                {systemIngredients
                                                    .filter(i => assignedIngredientIds.includes(i.id))
                                                    .map(i => (
                                                        <span key={i.id} className={styles.ingredientBadge}>
                                                            {i.name}
                                                        </span>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </>
            )}

            {/* Drawers */}
            <ProductInfoEditDrawer
                open={isInfoDrawerOpen}
                onClose={() => setIsInfoDrawerOpen(false)}
                productId={product.id}
                tenantId={tenantId}
                initialData={{
                    name: product.name,
                    description: product.description ?? null,
                    image_url: product.image_url ?? null
                }}
                onSuccess={handleInfoSuccess}
            />

            <ProductGroupsEditDrawer
                open={isGroupsDrawerOpen}
                onClose={() => setIsGroupsDrawerOpen(false)}
                productId={product.id}
                tenantId={tenantId}
                onSuccess={handleGroupsSuccess}
            />

            <ProductSpecsEditDrawer
                open={isSpecsDrawerOpen}
                onClose={() => setIsSpecsDrawerOpen(false)}
                productId={product.id}
                tenantId={tenantId}
                onSuccess={handleSpecsSuccess}
            />
        </div>
    );
}
