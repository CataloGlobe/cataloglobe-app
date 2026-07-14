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
    StoryWithProduct,
    MAX_STORY_IMAGES
} from "@/services/supabase/stories";
import {
    uploadStoryImage,
    deleteStoryImageBestEffort,
    extractStoragePath
} from "@/services/supabase/upload";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import { useTenantId } from "@/context/useTenantId";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnAnyActivity } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { SectionCard } from "@/components/ui/SectionCard/SectionCard";
import { StoryForm } from "./components/StoryForm";
import { StoryBlockEditor } from "./components/StoryBlockEditor";
import { createBlock } from "./components/createBlock";
import { HeaderSaveAction } from "./components/HeaderSaveAction";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { StoryProductPicker } from "./components/StoryProductPicker";
import { AddBlockMenu } from "./components/AddBlockMenu";
import { useBeforeUnloadWarning } from "./hooks/useBeforeUnloadWarning";
import styles from "./Stories.module.scss";

const STATUS_OPTIONS: { value: StoryStatus; label: string }[] = [
    { value: "draft", label: "Bozza" },
    { value: "published", label: "Pubblicata" }
];

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
    // Rimozione copertina PENDENTE: true solo se esisteva una copertina salvata.
    // La delete reale (DB null + storage) avviene in saveStory, mai prima.
    const [coverRemoved, setCoverRemoved] = useState(false);
    // File pendenti per i blocchi immagine, keyed by block.id. Upload differito
    // al Salva (niente eager upload: "esci senza salvare" non tocca lo storage).
    const [pendingBlockImages, setPendingBlockImages] = useState<Record<string, File>>({});

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

    // Sync draft ← baseline. Usata al load iniziale, dopo un Salva riuscito, e
    // da `discardStory` (Annulla in header) per riallineare l'intero draft —
    // campi, blocchi, copertina (anche una rimozione pendente) e immagini
    // blocco pendenti. Revoca l'eventuale objectURL pendente.
    const syncFromStory = useCallback((data: StoryWithProduct) => {
        setEyebrow(data.eyebrow ?? "");
        setTitle(data.title);
        setStatus(data.status);
        setProductId(data.product_id);
        setBlocks(data.body_blocks);
        setPendingCoverFile(null);
        setCoverRemoved(false);
        setPendingBlockImages({});
        setCoverPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
    }, []);

    useEffect(() => {
        if (!story) return;
        syncFromStory(story);
    }, [story, syncFromStory]);

    const discardStory = useCallback(() => {
        if (story) syncFromStory(story);
    }, [story, syncFromStory]);

    const handleCoverFileChange = useCallback((file: File) => {
        setPendingCoverFile(file);
        setCoverRemoved(false);
        setCoverPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
        });
    }, []);

    const handleCoverRemove = useCallback(() => {
        setPendingCoverFile(null);
        setCoverPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
        // Pendente solo se c'era una copertina salvata; se stavamo solo
        // annullando un file pendente, non c'è nulla da rimuovere al Salva.
        setCoverRemoved(Boolean(story?.cover_media));
    }, [story?.cover_media]);

    const handleBlockImageChange = useCallback((blockId: string, file: File | null) => {
        setPendingBlockImages(prev => {
            if (file) return { ...prev, [blockId]: file };
            if (!(blockId in prev)) return prev;
            const next = { ...prev };
            delete next[blockId];
            return next;
        });
    }, []);

    const isDirty = useMemo(() => {
        if (!story) return false;
        if (pendingCoverFile) return true;
        if (coverRemoved) return true;
        // File pendenti su blocchi immagine ancora presenti nel draft.
        if (Object.keys(pendingBlockImages).some(id => blocks.some(b => b.id === id && b.type === "image")))
            return true;
        if (eyebrow !== (story.eyebrow ?? "")) return true;
        if (title !== story.title) return true;
        if (status !== story.status) return true;
        if (productId !== story.product_id) return true;
        if (JSON.stringify(blocks) !== JSON.stringify(story.body_blocks)) return true;
        return false;
    }, [story, eyebrow, title, status, productId, pendingCoverFile, coverRemoved, pendingBlockImages, blocks]);

    const saveStory = useCallback(async (): Promise<boolean> => {
        if (!story || !tenantId || isSaving) return false;

        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
            showToast({ message: "Il titolo della storia è obbligatorio.", type: "error" });
            return false;
        }

        // Guard trappola-featured: mai persistere un blocco immagine con un file
        // pendente ma senza mediaAspectRatio. ImageBlock lo scrive sempre alla
        // selezione; se manca, la lettura del ratio è fallita → abortisci invece
        // di salvare un framing orfano che il render ignorerebbe (path cover).
        for (const blockId of Object.keys(pendingBlockImages)) {
            const b = blocks.find(x => x.id === blockId);
            if (b?.type === "image" && b.mediaAspectRatio == null) {
                showToast({
                    message: "Un'immagine non ha proporzioni valide. Ricaricala e riprova.",
                    type: "error"
                });
                return false;
            }
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
            } else if (coverRemoved) {
                coverMedia = null;
            }

            // Upload differito dei file pendenti dei blocchi immagine.
            let nextBlocks = blocks;
            for (const [blockId, file] of Object.entries(pendingBlockImages)) {
                if (!nextBlocks.some(b => b.id === blockId && b.type === "image")) continue;
                const url = await uploadStoryImage(
                    tenantId,
                    `${story.id}/${blockId}`,
                    // Profilo `story` (1200×1500): i blocchi possono essere verticali
                    // (4:5). La copertina sopra resta sul profilo `cover` (landscape).
                    await compressImage(file, COMPRESS_PROFILES.story)
                );
                nextBlocks = nextBlocks.map(b => (b.id === blockId ? { ...b, url } : b));
            }

            await updateStory(story.id, tenantId, {
                eyebrow: eyebrow.trim() || null,
                title: trimmedTitle,
                product_id: productId,
                status,
                cover_media: coverMedia,
                body_blocks: nextBlocks
            });

            // Cleanup storage best-effort DOPO il persist DB riuscito: file non
            // più referenziati (copertina rimossa/sostituita con estensione
            // diversa, immagini blocco rimosse/sostituite, blocchi eliminati).
            // Confronto per storage path (l'URL ha il cache buster).
            const toPath = (url: string) => extractStoragePath(url, "stories") ?? url;
            const liveUrls = [
                ...(coverMedia ? [coverMedia] : []),
                ...nextBlocks.flatMap(b => (b.type === "image" && b.url ? [b.url] : []))
            ];
            const livePaths = new Set(liveUrls.map(toPath));
            const savedRefs = [
                ...(story.cover_media ? [{ id: story.id, url: story.cover_media }] : []),
                ...story.body_blocks.flatMap(b =>
                    b.type === "image" && b.url ? [{ id: `${story.id}/${b.id}`, url: b.url }] : []
                )
            ];
            for (const ref of savedRefs) {
                if (livePaths.has(toPath(ref.url))) continue;
                try {
                    await deleteStoryImageBestEffort(tenantId, ref.id, ref.url);
                } catch (err) {
                    console.warn("[storage] story image cleanup failed:", err);
                }
            }

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
    }, [story, tenantId, isSaving, title, eyebrow, productId, status, pendingCoverFile, coverRemoved, pendingBlockImages, blocks, refreshStory, showToast]);

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

    // Id del blocco appena aggiunto: consumato one-shot da StoryBlockEditor
    // per scroll+focus dopo il render (vedi handleAddBlock).
    const [focusBlockId, setFocusBlockId] = useState<string | null>(null);

    const imageBlockCount = useMemo(() => blocks.filter(b => b.type === "image").length, [blocks]);
    const imageCapReached = imageBlockCount >= MAX_STORY_IMAGES;

    const handleAddBlock = useCallback(
        (type: StoryBlock["type"]) => {
            if (type === "image" && imageCapReached) {
                showToast({ message: `Massimo ${MAX_STORY_IMAGES} immagini per storia.`, type: "error" });
                return;
            }
            const block = createBlock(type);
            setBlocks(prev => [...prev, block]);
            setFocusBlockId(block.id);
        },
        [imageCapReached, showToast]
    );

    const handleFocusHandled = useCallback(() => setFocusBlockId(null), []);

    const actions = useMemo(
        () => (
            <div className={styles.headerActions}>
                <div className={!canWrite ? styles.readonlyControl : undefined}>
                    <SegmentedControl<StoryStatus>
                        value={status}
                        onChange={setStatus}
                        options={STATUS_OPTIONS}
                        size="sm"
                    />
                </div>
                {canWrite && (
                    <>
                        <span className={styles.headerSeparator} aria-hidden="true" />
                        <HeaderSaveAction
                            isDirty={isDirty}
                            isSaving={isSaving}
                            onSave={saveStory}
                            onDiscard={discardStory}
                        />
                    </>
                )}
            </div>
        ),
        [status, canWrite, isDirty, isSaving, saveStory, discardStory]
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
                    <SectionCard
                        title="Informazioni"
                        subtitle="Titolo e copertina compaiono nell'elenco storie del catalogo"
                    >
                        <StoryForm
                            eyebrow={eyebrow}
                            onEyebrowChange={setEyebrow}
                            title={title}
                            onTitleChange={setTitle}
                            coverUrl={coverPreview ?? (coverRemoved ? null : story.cover_media)}
                            pendingCoverFile={pendingCoverFile}
                            onCoverFileChange={handleCoverFileChange}
                            onCoverRemove={handleCoverRemove}
                            canWrite={canWrite}
                        />
                    </SectionCard>

                    <SectionCard
                        title="Prodotto collegato"
                        subtitle="La storia comparirà nella scheda di questo prodotto, nel menu pubblico"
                    >
                        <StoryProductPicker
                            tenantId={tenantId}
                            value={productId}
                            onChange={setProductId}
                            disabled={!canWrite}
                        />
                    </SectionCard>

                    <SectionCard
                        title="Contenuto"
                        subtitle="Blocchi di testo, immagini e video nell'ordine in cui verranno letti"
                        actions={
                            canWrite ? (
                                <AddBlockMenu onAdd={handleAddBlock} imageDisabled={imageCapReached} />
                            ) : undefined
                        }
                    >
                        <StoryBlockEditor
                            value={blocks}
                            onChange={setBlocks}
                            pendingImages={pendingBlockImages}
                            onPendingImageChange={handleBlockImageChange}
                            disabled={!canWrite}
                            focusBlockId={focusBlockId}
                            onFocusHandled={handleFocusHandled}
                            onAddBlock={handleAddBlock}
                        />
                    </SectionCard>
                </div>
            )}
        </PageGate>
    );
}
