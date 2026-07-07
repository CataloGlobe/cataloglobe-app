import { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { StoryWithProduct } from "@/services/supabase/stories";
import { StoryForm } from "./components/StoryForm";

export type StoryFormMode = "create" | "edit";

type StoryCreateEditDrawerProps = {
    open: boolean;
    onClose: () => void;
    mode: StoryFormMode;
    storyData: StoryWithProduct | null;
    onSuccess: () => void | Promise<void>;
    tenantId?: string;
};

const FORM_ID = "story-form";

export default function StoryCreateEditDrawer({
    open,
    onClose,
    mode,
    storyData,
    onSuccess,
    tenantId
}: StoryCreateEditDrawerProps) {
    const [isSaving, setIsSaving] = useState(false);

    return (
        <SystemDrawer open={open} onClose={onClose} width={640}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={700}>
                        {mode === "edit" ? "Modifica storia" : "Nuova storia"}
                    </Text>
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
                            disabled={isSaving}
                        >
                            {isSaving ? "Salvataggio..." : mode === "edit" ? "Salva" : "Crea"}
                        </Button>
                    </>
                }
            >
                <StoryForm
                    formId={FORM_ID}
                    mode={mode}
                    storyData={storyData}
                    tenantId={tenantId ?? null}
                    onSuccess={onSuccess}
                    onSavingChange={setIsSaving}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
