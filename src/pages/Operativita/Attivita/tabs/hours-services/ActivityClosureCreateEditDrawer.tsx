import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { ActivityClosureForm } from "./ActivityClosureForm";
import type { V2ActivityClosure } from "@/types/activity-closures";

const FORM_ID = "activity-closure-form";

type Props = {
    open: boolean;
    onClose: () => void;
    mode: "create" | "edit";
    activityId: string;
    tenantId: string;
    selectedClosure?: V2ActivityClosure;
    onSuccess: () => void | Promise<void>;
};

export function ActivityClosureCreateEditDrawer({
    open,
    onClose,
    mode,
    activityId,
    tenantId,
    selectedClosure,
    onSuccess,
}: Props) {
    const [isSaving, setIsSaving] = useState(false);

    const handleSuccess = async () => {
        await onSuccess();
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={520}>
            <DrawerLayout
                header={
                    <div>
                        <Text variant="title-sm" weight={600}>
                            {mode === "create" ? "Nuova chiusura straordinaria" : "Modifica chiusura"}
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            {mode === "create"
                                ? "Aggiungi una data di chiusura o con orari speciali."
                                : "Modifica i dettagli di questa chiusura."}
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
                            {mode === "create" ? "Aggiungi chiusura" : "Salva modifiche"}
                        </Button>
                    </>
                }
            >
                <ActivityClosureForm
                    formId={FORM_ID}
                    mode={mode}
                    activityId={activityId}
                    entityData={selectedClosure}
                    tenantId={tenantId}
                    onSuccess={handleSuccess}
                    onSavingChange={setIsSaving}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
