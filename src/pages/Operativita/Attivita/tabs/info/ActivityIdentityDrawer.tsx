import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { ActivityIdentityForm } from "./ActivityIdentityForm";
import type { V2Activity } from "@/types/activity";

const FORM_ID = "activity-identity-form";

type ActivityIdentityDrawerProps = {
    open: boolean;
    onClose: () => void;
    activity: V2Activity;
    tenantId: string;
    onSuccess: () => void;
};

export function ActivityIdentityDrawer({
    open,
    onClose,
    activity,
    tenantId,
    onSuccess
}: ActivityIdentityDrawerProps) {
    const [isSaving, setIsSaving] = useState(false);

    const handleSuccess = () => {
        onSuccess();
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={520}>
            <DrawerLayout
                header={
                    <div>
                        <Text variant="title-sm" weight={600}>
                            Modifica identità
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Aggiorna le informazioni principali della sede.
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
                            Salva
                        </Button>
                    </>
                }
            >
                <ActivityIdentityForm
                    formId={FORM_ID}
                    entityData={activity}
                    tenantId={tenantId}
                    onSuccess={handleSuccess}
                    onSavingChange={setIsSaving}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
