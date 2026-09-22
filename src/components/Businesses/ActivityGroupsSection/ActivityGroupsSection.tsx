import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Folders } from "lucide-react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { DataTable, DATA_TABLE_CLASSES, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { getActivityGroups, getGroupsForActivity, deleteActivityGroup } from "@/services/supabase/activity-groups";
import type { V2ActivityGroupWithCounts } from "@/types/activity-group";
import { ActivityGroupDrawer } from "../ActivityGroupDrawer";

interface ActivityGroupsSectionProps {
    searchQuery?: string;
    canWrite?: boolean;
    /**
     * Contatore che la pagina incrementa quando la testata chiede «Nuovo
     * gruppo»: a ogni cambio la sezione apre il drawer di creazione.
     */
    createRequest?: number;
}

type DrawerState = { open: false } | { open: true; mode: "create" } | { open: true; mode: "edit"; groupId: string };

/**
 * Seconda tab della pagina Sedi: i gruppi di sedi, bersaglio delle regole di
 * Programmazione (§32.3). Tabella, drawer crea/modifica, eliminazione singola
 * e multipla (un gruppo si ricrea: §32bis vale per le sedi, non qui).
 */
export const ActivityGroupsSection: React.FC<ActivityGroupsSectionProps> = ({
    searchQuery: externalSearchQuery = "",
    canWrite = true,
    createRequest = 0
}) => {
    const tenantId = useTenantId();
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [groups, setGroups] = useState<V2ActivityGroupWithCounts[]>([]);
    const [searchParams] = useSearchParams();
    const highlightActivityId = searchParams.get("highlight");
    const [highlightedGroupIds, setHighlightedGroupIds] = useState<string[]>([]);
    const [drawer, setDrawer] = useState<DrawerState>({ open: false });
    const [deleteTarget, setDeleteTarget] = useState<V2ActivityGroupWithCounts | null>(null);
    const [bulkDeletePendingIds, setBulkDeletePendingIds] = useState<string[]>([]);
    const bulkDeleteConfirmOpen = bulkDeletePendingIds.length > 0;

    const loadGroups = useCallback(async () => {
        if (!tenantId) return;
        try {
            setIsLoading(true);
            const data = await getActivityGroups(tenantId);
            setGroups(data);

            if (highlightActivityId) {
                const activityGroups = await getGroupsForActivity(highlightActivityId, tenantId);
                setHighlightedGroupIds(activityGroups.map(g => g.id));
            }
        } catch (error) {
            console.error("Errore nel caricamento dei gruppi di sedi:", error);
            showToast({ message: "Impossibile caricare i gruppi di sedi.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, highlightActivityId, showToast]);

    useEffect(() => {
        void loadGroups();
    }, [loadGroups]);

    const filteredGroups = useMemo(() => {
        if (!externalSearchQuery) return groups;
        return groups.filter(g => g.name.toLowerCase().includes(externalSearchQuery.toLowerCase()));
    }, [groups, externalSearchQuery]);
    const allGroupIds = useMemo(() => groups.map(g => g.id), [groups]);

    const openCreate = useCallback(() => setDrawer({ open: true, mode: "create" }), []);

    useEffect(() => {
        if (!canWrite || createRequest === 0) return;
        openCreate();
    }, [createRequest, canWrite, openCreate]);

    const handleDrawerSuccess = () => {
        void loadGroups();
        setDrawer({ open: false });
    };

    const handleConfirmDelete = async (): Promise<boolean> => {
        if (!deleteTarget || !tenantId) return false;
        try {
            await deleteActivityGroup(deleteTarget.id, tenantId);
            showToast({ message: "Gruppo eliminato.", type: "success" });
            void loadGroups();
            return true;
        } catch (error) {
            console.error("Errore eliminazione gruppo:", error);
            showToast({ message: "Errore durante l'eliminazione del gruppo.", type: "error" });
            return false;
        }
    };

    const handleConfirmBulkDelete = async (): Promise<boolean> => {
        if (bulkDeletePendingIds.length === 0 || !tenantId) return false;
        try {
            await Promise.all(bulkDeletePendingIds.map(id => deleteActivityGroup(id, tenantId)));
            showToast({
                message:
                    bulkDeletePendingIds.length === 1 ? "Gruppo eliminato." : `${bulkDeletePendingIds.length} gruppi eliminati.`,
                type: "success"
            });
            void loadGroups();
            return true;
        } catch (error) {
            console.error("Errore eliminazione multipla gruppi:", error);
            showToast({ message: "Errore durante l'eliminazione di alcuni gruppi.", type: "error" });
            return false;
        }
    };

    const columns = useMemo<ColumnDefinition<V2ActivityGroupWithCounts>[]>(
        () => [
            {
                id: "name",
                header: "Gruppo",
                width: "2fr",
                cell: (_, group) => (
                    <div className={DATA_TABLE_CLASSES.cellTwoLine}>
                        <span>{group.name}</span>
                        {group.description && <span>{group.description}</span>}
                    </div>
                )
            },
            {
                id: "count",
                header: "Sedi",
                width: "1fr",
                cell: (_, group) => (
                    <Badge variant="secondary">
                        {group.member_count} {group.member_count === 1 ? "sede" : "sedi"}
                    </Badge>
                )
            },
            {
                id: "actions",
                header: "",
                width: "56px",
                align: "right",
                cell: (_, group) => (
                    <TableRowActions
                        actions={[
                            {
                                label: "Modifica",
                                onClick: () => setDrawer({ open: true, mode: "edit", groupId: group.id }),
                                hidden: !canWrite
                            },
                            {
                                label: "Elimina",
                                onClick: () => setDeleteTarget(group),
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

    const showEmpty = !isLoading && filteredGroups.length === 0;

    return (
        <>
            {showEmpty ? (
                externalSearchQuery ? (
                    <EmptyState
                        variant="filtered"
                        title="Nessun risultato"
                        description="Nessun gruppo corrisponde alla ricerca."
                    />
                ) : (
                    <EmptyState
                        variant="page"
                        icon={<Folders />}
                        title="Nessun gruppo di sedi"
                        description="Un gruppo raccoglie più sedi: le regole di Programmazione lo puntano come bersaglio unico."
                        action={
                            canWrite ? (
                                <Button variant="primary" onClick={openCreate}>
                                    Crea il primo gruppo
                                </Button>
                            ) : undefined
                        }
                    />
                )
            ) : (
                <DataTable
                    data={filteredGroups}
                    isLoading={isLoading}
                    allRowIds={allGroupIds}
                    columns={columns}
                    selectable={canWrite}
                    onBulkDelete={canWrite ? ids => setBulkDeletePendingIds(ids) : undefined}
                    bulkActionLabel="Elimina selezionati"
                    highlightedRowIds={highlightedGroupIds}
                />
            )}

            <ActivityGroupDrawer
                open={drawer.open}
                mode={drawer.open ? drawer.mode : "create"}
                groupId={drawer.open && drawer.mode === "edit" ? drawer.groupId : undefined}
                onSuccess={handleDrawerSuccess}
                onClose={() => setDrawer({ open: false })}
            />

            <ConfirmDialog
                isOpen={deleteTarget !== null}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleConfirmDelete}
                title={`Elimina «${deleteTarget?.name ?? ""}»`}
                message="Le regole di Programmazione che puntano solo questo gruppo passano in bozza. Le sedi restano."
                confirmLabel="Elimina"
                confirmVariant="danger"
            />

            <ConfirmDialog
                isOpen={bulkDeleteConfirmOpen}
                onClose={() => setBulkDeletePendingIds([])}
                onConfirm={handleConfirmBulkDelete}
                title={bulkDeletePendingIds.length === 1 ? "Elimina 1 gruppo?" : `Elimina ${bulkDeletePendingIds.length} gruppi?`}
                message="Le regole di Programmazione che puntano solo questi gruppi passano in bozza. Le sedi restano."
                confirmLabel="Elimina"
                confirmVariant="danger"
            />
        </>
    );
};
