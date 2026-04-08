import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { ActivitySlugForm } from "./ActivitySlugForm";
import type { V2Activity } from "@/types/activity";

const FORM_ID = "activity-slug-form";

type ActivitySlugDrawerProps = {
    open: boolean;
    onClose: () => void;
    activity: V2Activity;
    tenantId: string;
    onSuccess: () => void;
};

export function ActivitySlugDrawer({
    open,
    onClose,
    activity,
    tenantId,
    onSuccess
}: ActivitySlugDrawerProps) {
    const [isSaving, setIsSaving] = useState(false);
    const [canSubmit, setCanSubmit] = useState(false);

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
                            Modifica indirizzo web
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Cambia l&apos;indirizzo pubblico della sede.
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
                            disabled={!canSubmit || isSaving}
                        >
                            Salva
                        </Button>
                    </>
                }
            >
                <ActivitySlugForm
                    formId={FORM_ID}
                    entityData={activity}
                    tenantId={tenantId}
                    onSuccess={handleSuccess}
                    onSavingChange={setIsSaving}
                    onCanSubmitChange={setCanSubmit}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
