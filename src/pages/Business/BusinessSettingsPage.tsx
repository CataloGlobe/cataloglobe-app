import { useCallback, useEffect, useState } from "react";
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
import { Card } from "@/components/ui/Card/Card";
import { FormGrid } from "@/components/ui/FormGrid";
import { FormField } from "@/components/ui/FormField/FormField";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
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
import { getActivities } from "@/services/supabase/activities";
import { TENANT_KEY } from "@/constants/storageKeys";
import { SUBTYPE_LABELS, DEFAULT_SUBTYPE } from "@/constants/verticalTypes";
import styles from "./BusinessSettingsPage.module.scss";

/**
 * Il draft della pagina (§37.4 p. 5, regola B §11): nome e dati di
 * fatturazione insieme, una sola `UnsavedChangesBar`, una sola guardia.
 * `billing` è null finché il profilo fiscale non è arrivato (o è fallito):
 * in quel caso si salva solo il nome.
 */
interface SettingsDraft {
    name: string;
    billing: BillingDraft | null;
}

type BillingStatus = "loading" | "ready" | "error";

/** «le sue 3 sedi» / «la sua sede» / «le sue sedi» finché il conteggio non c'è. */
function describeActivities(count: number | null): string {
    if (count === null || count === 0) return "le sue sedi";
    return count === 1 ? "la sua sede" : `le sue ${count} sedi`;
}

function isSameDraft(a: SettingsDraft, b: SettingsDraft): boolean {
    return a.name === b.name && JSON.stringify(a.billing) === JSON.stringify(b.billing);
}

export default function BusinessSettingsPage() {
    const { selectedTenant, loading, refreshTenants } = useTenant();
    const { permissions, loading: permissionsLoading } = usePermissions();
    const canManageTenant = permissions ? canDoOnTenant(permissions, "tenant.manage") : false;
    const canDeleteTenant = permissions ? canDoOnTenant(permissions, "tenant.delete") : false;
    const { showToast } = useToast();

    const [saved, setSaved] = useState<SettingsDraft | null>(null);
    const [draft, setDraft] = useState<SettingsDraft | null>(null);
    const [saving, setSaving] = useState(false);
    const [billingStatus, setBillingStatus] = useState<BillingStatus>("loading");
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [isSavingLogo, setIsSavingLogo] = useState(false);
    // Quante sedi se ne vanno con l'azienda (§37.4 p. 4): una lettura sola.
    const [activityCount, setActivityCount] = useState<number | null>(null);

    const tenantId = selectedTenant?.id ?? null;
    const tenantName = selectedTenant?.name ?? "";

    // Il nome arriva dalla view del tenant; i campi fiscali NON ci stanno
    // (user_tenants_view non li espone) e si leggono a parte da `tenants`.
    useEffect(() => {
        if (!tenantId) return;
        const initial: SettingsDraft = { name: tenantName, billing: null };
        setSaved(initial);
        setDraft(initial);
        // Keyed sull'id: un refresh del tenant non azzera il draft in corso.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId]);

    const loadBilling = useCallback(async () => {
        if (!tenantId) return;
        setBillingStatus("loading");
        try {
            const profile = await getTenantFiscalProfile(tenantId);
            const billing = billingDraftFromProfile(profile);
            setSaved(prev => (prev ? { ...prev, billing } : prev));
            setDraft(prev => (prev ? { ...prev, billing } : prev));
            setBillingStatus("ready");
        } catch (err) {
            console.error("[BusinessSettingsPage] fiscal profile load failed:", err);
            setBillingStatus("error");
        }
    }, [tenantId]);

    useEffect(() => {
        if (!canManageTenant) return;
        void loadBilling();
    }, [canManageTenant, loadBilling]);

    useEffect(() => {
        if (!tenantId || !canManageTenant) return;
        let cancelled = false;
        getActivities(tenantId)
            .then(list => {
                if (!cancelled) setActivityCount(list.length);
            })
            .catch(err => {
                // Il numero è un dettaglio della copy: senza, la frase resta vera.
                console.error("[BusinessSettingsPage] activities count failed:", err);
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId, canManageTenant]);

    const isDirty = draft !== null && saved !== null && !isSameDraft(draft, saved);
    const nameValid = draft !== null && draft.name.trim().length > 0;
    // La completezza fiscale si pretende solo se la fatturazione è stata
    // toccata: un profilo mai compilato non deve bloccare il cambio del nome.
    const billingChanged =
        draft !== null &&
        saved !== null &&
        draft.billing !== null &&
        JSON.stringify(draft.billing) !== JSON.stringify(saved.billing);
    const billingValid = !billingChanged || (draft?.billing ? isBillingDraftComplete(draft.billing) : true);
    const canSave = isDirty && nameValid && billingValid && !saving;
    useUnsavedChangesGuard(isDirty);

    const patchDraft = (patch: Partial<SettingsDraft>) => setDraft(prev => (prev ? { ...prev, ...patch } : prev));
    const patchBilling = (patch: Partial<BillingDraft>) =>
        setDraft(prev => (prev && prev.billing ? { ...prev, billing: { ...prev.billing, ...patch } } : prev));

    const handleCancel = () => setDraft(saved);

    const handleSave = async () => {
        if (!tenantId || !draft || !saved || !canSave) return;
        setSaving(true);
        try {
            const trimmedName = draft.name.trim();
            const nameChanged = trimmedName !== saved.name;
            if (nameChanged) {
                await updateTenantName(tenantId, trimmedName);
            }
            let billing = saved.billing;
            if (billingChanged && draft.billing) {
                await updateTenantBillingDetails(tenantId, billingDraftToPayload(draft.billing));
                billing = billingDraftFromProfile(await getTenantFiscalProfile(tenantId));
            }
            if (nameChanged) {
                await refreshTenants();
            }
            const fresh: SettingsDraft = { name: trimmedName, billing };
            setSaved(fresh);
            setDraft(fresh);
            showToast({ message: "Impostazioni aggiornate.", type: "success" });
        } catch (err) {
            // Stessa mappatura codici di SubscriptionPage: la RPC segnala con
            // il nome dell'errore.
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
            setSaving(false);
        }
    };

    usePageHeader({
        title: "Impostazioni",
        subtitle: "Nome, dati di fatturazione e logo dell'azienda; qui si elimina."
    });

    // Riceve dal wrapper l'immagine GIÀ ritagliata (baked, quadrata): carica quel
    // singolo file col servizio esistente. Nessun framing metadata persistito,
    // nessuna nuova colonna DB — tutti i consumer (sidebar, card, pagina pubblica)
    // si aspettano un logo pre-croppato, invariato.
    const handleLogoConfirm = async ({ file }: ImageUploadEditorResult) => {
        if (!tenantId || !file) return;
        setIsSavingLogo(true);
        try {
            const path = await uploadTenantLogo(tenantId, file);
            await updateTenantLogoUrl(tenantId, path);
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
        if (!tenantId) return;
        setIsSavingLogo(true);
        try {
            await updateTenantLogoUrl(tenantId, null);
            await refreshTenants();
            showToast({ message: "Logo rimosso.", type: "success" });
        } catch {
            showToast({ message: "Errore durante la rimozione. Riprova.", type: "error" });
        } finally {
            setIsSavingLogo(false);
        }
    };

    const handleDeleteConfirm = async (): Promise<void> => {
        if (!tenantId) return;
        await deleteTenantSoft(tenantId);
        // Rimuove il tenant eliminato dal localStorage prima del reload,
        // così nessun codice futuro che legga questa chiave troverà un ID stale.
        localStorage.removeItem(TENANT_KEY);
        // Reload completo: svuota TenantProvider e WorkspacePage ri-fetcha dati freschi.
        // replace evita che il back button riporti l'utente sulla pagina del tenant eliminato.
        window.location.replace("/workspace");
    };

    if (loading || !selectedTenant || permissionsLoading || !draft) {
        return (
            <div className={styles.page}>
                {[0, 1, 2, 3].map(i => (
                    <Card key={i}>
                        <div className={styles.skeletonCard}>
                            <Skeleton height="20px" width="30%" />
                            <Skeleton height="38px" />
                            <Skeleton height="38px" width="60%" />
                        </div>
                    </Card>
                ))}
            </div>
        );
    }

    if (!canManageTenant) {
        return (
            <div className={styles.page}>
                <EmptyState
                    variant="page"
                    icon={<Lock />}
                    title="Non hai accesso alle impostazioni"
                    description="Le gestiscono il proprietario e gli amministratori."
                />
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <Card title="Azienda">
                <FormGrid cols={2}>
                    <TextInput
                        label="Nome dell'azienda"
                        value={draft.name}
                        onChange={e => patchDraft({ name: e.target.value })}
                        required
                        error={nameValid ? undefined : "Il nome è obbligatorio."}
                        disabled={saving}
                    />
                    {/* «Settore» in sola lettura (§37.4 p. 2): la scheda FormField
                        prevede lo stato «testo senza bordo», il valore è un Text. */}
                    <FormField label="Settore" helperText="Scelto alla creazione. Per cambiarlo scrivi al supporto.">
                        {({ inputId, describedById }) => (
                            <Text
                                as="p"
                                id={inputId}
                                variant="body"
                                aria-describedby={describedById}
                                className={styles.readOnlyValue}
                            >
                                {SUBTYPE_LABELS[selectedTenant.business_subtype ?? DEFAULT_SUBTYPE]}
                            </Text>
                        )}
                    </FormField>
                </FormGrid>
            </Card>

            <Card
                title="Dati di fatturazione"
                subtitle="Intestano le fatture dell'abbonamento. Con la Partita IVA serve un recapito e-fattura: Codice Destinatario SDI o PEC."
            >
                {billingStatus === "error" ? (
                    <InlineBanner
                        variant="error"
                        action={
                            <Button variant="secondary" size="sm" onClick={() => void loadBilling()}>
                                Riprova
                            </Button>
                        }
                    >
                        Non riusciamo a caricare i dati di fatturazione.
                    </InlineBanner>
                ) : billingStatus === "ready" && draft.billing ? (
                    <BillingDetailsForm value={draft.billing} onChange={patchBilling} disabled={saving} />
                ) : (
                    <div className={styles.skeletonCard}>
                        <Skeleton height="38px" width="60%" />
                        <Skeleton height="38px" />
                    </div>
                )}
            </Card>

            <Card title="Logo" subtitle="Compare nel workspace, nelle pagine pubbliche e sui PDF del menù.">
                <ImageUploadEditor
                    aspectRatio={IMAGE_UPLOAD_PRESETS.logo.aspectRatio}
                    backgroundFillModes={IMAGE_UPLOAD_PRESETS.logo.backgroundFillModes}
                    maxSizeMB={IMAGE_UPLOAD_PRESETS.logo.maxSizeMB}
                    compressLongEdge={IMAGE_UPLOAD_PRESETS.logo.compressLongEdge}
                    bake={{ size: 512, format: "image/webp", quality: 0.9, fileName: "logo.webp" }}
                    fieldLabel={IMAGE_UPLOAD_PRESETS.logo.fieldLabel}
                    drawerTitle={IMAGE_UPLOAD_PRESETS.logo.drawerTitle}
                    requiresConfirm={IMAGE_UPLOAD_PRESETS.logo.requiresConfirm}
                    initialSource={selectedTenant.logo_url ? getTenantLogoPublicUrl(selectedTenant.logo_url) : null}
                    initialAspectRatio={1}
                    onConfirm={handleLogoConfirm}
                    onRemove={handleRemoveLogo}
                    removing={isSavingLogo}
                />
            </Card>

            <Card variant="danger" title="Elimina l'azienda">
                <div className={styles.dangerBody}>
                    <Text as="p" variant="body-sm" colorVariant="muted">
                        Con l&apos;azienda spariscono {describeActivities(activityCount)}, i cataloghi, i prodotti,
                        gli ordini, le prenotazioni e le recensioni; le pagine pubbliche vanno offline subito. Hai 30
                        giorni per ripristinarla dal Workspace, poi l&apos;eliminazione è definitiva.
                    </Text>
                    {!canDeleteTenant && (
                        <InlineBanner variant="info">
                            Solo il proprietario può eliminare l&apos;azienda. Se vuoi solo andartene, chiedi di essere
                            rimosso dal Team.
                        </InlineBanner>
                    )}
                    <div className={styles.dangerAction}>
                        <Button variant="danger" onClick={() => setDeleteDialogOpen(true)} disabled={!canDeleteTenant}>
                            Elimina l&apos;azienda
                        </Button>
                    </div>
                </div>
            </Card>

            <DeleteTenantDialog
                isOpen={deleteDialogOpen}
                tenantName={selectedTenant.name}
                onClose={() => setDeleteDialogOpen(false)}
                onConfirm={handleDeleteConfirm}
            />

            {isDirty && (
                <UnsavedChangesBar
                    isSaving={saving}
                    onCancel={handleCancel}
                    onSave={handleSave}
                    saveDisabled={!canSave}
                    saveLabel="Salva"
                />
            )}
        </div>
    );
}
