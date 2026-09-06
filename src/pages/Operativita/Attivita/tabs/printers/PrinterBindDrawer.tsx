import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { PrinterBindForm } from "./components/PrinterBindForm";

interface PrinterBindDrawerProps {
    open: boolean;
    tenantId: string;
    activityId: string;
    existingSns: string[];
    onClose: () => void;
    onSuccess: (alreadyBound: boolean) => Promise<void> | void;
}

const FORM_ID = "printer-bind-form";

/**
 * Drawer "Collega stampante": SystemDrawer → DrawerLayout → PrinterBindForm.
 * Il bottone di submit sta nel footer e punta al form via `form={FORM_ID}`.
 */
export const PrinterBindDrawer: React.FC<PrinterBindDrawerProps> = ({
    open,
    tenantId,
    activityId,
    existingSns,
    onClose,
    onSuccess
}) => {
    const [isSaving, setIsSaving] = useState(false);

    return (
        <SystemDrawer open={open} onClose={onClose} width={480}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Collega stampante
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button variant="primary" type="submit" form={FORM_ID} loading={isSaving}>
                            Collega
                        </Button>
                    </>
                }
            >
                {open && (
                    <PrinterBindForm
                        formId={FORM_ID}
                        tenantId={tenantId}
                        activityId={activityId}
                        existingSns={existingSns}
                        onSuccess={onSuccess}
                        onSavingChange={setIsSaving}
                    />
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
};
