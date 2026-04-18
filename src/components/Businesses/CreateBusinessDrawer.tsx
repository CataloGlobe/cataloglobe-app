import { useEffect, useState } from "react";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { Select } from "@/components/ui/Select/Select";
import { Button } from "@/components/ui/Button/Button";
import { FileInput } from "@/components/ui/Input/FileInput";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { uploadTenantLogo, updateTenantLogoUrl, updateTenantName, getTenantLogoPublicUrl } from "@/services/supabase/tenants";
import { createCheckoutSession } from "@/services/supabase/billing";
import { formatPrice, MAX_SEATS } from "@/utils/pricing";

import { TENANT_KEY as STORAGE_KEY } from "@/constants/storageKeys";
import { SUBTYPE_OPTIONS, SUBTYPE_LABELS, DEFAULT_SUBTYPE, type BusinessSubtype } from "@/constants/verticalTypes";

interface CreateBusinessDrawerProps {
    open: boolean;
    onClose: () => void;
    mode?: "create" | "edit";
    tenantData?: { id: string; name: string; logo_url?: string | null; business_subtype?: BusinessSubtype | null };
    onSuccess?: () => void;
}

export function CreateBusinessDrawer({ open, onClose, mode = "create", tenantData, onSuccess }: CreateBusinessDrawerProps) {
    const { user } = useAuth();
    const { showToast } = useToast();

    const [name, setName] = useState("");
    const [subtype, setSubtype] = useState<BusinessSubtype>(DEFAULT_SUBTYPE);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [seats, setSeats] = useState(1);
    const [submitting, setSubmitting] = useState(false);

    const overLimit = seats > MAX_SEATS;

    // Sync state when drawer opens
    useEffect(() => {
        if (!open) return;
        if (mode === "edit" && tenantData) {
            setName(tenantData.name);
            setLogoFile(null);
        } else if (mode === "create") {
            setName("");
            setSubtype(DEFAULT_SUBTYPE);
            setLogoFile(null);
            setSeats(1);
        }
    }, [open, mode, tenantData?.id]);

    const handleSeatsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 1) { setSeats(1); return; }
        setSeats(val);
    };

    const handleClose = () => {
        if (submitting) return;
        setName("");
        setSubtype(DEFAULT_SUBTYPE);
        setLogoFile(null);
        setSeats(1);
        onClose();
    };

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            showToast({ type: "error", message: "Il nome dell'attività è obbligatorio", duration: 3000 });
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

            try {
                const checkoutUrl = await createCheckoutSession(
                    data.id,
                    `${window.location.origin}/business/${data.id}/overview`,
                    `${window.location.origin}/workspace`,
                    seats
                );
                window.location.href = checkoutUrl;
            } catch {
                window.location.href = `/business/${data.id}/subscription`;
            }
        } catch (err) {
            console.error("[CreateBusinessDrawer] creation failed:", err);
            showToast({ type: "error", message: "Errore durante la creazione dell'attività" });
            setSubmitting(false);
        }
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
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
                    const logoPath = await uploadTenantLogo(tenantData.id, logoFile);
                    await updateTenantLogoUrl(tenantData.id, logoPath);
                } catch {
                    // logo upload failure is non-blocking
                }
            }

            onSuccess?.();
            handleClose();
        } catch (err) {
            console.error("[CreateBusinessDrawer] edit failed:", err);
            showToast({ type: "error", message: "Errore durante il salvataggio" });
            setSubmitting(false);
        }
    };

    const isEdit = mode === "edit";
    const formId = isEdit ? "edit-business-form" : "create-business-form";

    return (
        <SystemDrawer open={open} onClose={handleClose} width={480}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={700}>
                        {isEdit ? "Modifica attività" : "Crea attività"}
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
                            disabled={!isEdit && overLimit}
                        >
                            {isEdit ? "Salva modifiche" : "Crea attività"}
                        </Button>
                    </>
                }
            >
                <form
                    id={formId}
                    onSubmit={isEdit ? handleEditSubmit : handleCreateSubmit}
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

                    {isEdit && (
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
                                {SUBTYPE_LABELS[tenantData?.business_subtype ?? DEFAULT_SUBTYPE]}
                            </span>
                            <span style={{ fontSize: "12px", color: "var(--text-muted, #94a3b8)" }}>
                                Il tipo di attività non può essere modificato dopo la creazione
                            </span>
                        </div>
                    )}

                    {!isEdit && (
                        <Select
                            label="Tipo di attività"
                            value={subtype}
                            onChange={e => setSubtype(e.target.value as BusinessSubtype)}
                            options={SUBTYPE_OPTIONS}
                            disabled={submitting}
                        />
                    )}

                    {isEdit && tenantData?.logo_url && !logoFile && (
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
                        label={isEdit ? "Cambia logo (opzionale)" : "Logo (opzionale)"}
                        accept="image/png,image/jpeg,image/webp"
                        helperText="PNG, JPG o WEBP, max 5MB."
                        maxSizeMb={5}
                        onChange={setLogoFile}
                    />

                    {!isEdit && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <NumberInput
                                label="Quante sedi ha la tua attività?"
                                value={seats}
                                onChange={handleSeatsChange}
                                min={1}
                                step={1}
                                disabled={submitting}
                            />

                            {overLimit ? (
                                <div style={{ background: "var(--hover-bg, #f1f5f9)", borderRadius: "8px", padding: "10px 12px" }}>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Per più di 25 sedi, contattaci per un preventivo personalizzato:{" "}
                                        <a href="mailto:admin@cataloglobe.com" style={{ color: "var(--brand-primary)" }}>
                                            admin@cataloglobe.com
                                        </a>
                                    </Text>
                                </div>
                            ) : (
                                <div style={{ background: "var(--hover-bg, #f1f5f9)", borderRadius: "8px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                                    <Text variant="body-sm" weight={600}>
                                        {formatPrice(seats)} · Primi 30 giorni gratuiti
                                    </Text>
                                </div>
                            )}
                        </div>
                    )}
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
