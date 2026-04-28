import React, { useState, useEffect, useCallback } from "react";
import { IconPhoto, IconPlus, IconPencil, IconTrash, IconStar, IconGripVertical } from "@tabler/icons-react";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from "@dnd-kit/core";
import {
    SortableContext,
    rectSortingStrategy,
    sortableKeyboardCoordinates,
    useSortable,
    arrayMove
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Card } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { V2Activity } from "@/types/activity";
import { ActivityMedia } from "@/types/activity-media";
import {
    getActivityMedia,
    deleteActivityMedia,
    setMediaAsCover,
    updateMediaSortOrder
} from "@/services/supabase/activity-media";
import { useToast } from "@/context/Toast/ToastContext";
import { ActivityCoverDrawer } from "./ActivityCoverDrawer";
import { ActivityGalleryUploadDrawer } from "./ActivityGalleryUploadDrawer";
import styles from "../ActivityDetailPage.module.scss";
import tabStyles from "./ActivityMediaTab.module.scss";

// ── Sortable tile ────────────────────────────────────────────────────────────

interface SortableMediaTileProps {
    item: ActivityMedia;
    deletingId: string | null;
    settingCoverId: string | null;
    onSetAsCover: (item: ActivityMedia) => void;
    onDelete: (item: ActivityMedia) => void;
}

const SortableMediaTile: React.FC<SortableMediaTileProps> = ({
    item,
    deletingId,
    settingCoverId,
    onSetAsCover,
    onDelete
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: item.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined
    };

    return (
        <div ref={setNodeRef} style={style} className={tabStyles.mediaTile}>
            <img src={item.url} alt="Galleria" className={tabStyles.mediaTileImg} />

            {item.is_cover && (
                <div className={tabStyles.coverBadge}>Copertina</div>
            )}

            <button
                className={tabStyles.dragHandle}
                {...attributes}
                {...listeners}
                type="button"
                aria-label="Trascina per riordinare"
            >
                <IconGripVertical size={16} />
            </button>

            <div className={tabStyles.mediaTileOverlay}>
                {!item.is_cover && (
                    <button
                        className={tabStyles.overlayAction}
                        onClick={() => onSetAsCover(item)}
                        disabled={settingCoverId === item.id || deletingId === item.id}
                        type="button"
                        title="Imposta come copertina"
                    >
                        <IconStar size={15} />
                        <Text as="span" variant="caption">Copertina</Text>
                    </button>
                )}
                <button
                    className={`${tabStyles.overlayAction} ${tabStyles.overlayActionDanger}`}
                    onClick={() => onDelete(item)}
                    disabled={deletingId === item.id || settingCoverId === item.id}
                    type="button"
                    title="Elimina"
                >
                    <IconTrash size={15} />
                    <Text as="span" variant="caption">Elimina</Text>
                </button>
            </div>
        </div>
    );
};

// ── Main tab ─────────────────────────────────────────────────────────────────

interface ActivityMediaTabProps {
    activity: V2Activity;
    onCoverUpdate: (url: string | null) => void;
}

export const ActivityMediaTab: React.FC<ActivityMediaTabProps> = ({ activity, onCoverUpdate }) => {
    const { showToast } = useToast();

    const [isCoverDrawerOpen, setIsCoverDrawerOpen] = useState(false);
    const [isUploadDrawerOpen, setIsUploadDrawerOpen] = useState(false);

    const [media, setMedia] = useState<ActivityMedia[]>([]);
    const [mediaLoading, setMediaLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [settingCoverId, setSettingCoverId] = useState<string | null>(null);

    const loadMedia = useCallback(async () => {
        try {
            setMediaLoading(true);
            const data = await getActivityMedia(activity.id);
            setMedia(data);
        } catch {
            showToast({ message: "Errore nel caricamento della galleria.", type: "error" });
        } finally {
            setMediaLoading(false);
        }
    }, [activity.id, showToast]);

    useEffect(() => {
        loadMedia();
    }, [loadMedia]);

    const handleGalleryUploaded = (inserted: ActivityMedia[]) => {
        setMedia(prev => [...inserted, ...prev]);
    };

    const handleDelete = async (item: ActivityMedia) => {
        setDeletingId(item.id);
        try {
            await deleteActivityMedia(item.id, item.url);
            setMedia(prev => prev.filter(m => m.id !== item.id));
            showToast({ message: "Immagine eliminata.", type: "success" });
        } catch {
            showToast({ message: "Errore durante l'eliminazione.", type: "error" });
        } finally {
            setDeletingId(null);
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = media.findIndex(m => m.id === active.id);
        const newIndex = media.findIndex(m => m.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(media, oldIndex, newIndex);
        setMedia(reordered);

        const updates = reordered.map((m, i) => ({ id: m.id, sort_order: i }));
        try {
            await updateMediaSortOrder(updates);
        } catch {
            showToast({ message: "Errore nel salvataggio dell'ordine.", type: "error" });
            await loadMedia();
        }
    };

    const handleSetAsCover = async (item: ActivityMedia) => {
        if (item.is_cover) return;
        setSettingCoverId(item.id);
        try {
            await setMediaAsCover(item.id, item.url, activity);
            setMedia(prev =>
                prev.map(m => ({ ...m, is_cover: m.id === item.id }))
            );
            onCoverUpdate(item.url);
            showToast({ message: "Immagine di copertina aggiornata.", type: "success" });
        } catch {
            showToast({ message: "Errore nell'impostazione della copertina.", type: "error" });
        } finally {
            setSettingCoverId(null);
        }
    };

    return (
        <div className={styles.grid12}>
            {/* ── Cover section ─────────────────────────────────────── */}
            <Card className={`${styles.card} ${styles.colSpan12}`}>
                <div className={styles.cardHeader}>
                    <Text as="h3" variant="title-sm">Immagine di copertina</Text>
                    <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<IconPencil size={15} />}
                        onClick={() => setIsCoverDrawerOpen(true)}
                    >
                        Modifica copertina
                    </Button>
                </div>
                <div className={styles.cardContent}>
                    {activity.cover_image ? (
                        <div
                            className={tabStyles.coverPreview}
                            onClick={() => setIsCoverDrawerOpen(true)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => e.key === "Enter" && setIsCoverDrawerOpen(true)}
                            aria-label="Modifica immagine di copertina"
                        >
                            <img
                                src={activity.cover_image}
                                alt="Copertina"
                                className={tabStyles.coverImage}
                            />
                            <div className={tabStyles.coverOverlay}>
                                <IconPencil size={20} />
                                <Text as="span" variant="body-sm" weight={500}>Modifica</Text>
                            </div>
                        </div>
                    ) : (
                        <button
                            className={tabStyles.coverEmpty}
                            onClick={() => setIsCoverDrawerOpen(true)}
                            type="button"
                        >
                            <IconPhoto size={40} stroke={1.5} />
                            <Text as="span" variant="body" weight={600} colorVariant="primary" className={tabStyles.coverEmptyLabel}>+ Aggiungi immagine</Text>
                            <Text as="span" variant="caption" colorVariant="muted" className={tabStyles.coverEmptyHint}>Formato consigliato: 16:9</Text>
                        </button>
                    )}
                </div>
            </Card>

            {/* ── Gallery section ───────────────────────────────────── */}
            <Card className={`${styles.card} ${styles.colSpan12}`}>
                <div className={styles.cardHeader}>
                    <Text as="h3" variant="title-sm">Galleria immagini</Text>
                    <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<IconPlus size={16} />}
                        onClick={() => setIsUploadDrawerOpen(true)}
                    >
                        Aggiungi immagini
                    </Button>
                </div>
                <div className={styles.cardContent}>
                    {mediaLoading ? (
                        <div className={tabStyles.galleryLoading}>
                            <div className={tabStyles.gallerySkeletonGrid}>
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className={tabStyles.skeletonItem} />
                                ))}
                            </div>
                        </div>
                    ) : media.length === 0 ? (
                        <div className={tabStyles.galleryEmpty}>
                            <IconPhoto size={48} stroke={1} />
                            <Text variant="body" weight={600} className={tabStyles.galleryEmptyTitle}>Nessuna immagine nella galleria</Text>
                            <Text variant="body-sm" colorVariant="muted" className={tabStyles.galleryEmptyHint}>
                                Aggiungi immagini che verranno mostrate nella pagina pubblica.
                            </Text>
                            <Button
                                variant="primary"
                                size="sm"
                                leftIcon={<IconPlus size={16} />}
                                onClick={() => setIsUploadDrawerOpen(true)}
                            >
                                Aggiungi immagini
                            </Button>
                        </div>
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={media.map(m => m.id)}
                                strategy={rectSortingStrategy}
                            >
                                <div className={tabStyles.galleryGrid}>
                                    {/* Add tile — always first, not sortable */}
                                    <button
                                        className={tabStyles.addTile}
                                        onClick={() => setIsUploadDrawerOpen(true)}
                                        type="button"
                                    >
                                        <IconPlus size={28} stroke={1.5} />
                                        <Text as="span" variant="caption">Aggiungi</Text>
                                    </button>

                                    {media.map(item => (
                                        <SortableMediaTile
                                            key={item.id}
                                            item={item}
                                            deletingId={deletingId}
                                            settingCoverId={settingCoverId}
                                            onSetAsCover={handleSetAsCover}
                                            onDelete={handleDelete}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    )}
                </div>
            </Card>

            {/* ── Drawers ──────────────────────────────────────────── */}
            <ActivityCoverDrawer
                open={isCoverDrawerOpen}
                onClose={() => setIsCoverDrawerOpen(false)}
                activity={activity}
                onSuccess={onCoverUpdate}
            />

            <ActivityGalleryUploadDrawer
                open={isUploadDrawerOpen}
                onClose={() => setIsUploadDrawerOpen(false)}
                activity={activity}
                onSuccess={handleGalleryUploaded}
            />
        </div>
    );
};
