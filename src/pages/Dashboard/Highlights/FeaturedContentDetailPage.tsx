import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Text from "@/components/ui/Text/Text";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/context/Toast/ToastContext";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { Badge } from "@/components/ui/Badge/Badge";
import { TextInput } from "@/components/ui/Input/TextInput";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import ProductPickerList from "./ProductPickerList";
import ProductsManagerCard from "./ProductsManagerCard";
import { supabase } from "@/services/supabase/client";
import {
    FeaturedContentWithProducts,
    updateFeaturedContent,
    FeaturedContentPricingMode,
    FeaturedContentStatus
} from "@/services/supabase/v2/featuredContents";
import { useAuth } from "@/context/useAuth";
import styles from "./Highlights.module.scss";

export default function FeaturedContentDetailPage() {
    const { featuredId } = useParams<{ featuredId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { user } = useAuth();

    const [content, setContent] = useState<FeaturedContentWithProducts | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Inline edit state
    const [isEditingInfo, setIsEditingInfo] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [editInternalName, setEditInternalName] = useState("");
    const [editTitle, setEditTitle] = useState("");
    const [editSubtitle, setEditSubtitle] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editCtaText, setEditCtaText] = useState("");
    const [editCtaUrl, setEditCtaUrl] = useState("");
    const [editStatus, setEditStatus] = useState<FeaturedContentStatus>("published");
    const [editHasPrice, setEditHasPrice] = useState(false);
    const [editPricingMode, setEditPricingMode] = useState<FeaturedContentPricingMode>("none");
    const [editBundlePrice, setEditBundlePrice] = useState<string>("");

    // Product Picker state
    const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
    const [linkedProductIds, setLinkedProductIds] = useState<string[]>([]);
    const onAddProductRef = useRef<((id: string) => void) | null>(null);

    const startEditing = () => {
        if (!content) return;
        setEditInternalName(content.internal_name || "");
        setEditTitle(content.title || "");
        setEditSubtitle(content.subtitle || "");
        setEditDescription(content.description || "");
        setEditCtaText(content.cta_text || "");
        setEditCtaUrl(content.cta_url || "");
        setEditStatus(content.status || "published");
        setEditHasPrice(content.pricing_mode === "bundle");
        setEditPricingMode(content.pricing_mode || "none");
        setEditBundlePrice(content.bundle_price != null ? String(content.bundle_price) : "");
        setIsEditingInfo(true);
    };

    const handleSaveInfo = async () => {
        if (!content || !user?.id) return;

        if (!editTitle.trim()) {
            showToast({ type: "error", message: "Il titolo è obbligatorio" });
            return;
        }

        let resolvedPricingMode = editPricingMode;
        let resolvedBundlePrice = null;

        if (editHasPrice) {
            resolvedPricingMode = "bundle";
            const parsed = parseFloat(editBundlePrice);
            if (editBundlePrice.trim() === "" || isNaN(parsed) || parsed <= 0) {
                showToast({
                    type: "error",
                    message: "Inserisci un prezzo fisso valido (maggiore di 0)"
                });
                return;
            }
            resolvedBundlePrice = parsed;
        } else {
            // Restore back from bundle to a sensible default if they turn it off
            if (resolvedPricingMode === "bundle") {
                // For now fallback to none, the products card handles switching to per_item
                resolvedPricingMode = "none";
            }
        }

        try {
            setIsSaving(true);
            const updateData = {
                internal_name: editInternalName.trim() || editTitle.trim(),
                title: editTitle.trim(),
                subtitle: editSubtitle.trim() || null,
                description: editDescription.trim() || null,
                cta_text: editCtaText.trim() || null,
                cta_url: editCtaUrl.trim() || null,
                status: editStatus,
                pricing_mode: resolvedPricingMode,
                bundle_price: resolvedBundlePrice
            };

            await updateFeaturedContent(content.id, user.id, updateData);

            showToast({ type: "success", message: "Informazioni aggiornate" });
            setContent(prev => (prev ? { ...prev, ...updateData } : null));
            setIsEditingInfo(false);
        } catch (error) {
            console.error(error);
            showToast({ type: "error", message: "Errore durante il salvataggio" });
        } finally {
            setIsSaving(false);
        }
    };

    const loadContent = useCallback(async () => {
        if (!featuredId) return;
        try {
            setLoading(true);
            setError(null);

            // Dati minimi richiesti al backend
            const { data, error: fetchError } = await supabase
                .from("v2_featured_contents")
                .select(
                    "id, title, status, pricing_mode, bundle_price, subtitle, description, cta_text, cta_url, media_id, internal_name"
                )
                .eq("id", featuredId)
                .single();

            if (fetchError) throw fetchError;

            setContent(data as FeaturedContentWithProducts);
        } catch (err) {
            console.error(err);
            setError("Errore durante il caricamento del contenuto in evidenza.");
            showToast({
                type: "error",
                message: "Impossibile caricare i dettagli del contenuto."
            });
        } finally {
            setLoading(false);
        }
    }, [featuredId, showToast]);

    useEffect(() => {
        loadContent();
    }, [loadContent]);

    // Breadcrumb mapping
    const breadcrumbItems = [
        { label: "Contenuti in evidenza", to: "/dashboard/contenuti-in-evidenza" },
        {
            label: loading ? "Caricamento..." : content?.title || "Dettaglio contenuto"
        }
    ];

    if (error) {
        return (
            <div className={styles.wrapper}>
                <Breadcrumb items={breadcrumbItems} />
                <div style={{ marginTop: "24px" }}>
                    <Text variant="title-sm" colorVariant="error">
                        {error}
                    </Text>
                    <div style={{ marginTop: "16px" }}>
                        <Button
                            variant="secondary"
                            onClick={() => navigate("/dashboard/contenuti-in-evidenza")}
                        >
                            Torna alla lista
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className={styles.wrapper}
            style={{ display: "flex", flexDirection: "column", gap: "24px" }}
        >
            <Breadcrumb items={breadcrumbItems} />

            <PageHeader
                title={loading ? "Caricamento in corso..." : content?.title || "Senza titolo"}
                subtitle={
                    loading
                        ? "Recupero informazioni..."
                        : content?.internal_name || "Nessun nome interno"
                }
                actions={
                    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                        {!loading && content && (
                            <div style={{ display: "flex", gap: "8px" }}>
                                {content.status === "published" ? (
                                    <Badge variant="success">Pubblicato</Badge>
                                ) : (
                                    <Badge variant="secondary">Bozza</Badge>
                                )}
                                {content.pricing_mode === "none" ? (
                                    <Badge variant="secondary">Editoriale</Badge>
                                ) : content.pricing_mode === "per_item" ? (
                                    <Badge variant="secondary">Prodotti</Badge>
                                ) : (
                                    <Badge variant="secondary">Prezzo fisso</Badge>
                                )}
                            </div>
                        )}
                    </div>
                }
            />

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* 1. Informazioni Card */}
                <Card>
                    <div
                        style={{
                            padding: "20px 24px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "16px"
                        }}
                    >
                        {/* Card Header */}
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center"
                            }}
                        >
                            <Text variant="title-sm" weight={600}>
                                Informazioni
                            </Text>
                            {!loading && !isEditingInfo && (
                                <Button variant="secondary" onClick={startEditing}>
                                    Modifica
                                </Button>
                            )}
                        </div>

                        {loading ? (
                            <Text colorVariant="muted">Caricamento...</Text>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                {/* Row 1: Titolo pubblico + Nome interno */}
                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr 1fr",
                                        gap: "16px"
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "4px"
                                        }}
                                    >
                                        <Text variant="caption" weight={600} colorVariant="muted">
                                            Titolo
                                        </Text>
                                        {isEditingInfo ? (
                                            <TextInput
                                                value={editTitle}
                                                onChange={e => setEditTitle(e.target.value)}
                                                placeholder="Titolo pubblico *"
                                            />
                                        ) : (
                                            <Text variant="body-sm">{content?.title || "—"}</Text>
                                        )}
                                    </div>
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "4px"
                                        }}
                                    >
                                        <Text variant="caption" weight={600} colorVariant="muted">
                                            Nome interno
                                        </Text>
                                        {isEditingInfo ? (
                                            <TextInput
                                                value={editInternalName}
                                                onChange={e => setEditInternalName(e.target.value)}
                                                placeholder="Nome interno"
                                            />
                                        ) : (
                                            <Text variant="body-sm" colorVariant="muted">
                                                {content?.internal_name || "—"}
                                            </Text>
                                        )}
                                    </div>
                                </div>

                                {/* Row 2: Sottotitolo — shown only if present (view) or always in edit */}
                                {(isEditingInfo || content?.subtitle) && (
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "4px"
                                        }}
                                    >
                                        <Text variant="caption" weight={600} colorVariant="muted">
                                            Sottotitolo
                                        </Text>
                                        {isEditingInfo ? (
                                            <TextInput
                                                value={editSubtitle}
                                                onChange={e => setEditSubtitle(e.target.value)}
                                                placeholder="Sottotitolo"
                                            />
                                        ) : (
                                            <Text variant="body-sm">{content?.subtitle}</Text>
                                        )}
                                    </div>
                                )}

                                {/* Row 3: Descrizione — shown only if present (view) or always in edit */}
                                {(isEditingInfo || content?.description) && (
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "4px"
                                        }}
                                    >
                                        <Text variant="caption" weight={600} colorVariant="muted">
                                            Descrizione
                                        </Text>
                                        {isEditingInfo ? (
                                            <TextInput
                                                value={editDescription}
                                                onChange={e => setEditDescription(e.target.value)}
                                                placeholder="Descrizione"
                                            />
                                        ) : (
                                            <Text variant="body-sm">{content?.description}</Text>
                                        )}
                                    </div>
                                )}

                                {/* Row 4: CTA — shown only if present (view) or always in edit */}
                                {(isEditingInfo || content?.cta_text || content?.cta_url) && (
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "1fr 1fr",
                                            gap: "16px"
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: "4px"
                                            }}
                                        >
                                            <Text
                                                variant="caption"
                                                weight={600}
                                                colorVariant="muted"
                                            >
                                                Pulsante CTA
                                            </Text>
                                            {isEditingInfo ? (
                                                <TextInput
                                                    value={editCtaText}
                                                    onChange={e => setEditCtaText(e.target.value)}
                                                    placeholder="Testo pulsante"
                                                />
                                            ) : (
                                                <Text variant="body-sm">
                                                    {content?.cta_text || "—"}
                                                </Text>
                                            )}
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: "4px"
                                            }}
                                        >
                                            <Text
                                                variant="caption"
                                                weight={600}
                                                colorVariant="muted"
                                            >
                                                Link CTA
                                            </Text>
                                            {isEditingInfo ? (
                                                <TextInput
                                                    value={editCtaUrl}
                                                    onChange={e => setEditCtaUrl(e.target.value)}
                                                    placeholder="https://..."
                                                />
                                            ) : (
                                                <Text variant="body-sm" colorVariant="muted">
                                                    {content?.cta_url || "—"}
                                                </Text>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Row 5: Prezzo — shown only if bundle (view) or always in edit */}
                                {(isEditingInfo || content?.pricing_mode === "bundle") && (
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "4px"
                                        }}
                                    >
                                        <Text variant="caption" weight={600} colorVariant="muted">
                                            Prezzo
                                        </Text>
                                        {isEditingInfo ? (
                                            <div
                                                style={{
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: "8px"
                                                }}
                                            >
                                                <CheckboxInput
                                                    label="Questo contenuto ha un prezzo fisso"
                                                    checked={editHasPrice}
                                                    onChange={e => {
                                                        setEditHasPrice(e.target.checked);
                                                        if (!e.target.checked)
                                                            setEditBundlePrice("");
                                                    }}
                                                />
                                                {editHasPrice && (
                                                    <TextInput
                                                        type="number"
                                                        min="0.01"
                                                        step="0.01"
                                                        value={editBundlePrice}
                                                        onChange={e =>
                                                            setEditBundlePrice(e.target.value)
                                                        }
                                                        placeholder="Es: 25.00"
                                                    />
                                                )}
                                            </div>
                                        ) : (
                                            <Text variant="body-sm">
                                                {content?.pricing_mode === "bundle"
                                                    ? `€${content.bundle_price?.toFixed(2) ?? "0.00"}`
                                                    : "—"}
                                            </Text>
                                        )}
                                    </div>
                                )}

                                {/* Row 6: Stato — always in edit  */}
                                {isEditingInfo && (
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "4px"
                                        }}
                                    >
                                        <Text variant="caption" weight={600} colorVariant="muted">
                                            Stato
                                        </Text>
                                        <CheckboxInput
                                            label="Pubblicato"
                                            description="Il contenuto è attivo e visibile"
                                            checked={editStatus === "published"}
                                            onChange={e =>
                                                setEditStatus(
                                                    e.target.checked ? "published" : "draft"
                                                )
                                            }
                                        />
                                    </div>
                                )}

                                {/* Media Preview — only if media_id is set */}
                                {content?.media_id && (
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "4px"
                                        }}
                                    >
                                        <Text variant="caption" weight={600} colorVariant="muted">
                                            Media
                                        </Text>
                                        <div
                                            style={{
                                                width: "100%",
                                                maxWidth: "320px",
                                                aspectRatio: "16/9",
                                                background: "var(--surface-tertiary)",
                                                borderRadius: "8px",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                border: "1px solid var(--border-subtle, #e5e7eb)",
                                                overflow: "hidden"
                                            }}
                                        >
                                            <Text colorVariant="muted" variant="caption">
                                                Media ID: {content.media_id}
                                            </Text>
                                        </div>
                                    </div>
                                )}

                                {/* Save / Cancel actions */}
                                {isEditingInfo && (
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "flex-end",
                                            gap: "12px",
                                            paddingTop: "4px"
                                        }}
                                    >
                                        <Button
                                            variant="secondary"
                                            onClick={() => setIsEditingInfo(false)}
                                            disabled={isSaving}
                                        >
                                            Annulla
                                        </Button>
                                        <Button
                                            variant="primary"
                                            onClick={handleSaveInfo}
                                            loading={isSaving}
                                        >
                                            Salva
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </Card>

                {/* 2. Prodotti inclusi Card */}

                <ProductsManagerCard
                    featuredId={featuredId as string}
                    onOpenProductPicker={(linkedIds, onAdd) => {
                        setLinkedProductIds(linkedIds);
                        onAddProductRef.current = onAdd;
                        setIsProductPickerOpen(true);
                    }}
                />
            </div>

            <SystemDrawer
                open={isProductPickerOpen}
                onClose={() => setIsProductPickerOpen(false)}
                width={420}
            >
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={700}>
                            Aggiungi prodotto
                        </Text>
                    }
                >
                    <div style={{ padding: "0 24px", height: "100%", flex: 1, overflow: "hidden" }}>
                        <ProductPickerList
                            excludedProductIds={linkedProductIds}
                            onSelect={id => {
                                onAddProductRef.current?.(id);
                                setIsProductPickerOpen(false);
                            }}
                        />
                    </div>
                </DrawerLayout>
            </SystemDrawer>
        </div>
    );
}
