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
    mode: "create" | "edit";
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

export const BusinessLocationDrawer: React.FC<Props> = React.memo(
    ({
        open,
        mode,
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
        const isEdit = mode === "edit";
        const formId = isEdit ? "edit-business-form" : "create-business-form";

        const safeClose = useCallback(() => {
            if (!loading) onClose();
        }, [loading, onClose]);

        const header = useMemo(
            () => (
                <div className={styles.header}>
                    <Text variant="title-sm" weight={700}>
                        {isEdit ? "Modifica sede" : "Nuova sede"}
                    </Text>
                    <Text variant="body-sm" colorVariant="muted">
                        {isEdit
                            ? "Aggiorna i dati di questa sede."
                            : "Inserisci le informazioni principali della sede."}
                    </Text>
                </div>
            ),
            [isEdit]
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
                        form={formId}
                        loading={loading}
                        disabled={loading}
                    >
                        {isEdit ? "Salva modifiche" : "Crea sede"}
                    </Button>
                </>
            ),
            [loading, safeClose, isEdit, formId]
        );

        if (!values) return null;

        return (
            <SystemDrawer open={open} onClose={safeClose} width={520}>
                <DrawerLayout header={header} footer={footer}>
                    <BusinessCreateCard
                        formId={formId}
                        mode={mode}
                        values={values}
                        errors={errors}
                        onFieldChange={onFieldChange}
                        onCoverChange={onCoverChange}
                        onSubmit={onSubmit}
                        previewBaseUrl={previewBaseUrl}
                        slugState={slugState}
                        onPickSlugSuggestion={onPickSlugSuggestion}
                        namePlaceholder={
                            !isEdit
                                ? tenantName
                                    ? `Es. ${tenantName} - Via Certosa`
                                    : "Es. McDonald's - Via Certosa"
                                : undefined
                        }
                    />
                </DrawerLayout>
            </SystemDrawer>
        );
    }
);
