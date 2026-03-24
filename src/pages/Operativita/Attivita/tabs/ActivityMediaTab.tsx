import React, { useState, useEffect, useCallback } from "react";
import { IconPhoto, IconPlus, IconPencil, IconTrash, IconStar } from "@tabler/icons-react";
import { Button, Card } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { V2Activity } from "@/types/activity";
import { ActivityMedia } from "@/types/activity-media";
import {
    getActivityMedia,
    deleteActivityMedia,
    setMediaAsCover
} from "@/services/supabase/activity-media";
import { useToast } from "@/context/Toast/ToastContext";
import { ActivityCoverDrawer } from "./ActivityCoverDrawer";
import { ActivityGalleryUploadDrawer } from "./ActivityGalleryUploadDrawer";
import styles from "../ActivityDetailPage.module.scss";
import tabStyles from "./ActivityMediaTab.module.scss";

interface ActivityMediaTabProps {
    activity: V2Activity;
    onCoverUpdate: (url: string) => void;
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
            await deleteActivityMedia(item.id);
            setMedia(prev => prev.filter(m => m.id !== item.id));
            showToast({ message: "Immagine eliminata.", type: "success" });
        } catch {
            showToast({ message: "Errore durante l'eliminazione.", type: "error" });
        } finally {
            setDeletingId(null);
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
                        <div className={tabStyles.galleryGrid}>
                            {/* Add tile — always first */}
                            <button
                                className={tabStyles.addTile}
                                onClick={() => setIsUploadDrawerOpen(true)}
                                type="button"
                            >
                                <IconPlus size={28} stroke={1.5} />
                                <Text as="span" variant="caption">Aggiungi</Text>
                            </button>

                            {media.map(item => (
                                <div key={item.id} className={tabStyles.mediaTile}>
                                    <img
                                        src={item.url}
                                        alt="Galleria"
                                        className={tabStyles.mediaTileImg}
                                    />

                                    {item.is_cover && (
                                        <div className={tabStyles.coverBadge}>Copertina</div>
                                    )}

                                    <div className={tabStyles.mediaTileOverlay}>
                                        {!item.is_cover && (
                                            <button
                                                className={tabStyles.overlayAction}
                                                onClick={() => handleSetAsCover(item)}
                                                disabled={
                                                    settingCoverId === item.id ||
                                                    deletingId === item.id
                                                }
                                                type="button"
                                                title="Imposta come copertina"
                                            >
                                                <IconStar size={15} />
                                                <Text as="span" variant="caption">Copertina</Text>
                                            </button>
                                        )}
                                        <button
                                            className={`${tabStyles.overlayAction} ${tabStyles.overlayActionDanger}`}
                                            onClick={() => handleDelete(item)}
                                            disabled={
                                                deletingId === item.id ||
                                                settingCoverId === item.id
                                            }
                                            type="button"
                                            title="Elimina"
                                        >
                                            <IconTrash size={15} />
                                            <Text as="span" variant="caption">Elimina</Text>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
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
