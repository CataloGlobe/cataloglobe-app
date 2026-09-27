import { useCallback, useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { DataTableDragHandle, SortableDataTableRow } from "@/components/ui/DataTable/SortableDataTableRow";
import { Pencil, Trash2, BookOpenText } from "lucide-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { useToast } from "@/context/Toast/ToastContext";
import { listStories, reorderStories, type StoryWithProduct } from "@/services/supabase/stories";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import StoryCreateDrawer from "./StoryCreateDrawer";
import StoryDeleteDialog from "./StoryDeleteDialog";
import { StoryBrandCard } from "./components/StoryBrandCard";
import { StoryBrandDrawer } from "./components/StoryBrandDrawer";
import { useBrandStoryDraft } from "./hooks/useBrandStoryDraft";
import styles from "./Stories.module.scss";

import { useTenantId } from "@/context/useTenantId";
import { useEnsureActive } from "@/hooks/useEnsureActive";
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
    const navigate = useNavigate();
    const tenantId = useTenantId();
    const { canEdit, ensureActive } = useEnsureActive();
    const { permissions } = usePermissions();
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "stories.write") : false;
    // Gate di lettura prima della fetch: senza `stories.read` nessuna richiesta.
    const canRead = permissions != null && canDoOnAnyActivity(permissions, "stories.read");

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [stories, setStories] = useState<StoryWithProduct[]>([]);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isBrandOpen, setIsBrandOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<StoryWithProduct | null>(null);

    // Il cappello (§50.11/4): la card in cima all'elenco lo mostra com'è, il
    // drawer lo modifica e salva subito.
    const brand = useBrandStoryDraft(tenantId ?? null, canRead);

    const loadData = useCallback(async () => {
        if (!tenantId || !canRead) return;
        try {
            setLoading(true);
            setLoadError(false);
            const data = await listStories(tenantId);
            setStories(data);
        } catch (error) {
            // Un errore non è un elenco vuoto: la pagina lo dice, con «Riprova».
            console.error("Caricamento storie:", error);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [tenantId, canRead]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleCreate = useCallback(() => {
        if (!ensureActive()) return;
        setIsCreateOpen(true);
    }, [ensureActive]);

    const handleEditBrand = useCallback(() => {
        if (!ensureActive()) return;
        setIsBrandOpen(true);
    }, [ensureActive]);

    const actions = useMemo(
        () =>
            canWrite ? (
                <Button variant="primary" onClick={handleCreate} disabled={!canEdit}>
                    Crea storia
                </Button>
            ) : undefined,
        [handleCreate, canEdit, canWrite]
    );

    const headerCompact = useMemo<PageHeaderCompactConfig>(
        () => ({
            primaryAction: canWrite ? { label: "Crea storia", onClick: handleCreate, disabled: !canEdit } : undefined
        }),
        [canWrite, canEdit, handleCreate]
    );

    usePageHeader({
        title: "Storie",
        subtitle: "I racconti che i clienti trovano nella pagina pubblica delle sedi.",
        actions,
        compact: headerCompact
    });

    // L'ordine è quello in cui i clienti trovano le storie: si salva subito
    // (§27.2, spostare una riga è struttura).
    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        if (!ensureActive()) return;

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

    const storyUrl = (item: StoryWithProduct) => `/business/${tenantId}/stories/${item.id}`;

    const columns: ColumnDefinition<StoryWithProduct>[] = [
        ...(canWrite
            ? [
                  {
                      id: "drag",
                      header: "",
                      width: "40px",
                      align: "center" as const,
                      cell: (_value: unknown, row: StoryWithProduct, _rowIndex: number, dragHandleProps?: unknown) => (
                          <DataTableDragHandle
                              aria-label={`Riordina ${row.title}`}
                              {...(dragHandleProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
                          />
                      )
                  }
              ]
            : []),
        {
            id: "title",
            header: "Storia",
            width: "1fr",
            cell: (_value, item) => (
                <div className={styles.titleCell}>
                    {item.eyebrow && (
                        <Text variant="caption" colorVariant="muted" className={styles.subtitle}>
                            {item.eyebrow}
                        </Text>
                    )}
                    <Text variant="body-sm" weight={600}>
                        {item.title}
                    </Text>
                </div>
            )
        },
        {
            id: "product",
            header: "Prodotto collegato",
            width: "0.6fr",
            hideOnPhone: true,
            cell: (_value, item) => (
                <Text variant="body-sm" colorVariant={item.product ? undefined : "muted"}>
                    {item.product?.name ?? "—"}
                </Text>
            )
        },
        {
            id: "status",
            header: "Stato",
            width: "120px",
            cell: (_value, item) => (
                <StatusBadge
                    variant={item.status === "published" ? "success" : "neutral"}
                    label={item.status === "published" ? "Pubblicata" : "Bozza"}
                />
            )
        },
        {
            id: "actions",
            header: "",
            width: "56px",
            align: "right",
            cell: (_value, item) => (
                <TableRowActions
                    ariaLabel={`Azioni storia ${item.title}`}
                    actions={[
                        { label: canWrite ? "Modifica" : "Apri", icon: Pencil, onClick: () => navigate(storyUrl(item)) },
                        ...(canWrite
                            ? [
                                  {
                                      label: "Elimina",
                                      icon: Trash2,
                                      onClick: () => {
                                          if (ensureActive()) setDeleteTarget(item);
                                      },
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

    const renderList = () => {
        if (loadError) {
            return (
                <EmptyState
                    icon={<BookOpenText />}
                    title="Non è stato possibile caricare le storie"
                    description="Controlla la connessione e riprova."
                    action={
                        <Button variant="secondary" onClick={() => loadData()}>
                            Riprova
                        </Button>
                    }
                />
            );
        }
        if (!loading && stories.length === 0) {
            return (
                <EmptyState
                    icon={<BookOpenText />}
                    title="Non hai ancora creato storie"
                    description="Le storie compaiono nella sezione approfondimenti del tuo catalogo pubblico."
                    action={
                        canWrite ? (
                            <Button variant="primary" onClick={handleCreate} disabled={!canEdit}>
                                Crea la prima storia
                            </Button>
                        ) : undefined
                    }
                />
            );
        }
        return (
            <>
                {canWrite && stories.length > 1 && (
                    <Text variant="caption" colorVariant="muted">
                        Trascina per cambiare l'ordine: è quello in cui i clienti le trovano.
                    </Text>
                )}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={stories.map(story => story.id)} strategy={verticalListSortingStrategy}>
                        <DataTable<StoryWithProduct>
                            data={stories}
                            columns={columns}
                            isLoading={loading}
                            ariaLabel="Storie"
                            onRowClick={item => navigate(storyUrl(item))}
                            rowWrapper={(row, rowData) => (
                                <SortableDataTableRow key={rowData.id} id={rowData.id} draggingOpacity={0.55}>
                                    {row}
                                </SortableDataTableRow>
                            )}
                        />
                    </SortableContext>
                </DndContext>
            </>
        );
    };

    if (permissions != null && !canRead) {
        return <PageGate readPermission="stories.read">{() => null}</PageGate>;
    }

    return (
        <PageGate readPermission="stories.read">
            {() => (
                <>
                    <div className={styles.wrapper}>
                        <StoryBrandCard
                            saved={brand.saved}
                            loadError={brand.loadError}
                            onRetry={brand.reload}
                            onEdit={canWrite ? handleEditBrand : undefined}
                        />
                        {renderList()}
                    </div>

                    <StoryBrandDrawer open={isBrandOpen} onClose={() => setIsBrandOpen(false)} brand={brand} />

                    <StoryCreateDrawer
                        open={isCreateOpen}
                        onClose={() => setIsCreateOpen(false)}
                        tenantId={tenantId ?? undefined}
                    />

                    <StoryDeleteDialog
                        open={Boolean(deleteTarget) && Boolean(tenantId)}
                        onClose={() => setDeleteTarget(null)}
                        storyData={deleteTarget}
                        onSuccess={() => {
                            setDeleteTarget(null);
                            loadData();
                        }}
                    />
                </>
            )}
        </PageGate>
    );
}
