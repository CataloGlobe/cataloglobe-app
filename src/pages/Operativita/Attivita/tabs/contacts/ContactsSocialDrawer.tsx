import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { ContactsSocialForm } from "./ContactsSocialForm";
import type { V2Activity } from "@/types/activity";

const FORM_ID = "contacts-social-form";

type ContactsSocialDrawerProps = {
    open: boolean;
    onClose: () => void;
    activity: V2Activity;
    tenantId: string;
    onSuccess: () => void | Promise<void>;
};

export const ContactsSocialDrawer: React.FC<ContactsSocialDrawerProps> = ({
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
                            Modifica social network
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Aggiorna i profili social della sede.
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
                <ContactsSocialForm
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
