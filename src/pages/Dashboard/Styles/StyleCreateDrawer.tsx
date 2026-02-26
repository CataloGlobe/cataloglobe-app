import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { useToast } from "@/context/Toast/ToastContext";
import { createStyle, getStyle, V2Style } from "@/services/supabase/v2/styles";
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

        if (!name.trim()) {
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
                const sourceStyle = await getStyle(baseStyleId);
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

            const newStyle = await createStyle(tenantId, name, configObj);
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

    // Filter to only usable base styles
    const duplicateOptions = allStyles.map(s => ({
        value: s.id,
        label: s.is_system ? `${s.name} (Sistema)` : s.name
    }));

    return (
        <SystemDrawer open={open} onClose={onClose} width={420}>
            <DrawerLayout
                header={
                    <div className={styles.drawerHeader}>
                        <Text variant="title-sm" weight={600}>
                            Nuovo Stile
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Dai un nome al tuo stile e scegli se partire da uno stile esistente o
                            crearne uno vuoto.
                        </Text>
                    </div>
                }
                footer={
                    <div className={styles.drawerFooterContainer}>
                        <div className={styles.drawerFooter}>
                            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
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
                        </div>
                    </div>
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
                        label="Duplica da... (Opzionale)"
                        value={baseStyleId}
                        onChange={e => setBaseStyleId(e.target.value)}
                        options={[
                            { value: "", label: "Nessuno (Stile Vuoto)" },
                            ...duplicateOptions
                        ]}
                        disabled={isSaving}
                    />
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
