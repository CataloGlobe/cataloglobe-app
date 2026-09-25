import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { createProduct, updateProduct, getProduct, V2Product, ProductType } from "@/services/supabase/products";
import { uploadProductImage } from "@/services/supabase/upload";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import { FileInput } from "@/components/ui/Input/FileInput";
import {
    listAttributeDefinitions,
    getProductAttributes,
    setProductAttributeValue,
    V2ProductAttributeDefinition,
    V2ProductAttributeValue,
    AttributeValuePayload
} from "@/services/supabase/attributes";
import {
    listAllergens,
    getProductAllergens,
    setProductAllergens,
    V2SystemAllergen
} from "@/services/supabase/allergens";
import {
    getProductGroupAssignments,
    assignProductToGroup,
    removeProductFromGroup
} from "@/services/supabase/productGroups";
import {
    getIngredients,
    getProductIngredients,
    setProductIngredients,
    createIngredient,
    V2Ingredient
} from "@/services/supabase/ingredients";
import {
    getProductOptions,
    createProductOptionGroup,
    updateProductOptionGroup,
    deleteProductOptionGroup,
    createOptionValue,
    updateOptionValue,
    deleteOptionValue,
    GroupWithValues
} from "@/services/supabase/productOptions";
import { Chip } from "@/components/ui/Chip/Chip";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { formatCurrency } from "@/utils/formatCurrency";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { useAiDescription } from "../hooks/useAiDescription";
import { useBusinessOutletContext } from "@/layouts/MainLayout/outletContext";
import { AiDescriptionField } from "./AiDescriptionField";
import styles from "./ProductForm.module.scss";
import { IngredientCombobox } from "./IngredientCombobox";

export type ProductFormMode = "create_base" | "create_variant" | "edit";

export interface ProductFormProps {
    mode: ProductFormMode;
    productData?: V2Product | null;
    parentProduct?: V2Product | null;
    tenantId: string | null;
    onSuccess: (savedProduct?: V2Product) => void | Promise<void>;
    onSavingChange?: (isSaving: boolean) => void;
    formId?: string;
    skipAutoNavigate?: boolean;
}

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
const normalizePrice = (v?: number | null) => v ?? 0;

async function syncFormatsInEditMode({
    tenantId,
    productId,
    primaryPriceGroup,
    draftFormats
}: {
    tenantId: string;
    productId: string;
    primaryPriceGroup: GroupWithValues | null;
    draftFormats: DraftFormat[];
}): Promise<void> {
    const originalFormats = primaryPriceGroup?.values ?? [];
    const originalMap = new Map(originalFormats.map(f => [f.id, f]));
    const draftMap = new Map(draftFormats.map(f => [f.id, f]));

    const toDelete = originalFormats.filter(f => !draftMap.has(f.id));
    const toUpdate = draftFormats.filter(f => {
        const orig = originalMap.get(f.id);
        if (!orig) return false;
        return orig.name !== f.name || normalizePrice(orig.absolute_price) !== normalizePrice(f.absolute_price);
    });
    const toCreate = draftFormats.filter(f => !originalMap.has(f.id));

    for (const f of toDelete) await deleteOptionValue(f.id);
    for (const f of toUpdate) await updateOptionValue(f.id, { name: f.name, absolute_price: f.absolute_price });

    if (toCreate.length > 0) {
        const groupId = primaryPriceGroup
            ? primaryPriceGroup.id
            : (await createProductOptionGroup({
                  tenant_id: tenantId,
                  product_id: productId,
                  name: "Formato",
                  is_required: true,
                  max_selectable: 1,
                  group_kind: "PRIMARY_PRICE",
                  pricing_mode: "ABSOLUTE"
              })).id;
        for (const f of toCreate) {
            await createOptionValue({
                tenant_id: tenantId,
                option_group_id: groupId,
                name: f.name,
                price_modifier: null,
                absolute_price: f.absolute_price
            });
        }
    }
}

async function syncAddonGroupsInEditMode({
    tenantId,
    productId,
    addonGroups,
    draftAddonGroups
}: {
    tenantId: string;
    productId: string;
    addonGroups: GroupWithValues[];
    draftAddonGroups: DraftAddonGroup[];
}): Promise<void> {
    const originalGroupMap = new Map(addonGroups.map(g => [g.id, g]));
    const draftGroupMap = new Map(draftAddonGroups.map(g => [g.id, g]));

    // 1. DELETE groups removed from draft
    const groupsToDelete = addonGroups.filter(g => !draftGroupMap.has(g.id));
    for (const g of groupsToDelete) await deleteProductOptionGroup(g.id);

    // 2. UPDATE groups that changed
    const groupsToUpdate = draftAddonGroups.filter(g => {
        const orig = originalGroupMap.get(g.id);
        if (!orig) return false;
        return orig.name !== g.name || orig.is_required !== g.is_required || orig.max_selectable !== g.max_selectable;
    });
    for (const g of groupsToUpdate) {
        await updateProductOptionGroup(g.id, { name: g.name, is_required: g.is_required, max_selectable: g.max_selectable });
    }

    // 3. CREATE new groups; build mapping draftId → realId
    const groupsToCreate = draftAddonGroups.filter(g => !originalGroupMap.has(g.id));
    const createdGroupIdMap = new Map<string, string>();
    for (const g of groupsToCreate) {
        const newGroup = await createProductOptionGroup({
            tenant_id: tenantId,
            product_id: productId,
            name: g.name,
            is_required: g.is_required,
            max_selectable: g.max_selectable,
            group_kind: "ADDON",
            pricing_mode: "DELTA"
        });
        createdGroupIdMap.set(g.id, newGroup.id);
    }

    // 4. Sync VALUES for each existing or newly created group
    const groupsToSyncValues = draftAddonGroups.filter(
        g => originalGroupMap.has(g.id) || createdGroupIdMap.has(g.id)
    );
    for (const g of groupsToSyncValues) {
        if (groupsToDelete.some(d => d.id === g.id)) continue; // defensive guard

        const realGroupId = createdGroupIdMap.get(g.id) ?? g.id;
        const originalValues = originalGroupMap.get(g.id)?.values ?? [];
        const originalValueMap = new Map(originalValues.map(v => [v.id, v]));
        const draftValueMap = new Map(g.values.map(v => [v.id, v]));

        const valuesToDelete = originalValues.filter(v => !draftValueMap.has(v.id));
        const valuesToUpdate = g.values.filter(v => {
            const orig = originalValueMap.get(v.id);
            if (!orig) return false;
            return orig.name !== v.name || normalizePrice(orig.price_modifier) !== normalizePrice(v.price_modifier);
        });
        const valuesToCreate = g.values.filter(v => !originalValueMap.has(v.id));

        for (const v of valuesToDelete) await deleteOptionValue(v.id);
        for (const v of valuesToUpdate) await updateOptionValue(v.id, { name: v.name, price_modifier: v.price_modifier });
        for (const v of valuesToCreate) {
            await createOptionValue({
                tenant_id: tenantId,
                option_group_id: realGroupId,
                name: v.name,
                price_modifier: v.price_modifier ?? null
            });
        }
    }
}

type PriceMode = "inherit" | "single" | "formats";

/** Valore di un attributo letto dal DB, finché il form lo porta al salvataggio. */
type AttributeDraftValue = string | number | boolean | unknown[];

const PRICE_MODE_OPTIONS: { value: PriceMode; label: string }[] = [
    { value: "single", label: "Prezzo singolo" },
    { value: "formats", label: "Prezzi per formato" }
];

const VARIANT_PRICE_MODE_OPTIONS: { value: PriceMode; label: string }[] = [
    { value: "inherit", label: "Eredita" },
    { value: "single", label: "Prezzo singolo" },
    { value: "formats", label: "Formati" }
];

export function ProductForm({
    mode,
    productData,
    parentProduct,
    tenantId,
    onSuccess,
    onSavingChange,
    formId = "product-form",
    skipAutoNavigate = false
}: ProductFormProps) {
    const { showToast } = useToast();
    const navigate = useNavigate();
    const verticalConfig = useVerticalConfig();
    const isEditing = mode === "edit";

    const nameInputRef = useRef<HTMLInputElement>(null);

    // Auto-focus name field on create
    useEffect(() => {
        if (!isEditing) {
            const timer = setTimeout(() => nameInputRef.current?.focus(), 80);
            return () => clearTimeout(timer);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const [isSaving, setIsSaving] = useState(false);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    // AI description enrichment — shared affordance (hook + AiDescriptionField).
    const businessOutlet = useBusinessOutletContext();
    const ai = useAiDescription({
        name,
        tenantId,
        onDescriptionGenerated: setDescription,
        onConsumed: businessOutlet?.refreshAiUsage
    });
    const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
    const [basePrice, setBasePrice] = useState<string>("");
    const [productType, setProductType] = useState<ProductType>("simple");
    const [priceMode, setPriceMode] = useState<PriceMode>("single");
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Parent product for edit mode (fetched when editing a variant)
    const [editParent, setEditParent] = useState<V2Product | null>(null);
    const [isLoadingEditParent, setIsLoadingEditParent] = useState(false);

    // Attributes state
    const [attributeDefinitions, setAttributeDefinitions] = useState<
        V2ProductAttributeDefinition[]
    >([]);
    const [attributeValues, setAttributeValues] = useState<Record<string, AttributeDraftValue>>({});

    // Allergens state
    const [systemAllergens, setSystemAllergens] = useState<V2SystemAllergen[]>([]);
    const [selectedAllergens, setSelectedAllergens] = useState<number[]>([]);
    const [isLoadingAllergens, setIsLoadingAllergens] = useState(false);
    const [allergenSearchQuery, setAllergenSearchQuery] = useState("");

    // Groups state
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [initialSelectedGroups, setInitialSelectedGroups] = useState<string[]>([]);

    // Ingredients state
    const [systemIngredients, setSystemIngredients] = useState<V2Ingredient[]>([]);
    const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
    const [isLoadingIngredients, setIsLoadingIngredients] = useState(false);

    // Product Options state — split by kind
    const [primaryPriceGroup, setPrimaryPriceGroup] = useState<GroupWithValues | null>(null);
    const [addonGroups, setAddonGroups] = useState<GroupWithValues[]>([]);

    // For creating PRIMARY_PRICE format
    const [newFormatName, setNewFormatName] = useState("");
    const [newFormatPrice, setNewFormatPrice] = useState("");


    const [hasFormatPricing, setHasFormatPricing] = useState(false);
    const [hasAddonOptions, setHasAddonOptions] = useState(false);
    const [draftFormats, setDraftFormats] = useState<DraftFormat[]>([]);
    const [draftAddonGroups, setDraftAddonGroups] = useState<DraftAddonGroup[]>([]);

    useEffect(() => {
        onSavingChange?.(isSaving);
    }, [isSaving, onSavingChange]);

    // Fetch parent product when editing a variant (for the banner link)
    useEffect(() => {
        if (isEditing && productData?.parent_product_id && tenantId) {
            setEditParent(null);
            setIsLoadingEditParent(true);
            getProduct(productData.parent_product_id, tenantId)
                .then(p => setEditParent(p))
                .catch(() => setEditParent(null))
                .finally(() => setIsLoadingEditParent(false));
        } else {
            setEditParent(null);
        }
    }, [isEditing, productData?.parent_product_id, tenantId]);

    // Dedicated effect for per-product allergen/ingredient selections.
    // Uses productData?.id (not the full object) to avoid spurious re-runs.
    useEffect(() => {
        if (!isEditing || !productData?.id || !tenantId) {
            setSelectedAllergens([]);
            setSelectedIngredients([]);
            return;
        }
        const productId = productData.id;
        const tid = tenantId;
        let cancelled = false;
        getProductAllergens(productId, tid)
            .then(ids => { if (!cancelled) setSelectedAllergens(ids); })
            .catch(() => {});
        getProductIngredients(productId)
            .then(rows => { if (!cancelled) setSelectedIngredients(rows.map(r => r.ingredient_id)); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [isEditing, productData?.id, tenantId]);

    useEffect(() => {
        setIsSaving(false);

        // Reset all search queries
        setAllergenSearchQuery("");

        // Reset options state
        setPrimaryPriceGroup(null);
        setAddonGroups([]);
        setNewFormatName("");
        setNewFormatPrice("");
        setHasAddonOptions(false);
        setDraftFormats([]);
        setDraftAddonGroups([]);
        setPendingImageFile(null);

        if (isEditing && productData) {
            setName(productData.name);
            setDescription(productData.description || "");
            setBasePrice(productData.base_price ? productData.base_price.toString() : "");
            setProductType(productData.product_type);
        } else if (mode === "create_variant" && parentProduct) {
            setName(parentProduct.name);
            setDescription(parentProduct.description || "");
            setBasePrice("");
            setProductType("simple");
            setPriceMode("inherit");
            setSubmitError(null);
        } else {
            setName("");
            setDescription("");
            setBasePrice("");
            setPriceMode("single");
            setProductType("simple");
            setSubmitError(null);
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
    }, [isEditing, productData, parentProduct, tenantId]);

    const loadAttributes = async () => {
        if (!tenantId) return;
        try {
            const defs = await listAttributeDefinitions(tenantId);
            setAttributeDefinitions(defs);

            if (isEditing && productData) {
                const values = await getProductAttributes(productData.id, tenantId);
                const initialValues: Record<string, AttributeDraftValue> = {};

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
                setAttributeValues({});
            }
        } catch (error) {
            console.error("Errore nel caricamento degli attributi:", error);
            showToast({ message: "Non è stato possibile caricare gli attributi.", type: "error" });
        }
    };

    const loadAllergens = async () => {
        setIsLoadingAllergens(true);
        try {
            const allAllergens = await listAllergens();
            setSystemAllergens(allAllergens);
        } catch (error) {
            console.error("Errore nel caricamento degli allergeni:", error);
            showToast({ message: "Non è stato possibile caricare gli allergeni.", type: "error" });
        } finally {
            setIsLoadingAllergens(false);
        }
    };

    const loadGroups = async () => {
        if (!tenantId) return;
        try {

            if (isEditing && productData) {
                const assignedGroups = await getProductGroupAssignments(productData.id);
                const assignedIds = assignedGroups.map(g => g.group_id);
                setSelectedGroups(assignedIds);
                setInitialSelectedGroups(assignedIds);
            } else if (mode === "create_variant" && parentProduct) {
                const assignedGroups = await getProductGroupAssignments(parentProduct.id);
                const assignedIds = assignedGroups.map(g => g.group_id);
                setSelectedGroups(assignedIds);
                setInitialSelectedGroups([]);
            } else {
                setSelectedGroups([]);
                setInitialSelectedGroups([]);
            }
        } catch (error) {
            console.error("Errore nel caricamento dei gruppi:", error);
            showToast({
                message: "Non è stato possibile caricare i gruppi prodotto.",
                type: "error"
            });
        }
    };

    const loadIngredients = async () => {
        if (!tenantId) return;
        setIsLoadingIngredients(true);
        try {
            const allIngredients = await getIngredients(tenantId);
            setSystemIngredients(allIngredients);
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
        try {
            const result = await getProductOptions(productData.id);
            setPrimaryPriceGroup(result.primaryPriceGroup);
            setAddonGroups(result.addonGroups);

            if (result.primaryPriceGroup && result.primaryPriceGroup.values.length > 0) {
                const formats: DraftFormat[] = result.primaryPriceGroup.values.map(v => ({
                    id: v.id,
                    name: v.name,
                    absolute_price: v.absolute_price ?? 0
                }));
                setDraftFormats(formats);
                setHasFormatPricing(true);
            }

            if (result.addonGroups.length > 0) {
                const groups: DraftAddonGroup[] = result.addonGroups.map(g => ({
                    id: g.id,
                    name: g.name,
                    is_required: g.is_required,
                    max_selectable: g.max_selectable,
                    values: g.values.map(v => ({
                        id: v.id,
                        name: v.name,
                        price_modifier: v.price_modifier
                    }))
                }));
                setDraftAddonGroups(groups);
                setHasAddonOptions(true);
            }
        } catch (error) {
            console.error("Errore caricamento opzioni:", error);
            showToast({ message: "Impossibile caricare le opzioni prodotto.", type: "error" });
        }
    };

    const handleAllergenToggle = (allergenId: number) => {
        setSelectedAllergens(prev =>
            prev.includes(allergenId) ? prev.filter(id => id !== allergenId) : [...prev, allergenId]
        );
    };

    const handleIngredientToggle = (ingredientId: string) => {
        setSelectedIngredients(prev =>
            prev.includes(ingredientId)
                ? prev.filter(id => id !== ingredientId)
                : [...prev, ingredientId]
        );
    };

    const handleCreateIngredientInline = async (name: string): Promise<string> => {
        if (!tenantId) throw new Error("Tenant mancante");
        const newIngredient = await createIngredient(tenantId, name);
        setSystemIngredients(prev =>
            [...prev, newIngredient].sort((a, b) => a.name.localeCompare(b.name))
        );
        showToast({ message: "Ingrediente creato con successo.", type: "success" });
        return newIngredient.id;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving) return;
        setSubmitError(null);

        if (!name.trim()) {
            showToast({ message: `Il nome del ${verticalConfig.productLabel.toLowerCase()} è obbligatorio.`, type: "error" });
            return;
        }

        const shouldUseBasePrice = !hasFormatPricing;
        const price = shouldUseBasePrice && basePrice.trim() !== "" ? parseFloat(basePrice) : null;
        if (price !== null && isNaN(price)) {
            showToast({ message: "Il prezzo inserito non è valido.", type: "error" });
            return;
        }

        if (!isEditing) {
            if (priceMode === "formats" && draftFormats.length === 0) {
                setSubmitError("Aggiungi almeno un formato prima di creare.");
                return;
            }
        }

        setIsSaving(true);
        try {
            let savedProductId = "";
            let savedProduct: V2Product | undefined;

            if (isEditing && productData) {
                let imageUrl: string | null = productData.image_url ?? null;
                if (pendingImageFile) {
                    imageUrl = await uploadProductImage(
                        productData.tenant_id,
                        productData.id,
                        await compressImage(pendingImageFile, COMPRESS_PROFILES.product)
                    );
                }
                const updatedProduct = await updateProduct(
                    productData.id,
                    productData.tenant_id,
                    {
                        name,
                        description: description || null,
                        base_price: shouldUseBasePrice ? price : null,
                        image_url: imageUrl
                    },
                    productData.parent_product_id
                );
                savedProductId = productData.id;
                savedProduct = updatedProduct;
            } else {
                if (!tenantId) throw new Error("Tenant ID mancante");
                const parentId =
                    mode === "create_variant" && parentProduct ? parentProduct.id : null;
                const resolvedProductType: ProductType = priceMode === "formats" ? "formats" : "simple";
                const newProduct = await createProduct(
                    tenantId,
                    {
                        name,
                        description: description || null,
                        base_price: priceMode !== "formats" ? price : null,
                        image_url: null,
                        product_type: resolvedProductType
                    },
                    parentId
                );
                savedProductId = newProduct.id;
                savedProduct = newProduct;

                if (pendingImageFile) {
                    const imageUrl = await uploadProductImage(tenantId, newProduct.id, await compressImage(pendingImageFile, COMPRESS_PROFILES.product));
                    savedProduct = await updateProduct(newProduct.id, tenantId, { image_url: imageUrl });
                }
            }

            if (savedProductId && tenantId) {
                if (isEditing && productType === "formats") {
                    await syncFormatsInEditMode({ tenantId, productId: savedProductId, primaryPriceGroup, draftFormats });
                    setHasFormatPricing(draftFormats.length > 0);
                }

                if (isEditing && productType === "configurable") {
                    await syncAddonGroupsInEditMode({ tenantId, productId: savedProductId, addonGroups, draftAddonGroups });
                    setHasAddonOptions(draftAddonGroups.length > 0);
                }

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

                try {
                    for (const def of attributeDefinitions) {
                        const value = attributeValues[def.id];
                        const payload: AttributeValuePayload = {};
                        if (value !== undefined && value !== "") {
                            if (def.type === "text" || def.type === "select")
                                payload.value_text = String(value);
                            else if (def.type === "number")
                                payload.value_number = parseFloat(String(value));
                            else if (def.type === "boolean") payload.value_boolean = Boolean(value);
                            else if (def.type === "multi_select") payload.value_json = value;
                        }
                        await setProductAttributeValue(tenantId, savedProductId, def.id, payload);
                    }
                } catch (attrError) {
                    console.error("Errore salvataggio attributi:", attrError);
                    throw new Error("Errore nel salvataggio degli attributi prodotto.");
                }

                try {
                    await setProductAllergens(tenantId, savedProductId, selectedAllergens);
                } catch (allergenError) {
                    console.error("Errore salvataggio allergeni:", allergenError);
                    showToast({ message: "Impossibile salvare gli allergeni del prodotto.", type: "info" });
                }

                try {
                    const toAdd = selectedGroups.filter(id => !initialSelectedGroups.includes(id));
                    const toRemove = initialSelectedGroups.filter(
                        id => !selectedGroups.includes(id)
                    );
                    for (const groupId of toAdd)
                        await assignProductToGroup({
                            productId: savedProductId,
                            groupId,
                            tenantId
                        });
                    for (const groupId of toRemove)
                        await removeProductFromGroup({ productId: savedProductId, groupId });
                } catch (groupError) {
                    console.error("Errore associazione gruppi:", groupError);
                    throw new Error("Errore nell'associazione dei gruppi prodotto.");
                }

                try {
                    await setProductIngredients(tenantId, savedProductId, selectedIngredients);
                } catch (ingredientError) {
                    console.error("Errore salvataggio ingredienti:", ingredientError);
                    showToast({ message: "Impossibile salvare gli ingredienti del prodotto.", type: "info" });
                }
            }

            if (isEditing) {
                showToast({
                    message: `${verticalConfig.productLabel} aggiornato.`,
                    type: "success",
                    actionLabel: "Apri",
                    onAction: () => {
                        if (savedProductId) {
                            navigate(`/business/${tenantId}/products/${savedProductId}`);
                        }
                    }
                });
            }

            // If it's a new product creation, navigate automatically to the product page with pricing tab hint
            if (!isEditing && savedProductId && !skipAutoNavigate) {
                navigate(`/business/${tenantId}/products/${savedProductId}?tab=pricing`);
            }

            await Promise.resolve(onSuccess(savedProduct));
        } catch (error: unknown) {
            console.error("Errore salvataggio prodotto:", error);
            showToast({
                message:
                    error instanceof Error && error.message
                        ? error.message
                        : `Impossibile salvare il ${verticalConfig.productLabel.toLowerCase()}.`,
                type: "error"
            });
        } finally {
            setIsSaving(false);
        }
    };

    const productLower = verticalConfig.productLabel.toLowerCase();
    const showAllergens =
        verticalConfig.productSections.allergens && (isLoadingAllergens || systemAllergens.length > 0);
    const showIngredients = verticalConfig.productSections.ingredients;
    const parentLink = isEditing && productData?.parent_product_id;

    return (
        <form id={formId} className={styles.form} onSubmit={handleSubmit}>
            {mode === "create_variant" && parentProduct && (
                <Text variant="body-sm" colorVariant="muted">
                    Variante di <strong className={styles.strong}>{parentProduct.name}</strong>
                </Text>
            )}
            {parentLink && (
                <Text variant="body-sm" colorVariant="muted">
                    Variante di{" "}
                    {isLoadingEditParent ? (
                        "…"
                    ) : editParent ? (
                        <Link to={`/business/${tenantId}/products/${editParent.id}`} className={styles.link}>
                            {editParent.name}
                        </Link>
                    ) : (
                        productData?.parent_product_id
                    )}
                </Text>
            )}

            {/* ── Informazioni ──────────────────────────────────────── */}
            <section className={styles.section}>
                <Text as="h3" variant="title-sm" weight={600}>
                    Informazioni
                </Text>
                <TextInput
                    ref={nameInputRef}
                    label="Nome"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={`Nome del ${productLower}`}
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            (e.currentTarget as HTMLInputElement).form?.requestSubmit();
                        }
                    }}
                />
                <AiDescriptionField
                    aiState={ai.aiState}
                    isGenerating={ai.isGenerating}
                    canGenerate={ai.canGenerate}
                    onGenerate={ai.generate}
                >
                    <Textarea
                        value={description}
                        onChange={e => {
                            setDescription(e.target.value);
                            ai.markManualEdit();
                        }}
                        placeholder="Breve descrizione (opzionale)"
                        rows={4}
                        disabled={ai.isGenerating}
                    />
                </AiDescriptionField>
                <FileInput
                    label="Immagine"
                    accept="image/*"
                    maxSizeMb={5}
                    preview="auto"
                    value={pendingImageFile}
                    onChange={file => setPendingImageFile(file)}
                />
            </section>

            {/* ── Prezzo ────────────────────────────────────────────── */}
            {!isEditing && (
                <section className={styles.section}>
                    <Text as="h3" variant="title-sm" weight={600}>
                        Prezzo
                    </Text>
                    <div className={styles.fitContent}>
                        <SegmentedControl<PriceMode>
                            value={priceMode}
                            onChange={newPriceMode => {
                                setPriceMode(newPriceMode);
                                setProductType(newPriceMode === "formats" ? "formats" : "simple");
                                setDraftFormats([]);
                                setHasFormatPricing(false);
                                if (newPriceMode !== "single") setBasePrice("");
                            }}
                            options={mode === "create_variant" ? VARIANT_PRICE_MODE_OPTIONS : PRICE_MODE_OPTIONS}
                        />
                    </div>

                    {priceMode === "inherit" && parentProduct && (
                        <InlineBanner variant="info">
                            Usa il prezzo di {parentProduct.name}:{" "}
                            {parentProduct.product_type === "formats"
                                ? "prezzi per formato"
                                : parentProduct.base_price !== null
                                  ? formatCurrency(parentProduct.base_price)
                                  : "nessun prezzo"}
                            .
                        </InlineBanner>
                    )}

                    {priceMode === "single" && (
                        <TextInput
                            label="Prezzo base (€)"
                            type="number"
                            step="0.01"
                            min="0"
                            value={basePrice}
                            onChange={e => setBasePrice(e.target.value)}
                            placeholder="Es: 10.50"
                        />
                    )}

                    {priceMode === "formats" && (
                        <div className={styles.formats}>
                            {draftFormats.length > 0 && (
                                <ul className={styles.formatList}>
                                    {draftFormats.map(fmt => (
                                        <li key={fmt.id} className={styles.formatRow}>
                                            <Text variant="body-sm">{fmt.name}</Text>
                                            <span className={styles.formatRowEnd}>
                                                <Text variant="body-sm" colorVariant="muted">
                                                    {formatCurrency(fmt.absolute_price)}
                                                </Text>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setDraftFormats(prev => {
                                                            const next = prev.filter(f => f.id !== fmt.id);
                                                            if (next.length === 0) setHasFormatPricing(false);
                                                            return next;
                                                        });
                                                    }}
                                                >
                                                    Rimuovi
                                                </Button>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <div className={styles.formatAdd}>
                                <TextInput
                                    label="Nome formato"
                                    value={newFormatName}
                                    onChange={e => setNewFormatName(e.target.value)}
                                    placeholder="Es. 33cl"
                                    containerClassName={styles.formatName}
                                />
                                <TextInput
                                    label="Prezzo (€)"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={newFormatPrice}
                                    onChange={e => setNewFormatPrice(e.target.value)}
                                    placeholder="Es. 3.50"
                                    containerClassName={styles.formatPrice}
                                />
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                        const fmtName = newFormatName.trim();
                                        const fmtPrice = parseFloat(newFormatPrice);
                                        if (!fmtName || isNaN(fmtPrice) || fmtPrice < 0) return;
                                        setDraftFormats(prev => [
                                            ...prev,
                                            { id: makeDraftId(), name: fmtName, absolute_price: fmtPrice }
                                        ]);
                                        setHasFormatPricing(true);
                                        setNewFormatName("");
                                        setNewFormatPrice("");
                                    }}
                                >
                                    Aggiungi formato
                                </Button>
                            </div>
                        </div>
                    )}

                    {submitError && <InlineBanner variant="error">{submitError}</InlineBanner>}

                    <Text variant="body-sm" colorVariant="muted">
                        Varianti, configurazioni e attributi si aggiungono dalla pagina del {productLower}, dopo averlo creato.
                    </Text>
                </section>
            )}

            {/* ── Allergeni e ingredienti (solo nei verticali che li hanno) ── */}
            {(showAllergens || showIngredients) && (
                <section className={styles.section}>
                    <Text as="h3" variant="title-sm" weight={600}>
                        Composizione
                    </Text>

                    {showAllergens && (
                        <div className={styles.field}>
                            <Text variant="body-sm" weight={600}>
                                {verticalConfig.copy.productSections.allergens}
                            </Text>
                            {isLoadingAllergens ? (
                                <Text variant="body-sm" colorVariant="muted">Caricamento allergeni...</Text>
                            ) : (
                                <>
                                    <TextInput
                                        aria-label="Cerca allergene"
                                        placeholder="Cerca allergene..."
                                        value={allergenSearchQuery}
                                        onChange={e => setAllergenSearchQuery(e.target.value)}
                                    />
                                    <div className={styles.chips}>
                                        {systemAllergens
                                            .filter(a =>
                                                a.label_it.toLowerCase().includes(allergenSearchQuery.toLowerCase()) ||
                                                a.label_en.toLowerCase().includes(allergenSearchQuery.toLowerCase())
                                            )
                                            .map(allergen => (
                                                <Chip
                                                    key={allergen.id}
                                                    label={allergen.label_it}
                                                    selected={selectedAllergens.includes(allergen.id)}
                                                    onClick={() => handleAllergenToggle(allergen.id)}
                                                />
                                            ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {showIngredients && (
                        <div className={styles.field}>
                            <Text variant="body-sm" weight={600}>
                                {verticalConfig.copy.productSections.ingredients}
                            </Text>
                            <IngredientCombobox
                                ingredients={systemIngredients}
                                selectedIds={selectedIngredients}
                                onToggle={handleIngredientToggle}
                                onReorder={setSelectedIngredients}
                                onCreate={handleCreateIngredientInline}
                                isLoadingIngredients={isLoadingIngredients}
                            />
                        </div>
                    )}
                </section>
            )}
        </form>
    );
}
