import React, { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { Switch } from "@/components/ui/Switch/Switch";
import { useToast } from "@/context/Toast/ToastContext";
import {
    createAttributeDefinition,
    updateAttributeDefinition,
    V2ProductAttributeDefinition,
    AttributeType
} from "@/services/supabase/attributes";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import styles from "./Attributes.module.scss";

type AttributeCreateEditDrawerProps = {
    open: boolean;
    onClose: () => void;
    attributeData: V2ProductAttributeDefinition | null;
    onSuccess: () => void;
    tenantId?: string;
};

export function AttributeCreateEditDrawer({
    open,
    onClose,
    attributeData,
    onSuccess,
    tenantId
}: AttributeCreateEditDrawerProps) {
    const { showToast } = useToast();
    const isEditing = !!attributeData;

    const [isSaving, setIsSaving] = useState(false);
    const [label, setLabel] = useState("");
    const [code, setCode] = useState("");
    const [type, setType] = useState<AttributeType>("text");
    const [isRequired, setIsRequired] = useState(false);

    // For Select / Multi Select
    const [options, setOptions] = useState<string[]>([]);
    const [newOption, setNewOption] = useState("");

    useEffect(() => {
        if (open) {
            if (isEditing && attributeData) {
                setLabel(attributeData.label);
                setCode(attributeData.code);
                setType(attributeData.type);
                setIsRequired(attributeData.is_required);

                if (Array.isArray(attributeData.options)) {
                    setOptions(attributeData.options.map(String));
                } else {
                    setOptions([]);
                }
            } else {
                setLabel("");
                setCode("");
                setType("text");
                setIsRequired(false);
                setOptions([]);
                setNewOption("");
            }
            setIsSaving(false);
        }
    }, [open, isEditing, attributeData]);

    // Generate code from label if it's new
    useEffect(() => {
        if (!isEditing && label && !code) {
            setCode(
                label
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, "_")
                    .replace(/_+/g, "_")
                    .replace(/^_|_$/g, "")
            );
        }
    }, [label, isEditing, code]);

    const handleAddOption = () => {
        const val = newOption.trim();
        if (val && !options.includes(val)) {
            setOptions([...options, val]);
            setNewOption("");
        }
    };

    const handleRemoveOption = (index: number) => {
        const newOpts = [...options];
        newOpts.splice(index, 1);
        setOptions(newOpts);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!label.trim() || !code.trim()) {
            showToast({ message: "Label e codice sono obbligatori.", type: "error" });
            return;
        }

        if ((type === "select" || type === "multi_select") && options.length === 0) {
            showToast({ message: "Aggiungi almeno un'opzione per i tipi select.", type: "error" });
            return;
        }

        setIsSaving(true);
        try {
            if (isEditing && attributeData) {
                await updateAttributeDefinition(attributeData.id, attributeData.tenant_id, {
                    label,
                    is_required: isRequired,
                    options: type === "select" || type === "multi_select" ? options : null
                });
                showToast({ message: "Attributo aggiornato.", type: "success" });
            } else {
                if (!tenantId) throw new Error("Tenant ID mancante");
                await createAttributeDefinition(tenantId, {
                    code,
                    label,
                    type,
                    is_required: isRequired,
                    options: type === "select" || type === "multi_select" ? options : null
                });
                showToast({ message: "Attributo creato con successo.", type: "success" });
            }
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error("Errore salvataggio attributo:", error);
            showToast({
                message: error.message || "Impossibile salvare l'attributo.",
                type: "error"
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={500}>
            <DrawerLayout
                header={
                    <div className={styles.drawerHeader}>
                        <Text variant="title-sm" weight={600}>
                            {isEditing ? "Modifica Attributo" : "Nuovo Attributo"}
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            {isEditing
                                ? "Aggiorna nome e opzioni."
                                : "Crea una nuova definizione per i prodotti."}
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
                            form="attr-form"
                            loading={isSaving}
                        >
                            {isEditing ? "Salva Modifiche" : "Crea"}
                        </Button>
                    </>
                }
            >
                <form id="attr-form" className={styles.form} onSubmit={handleSubmit}>
                    <TextInput
                        label="Label (Nome visualizzato)"
                        required
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder="Es: Colore, Taglia, Livello piccantezza..."
                    />

                    <TextInput
                        label="Codice interno (slug)"
                        required
                        disabled={isEditing}
                        value={code}
                        onChange={e => setCode(e.target.value)}
                        placeholder="es: colore, taglia_eu"
                        helperText={
                            isEditing
                                ? "Il codice non può essere modificato dopo la creazione."
                                : "Codice univoco utilizzato per integrare questo dato."
                        }
                    />

                    <Select
                        label="Tipo dato"
                        required
                        disabled={isEditing}
                        value={type}
                        onChange={e => setType(e.target.value as AttributeType)}
                        options={[
                            { value: "text", label: "Testo libero" },
                            { value: "number", label: "Numero" },
                            { value: "boolean", label: "Interruttore (Si/No)" },
                            { value: "select", label: "Selezione singola" },
                            { value: "multi_select", label: "Selezione multipla" }
                        ]}
                        helperText={
                            isEditing ? "Il tipo non può essere modificato dopo la creazione." : ""
                        }
                    />

                    {(type === "select" || type === "multi_select") && (
                        <div className={styles.optionsSection}>
                            <Text variant="body-sm" weight={600}>
                                Opzioni disponibili *
                            </Text>
                            <div className={styles.optionsList}>
                                {options.map((opt, i) => (
                                    <div key={i} className={styles.optionItem}>
                                        <div
                                            style={{
                                                flex: 1,
                                                padding: "8px 12px",
                                                border: "1px solid var(--color-gray-200)",
                                                borderRadius: "var(--radius-md)",
                                                backgroundColor: "var(--color-gray-50)",
                                                fontSize: "14px"
                                            }}
                                        >
                                            {opt}
                                        </div>
                                        <button
                                            type="button"
                                            className={styles.actionButton}
                                            style={{ color: "var(--color-error-600)" }}
                                            onClick={() => handleRemoveOption(i)}
                                        >
                                            <IconTrash size={16} />
                                        </button>
                                    </div>
                                ))}
                                <div className={styles.optionItem}>
                                    <TextInput
                                        value={newOption}
                                        onChange={e => setNewOption(e.target.value)}
                                        placeholder="Nuova opzione..."
                                        onKeyDown={e => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleAddOption();
                                            }
                                        }}
                                    />
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        leftIcon={<IconPlus size={16} />}
                                        onClick={handleAddOption}
                                    >
                                        Aggiungi
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginTop: 8
                        }}
                    >
                        <div>
                            <Text variant="body-sm" weight={600}>
                                Richiesto
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                Rendi questo attributo obbligatorio per i prodotti
                            </Text>
                        </div>
                        <Switch checked={isRequired} onChange={setIsRequired} />
                    </div>
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
