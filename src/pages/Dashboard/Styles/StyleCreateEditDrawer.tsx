import React, { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { createStyle, updateStyle, duplicateStyle, V2Style } from "@/services/supabase/v2/styles";
import styles from "./Styles.module.scss";

type StyleCreateEditDrawerProps = {
    open: boolean;
    onClose: () => void;
    styleData: V2Style | null; // se null -> Create mode
    onSuccess: () => void;
    tenantId?: string;
};

export function StyleCreateEditDrawer({
    open,
    onClose,
    styleData,
    onSuccess,
    tenantId
}: StyleCreateEditDrawerProps) {
    const { showToast } = useToast();
    const isEditing = !!styleData;

    const [isSaving, setIsSaving] = useState(false);
    const [name, setName] = useState("");
    const [configText, setConfigText] = useState("");
    const [configError, setConfigError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            if (isEditing) {
                setName(styleData.name);
                try {
                    const cfg = styleData.current_version?.config || {};
                    setConfigText(JSON.stringify(cfg, null, 2));
                } catch (e) {
                    setConfigText("{}");
                }
            } else {
                setName("");
                setConfigText("{\n  \n}");
            }
            setConfigError(null);
            setIsSaving(false);
        }
    }, [open, isEditing, styleData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            showToast({ message: "Il nome dello stile è obbligatorio.", type: "error" });
            return;
        }

        let parsedConfig: any = {};
        try {
            parsedConfig = JSON.parse(configText);
            setConfigError(null);
        } catch (e) {
            setConfigError("Il JSON inserito non è valido. Controlla la sintassi.");
            return;
        }

        setIsSaving(true);
        try {
            if (isEditing) {
                // To duplicate, the user clicked "Modifica o Duplica". We might want a real "duplicate" button here.
                // For now, if they change the config, we just call updateStyle (which bumps the version).
                await updateStyle(styleData.id, name, parsedConfig, styleData.tenant_id);
                showToast({
                    message: "Stile aggiornato (nuova versione creata).",
                    type: "success"
                });
            } else {
                if (!tenantId) throw new Error("Tenant ID mancante");
                await createStyle(tenantId, name, parsedConfig);
                showToast({ message: "Nuovo stile creato con successo.", type: "success" });
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Errore salvataggio stile:", error);
            showToast({ message: "Impossibile salvare lo stile.", type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDuplicate = async () => {
        // If editing, we can duplicate the currently open style.
        if (!isEditing || !styleData) return;

        setIsSaving(true);
        try {
            await duplicateStyle(styleData.id, `${styleData.name} (Copia)`);
            showToast({ message: "Stile duplicato con successo.", type: "success" });
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Errore duplicazione stile:", error);
            showToast({ message: "Impossibile duplicare lo stile.", type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={600}>
            <DrawerLayout
                header={
                    <div className={styles.drawerHeader}>
                        <Text variant="title-sm" weight={600}>
                            {isEditing ? "Modifica Stile" : "Nuovo Stile"}
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            {isEditing
                                ? "Aggiorna i dettagli dello stile. Il salvataggio creerà una nuova versione."
                                : "Crea un nuovo stile e definisci la sua prima versione."}
                        </Text>
                    </div>
                }
                footer={
                    <div className={styles.drawerFooterContainer}>
                        <div className={styles.drawerFooter}>
                            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                                Annulla
                            </Button>

                            {isEditing && (
                                <Button
                                    variant="secondary"
                                    onClick={handleDuplicate}
                                    disabled={isSaving}
                                    style={{ marginLeft: "auto", marginRight: "8px" }}
                                >
                                    Duplica come nuovo
                                </Button>
                            )}

                            <Button
                                variant="primary"
                                type="submit"
                                form="style-form"
                                loading={isSaving}
                            >
                                {isEditing ? "Salva Modifiche" : "Crea Stile"}
                            </Button>
                        </div>
                    </div>
                }
            >
                <form id="style-form" className={styles.form} onSubmit={handleSubmit}>
                    {isEditing && (
                        <div className={styles.versionInfo}>
                            <Text variant="body-sm" weight={600} colorVariant="primary">
                                Versione Corrente: {styleData.current_version?.version || "N/A"}
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                Ultimo aggiornamento:{" "}
                                {new Date(styleData.updated_at).toLocaleString("it-IT")}
                            </Text>
                        </div>
                    )}

                    <TextInput
                        label="Nome stile"
                        required
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Es: Dark Theme, Summer Vibes..."
                    />

                    <div className={styles.configSection}>
                        <Text variant="body-sm" weight={600} style={{ marginBottom: "8px" }}>
                            Design Tokens (JSON)
                        </Text>
                        <Text
                            variant="caption"
                            colorVariant="muted"
                            style={{ marginBottom: "16px", display: "block" }}
                        >
                            Inserisci qui il JSON con la configurazione visiva. Questo diventerà la
                            nuova versione dello stile.
                        </Text>

                        <textarea
                            className={`${styles.jsonEditor} ${configError ? styles.jsonEditorError : ""}`}
                            value={configText}
                            onChange={e => {
                                setConfigText(e.target.value);
                                setConfigError(null);
                            }}
                            rows={15}
                            spellCheck={false}
                        />
                        {configError && (
                            <Text
                                variant="caption"
                                colorVariant="error"
                                style={{ marginTop: "4px" }}
                            >
                                {configError}
                            </Text>
                        )}
                    </div>
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
