import React, { useState, useEffect } from "react";
import { Drawer } from "@/components/ui/Drawer/Drawer";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import { Select } from "@/components/ui/Select/Select";
import { Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { IconButton } from "@/components/ui/Button/IconButton";
import { useToast } from "@/context/Toast/ToastContext";
import { supabase } from "@/services/supabase/client";
import {
    createFeaturedContent,
    updateFeaturedContent,
    FeaturedContentWithProducts,
    FeaturedContentType,
    FeaturedContentProduct
} from "@/services/supabase/v2/featuredContents";
import styles from "./Highlights.module.scss";

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    editingContent: FeaturedContentWithProducts | null;
    onSuccess: () => void;
}

interface ProductOption {
    id: string;
    name: string;
}

type DrawerProduct = Partial<FeaturedContentProduct> & { product?: { name: string } };

import { useAuth } from "@/context/useAuth";

export default function FeaturedContentDrawer({
    isOpen,
    onClose,
    editingContent,
    onSuccess
}: DrawerProps) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [submitting, setSubmitting] = useState(false);

    const [title, setTitle] = useState("");
    const [subtitle, setSubtitle] = useState("");
    const [description, setDescription] = useState("");
    const [type, setType] = useState<FeaturedContentType>("informative");
    const [isActive, setIsActive] = useState(true);

    const [productsOptions, setProductsOptions] = useState<ProductOption[]>([]);
    const [selectedProducts, setSelectedProducts] = useState<DrawerProduct[]>([]);
    const [pickerValue, setPickerValue] = useState("");

    useEffect(() => {
        async function loadProducts() {
            const { data, error } = await supabase
                .from("v2_products")
                .select("id, name")
                .order("name");
            if (!error && data) {
                setProductsOptions(data);
            }
        }
        if (isOpen) {
            loadProducts();
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            if (editingContent) {
                setTitle(editingContent.title);
                setSubtitle(editingContent.subtitle || "");
                setDescription(editingContent.description || "");
                setType(editingContent.type);
                setIsActive(editingContent.is_active);

                if (editingContent.products) {
                    setSelectedProducts(
                        editingContent.products.map(p => ({
                            product_id: p.product_id,
                            note: p.note,
                            sort_order: p.sort_order,
                            product: p.product
                        }))
                    );
                } else {
                    setSelectedProducts([]);
                }
            } else {
                setTitle("");
                setSubtitle("");
                setDescription("");
                setType("informative");
                setIsActive(true);
                setSelectedProducts([]);
            }
            setPickerValue("");
        }
    }, [isOpen, editingContent]);

    const handleAddProduct = () => {
        if (!pickerValue) return;
        if (selectedProducts.some(p => p.product_id === pickerValue)) {
            showToast({ type: "error", message: "Il prodotto è già nella lista" });
            return;
        }

        const product = productsOptions.find(p => p.id === pickerValue);
        if (!product) return;

        setSelectedProducts([
            ...selectedProducts,
            {
                product_id: product.id,
                sort_order: selectedProducts.length,
                note: "",
                product: { name: product.name } as any
            }
        ]);
        setPickerValue("");
    };

    const handleRemoveProduct = (index: number) => {
        setSelectedProducts(selectedProducts.filter((_, i) => i !== index));
    };

    const handleUpdateNote = (index: number, note: string) => {
        const updated = [...selectedProducts];
        updated[index].note = note;
        setSelectedProducts(updated);
    };

    const handleMoveProduct = (index: number, direction: "up" | "down") => {
        if (direction === "up" && index === 0) return;
        if (direction === "down" && index === selectedProducts.length - 1) return;

        const updated = [...selectedProducts];
        const swapIndex = direction === "up" ? index - 1 : index + 1;
        const temp = updated[index];
        updated[index] = updated[swapIndex];
        updated[swapIndex] = temp;

        // Reassign sort orders seamlessly
        updated.forEach((p, i) => {
            p.sort_order = i;
        });
        setSelectedProducts(updated);
    };

    const handleSave = async () => {
        if (!title.trim()) {
            showToast({ type: "error", message: "Il titolo è obbligatorio", duration: 3000 });
            return;
        }

        const tenantId = user?.id; // user comes from useAuth
        if (!tenantId) {
            showToast({ type: "error", message: "Utente non identificato (tenantId mancante)" });
            return;
        }

        try {
            setSubmitting(true);
            const contentData = {
                title: title.trim(),
                subtitle: subtitle.trim() || null,
                description: description.trim() || null,
                type,
                is_active: isActive
            };

            const productsData =
                type === "composite"
                    ? selectedProducts.map((p, i) => ({
                          product_id: p.product_id,
                          note: p.note || null,
                          sort_order: i
                      }))
                    : [];

            if (type === "composite" && productsData.length === 0) {
                showToast({
                    type: "success",
                    message: "Avviso: Contenuto composito salvato senza prodotti",
                    duration: 3000
                });
            }

            if (editingContent) {
                await updateFeaturedContent(editingContent.id, tenantId, contentData, productsData);
                showToast({ type: "success", message: "Contenuto aggiornato" });
            } else {
                await createFeaturedContent(tenantId, contentData, productsData);
                showToast({ type: "success", message: "Contenuto creato" });
            }

            onSuccess();
        } catch (error) {
            console.error(error);
            showToast({ type: "error", message: "Errore durante il salvataggio" });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={editingContent ? "Modifica contenuto" : "Crea contenuto"}
            footer={
                <div
                    style={{
                        display: "flex",
                        gap: "12px",
                        justifyContent: "flex-end",
                        width: "100%"
                    }}
                >
                    <Button variant="secondary" onClick={onClose} disabled={submitting}>
                        Annulla
                    </Button>
                    <Button variant="primary" onClick={handleSave} loading={submitting}>
                        {editingContent ? "Salva" : "Crea"}
                    </Button>
                </div>
            }
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "24px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <Text variant="title-sm" weight={600}>
                        Informazioni base
                    </Text>

                    <TextInput
                        label="Titolo *"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="Es: Promozione speciale"
                    />

                    <TextInput
                        label="Sottotitolo"
                        value={subtitle}
                        onChange={e => setSubtitle(e.target.value)}
                        placeholder="Es: Valida fino a fine mese"
                    />

                    <TextInput
                        label="Descrizione"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Dettagli del contenuto..."
                    />

                    <CheckboxInput
                        label="Stato editoriale"
                        description={isActive ? "Contenuto attivo" : "Bozza (non visibile)"}
                        checked={isActive}
                        onChange={e => setIsActive(e.target.checked)}
                    />
                </div>

                <hr style={{ border: "0", borderTop: "1px solid var(--border-subtle, #e5e7eb)" }} />

                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <Text variant="title-sm" weight={600}>
                        Tipologia
                    </Text>
                    <div style={{ display: "flex", gap: "16px" }}>
                        <label
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                cursor: "pointer"
                            }}
                        >
                            <input
                                type="radio"
                                name="type"
                                value="informative"
                                checked={type === "informative"}
                                onChange={() => setType("informative")}
                            />
                            <Text variant="body">Informativo</Text>
                        </label>
                        <label
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                cursor: "pointer"
                            }}
                        >
                            <input
                                type="radio"
                                name="type"
                                value="composite"
                                checked={type === "composite"}
                                onChange={() => setType("composite")}
                            />
                            <Text variant="body">Composito (con prodotti)</Text>
                        </label>
                    </div>
                </div>

                {type === "composite" && (
                    <>
                        <hr
                            style={{
                                border: "0",
                                borderTop: "1px solid var(--border-subtle, #e5e7eb)"
                            }}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                            <Text variant="title-sm" weight={600}>
                                Prodotti inclusi
                            </Text>

                            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                                <div style={{ flex: 1 }}>
                                    <Select
                                        value={pickerValue}
                                        onChange={e => setPickerValue(e.target.value)}
                                        options={[
                                            { value: "", label: "Seleziona un prodotto..." },
                                            ...productsOptions.map(p => ({
                                                value: p.id,
                                                label: p.name
                                            }))
                                        ]}
                                    />
                                </div>
                                <Button
                                    variant="secondary"
                                    onClick={handleAddProduct}
                                    disabled={!pickerValue}
                                >
                                    Aggiungi
                                </Button>
                            </div>

                            {selectedProducts.length > 0 ? (
                                <ul
                                    style={{
                                        listStyle: "none",
                                        padding: 0,
                                        margin: 0,
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "8px"
                                    }}
                                >
                                    {selectedProducts.map((item, index) => (
                                        <li
                                            key={`${item.product_id}-${index}`}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "12px",
                                                background: "var(--surface-tertiary)",
                                                padding: "12px",
                                                borderRadius: "8px"
                                            }}
                                        >
                                            <div
                                                style={{ display: "flex", flexDirection: "column" }}
                                            >
                                                <IconButton
                                                    variant="ghost"
                                                    icon={<ArrowUp size={14} />}
                                                    aria-label="Sposta su"
                                                    onClick={() => handleMoveProduct(index, "up")}
                                                    disabled={index === 0}
                                                />
                                                <IconButton
                                                    variant="ghost"
                                                    icon={<ArrowDown size={14} />}
                                                    aria-label="Sposta giù"
                                                    onClick={() => handleMoveProduct(index, "down")}
                                                    disabled={index === selectedProducts.length - 1}
                                                />
                                            </div>
                                            <div
                                                style={{
                                                    flex: 1,
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: "8px"
                                                }}
                                            >
                                                <Text variant="body" weight={600}>
                                                    {/* @ts-ignore */}
                                                    {item.product?.name || "Prodotto sconosciuto"}
                                                </Text>
                                                <TextInput
                                                    placeholder="Nota (es: + patatine)"
                                                    value={item.note || ""}
                                                    onChange={e =>
                                                        handleUpdateNote(index, e.target.value)
                                                    }
                                                />
                                            </div>
                                            <div>
                                                <IconButton
                                                    variant="ghost"
                                                    icon={<Trash2 size={16} />}
                                                    aria-label="Rimuovi"
                                                    onClick={() => handleRemoveProduct(index)}
                                                />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <Text colorVariant="muted" variant="body-sm">
                                    Nessun prodotto selezionato. Aggiungi almeno un prodotto per
                                    completare il contenuto composito.
                                </Text>
                            )}
                        </div>
                    </>
                )}
            </div>
        </Drawer>
    );
}
