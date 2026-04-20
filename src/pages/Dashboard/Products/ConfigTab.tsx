import { useState } from "react";
import { useToast } from "@/context/Toast/ToastContext";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { TextInput } from "@/components/ui/Input/TextInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { Switch } from "@/components/ui/Switch/Switch";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import {
    GroupWithValues,
    V2ProductOptionValue,
    createProductOptionGroup,
    updateProductOptionGroup,
    deleteProductOptionGroup,
    createOptionValue,
    updateOptionValue,
    deleteOptionValue
} from "@/services/supabase/productOptions";
import styles from "./ConfigTab.module.scss";

interface ConfigTabProps {
    productId: string;
    tenantId: string;
    addonGroups: GroupWithValues[];
    optionsLoading: boolean;
    onRefreshOptions: () => Promise<void>;
}

function formatDelta(n: number | null): string {
    if (n === null) return "—";
    return n >= 0 ? `+${n.toFixed(2)} €` : `${n.toFixed(2)} €`;
}

export function ConfigTab({
    productId,
    tenantId,
    addonGroups,
    optionsLoading,
    onRefreshOptions
}: ConfigTabProps) {
    const { showToast } = useToast();

    // --- Create group form ---
    const [newGroupName, setNewGroupName] = useState("");
    const [savingNewGroup, setSavingNewGroup] = useState(false);
    const [newGroupError, setNewGroupError] = useState<string | null>(null);

    // --- Edit group ---
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editGroupName, setEditGroupName] = useState("");
    const [editGroupMaxSelectable, setEditGroupMaxSelectable] = useState<number | null>(null);
    const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
    const [groupEditError, setGroupEditError] = useState<string | null>(null);

    // --- Delete group dialog ---
    const [deleteGroup, setDeleteGroup] = useState<GroupWithValues | null>(null);
    const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

    // --- Edit value ---
    const [editingValueId, setEditingValueId] = useState<string | null>(null);
    const [editValueName, setEditValueName] = useState("");
    const [editValuePrice, setEditValuePrice] = useState("");
    const [savingValueId, setSavingValueId] = useState<string | null>(null);
    const [valueEditError, setValueEditError] = useState<string | null>(null);

    // --- Delete value ---
    const [deletingValueId, setDeletingValueId] = useState<string | null>(null);

    // --- Add value (per group) ---
    const [newValueNames, setNewValueNames] = useState<Record<string, string>>({});
    const [newValuePrices, setNewValuePrices] = useState<Record<string, string>>({});
    const [savingNewValueGroupId, setSavingNewValueGroupId] = useState<string | null>(null);
    const [newValueErrors, setNewValueErrors] = useState<Record<string, string | null>>({});

    // --- Create group handlers ---
    const handleCreateGroup = async () => {
        const name = newGroupName.trim();
        if (!name) {
            setNewGroupError("Il nome del gruppo è obbligatorio");
            return;
        }
        try {
            setSavingNewGroup(true);
            setNewGroupError(null);
            await createProductOptionGroup({
                tenant_id: tenantId,
                product_id: productId,
                name,
                is_required: false,
                max_selectable: null,
                group_kind: "ADDON",
                pricing_mode: "DELTA"
            });
            await onRefreshOptions();
            setNewGroupName("");
        } catch {
            setNewGroupError("Errore nella creazione del gruppo");
            showToast({ message: "Errore nella creazione del gruppo", type: "error" });
        } finally {
            setSavingNewGroup(false);
        }
    };

    // --- Edit group handlers ---
    const handleStartEditGroup = (group: GroupWithValues) => {
        setEditingGroupId(group.id);
        setEditGroupName(group.name);
        setEditGroupMaxSelectable(group.max_selectable ?? null);
        setGroupEditError(null);
    };

    const handleCancelEditGroup = () => {
        setEditingGroupId(null);
        setGroupEditError(null);
    };

    const handleSaveGroup = async (groupId: string) => {
        const name = editGroupName.trim();
        if (!name) {
            setGroupEditError("Il nome del gruppo è obbligatorio");
            return;
        }
        try {
            setSavingGroupId(groupId);
            await updateProductOptionGroup(groupId, { name, max_selectable: editGroupMaxSelectable });
            await onRefreshOptions();
            setEditingGroupId(null);
        } catch {
            setGroupEditError("Errore nel salvataggio del gruppo");
            showToast({ message: "Errore nel salvataggio del gruppo", type: "error" });
        } finally {
            setSavingGroupId(null);
        }
    };

    // --- Delete group handler (called by ConfirmDialog) ---
    const handleConfirmDeleteGroup = async (groupId: string): Promise<boolean> => {
        try {
            setDeletingGroupId(groupId);
            await deleteProductOptionGroup(groupId);
            await onRefreshOptions();
            return true;
        } catch {
            showToast({ message: "Errore nell'eliminazione del gruppo", type: "error" });
            return false;
        } finally {
            setDeletingGroupId(null);
        }
    };

    // --- Edit value handlers ---
    const handleStartEditValue = (val: V2ProductOptionValue) => {
        setEditingValueId(val.id);
        setEditValueName(val.name);
        setEditValuePrice(val.price_modifier !== null ? String(val.price_modifier) : "0");
        setValueEditError(null);
    };

    const handleCancelEditValue = () => {
        setEditingValueId(null);
        setValueEditError(null);
    };

    const handleSaveValue = async (valueId: string) => {
        const name = editValueName.trim();
        if (!name) {
            setValueEditError("Il nome è obbligatorio");
            return;
        }
        const parsed = parseFloat(editValuePrice.replace(",", "."));
        if (isNaN(parsed)) {
            setValueEditError("Inserisci un numero valido (es. 0.50 o -0.50)");
            return;
        }
        try {
            setSavingValueId(valueId);
            await updateOptionValue(valueId, { name, price_modifier: parsed });
            await onRefreshOptions();
            setEditingValueId(null);
        } catch {
            setValueEditError("Errore nel salvataggio del valore");
            showToast({ message: "Errore nel salvataggio del valore", type: "error" });
        } finally {
            setSavingValueId(null);
        }
    };

    // --- Delete value handler ---
    const handleDeleteValue = async (valueId: string) => {
        try {
            setDeletingValueId(valueId);
            await deleteOptionValue(valueId);
            await onRefreshOptions();
        } catch {
            showToast({ message: "Errore nell'eliminazione del valore", type: "error" });
        } finally {
            setDeletingValueId(null);
        }
    };

    // --- Add value handlers ---
    const handleAddValue = async (groupId: string) => {
        const name = (newValueNames[groupId] ?? "").trim();
        if (!name) {
            setNewValueErrors(prev => ({ ...prev, [groupId]: "Il nome è obbligatorio" }));
            return;
        }
        const priceStr = (newValuePrices[groupId] ?? "0").replace(",", ".");
        const parsed = parseFloat(priceStr);
        if (isNaN(parsed)) {
            setNewValueErrors(prev => ({
                ...prev,
                [groupId]: "Inserisci un numero valido (es. 0.50 o -0.50)"
            }));
            return;
        }
        try {
            setSavingNewValueGroupId(groupId);
            setNewValueErrors(prev => ({ ...prev, [groupId]: null }));
            await createOptionValue({
                tenant_id: tenantId,
                option_group_id: groupId,
                name,
                price_modifier: parsed,
                absolute_price: null
            });
            await onRefreshOptions();
            setNewValueNames(prev => ({ ...prev, [groupId]: "" }));
            setNewValuePrices(prev => ({ ...prev, [groupId]: "" }));
        } catch {
            setNewValueErrors(prev => ({ ...prev, [groupId]: "Errore nell'aggiunta del valore" }));
            showToast({ message: "Errore nell'aggiunta del valore", type: "error" });
        } finally {
            setSavingNewValueGroupId(null);
        }
    };

    const isGroupBusy = (groupId: string) =>
        savingGroupId === groupId || deletingGroupId === groupId;

    const isValueBusy = (valueId: string) =>
        savingValueId === valueId || deletingValueId === valueId;

    // Value table columns — close over editing state
    const valueColumns: ColumnDefinition<V2ProductOptionValue>[] = [
        {
            id: "name",
            header: "Nome",
            cell: (_, val: V2ProductOptionValue) =>
                editingValueId === val.id ? (
                    <div className={styles.cellStack}>
                        <TextInput
                            value={editValueName}
                            onChange={e => setEditValueName(e.target.value)}
                            placeholder="Nome valore"
                            disabled={savingValueId === val.id}
                        />
                        {valueEditError && (
                            <Text variant="body-sm" colorVariant="error">
                                {valueEditError}
                            </Text>
                        )}
                    </div>
                ) : (
                    <Text variant="body">{val.name}</Text>
                ),
        },
        {
            id: "delta",
            header: "Delta €",
            width: "140px",
            cell: (_, val: V2ProductOptionValue) =>
                editingValueId === val.id ? (
                    <NumberInput
                        value={editValuePrice}
                        onChange={e => setEditValuePrice(e.target.value)}
                        placeholder="Delta €"
                        step="0.01"
                        disabled={savingValueId === val.id}
                    />
                ) : (
                    <Text variant="body">{formatDelta(val.price_modifier)}</Text>
                ),
        },
        {
            id: "actions",
            header: "",
            width: "80px",
            align: "right",
            cell: (_, val: V2ProductOptionValue) =>
                editingValueId === val.id ? (
                    <div className={styles.rowActions}>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleSaveValue(val.id)}
                            disabled={savingValueId === val.id}
                            loading={savingValueId === val.id}
                        >
                            Salva
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelEditValue}
                            disabled={savingValueId === val.id}
                        >
                            Annulla
                        </Button>
                    </div>
                ) : (
                    <TableRowActions
                        actions={[
                            {
                                label: "Modifica",
                                onClick: () => handleStartEditValue(val),
                            },
                            {
                                label: "Elimina",
                                onClick: () => handleDeleteValue(val.id),
                                variant: "destructive",
                                separator: true,
                            },
                        ]}
                    />
                ),
        },
    ];

    if (optionsLoading) {
        return (
            <Text variant="body-sm" colorVariant="muted">
                Caricamento configurazioni...
            </Text>
        );
    }

    return (
        <div className={styles.root}>
            {/* Create group form — invariato */}
            <section className={styles.createSection}>
                <Text variant="title-sm" weight={600} className={styles.createTitle}>
                    Nuova configurazione
                </Text>
                <Text variant="body-sm" colorVariant="muted" className={styles.createDescription}>
                    Le configurazioni sono opzioni extra selezionabili (es. aggiunte, personalizzazioni). Non sostituiscono le varianti.
                </Text>
                <div className={styles.createGroupForm}>
                    <div className={styles.inputGroup}>
                        <TextInput
                            label="Nome gruppo"
                            placeholder="Es. Aggiunte, Cottura, Extra..."
                            value={newGroupName}
                            onChange={e => setNewGroupName(e.target.value)}
                            disabled={savingNewGroup}
                        />
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleCreateGroup}
                            disabled={savingNewGroup}
                            loading={savingNewGroup}
                        >
                            Crea
                        </Button>
                    </div>
                </div>
                {newGroupError && (
                    <Text variant="body-sm" colorVariant="error" className={styles.createError}>
                        {newGroupError}
                    </Text>
                )}
            </section>

            {addonGroups.length === 0 ? (
                <Text variant="body-sm" colorVariant="muted">
                    Nessuna configurazione aggiunta. Crea un gruppo per definire opzioni extra del prodotto.
                </Text>
            ) : (
                <div className={styles.groupList}>
                    {addonGroups.map(group => (
                        <div key={group.id} className={styles.groupCard}>
                            {/* Group header */}
                            {editingGroupId === group.id ? (
                                <div className={styles.groupEditForm}>
                                    <TextInput
                                        label="Nome gruppo"
                                        value={editGroupName}
                                        onChange={e => setEditGroupName(e.target.value)}
                                        disabled={savingGroupId === group.id}
                                    />
                                    <Switch
                                        label="Limita selezione"
                                        checked={editGroupMaxSelectable !== null}
                                        onChange={checked => setEditGroupMaxSelectable(checked ? 1 : null)}
                                        disabled={savingGroupId === group.id}
                                    />
                                    {editGroupMaxSelectable !== null && (
                                        <NumberInput
                                            label="Massimo selezionabile"
                                            min="1"
                                            value={editGroupMaxSelectable.toString()}
                                            onChange={e => {
                                                const val = parseInt(e.target.value, 10);
                                                if (!isNaN(val) && val > 0) setEditGroupMaxSelectable(val);
                                            }}
                                            disabled={savingGroupId === group.id}
                                        />
                                    )}
                                    {groupEditError && (
                                        <Text variant="body-sm" colorVariant="error">
                                            {groupEditError}
                                        </Text>
                                    )}
                                    <div className={styles.groupEditActions}>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={() => handleSaveGroup(group.id)}
                                            disabled={isGroupBusy(group.id)}
                                            loading={savingGroupId === group.id}
                                        >
                                            Salva
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleCancelEditGroup}
                                            disabled={isGroupBusy(group.id)}
                                        >
                                            Annulla
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.groupHeader}>
                                    <div className={styles.groupMeta}>
                                        <Text variant="body" weight={600}>
                                            {group.name}
                                        </Text>
                                        <Badge variant="secondary">
                                            {group.values.length}{" "}
                                            {group.values.length === 1 ? "opzione" : "opzioni"}
                                        </Badge>
                                        {group.max_selectable != null && (
                                            <Badge variant="secondary">
                                                max {group.max_selectable}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className={styles.groupActions}>
                                        <TableRowActions
                                            actions={[
                                                {
                                                    label: "Modifica",
                                                    onClick: () => handleStartEditGroup(group),
                                                },
                                                {
                                                    label: "Elimina",
                                                    onClick: () => setDeleteGroup(group),
                                                    variant: "destructive",
                                                    separator: true,
                                                },
                                            ]}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Values table */}
                            <div className={styles.valueSection}>
                                <DataTable
                                    data={group.values}
                                    columns={valueColumns}
                                    density="compact"
                                    emptyState={
                                        <Text variant="body-sm" colorVariant="muted">
                                            Nessun valore configurato
                                        </Text>
                                    }
                                />

                                {/* Add value form */}
                                <div className={styles.addValueForm}>
                                    <div className={styles.addValueInputs}>
                                        <TextInput
                                            placeholder="Nome (es. Latte)"
                                            value={newValueNames[group.id] ?? ""}
                                            onChange={e =>
                                                setNewValueNames(prev => ({
                                                    ...prev,
                                                    [group.id]: e.target.value
                                                }))
                                            }
                                            disabled={savingNewValueGroupId === group.id}
                                        />
                                        <div className={styles.inputGroup}>
                                            <NumberInput
                                                placeholder="Delta € (es. 0.50)"
                                                value={newValuePrices[group.id] ?? ""}
                                                onChange={e =>
                                                    setNewValuePrices(prev => ({
                                                        ...prev,
                                                        [group.id]: e.target.value
                                                    }))
                                                }
                                                step="0.01"
                                                disabled={savingNewValueGroupId === group.id}
                                            />
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={() => handleAddValue(group.id)}
                                                disabled={savingNewValueGroupId === group.id}
                                                loading={savingNewValueGroupId === group.id}
                                            >
                                                Aggiungi
                                            </Button>
                                        </div>
                                    </div>
                                    {newValueErrors[group.id] && (
                                        <Text
                                            variant="body-sm"
                                            colorVariant="error"
                                            className={styles.addValueError}
                                        >
                                            {newValueErrors[group.id]}
                                        </Text>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Delete group confirmation dialog */}
            {deleteGroup && (
                <ConfirmDialog
                    isOpen={true}
                    onClose={() => setDeleteGroup(null)}
                    onConfirm={() => handleConfirmDeleteGroup(deleteGroup.id)}
                    title={`Elimina "${deleteGroup.name}"`}
                    message="Sei sicuro di voler eliminare questo gruppo? Tutti i valori associati verranno eliminati."
                    confirmLabel="Elimina"
                />
            )}
        </div>
    );
}
