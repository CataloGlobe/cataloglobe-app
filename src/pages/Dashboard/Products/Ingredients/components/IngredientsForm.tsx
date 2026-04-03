import React, { useEffect, useState } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { useToast } from "@/context/Toast/ToastContext";
import {
    createIngredient,
    updateIngredient,
    V2Ingredient
} from "@/services/supabase/ingredients";
import styles from "../Ingredients.module.scss";

type IngredientsFormMode = "create" | "edit";

type IngredientsFormProps = {
    formId: string;
    mode: IngredientsFormMode;
    entityData: V2Ingredient | null;
    tenantId: string;
    onSuccess: () => void;
    onSavingChange: (saving: boolean) => void;
};

export function IngredientsForm({
    formId,
    mode,
    entityData,
    tenantId,
    onSuccess,
    onSavingChange
}: IngredientsFormProps) {
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

        const trimmedName = name.trim();
        if (!trimmedName) {
            showToast({ message: "Il nome è obbligatorio.", type: "error" });
            return;
        }

        onSavingChange(true);
        try {
            if (mode === "edit" && entityData) {
                await updateIngredient(entityData.id, tenantId, { name: trimmedName });
                showToast({ message: "Ingrediente aggiornato.", type: "success" });
            } else {
                await createIngredient(tenantId, trimmedName);
                showToast({ message: "Ingrediente creato con successo.", type: "success" });
            }
            onSuccess();
        } catch (error: unknown) {
            console.error("Errore salvataggio ingrediente:", error);
            showToast({
                message:
                    error instanceof Error
                        ? error.message
                        : "Impossibile salvare l'ingrediente.",
                type: "error"
            });
        } finally {
            onSavingChange(false);
        }
    };

    return (
        <form id={formId} className={styles.form} onSubmit={handleSubmit}>
            <TextInput
                label="Nome"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Es: Mozzarella, Basilico, Olio d'oliva..."
            />
        </form>
    );
}
