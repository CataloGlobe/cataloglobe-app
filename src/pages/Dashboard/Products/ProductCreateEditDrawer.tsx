import React, { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Switch } from "@/components/ui/Switch/Switch";
import { useToast } from "@/context/Toast/ToastContext";
import { createProduct, updateProduct, V2Product } from "@/services/supabase/v2/products";
import {
    listAttributeDefinitions,
    getProductAttributes,
    setProductAttributeValue,
    V2ProductAttributeDefinition,
    V2ProductAttributeValue,
    AttributeValuePayload
} from "@/services/supabase/v2/attributes";
import {
    listAllergens,
    getProductAllergens,
    setProductAllergens,
    V2SystemAllergen
} from "@/services/supabase/v2/allergens";
import {
    getProductGroups,
    getProductGroupAssignments,
    assignProductToGroup,
    removeProductFromGroup,
    ProductGroup
} from "@/services/supabase/v2/productGroups";
import {
    getIngredients,
    getProductIngredients,
    setProductIngredients,
    createIngredient,
    V2Ingredient
} from "@/services/supabase/v2/ingredients";
import {
    getProductOptions,
    createProductOptionGroup,
    deleteProductOptionGroup,
    createOptionValue,
    deleteOptionValue,
    GroupWithValues
} from "@/services/supabase/v2/productOptions";
import { Select } from "@/components/ui/Select/Select";
import { Badge } from "@/components/ui/Badge/Badge";
import { Pill } from "@/components/ui/Pill/Pill";
import styles from "./Products.module.scss";

export type ProductFormMode = "create_base" | "create_variant" | "edit";

type ProductCreateEditDrawerProps = {
    open: boolean;
    onClose: () => void;
    mode: ProductFormMode;
    productData: V2Product | null; // For edit
    parentProduct: V2Product | null; // For create_variant
    onSuccess: (savedProduct?: V2Product) => void | Promise<void>;
    tenantId?: string;
};

type DraftFormat = {
    id: string;
    name: string;
    absolute_price: number;
};

type DraftAddonValue = {
    id: string;
    name: string;
    price_modifier: number | null;
};

type DraftAddonGroup = {
    id: string;
    name: string;
    is_required: boolean;
    max_selectable: number | null;
    values: DraftAddonValue[];
};

const makeDraftId = () => `draft-${Math.random().toString(36).slice(2, 10)}`;

export function ProductCreateEditDrawer({
    open,
    onClose,
    mode,
    productData,
    parentProduct,
    onSuccess,
    tenantId
}: ProductCreateEditDrawerProps) {
    const { showToast } = useToast();
    const isEditing = mode === "edit";

    const [isSaving, setIsSaving] = useState(false);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [basePrice, setBasePrice] = useState<string>("");
    const [isVisible, setIsVisible] = useState(true);

    // Attributes state
    const [attributeDefinitions, setAttributeDefinitions] = useState<
        V2ProductAttributeDefinition[]
    >([]);
    const [attributeValues, setAttributeValues] = useState<Record<string, any>>({});
    const [isLoadingAttributes, setIsLoadingAttributes] = useState(false);

    // Allergens state
    const [systemAllergens, setSystemAllergens] = useState<V2SystemAllergen[]>([]);
    const [selectedAllergens, setSelectedAllergens] = useState<number[]>([]);
    const [isLoadingAllergens, setIsLoadingAllergens] = useState(false);
    const [allergenSearchQuery, setAllergenSearchQuery] = useState("");

    // Groups state
    const [systemGroups, setSystemGroups] = useState<ProductGroup[]>([]);
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [initialSelectedGroups, setInitialSelectedGroups] = useState<string[]>([]);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [groupSearchQuery, setGroupSearchQuery] = useState("");

    // Ingredients state
    const [systemIngredients, setSystemIngredients] = useState<V2Ingredient[]>([]);
    const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
    const [isLoadingIngredients, setIsLoadingIngredients] = useState(false);
    const [ingredientSearchQuery, setIngredientSearchQuery] = useState("");
    const [newIngredientName, setNewIngredientName] = useState("");
    const [isCreatingIngredient, setIsCreatingIngredient] = useState(false);

    // Product Options state — split by kind
    const [primaryPriceGroup, setPrimaryPriceGroup] = useState<GroupWithValues | null>(null);
    const [addonGroups, setAddonGroups] = useState<GroupWithValues[]>([]);
    const [isLoadingOptions, setIsLoadingOptions] = useState(false);

    // For creating PRIMARY_PRICE format
    const [newFormatName, setNewFormatName] = useState("");
    const [newFormatPrice, setNewFormatPrice] = useState("");
    const [isCreatingFormat, setIsCreatingFormat] = useState(false);

    // For creating new ADDON group
    const [newGroupName, setNewGroupName] = useState("");
    const [newGroupIsRequired, setNewGroupIsRequired] = useState(false);
    const [newGroupMaxSelectable, setNewGroupMaxSelectable] = useState<string>("");
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);

    // For creating new value (keyed by group id to show inline form per group)
    const [newValueName, setNewValueName] = useState<Record<string, string>>({});
    const [newValuePrice, setNewValuePrice] = useState<Record<string, string>>({});
    const [isCreatingValue, setIsCreatingValue] = useState<Record<string, boolean>>({});
    const [hasFormatPricing, setHasFormatPricing] = useState(false);
    const [hasAddonOptions, setHasAddonOptions] = useState(false);
    const [draftFormats, setDraftFormats] = useState<DraftFormat[]>([]);
    const [draftAddonGroups, setDraftAddonGroups] = useState<DraftAddonGroup[]>([]);

    useEffect(() => {
        if (open) {
            setIsSaving(false);

            // Reset all search queries on every open (create or edit)
            setAllergenSearchQuery("");
            setGroupSearchQuery("");
            setIngredientSearchQuery("");

            // Reset options state
            setPrimaryPriceGroup(null);
            setAddonGroups([]);
            setNewFormatName("");
            setNewFormatPrice("");
            setNewGroupName("");
            setNewGroupIsRequired(false);
            setNewGroupMaxSelectable("");
            setNewValueName({});
            setNewValuePrice({});
            setIsCreatingValue({});
            setHasFormatPricing(false);
            setHasAddonOptions(false);
            setDraftFormats([]);
            setDraftAddonGroups([]);

            if (isEditing && productData) {
                setName(productData.name);
                setDescription(productData.description || "");
                setBasePrice(productData.base_price ? productData.base_price.toString() : "");
                setIsVisible(productData.is_visible ?? true);
            } else {
                setName("");
                setDescription("");
                setBasePrice("");
                setIsVisible(true);
            }

            // Load Attributes, Allergens & Groups & Ingredients
            if (tenantId) {
                loadAttributes();
                loadAllergens();
                loadGroups();
                loadIngredients();
                if (isEditing) {
                    loadOptions();
                }
            }
        }
    }, [open, isEditing, productData, parentProduct, tenantId]);

    const loadAttributes = async () => {
        setIsLoadingAttributes(true);
        try {
            // Fetch definitions
            const defs = await listAttributeDefinitions(tenantId!);
            setAttributeDefinitions(defs);

            // Fetch values if editing
            if (isEditing && productData) {
                const values = await getProductAttributes(productData.id, tenantId!);

                // Map values to a state object keyed by definition ID
                const initialValues: Record<string, any> = {};

                values.forEach((val: V2ProductAttributeValue) => {
                    const def = defs.find(d => d.id === val.attribute_definition_id);
                    if (!def) return;

                    if (def.type === "text" || def.type === "select") {
                        initialValues[def.id] = val.value_text || "";
                    } else if (def.type === "number") {
                        initialValues[def.id] = val.value_number !== null ? val.value_number : "";
                    } else if (def.type === "boolean") {
                        initialValues[def.id] = val.value_boolean || false;
                    } else if (def.type === "multi_select") {
                        initialValues[def.id] = val.value_json || [];
                    }
                });

                setAttributeValues(initialValues);
            } else {
                setAttributeValues({}); // Reset for create
            }
        } catch (error) {
            console.error("Errore nel caricamento degli attributi:", error);
            showToast({ message: "Non è stato possibile caricare gli attributi.", type: "error" });
        } finally {
            setIsLoadingAttributes(false);
        }
    };

    const loadAllergens = async () => {
        setIsLoadingAllergens(true);
        try {
            // Fetch system allergens list
            const allAllergens = await listAllergens();
            setSystemAllergens(allAllergens);

            // Fetch product specific allergens
            if (isEditing && productData && tenantId) {
                const assignedAllergenIds = await getProductAllergens(productData.id, tenantId);
                setSelectedAllergens(assignedAllergenIds);
            } else {
                setSelectedAllergens([]); // Reset for create
            }
        } catch (error) {
            console.error("Errore nel caricamento degli allergeni:", error);
            showToast({ message: "Non è stato possibile caricare gli allergeni.", type: "error" });
        } finally {
            setIsLoadingAllergens(false);
        }
    };

    const loadGroups = async () => {
        setIsLoadingGroups(true);
        try {
            // Fetch all tenant groups
            const allGroups = await getProductGroups(tenantId!);
            setSystemGroups(allGroups);

            // Fetch product specific groups if editing
            if (isEditing && productData && tenantId) {
                const assignedGroups = await getProductGroupAssignments(productData.id);
                const assignedIds = assignedGroups.map(g => g.group_id);
                setSelectedGroups(assignedIds);
                setInitialSelectedGroups(assignedIds);
            }
            // Fetch parent specific groups if creating variant
            else if (mode === "create_variant" && parentProduct && tenantId) {
                const assignedGroups = await getProductGroupAssignments(parentProduct.id);
                const assignedIds = assignedGroups.map(g => g.group_id);
                setSelectedGroups(assignedIds);
                setInitialSelectedGroups([]); // variant has no initial groups yet
            } else {
                setSelectedGroups([]); // Reset for create
                setInitialSelectedGroups([]);
            }
        } catch (error) {
            console.error("Errore nel caricamento dei gruppi:", error);
            showToast({
                message: "Non è stato possibile caricare i gruppi prodotto.",
                type: "error"
            });
        } finally {
            setIsLoadingGroups(false);
        }
    };

    const loadIngredients = async () => {
        setIsLoadingIngredients(true);
        try {
            // Fetch all tenant ingredients
            const allIngredients = await getIngredients(tenantId!);
            setSystemIngredients(allIngredients);

            // Fetch product specific ingredients if editing
            if (isEditing && productData && tenantId) {
                const assignedIngredients = await getProductIngredients(productData.id);
                const assignedIds = assignedIngredients.map(i => i.ingredient_id);
                setSelectedIngredients(assignedIds);
            } else {
                setSelectedIngredients([]); // Reset for create
            }
        } catch (error) {
            console.error("Errore nel caricamento degli ingredienti:", error);
            showToast({
                message: "Non è stato possibile caricare gli ingredienti.",
                type: "error"
            });
        } finally {
            setIsLoadingIngredients(false);
        }
    };

    const loadOptions = async () => {
        if (!isEditing || !productData) return;
        setIsLoadingOptions(true);
        try {
            const result = await getProductOptions(productData.id);
            setPrimaryPriceGroup(result.primaryPriceGroup);
            setAddonGroups(result.addonGroups);
            setHasFormatPricing(
                Boolean(result.primaryPriceGroup && result.primaryPriceGroup.values.length > 0)
            );
            setHasAddonOptions(result.addonGroups.length > 0);
        } catch (error) {
            console.error("Errore caricamento opzioni:", error);
            showToast({ message: "Impossibile caricare le opzioni prodotto.", type: "error" });
        } finally {
            setIsLoadingOptions(false);
        }
    };

    const handleAttributeChange = (defId: string, value: any) => {
        setAttributeValues(prev => ({
            ...prev,
            [defId]: value
        }));
    };

    const handleAllergenToggle = (allergenId: number) => {
        setSelectedAllergens(prev => {
            if (prev.includes(allergenId)) {
                return prev.filter(id => id !== allergenId);
            }
            return [...prev, allergenId];
        });
    };

    const handleGroupToggle = (groupId: string) => {
        setSelectedGroups(prev => {
            if (prev.includes(groupId)) {
                return prev.filter(id => id !== groupId);
            }
            return [...prev, groupId];
        });
    };

    const handleIngredientToggle = (ingredientId: string) => {
        setSelectedIngredients(prev => {
            if (prev.includes(ingredientId)) {
                return prev.filter(id => id !== ingredientId);
            }
            return [...prev, ingredientId];
        });
    };

    const handleCreateIngredient = async () => {
        if (!newIngredientName.trim() || !tenantId) return;
        setIsCreatingIngredient(true);
        try {
            const newIngredient = await createIngredient(tenantId, newIngredientName);
            setSystemIngredients(prev =>
                [...prev, newIngredient].sort((a, b) => a.name.localeCompare(b.name))
            );
            setSelectedIngredients(prev => [...prev, newIngredient.id]);
            setNewIngredientName("");
            showToast({ message: "Ingrediente creato con successo.", type: "success" });
        } catch (error: any) {
            console.error("Errore creazione ingrediente:", error);
            showToast({
                message: error.message || "Impossibile creare l'ingrediente.",
                type: "error"
            });
        } finally {
            setIsCreatingIngredient(false);
        }
    };

    /** Create or add a format to the primary price group */
    const handleCreateFormat = async () => {
        if (!newFormatName.trim() || !tenantId) return;
        const absPrice = newFormatPrice.trim() ? parseFloat(newFormatPrice) : null;
        if (absPrice === null || isNaN(absPrice)) {
            showToast({ message: "Inserisci un prezzo valido per il formato.", type: "error" });
            return;
        }

        if (!isEditing) {
            setDraftFormats(prev => [
                ...prev,
                { id: makeDraftId(), name: newFormatName.trim(), absolute_price: absPrice }
            ]);
            setNewFormatName("");
            setNewFormatPrice("");
            return;
        }

        if (!productData) return;

        setIsCreatingFormat(true);
        try {
            let group = primaryPriceGroup;
            // If no PRIMARY_PRICE group exists yet, create it
            if (!group) {
                const newGroup = await createProductOptionGroup({
                    tenant_id: tenantId,
                    product_id: productData.id,
                    name: "Formato",
                    is_required: true,
                    max_selectable: 1,
                    group_kind: "PRIMARY_PRICE",
                    pricing_mode: "ABSOLUTE"
                });
                group = { ...newGroup, values: [] };
            }
            const newValue = await createOptionValue({
                tenant_id: tenantId,
                option_group_id: group.id,
                name: newFormatName.trim(),
                price_modifier: null,
                absolute_price: absPrice
            });
            const updatedGroup: GroupWithValues = { ...group, values: [...group.values, newValue] };
            setPrimaryPriceGroup(updatedGroup);
            setNewFormatName("");
            setNewFormatPrice("");
            showToast({ message: "Formato aggiunto.", type: "success" });
        } catch (error: any) {
            showToast({
                message: error.message || "Errore durante la creazione del formato.",
                type: "error"
            });
        } finally {
            setIsCreatingFormat(false);
        }
    };

    const handleDeletePrimaryFormat = async (valueId: string) => {
        if (!isEditing) {
            setDraftFormats(prev => prev.filter(v => v.id !== valueId));
            return;
        }
        if (!primaryPriceGroup) return;
        try {
            await deleteOptionValue(valueId);
            const updatedValues = primaryPriceGroup.values.filter(v => v.id !== valueId);
            if (updatedValues.length === 0) {
                // Also delete the empty group
                await deleteProductOptionGroup(primaryPriceGroup.id);
                setPrimaryPriceGroup(null);
            } else {
                setPrimaryPriceGroup({ ...primaryPriceGroup, values: updatedValues });
            }
            showToast({ message: "Formato rimosso.", type: "success" });
        } catch (error: any) {
            showToast({ message: "Errore durante la rimozione del formato.", type: "error" });
        }
    };

    const handleCreateOptionGroup = async () => {
        if (!newGroupName.trim() || !tenantId) return;

        if (!isEditing) {
            const maxSel = newGroupMaxSelectable.trim() ? parseInt(newGroupMaxSelectable) : null;
            setDraftAddonGroups(prev => [
                ...prev,
                {
                    id: makeDraftId(),
                    name: newGroupName,
                    is_required: newGroupIsRequired,
                    max_selectable: maxSel !== null && !isNaN(maxSel) ? maxSel : null,
                    values: []
                }
            ]);
            setNewGroupName("");
            setNewGroupIsRequired(false);
            setNewGroupMaxSelectable("");
            return;
        }

        if (!productData) return;

        setIsCreatingGroup(true);
        try {
            const maxSel = newGroupMaxSelectable.trim() ? parseInt(newGroupMaxSelectable) : null;
            const newGroup = await createProductOptionGroup({
                tenant_id: tenantId,
                product_id: productData.id,
                name: newGroupName,
                is_required: newGroupIsRequired,
                max_selectable: maxSel !== null && !isNaN(maxSel) ? maxSel : null,
                group_kind: "ADDON",
                pricing_mode: "DELTA"
            });
            setAddonGroups(prev => [...prev, { ...newGroup, values: [] }]);
            setNewGroupName("");
            setNewGroupIsRequired(false);
            setNewGroupMaxSelectable("");
            showToast({ message: "Gruppo opzioni creato.", type: "success" });
        } catch (error: any) {
            showToast({ message: error.message || "Errore creazione gruppo.", type: "error" });
        } finally {
            setIsCreatingGroup(false);
        }
    };

    const handleDeleteOptionGroup = async (groupId: string) => {
        if (!isEditing) {
            setDraftAddonGroups(prev => prev.filter(g => g.id !== groupId));
            return;
        }
        try {
            await deleteProductOptionGroup(groupId);
            setAddonGroups(prev => prev.filter((g: GroupWithValues) => g.id !== groupId));
            showToast({ message: "Gruppo eliminato.", type: "success" });
        } catch (error: any) {
            showToast({ message: "Errore durante l'eliminazione del gruppo.", type: "error" });
        }
    };

    const handleCreateOptionValue = async (groupId: string) => {
        const name = newValueName[groupId];
        const priceStr = newValuePrice[groupId];
        if (!name?.trim() || !tenantId) return;

        if (!isEditing) {
            const parsedPrice = priceStr?.trim() ? parseFloat(priceStr) : null;
            setDraftAddonGroups(prev =>
                prev.map(group => {
                    if (group.id !== groupId) return group;
                    return {
                        ...group,
                        values: [
                            ...group.values,
                            {
                                id: makeDraftId(),
                                name: name.trim(),
                                price_modifier:
                                    parsedPrice !== null && !isNaN(parsedPrice)
                                        ? parsedPrice
                                        : null
                            }
                        ]
                    };
                })
            );
            setNewValueName(prev => ({ ...prev, [groupId]: "" }));
            setNewValuePrice(prev => ({ ...prev, [groupId]: "" }));
            return;
        }

        setIsCreatingValue(prev => ({ ...prev, [groupId]: true }));
        try {
            const price = priceStr?.trim() ? parseFloat(priceStr) : null;
            const newValue = await createOptionValue({
                tenant_id: tenantId,
                option_group_id: groupId,
                name: name.trim(),
                price_modifier: price !== null && !isNaN(price) ? price : null
            });
            setAddonGroups(prev =>
                prev.map((g: GroupWithValues) => {
                    if (g.id === groupId) {
                        return { ...g, values: [...g.values, newValue] };
                    }
                    return g;
                })
            );
            setNewValueName(prev => ({ ...prev, [groupId]: "" }));
            setNewValuePrice(prev => ({ ...prev, [groupId]: "" }));
            showToast({ message: "Valore aggiunto.", type: "success" });
        } catch (error: any) {
            showToast({ message: error.message || "Errore creazione valore.", type: "error" });
        } finally {
            setIsCreatingValue(prev => ({ ...prev, [groupId]: false }));
        }
    };

    const handleDeleteOptionValue = async (groupId: string, valueId: string) => {
        if (!isEditing) {
            setDraftAddonGroups(prev =>
                prev.map(group => {
                    if (group.id !== groupId) return group;
                    return {
                        ...group,
                        values: group.values.filter(value => value.id !== valueId)
                    };
                })
            );
            return;
        }
        try {
            await deleteOptionValue(valueId);
            setAddonGroups(prev =>
                prev.map((g: GroupWithValues) => {
                    if (g.id === groupId) {
                        return {
                            ...g,
                            values: g.values.filter((v: { id: string }) => v.id !== valueId)
                        };
                    }
                    return g;
                })
            );
            showToast({ message: "Valore eliminato.", type: "success" });
        } catch (error: any) {
            showToast({ message: "Errore durante l'eliminazione del valore.", type: "error" });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            showToast({ message: "Il nome del prodotto è obbligatorio.", type: "error" });
            return;
        }

        const shouldUseBasePrice = !hasFormatPricing;
        const price = shouldUseBasePrice && basePrice.trim() !== "" ? parseFloat(basePrice) : null;
        if (price !== null && isNaN(price)) {
            showToast({ message: "Il prezzo inserito non è valido.", type: "error" });
            return;
        }

        setIsSaving(true);
        try {
            let savedProductId = "";
            let savedProduct: V2Product | undefined;

            if (isEditing && productData) {
                const updatedProduct = await updateProduct(
                    productData.id,
                    productData.tenant_id,
                    {
                        name,
                        description: description || null,
                        base_price: shouldUseBasePrice ? price : null,
                        is_visible: isVisible
                    },
                    productData.parent_product_id
                );
                savedProductId = productData.id;
                savedProduct = updatedProduct;
            } else {
                if (!tenantId) throw new Error("Tenant ID mancante");
                const parentId =
                    mode === "create_variant" && parentProduct ? parentProduct.id : null;
                const newProduct = await createProduct(
                    tenantId,
                    {
                        name,
                        description: description || null,
                        base_price: shouldUseBasePrice ? price : null,
                        is_visible: isVisible
                    },
                    parentId
                );
                savedProductId = newProduct.id;
                savedProduct = newProduct;
            }

            // Save attributes associated with the product
            if (savedProductId && tenantId) {
                if (!isEditing) {
                    if (hasFormatPricing && draftFormats.length > 0) {
                        const newPrimaryGroup = await createProductOptionGroup({
                            tenant_id: tenantId,
                            product_id: savedProductId,
                            name: "Formato",
                            is_required: true,
                            max_selectable: 1,
                            group_kind: "PRIMARY_PRICE",
                            pricing_mode: "ABSOLUTE"
                        });

                        for (const format of draftFormats) {
                            await createOptionValue({
                                tenant_id: tenantId,
                                option_group_id: newPrimaryGroup.id,
                                name: format.name,
                                price_modifier: null,
                                absolute_price: format.absolute_price
                            });
                        }
                    }

                    if (hasAddonOptions && draftAddonGroups.length > 0) {
                        for (const draftGroup of draftAddonGroups) {
                            const createdGroup = await createProductOptionGroup({
                                tenant_id: tenantId,
                                product_id: savedProductId,
                                name: draftGroup.name,
                                is_required: draftGroup.is_required,
                                max_selectable: draftGroup.max_selectable,
                                group_kind: "ADDON",
                                pricing_mode: "DELTA"
                            });

                            for (const draftValue of draftGroup.values) {
                                await createOptionValue({
                                    tenant_id: tenantId,
                                    option_group_id: createdGroup.id,
                                    name: draftValue.name,
                                    price_modifier: draftValue.price_modifier
                                });
                            }
                        }
                    }
                }

                for (const def of attributeDefinitions) {
                    const value = attributeValues[def.id];

                    let payload: AttributeValuePayload = {};

                    // Check if a value was provided/changed
                    if (value !== undefined && value !== "") {
                        if (def.type === "text" || def.type === "select") {
                            payload.value_text = String(value);
                        } else if (def.type === "number") {
                            payload.value_number = parseFloat(value);
                        } else if (def.type === "boolean") {
                            payload.value_boolean = Boolean(value);
                        } else if (def.type === "multi_select") {
                            payload.value_json = value;
                        }
                    }

                    // For now, always call setProductAttributeValue. It will handle upsert/delete if empty.
                    await setProductAttributeValue(tenantId, savedProductId, def.id, payload);
                }

                // Save allergens
                await setProductAllergens(tenantId, savedProductId, selectedAllergens);

                // Save groups delta
                const toAdd = selectedGroups.filter(id => !initialSelectedGroups.includes(id));
                const toRemove = initialSelectedGroups.filter(id => !selectedGroups.includes(id));

                for (const groupId of toAdd) {
                    await assignProductToGroup({
                        productId: savedProductId,
                        groupId: groupId,
                        tenantId: tenantId
                    });
                }
                for (const groupId of toRemove) {
                    await removeProductFromGroup({ productId: savedProductId, groupId: groupId });
                }

                // Save ingredients (setProductIngredients handles the delta internally)
                await setProductIngredients(tenantId, savedProductId, selectedIngredients);
            }

            showToast({
                message: isEditing ? "Prodotto aggiornato." : "Prodotto creato con successo.",
                type: "success"
            });

            await Promise.resolve(onSuccess(savedProduct));
            onClose();
        } catch (error: any) {
            console.error("Errore salvataggio prodotto:", error);
            showToast({
                message: error.message || "Impossibile salvare il prodotto.",
                type: "error"
            });
        } finally {
            setIsSaving(false);
        }
    };

    let title = "Nuovo Prodotto";
    let subtitle = "Crea un nuovo prodotto base.";
    if (isEditing) {
        title = "Modifica Prodotto";
        subtitle = "Aggiorna i dettagli di questo prodotto.";
    } else if (mode === "create_variant") {
        title = "Nuova Variante";
        subtitle = `Crea una variante per il prodotto "${parentProduct?.name}".`;
    }

    return (
        <SystemDrawer open={open} onClose={onClose} width={500}>
            <DrawerLayout
                header={
                    <div className={styles.drawerHeader}>
                        <Text variant="title-sm" weight={600}>
                            {title}
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            {subtitle}
                        </Text>
                    </div>
                }
                footer={
                    <div className={styles.drawerFooterContainer}>
                        <div className={styles.drawerFooter}>
                            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                                Annulla
                            </Button>
                            <Button
                                variant="primary"
                                type="submit"
                                form="product-form"
                                loading={isSaving}
                            >
                                {isEditing ? "Salva Modifiche" : "Crea"}
                            </Button>
                        </div>
                    </div>
                }
            >
                <form id="product-form" className={styles.form} onSubmit={handleSubmit}>
                    {mode === "create_variant" && parentProduct && (
                        <div style={{ marginBottom: 8 }}>
                            <Text variant="body-sm" colorVariant="muted" weight={500}>
                                Variante di:{" "}
                                <span style={{ color: "var(--color-gray-900)" }}>
                                    {parentProduct.name}
                                </span>
                            </Text>
                        </div>
                    )}
                    {isEditing && productData?.parent_product_id && (
                        <div style={{ marginBottom: 8 }}>
                            <Text variant="body-sm" colorVariant="muted" weight={500}>
                                Questo prodotto è una variante.
                            </Text>
                        </div>
                    )}

                    <div>
                        <Text variant="title-sm" weight={600} style={{ marginBottom: 12 }}>
                            Informazioni base
                        </Text>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <TextInput
                                label="Nome"
                                required
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Es: Margherita, T-Shirt Rossa..."
                            />

                            <TextInput
                                label="Descrizione"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Breve descrizione (opzionale)"
                            />
                        </div>
                    </div>

                    <div
                        style={{
                            height: "1px",
                            backgroundColor: "var(--color-gray-200)"
                        }}
                    />

                    <div>
                        <div style={{ marginBottom: 12 }}>
                            <Text variant="title-sm" weight={600} style={{ marginBottom: 4 }}>
                                Prezzi
                            </Text>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            <div>
                                <TextInput
                                    label="Prezzo base (€)"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={basePrice}
                                    onChange={e => setBasePrice(e.target.value)}
                                    placeholder={
                                        hasFormatPricing
                                            ? "Disabilitato: stai usando prezzi per formato"
                                            : "Es: 10.50"
                                    }
                                    disabled={hasFormatPricing}
                                />
                            </div>

                            <div>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        marginBottom: 6
                                    }}
                                >
                                    <Text variant="body-sm" weight={600}>
                                        Prezzi / Formati
                                    </Text>
                                    <Switch
                                        checked={hasFormatPricing}
                                        onChange={checked => {
                                            setHasFormatPricing(checked);
                                            if (checked) setBasePrice("");
                                        }}
                                    />
                                </div>
                                <Text variant="body-sm" colorVariant="muted">
                                    Se presenti formati, il prezzo base non viene mostrato nel
                                    catalogo.
                                </Text>

                                {hasFormatPricing ? (
                                    isEditing && isLoadingOptions ? (
                                        <Text
                                            variant="body-sm"
                                            colorVariant="muted"
                                            style={{ marginTop: 10 }}
                                        >
                                            Caricamento...
                                        </Text>
                                    ) : (
                                        <div
                                            style={{
                                                marginTop: 10,
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 8
                                            }}
                                        >
                                            {(isEditing
                                                ? primaryPriceGroup?.values || []
                                                : draftFormats
                                            ).length > 0 ? (
                                                <div
                                                    style={{
                                                        border: "1px solid var(--color-gray-200)",
                                                        borderRadius: "8px",
                                                        padding: "12px",
                                                        backgroundColor: "var(--color-gray-50)",
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        gap: 8
                                                    }}
                                                >
                                                    {isEditing && primaryPriceGroup && (
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: 6,
                                                                marginBottom: 4
                                                            }}
                                                        >
                                                            <Text variant="body-sm" weight={600}>
                                                                {primaryPriceGroup.name}
                                                            </Text>
                                                            <Badge variant="warning">
                                                                Obbligatorio
                                                            </Badge>
                                                            <Badge variant="secondary">
                                                                1 scelta
                                                            </Badge>
                                                        </div>
                                                    )}
                                                    {(isEditing
                                                        ? primaryPriceGroup?.values || []
                                                        : draftFormats
                                                    ).map(val => (
                                                        <div
                                                            key={val.id}
                                                            style={{
                                                                display: "flex",
                                                                justifyContent: "space-between",
                                                                alignItems: "center",
                                                                backgroundColor: "white",
                                                                padding: "8px 12px",
                                                                borderRadius: "6px",
                                                                border: "1px solid var(--color-gray-200)"
                                                            }}
                                                        >
                                                            <Text variant="body-sm" weight={500}>
                                                                {val.name}
                                                            </Text>
                                                            <div
                                                                style={{
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    gap: 12
                                                                }}
                                                            >
                                                                {val.absolute_price !== null && (
                                                                    <Text
                                                                        variant="body-sm"
                                                                        weight={600}
                                                                    >
                                                                        {val.absolute_price.toFixed(
                                                                            2
                                                                        )}{" "}
                                                                        €
                                                                    </Text>
                                                                )}
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={e => {
                                                                        e.preventDefault();
                                                                        handleDeletePrimaryFormat(
                                                                            val.id
                                                                        );
                                                                    }}
                                                                >
                                                                    Rimuovi
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div
                                                    style={{
                                                        border: "1px dashed var(--color-gray-300)",
                                                        borderRadius: "8px",
                                                        padding: "12px",
                                                        backgroundColor: "white"
                                                    }}
                                                >
                                                    <Text variant="body-sm" colorVariant="muted">
                                                        Nessun formato configurato.
                                                    </Text>
                                                </div>
                                            )}

                                            <div
                                                style={{
                                                    border: "1px dashed var(--color-gray-300)",
                                                    borderRadius: "8px",
                                                    padding: "12px",
                                                    backgroundColor: "white"
                                                }}
                                            >
                                                <Text
                                                    variant="body-sm"
                                                    weight={600}
                                                    style={{ marginBottom: 8 }}
                                                >
                                                    Aggiungi formato
                                                </Text>
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <div style={{ flex: 1 }}>
                                                        <TextInput
                                                            placeholder="Nome (es. 33cl, 256GB...)"
                                                            value={newFormatName}
                                                            onChange={e =>
                                                                setNewFormatName(e.target.value)
                                                            }
                                                            onKeyDown={e => {
                                                                if (e.key === "Enter") {
                                                                    e.preventDefault();
                                                                    handleCreateFormat();
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                    <div style={{ width: "110px" }}>
                                                        <TextInput
                                                            placeholder="Prezzo €"
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            value={newFormatPrice}
                                                            onChange={e =>
                                                                setNewFormatPrice(e.target.value)
                                                            }
                                                        />
                                                    </div>
                                                    <Button
                                                        variant="secondary"
                                                        onClick={e => {
                                                            e.preventDefault();
                                                            handleCreateFormat();
                                                        }}
                                                        disabled={
                                                            isCreatingFormat ||
                                                            !newFormatName.trim() ||
                                                            !newFormatPrice.trim()
                                                        }
                                                        loading={isCreatingFormat}
                                                    >
                                                        Aggiungi
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <Text
                                        variant="body-sm"
                                        colorVariant="muted"
                                        style={{ marginTop: 10 }}
                                    >
                                        Attiva lo switch per gestire prezzi per formato.
                                    </Text>
                                )}
                            </div>

                            <div>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        marginBottom: 6
                                    }}
                                >
                                    <Text variant="body-sm" weight={600}>
                                        Opzioni aggiuntive
                                    </Text>
                                    <Switch checked={hasAddonOptions} onChange={setHasAddonOptions} />
                                </div>
                                <Text variant="body-sm" colorVariant="muted">
                                    Extra e configurazioni (es. Cottura, Aggiunte). Usa delta
                                    prezzo.
                                </Text>

                                {hasAddonOptions ? (
                                    isEditing && isLoadingOptions ? null : (
                                        <div
                                            style={{
                                                marginTop: 10,
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 16
                                            }}
                                        >
                                            {(isEditing ? addonGroups : draftAddonGroups).map(group => (
                                                <div
                                                    key={group.id}
                                                    style={{
                                                        border: "1px solid var(--color-gray-200)",
                                                        borderRadius: "8px",
                                                        padding: "12px",
                                                        backgroundColor: "var(--color-gray-50)"
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            justifyContent: "space-between",
                                                            alignItems: "flex-start",
                                                            marginBottom: 12
                                                        }}
                                                    >
                                                        <div>
                                                            <div
                                                                style={{
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    gap: 8
                                                                }}
                                                            >
                                                                <Text variant="body-sm" weight={600}>
                                                                    {group.name}
                                                                </Text>
                                                                {group.is_required && (
                                                                    <Badge variant="warning">
                                                                        Obbligatorio
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {group.max_selectable !== null && (
                                                                <Text
                                                                    variant="body-sm"
                                                                    colorVariant="muted"
                                                                >
                                                                    Max selezionabili:{" "}
                                                                    {group.max_selectable}
                                                                </Text>
                                                            )}
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={e => {
                                                                e.preventDefault();
                                                                handleDeleteOptionGroup(group.id);
                                                            }}
                                                        >
                                                            Elimina Gruppo
                                                        </Button>
                                                    </div>

                                                    {group.values.length > 0 && (
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                flexDirection: "column",
                                                                gap: 8,
                                                                marginBottom: 12
                                                            }}
                                                        >
                                                            {group.values.map(val => (
                                                                <div
                                                                    key={val.id}
                                                                    style={{
                                                                        display: "flex",
                                                                        justifyContent:
                                                                            "space-between",
                                                                        alignItems: "center",
                                                                        backgroundColor: "white",
                                                                        padding: "8px 12px",
                                                                        borderRadius: "6px",
                                                                        border: "1px solid var(--color-gray-200)"
                                                                    }}
                                                                >
                                                                    <Text variant="body-sm">
                                                                        {val.name}
                                                                    </Text>
                                                                    <div
                                                                        style={{
                                                                            display: "flex",
                                                                            alignItems: "center",
                                                                            gap: 12
                                                                        }}
                                                                    >
                                                                        {val.price_modifier !==
                                                                            null && (
                                                                            <Text
                                                                                variant="body-sm"
                                                                                colorVariant="muted"
                                                                            >
                                                                                {val.price_modifier >=
                                                                                0
                                                                                    ? "+"
                                                                                    : ""}
                                                                                {val.price_modifier}{" "}
                                                                                €
                                                                            </Text>
                                                                        )}
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={e => {
                                                                                e.preventDefault();
                                                                                handleDeleteOptionValue(
                                                                                    group.id,
                                                                                    val.id
                                                                                );
                                                                            }}
                                                                        >
                                                                            Rimuovi
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div style={{ display: "flex", gap: 8 }}>
                                                        <div style={{ flex: 1 }}>
                                                            <TextInput
                                                                placeholder="Nuovo valore..."
                                                                value={newValueName[group.id] || ""}
                                                                onChange={e =>
                                                                    setNewValueName(prev => ({
                                                                        ...prev,
                                                                        [group.id]: e.target.value
                                                                    }))
                                                                }
                                                                onKeyDown={e => {
                                                                    if (e.key === "Enter") {
                                                                        e.preventDefault();
                                                                        handleCreateOptionValue(
                                                                            group.id
                                                                        );
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                        <div style={{ width: "100px" }}>
                                                            <TextInput
                                                                placeholder="Variazione €"
                                                                type="number"
                                                                step="0.01"
                                                                value={newValuePrice[group.id] || ""}
                                                                onChange={e =>
                                                                    setNewValuePrice(prev => ({
                                                                        ...prev,
                                                                        [group.id]: e.target.value
                                                                    }))
                                                                }
                                                            />
                                                        </div>
                                                        <Button
                                                            variant="secondary"
                                                            onClick={e => {
                                                                e.preventDefault();
                                                                handleCreateOptionValue(group.id);
                                                            }}
                                                            disabled={
                                                                isCreatingValue[group.id] ||
                                                                !(newValueName[group.id] || "").trim()
                                                            }
                                                            loading={isCreatingValue[group.id]}
                                                        >
                                                            Aggiungi
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}

                                            <div
                                                style={{
                                                    border: "1px dashed var(--color-gray-300)",
                                                    borderRadius: "8px",
                                                    padding: "12px",
                                                    backgroundColor: "white"
                                                }}
                                            >
                                                <Text
                                                    variant="body-sm"
                                                    weight={600}
                                                    style={{ marginBottom: 8 }}
                                                >
                                                    Nuovo gruppo opzioni
                                                </Text>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        gap: 12
                                                    }}
                                                >
                                                    <TextInput
                                                        placeholder="Nome gruppo (es. Cottura)"
                                                        value={newGroupName}
                                                        onChange={e => setNewGroupName(e.target.value)}
                                                    />
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            gap: 12,
                                                            alignItems: "center"
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                flex: 1,
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "space-between"
                                                            }}
                                                        >
                                                            <Text variant="body-sm">Obbligatorio</Text>
                                                            <Switch
                                                                checked={newGroupIsRequired}
                                                                onChange={setNewGroupIsRequired}
                                                            />
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <TextInput
                                                                placeholder="Max sel. (opz)"
                                                                type="number"
                                                                min="1"
                                                                value={newGroupMaxSelectable}
                                                                onChange={e =>
                                                                    setNewGroupMaxSelectable(
                                                                        e.target.value
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                    </div>
                                                    <Button
                                                        variant="secondary"
                                                        onClick={e => {
                                                            e.preventDefault();
                                                            handleCreateOptionGroup();
                                                        }}
                                                        disabled={isCreatingGroup || !newGroupName.trim()}
                                                        loading={isCreatingGroup}
                                                    >
                                                        Crea Gruppo
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <Text
                                        variant="body-sm"
                                        colorVariant="muted"
                                        style={{ marginTop: 10 }}
                                    >
                                        Attiva lo switch per aggiungere opzioni.
                                    </Text>
                                )}
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            height: "1px",
                            backgroundColor: "var(--color-gray-200)"
                        }}
                    />

                    <div>
                        <div style={{ marginBottom: 12 }}>
                            <Text variant="title-sm" weight={600} style={{ marginBottom: 4 }}>
                                Organizzazione
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Associa questo prodotto a dei gruppi per organizzarlo.
                            </Text>
                        </div>

                        {systemGroups.length === 0 && !isLoadingGroups ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Nessun gruppo presente. Creane uno dalla pagina Gruppi Prodotti.
                            </Text>
                        ) : (
                            <>
                                <TextInput
                                    placeholder="Cerca gruppo..."
                                    value={groupSearchQuery}
                                    onChange={e => setGroupSearchQuery(e.target.value)}
                                />
                                {isLoadingGroups ? (
                                    <Text variant="body-sm" colorVariant="muted">
                                        Caricamento gruppi...
                                    </Text>
                                ) : (
                                    <div
                                        style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            gap: 8,
                                            marginTop: 8
                                        }}
                                    >
                                        {systemGroups
                                            .filter(g =>
                                                g.name
                                                    .toLowerCase()
                                                    .includes(groupSearchQuery.toLowerCase())
                                            )
                                            .map(group => (
                                                <div key={group.id}>
                                                    <Pill
                                                        label={group.name}
                                                        active={selectedGroups.includes(group.id)}
                                                        onClick={() => handleGroupToggle(group.id)}
                                                    />
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div
                        style={{
                            height: "1px",
                            backgroundColor: "var(--color-gray-200)"
                        }}
                    />

                    <div>
                        <Text variant="title-sm" weight={600} style={{ marginBottom: 12 }}>
                            Specifiche prodotto
                        </Text>

                        {systemAllergens.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ marginBottom: 12 }}>
                                    <Text variant="body-sm" weight={600} style={{ marginBottom: 4 }}>
                                        Allergeni
                                    </Text>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Seleziona gli allergeni presenti in questo prodotto.
                                    </Text>
                                </div>

                                <TextInput
                                    placeholder="Cerca allergene..."
                                    value={allergenSearchQuery}
                                    onChange={e => setAllergenSearchQuery(e.target.value)}
                                />

                                {isLoadingAllergens ? (
                                    <Text variant="body-sm" colorVariant="muted">
                                        Caricamento allergeni...
                                    </Text>
                                ) : (
                                    <div
                                        style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            gap: 8,
                                            marginTop: 8
                                        }}
                                    >
                                        {systemAllergens
                                            .filter(
                                                a =>
                                                    a.label_it
                                                        .toLowerCase()
                                                        .includes(
                                                            allergenSearchQuery.toLowerCase()
                                                        ) ||
                                                    a.label_en
                                                        .toLowerCase()
                                                        .includes(
                                                            allergenSearchQuery.toLowerCase()
                                                        )
                                            )
                                            .map(allergen => (
                                                <div key={allergen.id}>
                                                    <Pill
                                                        label={allergen.label_it}
                                                        active={selectedAllergens.includes(
                                                            allergen.id
                                                        )}
                                                        onClick={() =>
                                                            handleAllergenToggle(allergen.id)
                                                        }
                                                    />
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div>
                            <div style={{ marginBottom: 12 }}>
                                <Text variant="body-sm" weight={600} style={{ marginBottom: 4 }}>
                                    Ingredienti
                                </Text>
                                <Text variant="body-sm" colorVariant="muted">
                                    Associa o crea gli ingredienti per questo prodotto.
                                </Text>
                            </div>

                            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                                <div style={{ flex: 1 }}>
                                    <TextInput
                                        placeholder="Nuovo ingrediente..."
                                        value={newIngredientName}
                                        onChange={e => setNewIngredientName(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleCreateIngredient();
                                            }
                                        }}
                                    />
                                </div>
                                <Button
                                    variant="secondary"
                                    onClick={e => {
                                        e.preventDefault();
                                        handleCreateIngredient();
                                    }}
                                    disabled={isCreatingIngredient || !newIngredientName.trim()}
                                    loading={isCreatingIngredient}
                                >
                                    Crea
                                </Button>
                            </div>

                            {systemIngredients.length > 0 && (
                                <>
                                    <TextInput
                                        placeholder="Cerca ingrediente..."
                                        value={ingredientSearchQuery}
                                        onChange={e => setIngredientSearchQuery(e.target.value)}
                                    />

                                    {isLoadingIngredients ? (
                                        <Text variant="body-sm" colorVariant="muted">
                                            Caricamento ingredienti...
                                        </Text>
                                    ) : (
                                        <div
                                            style={{
                                                display: "flex",
                                                flexWrap: "wrap",
                                                gap: 8,
                                                marginTop: 8
                                            }}
                                        >
                                            {systemIngredients
                                                .filter(i =>
                                                    i.name
                                                        .toLowerCase()
                                                        .includes(
                                                            ingredientSearchQuery.toLowerCase()
                                                        )
                                                )
                                                .map(ingredient => (
                                                    <div key={ingredient.id}>
                                                        <Pill
                                                            label={ingredient.name}
                                                            active={selectedIngredients.includes(
                                                                ingredient.id
                                                            )}
                                                            onClick={() =>
                                                                handleIngredientToggle(
                                                                    ingredient.id
                                                                )
                                                            }
                                                        />
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {attributeDefinitions.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                                <Text variant="body-sm" weight={600} style={{ marginBottom: 8 }}>
                                    Attributi
                                </Text>
                                {isLoadingAttributes ? (
                                    <Text variant="body-sm" colorVariant="muted">
                                        Caricamento attributi...
                                    </Text>
                                ) : (
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 12
                                        }}
                                    >
                                        {attributeDefinitions.map(def => {
                                            const value = attributeValues[def.id];

                                            if (def.type === "text") {
                                                return (
                                                    <TextInput
                                                        key={def.id}
                                                        label={def.label}
                                                        required={def.is_required}
                                                        value={value || ""}
                                                        onChange={e =>
                                                            handleAttributeChange(
                                                                def.id,
                                                                e.target.value
                                                            )
                                                        }
                                                    />
                                                );
                                            } else if (def.type === "number") {
                                                return (
                                                    <TextInput
                                                        key={def.id}
                                                        label={def.label}
                                                        required={def.is_required}
                                                        type="number"
                                                        value={value || ""}
                                                        onChange={e =>
                                                            handleAttributeChange(
                                                                def.id,
                                                                e.target.value
                                                            )
                                                        }
                                                    />
                                                );
                                            } else if (def.type === "boolean") {
                                                return (
                                                    <div
                                                        key={def.id}
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "space-between"
                                                        }}
                                                    >
                                                        <div>
                                                            <Text variant="body-sm" weight={600}>
                                                                {def.label}
                                                            </Text>
                                                        </div>
                                                        <Switch
                                                            checked={value || false}
                                                            onChange={checked =>
                                                                handleAttributeChange(
                                                                    def.id,
                                                                    checked
                                                                )
                                                            }
                                                        />
                                                    </div>
                                                );
                                            } else if (def.type === "select") {
                                                const options = Array.isArray(def.options)
                                                    ? def.options.map(opt => ({
                                                          value: opt,
                                                          label: opt
                                                      }))
                                                    : [];
                                                return (
                                                    <Select
                                                        key={def.id}
                                                        label={def.label}
                                                        required={def.is_required}
                                                        value={value || ""}
                                                        onChange={e =>
                                                            handleAttributeChange(
                                                                def.id,
                                                                e.target.value
                                                            )
                                                        }
                                                        options={[
                                                            {
                                                                value: "",
                                                                label: "Seleziona un'opzione"
                                                            },
                                                            ...options
                                                        ]}
                                                    />
                                                );
                                            } else if (def.type === "multi_select") {
                                                return (
                                                    <TextInput
                                                        key={def.id}
                                                        label={
                                                            def.label + " (separati da virgola)"
                                                        }
                                                        required={def.is_required}
                                                        value={value ? value.join(", ") : ""}
                                                        onChange={e => {
                                                            const parts = e.target.value
                                                                .split(",")
                                                                .map(p => p.trim())
                                                                .filter(Boolean);
                                                            handleAttributeChange(def.id, parts);
                                                        }}
                                                        placeholder="Es: Opzione 1, Opzione 2"
                                                    />
                                                );
                                            }

                                            return null;
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div
                        style={{
                            height: "1px",
                            backgroundColor: "var(--color-gray-200)"
                        }}
                    />

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between"
                        }}
                    >
                        <div>
                            <Text variant="title-sm" weight={600}>
                                Stato
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Visibilità
                            </Text>
                        </div>
                        <Switch checked={isVisible} onChange={setIsVisible} />
                    </div>
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
