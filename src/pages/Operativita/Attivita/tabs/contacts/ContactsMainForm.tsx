import React, { useState } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Switch } from "@/components/ui/Switch/Switch";
import { updateActivity } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import { useToast } from "@/context/Toast/ToastContext";
import { GooglePlacesSearch } from "./GooglePlacesSearch";

interface ContactsMainFormProps {
    formId: string;
    entityData: V2Activity;
    tenantId: string;
    onSuccess: () => void | Promise<void>;
    onSavingChange?: (isSaving: boolean) => void;
}

export const ContactsMainForm: React.FC<ContactsMainFormProps> = ({
    formId,
    entityData,
    tenantId,
    onSuccess,
    onSavingChange
}) => {
    const { showToast } = useToast();

    const [email, setEmail] = useState(entityData.email_public ?? "");
    const [phone, setPhone] = useState(entityData.phone ?? "");
    const [website, setWebsite] = useState(entityData.website ?? "");
    const [googleReviewUrl, setGoogleReviewUrl] = useState(entityData.google_review_url ?? "");
    const [emailVisible, setEmailVisible] = useState(entityData.email_public_visible);
    const [phonePublic, setPhonePublic] = useState(entityData.phone_public);
    const [websitePublic, setWebsitePublic] = useState(entityData.website_public);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        onSavingChange?.(true);
        try {
            await updateActivity(entityData.id, tenantId, {
                email_public: email || null,
                phone: phone || null,
                website: website || null,
                google_review_url: googleReviewUrl || null,
                email_public_visible: emailVisible,
                phone_public: phonePublic,
                website_public: websitePublic
            });
            await onSuccess();
        } catch {
            showToast({ message: "Errore nel salvataggio dei contatti.", type: "error" });
        } finally {
            onSavingChange?.(false);
        }
    };

    return (
        <form id={formId} onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <TextInput
                    label="Email pubblica"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="info@esempio.it"
                />
                <Switch
                    label="Visibile nella pagina pubblica"
                    checked={emailVisible}
                    onChange={setEmailVisible}
                />

                <TextInput
                    label="Telefono"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+39 000 000 0000"
                />
                <Switch
                    label="Visibile nella pagina pubblica"
                    checked={phonePublic}
                    onChange={setPhonePublic}
                />

                <TextInput
                    label="Sito web"
                    type="url"
                    value={website}
                    onChange={e => setWebsite(e.target.value)}
                    placeholder="https://www.esempio.it"
                />
                <Switch
                    label="Visibile nella pagina pubblica"
                    checked={websitePublic}
                    onChange={setWebsitePublic}
                />

                <GooglePlacesSearch
                    value={googleReviewUrl}
                    onChange={(url) => setGoogleReviewUrl(url)}
                />
            </div>
        </form>
    );
};
