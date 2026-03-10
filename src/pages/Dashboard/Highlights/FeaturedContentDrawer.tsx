import React, { useState, useEffect } from "react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import { useToast } from "@/context/Toast/ToastContext";
import { useNavigate } from "react-router-dom";
import {
    createFeaturedContent,
    updateFeaturedContent,
    FeaturedContentWithProducts,
    FeaturedContentPricingMode,
    FeaturedContentStatus
} from "@/services/supabase/v2/featuredContents";

interface DrawerProps {
    onClose: () => void;
    onSuccess: () => void;
}

import { useTenantId } from "@/context/useTenantId";

export default function FeaturedContentDrawer({ onClose, onSuccess }: DrawerProps) {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [submitting, setSubmitting] = useState(false);

    // — Campi editoriali —
    const [internalName, setInternalName] = useState("");
    const [title, setTitle] = useState("");
    const [status, setStatus] = useState<FeaturedContentStatus>("published");

    // Reset on mount
    useEffect(() => {
        setInternalName("");
        setTitle("");
        setStatus("published");
    }, []);

    // ── Save ───────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!title.trim()) {
            showToast({ type: "error", message: "Il titolo è obbligatorio", duration: 3000 });
            return;
        }

        if (!tenantId) {
            showToast({ type: "error", message: "Utente non identificato (tenantId mancante)" });
            return;
        }

        try {
            setSubmitting(true);

            const contentData = {
                internal_name: internalName.trim() || title.trim(),
                title: title.trim(),
                pricing_mode: "none" as FeaturedContentPricingMode,
                bundle_price: null,
                status: status,
                show_original_total: false
            };

            const created = await createFeaturedContent(tenantId, contentData);
            showToast({ type: "success", message: "Contenuto creato" });
            onSuccess();
            if (created && created.id) {
                navigate(`/business/${tenantId}/featured/${created.id}`);
            }
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
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "24px",
                opacity: submitting ? 0.7 : 1,
                pointerEvents: submitting ? "none" : "auto"
            }}
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

            <input type="submit" id="featured-content-submit" style={{ display: "none" }} />
        </form>
    );
}
