import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import { Card } from "@/components/ui/Card/Card";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { IconButton } from "@/components/ui/Button/IconButton";
import { IconFolder, IconDotsVertical, IconFolderPlus } from "@tabler/icons-react";
import { DropdownMenu } from "@/components/ui/DropdownMenu/DropdownMenu";
import { DropdownItem } from "@/components/ui/DropdownMenu/DropdownItem";
import { DropdownSeparator } from "@/components/ui/DropdownMenu/DropdownSeparator";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import styles from "./ActivityGroupsSection.module.scss";

import { getActivityGroups, deleteActivityGroup } from "@/services/supabase/v2/activity-groups";
import { V2ActivityGroupWithCounts } from "@/types/v2/activity-group";
import { useDrawer } from "@/context/Drawer/useDrawer";
import { ActivityGroupDrawer } from "../ActivityGroupDrawer";
import { useSearchParams } from "react-router-dom";

interface ActivityGroupsSectionProps {
    searchQuery?: string;
}

export const ActivityGroupsSection: React.FC<ActivityGroupsSectionProps> = ({
    searchQuery: externalSearchQuery = ""
}) => {
    const { user } = useAuth();
    const tenantId = user?.id;
    const { showToast } = useToast();
    const { openDrawer, closeDrawer } = useDrawer();

    const [isLoading, setIsLoading] = useState(true);
    const [groups, setGroups] = useState<V2ActivityGroupWithCounts[]>([]);
    const [searchParams] = useSearchParams();
    const highlightActivityId = searchParams.get("highlight");
    const [highlightedGroupIds, setHighlightedGroupIds] = useState<string[]>([]);

    const loadGroups = async () => {
        if (!tenantId) return;
        try {
            setIsLoading(true);
            const data = await getActivityGroups(tenantId);
            setGroups(data);

            if (highlightActivityId) {
                const activityGroups = await import("@/services/supabase/v2/activity-groups").then(
                    m => m.getGroupsForActivity(highlightActivityId)
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

    const handleDelete = async (groupId: string) => {
        if (!window.confirm("Sei sicuro di voler eliminare questo gruppo?")) return;

        try {
            await deleteActivityGroup(groupId);
            showToast({
                message: "Gruppo eliminato con successo.",
                type: "success"
            });
            loadGroups();
        } catch (error) {
            console.error("Errore eliminazione gruppo:", error);
            showToast({
                message: "Errore durante l'eliminazione del gruppo.",
                type: "error"
            });
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
                width: "64px",
                align: "right",
                cell: (_, group) => (
                    <div onClick={e => e.stopPropagation()}>
                        <DropdownMenu
                            placement="bottom-end"
                            trigger={
                                <IconButton
                                    icon={<IconDotsVertical size={18} />}
                                    variant="ghost"
                                    aria-label="Azioni"
                                />
                            }
                        >
                            <DropdownItem onClick={() => handleEdit(group)}>Modifica</DropdownItem>
                            {!group.is_system && (
                                <>
                                    <DropdownSeparator />
                                    <DropdownItem danger onClick={() => handleDelete(group.id)}>
                                        Elimina
                                    </DropdownItem>
                                </>
                            )}
                        </DropdownMenu>
                    </div>
                )
            }
        ],
        [highlightedGroupIds]
    );

    useEffect(() => {
        const handleOpenDrawer = () => handleCreate();
        window.addEventListener("open-group-drawer", handleOpenDrawer);
        return () => window.removeEventListener("open-group-drawer", handleOpenDrawer);
    }, [tenantId]);

    return (
        <div className={styles.container}>
            <Card className={styles.tableCard}>
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
                                <button
                                    type="button"
                                    className={styles.createCta}
                                    onClick={handleCreate}
                                >
                                    Crea il tuo primo gruppo
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <DataTable
                        data={filteredGroups}
                        columns={columns}
                        rowClassName={group =>
                            highlightedGroupIds.includes(group.id) ? styles.highlighted : undefined
                        }
                    />
                )}
            </Card>
        </div>
    );
};
