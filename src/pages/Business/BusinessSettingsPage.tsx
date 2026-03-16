import { useEffect, useState } from "react";
import { useTenant } from "@/context/useTenant";
import { supabase } from "@/services/supabase/client";
import { useToast } from "@/context/Toast/ToastContext";
import Text from "@/components/ui/Text/Text";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import { Button } from "@/components/ui/Button/Button";
import { DeleteTenantDialog } from "@/components/Businesses/DeleteTenantDialog";
import { deleteTenantSoft } from "@/services/supabase/v2/tenants";
import styles from "./BusinessSettingsPage.module.scss";

const VERTICAL_OPTIONS = [
    { value: "generic", label: "Generico" },
    { value: "restaurant", label: "Ristorante" },
    { value: "bar", label: "Bar" },
    { value: "retail", label: "Negozio" },
    { value: "hotel", label: "Hotel" }
];

export default function BusinessSettingsPage() {
    const { selectedTenant, loading, userRole } = useTenant();
    const { showToast } = useToast();

    const [name, setName] = useState("");
    const [verticalType, setVerticalType] = useState("generic");
    const [saving, setSaving] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    useEffect(() => {
        if (selectedTenant) {
            setName(selectedTenant.name);
            setVerticalType(selectedTenant.vertical_type);
        }
    }, [selectedTenant?.id]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTenant) return;
        const trimmed = name.trim();
        if (!trimmed) return;

        setSaving(true);
        const { error } = await supabase
            .from("v2_tenants")
            .update({ name: trimmed, vertical_type: verticalType })
            .eq("id", selectedTenant.id);
        setSaving(false);

        if (error) {
            showToast({ message: "Errore durante il salvataggio. Riprova.", type: "error" });
        } else {
            showToast({ message: "Informazioni aggiornate.", type: "success" });
        }
    };

    const handleDeleteConfirm = async (): Promise<void> => {
        await deleteTenantSoft(selectedTenant!.id);
        // Rimuove il tenant eliminato dal localStorage prima del reload,
        // così nessun codice futuro che legga questa chiave troverà un ID stale.
        localStorage.removeItem("cg_v2_selected_tenant_id");
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
                title="Impostazioni azienda"
                subtitle="Gestisci le informazioni e le preferenze di questa azienda."
            />

            {/* Section 1 — Business info */}
            <div className={styles.section}>
                <Text variant="title-sm" weight={600}>
                    Informazioni azienda
                </Text>

                <form id="business-info-form" onSubmit={handleSave} className={styles.form}>
                    <TextInput
                        label="Nome azienda"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        required
                    />

                    <Select
                        label="Tipo di attività"
                        value={verticalType}
                        onChange={e => setVerticalType(e.target.value)}
                        options={VERTICAL_OPTIONS}
                    />
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

            {/* Section 2 — Danger zone (owner only) */}
            {userRole === "owner" && (
                <div className={`${styles.section} ${styles.dangerSection}`}>
                    <Text variant="title-sm" weight={600}>
                        Zona pericolosa
                    </Text>

                    <div className={styles.dangerRow}>
                        <div>
                            <Text variant="body" weight={500}>
                                Elimina azienda
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                L&apos;azienda verrà spostata nell&apos;area &ldquo;In eliminazione&rdquo;.
                                Potrai ripristinarla entro 30 giorni.
                            </Text>
                        </div>
                        <Button variant="danger" onClick={() => setDeleteDialogOpen(true)}>
                            Elimina azienda
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
