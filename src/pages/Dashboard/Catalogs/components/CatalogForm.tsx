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
    /**
     * «Menù» o «Catalogo» (§22): per lo stesso motivo del `tenantId`, lo
     * passa chi conosce il verticale. Default «Menù», il verticale di default.
     */
    catalogLabel?: string;
    placeholder?: string;
    /**
     * Riceve il catalogo salvato (creato o aggiornato): è l'unico punto in cui
     * il chiamante può conoscerne id e nome, che restano altrimenti nello stato
     * interno del form. Chi non ne ha bisogno può ignorare l'argomento.
     */
    onSuccess: (catalog: V2Catalog) => void;
    onSavingChange: (saving: boolean) => void;
};

export function CatalogForm({
    formId,
    mode,
    entityData,
    tenantId,
    catalogLabel = "Menù",
    placeholder = "Es. Pranzo, Cena, Brunch",
    onSuccess,
    onSavingChange
}: CatalogFormProps) {
    const { showToast } = useToast();
    const [name, setName] = useState("");
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
        setName(mode === "edit" && entityData ? entityData.name : "");
        setError(undefined);
    }, [mode, entityData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tenantId) return;
        const trimmed = name.trim();
        if (!trimmed) {
            setError("Scrivi un nome.");
            return;
        }

        onSavingChange(true);
        try {
            let saved: V2Catalog;
            if (mode === "edit" && entityData) {
                saved = await updateCatalog(entityData.id, tenantId, { name: trimmed });
                showToast({ message: `${catalogLabel} rinominato.`, type: "success" });
            } else {
                saved = await createCatalog(tenantId, trimmed);
                showToast({ message: `${catalogLabel} creato.`, type: "success" });
            }
            onSuccess(saved);
        } catch (error) {
            console.error("Errore salvataggio catalogo:", error);
            showToast({ message: "Errore durante il salvataggio.", type: "error" });
        } finally {
            onSavingChange(false);
        }
    };

    return (
        <form id={formId} className={styles.form} onSubmit={handleSubmit} noValidate>
            <TextInput
                label="Nome"
                required
                value={name}
                onChange={e => {
                    setName(e.target.value);
                    if (error) setError(undefined);
                }}
                error={error}
                placeholder={placeholder}
            />
        </form>
    );
}
