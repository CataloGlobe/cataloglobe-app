import React, { useCallback, useMemo } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { BusinessCreateCard } from "../BusinessCreateCard/BusinessCreateCard";
import type { BusinessFormValues } from "@/types/Businesses";
import styles from "./BusinessLocationDrawer.module.scss";

type SlugInlineState =
    | { type: "idle" }
    | { type: "warning" }
    | { type: "conflict"; suggestions: string[] };

type Props = {
    open: boolean;
    tenantName?: string;

    values: BusinessFormValues | null;
    errors?: Partial<Record<keyof BusinessFormValues, string>>;
    loading: boolean;
    previewBaseUrl: string;

    onFieldChange: <K extends keyof BusinessFormValues>(
        field: K,
        value: BusinessFormValues[K]
    ) => void;
    onCoverChange: (file: File | null) => void;
    slugState: SlugInlineState;
    onPickSlugSuggestion: (slug: string) => void;

    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    onClose: () => void;
};

const FORM_ID = "create-business-form";

export const BusinessLocationDrawer: React.FC<Props> = React.memo(
    ({
        open,
        tenantName,
        values,
        errors,
        loading,
        previewBaseUrl,
        onFieldChange,
        onCoverChange,
        slugState,
        onPickSlugSuggestion,
        onSubmit,
        onClose
    }) => {
        const safeClose = useCallback(() => {
            if (!loading) onClose();
        }, [loading, onClose]);

        const header = useMemo(
            () => (
                <div className={styles.header}>
                    <Text variant="title-sm" weight={700}>
                        Nuova sede
                    </Text>
                    <Text variant="body-sm" colorVariant="muted">
                        Inserisci le informazioni principali della sede.
                    </Text>
                </div>
            ),
            []
        );

        const footer = useMemo(
            () => (
                <>
                    <Button variant="secondary" onClick={safeClose} disabled={loading}>
                        Annulla
                    </Button>
                    <Button
                        variant="primary"
                        type="submit"
                        form={FORM_ID}
                        loading={loading}
                        disabled={loading}
                    >
                        Crea sede
                    </Button>
                </>
            ),
            [loading, safeClose]
        );

        if (!values) return null;

        return (
            <SystemDrawer open={open} onClose={safeClose} width={520}>
                <DrawerLayout header={header} footer={footer}>
                    <BusinessCreateCard
                        formId={FORM_ID}
                        values={values}
                        errors={errors}
                        onFieldChange={onFieldChange}
                        onCoverChange={onCoverChange}
                        onSubmit={onSubmit}
                        previewBaseUrl={previewBaseUrl}
                        slugState={slugState}
                        onPickSlugSuggestion={onPickSlugSuggestion}
                        namePlaceholder={
                            tenantName
                                ? `Es. ${tenantName} - Via Certosa`
                                : "Es. McDonald's - Via Certosa"
                        }
                    />
                </DrawerLayout>
            </SystemDrawer>
        );
    }
);
