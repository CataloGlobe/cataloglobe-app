import React, { useEffect, useState, useMemo } from "react";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { Card } from "@/components/ui/Card/Card";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TablePagination } from "@/components/ui/TablePagination/TablePagination";
import { IconFolder } from "@tabler/icons-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import styles from "./ProductGroupsTab.module.scss";

import {
    getProductGroups,
    deleteProductGroup,
    ProductGroup
} from "@/services/supabase/v2/productGroups";
import { ProductGroupCreateEditDrawer, GroupFormMode } from "./ProductGroupCreateEditDrawer";
import { ProductGroupDeleteDrawer } from "./ProductGroupDeleteDrawer";
import { useToast } from "@/context/Toast/ToastContext";

type FlatGroup = ProductGroup & { depth: number };

function buildFlatTree(groups: ProductGroup[]): FlatGroup[] {
    const parents = groups
        .filter(g => g.parent_group_id === null)
        .sort((a, b) => a.name.localeCompare(b.name, "it"));

    const result: FlatGroup[] = [];
    const addedIds = new Set<string>();

    parents.forEach(parent => {
        result.push({ ...parent, depth: 0 });
        addedIds.add(parent.id);

        const children = groups
            .filter(g => g.parent_group_id === parent.id)
            .sort((a, b) => a.name.localeCompare(b.name, "it"));

        children.forEach(child => {
            result.push({ ...child, depth: 1 });
            addedIds.add(child.id);
        });
    });

    // Orphans: parent_group_id set but parent not found
    groups.forEach(g => {
        if (!addedIds.has(g.id)) {
            result.push({ ...g, depth: 0 });
        }
    });

    return result;
}

const DEFAULT_PAGE_SIZE = 20;

interface ProductGroupsTabProps {
    tenantId?: string;
    isCreateOpen: boolean;
    onCloseCreate: () => void;
}

export default function ProductGroupsTab({
    tenantId,
    isCreateOpen,
    onCloseCreate
}: ProductGroupsTabProps) {
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [allGroups, setAllGroups] = useState<ProductGroup[]>([]);

    const [searchQuery, setSearchQuery] = useState("");

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

    const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
    const [createEditMode, setCreateEditMode] = useState<GroupFormMode>("create");
    const [groupToEdit, setGroupToEdit] = useState<ProductGroup | null>(null);

    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [groupToDelete, setGroupToDelete] = useState<ProductGroup | null>(null);

    const loadData = async () => {
        try {
            setIsLoading(true);
            const data = await getProductGroups(tenantId!);
            setAllGroups(data);
        } catch (error) {
            console.error("Errore nel caricamento dei gruppi:", error);
            showToast({
                message: "Non è stato possibile caricare i gruppi di prodotti.",
                type: "error"
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (tenantId) {
            loadData();
        }
    }, [tenantId]);

    useEffect(() => {
        if (isCreateOpen) {
            setCreateEditMode("create");
            setGroupToEdit(null);
        }
    }, [isCreateOpen]);

    const flatTree = useMemo(() => {
        if (searchQuery) {
            return allGroups
                .filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .sort((a, b) => a.name.localeCompare(b.name, "it"))
                .map(g => ({ ...g, depth: 0 }));
        }
        return buildFlatTree(allGroups);
    }, [allGroups, searchQuery]);

    useEffect(() => {
        setPage(1);
    }, [searchQuery, pageSize]);

    const paginatedRows = useMemo(() => {
        const offset = (page - 1) * pageSize;
        return flatTree.slice(offset, offset + pageSize);
    }, [flatTree, page, pageSize]);

    const handleEdit = (group: ProductGroup) => {
        setCreateEditMode("edit");
        setGroupToEdit(group);
        setIsCreateEditOpen(true);
    };

    const handleDelete = (group: ProductGroup) => {
        setGroupToDelete(group);
        setIsDeleteOpen(true);
    };

    const handleBulkDelete = async (selectedIds: string[]) => {
        if (selectedIds.length === 0) return;
        try {
            await Promise.all(selectedIds.map(id => deleteProductGroup(id)));
            showToast({
                message: `${selectedIds.length} gruppi eliminati con successo.`,
                type: "success"
            });
            loadData();
        } catch (error) {
            console.error("Errore eliminazione multipla gruppi:", error);
            showToast({
                message: "Errore durante l'eliminazione di alcuni gruppi prodotto.",
                type: "error"
            });
        }
    };

    const columns: ColumnDefinition<FlatGroup>[] = [
        {
            id: "name",
            header: "Nome",
            width: "2fr",
            accessor: row => row.name,
            cell: (_value, row) => (
                <div className={styles.nameCell} style={{ paddingLeft: row.depth * 24 }}>
                    <Text variant="body-sm" weight={row.depth === 0 ? 600 : 500}>
                        {row.name}
                    </Text>
                </div>
            )
        },
        {
            id: "hierarchy",
            header: "Gerarchia",
            width: "1fr",
            cell: (_value, row) =>
                row.depth === 0 ? (
                    <Badge variant="secondary">Principale</Badge>
                ) : (
                    <Badge variant="secondary">Sottogruppo</Badge>
                )
        },
        {
            id: "created_at",
            header: "Creato il",
            width: "1fr",
            accessor: row => row.created_at,
            cell: value => (
                <Text variant="body-sm" colorVariant="muted">
                    {new Date(value).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                    })}
                </Text>
            )
        },
        {
            id: "actions",
            header: "",
            width: "64px",
            align: "right",
            cell: (_value, row) => (
                <div data-row-click-ignore="true">
                    <TableRowActions
                        actions={[
                            { label: "Modifica", onClick: () => handleEdit(row) },
                            {
                                label: "Elimina",
                                onClick: () => handleDelete(row),
                                variant: "destructive",
                                separator: true
                            }
                        ]}
                    />
                </div>
            )
        }
    ];

    const emptyState = (
        <div className={styles.emptyState}>
            <IconFolder size={48} stroke={1} className={styles.emptyIcon} />
            <Text variant="title-sm" weight={600}>
                Nessun gruppo trovato
            </Text>
            <Text variant="body-sm" colorVariant="muted">
                {searchQuery
                    ? "Nessun gruppo corrisponde ai filtri di ricerca."
                    : "Non hai ancora aggiunto alcun gruppo di prodotti."}
            </Text>
        </div>
    );

    return (
        <div className={styles.tabContent}>
            <div className={styles.filterRow}>
                <FilterBar
                    search={{
                        value: searchQuery,
                        onChange: setSearchQuery,
                        placeholder: "Cerca gruppo..."
                    }}
                    className={styles.filterBar}
                />
            </div>

            <DataTable<FlatGroup>
                data={paginatedRows}
                columns={columns}
                isLoading={isLoading}
                selectable
                onBulkDelete={handleBulkDelete}
                emptyState={emptyState}
                loadingState={
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento gruppi in corso...
                    </Text>
                }
                pagination={
                    !isLoading && flatTree.length > 0 ? (
                        <TablePagination
                            page={page}
                            pageSize={pageSize}
                            total={flatTree.length}
                            onPageChange={setPage}
                            onPageSizeChange={setPageSize}
                        />
                    ) : undefined
                }
            />

            <ProductGroupCreateEditDrawer
                open={isCreateOpen || isCreateEditOpen}
                onClose={() => {
                    setIsCreateEditOpen(false);
                    onCloseCreate();
                }}
                mode={createEditMode}
                groupData={groupToEdit}
                allGroups={allGroups}
                onSuccess={loadData}
                tenantId={tenantId}
            />

            <ProductGroupDeleteDrawer
                open={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                groupData={groupToDelete}
                onSuccess={loadData}
            />
        </div>
    );
}
