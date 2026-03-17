import React, { useState } from "react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { Switch } from "@/components/ui/Switch/Switch";
import { Badge } from "@/components/ui/Badge/Badge";
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
    // --- Create group form ---
    const [newGroupName, setNewGroupName] = useState("");
    const [newGroupRequired, setNewGroupRequired] = useState(false);
    const [newGroupMaxSel, setNewGroupMaxSel] = useState("");
    const [savingNewGroup, setSavingNewGroup] = useState(false);
    const [newGroupError, setNewGroupError] = useState<string | null>(null);

    // --- Edit group ---
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editGroupName, setEditGroupName] = useState("");
    const [editGroupRequired, setEditGroupRequired] = useState(false);
    const [editGroupMaxSel, setEditGroupMaxSel] = useState("");
    const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
    const [groupEditError, setGroupEditError] = useState<string | null>(null);

    // --- Delete group ---
    const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);
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
        const maxSel = newGroupMaxSel.trim();
        if (maxSel !== "") {
            const parsed = parseInt(maxSel, 10);
            if (isNaN(parsed) || parsed < 1) {
                setNewGroupError("Selezione massima deve essere un intero >= 1");
                return;
            }
        }
        try {
            setSavingNewGroup(true);
            setNewGroupError(null);
            await createProductOptionGroup({
                tenant_id: tenantId,
                product_id: productId,
                name,
                is_required: newGroupRequired,
                max_selectable: maxSel !== "" ? parseInt(maxSel, 10) : null,
                group_kind: "ADDON",
                pricing_mode: "DELTA"
            });
            await onRefreshOptions();
            setNewGroupName("");
            setNewGroupRequired(false);
            setNewGroupMaxSel("");
        } catch (err) {
            console.error(err);
            setNewGroupError("Errore nella creazione del gruppo");
        } finally {
            setSavingNewGroup(false);
        }
    };

    // --- Edit group handlers ---
    const handleStartEditGroup = (group: GroupWithValues) => {
        setEditingGroupId(group.id);
        setEditGroupName(group.name);
        setEditGroupRequired(group.is_required);
        setEditGroupMaxSel(group.max_selectable !== null ? String(group.max_selectable) : "");
        setGroupEditError(null);
        setConfirmDeleteGroupId(null);
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
        const maxSel = editGroupMaxSel.trim();
        if (maxSel !== "") {
            const parsed = parseInt(maxSel, 10);
            if (isNaN(parsed) || parsed < 1) {
                setGroupEditError("Selezione massima deve essere un intero >= 1");
                return;
            }
        }
        try {
            setSavingGroupId(groupId);
            await updateProductOptionGroup(groupId, {
                name,
                is_required: editGroupRequired,
                max_selectable: maxSel !== "" ? parseInt(maxSel, 10) : null
            });
            await onRefreshOptions();
            setEditingGroupId(null);
        } catch (err) {
            console.error(err);
            setGroupEditError("Errore nel salvataggio del gruppo");
        } finally {
            setSavingGroupId(null);
        }
    };

    // --- Delete group handlers ---
    const handleConfirmDeleteGroup = async (groupId: string) => {
        try {
            setDeletingGroupId(groupId);
            await deleteProductOptionGroup(groupId);
            await onRefreshOptions();
            setConfirmDeleteGroupId(null);
        } catch (err) {
            console.error(err);
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
        } catch (err) {
            console.error(err);
            setValueEditError("Errore nel salvataggio del valore");
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
        } catch (err) {
            console.error(err);
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
        } catch (err) {
            console.error(err);
            setNewValueErrors(prev => ({ ...prev, [groupId]: "Errore nell'aggiunta del valore" }));
        } finally {
            setSavingNewValueGroupId(null);
        }
    };

    const isGroupBusy = (groupId: string) =>
        savingGroupId === groupId || deletingGroupId === groupId;

    const isValueBusy = (valueId: string) =>
        savingValueId === valueId || deletingValueId === valueId;

    if (optionsLoading) {
        return (
            <Text variant="body-sm" colorVariant="muted">
                Caricamento configurazioni...
            </Text>
        );
    }

    return (
        <div className={styles.root}>
            {/* Create group form */}
            <section className={styles.createSection}>
                <Text variant="title-sm" weight={600} style={{ marginBottom: "12px" }}>
                    Nuovo gruppo opzioni
                </Text>
                <div className={styles.createGroupForm}>
                    <TextInput
                        placeholder="Nome gruppo (es. Aggiunte)"
                        value={newGroupName}
                        onChange={e => setNewGroupName(e.target.value)}
                        disabled={savingNewGroup}
                    />
                    <NumberInput
                        placeholder="Max selezionabili"
                        value={newGroupMaxSel}
                        onChange={e => setNewGroupMaxSel(e.target.value)}
                        min="1"
                        step="1"
                        disabled={savingNewGroup}
                    />
                    <Switch
                        label="Obbligatorio"
                        checked={newGroupRequired}
                        onChange={setNewGroupRequired}
                        disabled={savingNewGroup}
                    />
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleCreateGroup}
                        disabled={savingNewGroup}
                        loading={savingNewGroup}
                    >
                        Crea gruppo
                    </Button>
                </div>
                {newGroupError && (
                    <Text variant="body-sm" colorVariant="error" style={{ marginTop: "6px" }}>
                        {newGroupError}
                    </Text>
                )}
            </section>

            {addonGroups.length === 0 ? (
                <Text variant="body-sm" colorVariant="muted">
                    Nessun gruppo configurato
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
                                    <div className={styles.groupEditRow}>
                                        <NumberInput
                                            label="Max selezionabili"
                                            value={editGroupMaxSel}
                                            onChange={e => setEditGroupMaxSel(e.target.value)}
                                            min="1"
                                            step="1"
                                            disabled={savingGroupId === group.id}
                                        />
                                        <Switch
                                            label="Obbligatorio"
                                            checked={editGroupRequired}
                                            onChange={setEditGroupRequired}
                                            disabled={savingGroupId === group.id}
                                        />
                                    </div>
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
                                            disabled={savingGroupId === group.id}
                                            loading={savingGroupId === group.id}
                                        >
                                            Salva
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleCancelEditGroup}
                                            disabled={savingGroupId === group.id}
                                        >
                                            Annulla
                                        </Button>
                                    </div>
                                </div>
                            ) : confirmDeleteGroupId === group.id ? (
                                <div className={styles.deleteConfirm}>
                                    <Text variant="body-sm">
                                        Eliminare il gruppo "{group.name}"? Verranno eliminati anche
                                        tutti i valori.
                                    </Text>
                                    <div className={styles.deleteConfirmActions}>
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            onClick={() => handleConfirmDeleteGroup(group.id)}
                                            disabled={deletingGroupId === group.id}
                                            loading={deletingGroupId === group.id}
                                        >
                                            Elimina
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setConfirmDeleteGroupId(null)}
                                            disabled={deletingGroupId === group.id}
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
                                        <div className={styles.groupBadges}>
                                            {group.is_required && (
                                                <Badge variant="warning">Obbligatorio</Badge>
                                            )}
                                            {group.max_selectable !== null && (
                                                <Badge variant="secondary">
                                                    Max: {group.max_selectable}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <div className={styles.groupActions}>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleStartEditGroup(group)}
                                            disabled={isGroupBusy(group.id)}
                                        >
                                            Modifica
                                        </Button>
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            onClick={() => setConfirmDeleteGroupId(group.id)}
                                            disabled={isGroupBusy(group.id)}
                                        >
                                            Elimina
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Values table */}
                            <div className={styles.valueSection}>
                                {group.values.length > 0 && (
                                    <div className={styles.valueTable}>
                                        <div className={styles.valueHeader}>
                                            <Text variant="body-sm" weight={600}>
                                                Nome
                                            </Text>
                                            <Text variant="body-sm" weight={600}>
                                                Delta €
                                            </Text>
                                            <div />
                                        </div>

                                        {group.values.map(val =>
                                            editingValueId === val.id ? (
                                                <div
                                                    key={val.id}
                                                    className={styles.valueEditRow}
                                                >
                                                    <TextInput
                                                        value={editValueName}
                                                        onChange={e =>
                                                            setEditValueName(e.target.value)
                                                        }
                                                        placeholder="Nome valore"
                                                        disabled={savingValueId === val.id}
                                                    />
                                                    <NumberInput
                                                        value={editValuePrice}
                                                        onChange={e =>
                                                            setEditValuePrice(e.target.value)
                                                        }
                                                        placeholder="Delta €"
                                                        step="0.01"
                                                        disabled={savingValueId === val.id}
                                                    />
                                                    <div className={styles.rowActions}>
                                                        <Button
                                                            variant="primary"
                                                            size="sm"
                                                            onClick={() =>
                                                                handleSaveValue(val.id)
                                                            }
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
                                                    {valueEditError && (
                                                        <Text
                                                            variant="body-sm"
                                                            colorVariant="error"
                                                            className={styles.rowError}
                                                        >
                                                            {valueEditError}
                                                        </Text>
                                                    )}
                                                </div>
                                            ) : (
                                                <div key={val.id} className={styles.valueRow}>
                                                    <Text variant="body">{val.name}</Text>
                                                    <Text variant="body">
                                                        {formatDelta(val.price_modifier)}
                                                    </Text>
                                                    <div className={styles.rowActions}>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() =>
                                                                handleStartEditValue(val)
                                                            }
                                                            disabled={
                                                                isValueBusy(val.id) ||
                                                                savingNewValueGroupId === group.id
                                                            }
                                                        >
                                                            Modifica
                                                        </Button>
                                                        <Button
                                                            variant="danger"
                                                            size="sm"
                                                            onClick={() =>
                                                                handleDeleteValue(val.id)
                                                            }
                                                            disabled={isValueBusy(val.id)}
                                                            loading={deletingValueId === val.id}
                                                        >
                                                            Elimina
                                                        </Button>
                                                    </div>
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}

                                {group.values.length === 0 && (
                                    <Text
                                        variant="body-sm"
                                        colorVariant="muted"
                                        style={{ marginBottom: "12px" }}
                                    >
                                        Nessun valore configurato
                                    </Text>
                                )}

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
                                    {newValueErrors[group.id] && (
                                        <Text
                                            variant="body-sm"
                                            colorVariant="error"
                                            style={{ marginTop: "4px" }}
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
        </div>
    );
}
