import { useCallback, useEffect, useState, useMemo } from "react";
import Text from "@/components/ui/Text/Text";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
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

interface ProductGroupsTabProps {
    tenantId?: string;
    isCreateOpen: boolean;
    onCloseCreate: () => void;
    searchQuery: string;
    onSearchQueryChange: (value: string) => void;
}

export default function ProductGroupsTab({
    tenantId,
    isCreateOpen,
    onCloseCreate,
    searchQuery
}: ProductGroupsTabProps) {
    const { showToast } = useToast();
    const { canEdit } = useSubscriptionGuard();

    const [isLoading, setIsLoading] = useState(true);
    const [allGroups, setAllGroups] = useState<ProductGroupWithCount[]>([]);

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
    const allGroupIds = useMemo(() => allGroups.map(g => g.id), [allGroups]);

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
            width: "56px",
            align: "right",
            cell: (_value, row) => (
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
            )
        }
    ];

    const emptyState = {
        icon: <IconFolder size={48} stroke={1} />,
        title: "Nessun gruppo trovato",
        description: searchQuery
            ? "Nessun gruppo corrisponde ai filtri di ricerca."
            : "Non hai ancora aggiunto alcun gruppo di prodotti."
    };

    return (
        <div className={styles.tabContent}>
            <DataTable<FlatGroup>
                data={flatTree}
                allRowIds={allGroupIds}
                columns={columns}
                isLoading={isLoading}
                selectable
                onBulkDelete={handleBulkDelete}
                emptyState={emptyState}
                loadingState={{ message: "Caricamento gruppi in corso..." }}
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
