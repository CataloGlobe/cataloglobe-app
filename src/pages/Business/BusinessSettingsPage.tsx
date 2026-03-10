import { useEffect, useState } from "react";
import { useTenant } from "@/context/useTenant";
import { supabase } from "@/services/supabase/client";
import { useToast } from "@/context/Toast/ToastContext";
import Text from "@/components/ui/Text/Text";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import { Button } from "@/components/ui/Button/Button";
import styles from "./BusinessSettingsPage.module.scss";

const VERTICAL_OPTIONS = [
    { value: "generic", label: "Generico" },
    { value: "restaurant", label: "Ristorante" },
    { value: "bar", label: "Bar" },
    { value: "retail", label: "Negozio" },
    { value: "hotel", label: "Hotel" }
];

export default function BusinessSettingsPage() {
    const { selectedTenant, loading } = useTenant();
    const { showToast } = useToast();

    const [name, setName] = useState("");
    const [verticalType, setVerticalType] = useState("generic");
    const [saving, setSaving] = useState(false);

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

    const handleDelete = () => {
        console.log("Delete business:", selectedTenant?.id);
    };

    if (loading || !selectedTenant) return null;

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

            {/* Section 2 — Danger zone */}
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
                            Questa azione è irreversibile. Tutti i dati associati verranno
                            eliminati.
                        </Text>
                    </div>
                    <Button variant="danger" onClick={handleDelete}>
                        Elimina azienda
                    </Button>
                </div>
            </div>
        </div>
    );
}
