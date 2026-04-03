import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { V2Ingredient } from "@/services/supabase/ingredients";
import { IngredientsForm } from "./components/IngredientsForm";
import styles from "./Ingredients.module.scss";

const FORM_ID = "ingredients-form";

type IngredientsCreateEditDrawerProps = {
    open: boolean;
    onClose: () => void;
    mode: "create" | "edit";
    ingredientData: V2Ingredient | null;
    tenantId: string;
    onSuccess: () => void;
};

export function IngredientsCreateEditDrawer({
    open,
    onClose,
    mode,
    ingredientData,
    tenantId,
    onSuccess
}: IngredientsCreateEditDrawerProps) {
    const [isSaving, setIsSaving] = useState(false);
    const isEditing = mode === "edit";

    const handleSuccess = () => {
        onSuccess();
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={420}>
            <DrawerLayout
                header={
                    <div className={styles.drawerHeader}>
                        <Text variant="title-sm" weight={600}>
                            {isEditing ? "Modifica Ingrediente" : "Nuovo Ingrediente"}
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            {isEditing
                                ? "Aggiorna il nome dell'ingrediente."
                                : "Aggiungi un nuovo ingrediente al tuo catalogo."}
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form={FORM_ID}
                            loading={isSaving}
                        >
                            {isEditing ? "Salva Modifiche" : "Crea"}
                        </Button>
                    </>
                }
            >
                <IngredientsForm
                    formId={FORM_ID}
                    mode={mode}
                    entityData={ingredientData}
                    tenantId={tenantId}
                    onSuccess={handleSuccess}
                    onSavingChange={setIsSaving}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
