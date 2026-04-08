import React, { useState, useEffect } from "react";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { useToast } from "@/context/Toast/ToastContext";
import { useNavigate } from "react-router-dom";
import {
    createFeaturedContent,
    FeaturedContentPricingMode
} from "@/services/supabase/featuredContents";
import { useTenantId } from "@/context/useTenantId";

interface DrawerProps {
    onClose: () => void;
    onSuccess: () => void;
}

export default function FeaturedContentDrawer({ onClose, onSuccess }: DrawerProps) {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [submitting, setSubmitting] = useState(false);

    const [internalName, setInternalName] = useState("");
    const [title, setTitle] = useState("");

    useEffect(() => {
        setInternalName("");
        setTitle("");
    }, []);

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
            const created = await createFeaturedContent(tenantId, {
                internal_name: internalName.trim() || title.trim(),
                title: title.trim(),
                pricing_mode: "none" as FeaturedContentPricingMode,
                bundle_price: null,
                status: "published",
                show_original_total: false
            });
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

    return (
        <form
            id="featured-content-form"
            onSubmit={e => { e.preventDefault(); handleSave(); }}
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
                    label="Titolo pubblico *"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Es: Promozione speciale"
                />
                <TextInput
                    label="Nome interno"
                    value={internalName}
                    onChange={e => setInternalName(e.target.value)}
                    placeholder="Es: RistoPromo - Sede Roma"
                />
            </div>
            <input type="submit" id="featured-content-submit" style={{ display: "none" }} />
        </form>
    );
}
