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

// ─────────────────────────────────────────────────────────────────────────────
// Derivazione pricing_mode dal doppio controllo UI
// ─────────────────────────────────────────────────────────────────────────────
function derivePricingMode(mostraProdotti: boolean, haPrezzo: boolean): FeaturedContentPricingMode {
    if (haPrezzo) return "bundle";
    if (mostraProdotti) return "per_item";
    return "none";
}

// ─────────────────────────────────────────────────────────────────────────────
// Inizializzazione stato UI da pricing_mode (edit mode)
// ─────────────────────────────────────────────────────────────────────────────
function deriveUIState(content: FeaturedContentWithProducts): {
    mostraProdotti: boolean;
    haPrezzo: boolean;
} {
    // Conta solo i prodotti "reali" (con product_id stringa), non gli oggetti {count}
    // provenienti da listFeaturedContents() che usa `products (count)`
    const realProductsCount =
        content.products?.filter(p => typeof p.product_id === "string").length ?? 0;

    switch (content.pricing_mode) {
        case "bundle":
            return {
                haPrezzo: true,
                mostraProdotti: realProductsCount > 0
            };
        case "per_item":
            return { mostraProdotti: true, haPrezzo: false };
        case "none":
        default:
            return { mostraProdotti: false, haPrezzo: false };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────
export default function FeaturedContentDrawer({
    isOpen,
    onClose,
    editingContent,
    onSuccess
}: DrawerProps) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [submitting, setSubmitting] = useState(false);

    // — Campi editoriali —
    const [internalName, setInternalName] = useState("");
    const [title, setTitle] = useState("");
    const [subtitle, setSubtitle] = useState("");
    const [description, setDescription] = useState("");
    const [ctaText, setCtaText] = useState("");
    const [ctaUrl, setCtaUrl] = useState("");
    const [status, setStatus] = useState<FeaturedContentStatus>("published");

    // — Controlli indipendenti per prodotti e prezzo —
    const [mostraProdotti, setMostraProdotti] = useState(false);
    const [haPrezzo, setHaPrezzo] = useState(false);
    const [bundlePrice, setBundlePrice] = useState<string>("");

    // — Prodotti —
    const [productsOptions, setProductsOptions] = useState<ProductOption[]>([]);
    const [selectedProducts, setSelectedProducts] = useState<DrawerProduct[]>([]);
    const [pickerValue, setPickerValue] = useState("");

    // Caricamento lista prodotti
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

    // Inizializzazione / reset al cambio di isOpen / editingContent
    useEffect(() => {
        if (isOpen) {
            if (editingContent) {
                setInternalName(editingContent.internal_name || "");
                setTitle(editingContent.title);
                setSubtitle(editingContent.subtitle || "");
                setDescription(editingContent.description || "");
                setCtaText(editingContent.cta_text || "");
                setCtaUrl(editingContent.cta_url || "");
                setStatus(editingContent.status || "published");

                // Deriva stato UI dal pricing_mode persisted
                const { mostraProdotti: mp, haPrezzo: hp } = deriveUIState(editingContent);
                setMostraProdotti(mp);
                setHaPrezzo(hp);
                setBundlePrice(
                    editingContent.bundle_price != null ? String(editingContent.bundle_price) : ""
                );

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
                // Nuovo contenuto — reset completo
                setInternalName("");
                setTitle("");
                setSubtitle("");
                setDescription("");
                setCtaText("");
                setCtaUrl("");
                setStatus("published");
                setMostraProdotti(false);
                setHaPrezzo(false);
                setBundlePrice("");
                setSelectedProducts([]);
            }
            setPickerValue("");
        }
    }, [isOpen, editingContent]);

    // Reset bundle_price quando haPrezzo viene disattivato
    const handleToggleHaPrezzo = (checked: boolean) => {
        setHaPrezzo(checked);
        if (!checked) {
            setBundlePrice("");
        }
    };

    // ── Handlers prodotti ──────────────────────────────────────────────────
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

        updated.forEach((p, i) => {
            p.sort_order = i;
        });
        setSelectedProducts(updated);
    };

    // ── Save ───────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!title.trim()) {
            showToast({ type: "error", message: "Il titolo è obbligatorio", duration: 3000 });
            return;
        }

        // Validazione prezzo quando attivo
        if (haPrezzo) {
            const parsed = parseFloat(bundlePrice);
            if (bundlePrice.trim() === "" || isNaN(parsed) || parsed <= 0) {
                showToast({
                    type: "error",
                    message: "Inserisci un prezzo valido (maggiore di 0)",
                    duration: 3000
                });
                return;
            }
        }

        const tenantId = user?.id;
        if (!tenantId) {
            showToast({ type: "error", message: "Utente non identificato (tenantId mancante)" });
            return;
        }

        try {
            setSubmitting(true);

            // Derivazione pricing_mode dal doppio stato UI
            const pricingMode = derivePricingMode(mostraProdotti, haPrezzo);
            const resolvedBundlePrice = pricingMode === "bundle" ? parseFloat(bundlePrice) : null;

            const contentData = {
                internal_name: internalName.trim() || title.trim(),
                title: title.trim(),
                subtitle: subtitle.trim() || null,
                description: description.trim() || null,
                cta_text: ctaText.trim() || null,
                cta_url: ctaUrl.trim() || null,
                pricing_mode: pricingMode,
                bundle_price: resolvedBundlePrice,
                status: status,
                show_original_total: false
            };

            // I prodotti vengono inviati solo se la sezione è attiva
            const productsData = mostraProdotti
                ? selectedProducts.map((p, i) => ({
                      product_id: p.product_id,
                      note: p.note || null,
                      sort_order: i
                  }))
                : [];

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

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <form
            id="featured-content-form"
            onSubmit={e => {
                e.preventDefault();
                handleSave();
            }}
            style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "24px" }}
        >
            {/* ── Sezione: Informazioni base ───────────────────────────────── */}
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

            {/* ── Sezione: Prodotti inclusi ─────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Text variant="title-sm" weight={600}>
                    Prodotti inclusi
                </Text>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
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
                            name="mostra_prodotti"
                            checked={!mostraProdotti}
                            onChange={() => {
                                setMostraProdotti(false);
                                setSelectedProducts([]);
                            }}
                        />
                        <Text variant="body">Nessuno (solo editoriale)</Text>
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
                            name="mostra_prodotti"
                            checked={mostraProdotti}
                            onChange={() => setMostraProdotti(true)}
                        />
                        <Text variant="body">Mostra prodotti</Text>
                    </label>
                </div>

                {mostraProdotti && (
                    <>
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
                                Nessun prodotto selezionato.
                            </Text>
                        )}
                    </>
                )}
            </div>

            <hr style={{ border: "0", borderTop: "1px solid var(--border-subtle, #e5e7eb)" }} />

            {/* ── Sezione: Prezzo del contenuto ─────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Text variant="title-sm" weight={600}>
                    Prezzo del contenuto
                </Text>

                <CheckboxInput
                    label="Questo contenuto ha un prezzo"
                    description="Es: Menù del giorno, promozione a prezzo fisso"
                    checked={haPrezzo}
                    onChange={e => handleToggleHaPrezzo(e.target.checked)}
                />

                {haPrezzo && (
                    <TextInput
                        label="Prezzo (€) *"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={bundlePrice}
                        onChange={e => setBundlePrice(e.target.value)}
                        placeholder="Es: 18.00"
                    />
                )}
            </div>

            <input type="submit" id="featured-content-submit" style={{ display: "none" }} />
        </form>
    );
}
