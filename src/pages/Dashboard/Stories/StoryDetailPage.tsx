import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/context/Toast/ToastContext";
import {
    getStory,
    updateStory,
    StoryBlock,
    StoryStatus,
    StoryWithProduct
} from "@/services/supabase/stories";
import { uploadStoryImage } from "@/services/supabase/upload";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import { useTenantId } from "@/context/useTenantId";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnAnyActivity } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { StoryForm } from "./components/StoryForm";
import { StoryBlockEditor } from "./components/StoryBlockEditor";
import { HeaderSaveAction } from "./components/HeaderSaveAction";
import { useBeforeUnloadWarning } from "./hooks/useBeforeUnloadWarning";
import styles from "./Stories.module.scss";

export default function StoryDetailPage() {
    const { storyId } = useParams<{ storyId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const tenantId = useTenantId();
    const { permissions } = usePermissions();
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "stories.write") : false;

    // `story` è il baseline SALVATO. Il draft (campi + blocchi) vive qui nel
    // parent: isDirty deriva dal diff draft↔baseline, e un unico Salva persiste
    // meta + body_blocks insieme.
    const [story, setStory] = useState<StoryWithProduct | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Draft
    const [eyebrow, setEyebrow] = useState("");
    const [title, setTitle] = useState("");
    const [status, setStatus] = useState<StoryStatus>("draft");
    const [productId, setProductId] = useState<string | null>(null);
    const [blocks, setBlocks] = useState<StoryBlock[]>([]);
    const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);

    const refreshStory = useCallback(async () => {
        if (!tenantId || !storyId) return;
        try {
            const data = await getStory(storyId, tenantId);
            setStory(data);
        } catch (error) {
            console.error(error);
            showToast({ type: "error", message: "Errore durante il caricamento della storia." });
        }
    }, [tenantId, storyId, showToast]);

    useEffect(() => {
        setLoading(true);
        refreshStory().finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId, storyId]);

    // Sync draft ← baseline ad ogni (ri)caricamento del `story` (load iniziale
    // e dopo un Salva riuscito). Revoca l'eventuale objectURL pendente.
    useEffect(() => {
        if (!story) return;
        setEyebrow(story.eyebrow ?? "");
        setTitle(story.title);
        setStatus(story.status);
        setProductId(story.product_id);
        setBlocks(story.body_blocks);
        setPendingCoverFile(null);
        setCoverPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
    }, [story]);

    const handleCoverFileChange = useCallback((file: File | null) => {
        setPendingCoverFile(file);
        setCoverPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return file ? URL.createObjectURL(file) : null;
        });
    }, []);

    const isDirty = useMemo(() => {
        if (!story) return false;
        if (pendingCoverFile) return true;
        if (eyebrow !== (story.eyebrow ?? "")) return true;
        if (title !== story.title) return true;
        if (status !== story.status) return true;
        if (productId !== story.product_id) return true;
        if (JSON.stringify(blocks) !== JSON.stringify(story.body_blocks)) return true;
        return false;
    }, [story, eyebrow, title, status, productId, pendingCoverFile, blocks]);

    const saveStory = useCallback(async (): Promise<boolean> => {
        if (!story || !tenantId || isSaving) return false;

        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
            showToast({ message: "Il titolo della storia è obbligatorio.", type: "error" });
            return false;
        }

        setIsSaving(true);
        try {
            let coverMedia = story.cover_media;
            if (pendingCoverFile) {
                coverMedia = await uploadStoryImage(
                    tenantId,
                    story.id,
                    await compressImage(pendingCoverFile, COMPRESS_PROFILES.cover)
                );
            }
            await updateStory(story.id, tenantId, {
                eyebrow: eyebrow.trim() || null,
                title: trimmedTitle,
                product_id: productId,
                status,
                cover_media: coverMedia,
                body_blocks: blocks
            });
            showToast({ message: "Storia aggiornata.", type: "success" });
            await refreshStory();
            return true;
        } catch (error) {
            console.error("Errore salvataggio storia:", error);
            const message =
                error instanceof Error && error.message ? error.message : "Impossibile salvare la storia.";
            showToast({ message, type: "error" });
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [story, tenantId, isSaving, title, eyebrow, productId, status, pendingCoverFile, blocks, refreshStory, showToast]);

    // Protezione refresh / chiusura tab (prompt nativo). Il guard di navigazione
    // SPA con dialog a 3 opzioni richiede un data router — vedi report.
    useBeforeUnloadWarning(isDirty);

    const breadcrumbItems = useMemo(
        () => [
            { label: "Storie", to: `/business/${tenantId}/stories` },
            { label: loading ? "Caricamento..." : story?.title || "Dettaglio" }
        ],
        [tenantId, loading, story?.title]
    );
    useBreadcrumbItems(breadcrumbItems);

    const actions = useMemo(
        () =>
            canWrite ? (
                <HeaderSaveAction isDirty={isDirty} isSaving={isSaving} onSave={saveStory} />
            ) : undefined,
        [canWrite, isDirty, isSaving, saveStory]
    );
    usePageHeader({ actions, sticky: true });

    if (loading) {
        return (
            <div className={styles.wrapper}>
                <Text colorVariant="muted">Caricamento in corso...</Text>
            </div>
        );
    }

    if (!story) {
        return (
            <div className={styles.wrapper}>
                <Text variant="title-sm" colorVariant="error">
                    Storia non trovata.
                </Text>
                <Button variant="secondary" onClick={() => navigate(`/business/${tenantId}/stories`)}>
                    Torna alla lista
                </Button>
            </div>
        );
    }

    return (
        <PageGate readPermission="stories.read">
            {() => (
                <div className={styles.wrapper}>
                    <div className={styles.brandPanel}>
                        <Text variant="title-sm" weight={600}>
                            Informazioni
                        </Text>

                        <StoryForm
                            eyebrow={eyebrow}
                            onEyebrowChange={setEyebrow}
                            title={title}
                            onTitleChange={setTitle}
                            status={status}
                            onStatusChange={setStatus}
                            productId={productId}
                            onProductIdChange={setProductId}
                            savedCover={story.cover_media}
                            coverPreview={coverPreview}
                            onCoverFileChange={handleCoverFileChange}
                            tenantId={tenantId ?? ""}
                            canWrite={canWrite}
                        />
                    </div>

                    <div className={styles.brandPanel}>
                        <Text variant="title-sm" weight={600}>
                            Contenuto
                        </Text>
                        <StoryBlockEditor
                            tenantId={tenantId ?? ""}
                            storyId={story.id}
                            value={blocks}
                            onChange={setBlocks}
                            disabled={!canWrite}
                        />
                    </div>
                </div>
            )}
        </PageGate>
    );
}
