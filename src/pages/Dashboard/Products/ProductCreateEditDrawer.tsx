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
import { Select } from "@/components/ui/Select/Select";
import styles from "./Products.module.scss";

export type ProductFormMode = "create_base" | "create_variant" | "edit";

type ProductCreateEditDrawerProps = {
    open: boolean;
    onClose: () => void;
    mode: ProductFormMode;
    productData: V2Product | null; // For edit
    parentProduct: V2Product | null; // For create_variant
    onSuccess: () => void;
    tenantId?: string;
};

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

    useEffect(() => {
        if (open) {
            setIsSaving(false);

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

            // Load Attributes & Allergens
            if (tenantId) {
                loadAttributes();
                loadAllergens();
            }
        }
    }, [open, isEditing, productData, tenantId]);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            showToast({ message: "Il nome del prodotto è obbligatorio.", type: "error" });
            return;
        }

        const price = basePrice.trim() !== "" ? parseFloat(basePrice) : null;
        if (price !== null && isNaN(price)) {
            showToast({ message: "Il prezzo inserito non è valido.", type: "error" });
            return;
        }

        setIsSaving(true);
        try {
            let savedProductId = "";

            if (isEditing && productData) {
                await updateProduct(
                    productData.id,
                    productData.tenant_id,
                    {
                        name,
                        description: description || null,
                        base_price: price,
                        is_visible: isVisible
                    },
                    productData.parent_product_id
                );
                savedProductId = productData.id;
            } else {
                if (!tenantId) throw new Error("Tenant ID mancante");
                const parentId =
                    mode === "create_variant" && parentProduct ? parentProduct.id : null;
                const newProduct = await createProduct(
                    tenantId,
                    {
                        name,
                        description: description || null,
                        base_price: price,
                        is_visible: isVisible
                    },
                    parentId
                );
                savedProductId = newProduct.id;
            }

            // Save attributes associated with the product
            if (savedProductId && tenantId) {
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
            }

            showToast({
                message: isEditing ? "Prodotto aggiornato." : "Prodotto creato con successo.",
                type: "success"
            });

            onSuccess();
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

                    <TextInput
                        label="Prezzo base (€)"
                        type="number"
                        step="0.01"
                        min="0"
                        value={basePrice}
                        onChange={e => setBasePrice(e.target.value)}
                        placeholder="Es: 10.50"
                    />

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginTop: 8
                        }}
                    >
                        <div>
                            <Text variant="body-sm" weight={600}>
                                Visibilità
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                Mostra o nascondi temporaneamente questo prodotto
                            </Text>
                        </div>
                        <Switch checked={isVisible} onChange={setIsVisible} />
                    </div>

                    {/* Attributes Section */}
                    {attributeDefinitions.length > 0 && (
                        <>
                            <div
                                style={{
                                    height: "1px",
                                    backgroundColor: "var(--color-gray-200)",
                                    margin: "16px 0"
                                }}
                            />
                            <Text variant="title-sm" weight={600} style={{ marginBottom: "-8px" }}>
                                Attributi
                            </Text>

                            {isLoadingAttributes ? (
                                <Text variant="body-sm" colorVariant="muted">
                                    Caricamento attributi...
                                </Text>
                            ) : (
                                attributeDefinitions.map(def => {
                                    const value = attributeValues[def.id];

                                    if (def.type === "text") {
                                        return (
                                            <TextInput
                                                key={def.id}
                                                label={def.label}
                                                required={def.is_required}
                                                value={value || ""}
                                                onChange={e =>
                                                    handleAttributeChange(def.id, e.target.value)
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
                                                    handleAttributeChange(def.id, e.target.value)
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
                                                        handleAttributeChange(def.id, checked)
                                                    }
                                                />
                                            </div>
                                        );
                                    } else if (def.type === "select") {
                                        const options = Array.isArray(def.options)
                                            ? def.options.map(opt => ({ value: opt, label: opt }))
                                            : [];
                                        return (
                                            <Select
                                                key={def.id}
                                                label={def.label}
                                                required={def.is_required}
                                                value={value || ""}
                                                onChange={e =>
                                                    handleAttributeChange(def.id, e.target.value)
                                                }
                                                options={[
                                                    { value: "", label: "Seleziona un'opzione" },
                                                    ...options
                                                ]}
                                            />
                                        );
                                    } else if (def.type === "multi_select") {
                                        // TODO: Multi-select component missing. Falling back to simple text input for csv for now.
                                        return (
                                            <TextInput
                                                key={def.id}
                                                label={def.label + " (separati da virgola)"}
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
                                })
                            )}
                        </>
                    )}

                    {/* Allergens Section */}
                    {systemAllergens.length > 0 && (
                        <>
                            <div
                                style={{
                                    height: "1px",
                                    backgroundColor: "var(--color-gray-200)",
                                    margin: "16px 0"
                                }}
                            />
                            <div style={{ marginBottom: 12 }}>
                                <Text variant="title-sm" weight={600} style={{ marginBottom: 4 }}>
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
                                        flexDirection: "column",
                                        gap: 8,
                                        marginTop: 8
                                    }}
                                >
                                    {systemAllergens
                                        .filter(
                                            a =>
                                                a.label_it
                                                    .toLowerCase()
                                                    .includes(allergenSearchQuery.toLowerCase()) ||
                                                a.label_en
                                                    .toLowerCase()
                                                    .includes(allergenSearchQuery.toLowerCase())
                                        )
                                        .map(allergen => (
                                            <div
                                                key={allergen.id}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "space-between"
                                                }}
                                            >
                                                <div>
                                                    <Text variant="body-sm" weight={500}>
                                                        {allergen.label_it}
                                                    </Text>
                                                </div>
                                                <Switch
                                                    checked={selectedAllergens.includes(
                                                        allergen.id
                                                    )}
                                                    onChange={() =>
                                                        handleAllergenToggle(allergen.id)
                                                    }
                                                />
                                            </div>
                                        ))}
                                </div>
                            )}
                        </>
                    )}
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
