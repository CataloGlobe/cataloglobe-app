import React, { useCallback, useMemo } from "react";
import Text from "@components/ui/Text/Text";
import type { BusinessFormValues } from "@/types/Businesses";
import { BusinessCreateCard } from "../BusinessCreateCard/BusinessCreateCard";
import styles from "./BusinessUpsert.module.scss";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { Button } from "@/components/ui";

type Mode = "create" | "edit";

type SlugInlineState =
    | { type: "idle" }
    | { type: "warning" }
    | { type: "conflict"; suggestions: string[] };

type Props = {
    open: boolean;
    mode: Mode;

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

export const BusinessUpsert: React.FC<Props> = React.memo(
    ({
        open,
        mode,
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
        const modalTitle = useMemo(
            () => (mode === "create" ? "Aggiungi attività" : "Modifica attività"),
            [mode]
        );

        const modalDescription = useMemo(
            () =>
                mode === "create"
                    ? "Compila i campi per creare una nuova attività."
                    : "Aggiorna i dati di questa attività.",
            [mode]
        );

        const primaryLabel = useMemo(
            () => (mode === "create" ? "Crea attività" : "Salva modifiche"),
            [mode]
        );

        const formId = useMemo(
            () => (mode === "create" ? "create-business-form" : "edit-business-form"),
            [mode]
        );

        const safeClose = useCallback(() => {
            onClose();
        }, [onClose]);

        if (!values) return null;

        return (
            <ModalLayout isOpen={open} onClose={safeClose} width="md">
                <ModalLayoutHeader>
                    <div className={styles.headerLeft}>
                        <Text as="h2" variant="title-md" weight={700}>
                            {modalTitle}
                        </Text>
                        <Text variant="caption" colorVariant="muted">
                            {modalDescription}
                        </Text>
                    </div>

                    <div className={styles.headerRight}>
                        <Button variant="secondary" onClick={safeClose}>
                            Chiudi
                        </Button>
                    </div>
                </ModalLayoutHeader>

                <ModalLayoutContent>
                    <BusinessCreateCard
                        formId={formId}
                        values={values}
                        errors={errors}
                        onFieldChange={onFieldChange}
                        onCoverChange={onCoverChange}
                        onSubmit={onSubmit}
                        previewBaseUrl={previewBaseUrl}
                        slugState={slugState}
                        onPickSlugSuggestion={onPickSlugSuggestion}
                    />
                </ModalLayoutContent>

                <ModalLayoutFooter>
                    <Button variant="secondary" onClick={safeClose}>
                        Annulla
                    </Button>

                    <Button
                        variant="primary"
                        type="submit"
                        form={formId}
                        loading={loading}
                        disabled={loading}
                    >
                        {primaryLabel}
                    </Button>
                </ModalLayoutFooter>
            </ModalLayout>
        );
    }
);
