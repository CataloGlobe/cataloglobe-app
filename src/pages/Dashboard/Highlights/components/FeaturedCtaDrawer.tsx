// src/pages/Dashboard/Highlights/components/FeaturedCtaDrawer.tsx
import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { FeaturedCtaForm } from "./FeaturedCtaForm";
import type { FeaturedContent } from "@/services/supabase/featuredContents";

const FORM_ID = "featured-cta-form";

type Props = {
    open: boolean;
    onClose: () => void;
    content: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
};

export function FeaturedCtaDrawer({ open, onClose, content, tenantId, onSuccess }: Props) {
    const [isSaving, setIsSaving] = useState(false);

    const handleSuccess = () => {
        onSuccess();
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={480}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Modifica call to action
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
                        >
                            Salva
                        </Button>
                    </>
                }
            >
                <FeaturedCtaForm
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
