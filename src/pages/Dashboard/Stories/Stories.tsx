import { useCallback, useMemo, useState, useEffect } from "react";
import { usePageHeader } from "@/context/usePageHeader";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { SortableDataTableRow } from "@/components/ui/DataTable/SortableDataTableRow";
import { Pencil, Trash2, BookOpenText, GripVertical } from "lucide-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { Badge } from "@/components/ui/Badge/Badge";
import { useToast } from "@/context/Toast/ToastContext";
import { listStories, reorderStories, type StoryWithProduct } from "@/services/supabase/stories";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import StoryCreateEditDrawer from "./StoryCreateEditDrawer";
import StoryDeleteDrawer from "./StoryDeleteDrawer";
import { StoryBrandPanel } from "./components/StoryBrandPanel";
import styles from "./Stories.module.scss";

import { useTenantId } from "@/context/useTenantId";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnAnyActivity } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";

import {
    DndContext,
    closestCenter,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";

function reindexRows(rows: StoryWithProduct[]): StoryWithProduct[] {
    return rows.map((row, index) => ({ ...row, sort_order: index + 1 }));
}

export default function Stories() {
    const { showToast } = useToast();
    const tenantId = useTenantId();
    const { canEdit } = useSubscriptionGuard();
    const { permissions } = usePermissions();
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "stories.write") : false;

    const [loading, setLoading] = useState(true);
    const [stories, setStories] = useState<StoryWithProduct[]>([]);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<StoryWithProduct | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<StoryWithProduct | null>(null);

    const loadData = useCallback(async () => {
        if (!tenantId) return;
        try {
            setLoading(true);
            const data = await listStories(tenantId);
            setStories(data);
        } catch (error) {
            console.error(error);
            showToast({ type: "error", message: "Errore durante il caricamento delle storie." });
        } finally {
            setLoading(false);
        }
    }, [tenantId, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleCreate = useCallback(() => {
        if (!canEdit) {
            showToast({
                message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.",
                type: "error"
            });
            return;
        }
        setIsCreateOpen(true);
    }, [canEdit, showToast]);

    const headerActions = useMemo(
        () =>
            canWrite ? (
                <Button variant="primary" onClick={handleCreate} disabled={!canEdit}>
                    Crea storia
                </Button>
            ) : undefined,
        [handleCreate, canEdit, canWrite]
    );

    usePageHeader({
        title: "Storie",
        subtitle: "Racconta il tuo brand con contenuti editoriali di approfondimento.",
        actions: headerActions,
        sticky: true
    });

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = stories.findIndex(row => row.id === active.id);
        const newIndex = stories.findIndex(row => row.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;

        const reindexed = reindexRows(arrayMove(stories, oldIndex, newIndex));
        setStories(reindexed);

        if (!tenantId) return;
        try {
            await reorderStories(
                tenantId,
                reindexed.map(row => ({ id: row.id, sort_order: row.sort_order }))
            );
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nel salvataggio dell'ordine." });
            await loadData();
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const columns: ColumnDefinition<StoryWithProduct>[] = [
        ...(canWrite
            ? [
                  {
                      id: "drag",
                      header: "",
                      width: "40px",
                      align: "center" as const,
                      cell: (_value: unknown, _row: StoryWithProduct, _rowIndex: number, dragHandleProps?: unknown) => (
                          <button
                              type="button"
                              aria-label="Trascina per riordinare"
                              className={styles.dragHandle}
                              {...(dragHandleProps as React.HTMLAttributes<HTMLButtonElement>)}
                          >
                              <GripVertical size={16} />
                          </button>
                      )
                  }
              ]
            : []),
        {
            id: "title",
            header: "Titolo",
            width: "2fr",
            cell: (_value, item) => (
                <div className={styles.titleCell}>
                    <Text variant="body-sm" weight={600}>
                        {item.title}
                    </Text>
                    {item.eyebrow && (
                        <Text variant="caption" colorVariant="muted" className={styles.subtitle}>
                            {item.eyebrow}
                        </Text>
                    )}
                </div>
            )
        },
        {
            id: "product",
            header: "Prodotto collegato",
            width: "1fr",
            cell: (_value, item) => (
                <Text variant="body-sm" colorVariant={item.product ? undefined : "muted"}>
                    {item.product?.name ?? "-"}
                </Text>
            )
        },
        {
            id: "status",
            header: "Stato",
            width: "0.8fr",
            cell: (_value, item) => (
                <Badge variant={item.status === "published" ? "success" : "secondary"}>
                    {item.status === "published" ? "Pubblicata" : "Bozza"}
                </Badge>
            )
        },
        {
            id: "actions",
            header: "",
            width: "56px",
            align: "right",
            cell: (_value, item) => (
                <TableRowActions
                    actions={[
                        { label: "Modifica", icon: Pencil, onClick: () => setEditTarget(item) },
                        ...(canWrite
                            ? [
                                  {
                                      label: "Elimina",
                                      icon: Trash2,
                                      onClick: () => setDeleteTarget(item),
                                      variant: "destructive" as const,
                                      separator: true
                                  }
                              ]
                            : [])
                    ]}
                />
            )
        }
    ];

    return (
        <PageGate readPermission="stories.read">
            {() => (
                <>
                    <div className={styles.wrapper}>
                        {tenantId && <StoryBrandPanel tenantId={tenantId} canWrite={canWrite} />}

                        {loading ? (
                            <div className={styles.loadingState}>
                                <Text colorVariant="muted">Caricamento in corso...</Text>
                            </div>
                        ) : stories.length === 0 ? (
                            <EmptyState
                                icon={<BookOpenText size={40} strokeWidth={1.5} />}
                                title="Non hai ancora creato storie"
                                description="Le storie compaiono nella sezione approfondimenti del tuo catalogo pubblico."
                                action={
                                    canWrite ? (
                                        <Button variant="primary" onClick={handleCreate} disabled={!canEdit}>
                                            + Crea la prima storia
                                        </Button>
                                    ) : undefined
                                }
                            />
                        ) : (
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext
                                    items={stories.map(story => story.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <DataTable<StoryWithProduct>
                                        data={stories}
                                        columns={columns}
                                        onRowClick={item => setEditTarget(item)}
                                        rowWrapper={(row, rowData) => (
                                            <SortableDataTableRow key={rowData.id} id={rowData.id} draggingOpacity={0.55}>
                                                {row}
                                            </SortableDataTableRow>
                                        )}
                                    />
                                </SortableContext>
                            </DndContext>
                        )}
                    </div>

                    <StoryCreateEditDrawer
                        open={isCreateOpen}
                        onClose={() => setIsCreateOpen(false)}
                        mode="create"
                        storyData={null}
                        tenantId={tenantId ?? undefined}
                        onSuccess={() => {
                            setIsCreateOpen(false);
                            loadData();
                        }}
                    />

                    <StoryCreateEditDrawer
                        open={Boolean(editTarget)}
                        onClose={() => setEditTarget(null)}
                        mode="edit"
                        storyData={editTarget}
                        tenantId={tenantId ?? undefined}
                        onSuccess={() => {
                            setEditTarget(null);
                            loadData();
                        }}
                    />

                    <StoryDeleteDrawer
                        open={Boolean(deleteTarget) && Boolean(tenantId)}
                        onClose={() => setDeleteTarget(null)}
                        storyData={deleteTarget}
                        onSuccess={loadData}
                    />
                </>
            )}
        </PageGate>
    );
}
