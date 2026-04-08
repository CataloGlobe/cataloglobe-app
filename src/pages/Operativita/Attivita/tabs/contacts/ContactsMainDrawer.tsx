import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { ContactsMainForm } from "./ContactsMainForm";
import type { V2Activity } from "@/types/activity";

const FORM_ID = "contacts-main-form";

type ContactsMainDrawerProps = {
    open: boolean;
    onClose: () => void;
    activity: V2Activity;
    tenantId: string;
    onSuccess: () => void | Promise<void>;
};

export const ContactsMainDrawer: React.FC<ContactsMainDrawerProps> = ({
    open,
    onClose,
    activity,
    tenantId,
    onSuccess
}) => {
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
                            Modifica contatti
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Aggiorna email, telefono e sito web della sede.
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
                <ContactsMainForm
                    formId={FORM_ID}
                    entityData={activity}
                    tenantId={tenantId}
                    onSuccess={handleSuccess}
                    onSavingChange={setIsSaving}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
};
