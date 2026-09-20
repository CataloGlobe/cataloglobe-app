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
import {
    ImageUploadEditor,
    IMAGE_UPLOAD_PRESETS,
    type ImageUploadEditorResult
} from "@/components/ui/ImageUploadEditor";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard/SectionCard";
import { UnsavedChangesBar } from "@/components/ui/UnsavedChangesBar/UnsavedChangesBar";
import { useUnsavedChangesGuard } from "@/components/ui/UnsavedChangesBar/useUnsavedChangesGuard";
import { DeleteTenantDialog } from "@/components/Businesses/DeleteTenantDialog";
import { BillingDetailsForm } from "./components/BillingDetailsForm";
import {
    billingDraftFromProfile,
    billingDraftToPayload,
    isBillingDraftComplete,
    type BillingDraft
} from "./components/billingDraft";
import {
    deleteTenantSoft,
    getTenantFiscalProfile,
    getTenantLogoPublicUrl,
    updateTenantBillingDetails,
    updateTenantLogoUrl,
    updateTenantName,
    uploadTenantLogo
} from "@/services/supabase/tenants";
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

    const [isSavingLogo, setIsSavingLogo] = useState(false);

    // Dati di fatturazione: draft inline + UnsavedChangesBar. I campi fiscali
    // NON sono esposti da user_tenants_view (quindi non stanno su
    // selectedTenant): si leggono da `tenants` via getTenantFiscalProfile.
    const [billingSaved, setBillingSaved] = useState<BillingDraft | null>(null);
    const [billingDraft, setBillingDraft] = useState<BillingDraft | null>(null);
    const [billingSaving, setBillingSaving] = useState(false);

    useEffect(() => {
        if (selectedTenant) {
            setName(selectedTenant.name);
        }
    }, [selectedTenant?.id]);

    useEffect(() => {
        if (!selectedTenant || !canManageTenant) return;
        let cancelled = false;
        void getTenantFiscalProfile(selectedTenant.id)
            .then(profile => {
                if (cancelled) return;
                const draft = billingDraftFromProfile(profile);
                setBillingSaved(draft);
                setBillingDraft(draft);
            })
            .catch(err => {
                console.error("[BusinessSettingsPage] fiscal profile load failed:", err);
            });
        return () => {
            cancelled = true;
        };
        // Keyed sull'id (come l'effect `name` sopra): ricaricare a ogni cambio di
        // identità dell'oggetto tenant sarebbe inutile.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTenant?.id, canManageTenant]);

    const billingDirty =
        billingDraft !== null &&
        billingSaved !== null &&
        JSON.stringify(billingDraft) !== JSON.stringify(billingSaved);
    const billingCanSave =
        billingDirty && billingDraft !== null && isBillingDraftComplete(billingDraft) && !billingSaving;
    useUnsavedChangesGuard(billingDirty);

    const patchBillingDraft = (patch: Partial<BillingDraft>) =>
        setBillingDraft(prev => (prev ? { ...prev, ...patch } : prev));

    const handleBillingCancel = () => setBillingDraft(billingSaved);

    const handleBillingSave = async () => {
        if (!selectedTenant || !billingDraft || !billingCanSave) return;
        setBillingSaving(true);
        try {
            await updateTenantBillingDetails(selectedTenant.id, billingDraftToPayload(billingDraft));
            const profile = await getTenantFiscalProfile(selectedTenant.id);
            const fresh = billingDraftFromProfile(profile);
            setBillingSaved(fresh);
            setBillingDraft(fresh);
            showToast({ message: "Dati di fatturazione aggiornati.", type: "success" });
        } catch (err) {
            // Stessa mappatura codici di SubscriptionPage. La RPC oggi non valida
            // la P.IVA lato server (migration separata da fare — TODO sotto): il
            // blocco resta lato FE via `isBillingDraftComplete`.
            const code = err instanceof Error ? err.name : "";
            if (code === "invalid_vat_number") {
                showToast({ message: "La Partita IVA non è valida. Controllala e riprova.", type: "error" });
            } else if (code === "missing_einvoice_recipient") {
                showToast({
                    message: "Con la Partita IVA serve un recapito: aggiungi il Codice Destinatario SDI o la PEC.",
                    type: "error"
                });
            } else {
                showToast({ message: "Errore durante il salvataggio. Riprova.", type: "error" });
            }
        } finally {
            setBillingSaving(false);
        }
    };

    usePageHeader({
        title: "Impostazioni attività",
        subtitle: "Gestisci le informazioni e le preferenze di questa attività.",
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

    // Riceve dal wrapper l'immagine GIÀ ritagliata (baked, quadrata): carica quel
    // singolo file col servizio esistente. Nessun framing metadata persistito,
    // nessuna nuova colonna DB — tutti i consumer (sidebar, card, pagina pubblica)
    // si aspettano un logo pre-croppato, invariato.
    const handleLogoConfirm = async ({ file }: ImageUploadEditorResult) => {
        if (!selectedTenant || !file) return;
        setIsSavingLogo(true);
        try {
            const path = await uploadTenantLogo(selectedTenant.id, file);
            await updateTenantLogoUrl(selectedTenant.id, path);
            await refreshTenants();
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

            {/* Section — Dati di fatturazione (owner + admin via tenant.manage) */}
            {canManageTenant && billingDraft && (
                <SectionCard
                    title="Dati di fatturazione"
                    subtitle="Intestano le fatture del tuo abbonamento. Con la Partita IVA serve un recapito e-fattura (Codice Destinatario SDI o PEC)."
                >
                    <BillingDetailsForm
                        value={billingDraft}
                        onChange={patchBillingDraft}
                        disabled={billingSaving}
                    />
                </SectionCard>
            )}

            {/* Section 2 — Logo (owner + admin via tenant.manage) */}
            {canManageTenant && (
                <div className={styles.section}>
                    <Text variant="title-sm" weight={600}>
                        Identità visiva
                    </Text>

                    <ImageUploadEditor
                        aspectRatio={IMAGE_UPLOAD_PRESETS.logo.aspectRatio}
                        backgroundFillModes={IMAGE_UPLOAD_PRESETS.logo.backgroundFillModes}
                        maxSizeMB={IMAGE_UPLOAD_PRESETS.logo.maxSizeMB}
                        compressLongEdge={IMAGE_UPLOAD_PRESETS.logo.compressLongEdge}
                        bake={{ size: 512, format: "image/webp", quality: 0.9, fileName: "logo.webp" }}
                        fieldLabel={IMAGE_UPLOAD_PRESETS.logo.fieldLabel}
                        drawerTitle={IMAGE_UPLOAD_PRESETS.logo.drawerTitle}
                        requiresConfirm={IMAGE_UPLOAD_PRESETS.logo.requiresConfirm}
                        initialSource={
                            selectedTenant.logo_url
                                ? getTenantLogoPublicUrl(selectedTenant.logo_url)
                                : null
                        }
                        initialAspectRatio={1}
                        onConfirm={handleLogoConfirm}
                        onRemove={handleRemoveLogo}
                        removing={isSavingLogo}
                    />
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

            {billingDirty && (
                <UnsavedChangesBar
                    isSaving={billingSaving}
                    onCancel={handleBillingCancel}
                    onSave={handleBillingSave}
                    saveDisabled={!billingCanSave}
                    saveLabel="Salva"
                />
            )}
        </div>
    );
}
