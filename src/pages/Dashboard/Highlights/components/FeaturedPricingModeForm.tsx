// src/pages/Dashboard/Highlights/components/FeaturedPricingModeForm.tsx
import React, { useState, useEffect } from "react";
import { Megaphone, CalendarDays, Tag, Package } from "lucide-react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Switch } from "@/components/ui/Switch/Switch";
import {
    updateFeaturedContent,
    type FeaturedContent,
    type FeaturedContentPricingMode,
    type FeaturedContentType
} from "@/services/supabase/featuredContents";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./FeaturedPricingModeForm.module.scss";

type ContentTypeOption = {
    value: FeaturedContentType;
    label: string;
    description: string;
    icon: React.ReactNode;
    pricingMode: FeaturedContentPricingMode;
};

const CONTENT_TYPE_OPTIONS: ContentTypeOption[] = [
    {
        value: "announcement",
        label: "Annuncio",
        description: "Comunica un'informazione, una novità o un avviso.",
        icon: <Megaphone size={20} strokeWidth={1.75} />,
        pricingMode: "none"
    },
    {
        value: "event",
        label: "Evento",
        description: "Promuovi una serata, un'inaugurazione o un'occasione speciale.",
        icon: <CalendarDays size={20} strokeWidth={1.75} />,
        pricingMode: "none"
    },
    {
        value: "promo",
        label: "Promo",
        description: "Metti in evidenza una selezione di prodotti con i loro prezzi.",
        icon: <Tag size={20} strokeWidth={1.75} />,
        pricingMode: "per_item"
    },
    {
        value: "bundle",
        label: "Bundle",
        description: "Proponi un pacchetto di prodotti a prezzo fisso.",
        icon: <Package size={20} strokeWidth={1.75} />,
        pricingMode: "bundle"
    }
];

type Props = {
    formId: string;
    entityData: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
    onSavingChange: (saving: boolean) => void;
};

export function FeaturedPricingModeForm({
    formId,
    entityData,
    tenantId,
    onSuccess,
    onSavingChange
}: Props) {
    const { showToast } = useToast();
    const [contentType, setContentType] = useState<FeaturedContentType>(
        entityData.content_type ?? "announcement"
    );
    const [bundlePrice, setBundlePrice] = useState(
        entityData.bundle_price != null ? String(entityData.bundle_price) : ""
    );
    const [showOriginalTotal, setShowOriginalTotal] = useState(entityData.show_original_total);
    const [showImages, setShowImages] = useState(entityData.layout_style === "with_images");

    useEffect(() => {
        setContentType(entityData.content_type ?? "announcement");
        setBundlePrice(entityData.bundle_price != null ? String(entityData.bundle_price) : "");
        setShowOriginalTotal(entityData.show_original_total);
        setShowImages(entityData.layout_style === "with_images");
    }, [entityData]);

    const selectedOption = CONTENT_TYPE_OPTIONS.find(o => o.value === contentType)!;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (contentType === "bundle") {
            const price = parseFloat(bundlePrice);
            if (!Number.isFinite(price) || price <= 0) {
                showToast({ message: "Inserisci il prezzo del bundle per salvare.", type: "error" });
                return;
            }
        }
        onSavingChange(true);
        try {
            const pricingMode = selectedOption.pricingMode;
            const bundlePriceNum = contentType === "bundle" ? parseFloat(bundlePrice) : null;
            const layoutStyle =
                (contentType === "promo" || contentType === "bundle") && showImages
                    ? "with_images"
                    : null;
            await updateFeaturedContent(entityData.id, tenantId, {
                content_type: contentType,
                pricing_mode: pricingMode,
                bundle_price: bundlePriceNum,
                show_original_total: contentType === "bundle" ? showOriginalTotal : false,
                layout_style: layoutStyle
            });
            showToast({ message: "Tipo aggiornato.", type: "success" });
            onSuccess();
        } catch (err) {
            console.error(err);
            showToast({ message: "Errore durante il salvataggio.", type: "error" });
        } finally {
            onSavingChange(false);
        }
    };

    return (
        <form id={formId} onSubmit={handleSubmit}>
            <div className={styles.formFields}>
                <div className={styles.pricingOptions}>
                    {CONTENT_TYPE_OPTIONS.map(opt => (
                        <div
                            key={opt.value}
                            className={`${styles.pricingCard} ${
                                contentType === opt.value ? styles.pricingCardSelected : ""
                            }`}
                            onClick={() => setContentType(opt.value)}
                        >
                            <span className={styles.pricingCardIcon}>{opt.icon}</span>
                            <span className={styles.pricingCardLabel}>{opt.label}</span>
                            <span className={styles.pricingCardDescription}>{opt.description}</span>
                        </div>
                    ))}
                </div>

                {contentType === "bundle" && (
                    <div className={styles.pricingExtra}>
                        <TextInput
                            label="Prezzo fisso (€) *"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={bundlePrice}
                            onChange={e => setBundlePrice(e.target.value)}
                            placeholder="Es: 25.00"
                        />
                        <Switch
                            label="Mostra totale originale barrato"
                            description="Mostra la somma dei prezzi singoli barrata accanto al prezzo bundle"
                            checked={showOriginalTotal}
                            onChange={setShowOriginalTotal}
                        />
                    </div>
                )}

                {(contentType === "promo" || contentType === "bundle") && (
                    <Switch
                        label="Mostra immagini prodotti"
                        description="Mostra le immagini dei prodotti nel contenuto in evidenza"
                        checked={showImages}
                        onChange={setShowImages}
                    />
                )}
            </div>
        </form>
    );
}
