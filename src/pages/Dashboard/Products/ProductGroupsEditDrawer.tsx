import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import {
    ProductGroup,
    getProductGroups,
    getProductGroupAssignments,
    assignProductToGroup,
    removeProductFromGroup
} from "@/services/supabase/productGroups";
import styles from "./ProductGroupsEditDrawer.module.scss";

interface ProductGroupsEditDrawerProps {
    open: boolean;
    onClose: () => void;
    productId: string;
    tenantId: string;
    onSuccess: () => void;
}

export function ProductGroupsEditDrawer({
    open,
    onClose,
    productId,
    tenantId,
    onSuccess
}: ProductGroupsEditDrawerProps) {
    const { showToast } = useToast();
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();

    const [allGroups, setAllGroups] = useState<ProductGroup[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [initialGroupIds, setInitialGroupIds] = useState<string[]>([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
    const [search, setSearch] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const loadData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [groups, assignments] = await Promise.all([
                getProductGroups(tenantId),
                getProductGroupAssignments(productId)
            ]);
            setAllGroups(groups);
            const ids = assignments.map(a => a.group_id);
            setInitialGroupIds(ids);
            setSelectedGroupIds([...ids]);
        } catch {
            showToast({ message: "Errore nel caricamento dei gruppi", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [productId, tenantId, showToast]);

    useEffect(() => {
        if (open) {
            setSearch("");
            loadData();
        }
    }, [open, loadData]);

    const isDirty = () => {
        if (selectedGroupIds.length !== initialGroupIds.length) return true;
        const initialSet = new Set(initialGroupIds);
        return selectedGroupIds.some(id => !initialSet.has(id));
    };

    const handleSave = async () => {
        try {
            setIsSaving(true);
            const initialSet = new Set(initialGroupIds);
            const selectedSet = new Set(selectedGroupIds);
            const toAdd = selectedGroupIds.filter(id => !initialSet.has(id));
            const toRemove = initialGroupIds.filter(id => !selectedSet.has(id));
            await Promise.all([
                ...toAdd.map(groupId =>
                    assignProductToGroup({ tenantId, productId, groupId })
                ),
                ...toRemove.map(groupId =>
                    removeProductFromGroup({ productId, groupId })
                )
            ]);
            onSuccess();
            onClose();
            showToast({ message: "Gruppi aggiornati", type: "success" });
        } catch {
            showToast({ message: "Errore nel salvataggio dei gruppi", type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    const filteredGroups = useMemo(() => {
        if (!search) return allGroups;
        const lower = search.toLowerCase();
        return allGroups.filter(g => g.name.toLowerCase().includes(lower));
    }, [allGroups, search]);

    const parentMap = useMemo(() => {
        const map = new Map<string | null, ProductGroup[]>();
        for (const g of allGroups) {
            const key = g.parent_group_id;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(g);
        }
        return map;
    }, [allGroups]);

    const depthMap = useMemo(() => {
        const map = new Map<string, number>();
        const walk = (parentId: string | null, depth: number) => {
            const children = parentMap.get(parentId) ?? [];
            for (const child of children) {
                map.set(child.id, depth);
                walk(child.id, depth + 1);
            }
        };
        walk(null, 0);
        return map;
    }, [parentMap]);

    const columns: ColumnDefinition<ProductGroup>[] = useMemo(() => [
        {
            id: "name",
            header: "Nome",
            width: "1fr",
            accessor: (row: ProductGroup) => row.name,
            cell: (value: string, row: ProductGroup) => {
                const depth = depthMap.get(row.id) ?? 0;
                return (
                    <Text
                        variant="body-sm"
                        weight={depth === 0 ? 600 : 400}
                        className={depth > 0 ? styles.indented : undefined}
                        style={depth > 0 ? { paddingLeft: depth * 20 } : undefined}
                    >
                        {value}
                    </Text>
                );
            }
        }
    ], [depthMap]);

    return (
        <SystemDrawer open={open} onClose={onClose} width={480}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Modifica gruppi prodotto
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSave}
                            loading={isSaving}
                            disabled={isSaving || !isDirty()}
                        >
                            Salva
                        </Button>
                    </>
                }
            >
                {isLoading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento gruppi...
                    </Text>
                ) : allGroups.length === 0 ? (
                    <div className={styles.emptyGroups}>
                        <Text variant="body-sm" colorVariant="muted">
                            Nessun gruppo disponibile.
                        </Text>
                        <button
                            className={styles.emptyLink}
                            onClick={() => {
                                onClose();
                                navigate(`/business/${businessId}/products?tab=groups`);
                            }}
                        >
                            Crea un gruppo →
                        </button>
                    </div>
                ) : (
                    <div className={styles.content}>
                        {allGroups.length > 5 && (
                            <div className={styles.searchWrapper}>
                                <SearchInput
                                    placeholder="Cerca gruppo..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    onClear={() => setSearch("")}
                                    allowClear
                                />
                            </div>
                        )}

                        <DataTable<ProductGroup>
                            data={filteredGroups}
                            columns={columns}
                            selectable
                            showSelectionBar={false}
                            selectedRowIds={selectedGroupIds}
                            onSelectedRowsChange={setSelectedGroupIds}
                            density="compact"
                            emptyState={
                                <Text variant="body-sm" colorVariant="muted">
                                    Nessun gruppo trovato
                                </Text>
                            }
                            rowsPerPage={100}
                        />
                    </div>
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}
