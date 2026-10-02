import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
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
import { usePermissions } from "@/context/usePermissions";
import { canDoOnAnyActivity } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { Card } from "@/components/ui/Card/Card";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { BookOpenText } from "lucide-react";
import { StoryForm } from "./components/StoryForm";
import { StoryBlockEditor } from "./components/StoryBlockEditor";
import { createBlock } from "./components/createBlock";
import { HeaderSaveAction, DiscardChangesConfirmDialog } from "@/components/ui/HeaderSaveAction/HeaderSaveAction";
import { buildSaveActionCompactConfig } from "@/components/ui/HeaderSaveAction/headerSaveActionCompact";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { StoryProductPicker, type StoryProductOptions } from "./components/StoryProductPicker";
import { listBaseProductsForPicker } from "@/services/supabase/products";
import { StoryPlacementCard } from "./components/StoryPlacementCard";
import { getActivities } from "@/services/supabase/activities";
import type { AppearanceActivity } from "@/utils/ruleAppearance";
import { AddBlockMenu } from "./components/AddBlockMenu";
import { useUnsavedChangesGuard } from "@/components/ui/UnsavedChangesBar/useUnsavedChangesGuard";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { Badge } from "@/components/ui/Badge/Badge";
import styles from "./Stories.module.scss";

const STATUS_OPTIONS: { value: StoryStatus; label: string }[] = [
    { value: "draft", label: "Bozza" },
    { value: "published", label: "Pubblicata" }
];

/**
 * Il primo blocco che non si può salvare, detto per numero. Un blocco immagine
 * senza file si pubblicherebbe come un'immagine rotta; uno con un file
 * pendente ma senza `mediaAspectRatio` salverebbe un framing orfano (guard
 * trappola-featured: ImageBlock lo scrive sempre alla selezione, se manca la
 * lettura del ratio è fallita).
 */
function blockProblem(blocks: StoryBlock[], pendingImages: Record<string, File>): string | null {
    for (const [index, block] of blocks.entries()) {
        if (block.type !== "image") continue;
        const pending = block.id in pendingImages;
        if (!pending && !block.url) {
            return `Il blocco ${index + 1} è un'immagine senza file: caricala o togli il blocco.`;
        }
        if (pending && block.mediaAspectRatio == null) {
            return "Un'immagine non ha proporzioni valide. Ricaricala e riprova.";
        }
    }
    return null;
}

export default function StoryDetailPage() {
    const { storyId } = useParams<{ storyId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const tenantId = useTenantId();
    const { permissions } = usePermissions();
    const { canEdit } = useSubscriptionGuard();
    // Gate di lettura prima di ogni fetch; il blocco lo rende `PageGate`.
    const canRead = permissions != null && canDoOnAnyActivity(permissions, "stories.read");
    // Chi non scrive (o ha l'abbonamento fermo) legge la storia com'è: campi e
    // blocchi spenti, stato come etichetta, niente Salva.
    const canWrite = permissions != null && canDoOnAnyActivity(permissions, "stories.write") && canEdit;

    // `story` è il baseline SALVATO. Il draft (campi + blocchi) vive qui nel
    // parent: isDirty deriva dal diff draft↔baseline, e un unico Salva persiste
    // meta + body_blocks insieme.
    const [story, setStory] = useState<StoryWithProduct | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    // Conferma dello scarto quando "Annulla" arriva dal kebab compatto: stessa
    // domanda del bottone in toolbar comoda.
    const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

    // Draft
    const [eyebrow, setEyebrow] = useState("");
    const [title, setTitle] = useState("");
    const [status, setStatus] = useState<StoryStatus>("draft");
    const [productId, setProductId] = useState<string | null>(null);
    // Dove appare (§34.7): null = tutta l'azienda.
    const [activityId, setActivityId] = useState<string | null>(null);
    const [activities, setActivities] = useState<AppearanceActivity[]>([]);
    // I prodotti base, una lettura sola per il picker in pagina e i blocchi Prodotto.
    const [productOptions, setProductOptions] = useState<StoryProductOptions>({ items: null, failed: false });
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
        if (!tenantId || !storyId || !canRead) return;
        try {
            setLoadError(false);
            const data = await getStory(storyId, tenantId);
            setStory(data);
        } catch (error) {
            // «Non trovata» è un 406 di PostgREST (PGRST116); ogni altro errore
            // è un errore, e la pagina lo dice con «Riprova».
            const code = (error as { code?: string } | null)?.code;
            if (code === "PGRST116") {
                setStory(null);
            } else {
                console.error("Caricamento storia:", error);
                setLoadError(true);
            }
        }
    }, [tenantId, storyId, canRead]);

    useEffect(() => {
        if (!tenantId || !canRead) return;
        getActivities(tenantId)
            .then(list => setActivities(list.map(a => ({ id: a.id, name: a.name, status: a.status }))))
            .catch(error => console.warn("[StoryDetailPage] sedi non caricate:", error));
    }, [tenantId, canRead]);

    useEffect(() => {
        if (!tenantId || !canRead) return;
        let cancelled = false;
        setProductOptions({ items: null, failed: false });
        listBaseProductsForPicker(tenantId)
            .then(items => {
                if (!cancelled) setProductOptions({ items, failed: false });
            })
            .catch(error => {
                console.warn("[StoryDetailPage] prodotti non caricati:", error);
                if (!cancelled) setProductOptions({ items: null, failed: true });
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId, canRead]);

    useEffect(() => {
        if (!canRead) return;
        setLoading(true);
        refreshStory().finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId, storyId, canRead]);

    // Sync draft ← baseline. Usata al load iniziale, dopo un Salva riuscito, e
    // da `discardStory` (Annulla in header) per riallineare l'intero draft —
    // campi, blocchi, copertina (anche una rimozione pendente) e immagini
    // blocco pendenti. Revoca l'eventuale objectURL pendente.
    const syncFromStory = useCallback((data: StoryWithProduct) => {
        setEyebrow(data.eyebrow ?? "");
        setTitle(data.title);
        setStatus(data.status);
        setProductId(data.product_id);
        setActivityId(data.activity_id);
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
        if (activityId !== story.activity_id) return true;
        if (JSON.stringify(blocks) !== JSON.stringify(story.body_blocks)) return true;
        return false;
    }, [story, eyebrow, title, status, productId, activityId, pendingCoverFile, coverRemoved, pendingBlockImages, blocks]);

    const saveStory = useCallback(async (): Promise<boolean> => {
        if (!story || !tenantId || isSaving) return false;

        const trimmedTitle = title.trim();
        const problem = trimmedTitle ? blockProblem(blocks, pendingBlockImages) : "Il titolo della storia è obbligatorio.";
        if (problem) {
            showToast({ message: problem, type: "error" });
            return false;
        }

        setIsSaving(true);
        // I file caricati in questo Salva: se la scrittura fallisce si tolgono,
        // la storia continua a usare i suoi.
        const uploaded: Array<{ id: string; url: string }> = [];
        try {
            let coverMedia = story.cover_media;
            if (pendingCoverFile) {
                coverMedia = await uploadStoryImage(
                    tenantId,
                    story.id,
                    await compressImage(pendingCoverFile, COMPRESS_PROFILES.cover)
                );
                uploaded.push({ id: story.id, url: coverMedia });
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
                uploaded.push({ id: `${story.id}/${blockId}`, url });
                nextBlocks = nextBlocks.map(b => (b.id === blockId ? { ...b, url } : b));
            }

            // Elenco: le voci vuote/whitespace non vengono persistite (altri tipi invariati).
            nextBlocks = nextBlocks.map(b =>
                b.type === "list" ? { ...b, items: b.items.filter(it => it.trim() !== "") } : b
            );

            await updateStory(story.id, tenantId, {
                eyebrow: eyebrow.trim() || null,
                title: trimmedTitle,
                product_id: productId,
                activity_id: activityId,
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
            for (const file of uploaded) {
                deleteStoryImageBestEffort(tenantId, file.id, file.url).catch(err =>
                    console.warn("[storage] story upload rollback failed:", err)
                );
            }
            const message =
                error instanceof Error && error.message ? error.message : "Impossibile salvare la storia.";
            showToast({ message, type: "error" });
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [story, tenantId, isSaving, title, eyebrow, productId, activityId, status, pendingCoverFile, coverRemoved, pendingBlockImages, blocks, refreshStory, showToast]);

    // Guardia all'uscita: refresh e navigazione interna (sidebar, briciole).
    useUnsavedChangesGuard(isDirty && canWrite);

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
    const storyBadge = `${blocks.length} ${blocks.length === 1 ? "blocco" : "blocchi"} · ${imageBlockCount} ${imageBlockCount === 1 ? "immagine" : "immagini"} su ${MAX_STORY_IMAGES}`;
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
                {canWrite ? (
                    <SegmentedControl<StoryStatus>
                        value={status}
                        onChange={setStatus}
                        options={STATUS_OPTIONS}
                        size="sm"
                    />
                ) : (
                    <Badge variant={status === "published" ? "success" : "secondary"}>
                        {status === "published" ? "Pubblicata" : "Bozza"}
                    </Badge>
                )}
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
    // Bozza/Pubblicata resta a vista anche in compatto: è lo stato della storia,
    // non un'azione accessoria. Salva/Annulla seguono lo stesso trattamento
    // delle altre pagine con `HeaderSaveAction`.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        statusControl: {
            options: STATUS_OPTIONS,
            value: status,
            onChange: value => setStatus(value as StoryStatus),
            label: "Stato della storia",
            disabled: !canWrite
        },
        ...(canWrite
            ? buildSaveActionCompactConfig({
                  isDirty,
                  isSaving,
                  onSave: saveStory,
                  onRequestDiscard: () => setConfirmDiscardOpen(true)
              })
            : {})
    }), [status, canWrite, isDirty, isSaving, saveStory]);

    usePageHeader({ actions, compact: headerCompact });

    if (permissions != null && !canRead) {
        return <PageGate readPermission="stories.read">{() => null}</PageGate>;
    }

    if (loading) {
        // Stessa sagoma del contenuto: Informazioni, Dove appare, Prodotto collegato, Il racconto.
        return (
            <div className={styles.wrapper} aria-busy="true" aria-label="Caricamento">
                <Skeleton height="320px" />
                <Skeleton height="160px" />
                <Skeleton height="96px" />
                <Skeleton height="240px" />
            </div>
        );
    }

    if (loadError) {
        return (
            <EmptyState
                variant="page"
                icon={<BookOpenText />}
                title="Non è stato possibile caricare la storia"
                description="Controlla la connessione e riprova."
                action={
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setLoading(true);
                            refreshStory().finally(() => setLoading(false));
                        }}
                    >
                        Riprova
                    </Button>
                }
            />
        );
    }

    if (!story) {
        return (
            <EmptyState
                variant="page"
                icon={<BookOpenText />}
                title="Storia non trovata"
                description="La storia che cerchi non esiste o è stata eliminata."
                action={
                    <Button onClick={() => navigate(`/business/${tenantId}/stories`)}>
                        Torna a Storie
                    </Button>
                }
            />
        );
    }

    return (
        <PageGate readPermission="stories.read">
            {() => (
                <div className={styles.wrapper}>
                    {!canWrite && permissions != null && (
                        <InlineBanner variant="info">
                            {canDoOnAnyActivity(permissions, "stories.write")
                                ? "Sola lettura: l'abbonamento non è attivo."
                                : "Sola lettura: per modificare le storie serve un ruolo da manager in su."}
                        </InlineBanner>
                    )}
                    {/* Spento anche durante il Salva: la rilettura che lo chiude
                        riallinea la bozza e perderebbe quello che si scrive nel mentre. */}
                    <fieldset className={styles.readOnlyScope} disabled={!canWrite || isSaving}>
                    <Card
                        title="Informazioni"
                        subtitle="Titolo e copertina sono quello che il cliente vede nell'elenco."
                    >
                        <StoryForm
                            eyebrow={eyebrow}
                            onEyebrowChange={setEyebrow}
                            title={title}
                            onTitleChange={setTitle}
                            coverUrl={coverPreview ?? (coverRemoved ? null : story.cover_media)}
                            onCoverFileChange={handleCoverFileChange}
                            onCoverRemove={handleCoverRemove}
                            canWrite={canWrite}
                        />
                    </Card>

                    <StoryPlacementCard
                        activityId={activityId}
                        onChange={setActivityId}
                        activities={activities}
                        status={status}
                        disabled={!canWrite}
                    />

                    <Card
                        title="Prodotto collegato"
                        subtitle="Se lo colleghi, la storia compare anche nella scheda di quel prodotto nel menù."
                    >
                        <StoryProductPicker
                            tenantId={tenantId}
                            value={productId}
                            onChange={setProductId}
                            options={productOptions}
                            fallbackName={productId === story.product_id ? story.product?.name : null}
                            disabled={!canWrite}
                        />
                    </Card>

                    <Card
                        title="Il racconto"
                        badge={<Text as="span" variant="caption" colorVariant="muted">{storyBadge}</Text>}
                        subtitle="Blocchi di testo, immagini e video, nell'ordine in cui si leggono."
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
                            tenantId={tenantId}
                            productOptions={productOptions}
                            disabled={!canWrite}
                            focusBlockId={focusBlockId}
                            onFocusHandled={handleFocusHandled}
                            onAddBlock={handleAddBlock}
                        />
                    </Card>
                    </fieldset>

                    <DiscardChangesConfirmDialog
                        isOpen={confirmDiscardOpen}
                        onClose={() => setConfirmDiscardOpen(false)}
                        onDiscard={discardStory}
                    />
                </div>
            )}
        </PageGate>
    );
}
