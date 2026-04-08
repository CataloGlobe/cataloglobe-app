// src/pages/Dashboard/Highlights/components/FeaturedPricingModeForm.tsx
import React, { useState, useEffect } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Switch } from "@/components/ui/Switch/Switch";
import {
    updateFeaturedContent,
    type FeaturedContent,
    type FeaturedContentPricingMode
} from "@/services/supabase/featuredContents";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./FeaturedPricingModeForm.module.scss";

const PRICING_OPTIONS: {
    value: FeaturedContentPricingMode;
    label: string;
    description: string;
}[] = [
    {
        value: "none",
        label: "Solo informativo",
        description: "Banner editoriale senza listino prezzi. Titolo, testo e CTA."
    },
    {
        value: "per_item",
        label: "Con prodotti",
        description: "Mostra una lista di prodotti con il loro prezzo singolo."
    },
    {
        value: "bundle",
        label: "Prezzo fisso",
        description: "Aggrega prodotti con un unico prezzo bundle definito da te."
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
    const [pricingMode, setPricingMode] = useState<FeaturedContentPricingMode>(
        entityData.pricing_mode
    );
    const [bundlePrice, setBundlePrice] = useState(
        entityData.bundle_price != null ? String(entityData.bundle_price) : ""
    );
    const [showOriginalTotal, setShowOriginalTotal] = useState(entityData.show_original_total);

    useEffect(() => {
        setPricingMode(entityData.pricing_mode);
        setBundlePrice(entityData.bundle_price != null ? String(entityData.bundle_price) : "");
        setShowOriginalTotal(entityData.show_original_total);
    }, [entityData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pricingMode === "bundle") {
            const price = parseFloat(bundlePrice);
            if (!Number.isFinite(price) || price <= 0) {
                showToast({ message: "Inserisci il prezzo del bundle per salvare.", type: "error" });
                return;
            }
        }
        onSavingChange(true);
        try {
            const bundlePriceNum =
                pricingMode === "bundle" ? parseFloat(bundlePrice) : null;
            await updateFeaturedContent(entityData.id, tenantId, {
                pricing_mode: pricingMode,
                bundle_price: bundlePriceNum,
                show_original_total: pricingMode === "bundle" ? showOriginalTotal : false
            });
            showToast({ message: "Modalità aggiornata.", type: "success" });
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
                    {PRICING_OPTIONS.map(opt => (
                        <div
                            key={opt.value}
                            className={`${styles.pricingCard} ${
                                pricingMode === opt.value ? styles.pricingCardSelected : ""
                            }`}
                            onClick={() => setPricingMode(opt.value)}
                        >
                            <span className={styles.pricingCardLabel}>{opt.label}</span>
                            <span className={styles.pricingCardDescription}>{opt.description}</span>
                        </div>
                    ))}
                </div>

                {pricingMode === "bundle" && (
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
            </div>
        </form>
    );
}
