import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import Text from "@/components/ui/Text/Text";

import {
    createTableZone,
    deleteTableZone,
    getZoneTableCounts,
    listTableZones,
    updateTableZone
} from "@/services/supabase/tableZones";
import {
    createTableCombinationGroup,
    deleteTableCombinationGroup,
    listTableCombinationGroups,
    updateTableCombinationGroup
} from "@/services/supabase/tableCombinationGroups";
import type { V2TableCombinationGroup, V2TableWithState, V2TableZone } from "@/types/orders";
import { useToast } from "@/context/Toast/ToastContext";

import styles from "./TableZonesAndGroupsDrawer.module.scss";

export interface TableZonesAndGroupsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    /** Chiamata dopo qualunque CRUD su zone o gruppi: il parent ricarica i
     *  tavoli e forza il remount dei due select nel drawer tavolo. */
    onChanged: () => void;
    tenantId: string;
    activityId: string;
    /** Lista tavoli NON filtrata dalla ricerca — serve per i chip "tavoli nel
     *  gruppo" e i due avvisi, calcolati qui senza nessuna query aggiuntiva. */
    tables: V2TableWithState[];
}

export function TableZonesAndGroupsDrawer({
    isOpen,
    onClose,
    onChanged,
    tenantId,
    activityId,
    tables
}: TableZonesAndGroupsDrawerProps) {
    const { showToast } = useToast();

    // --- Zone ---
    const [zones, setZones] = useState<V2TableZone[]>([]);
    const [zoneCounts, setZoneCounts] = useState<Record<string, number>>({});
    const [isLoadingZones, setIsLoadingZones] = useState(false);

    const [addingZoneName, setAddingZoneName] = useState("");
    const [isAddingZone, setIsAddingZone] = useState(false);
    const [addZoneError, setAddZoneError] = useState<string | null>(null);

    const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
    const [editingZoneName, setEditingZoneName] = useState("");
    const [editZoneError, setEditZoneError] = useState<string | null>(null);
    const [isRenamingZone, setIsRenamingZone] = useState(false);

    const [deletingZoneId, setDeletingZoneId] = useState<string | null>(null);
    const [isDeletingZone, setIsDeletingZone] = useState(false);

    // --- Gruppi di accostamento ---
    const [groups, setGroups] = useState<V2TableCombinationGroup[]>([]);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);

    const [addingGroupName, setAddingGroupName] = useState("");
    const [isAddingGroup, setIsAddingGroup] = useState(false);
    const [addGroupError, setAddGroupError] = useState<string | null>(null);

    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editingGroupName, setEditingGroupName] = useState("");
    const [editGroupError, setEditGroupError] = useState<string | null>(null);
    const [isRenamingGroup, setIsRenamingGroup] = useState(false);

    const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
    const [isDeletingGroup, setIsDeletingGroup] = useState(false);

    const loadZones = useCallback(async () => {
        setIsLoadingZones(true);
        try {
            const [zonesData, countsData] = await Promise.all([
                listTableZones(tenantId, activityId),
                getZoneTableCounts(tenantId, activityId)
            ]);
            setZones(zonesData);
            setZoneCounts(countsData);
        } catch {
            showToast({ message: "Impossibile caricare le zone", type: "error" });
        } finally {
            setIsLoadingZones(false);
        }
    }, [tenantId, activityId, showToast]);

    const loadGroups = useCallback(async () => {
        setIsLoadingGroups(true);
        try {
            const data = await listTableCombinationGroups(tenantId, activityId);
            setGroups(data);
        } catch {
            showToast({ message: "Impossibile caricare i gruppi di accostamento", type: "error" });
        } finally {
            setIsLoadingGroups(false);
        }
    }, [tenantId, activityId, showToast]);

    useEffect(() => {
        if (isOpen) {
            void loadZones();
            void loadGroups();
            setAddingZoneName("");
            setAddZoneError(null);
            setEditingZoneId(null);
            setDeletingZoneId(null);
            setAddingGroupName("");
            setAddGroupError(null);
            setEditingGroupId(null);
            setDeletingGroupId(null);
        }
    }, [isOpen, loadZones, loadGroups]);

    // Tavoli per gruppo, calcolati dalla lista in memoria: niente nuove query.
    const tablesByGroupId = useMemo(() => {
        const map = new Map<string, V2TableWithState[]>();
        for (const table of tables) {
            if (!table.combination_group_id) continue;
            const list = map.get(table.combination_group_id);
            if (list) {
                list.push(table);
            } else {
                map.set(table.combination_group_id, [table]);
            }
        }
        return map;
    }, [tables]);

    // --- Zone handlers ---

    const handleAddZone = async () => {
        const trimmed = addingZoneName.trim();
        if (!trimmed) {
            setAddZoneError("Inserisci un nome");
            return;
        }
        setIsAddingZone(true);
        setAddZoneError(null);
        try {
            await createTableZone(tenantId, { activity_id: activityId, name: trimmed });
            setAddingZoneName("");
            await loadZones();
            onChanged();
            showToast({ message: "Zona creata", type: "success" });
        } catch (err) {
            if (err instanceof Error && err.message === "TABLE_ZONE_NAME_CONFLICT") {
                setAddZoneError("Esiste gia una zona con questo nome");
            } else {
                setAddZoneError("Errore durante la creazione");
            }
        } finally {
            setIsAddingZone(false);
        }
    };

    const startEditZone = (zone: V2TableZone) => {
        setEditingZoneId(zone.id);
        setEditingZoneName(zone.name);
        setEditZoneError(null);
        setDeletingZoneId(null);
    };

    const cancelEditZone = () => {
        setEditingZoneId(null);
        setEditingZoneName("");
        setEditZoneError(null);
    };

    const commitEditZone = async () => {
        if (!editingZoneId) return;
        const trimmed = editingZoneName.trim();
        const original = zones.find(z => z.id === editingZoneId);
        if (!original) {
            cancelEditZone();
            return;
        }
        if (!trimmed) {
            setEditZoneError("Il nome non puo essere vuoto");
            return;
        }
        if (trimmed === original.name) {
            cancelEditZone();
            return;
        }
        setIsRenamingZone(true);
        setEditZoneError(null);
        try {
            await updateTableZone(editingZoneId, tenantId, { name: trimmed });
            await loadZones();
            onChanged();
            cancelEditZone();
            showToast({ message: "Zona aggiornata", type: "success" });
        } catch (err) {
            if (err instanceof Error && err.message === "TABLE_ZONE_NAME_CONFLICT") {
                setEditZoneError("Esiste gia una zona con questo nome");
            } else {
                setEditZoneError("Errore durante la rinomina");
            }
        } finally {
            setIsRenamingZone(false);
        }
    };

    const handleDeleteZone = async () => {
        if (!deletingZoneId) return;
        setIsDeletingZone(true);
        try {
            await deleteTableZone(deletingZoneId, tenantId);
            setDeletingZoneId(null);
            await loadZones();
            onChanged();
            showToast({ message: "Zona eliminata", type: "success" });
        } catch {
            showToast({ message: "Errore durante l'eliminazione", type: "error" });
        } finally {
            setIsDeletingZone(false);
        }
    };

    // --- Gruppi handlers ---

    const handleAddGroup = async () => {
        const trimmed = addingGroupName.trim();
        if (!trimmed) {
            setAddGroupError("Inserisci un nome");
            return;
        }
        setIsAddingGroup(true);
        setAddGroupError(null);
        try {
            await createTableCombinationGroup(tenantId, { activity_id: activityId, name: trimmed });
            setAddingGroupName("");
            await loadGroups();
            onChanged();
            showToast({ message: "Gruppo creato", type: "success" });
        } catch (err) {
            if (err instanceof Error && err.message === "TABLE_COMBINATION_GROUP_NAME_CONFLICT") {
                setAddGroupError("Esiste gia un gruppo con questo nome");
            } else {
                setAddGroupError("Errore durante la creazione");
            }
        } finally {
            setIsAddingGroup(false);
        }
    };

    const startEditGroup = (group: V2TableCombinationGroup) => {
        setEditingGroupId(group.id);
        setEditingGroupName(group.name);
        setEditGroupError(null);
        setDeletingGroupId(null);
    };

    const cancelEditGroup = () => {
        setEditingGroupId(null);
        setEditingGroupName("");
        setEditGroupError(null);
    };

    const commitEditGroup = async () => {
        if (!editingGroupId) return;
        const trimmed = editingGroupName.trim();
        const original = groups.find(g => g.id === editingGroupId);
        if (!original) {
            cancelEditGroup();
            return;
        }
        if (!trimmed) {
            setEditGroupError("Il nome non puo essere vuoto");
            return;
        }
        if (trimmed === original.name) {
            cancelEditGroup();
            return;
        }
        setIsRenamingGroup(true);
        setEditGroupError(null);
        try {
            await updateTableCombinationGroup(editingGroupId, tenantId, { name: trimmed });
            await loadGroups();
            onChanged();
            cancelEditGroup();
            showToast({ message: "Gruppo aggiornato", type: "success" });
        } catch (err) {
            if (err instanceof Error && err.message === "TABLE_COMBINATION_GROUP_NAME_CONFLICT") {
                setEditGroupError("Esiste gia un gruppo con questo nome");
            } else {
                setEditGroupError("Errore durante la rinomina");
            }
        } finally {
            setIsRenamingGroup(false);
        }
    };

    const handleDeleteGroup = async () => {
        if (!deletingGroupId) return;
        setIsDeletingGroup(true);
        try {
            await deleteTableCombinationGroup(deletingGroupId, tenantId);
            setDeletingGroupId(null);
            await loadGroups();
            onChanged();
            showToast({ message: "Gruppo eliminato", type: "success" });
        } catch {
            showToast({ message: "Errore durante l'eliminazione", type: "error" });
        } finally {
            setIsDeletingGroup(false);
        }
    };

    const hasZones = zones.length > 0;
    const hasGroups = groups.length > 0;

    return (
        <SystemDrawer open={isOpen} onClose={onClose} width={520}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Zone e accostamenti
                    </Text>
                }
                footer={
                    <Button variant="secondary" onClick={onClose}>
                        Chiudi
                    </Button>
                }
            >
                <div className={styles.body}>
                    {/* --- Sezione zone --- */}
                    <div className={styles.sectionTitle}>
                        <Text variant="body-sm" weight={600}>
                            Zone
                        </Text>
                    </div>

                    <div className={styles.addBox}>
                        <TextInput
                            value={addingZoneName}
                            onChange={e => {
                                setAddingZoneName(e.target.value);
                                if (addZoneError) setAddZoneError(null);
                            }}
                            placeholder="Nome zona"
                            disabled={isAddingZone}
                            onKeyDown={e => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleAddZone();
                                }
                            }}
                        />
                        <Button
                            variant="primary"
                            leftIcon={<Plus size={14} />}
                            onClick={handleAddZone}
                            loading={isAddingZone}
                            type="button"
                        >
                            Aggiungi
                        </Button>
                    </div>
                    {addZoneError && (
                        <Text variant="body-sm" className={styles.errorRow}>
                            {addZoneError}
                        </Text>
                    )}

                    {!isLoadingZones && !hasZones ? (
                        <EmptyState
                            compact
                            icon={<Plus size={28} strokeWidth={1.5} />}
                            title="Nessuna zona ancora creata"
                            description="Aggiungi la prima zona per organizzare i tavoli."
                        />
                    ) : (
                        <ul className={styles.itemList}>
                            {zones.map(zone => {
                                const count = zoneCounts[zone.id] ?? 0;
                                const isEditing = editingZoneId === zone.id;
                                const isPendingDelete = deletingZoneId === zone.id;
                                return (
                                    <li key={zone.id} className={styles.itemRow}>
                                        {isEditing ? (
                                            <div className={styles.editForm}>
                                                <TextInput
                                                    autoFocus
                                                    value={editingZoneName}
                                                    onChange={e => {
                                                        setEditingZoneName(e.target.value);
                                                        if (editZoneError) setEditZoneError(null);
                                                    }}
                                                    disabled={isRenamingZone}
                                                    onKeyDown={e => {
                                                        if (e.key === "Enter") {
                                                            e.preventDefault();
                                                            void commitEditZone();
                                                        } else if (e.key === "Escape") {
                                                            e.preventDefault();
                                                            cancelEditZone();
                                                        }
                                                    }}
                                                />
                                                <div className={styles.editActions}>
                                                    <Button
                                                        variant="secondary"
                                                        type="button"
                                                        onClick={cancelEditZone}
                                                        disabled={isRenamingZone}
                                                    >
                                                        Annulla
                                                    </Button>
                                                    <Button
                                                        variant="primary"
                                                        type="button"
                                                        onClick={commitEditZone}
                                                        loading={isRenamingZone}
                                                    >
                                                        Salva
                                                    </Button>
                                                </div>
                                                {editZoneError && (
                                                    <Text variant="body-sm" className={styles.errorRow}>
                                                        {editZoneError}
                                                    </Text>
                                                )}
                                            </div>
                                        ) : (
                                            <div className={styles.itemRowHeader}>
                                                <Text weight={500} className={styles.itemRowName}>
                                                    {zone.name}
                                                </Text>
                                                <div className={styles.itemRowMeta}>
                                                    <span className={styles.countBadge}>
                                                        {count} {count === 1 ? "tavolo" : "tavoli"}
                                                    </span>
                                                    <div className={styles.itemActions}>
                                                        <button
                                                            type="button"
                                                            className={styles.iconButton}
                                                            onClick={() => startEditZone(zone)}
                                                            aria-label={`Rinomina ${zone.name}`}
                                                            disabled={isPendingDelete}
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                                                            onClick={() => {
                                                                setDeletingZoneId(zone.id);
                                                                setEditingZoneId(null);
                                                            }}
                                                            aria-label={`Elimina ${zone.name}`}
                                                            disabled={isPendingDelete}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {isPendingDelete && (
                                            <div className={styles.confirmDelete}>
                                                <Text variant="body-sm">
                                                    {count > 0
                                                        ? `Questa zona e' usata da ${count} ${count === 1 ? "tavolo" : "tavoli"}, che diventeranno "Senza zona". Continuare?`
                                                        : "Eliminare questa zona?"}
                                                </Text>
                                                <div className={styles.confirmActions}>
                                                    <Button
                                                        variant="secondary"
                                                        type="button"
                                                        leftIcon={<X size={14} />}
                                                        onClick={() => setDeletingZoneId(null)}
                                                        disabled={isDeletingZone}
                                                    >
                                                        Annulla
                                                    </Button>
                                                    <Button
                                                        variant="danger"
                                                        type="button"
                                                        leftIcon={<Trash2 size={14} />}
                                                        onClick={handleDeleteZone}
                                                        loading={isDeletingZone}
                                                    >
                                                        Elimina
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {/* --- Sezione gruppi di accostamento --- */}
                    <div className={styles.sectionTitle}>
                        <Text variant="body-sm" weight={600}>
                            Gruppi di accostamento
                        </Text>
                        <Text variant="body-sm" className={styles.sectionHint}>
                            I tavoli dello stesso gruppo sono accostabili tutti fra loro,
                            ma il sistema ne unisce al massimo 3 per volta e solo tra
                            tavoli del gruppo stesso.
                        </Text>
                    </div>

                    <div className={styles.addBox}>
                        <TextInput
                            value={addingGroupName}
                            onChange={e => {
                                setAddingGroupName(e.target.value);
                                if (addGroupError) setAddGroupError(null);
                            }}
                            placeholder="Nome gruppo"
                            disabled={isAddingGroup}
                            onKeyDown={e => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleAddGroup();
                                }
                            }}
                        />
                        <Button
                            variant="primary"
                            leftIcon={<Plus size={14} />}
                            onClick={handleAddGroup}
                            loading={isAddingGroup}
                            type="button"
                        >
                            Aggiungi
                        </Button>
                    </div>
                    {addGroupError && (
                        <Text variant="body-sm" className={styles.errorRow}>
                            {addGroupError}
                        </Text>
                    )}

                    {!isLoadingGroups && !hasGroups ? (
                        <EmptyState
                            compact
                            icon={<Plus size={28} strokeWidth={1.5} />}
                            title="Nessun gruppo ancora creato"
                            description="Crea un gruppo per accostare più tavoli fra loro."
                        />
                    ) : (
                        <ul className={styles.itemList}>
                            {groups.map(group => {
                                const groupTables = tablesByGroupId.get(group.id) ?? [];
                                const isEditing = editingGroupId === group.id;
                                const isPendingDelete = deletingGroupId === group.id;
                                const distinctZones = new Set(
                                    groupTables
                                        .map(t => t.zone_name)
                                        .filter((z): z is string => !!z)
                                );
                                const isInert = groupTables.length < 2;
                                const spansMultipleZones = distinctZones.size >= 2;
                                return (
                                    <li key={group.id} className={styles.itemRow}>
                                        {isEditing ? (
                                            <div className={styles.editForm}>
                                                <TextInput
                                                    autoFocus
                                                    value={editingGroupName}
                                                    onChange={e => {
                                                        setEditingGroupName(e.target.value);
                                                        if (editGroupError) setEditGroupError(null);
                                                    }}
                                                    disabled={isRenamingGroup}
                                                    onKeyDown={e => {
                                                        if (e.key === "Enter") {
                                                            e.preventDefault();
                                                            void commitEditGroup();
                                                        } else if (e.key === "Escape") {
                                                            e.preventDefault();
                                                            cancelEditGroup();
                                                        }
                                                    }}
                                                />
                                                <div className={styles.editActions}>
                                                    <Button
                                                        variant="secondary"
                                                        type="button"
                                                        onClick={cancelEditGroup}
                                                        disabled={isRenamingGroup}
                                                    >
                                                        Annulla
                                                    </Button>
                                                    <Button
                                                        variant="primary"
                                                        type="button"
                                                        onClick={commitEditGroup}
                                                        loading={isRenamingGroup}
                                                    >
                                                        Salva
                                                    </Button>
                                                </div>
                                                {editGroupError && (
                                                    <Text variant="body-sm" className={styles.errorRow}>
                                                        {editGroupError}
                                                    </Text>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                <div className={styles.itemRowHeader}>
                                                    <Text weight={500} className={styles.itemRowName}>
                                                        {group.name}
                                                    </Text>
                                                    <div className={styles.itemRowMeta}>
                                                        <span className={styles.countBadge}>
                                                            {groupTables.length}{" "}
                                                            {groupTables.length === 1 ? "tavolo" : "tavoli"}
                                                        </span>
                                                        <div className={styles.itemActions}>
                                                            <button
                                                                type="button"
                                                                className={styles.iconButton}
                                                                onClick={() => startEditGroup(group)}
                                                                aria-label={`Rinomina ${group.name}`}
                                                                disabled={isPendingDelete}
                                                            >
                                                                <Pencil size={14} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                                                                onClick={() => {
                                                                    setDeletingGroupId(group.id);
                                                                    setEditingGroupId(null);
                                                                }}
                                                                aria-label={`Elimina ${group.name}`}
                                                                disabled={isPendingDelete}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {groupTables.length > 0 ? (
                                                    <div className={styles.chipRow}>
                                                        {groupTables.map(t => (
                                                            <span key={t.id} className={styles.chip}>
                                                                {t.label}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <Text variant="body-sm" className={styles.emptyGroupHint}>
                                                        Nessun tavolo assegnato a questo gruppo.
                                                    </Text>
                                                )}

                                                {isInert && (
                                                    <InlineBanner variant="info">
                                                        Con meno di 2 tavoli il gruppo non produce mai un
                                                        accostamento: aggiungi almeno un altro tavolo.
                                                    </InlineBanner>
                                                )}
                                                {spansMultipleZones && (
                                                    <InlineBanner variant="warning">
                                                        I tavoli di questo gruppo sono in zone diverse (
                                                        {Array.from(distinctZones).join(", ")}): l'accostamento
                                                        potrebbe unire tavoli fisicamente lontani.
                                                    </InlineBanner>
                                                )}
                                            </>
                                        )}
                                        {isPendingDelete && (
                                            <div className={styles.confirmDelete}>
                                                <Text variant="body-sm">
                                                    {groupTables.length > 0
                                                        ? `Questo gruppo è usato da ${groupTables.length} ${groupTables.length === 1 ? "tavolo" : "tavoli"}, che torneranno «senza gruppo» (non accostabili). Continuare?`
                                                        : "Eliminare questo gruppo?"}
                                                </Text>
                                                <div className={styles.confirmActions}>
                                                    <Button
                                                        variant="secondary"
                                                        type="button"
                                                        leftIcon={<X size={14} />}
                                                        onClick={() => setDeletingGroupId(null)}
                                                        disabled={isDeletingGroup}
                                                    >
                                                        Annulla
                                                    </Button>
                                                    <Button
                                                        variant="danger"
                                                        type="button"
                                                        leftIcon={<Trash2 size={14} />}
                                                        onClick={handleDeleteGroup}
                                                        loading={isDeletingGroup}
                                                    >
                                                        Elimina
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
