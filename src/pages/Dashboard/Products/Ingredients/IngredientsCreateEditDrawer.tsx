import { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { V2Ingredient } from "@/services/supabase/ingredients";
import { IngredientsForm } from "./components/IngredientsForm";

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
        <SystemDrawer open={open} onClose={onClose} size="sm">
            <DrawerLayout
                title={isEditing ? "Rinomina ingrediente" : "Nuovo ingrediente"}
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
                            {isEditing ? "Salva" : "Crea"}
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
