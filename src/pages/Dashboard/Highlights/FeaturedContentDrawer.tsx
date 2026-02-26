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
    FeaturedContentPricingMode,
    FeaturedContentStatus,
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

    const [internalName, setInternalName] = useState("");
    const [title, setTitle] = useState("");
    const [subtitle, setSubtitle] = useState("");
    const [description, setDescription] = useState("");
    const [ctaText, setCtaText] = useState("");
    const [ctaUrl, setCtaUrl] = useState("");
    const [pricingMode, setPricingMode] = useState<FeaturedContentPricingMode>("none");
    const [status, setStatus] = useState<FeaturedContentStatus>("published");

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
                setInternalName(editingContent.internal_name || "");
                setTitle(editingContent.title);
                setSubtitle(editingContent.subtitle || "");
                setDescription(editingContent.description || "");
                setCtaText(editingContent.cta_text || "");
                setCtaUrl(editingContent.cta_url || "");
                setPricingMode(editingContent.pricing_mode || "none");
                setStatus(editingContent.status || "published");

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
                setInternalName("");
                setTitle("");
                setSubtitle("");
                setDescription("");
                setCtaText("");
                setCtaUrl("");
                setPricingMode("none");
                setStatus("published");
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
                internal_name: internalName.trim() || title.trim(),
                title: title.trim(),
                subtitle: subtitle.trim() || null,
                description: description.trim() || null,
                cta_text: ctaText.trim() || null,
                cta_url: ctaUrl.trim() || null,
                pricing_mode: pricingMode,
                status: status,
                show_original_total: false
            };

            const productsData =
                pricingMode !== "none"
                    ? selectedProducts.map((p, i) => ({
                          product_id: p.product_id,
                          note: p.note || null,
                          sort_order: i
                      }))
                    : [];

            if (pricingMode !== "none" && productsData.length === 0) {
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
        <form
            id="featured-content-form"
            onSubmit={e => {
                e.preventDefault();
                handleSave();
            }}
            style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "24px" }}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Text variant="title-sm" weight={600}>
                    Informazioni base
                </Text>

                <TextInput
                    label="Nome interno *"
                    value={internalName}
                    onChange={e => setInternalName(e.target.value)}
                    placeholder="Es: RistoPromo - Sede Roma"
                />

                <TextInput
                    label="Titolo pubblico *"
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

                <div style={{ display: "flex", gap: "12px" }}>
                    <div style={{ flex: 1 }}>
                        <TextInput
                            label="Testo Pulsante (CTA)"
                            value={ctaText}
                            onChange={e => setCtaText(e.target.value)}
                            placeholder="Es: Scopri di più"
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <TextInput
                            label="Link Pulsante (URL)"
                            value={ctaUrl}
                            onChange={e => setCtaUrl(e.target.value)}
                            placeholder="Es: https://..."
                        />
                    </div>
                </div>

                <CheckboxInput
                    label="Stato editoriale"
                    description={
                        status === "published"
                            ? "Contenuto attivo e utilizzabile"
                            : "Bozza (non pronto per la pubblicazione)"
                    }
                    checked={status === "published"}
                    onChange={e => setStatus(e.target.checked ? "published" : "draft")}
                />
            </div>

            <hr style={{ border: "0", borderTop: "1px solid var(--border-subtle, #e5e7eb)" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Text variant="title-sm" weight={600}>
                    Prodotti aggregati
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
                            name="pricing_mode"
                            value="none"
                            checked={pricingMode === "none"}
                            onChange={() => setPricingMode("none")}
                        />
                        <Text variant="body">Nessuno (Solo Editoriale)</Text>
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
                            name="pricing_mode"
                            value="per_item"
                            checked={pricingMode === "per_item"}
                            onChange={() => setPricingMode("per_item")}
                        />
                        <Text variant="body">Mostra prodotti collegati</Text>
                    </label>
                </div>
            </div>

            {pricingMode !== "none" && (
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
                                type="button"
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
                                        <div style={{ display: "flex", flexDirection: "column" }}>
                                            <IconButton
                                                type="button"
                                                variant="ghost"
                                                icon={<ArrowUp size={14} />}
                                                aria-label="Sposta su"
                                                onClick={() => handleMoveProduct(index, "up")}
                                                disabled={index === 0}
                                            />
                                            <IconButton
                                                type="button"
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
                                                type="button"
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

            <input type="submit" id="featured-content-submit" style={{ display: "none" }} />
        </form>
    );
}
