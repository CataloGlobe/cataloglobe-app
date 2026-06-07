import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui/Button/Button";
import { FileInput } from "@/components/ui/Input/FileInput";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import {
    uploadTenantLogo,
    updateTenantLogoUrl,
    updateTenantName,
    getTenantLogoPublicUrl,
} from "@/services/supabase/tenants";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";

import { SUBTYPE_LABELS, DEFAULT_SUBTYPE, type BusinessSubtype } from "@/constants/verticalTypes";

interface CreateBusinessDrawerProps {
    open: boolean;
    onClose: () => void;
    tenantData: {
        id: string;
        name: string;
        logo_url?: string | null;
        business_subtype?: BusinessSubtype | null;
    } | null;
    onSuccess?: () => void;
}

/**
 * Edit-only drawer for an existing tenant (rename + change logo).
 * Creation flow lives in CreateBusinessWizard.
 */
export function CreateBusinessDrawer({ open, onClose, tenantData, onSuccess }: CreateBusinessDrawerProps) {
    const { showToast } = useToast();

    const [name, setName] = useState("");
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open || !tenantData) return;
        setName(tenantData.name);
        setLogoFile(null);
        setSubmitting(false);
    }, [open, tenantData?.id]);

    const handleClose = () => {
        if (submitting) return;
        setName("");
        setLogoFile(null);
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            showToast({ type: "error", message: "Il nome dell'attività è obbligatorio", duration: 3000 });
            return;
        }

        if (!tenantData) return;

        try {
            setSubmitting(true);

            await updateTenantName(tenantData.id, name.trim());

            if (logoFile) {
                try {
                    const compressed = await compressImage(logoFile, COMPRESS_PROFILES.logo);
                    const logoPath = await uploadTenantLogo(tenantData.id, compressed);
                    await updateTenantLogoUrl(tenantData.id, logoPath);
                } catch (logoErr) {
                    console.error("[CreateBusinessDrawer] logo upload failed:", logoErr);
                    showToast({
                        type: "warning",
                        message: "Non è stato possibile caricare il logo. Puoi riprovare dalle impostazioni dell'attività.",
                    });
                }
            }

            onSuccess?.();
            handleClose();
        } catch (err) {
            console.error("[CreateBusinessDrawer] edit failed:", err);
            showToast({ type: "error", message: "Errore durante il salvataggio" });
        } finally {
            setSubmitting(false);
        }
    };

    const formId = "edit-business-form";
    const subtype = tenantData?.business_subtype ?? DEFAULT_SUBTYPE;

    return (
        <SystemDrawer open={open} onClose={handleClose} width={480}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={700}>
                        Modifica attività
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
                            form={formId}
                            loading={submitting}
                        >
                            Salva modifiche
                        </Button>
                    </>
                }
            >
                <form
                    id={formId}
                    onSubmit={handleSubmit}
                    style={{ display: "flex", flexDirection: "column", gap: "20px" }}
                >
                    <TextInput
                        label="Nome attività"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="es. Ristorante Bellavista"
                        disabled={submitting}
                        required
                    />

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <Text variant="body-sm" weight={500}>Tipo di attività</Text>
                        <span style={{
                            background: "#f1f5f9",
                            color: "#475569",
                            fontSize: "11px",
                            fontWeight: 500,
                            borderRadius: "4px",
                            padding: "1px 8px",
                            lineHeight: 1.6,
                            whiteSpace: "nowrap",
                            display: "inline-block",
                            width: "fit-content",
                        }}>
                            {SUBTYPE_LABELS[subtype]}
                        </span>
                        <span style={{ fontSize: "12px", color: "var(--text-muted, #94a3b8)" }}>
                            Il tipo di attività non può essere modificato dopo la creazione
                        </span>
                    </div>

                    {tenantData?.logo_url && !logoFile && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <Text variant="body-sm" weight={600}>Logo attuale</Text>
                            <img
                                src={getTenantLogoPublicUrl(tenantData.logo_url)}
                                alt="Logo attuale"
                                style={{ width: 64, height: 64, objectFit: "contain", borderRadius: 8, border: "1px solid var(--border-color)" }}
                            />
                        </div>
                    )}

                    <FileInput
                        label="Cambia logo (opzionale)"
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
