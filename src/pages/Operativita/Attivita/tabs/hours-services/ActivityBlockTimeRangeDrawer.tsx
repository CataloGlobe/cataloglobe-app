import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { ActivityBlockTimeRangeForm } from "./ActivityBlockTimeRangeForm";
import type { V2ActivityClosure } from "@/types/activity-closures";
import type { V2ActivityHours } from "@/types/activity-hours";

const FORM_ID = "activity-block-time-range-form";

type Props = {
    open: boolean;
    onClose: () => void;
    activityId: string;
    tenantId: string;
    hours: V2ActivityHours[];
    closures: V2ActivityClosure[];
    onSuccess: () => void | Promise<void>;
};

/** FASE 5.5 — drawer «Blocca una fascia»: scrive una chiusura parziale calcolata. */
export function ActivityBlockTimeRangeDrawer({
    open,
    onClose,
    activityId,
    tenantId,
    hours,
    closures,
    onSuccess
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
                            Blocca una fascia
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Per un giorno solo, la sede risulta chiusa nella fascia che scegli. Gli altri giorni non cambiano.
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button variant="primary" type="submit" form={FORM_ID} loading={isSaving}>
                            Blocca la fascia
                        </Button>
                    </>
                }
            >
                {open && (
                    <ActivityBlockTimeRangeForm
                        formId={FORM_ID}
                        activityId={activityId}
                        tenantId={tenantId}
                        hours={hours}
                        closures={closures}
                        onSuccess={handleSuccess}
                        onSavingChange={setIsSaving}
                    />
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}
