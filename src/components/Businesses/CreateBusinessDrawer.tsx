import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import { Button } from "@/components/ui/Button/Button";
import { FileInput } from "@/components/ui/Input/FileInput";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { uploadTenantLogo, updateTenantLogoUrl } from "@/services/supabase/tenants";

import { TENANT_KEY as STORAGE_KEY } from "@/constants/storageKeys";
import { SUBTYPE_OPTIONS, DEFAULT_SUBTYPE, type BusinessSubtype } from "@/constants/verticalTypes";

interface CreateBusinessDrawerProps {
    open: boolean;
    onClose: () => void;
}

export function CreateBusinessDrawer({ open, onClose }: CreateBusinessDrawerProps) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [name, setName] = useState("");
    const [subtype, setSubtype] = useState<BusinessSubtype>(DEFAULT_SUBTYPE);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleClose = () => {
        if (submitting) return;
        setName("");
        setSubtype(DEFAULT_SUBTYPE);
        setLogoFile(null);
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            showToast({
                type: "error",
                message: "Il nome dell'azienda è obbligatorio",
                duration: 3000
            });
            return;
        }

        if (!user) return;

        try {
            setSubmitting(true);

            const { data, error } = await supabase
                .from("tenants")
                .insert({ owner_user_id: user.id, name: name.trim(), vertical_type: "food_beverage", business_subtype: subtype })
                .select("id")
                .single();

            if (error) throw error;

            if (logoFile) {
                try {
                    const logoPath = await uploadTenantLogo(data.id, logoFile);
                    await updateTenantLogoUrl(data.id, logoPath);
                } catch {
                    // logo upload failure is non-blocking — tenant is created
                }
            }

            localStorage.setItem(STORAGE_KEY, data.id);
            navigate(`/business/${data.id}/overview`);
        } catch (err) {
            console.error("[CreateBusinessDrawer] creation failed:", err);
            showToast({ type: "error", message: "Errore durante la creazione dell'azienda" });
            setSubmitting(false);
        }
    };

    return (
        <SystemDrawer open={open} onClose={handleClose} width={480}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={700}>
                        Crea azienda
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={handleClose} disabled={submitting}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form="create-business-form"
                            loading={submitting}
                        >
                            Crea azienda
                        </Button>
                    </>
                }
            >
                <form
                    id="create-business-form"
                    onSubmit={handleSubmit}
                    style={{ display: "flex", flexDirection: "column", gap: "20px" }}
                >
                    <TextInput
                        label="Nome azienda"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="es. Ristorante Bellavista"
                        disabled={submitting}
                        required
                    />

                    <Select
                        label="Tipo di attività"
                        value={subtype}
                        onChange={e => setSubtype(e.target.value as BusinessSubtype)}
                        options={SUBTYPE_OPTIONS}
                        disabled={submitting}
                    />

                    <FileInput
                        label="Logo (opzionale)"
                        accept="image/png,image/jpeg,image/webp"
                        helperText="PNG, JPG o WEBP, max 5MB."
                        maxSizeMb={5}
                        onChange={setLogoFile}
                    />
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
