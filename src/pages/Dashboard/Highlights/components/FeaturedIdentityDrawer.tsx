import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { FeaturedIdentityForm } from "./FeaturedIdentityForm";
import type { FeaturedContent } from "@/services/supabase/featuredContents";

const FORM_ID = "featured-identity-form";

type Props = {
    open: boolean;
    onClose: () => void;
    content: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
};

export function FeaturedIdentityDrawer({
    open,
    onClose,
    content,
    tenantId,
    onSuccess
}: Props) {
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
                            Aggiorna titolo, nome interno, sottotitolo e descrizione.
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
                <FeaturedIdentityForm
                    formId={FORM_ID}
                    entityData={content}
                    tenantId={tenantId}
                    onSuccess={handleSuccess}
                    onSavingChange={setIsSaving}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
