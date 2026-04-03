import React, { useState, useEffect } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import {
    V2ProductAttributeDefinition,
    V2ProductAttributeValue,
    AttributeType,
    createAttributeDefinition,
    linkProductAttribute,
    removeProductAttributeValue
} from "@/services/supabase/attributes";

interface ProductAttributesDrawerProps {
    open: boolean;
    onClose: () => void;
    productId: string;
    tenantId: string;
    definitions: V2ProductAttributeDefinition[];
    currentValues: V2ProductAttributeValue[];
    onSuccess: () => void;
}

type ActiveTab = "existing" | "new";

function getTypeLabel(type: string): string {
    switch (type) {
        case "text": return "Testo";
        case "number": return "Numero";
        case "boolean": return "Sì / No";
        case "select": return "Selezione";
        case "multi_select": return "Selezione multipla";
        default: return type;
    }
}

function toSlug(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

export function ProductAttributesDrawer({
    open,
    onClose,
    productId,
    tenantId,
    definitions,
    currentValues,
    onSuccess
}: ProductAttributesDrawerProps) {
    const { showToast } = useToast();

    const linkedIds = new Set(currentValues.map(v => v.attribute_definition_id));

    // ── Tab state ──────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<ActiveTab>("existing");

    // ── Existing tab ───────────────────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [linking, setLinking] = useState(false);

    // ── New tab ────────────────────────────────────────────────────────
    const [label, setLabel] = useState("");
    const [type, setType] = useState<AttributeType>("text");
    const [isRequired, setIsRequired] = useState(false);
    const [options, setOptions] = useState<string[]>([]);
    const [newOption, setNewOption] = useState("");
    const [creating, setCreating] = useState(false);

    // Reset all state when drawer opens — initialize selection from current linked state
    useEffect(() => {
        if (open) {
            setActiveTab("existing");
            setSelectedIds(currentValues.map(v => v.attribute_definition_id));
            setLabel("");
            setType("text");
            setIsRequired(false);
            setOptions([]);
            setNewOption("");
        }
    }, [open]);

    // ── Handlers: existing tab ─────────────────────────────────────────

    const handleLink = async () => {
        const newlyLinked = selectedIds.filter(id => !linkedIds.has(id));
        const newlyUnlinked = [...linkedIds].filter(id => !selectedIds.includes(id));

        if (newlyLinked.length === 0 && newlyUnlinked.length === 0) {
            onClose();
            return;
        }

        try {
            setLinking(true);
            await Promise.all([
                ...newlyLinked.map(defId => linkProductAttribute(tenantId, productId, defId)),
                ...newlyUnlinked.map(defId => removeProductAttributeValue(tenantId, productId, defId))
            ]);
            onSuccess();
            onClose();
            const parts: string[] = [];
            if (newlyLinked.length > 0)
                parts.push(`${newlyLinked.length} attribut${newlyLinked.length === 1 ? "o aggiunto" : "i aggiunti"}`);
            if (newlyUnlinked.length > 0)
                parts.push(`${newlyUnlinked.length} rimoss${newlyUnlinked.length === 1 ? "o" : "i"}`);
            showToast({ message: parts.join(", ") + ".", type: "success" });
        } catch {
            showToast({ message: "Errore nell'aggiornamento degli attributi.", type: "error" });
        } finally {
            setLinking(false);
        }
    };

    // ── Handlers: new tab ──────────────────────────────────────────────

    const handleAddOption = () => {
        const val = newOption.trim();
        if (val && !options.includes(val)) {
            setOptions([...options, val]);
            setNewOption("");
        }
    };

    const handleRemoveOption = (index: number) => {
        const copy = [...options];
        copy.splice(index, 1);
        setOptions(copy);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!label.trim()) {
            showToast({ message: "Il nome è obbligatorio.", type: "error" });
            return;
        }
        if ((type === "select" || type === "multi_select") && options.length === 0) {
            showToast({ message: "Aggiungi almeno un'opzione.", type: "error" });
            return;
        }

        try {
            setCreating(true);
            const newDef = await createAttributeDefinition(tenantId, {
                code: toSlug(label),
                label,
                type,
                is_required: isRequired,
                options: (type === "select" || type === "multi_select") ? options : null
            });
            await linkProductAttribute(tenantId, productId, newDef.id);
            onSuccess();
            // Reset form and go back to existing tab
            setLabel("");
            setType("text");
            setIsRequired(false);
            setOptions([]);
            setNewOption("");
            setActiveTab("existing");
            showToast({ message: "Attributo creato e collegato.", type: "success" });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Errore nella creazione dell'attributo.";
            showToast({ message: msg, type: "error" });
        } finally {
            setCreating(false);
        }
    };

    // ── Columns ────────────────────────────────────────────────────────

    const columns: ColumnDefinition<V2ProductAttributeDefinition>[] = [
        {
            id: "label",
            header: "Nome",
            width: "1fr",
            accessor: row => row.label,
            cell: (value) => <Text variant="body-sm" weight={600}>{value}</Text>
        },
        {
            id: "type",
            header: "Tipo",
            width: "140px",
            accessor: row => row.type,
            cell: (value) => <Badge variant="secondary">{getTypeLabel(value)}</Badge>
        }
    ];

    // ── Footer (varies by tab) ─────────────────────────────────────────

    const footer = activeTab === "existing" ? (
        <>
            <Button variant="secondary" onClick={onClose} disabled={linking}>
                Annulla
            </Button>
            <Button
                variant="primary"
                onClick={handleLink}
                loading={linking}
            >
                Salva
            </Button>
        </>
    ) : (
        <>
            <Button variant="secondary" onClick={onClose} disabled={creating}>
                Annulla
            </Button>
            <Button
                variant="primary"
                type="submit"
                form="attr-inline-form"
                loading={creating}
            >
                Crea e collega
            </Button>
        </>
    );

    return (
        <SystemDrawer open={open} onClose={onClose} width={480}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Gestisci attributi
                    </Text>
                }
                footer={footer}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <Text variant="body-sm" colorVariant="muted" style={{ marginBottom: 8 }}>
                        Seleziona gli attributi da associare o creane uno nuovo.
                    </Text>

                    <Tabs<ActiveTab> value={activeTab} onChange={setActiveTab}>
                        <Tabs.List>
                            <Tabs.Tab<ActiveTab> value="existing">Esistenti</Tabs.Tab>
                            <Tabs.Tab<ActiveTab> value="new">Nuovo</Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel<ActiveTab> value="existing">
                            {definitions.length === 0 ? (
                                <Text variant="body-sm" colorVariant="muted">
                                    Nessun attributo disponibile. Creane uno nel tab "Nuovo".
                                </Text>
                            ) : (
                                <DataTable<V2ProductAttributeDefinition>
                                    data={definitions}
                                    columns={columns}
                                    selectable
                                    showSelectionBar={false}
                                    selectedRowIds={selectedIds}
                                    onSelectedRowsChange={setSelectedIds}
                                    density="compact"
                                />
                            )}
                        </Tabs.Panel>

                        <Tabs.Panel<ActiveTab> value="new">
                            <form
                                id="attr-inline-form"
                                onSubmit={handleCreate}
                                style={{ display: "flex", flexDirection: "column", gap: 16 }}
                            >
                                <TextInput
                                    label="Nome"
                                    required
                                    value={label}
                                    onChange={e => setLabel(e.target.value)}
                                    placeholder="Es: Colore, Taglia, Livello piccantezza..."
                                    disabled={creating}
                                />

                                <Select
                                    label="Tipo di valore"
                                    required
                                    value={type}
                                    onChange={e => setType(e.target.value as AttributeType)}
                                    disabled={creating}
                                    options={[
                                        { value: "text", label: "Testo libero" },
                                        { value: "number", label: "Numero" },
                                        { value: "boolean", label: "Sì / No" },
                                        { value: "select", label: "Selezione singola" },
                                        { value: "multi_select", label: "Selezione multipla" }
                                    ]}
                                />

                                {(type === "select" || type === "multi_select") && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        <Text variant="body-sm" weight={600}>Opzioni *</Text>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                            {options.map((opt, i) => (
                                                <div
                                                    key={i}
                                                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                                                >
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
                                                        onClick={() => handleRemoveOption(i)}
                                                        style={{
                                                            background: "none",
                                                            border: "none",
                                                            cursor: "pointer",
                                                            color: "var(--color-error-600)",
                                                            padding: 4,
                                                            display: "flex",
                                                            alignItems: "center"
                                                        }}
                                                    >
                                                        <IconTrash size={16} />
                                                    </button>
                                                </div>
                                            ))}
                                            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                                                <div style={{ flex: 1 }}>
                                                    <TextInput
                                                        value={newOption}
                                                        onChange={e => setNewOption(e.target.value)}
                                                        placeholder="Nuova opzione..."
                                                        disabled={creating}
                                                        onKeyDown={e => {
                                                            if (e.key === "Enter") {
                                                                e.preventDefault();
                                                                handleAddOption();
                                                            }
                                                        }}
                                                    />
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    leftIcon={<IconPlus size={16} />}
                                                    onClick={handleAddOption}
                                                    disabled={creating}
                                                >
                                                    Aggiungi
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {type !== "boolean" && (
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between"
                                        }}
                                    >
                                        <div>
                                            <Text variant="body-sm" weight={600}>Richiesto</Text>
                                            <Text variant="caption" colorVariant="muted">
                                                Richiedi un valore quando associato a un prodotto
                                            </Text>
                                        </div>
                                        <Switch checked={isRequired} onChange={setIsRequired} />
                                    </div>
                                )}
                            </form>
                        </Tabs.Panel>
                    </Tabs>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
