import React, { useEffect, useState, useMemo } from "react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { IconFolder, IconFolderPlus } from "@tabler/icons-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import styles from "./ActivityGroupsSection.module.scss";

import { getActivityGroups, deleteActivityGroup } from "@/services/supabase/activity-groups";
import { V2ActivityGroupWithCounts } from "@/types/activity-group";
import { useDrawer } from "@/context/Drawer/useDrawer";
import { ActivityGroupDrawer } from "../ActivityGroupDrawer";
import { useSearchParams } from "react-router-dom";

interface ActivityGroupsSectionProps {
    searchQuery?: string;
    canWrite?: boolean;
    /**
     * Contatore che la pagina incrementa quando la testata chiede «Nuovo
     * gruppo»: a ogni cambio la sezione apre il drawer di creazione.
     */
    createRequest?: number;
}

export const ActivityGroupsSection: React.FC<ActivityGroupsSectionProps> = ({
    searchQuery: externalSearchQuery = "",
    canWrite = true,
    createRequest = 0
}) => {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const { openDrawer, closeDrawer } = useDrawer();

    const [isLoading, setIsLoading] = useState(true);
    const [groups, setGroups] = useState<V2ActivityGroupWithCounts[]>([]);
    const [searchParams] = useSearchParams();
    const highlightActivityId = searchParams.get("highlight");
    const [highlightedGroupIds, setHighlightedGroupIds] = useState<string[]>([]);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [bulkDeletePendingIds, setBulkDeletePendingIds] = useState<string[]>([]);
    const bulkDeleteConfirmOpen = bulkDeletePendingIds.length > 0;

    const loadGroups = async () => {
        if (!tenantId) return;
        try {
            setIsLoading(true);
            const data = await getActivityGroups(tenantId);
            setGroups(data);

            if (highlightActivityId) {
                const activityGroups = await import("@/services/supabase/activity-groups").then(
                    m => m.getGroupsForActivity(highlightActivityId, tenantId!)
                );
                setHighlightedGroupIds(activityGroups.map(g => g.id));
            }
        } catch (error) {
            console.error("Errore nel caricamento dei gruppi attività:", error);
            showToast({
                message: "Impossibile caricare i gruppi attività.",
                type: "error"
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadGroups();
    }, [tenantId]);

    const filteredGroups = useMemo(() => {
        if (!externalSearchQuery) return groups;
        return groups.filter(g => g.name.toLowerCase().includes(externalSearchQuery.toLowerCase()));
    }, [groups, externalSearchQuery]);
    const allGroupIds = useMemo(() => groups.map(g => g.id), [groups]);

    const handleCreate = () => {
        openDrawer({
            title: "Nuovo gruppo attività",
            content: (
                <ActivityGroupDrawer
                    mode="create"
                    onSuccess={() => {
                        loadGroups();
                        closeDrawer();
                    }}
                    onClose={closeDrawer}
                />
            )
        });
    };

    const handleEdit = (group: V2ActivityGroupWithCounts) => {
        openDrawer({
            title: "Modifica gruppo attività",
            content: (
                <ActivityGroupDrawer
                    mode="edit"
                    groupId={group.id}
                    onSuccess={() => {
                        loadGroups();
                        closeDrawer();
                    }}
                    onClose={closeDrawer}
                />
            )
        });
    };

    const handleDelete = (groupId: string) => {
        setDeleteTargetId(groupId);
    };

    const handleConfirmDelete = async (): Promise<boolean> => {
        if (!deleteTargetId) return false;
        try {
            await deleteActivityGroup(deleteTargetId, tenantId!);
            showToast({
                message: "Gruppo eliminato con successo.",
                type: "success"
            });
            loadGroups();
            return true;
        } catch (error) {
            console.error("Errore eliminazione gruppo:", error);
            showToast({
                message: "Errore durante l'eliminazione del gruppo.",
                type: "error"
            });
            return false;
        }
    };

    const handleBulkDelete = (selectedIds: string[]) => {
        if (selectedIds.length === 0) return;
        setBulkDeletePendingIds(selectedIds);
    };

    const handleConfirmBulkDelete = async (): Promise<boolean> => {
        if (bulkDeletePendingIds.length === 0) return false;
        try {
            await Promise.all(bulkDeletePendingIds.map(id => deleteActivityGroup(id, tenantId!)));
            showToast({
                message: `${bulkDeletePendingIds.length} gruppi eliminati con successo.`,
                type: "success"
            });
            loadGroups();
            return true;
        } catch (error) {
            console.error("Errore eliminazione multipla gruppi:", error);
            showToast({
                message: "Errore durante l'eliminazione di alcuni gruppi.",
                type: "error"
            });
            return false;
        }
    };

    const columns = useMemo<ColumnDefinition<V2ActivityGroupWithCounts>[]>(
        () => [
            {
                id: "name",
                header: "Nome gruppo",
                width: "2fr",
                cell: (_, group) => (
                    <div className={styles.colName}>
                        <Text variant="body-sm" weight={600}>
                            {group.name}
                        </Text>
                        {group.description && (
                            <Text
                                variant="body-sm"
                                colorVariant="muted"
                                className={styles.description}
                            >
                                {group.description}
                            </Text>
                        )}
                    </div>
                )
            },
            {
                id: "count",
                header: "N° Attività",
                width: "1.5fr",
                cell: (_, group) => <Badge variant="secondary">{group.member_count} attività</Badge>
            },
            {
                id: "actions",
                header: "",
                width: "56px",
                align: "right",
                cell: (_, group) => (
                    <TableRowActions
                        actions={[
                            { label: "Modifica", onClick: () => handleEdit(group), hidden: !canWrite },
                            {
                                label: "Elimina",
                                onClick: () => handleDelete(group.id),
                                variant: "destructive",
                                separator: true,
                                hidden: !canWrite || group.is_system
                            }
                        ]}
                    />
                )
            }
        ],
        [canWrite]
    );

    useEffect(() => {
        if (!canWrite || createRequest === 0) return;
        handleCreate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [createRequest]);

    return (
        <div className={styles.container}>
            {isLoading ? (
                <div className={styles.loadingState}>
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento gruppi...
                    </Text>
                </div>
            ) : filteredGroups.length === 0 ? (
                <div className={styles.emptyState}>
                    {externalSearchQuery ? (
                        <>
                            <IconFolder size={48} stroke={1} className={styles.emptyIcon} />
                            <Text variant="title-sm" weight={600}>
                                Nessun gruppo trovato
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Nessun gruppo corrisponde alla ricerca.
                            </Text>
                        </>
                    ) : (
                        <>
                            <IconFolderPlus size={48} stroke={1} className={styles.emptyIcon} />
                            <Text variant="title-sm" weight={600}>
                                Nessun gruppo creato
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Organizza le tue attività in gruppi per applicare regole mirate.
                            </Text>
                            {canWrite && (
                                <button
                                    type="button"
                                    className={styles.createCta}
                                    onClick={handleCreate}
                                >
                                    Crea il tuo primo gruppo
                                </button>
                            )}
                        </>
                    )}
                </div>
            ) : (
                <>
                    <DataTable
                        data={filteredGroups}
                        allRowIds={allGroupIds}
                        columns={columns}
                        selectable={canWrite}
                        onBulkDelete={canWrite ? handleBulkDelete : undefined}
                        highlightedRowIds={highlightedGroupIds}
                    />
                </>
            )}

            <ConfirmDialog
                isOpen={deleteTargetId !== null}
                onClose={() => setDeleteTargetId(null)}
                onConfirm={handleConfirmDelete}
                title="Elimina gruppo"
                message="Sei sicuro di voler eliminare questo gruppo?"
                confirmLabel="Elimina"
            />

            <ConfirmDialog
                isOpen={bulkDeleteConfirmOpen}
                onClose={() => setBulkDeletePendingIds([])}
                onConfirm={handleConfirmBulkDelete}
                title={
                    bulkDeletePendingIds.length === 1
                        ? "Elimina 1 gruppo?"
                        : `Elimina ${bulkDeletePendingIds.length} gruppi?`
                }
                message="I gruppi eliminati non potranno essere recuperati."
                confirmLabel="Elimina"
            />
        </div>
    );
};
