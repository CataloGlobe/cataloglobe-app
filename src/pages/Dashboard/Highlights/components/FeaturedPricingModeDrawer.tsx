// src/pages/Dashboard/Highlights/components/FeaturedPricingModeDrawer.tsx
import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { FeaturedPricingModeForm } from "./FeaturedPricingModeForm";
import type { FeaturedContent } from "@/services/supabase/featuredContents";

const FORM_ID = "featured-pricing-mode-form";

type Props = {
    open: boolean;
    onClose: () => void;
    content: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
};

export function FeaturedPricingModeDrawer({
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
        <SystemDrawer open={open} onClose={onClose} width={560}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Tipo di contenuto
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
                <FeaturedPricingModeForm
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
