import React, { useEffect, useState } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { useToast } from "@/context/Toast/ToastContext";
import { createCatalog, updateCatalog, type V2Catalog } from "@/services/supabase/catalogs";
import styles from "../Catalogs.module.scss";

type CatalogFormMode = "create" | "edit";

type CatalogFormProps = {
    formId: string;
    mode: CatalogFormMode;
    entityData: V2Catalog | null;
    /** Passato dal chiamante: il form non legge il TenantContext, così resta montabile fuori da /business/:businessId/*. */
    tenantId: string;
    onSuccess: () => void;
    onSavingChange: (saving: boolean) => void;
};

export function CatalogForm({
    formId,
    mode,
    entityData,
    tenantId,
    onSuccess,
    onSavingChange
}: CatalogFormProps) {
    const { showToast } = useToast();
    const [name, setName] = useState("");

    useEffect(() => {
        if (mode === "edit" && entityData) {
            setName(entityData.name);
        } else {
            setName("");
        }
    }, [mode, entityData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tenantId) return;
        if (!name.trim()) {
            showToast({ message: "Il nome è obbligatorio", type: "error" });
            return;
        }

        onSavingChange(true);
        try {
            if (mode === "edit" && entityData) {
                await updateCatalog(entityData.id, tenantId, { name });
                showToast({ message: "Catalogo aggiornato con successo.", type: "success" });
            } else {
                await createCatalog(tenantId, name);
                showToast({ message: "Catalogo creato con successo.", type: "success" });
            }
            onSuccess();
        } catch (error) {
            console.error("Errore salvataggio catalogo:", error);
            showToast({ message: "Errore durante il salvataggio.", type: "error" });
        } finally {
            onSavingChange(false);
        }
    };

    return (
        <form id={formId} className={styles.form} onSubmit={handleSubmit}>
            <TextInput
                label="Nome del Catalogo"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Es: Menu Cena, Asporto, Cantina dei Vini..."
            />
        </form>
    );
}
