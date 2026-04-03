import { type FormEvent, useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { Switch } from "@/components/ui/Switch/Switch";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import { useToast } from "@/context/Toast/ToastContext";
import {
    createAttributeDefinition,
    updateAttributeDefinition,
    V2ProductAttributeDefinition,
    AttributeType
} from "@/services/supabase/attributes";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import styles from "./Attributes.module.scss";

// UI type collapses select + multi_select into a single "select" choice.
// The actual AttributeType is derived on submit.
type UiType = "text" | "number" | "boolean" | "select";

function toUiType(t: AttributeType): UiType {
    return t === "multi_select" ? "select" : t;
}

function toAttributeType(ui: UiType, isMulti: boolean): AttributeType {
    if (ui === "select") return isMulti ? "multi_select" : "select";
    return ui;
}

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
    const [uiType, setUiType] = useState<UiType>("text");
    const [isMulti, setIsMulti] = useState(false);
    const [isRequired, setIsRequired] = useState(false);
    const [showInPublicChannels, setShowInPublicChannels] = useState(true);

    // For Selezione
    const [options, setOptions] = useState<string[]>([]);
    const [newOption, setNewOption] = useState("");

    useEffect(() => {
        if (open) {
            if (isEditing && attributeData) {
                setLabel(attributeData.label);
                setCode(attributeData.code);
                setUiType(toUiType(attributeData.type));
                setIsMulti(attributeData.type === "multi_select");
                setIsRequired(attributeData.is_required);
                setShowInPublicChannels(attributeData.show_in_public_channels);
                setOptions(Array.isArray(attributeData.options) ? attributeData.options.map(String) : []);
            } else {
                setLabel("");
                setCode("");
                setUiType("text");
                setIsMulti(false);
                setIsRequired(false);
                setShowInPublicChannels(true);
                setOptions([]);
                setNewOption("");
            }
            setIsSaving(false);
        }
    }, [open, isEditing, attributeData]);

    // Reset is_required when switching to boolean
    useEffect(() => {
        if (uiType === "boolean") setIsRequired(false);
    }, [uiType]);

    // Always auto-generate code from label while creating
    useEffect(() => {
        if (!isEditing && label) {
            setCode(
                label
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, "_")
                    .replace(/_+/g, "_")
                    .replace(/^_|_$/g, "")
            );
        }
    }, [label, isEditing]);

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

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (!label.trim()) {
            showToast({ message: "Il nome è obbligatorio.", type: "error" });
            return;
        }

        if (uiType === "select" && options.length === 0) {
            showToast({ message: "Aggiungi almeno un valore per la selezione.", type: "error" });
            return;
        }

        const resolvedType = toAttributeType(uiType, isMulti);

        setIsSaving(true);
        try {
            if (isEditing && attributeData) {
                if (!attributeData.tenant_id) {
                    showToast({ message: "Gli attributi di piattaforma non possono essere modificati.", type: "error" });
                    return;
                }
                await updateAttributeDefinition(attributeData.id, attributeData.tenant_id, {
                    label,
                    is_required: isRequired,
                    options: uiType === "select" ? options : null,
                    show_in_public_channels: showInPublicChannels
                });
                showToast({ message: "Attributo aggiornato.", type: "success" });
            } else {
                if (!tenantId) throw new Error("Tenant ID mancante");
                await createAttributeDefinition(tenantId, {
                    code,
                    label,
                    type: resolvedType,
                    is_required: isRequired,
                    show_in_public_channels: showInPublicChannels,
                    options: uiType === "select" ? options : null
                });
                showToast({ message: "Attributo creato con successo.", type: "success" });
            }
            onSuccess();
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : undefined;
            showToast({
                message: msg || "Impossibile salvare l'attributo.",
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
                        label="Nome"
                        required
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder="Es: Colore, Taglia, Livello piccantezza..."
                    />

                    <Select
                        label="Tipo di valore"
                        required
                        disabled={isEditing}
                        value={uiType}
                        onChange={e => {
                            setUiType(e.target.value as UiType);
                            setIsMulti(false);
                        }}
                        options={[
                            { value: "text", label: "Testo" },
                            { value: "number", label: "Numero" },
                            { value: "boolean", label: "Sì / No" },
                            { value: "select", label: "Selezione" }
                        ]}
                        helperText={
                            isEditing
                                ? "Il tipo non può essere modificato dopo la creazione."
                                : uiType === "text"
                                ? "Valore testuale libero."
                                : uiType === "number"
                                ? "Valore numerico (es. 42, 3.5)."
                                : uiType === "boolean"
                                ? "Valore Sì/No, visualizzato come interruttore."
                                : "Scelta tra i valori che definisci."
                        }
                    />

                    {uiType === "select" && (
                        <>
                            <CheckboxInput
                                description="Consenti selezione multipla"
                                checked={isMulti}
                                onChange={e => setIsMulti(e.target.checked)}
                                disabled={isEditing}
                            />

                            <div className={styles.optionsSection}>
                                <Text variant="body-sm" weight={600}>
                                    Valori *
                                </Text>
                                <div className={styles.optionsList}>
                                    {options.map((opt, i) => (
                                        <div key={i} className={styles.optionItem}>
                                            <div className={styles.optionValue}>
                                                {opt}
                                            </div>
                                            <button
                                                type="button"
                                                className={styles.actionButton}
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
                                            placeholder="Nuovo valore..."
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
                        </>
                    )}

                    {uiType !== "boolean" && (
                        <div className={styles.switchRow}>
                            <div>
                                <Text variant="body-sm" weight={600}>
                                    Richiesto
                                </Text>
                                <Text variant="caption" colorVariant="muted">
                                    Richiedi un valore quando associato a un prodotto
                                </Text>
                            </div>
                            <Switch checked={isRequired} onChange={setIsRequired} />
                        </div>
                    )}

                    <div className={styles.switchRow}>
                        <div>
                            <Text variant="body-sm" weight={600}>
                                Visibile al pubblico
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                Mostra il valore nella pagina pubblica del catalogo
                            </Text>
                        </div>
                        <Switch checked={showInPublicChannels} onChange={setShowInPublicChannels} />
                    </div>
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
