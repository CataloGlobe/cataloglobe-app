import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
import { Tabs } from "@/components/ui/Tabs/Tabs";
import ProductPickerList from "./ProductPickerList";
import ProductsManagerCard from "./ProductsManagerCard";
import { supabase } from "@/services/supabase/client";
import {
    FeaturedContentWithProducts,
    updateFeaturedContent,
    FeaturedContentPricingMode,
    FeaturedContentStatus
} from "@/services/supabase/featuredContents";
import { useTenantId } from "@/context/useTenantId";
import styles from "./Highlights.module.scss";

export default function FeaturedContentDetailPage() {
    const { featuredId } = useParams<{ featuredId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const tenantId = useTenantId();

    const [content, setContent] = useState<FeaturedContentWithProducts | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"info" | "products">("info");

    const [isSavingInfo, setIsSavingInfo] = useState(false);

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

    const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
    const [linkedProductIds, setLinkedProductIds] = useState<string[]>([]);
    const [pendingSelectedProductIds, setPendingSelectedProductIds] = useState<string[]>([]);
    const onApplyProductsRef = useRef<((ids: string[]) => Promise<void>) | null>(null);

    const syncInfoFormFromContent = useCallback((source: FeaturedContentWithProducts | null) => {
        if (!source) return;

        setEditInternalName(source.internal_name || "");
        setEditTitle(source.title || "");
        setEditSubtitle(source.subtitle || "");
        setEditDescription(source.description || "");
        setEditCtaText(source.cta_text || "");
        setEditCtaUrl(source.cta_url || "");
        setEditStatus(source.status || "published");
        setEditHasPrice(source.pricing_mode === "bundle");
        setEditPricingMode(source.pricing_mode || "none");
        setEditBundlePrice(source.bundle_price != null ? String(source.bundle_price) : "");
    }, []);

    const normalizeNullable = (value: string) => {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    };

    const resolvedInfoDraft = useMemo(() => {
        const internalName = editInternalName.trim() || editTitle.trim();
        const subtitle = normalizeNullable(editSubtitle);
        const description = normalizeNullable(editDescription);
        const ctaText = normalizeNullable(editCtaText);
        const ctaUrl = normalizeNullable(editCtaUrl);

        let pricingMode = editPricingMode;
        let bundlePrice: number | null = null;

        if (editHasPrice) {
            pricingMode = "bundle";
            const parsed = parseFloat(editBundlePrice);
            bundlePrice = Number.isFinite(parsed) ? parsed : null;
        } else if (pricingMode === "bundle") {
            pricingMode = "none";
        }

        return {
            internal_name: internalName,
            title: editTitle.trim(),
            subtitle,
            description,
            cta_text: ctaText,
            cta_url: ctaUrl,
            status: editStatus,
            pricing_mode: pricingMode,
            bundle_price: bundlePrice
        };
    }, [
        editBundlePrice,
        editCtaText,
        editCtaUrl,
        editDescription,
        editHasPrice,
        editInternalName,
        editPricingMode,
        editStatus,
        editSubtitle,
        editTitle
    ]);

    const hasInfoChanges = useMemo(() => {
        if (!content) return false;

        const current = {
            internal_name: content.internal_name ?? "",
            title: content.title ?? "",
            subtitle: content.subtitle ?? null,
            description: content.description ?? null,
            cta_text: content.cta_text ?? null,
            cta_url: content.cta_url ?? null,
            status: content.status ?? "published",
            pricing_mode: content.pricing_mode ?? "none",
            bundle_price: content.bundle_price ?? null
        };

        return (
            current.internal_name !== resolvedInfoDraft.internal_name ||
            current.title !== resolvedInfoDraft.title ||
            current.subtitle !== resolvedInfoDraft.subtitle ||
            current.description !== resolvedInfoDraft.description ||
            current.cta_text !== resolvedInfoDraft.cta_text ||
            current.cta_url !== resolvedInfoDraft.cta_url ||
            current.status !== resolvedInfoDraft.status ||
            current.pricing_mode !== resolvedInfoDraft.pricing_mode ||
            current.bundle_price !== resolvedInfoDraft.bundle_price
        );
    }, [content, resolvedInfoDraft]);

    const handleCancelInfoChanges = () => {
        syncInfoFormFromContent(content);
    };

    const handleSaveInfo = async () => {
        if (!content || !tenantId) return;

        if (!resolvedInfoDraft.title) {
            showToast({ type: "error", message: "Il titolo è obbligatorio" });
            return;
        }

        if (resolvedInfoDraft.pricing_mode === "bundle") {
            const parsed = resolvedInfoDraft.bundle_price;
            if (parsed === null || Number.isNaN(parsed) || parsed <= 0) {
                showToast({
                    type: "error",
                    message: "Inserisci un prezzo fisso valido (maggiore di 0)"
                });
                return;
            }
        }

        try {
            setIsSavingInfo(true);

            const updateData = {
                internal_name: resolvedInfoDraft.internal_name,
                title: resolvedInfoDraft.title,
                subtitle: resolvedInfoDraft.subtitle,
                description: resolvedInfoDraft.description,
                cta_text: resolvedInfoDraft.cta_text,
                cta_url: resolvedInfoDraft.cta_url,
                status: resolvedInfoDraft.status,
                pricing_mode: resolvedInfoDraft.pricing_mode,
                bundle_price: resolvedInfoDraft.bundle_price
            };

            await updateFeaturedContent(content.id, tenantId, updateData);

            const nextContent = { ...content, ...updateData } as FeaturedContentWithProducts;
            setContent(nextContent);
            syncInfoFormFromContent(nextContent);

            showToast({ type: "success", message: "Informazioni aggiornate" });
        } catch (saveError) {
            console.error(saveError);
            showToast({ type: "error", message: "Errore durante il salvataggio" });
        } finally {
            setIsSavingInfo(false);
        }
    };

    const closeProductPicker = () => {
        setIsProductPickerOpen(false);
        setPendingSelectedProductIds([]);
    };

    const hasPendingProductChanges = useCallback(() => {
        const originalSet = new Set(linkedProductIds);
        const pendingSet = new Set(pendingSelectedProductIds);
        if (originalSet.size !== pendingSet.size) return true;
        for (const id of originalSet) {
            if (!pendingSet.has(id)) return true;
        }
        return false;
    }, [linkedProductIds, pendingSelectedProductIds]);

    const applyProductSelection = async () => {
        if (!onApplyProductsRef.current) return;
        try {
            await onApplyProductsRef.current(pendingSelectedProductIds);
            closeProductPicker();
        } catch (applyError) {
            console.error(applyError);
            showToast({
                type: "error",
                message: "Errore durante il salvataggio della selezione prodotti."
            });
        }
    };

    const loadContent = useCallback(async () => {
        if (!featuredId) return;
        try {
            setLoading(true);
            setError(null);

            const { data, error: fetchError } = await supabase
                .from("featured_contents")
                .select(
                    "id, title, status, pricing_mode, bundle_price, subtitle, description, cta_text, cta_url, media_id, internal_name"
                )
                .eq("id", featuredId)
                .single();

            if (fetchError) throw fetchError;

            const loaded = data as FeaturedContentWithProducts;
            setContent(loaded);
            syncInfoFormFromContent(loaded);
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
    }, [featuredId, showToast, syncInfoFormFromContent]);

    useEffect(() => {
        loadContent();
    }, [loadContent]);

    const breadcrumbItems = [
        { label: "Contenuti in evidenza", to: `/business/${tenantId}/featured` },
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
                            onClick={() => navigate(`/business/${tenantId}/featured`)}
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

            <Tabs value={activeTab} onChange={value => setActiveTab(value as "info" | "products") }>
                <Tabs.List>
                    <Tabs.Tab value="info">Informazioni</Tabs.Tab>
                    <Tabs.Tab value="products">Prodotti inclusi</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="info">
                    <Card>
                        <div
                            style={{
                                padding: "20px 24px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "16px"
                            }}
                        >
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
                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    <Button
                                        variant="secondary"
                                        onClick={handleCancelInfoChanges}
                                        disabled={!hasInfoChanges || isSavingInfo}
                                    >
                                        Annulla
                                    </Button>
                                    <Button
                                        variant="primary"
                                        onClick={handleSaveInfo}
                                        disabled={!hasInfoChanges}
                                        loading={isSavingInfo}
                                    >
                                        Salva
                                    </Button>
                                </div>
                            </div>

                            {loading ? (
                                <Text colorVariant="muted">Caricamento...</Text>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "1fr 1fr",
                                            gap: "16px"
                                        }}
                                    >
                                        <TextInput
                                            label="Titolo"
                                            value={editTitle}
                                            onChange={e => setEditTitle(e.target.value)}
                                            placeholder="Titolo pubblico *"
                                        />
                                        <TextInput
                                            label="Nome interno"
                                            value={editInternalName}
                                            onChange={e => setEditInternalName(e.target.value)}
                                            placeholder="Nome interno"
                                        />
                                    </div>

                                    <TextInput
                                        label="Sottotitolo"
                                        value={editSubtitle}
                                        onChange={e => setEditSubtitle(e.target.value)}
                                        placeholder="Sottotitolo"
                                    />

                                    <TextInput
                                        label="Descrizione"
                                        value={editDescription}
                                        onChange={e => setEditDescription(e.target.value)}
                                        placeholder="Descrizione"
                                    />

                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "1fr 1fr",
                                            gap: "16px"
                                        }}
                                    >
                                        <TextInput
                                            label="Pulsante CTA"
                                            value={editCtaText}
                                            onChange={e => setEditCtaText(e.target.value)}
                                            placeholder="Testo pulsante"
                                        />
                                        <TextInput
                                            label="Link CTA"
                                            value={editCtaUrl}
                                            onChange={e => setEditCtaUrl(e.target.value)}
                                            placeholder="https://..."
                                        />
                                    </div>

                                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                        <Text variant="caption" weight={600} colorVariant="muted">
                                            Prezzo
                                        </Text>
                                        <CheckboxInput
                                            label="Questo contenuto ha un prezzo fisso"
                                            checked={editHasPrice}
                                            onChange={e => {
                                                setEditHasPrice(e.target.checked);
                                                if (!e.target.checked) setEditBundlePrice("");
                                            }}
                                        />
                                        {editHasPrice && (
                                            <TextInput
                                                type="number"
                                                min="0.01"
                                                step="0.01"
                                                value={editBundlePrice}
                                                onChange={e => setEditBundlePrice(e.target.value)}
                                                placeholder="Es: 25.00"
                                            />
                                        )}
                                    </div>

                                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                        <Text variant="caption" weight={600} colorVariant="muted">
                                            Stato
                                        </Text>
                                        <CheckboxInput
                                            label="Pubblicato"
                                            description="Il contenuto è attivo e visibile"
                                            checked={editStatus === "published"}
                                            onChange={e =>
                                                setEditStatus(e.target.checked ? "published" : "draft")
                                            }
                                        />
                                    </div>

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
                                </div>
                            )}
                        </div>
                    </Card>
                </Tabs.Panel>

                <Tabs.Panel value="products">
                    <ProductsManagerCard
                        featuredId={featuredId as string}
                        onOpenProductPicker={(linkedIds, onApply) => {
                            setLinkedProductIds(linkedIds);
                            setPendingSelectedProductIds(linkedIds);
                            onApplyProductsRef.current = onApply;
                            setIsProductPickerOpen(true);
                        }}
                    />
                </Tabs.Panel>
            </Tabs>

            <SystemDrawer open={isProductPickerOpen} onClose={closeProductPicker} width={640}>
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={700}>
                            Aggiungi prodotto
                        </Text>
                    }
                    footer={
                        <>
                            <Button variant="secondary" onClick={closeProductPicker}>
                                Annulla
                            </Button>
                            <Button
                                variant="primary"
                                onClick={applyProductSelection}
                                disabled={!hasPendingProductChanges()}
                            >
                                Applica
                            </Button>
                        </>
                    }
                >
                    <div style={{ height: "100%", minHeight: 0 }}>
                        <ProductPickerList
                            selectedProductIds={pendingSelectedProductIds}
                            onSelectionChange={setPendingSelectedProductIds}
                        />
                    </div>
                </DrawerLayout>
            </SystemDrawer>
        </div>
    );
}
