import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import Text from "@/components/ui/Text/Text";
import { usePageHeader } from "@/context/usePageHeader";
import { canDoOnTenant } from "@/lib/permissions";
import { usePermissions } from "@/context/PermissionsContext";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui/Button/Button";
import { FileInput } from "@/components/ui/Input/FileInput";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { DeleteTenantDialog } from "@/components/Businesses/DeleteTenantDialog";
import {
    deleteTenantSoft,
    getTenantLogoPublicUrl,
    updateTenantLogoUrl,
    updateTenantName,
    uploadTenantLogo
} from "@/services/supabase/tenants";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import { TENANT_KEY } from "@/constants/storageKeys";
import { SUBTYPE_LABELS, DEFAULT_SUBTYPE } from "@/constants/verticalTypes";
import styles from "./BusinessSettingsPage.module.scss";

export default function BusinessSettingsPage() {
    const { selectedTenant, loading, refreshTenants } = useTenant();
    const { permissions, loading: permissionsLoading } = usePermissions();
    const canManageTenant = permissions ? canDoOnTenant(permissions, "tenant.manage") : false;
    const canDeleteTenant = permissions ? canDoOnTenant(permissions, "tenant.delete") : false;
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

    usePageHeader({
        title: "Impostazioni attività",
        subtitle: "Gestisci le informazioni e le preferenze di questa attività.",
        sticky: true,
    });

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTenant) return;
        const trimmed = name.trim();
        if (!trimmed) return;

        setSaving(true);
        try {
            await updateTenantName(selectedTenant.id, trimmed);
            await refreshTenants();
            showToast({ message: "Informazioni aggiornate.", type: "success" });
        } catch {
            showToast({ message: "Errore durante il salvataggio. Riprova.", type: "error" });
        } finally {
            setSaving(false);
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
            const path = await uploadTenantLogo(selectedTenant.id, await compressImage(logoFile, COMPRESS_PROFILES.logo));
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

    if (!permissionsLoading && permissions && !canManageTenant) {
        return (
            <div className={styles.page}>
                <div className={styles.emptyWrap}>
                    <EmptyState
                        icon={<Lock size={40} strokeWidth={1.5} />}
                        title="Non hai accesso alle impostazioni"
                        description="Le impostazioni dell'attività sono riservate a proprietario e amministratori. Contatta un amministratore se hai bisogno di apportare modifiche."
                    />
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            {/* Section 1 — Business info (owner + admin via tenant.manage) */}
            {canManageTenant && (
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
            )}

            {/* Section 2 — Logo (owner + admin via tenant.manage) */}
            {canManageTenant && (
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

            {/* Section 3 — Danger zone */}
            {canManageTenant && (
                <div className={`${styles.section} ${styles.dangerSection}`}>
                    <Text variant="title-sm" weight={600}>
                        Zona pericolosa
                    </Text>

                    {!canDeleteTenant && (
                        <InlineBanner variant="info">
                            Solo il proprietario può eliminare l&apos;azienda.
                        </InlineBanner>
                    )}

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
                        <Button
                            variant="danger"
                            onClick={() => setDeleteDialogOpen(true)}
                            disabled={!canDeleteTenant}
                        >
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
