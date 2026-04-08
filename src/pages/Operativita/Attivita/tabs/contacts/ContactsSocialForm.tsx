import React, { useState } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Switch } from "@/components/ui/Switch/Switch";
import { updateActivity } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import { useToast } from "@/context/Toast/ToastContext";

interface ContactsSocialFormProps {
    formId: string;
    entityData: V2Activity;
    tenantId: string;
    onSuccess: () => void | Promise<void>;
    onSavingChange?: (isSaving: boolean) => void;
}

export const ContactsSocialForm: React.FC<ContactsSocialFormProps> = ({
    formId,
    entityData,
    tenantId,
    onSuccess,
    onSavingChange
}) => {
    const { showToast } = useToast();

    const [instagram, setInstagram] = useState(entityData.instagram ?? "");
    const [facebook, setFacebook] = useState(entityData.facebook ?? "");
    const [whatsapp, setWhatsapp] = useState(entityData.whatsapp ?? "");
    const [instagramPublic, setInstagramPublic] = useState(entityData.instagram_public);
    const [facebookPublic, setFacebookPublic] = useState(entityData.facebook_public);
    const [whatsappPublic, setWhatsappPublic] = useState(entityData.whatsapp_public);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        onSavingChange?.(true);
        try {
            await updateActivity(entityData.id, tenantId, {
                instagram: instagram || null,
                facebook: facebook || null,
                whatsapp: whatsapp || null,
                instagram_public: instagramPublic,
                facebook_public: facebookPublic,
                whatsapp_public: whatsappPublic
            });
            await onSuccess();
        } catch {
            showToast({ message: "Errore nel salvataggio dei social.", type: "error" });
        } finally {
            onSavingChange?.(false);
        }
    };

    return (
        <form id={formId} onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <TextInput
                    label="Instagram"
                    value={instagram}
                    onChange={e => setInstagram(e.target.value)}
                    placeholder="@username"
                />
                <Switch
                    label="Visibile nella pagina pubblica"
                    checked={instagramPublic}
                    onChange={setInstagramPublic}
                />

                <TextInput
                    label="Facebook"
                    value={facebook}
                    onChange={e => setFacebook(e.target.value)}
                    placeholder="facebook.com/pagina"
                />
                <Switch
                    label="Visibile nella pagina pubblica"
                    checked={facebookPublic}
                    onChange={setFacebookPublic}
                />

                <TextInput
                    label="WhatsApp"
                    type="tel"
                    value={whatsapp}
                    onChange={e => setWhatsapp(e.target.value)}
                    placeholder="+39 000 000 0000"
                />
                <Switch
                    label="Visibile nella pagina pubblica"
                    checked={whatsappPublic}
                    onChange={setWhatsappPublic}
                />
            </div>
        </form>
    );
};
