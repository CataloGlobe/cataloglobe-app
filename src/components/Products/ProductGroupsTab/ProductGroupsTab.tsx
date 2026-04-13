import { useCallback, useEffect, useState, useMemo } from "react";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import Text from "@/components/ui/Text/Text";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TablePagination } from "@/components/ui/TablePagination/TablePagination";
import { IconFolder } from "@tabler/icons-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import styles from "./ProductGroupsTab.module.scss";

import {
    getProductGroupsWithCounts,
    deleteProductGroup,
    ProductGroupWithCount
} from "@/services/supabase/productGroups";
import { ProductGroupCreateEditDrawer, GroupFormMode } from "./ProductGroupCreateEditDrawer";
import { ProductGroupDeleteDrawer } from "./ProductGroupDeleteDrawer";
import { useToast } from "@/context/Toast/ToastContext";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";

type FlatGroup = ProductGroupWithCount & { depth: number; parentName: string | null };

function buildFlatTree(groups: ProductGroupWithCount[]): FlatGroup[] {
    const nameById = new Map(groups.map(g => [g.id, g.name]));

    const parents = groups
        .filter(g => g.parent_group_id === null)
        .sort((a, b) => a.name.localeCompare(b.name, "it"));

    const result: FlatGroup[] = [];
    const addedIds = new Set<string>();

    parents.forEach(parent => {
        result.push({ ...parent, depth: 0, parentName: null });
        addedIds.add(parent.id);

        const children = groups
            .filter(g => g.parent_group_id === parent.id)
            .sort((a, b) => a.name.localeCompare(b.name, "it"));

        children.forEach(child => {
            result.push({ ...child, depth: 1, parentName: parent.name });
            addedIds.add(child.id);
        });
    });

    // Orphans: parent_group_id set but parent not found
    groups.forEach(g => {
        if (!addedIds.has(g.id)) {
            const pName = g.parent_group_id ? (nameById.get(g.parent_group_id) ?? null) : null;
            result.push({ ...g, depth: 0, parentName: pName });
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
    const { canEdit } = useSubscriptionGuard();

    const [isLoading, setIsLoading] = useState(true);
    const [allGroups, setAllGroups] = useState<ProductGroupWithCount[]>([]);

    const [searchQuery, setSearchQuery] = useState("");

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

    const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
    const [createEditMode, setCreateEditMode] = useState<GroupFormMode>("create");
    const [groupToEdit, setGroupToEdit] = useState<ProductGroupWithCount | null>(null);
    const [defaultParentId, setDefaultParentId] = useState<string | undefined>(undefined);

    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [groupToDelete, setGroupToDelete] = useState<ProductGroupWithCount | null>(null);

    const loadData = useCallback(async () => {
        if (!tenantId) return;
        try {
            setIsLoading(true);
            const data = await getProductGroupsWithCounts(tenantId);
            setAllGroups(data);
        } catch {
            showToast({
                message: "Errore nel caricamento dei gruppi",
                type: "error"
            });
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (isCreateOpen) {
            setCreateEditMode("create");
            setGroupToEdit(null);
            setDefaultParentId(undefined);
        }
    }, [isCreateOpen]);

    const groupNameById = useMemo(
        () => new Map(allGroups.map(g => [g.id, g.name])),
        [allGroups]
    );

    const flatTree = useMemo(() => {
        if (searchQuery) {
            return allGroups
                .filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .sort((a, b) => a.name.localeCompare(b.name, "it"))
                .map(g => ({
                    ...g,
                    depth: 0,
                    parentName: g.parent_group_id ? (groupNameById.get(g.parent_group_id) ?? null) : null
                }));
        }
        return buildFlatTree(allGroups);
    }, [allGroups, searchQuery, groupNameById]);

    useEffect(() => {
        setPage(1);
    }, [searchQuery, pageSize]);

    const paginatedRows = useMemo(() => {
        const offset = (page - 1) * pageSize;
        return flatTree.slice(offset, offset + pageSize);
    }, [flatTree, page, pageSize]);

    const handleEdit = (group: ProductGroupWithCount) => {
        if (!canEdit) { showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" }); return; }
        setCreateEditMode("edit");
        setGroupToEdit(group);
        setIsCreateEditOpen(true);
    };

    const handleDelete = (group: ProductGroupWithCount) => {
        setGroupToDelete(group);
        setIsDeleteOpen(true);
    };

    const handleCreateSubgroup = (parentGroup: ProductGroupWithCount) => {
        if (!canEdit) { showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" }); return; }
        setCreateEditMode("create");
        setGroupToEdit(null);
        setDefaultParentId(parentGroup.id);
        setIsCreateEditOpen(true);
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
        } catch {
            showToast({
                message: "Errore nell'eliminazione dei gruppi.",
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
                <div data-depth={row.depth} className={styles.groupName}>
                    <Text variant="body-sm" weight={row.depth === 0 ? 600 : 500}>
                        {row.name}
                    </Text>
                </div>
            )
        },
        {
            id: "parent",
            header: "Gruppo padre",
            width: "1fr",
            cell: (_value, row) =>
                row.parentName ? (
                    <Text variant="body-sm">{row.parentName}</Text>
                ) : (
                    <Text variant="body-sm" colorVariant="muted">—</Text>
                )
        },
        {
            id: "products",
            header: "Prodotti",
            width: "1fr",
            accessor: row => row.productsCount,
            cell: (_value, row) =>
                row.productsCount > 0 ? (
                    <Text variant="body-sm">
                        {row.productsCount} {row.productsCount === 1 ? "prodotto" : "prodotti"}
                    </Text>
                ) : (
                    <Text variant="body-sm" colorVariant="muted">
                        —
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
                                label: "Crea sottogruppo",
                                onClick: () => handleCreateSubgroup(row),
                                hidden: row.parent_group_id !== null
                            },
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
                    setDefaultParentId(undefined);
                    onCloseCreate();
                }}
                mode={createEditMode}
                groupData={groupToEdit}
                allGroups={allGroups}
                onSuccess={loadData}
                tenantId={tenantId}
                defaultParentId={defaultParentId}
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
