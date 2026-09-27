import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { useToast } from "@/context/Toast/ToastContext";
import { createStyle, getStyle, V2Style } from "@/services/supabase/styles";
import styles from "./Styles.module.scss";

type StyleCreateDrawerProps = {
    open: boolean;
    onClose: () => void;
    tenantId?: string;
    allStyles: V2Style[];
    onSuccess: (newStyleId: string) => void;
};

export function StyleCreateDrawer({
    open,
    onClose,
    tenantId,
    allStyles,
    onSuccess
}: StyleCreateDrawerProps) {
    const { showToast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [name, setName] = useState("");
    const [baseStyleId, setBaseStyleId] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedName = name.trim();
        if (!trimmedName) {
            showToast({ message: "Il nome dello stile è obbligatorio.", type: "error" });
            return;
        }

        if (!tenantId) {
            showToast({ message: "Tenant ID mancante", type: "error" });
            return;
        }

        setIsSaving(true);
        try {
            let configObj = {};

            // If a base style is selected, fetch it and duplicate its config
            if (baseStyleId) {
                const sourceStyle = await getStyle(baseStyleId, tenantId);
                if (sourceStyle && sourceStyle.current_version?.config) {
                    configObj = sourceStyle.current_version.config;
                }
            } else {
                // Default empty style scaffolding
                configObj = {
                    colors: {},
                    typography: {}
                };
            }

            const newStyle = await createStyle(tenantId, trimmedName, configObj);
            showToast({ message: "Nuovo stile creato con successo.", type: "success" });

            // Cleanup input on success
            setName("");
            setBaseStyleId("");
            onSuccess(newStyle.id);
        } catch (error) {
            console.error("Errore salvataggio stile:", error);
            showToast({ message: "Impossibile creare lo stile.", type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    const duplicateOptions = allStyles.map(s => ({
        value: s.id,
        label: s.is_system ? `${s.name} (di sistema)` : s.name
    }));

    // Chiudere senza creare azzera il form: alla riapertura si riparte da capo.
    const handleClose = () => {
        if (isSaving) return;
        setName("");
        setBaseStyleId("");
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={handleClose} size="sm">
            <DrawerLayout
                header={
                    <div className={styles.drawerHeader}>
                        <Text variant="title-sm" weight={600}>
                            Nuovo stile
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Dai un nome al tuo stile e scegli se partire da uno stile esistente o
                            crearne uno vuoto.
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={handleClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form="style-create-form"
                            loading={isSaving}
                        >
                            Crea e continua
                        </Button>
                    </>
                }
            >
                <form id="style-create-form" className={styles.form} onSubmit={handleSubmit}>
                    <TextInput
                        label="Nome stile"
                        required
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Es: Dark Theme, Summer Vibes..."
                        disabled={isSaving}
                    />

                    <Select
                        label="Parti da (facoltativo)"
                        value={baseStyleId}
                        onChange={e => setBaseStyleId(e.target.value)}
                        options={[
                            { value: "", label: "Nessuno: stile vuoto" },
                            ...duplicateOptions
                        ]}
                        disabled={isSaving}
                    />
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
