import { useEffect, useState } from "react";
import { useTenant } from "@/context/useTenant";
import { supabase } from "@/services/supabase/client";
import { useToast } from "@/context/Toast/ToastContext";
import Text from "@/components/ui/Text/Text";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui/Button/Button";
import { FileInput } from "@/components/ui/Input/FileInput";
import { DeleteTenantDialog } from "@/components/Businesses/DeleteTenantDialog";
import { deleteTenantSoft, getTenantLogoPublicUrl, updateTenantLogoUrl, uploadTenantLogo } from "@/services/supabase/tenants";
import { TENANT_KEY } from "@/constants/storageKeys";
import { SUBTYPE_LABELS, DEFAULT_SUBTYPE } from "@/constants/verticalTypes";
import styles from "./BusinessSettingsPage.module.scss";

export default function BusinessSettingsPage() {
    const { selectedTenant, loading, userRole, refreshTenants } = useTenant();
    const { showToast } = useToast();

    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [isSavingLogo, setIsSavingLogo] = useState(false);

    useEffect(() => {
        if (selectedTenant) {
            setName(selectedTenant.name);
        }
    }, [selectedTenant?.id]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTenant) return;
        const trimmed = name.trim();
        if (!trimmed) return;

        setSaving(true);
        const { error } = await supabase
            .from("tenants")
            .update({ name: trimmed })
            .eq("id", selectedTenant.id);
        setSaving(false);

        if (error) {
            showToast({ message: "Errore durante il salvataggio. Riprova.", type: "error" });
        } else {
            showToast({ message: "Informazioni aggiornate.", type: "success" });
        }
    };

    const handleLogoFileChange = (file: File | null) => {
        setLogoFile(file);
        if (file) {
            setLogoPreview(URL.createObjectURL(file));
        } else {
            setLogoPreview(null);
        }
    };

    const handleSaveLogo = async () => {
        if (!selectedTenant || !logoFile) return;
        setIsSavingLogo(true);
        try {
            const path = await uploadTenantLogo(selectedTenant.id, logoFile);
            await updateTenantLogoUrl(selectedTenant.id, path);
            await refreshTenants();
            setLogoFile(null);
            setLogoPreview(null);
            showToast({ message: "Logo aggiornato.", type: "success" });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Errore durante il salvataggio. Riprova.";
            showToast({ message, type: "error" });
        } finally {
            setIsSavingLogo(false);
        }
    };

    const handleRemoveLogo = async () => {
        if (!selectedTenant) return;
        setIsSavingLogo(true);
        try {
            await updateTenantLogoUrl(selectedTenant.id, null);
            await refreshTenants();
            showToast({ message: "Logo rimosso.", type: "success" });
        } catch {
            showToast({ message: "Errore durante la rimozione. Riprova.", type: "error" });
        } finally {
            setIsSavingLogo(false);
        }
    };

    const handleDeleteConfirm = async (): Promise<void> => {
        await deleteTenantSoft(selectedTenant!.id);
        // Rimuove il tenant eliminato dal localStorage prima del reload,
        // così nessun codice futuro che legga questa chiave troverà un ID stale.
        localStorage.removeItem(TENANT_KEY);
        // Reload completo: svuota TenantProvider e WorkspacePage ri-fetcha dati freschi.
        // replace evita che il back button riporti l'utente sulla pagina del tenant eliminato.
        window.location.replace("/workspace");
    };

    if (loading || !selectedTenant) return null;

    if (userRole === "member") {
        return (
            <div className="p-6">
                <h2 className="text-lg font-semibold">Accesso limitato</h2>
                <p className="text-sm text-muted-foreground">
                    Solo il proprietario del business può modificare queste impostazioni.
                </p>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <PageHeader
                title="Impostazioni attività"
                subtitle="Gestisci le informazioni e le preferenze di questa attività."
            />

            {/* Section 1 — Business info */}
            <div className={styles.section}>
                <Text variant="title-sm" weight={600}>
                    Informazioni attività
                </Text>

                <form id="business-info-form" onSubmit={handleSave} className={styles.form}>
                    <TextInput
                        label="Nome attività"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        required
                    />

                    <div className={styles.readOnlyField}>
                        <Text variant="body-sm" weight={500}>Tipo di attività</Text>
                        <span className={styles.typePill}>
                            {SUBTYPE_LABELS[selectedTenant.business_subtype ?? DEFAULT_SUBTYPE]}
                        </span>
                        <span className={styles.readOnlyHint}>
                            Il tipo di attività non può essere modificato dopo la creazione
                        </span>
                    </div>
                </form>

                <div className={styles.sectionFooter}>
                    <Button
                        type="submit"
                        form="business-info-form"
                        variant="primary"
                        disabled={saving || !name.trim()}
                    >
                        {saving ? "Salvataggio..." : "Salva modifiche"}
                    </Button>
                </div>
            </div>

            {/* Section 2 — Logo (owner only) */}
            {userRole === "owner" && (
                <div className={styles.section}>
                    <Text variant="title-sm" weight={600}>
                        Identità visiva
                    </Text>

                    {(logoPreview ?? selectedTenant?.logo_url) && (
                        <img
                            src={logoPreview ?? getTenantLogoPublicUrl(selectedTenant!.logo_url!)}
                            alt="Logo attività"
                            className={styles.logoPreview}
                        />
                    )}

                    <FileInput
                        label="Logo attività"
                        accept="image/png,image/jpeg,image/webp"
                        helperText="PNG, JPG o WEBP, max 5MB."
                        maxSizeMb={5}
                        onChange={handleLogoFileChange}
                    />

                    <div className={styles.sectionFooter}>
                        {selectedTenant?.logo_url && !logoFile && (
                            <Button
                                variant="danger"
                                onClick={handleRemoveLogo}
                                disabled={isSavingLogo}
                            >
                                {isSavingLogo ? "Rimozione..." : "Rimuovi logo"}
                            </Button>
                        )}
                        {logoFile && (
                            <Button
                                variant="primary"
                                onClick={handleSaveLogo}
                                disabled={isSavingLogo}
                            >
                                {isSavingLogo ? "Salvataggio..." : "Salva logo"}
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Section 3 — Danger zone (owner only) */}
            {userRole === "owner" && (
                <div className={`${styles.section} ${styles.dangerSection}`}>
                    <Text variant="title-sm" weight={600}>
                        Zona pericolosa
                    </Text>

                    <div className={styles.dangerRow}>
                        <div>
                            <Text variant="body" weight={500}>
                                Elimina attività
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                L&apos;attività verrà spostata nell&apos;area &ldquo;In eliminazione&rdquo;.
                                Potrai ripristinarla entro 30 giorni.
                            </Text>
                        </div>
                        <Button variant="danger" onClick={() => setDeleteDialogOpen(true)}>
                            Elimina attività
                        </Button>
                    </div>
                </div>
            )}

            <DeleteTenantDialog
                isOpen={deleteDialogOpen}
                tenantName={selectedTenant.name}
                onClose={() => setDeleteDialogOpen(false)}
                onConfirm={handleDeleteConfirm}
            />
        </div>
    );
}
