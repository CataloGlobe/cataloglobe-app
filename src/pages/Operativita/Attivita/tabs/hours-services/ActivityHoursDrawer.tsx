import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { ActivityHoursForm } from "./ActivityHoursForm";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";

const FORM_ID = "activity-hours-form";

type ActivityHoursDrawerProps = {
    open: boolean;
    onClose: () => void;
    hours: V2ActivityHours[];
    activity: V2Activity;
    tenantId: string;
    onSuccess: () => void | Promise<void>;
};

export function ActivityHoursDrawer({
    open,
    onClose,
    hours,
    activity,
    tenantId,
    onSuccess
}: ActivityHoursDrawerProps) {
    const [isSaving, setIsSaving] = useState(false);

    const handleSuccess = async () => {
        await onSuccess();
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={680}>
            <DrawerLayout
                header={
                    <div>
                        <Text variant="title-sm" weight={600}>
                            Orari di apertura
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Imposta gli orari settimanali della sede.
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
                            Salva orari
                        </Button>
                    </>
                }
            >
                <ActivityHoursForm
                    formId={FORM_ID}
                    entityData={hours}
                    activity={activity}
                    tenantId={tenantId}
                    onSuccess={handleSuccess}
                    onSavingChange={setIsSaving}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
