import React, { useEffect, useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { Card } from "@/components/ui/Card/Card";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconFolder, IconDotsVertical } from "@tabler/icons-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import styles from "./ProductGroupsTab.module.scss";

import { getProductGroups, ProductGroup } from "@/services/supabase/v2/productGroups";
import { ProductGroupCreateEditDrawer, GroupFormMode } from "./ProductGroupCreateEditDrawer";
import { ProductGroupDeleteDrawer } from "./ProductGroupDeleteDrawer";

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

    // Filter State
    const [searchQuery, setSearchQuery] = useState("");

    // Drawer States
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

    const filteredGroups = useMemo(() => {
        if (!searchQuery) return allGroups;
        return allGroups.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [allGroups, searchQuery]);

    // Handlers
    useEffect(() => {
        if (isCreateOpen) {
            setCreateEditMode("create");
            setGroupToEdit(null);
        }
    }, [isCreateOpen]);

    const handleEdit = (group: ProductGroup) => {
        setCreateEditMode("edit");
        setGroupToEdit(group);
        setIsCreateEditOpen(true);
    };

    const handleDelete = (group: ProductGroup) => {
        setGroupToDelete(group);
        setIsDeleteOpen(true);
    };

    return (
        <div className={styles.tabContent}>
            <div style={{ display: "flex", gap: "16px", marginBottom: "8px" }}>
                <FilterBar
                    search={{
                        value: searchQuery,
                        onChange: setSearchQuery,
                        placeholder: "Cerca gruppo..."
                    }}
                    className={styles.filterBar}
                />
            </div>

            <Card className={styles.tableCard}>
                {isLoading ? (
                    <div className={styles.loadingState}>
                        <Text variant="body-sm" colorVariant="muted">
                            Caricamento gruppi in corso...
                        </Text>
                    </div>
                ) : filteredGroups.length === 0 ? (
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
                ) : (
                    <div className={styles.listContainer}>
                        <div className={styles.listHeader}>
                            <div className={styles.colName}>Nome</div>
                            <div className={styles.colParent}>Gerarchia</div>
                            <div className={styles.colDate}>Creato il</div>
                            <div className={styles.colActions}></div>
                        </div>
                        <div className={styles.listBody}>
                            {filteredGroups.map(group => {
                                const isSubgroup = group.parent_group_id !== null;
                                let parentName = "";
                                if (isSubgroup) {
                                    const parent = allGroups.find(
                                        g => g.id === group.parent_group_id
                                    );
                                    parentName = parent ? parent.name : "Gruppo sconosciuto";
                                }

                                return (
                                    <div key={group.id} className={styles.listRow}>
                                        <div className={styles.colName}>
                                            <div className={styles.groupNameRow}>
                                                <Text variant="body-sm" weight={600}>
                                                    {group.name}
                                                </Text>
                                            </div>
                                        </div>

                                        <div className={styles.colParent}>
                                            {isSubgroup ? (
                                                <Badge variant="secondary">
                                                    Sottogruppo di {parentName}
                                                </Badge>
                                            ) : (
                                                <Text variant="body-sm" colorVariant="muted">
                                                    Principale
                                                </Text>
                                            )}
                                        </div>

                                        <div className={styles.colDate}>
                                            <Text variant="body-sm" colorVariant="muted">
                                                {new Date(group.created_at).toLocaleDateString(
                                                    "it-IT",
                                                    {
                                                        day: "2-digit",
                                                        month: "short",
                                                        year: "numeric"
                                                    }
                                                )}
                                            </Text>
                                        </div>

                                        <div
                                            className={styles.colActions}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <DropdownMenu.Root>
                                                <DropdownMenu.Trigger asChild>
                                                    <button
                                                        className={styles.actionButton}
                                                        aria-label="Azioni"
                                                    >
                                                        <IconDotsVertical size={16} />
                                                    </button>
                                                </DropdownMenu.Trigger>
                                                <DropdownMenu.Portal>
                                                    <DropdownMenu.Content
                                                        className={styles.dropdownContent}
                                                        align="end"
                                                        sideOffset={4}
                                                    >
                                                        <DropdownMenu.Item
                                                            className={styles.dropdownItem}
                                                            onClick={() => handleEdit(group)}
                                                        >
                                                            Modifica
                                                        </DropdownMenu.Item>
                                                        <DropdownMenu.Separator
                                                            className={styles.dropdownSeparator}
                                                        />
                                                        <DropdownMenu.Item
                                                            className={`${styles.dropdownItem} ${styles.danger}`}
                                                            onClick={() => handleDelete(group)}
                                                        >
                                                            Elimina
                                                        </DropdownMenu.Item>
                                                    </DropdownMenu.Content>
                                                </DropdownMenu.Portal>
                                            </DropdownMenu.Root>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </Card>

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
