import React, { useCallback, useEffect, useState } from "react";
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    rectSortingStrategy,
    sortableKeyboardCoordinates,
    useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    ExternalLink,
    GripVertical,
    Image as ImageIcon,
    Link as LinkIcon,
    Pencil,
    Plus,
    Star,
    Trash2
} from "lucide-react";
import { Button, Card } from "@/components/ui";
import {
    ImageUploadEditor,
    IMAGE_UPLOAD_PRESETS,
    type ImageUploadEditorResult
} from "@/components/ui/ImageUploadEditor";
import {
    updateActivity,
    uploadActivityCover,
    removeActivityCover
} from "@/services/supabase/activities";
import {
    deleteActivityMedia,
    getActivityMedia,
    setMediaAsCover,
    updateMediaSortOrder
} from "@/services/supabase/activity-media";
import { getActivitySlugAliases } from "@/services/supabase/activitySlugAliases";
import { useToast } from "@/context/Toast/ToastContext";
import type { V2Activity, ActivitySlugAlias } from "@/types/activity";
import type { ActivityMedia } from "@/types/activity-media";
import { ActivityGalleryUploadDrawer } from "./ActivityGalleryUploadDrawer";
import { ActivityIdentityDrawer } from "./info/ActivityIdentityDrawer";
import { ActivitySlugDrawer } from "./info/ActivitySlugDrawer";
import { ActivityGoogleReviewsDrawer } from "./contacts/ActivityGoogleReviewsDrawer";
import { InlineEditableField } from "./components/InlineEditableField";
import styles from "./ActivityProfileTab.module.scss";

interface ActivityProfileTabProps {
    activity: V2Activity;
    tenantId: string;
    onReload: () => Promise<void>;
    canWrite?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateEmail = (v: string): string | null =>
    EMAIL_RE.test(v) ? null : "Email non valida.";

const validateUrl = (v: string): string | null => {
    try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:"
            ? null
            : "URL deve iniziare con http:// o https://.";
    } catch {
        return "URL non valido (es. https://esempio.com).";
    }
};

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
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: item.id
    });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined
    };

    return (
        <div ref={setNodeRef} style={style} className={styles.mediaTile}>
            <img src={item.url} alt="Galleria" className={styles.mediaTileImg} />
            {item.is_cover && <div className={styles.coverBadge}>Copertina</div>}
            <button
                className={styles.dragHandle}
                {...attributes}
                {...listeners}
                type="button"
                aria-label="Trascina per riordinare"
            >
                <GripVertical size={16} />
            </button>
            <div className={styles.mediaTileOverlay}>
                {!item.is_cover && (
                    <button
                        className={styles.overlayAction}
                        onClick={() => onSetAsCover(item)}
                        disabled={settingCoverId === item.id || deletingId === item.id}
                        type="button"
                        title="Imposta come copertina"
                    >
                        <Star size={15} />
                        Copertina
                    </button>
                )}
                <button
                    className={`${styles.overlayAction} ${styles.overlayActionDanger}`}
                    onClick={() => onDelete(item)}
                    disabled={deletingId === item.id || settingCoverId === item.id}
                    type="button"
                    title="Elimina"
                >
                    <Trash2 size={15} />
                    Elimina
                </button>
            </div>
        </div>
    );
};

// ── Main tab ─────────────────────────────────────────────────────────────────

export const ActivityProfileTab: React.FC<ActivityProfileTabProps> = ({
    activity,
    tenantId,
    onReload,
    canWrite = true
}) => {
    const { showToast } = useToast();

    const [editingField, setEditingField] = useState<string | null>(null);

    const [isCoverSaving, setIsCoverSaving] = useState(false);
    const [isUploadDrawerOpen, setIsUploadDrawerOpen] = useState(false);
    const [isIdentityDrawerOpen, setIsIdentityDrawerOpen] = useState(false);
    const [isSlugDrawerOpen, setIsSlugDrawerOpen] = useState(false);
    const [isGoogleReviewsDrawerOpen, setIsGoogleReviewsDrawerOpen] = useState(false);

    const [media, setMedia] = useState<ActivityMedia[]>([]);
    const [mediaLoading, setMediaLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [settingCoverId, setSettingCoverId] = useState<string | null>(null);

    const [aliases, setAliases] = useState<ActivitySlugAlias[]>([]);

    const loadMedia = useCallback(async () => {
        try {
            setMediaLoading(true);
            setMedia(await getActivityMedia(activity.id));
        } catch {
            showToast({ message: "Errore nel caricamento della galleria.", type: "error" });
        } finally {
            setMediaLoading(false);
        }
    }, [activity.id, showToast]);

    const loadAliases = useCallback(async () => {
        try {
            setAliases(await getActivitySlugAliases(activity.id, tenantId));
        } catch {
            // non-critical
        }
    }, [activity.id, tenantId]);

    useEffect(() => {
        loadMedia();
        loadAliases();
    }, [loadMedia, loadAliases]);

    // ── Field save / toggle handlers ──────────────────────────────────────────

    const saveField = useCallback(
        (field: keyof V2Activity) => async (newValue: string) => {
            await updateActivity(activity.id, tenantId, {
                [field]: newValue.trim() === "" ? null : newValue.trim()
            });
            await onReload();
            showToast({ message: "Campo aggiornato.", type: "success" });
        },
        [activity.id, tenantId, onReload, showToast]
    );

    const togglePublicFlag = useCallback(
        (field: keyof V2Activity) => async (newValue: boolean) => {
            try {
                await updateActivity(activity.id, tenantId, { [field]: newValue });
                await onReload();
            } catch {
                showToast({ message: "Impossibile aggiornare la visibilità.", type: "error" });
            }
        },
        [activity.id, tenantId, onReload, showToast]
    );

    // ── Cover handlers (immagine di copertina, delete immediata) ───────────────

    // Riceve dal wrapper l'immagine GIÀ ritagliata 16:9 (baked): carica col
    // servizio esistente. Nessun framing metadata persistito — invariato.
    const handleCoverConfirm = async ({ file }: ImageUploadEditorResult) => {
        if (!file) return;
        try {
            await uploadActivityCover(activity, file);
            showToast({ message: "Immagine di copertina aggiornata.", type: "success" });
            await onReload();
        } catch {
            showToast({ message: "Errore durante il caricamento dell'immagine.", type: "error" });
        }
    };

    const handleCoverRemove = async () => {
        if (!activity.cover_image) return;
        setIsCoverSaving(true);
        try {
            await removeActivityCover(activity.id, activity.tenant_id, activity.cover_image);
            showToast({ message: "Immagine di copertina rimossa", type: "success" });
            await onReload();
        } catch {
            showToast({ message: "Errore durante la rimozione dell'immagine.", type: "error" });
        } finally {
            setIsCoverSaving(false);
        }
    };

    // ── Media handlers ────────────────────────────────────────────────────────

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
        try {
            await updateMediaSortOrder(reordered.map((m, i) => ({ id: m.id, sort_order: i })));
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
            setMedia(prev => prev.map(m => ({ ...m, is_cover: m.id === item.id })));
            await onReload();
            showToast({ message: "Immagine di copertina aggiornata.", type: "success" });
        } catch {
            showToast({ message: "Errore nell'impostazione della copertina.", type: "error" });
        } finally {
            setSettingCoverId(null);
        }
    };

    const handleDeleteMedia = async (item: ActivityMedia) => {
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

    const handleGalleryUploaded = (inserted: ActivityMedia[]) => {
        setMedia(prev => [...inserted, ...prev]);
    };

    const handleSlugSuccess = useCallback(async () => {
        await onReload();
        await loadAliases();
    }, [onReload, loadAliases]);

    // ── Derived display values ────────────────────────────────────────────────

    const domain = import.meta.env.VITE_PUBLIC_DOMAIN || window.location.host;
    const protocol = window.location.protocol;
    const publicUrl = `${protocol}//${domain}/${activity.slug}`;

    const addressLine = [activity.address, activity.street_number].filter(Boolean).join(", ");
    const cityLine = [activity.postal_code, activity.province, activity.city]
        .filter(Boolean)
        .join(" · ");

    return (
        <>
            <div className={styles.layout}>
                {/* ── Row 1 ──────────────────────────────────────────── */}
                <div className={styles.row}>
                    {/* Card: Immagini */}
                    <Card className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardHeaderText}>
                                <h3 className={styles.cardTitle}>Immagini</h3>
                                <p className={styles.cardSubtitle}>
                                    Cover e galleria sulla pagina pubblica
                                </p>
                            </div>
                        </div>
                        <div className={styles.cardBody}>
                            {canWrite ? (
                                <ImageUploadEditor
                                    aspectRatio={IMAGE_UPLOAD_PRESETS.coverSede.aspectRatio}
                                    backgroundFillModes={IMAGE_UPLOAD_PRESETS.coverSede.backgroundFillModes}
                                    maxSizeMB={IMAGE_UPLOAD_PRESETS.coverSede.maxSizeMB}
                                    compressLongEdge={IMAGE_UPLOAD_PRESETS.coverSede.compressLongEdge}
                                    bake={{ size: 1280, format: "image/webp", quality: 0.85, fileName: "cover.webp" }}
                                    fieldLabel={IMAGE_UPLOAD_PRESETS.coverSede.fieldLabel}
                                    drawerTitle={IMAGE_UPLOAD_PRESETS.coverSede.drawerTitle}
                                    requiresConfirm={IMAGE_UPLOAD_PRESETS.coverSede.requiresConfirm}
                                    initialSource={activity.cover_image ?? null}
                                    onConfirm={handleCoverConfirm}
                                    onRemove={handleCoverRemove}
                                    removing={isCoverSaving}
                                />
                            ) : (
                                activity.cover_image && (
                                    <div className={styles.coverPreview}>
                                        <img
                                            src={activity.cover_image}
                                            alt="Copertina"
                                            className={styles.coverImage}
                                        />
                                    </div>
                                )
                            )}

                            <div className={styles.galleryHeader}>
                                <span className={styles.galleryTitle}>
                                    Galleria · {media.length} immagin
                                    {media.length === 1 ? "e" : "i"}
                                </span>
                                {canWrite && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        leftIcon={<Plus size={14} />}
                                        onClick={() => setIsUploadDrawerOpen(true)}
                                    >
                                        Aggiungi immagini
                                    </Button>
                                )}
                            </div>

                            {mediaLoading ? (
                                <div className={styles.gallerySkeleton}>
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <div key={i} className={styles.skeletonItem} />
                                    ))}
                                </div>
                            ) : media.length === 0 ? (
                                <div className={styles.galleryEmpty}>
                                    <ImageIcon size={32} strokeWidth={1.5} />
                                    <p className={styles.galleryEmptyTitle}>Nessuna immagine</p>
                                    <p className={styles.galleryEmptyHint}>
                                        Aggiungi foto della sala, dei piatti o degli esterni.
                                    </p>
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
                                        <div className={styles.galleryGrid}>
                                            {media.map(item => (
                                                <SortableMediaTile
                                                    key={item.id}
                                                    item={item}
                                                    deletingId={deletingId}
                                                    settingCoverId={settingCoverId}
                                                    onSetAsCover={handleSetAsCover}
                                                    onDelete={handleDeleteMedia}
                                                />
                                            ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            )}
                        </div>
                    </Card>

                    {/* Card: Identità */}
                    <Card className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardHeaderText}>
                                <h3 className={styles.cardTitle}>Identità</h3>
                                <p className={styles.cardSubtitle}>
                                    Nome, indirizzo e descrizione pubblica
                                </p>
                            </div>
                            {canWrite && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    leftIcon={<Pencil size={14} />}
                                    onClick={() => setIsIdentityDrawerOpen(true)}
                                >
                                    Modifica
                                </Button>
                            )}
                        </div>
                        <div className={styles.cardBody}>
                            {/* Slug box */}
                            <div className={styles.slugSection}>
                                <span className={styles.fieldLabel}>
                                    <LinkIcon size={11} />
                                    Indirizzo web
                                </span>
                                <button
                                    type="button"
                                    className={styles.slugBox}
                                    onClick={() => setIsSlugDrawerOpen(true)}
                                    aria-label="Modifica indirizzo web"
                                >
                                    <span className={styles.slugDomain}>{domain}/</span>
                                    <span className={styles.slugAccent}>{activity.slug}</span>
                                    <a
                                        href={publicUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.slugExternal}
                                        onClick={e => e.stopPropagation()}
                                        aria-label="Apri pagina pubblica"
                                    >
                                        <ExternalLink size={14} />
                                    </a>
                                </button>
                                {aliases.length > 0 && (
                                    <button
                                        type="button"
                                        className={styles.aliasLink}
                                        onClick={() => setIsSlugDrawerOpen(true)}
                                    >
                                        Slug precedenti: {aliases.length}
                                    </button>
                                )}
                            </div>

                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Nome attività</span>
                                <span className={styles.fieldValue}>{activity.name}</span>
                            </div>

                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Indirizzo</span>
                                {addressLine || cityLine ? (
                                    <div className={styles.addressBlock}>
                                        {addressLine && (
                                            <span className={styles.fieldValue}>{addressLine}</span>
                                        )}
                                        {cityLine && (
                                            <span className={styles.addressMeta}>{cityLine}</span>
                                        )}
                                    </div>
                                ) : (
                                    <span className={styles.fieldEmpty}>Non specificato</span>
                                )}
                            </div>

                            <div className={`${styles.field} ${styles.fieldLast}`}>
                                <span className={styles.fieldLabel}>Presentazione</span>
                                {activity.description ? (
                                    <p className={styles.fieldDescription}>
                                        {activity.description}
                                    </p>
                                ) : (
                                    <span className={styles.fieldEmpty}>
                                        Aggiungi una breve descrizione…
                                    </span>
                                )}
                            </div>
                        </div>
                    </Card>
                </div>

                {/* ── Row 2 ──────────────────────────────────────────── */}
                <div className={styles.row}>
                    {/* Card: Contatti */}
                    <Card className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardHeaderText}>
                                <h3 className={styles.cardTitle}>Contatti</h3>
                                <p className={styles.cardSubtitle}>
                                    Clicca un campo per modificarlo · L&apos;occhio indica se è
                                    visibile pubblicamente
                                </p>
                            </div>
                        </div>
                        <div className={`${styles.cardBody} ${styles.cardBodyTight}`}>
                            <InlineEditableField
                                fieldId="email_public"
                                label="Email pubblica"
                                value={activity.email_public}
                                inputType="email"
                                publicFlag={activity.email_public_visible}
                                validate={validateEmail}
                                onSave={saveField("email_public")}
                                onTogglePublic={togglePublicFlag("email_public_visible")}
                                activeFieldId={editingField}
                                onActivate={setEditingField}
                            />
                            <InlineEditableField
                                fieldId="phone"
                                label="Telefono"
                                value={activity.phone}
                                inputType="tel"
                                publicFlag={activity.phone_public}
                                onSave={saveField("phone")}
                                onTogglePublic={togglePublicFlag("phone_public")}
                                activeFieldId={editingField}
                                onActivate={setEditingField}
                            />
                            <InlineEditableField
                                fieldId="website"
                                label="Sito web"
                                value={activity.website}
                                inputType="url"
                                publicFlag={activity.website_public}
                                validate={validateUrl}
                                onSave={saveField("website")}
                                onTogglePublic={togglePublicFlag("website_public")}
                                activeFieldId={editingField}
                                onActivate={setEditingField}
                            />
                            <div
                                className={styles.googleReviewsRow}
                                onClick={() => setIsGoogleReviewsDrawerOpen(true)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={e => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setIsGoogleReviewsDrawerOpen(true);
                                    }
                                }}
                            >
                                <div className={styles.googleReviewsBody}>
                                    <span className={styles.googleReviewsLabel}>
                                        Google Reviews
                                    </span>
                                    {activity.google_review_url ? (
                                        <span className={styles.googleReviewsLinked}>
                                            <span className={styles.googleReviewsValue}>
                                                Collegato
                                            </span>
                                            <span className={styles.googleReviewsMeta}>
                                                via Google Places
                                            </span>
                                        </span>
                                    ) : (
                                        <span className={styles.googleReviewsEmpty}>
                                            Non collegato
                                        </span>
                                    )}
                                </div>
                                {activity.google_review_url && (
                                    <a
                                        href={activity.google_review_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.googleReviewsExternal}
                                        onClick={e => e.stopPropagation()}
                                        aria-label="Apri pagina recensione"
                                    >
                                        <ExternalLink size={16} />
                                    </a>
                                )}
                            </div>
                        </div>
                    </Card>

                    {/* Card: Social network */}
                    <Card className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardHeaderText}>
                                <h3 className={styles.cardTitle}>Social network</h3>
                                <p className={styles.cardSubtitle}>
                                    Clicca un campo per modificarlo · L&apos;occhio indica se è
                                    visibile pubblicamente
                                </p>
                            </div>
                        </div>
                        <div className={`${styles.cardBody} ${styles.cardBodyTight}`}>
                            <InlineEditableField
                                fieldId="instagram"
                                label="Instagram"
                                value={activity.instagram}
                                prefix={activity.instagram ? "@" : undefined}
                                publicFlag={activity.instagram_public}
                                onSave={saveField("instagram")}
                                onTogglePublic={togglePublicFlag("instagram_public")}
                                activeFieldId={editingField}
                                onActivate={setEditingField}
                            />
                            <InlineEditableField
                                fieldId="facebook"
                                label="Facebook"
                                value={activity.facebook}
                                inputType="url"
                                publicFlag={activity.facebook_public}
                                validate={validateUrl}
                                onSave={saveField("facebook")}
                                onTogglePublic={togglePublicFlag("facebook_public")}
                                activeFieldId={editingField}
                                onActivate={setEditingField}
                            />
                            <InlineEditableField
                                fieldId="whatsapp"
                                label="WhatsApp"
                                value={activity.whatsapp}
                                inputType="tel"
                                publicFlag={activity.whatsapp_public}
                                onSave={saveField("whatsapp")}
                                onTogglePublic={togglePublicFlag("whatsapp_public")}
                                activeFieldId={editingField}
                                onActivate={setEditingField}
                            />
                        </div>
                    </Card>
                </div>
            </div>

            {/* ── Drawers ──────────────────────────────────────────── */}
            <ActivityGalleryUploadDrawer
                open={isUploadDrawerOpen}
                onClose={() => setIsUploadDrawerOpen(false)}
                activity={activity}
                onSuccess={handleGalleryUploaded}
            />
            <ActivityIdentityDrawer
                open={isIdentityDrawerOpen}
                onClose={() => setIsIdentityDrawerOpen(false)}
                activity={activity}
                tenantId={tenantId}
                onSuccess={() => {
                    void onReload();
                }}
            />
            <ActivitySlugDrawer
                open={isSlugDrawerOpen}
                onClose={() => setIsSlugDrawerOpen(false)}
                activity={activity}
                tenantId={tenantId}
                onSuccess={handleSlugSuccess}
            />
            <ActivityGoogleReviewsDrawer
                open={isGoogleReviewsDrawerOpen}
                onClose={() => setIsGoogleReviewsDrawerOpen(false)}
                activity={activity}
                tenantId={tenantId}
                onSuccess={onReload}
            />
        </>
    );
};
