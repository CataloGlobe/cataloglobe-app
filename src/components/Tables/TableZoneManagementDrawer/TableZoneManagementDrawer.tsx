import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Text from "@/components/ui/Text/Text";

import {
    createTableZone,
    deleteTableZone,
    getZoneTableCounts,
    listTableZones,
    updateTableZone
} from "@/services/supabase/tableZones";
import type { V2TableZone } from "@/types/orders";
import { useToast } from "@/context/Toast/ToastContext";

import styles from "./TableZoneManagementDrawer.module.scss";

export interface TableZoneManagementDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onZonesChanged: () => void;
    tenantId: string;
    activityId: string;
}

export function TableZoneManagementDrawer({
    isOpen,
    onClose,
    onZonesChanged,
    tenantId,
    activityId
}: TableZoneManagementDrawerProps) {
    const { showToast } = useToast();

    const [zones, setZones] = useState<V2TableZone[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(false);

    // Add zone form
    const [addingName, setAddingName] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    // Rename inline state
    const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const [editError, setEditError] = useState<string | null>(null);
    const [isRenaming, setIsRenaming] = useState(false);

    // Delete confirm inline
    const [deletingZoneId, setDeletingZoneId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [zonesData, countsData] = await Promise.all([
                listTableZones(tenantId, activityId),
                getZoneTableCounts(tenantId, activityId)
            ]);
            setZones(zonesData);
            setCounts(countsData);
        } catch {
            showToast({ message: "Impossibile caricare le zone", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, activityId, showToast]);

    useEffect(() => {
        if (isOpen) {
            void loadData();
            setAddingName("");
            setAddError(null);
            setEditingZoneId(null);
            setDeletingZoneId(null);
        }
    }, [isOpen, loadData]);

    const handleAdd = async () => {
        const trimmed = addingName.trim();
        if (!trimmed) {
            setAddError("Inserisci un nome");
            return;
        }
        setIsAdding(true);
        setAddError(null);
        try {
            await createTableZone(tenantId, { activity_id: activityId, name: trimmed });
            setAddingName("");
            await loadData();
            onZonesChanged();
            showToast({ message: "Zona creata", type: "success" });
        } catch (err) {
            if (err instanceof Error && err.message === "TABLE_ZONE_NAME_CONFLICT") {
                setAddError("Esiste gia una zona con questo nome");
            } else {
                setAddError("Errore durante la creazione");
            }
        } finally {
            setIsAdding(false);
        }
    };

    const startEdit = (zone: V2TableZone) => {
        setEditingZoneId(zone.id);
        setEditingName(zone.name);
        setEditError(null);
        setDeletingZoneId(null);
    };

    const cancelEdit = () => {
        setEditingZoneId(null);
        setEditingName("");
        setEditError(null);
    };

    const commitEdit = async () => {
        if (!editingZoneId) return;
        const trimmed = editingName.trim();
        const original = zones.find(z => z.id === editingZoneId);
        if (!original) {
            cancelEdit();
            return;
        }
        if (!trimmed) {
            setEditError("Il nome non puo essere vuoto");
            return;
        }
        if (trimmed === original.name) {
            cancelEdit();
            return;
        }
        setIsRenaming(true);
        setEditError(null);
        try {
            await updateTableZone(editingZoneId, tenantId, { name: trimmed });
            await loadData();
            onZonesChanged();
            cancelEdit();
            showToast({ message: "Zona aggiornata", type: "success" });
        } catch (err) {
            if (err instanceof Error && err.message === "TABLE_ZONE_NAME_CONFLICT") {
                setEditError("Esiste gia una zona con questo nome");
            } else {
                setEditError("Errore durante la rinomina");
            }
        } finally {
            setIsRenaming(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingZoneId) return;
        setIsDeleting(true);
        try {
            await deleteTableZone(deletingZoneId, tenantId);
            setDeletingZoneId(null);
            await loadData();
            onZonesChanged();
            showToast({ message: "Zona eliminata", type: "success" });
        } catch {
            showToast({ message: "Errore durante l'eliminazione", type: "error" });
        } finally {
            setIsDeleting(false);
        }
    };

    const hasZones = useMemo(() => zones.length > 0, [zones]);

    return (
        <SystemDrawer open={isOpen} onClose={onClose} width={520}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Gestisci zone
                    </Text>
                }
                footer={
                    <Button variant="secondary" onClick={onClose}>
                        Chiudi
                    </Button>
                }
            >
                <div className={styles.body}>
                    {/* Aggiungi zona */}
                    <div className={styles.addBox}>
                        <TextInput
                            value={addingName}
                            onChange={e => {
                                setAddingName(e.target.value);
                                if (addError) setAddError(null);
                            }}
                            placeholder="Nome zona"
                            disabled={isAdding}
                            onKeyDown={e => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleAdd();
                                }
                            }}
                        />
                        <Button
                            variant="primary"
                            leftIcon={<Plus size={14} />}
                            onClick={handleAdd}
                            loading={isAdding}
                            type="button"
                        >
                            Aggiungi
                        </Button>
                    </div>
                    {addError && (
                        <Text variant="body-sm" className={styles.errorRow}>
                            {addError}
                        </Text>
                    )}

                    {/* Lista zone */}
                    {!isLoading && !hasZones ? (
                        <EmptyState
                            compact
                            icon={<Plus size={28} strokeWidth={1.5} />}
                            title="Nessuna zona ancora creata"
                            description="Aggiungi la prima zona per organizzare i tavoli."
                        />
                    ) : (
                        <ul className={styles.zoneList}>
                            {zones.map(zone => {
                                const count = counts[zone.id] ?? 0;
                                const isEditing = editingZoneId === zone.id;
                                const isPendingDelete = deletingZoneId === zone.id;
                                return (
                                    <li key={zone.id} className={styles.zoneRow}>
                                        {isEditing ? (
                                            <div className={styles.editForm}>
                                                <TextInput
                                                    autoFocus
                                                    value={editingName}
                                                    onChange={e => {
                                                        setEditingName(e.target.value);
                                                        if (editError) setEditError(null);
                                                    }}
                                                    disabled={isRenaming}
                                                    onKeyDown={e => {
                                                        if (e.key === "Enter") {
                                                            e.preventDefault();
                                                            void commitEdit();
                                                        } else if (e.key === "Escape") {
                                                            e.preventDefault();
                                                            cancelEdit();
                                                        }
                                                    }}
                                                />
                                                <div className={styles.editActions}>
                                                    <Button
                                                        variant="secondary"
                                                        type="button"
                                                        onClick={cancelEdit}
                                                        disabled={isRenaming}
                                                    >
                                                        Annulla
                                                    </Button>
                                                    <Button
                                                        variant="primary"
                                                        type="button"
                                                        onClick={commitEdit}
                                                        loading={isRenaming}
                                                    >
                                                        Salva
                                                    </Button>
                                                </div>
                                                {editError && (
                                                    <Text variant="body-sm" className={styles.errorRow}>
                                                        {editError}
                                                    </Text>
                                                )}
                                            </div>
                                        ) : (
                                            <div className={styles.zoneRowHeader}>
                                                <Text weight={500} className={styles.zoneRowName}>
                                                    {zone.name}
                                                </Text>
                                                <div className={styles.zoneRowMeta}>
                                                    <span className={styles.countBadge}>
                                                        {count} {count === 1 ? "tavolo" : "tavoli"}
                                                    </span>
                                                    <div className={styles.zoneActions}>
                                                        <button
                                                            type="button"
                                                            className={styles.iconButton}
                                                            onClick={() => startEdit(zone)}
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
                                                        disabled={isDeleting}
                                                    >
                                                        Annulla
                                                    </Button>
                                                    <Button
                                                        variant="danger"
                                                        type="button"
                                                        leftIcon={<Trash2 size={14} />}
                                                        onClick={handleDelete}
                                                        loading={isDeleting}
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
