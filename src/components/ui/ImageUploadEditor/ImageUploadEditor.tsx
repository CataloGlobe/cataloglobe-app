import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Trash2, X, Check, RefreshCw, ImagePlus } from "lucide-react";
import { SystemDrawer } from "@components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@components/ui/Button/Button";
import Text from "@components/ui/Text/Text";
import { ImageUploadField } from "@components/ui/ImageUploadField/ImageUploadField";
import { ImageReframeEditor } from "@components/ui/ImageReframeEditor";
import { FramedMedia } from "@components/ui/FramedMedia";
import {
    FRAMING_DEFAULTS,
    type MediaFraming,
    type MediaFillMode
} from "@components/ui/ImageReframeEditor/types";
import {
    compressImageWithMeta,
    CompressionError,
    type CompressOptions
} from "@/utils/compressImage";
import { appendCacheBuster } from "@/services/supabase/upload";
import { deriveCompressProfile, resolveShowFillPanel } from "./imageUploadPresets";
import { bakeFramedImage, type BakeOptions } from "./bakeFraming";
import styles from "./ImageUploadEditor.module.scss";

/** Formati sempre accettati dal wrapper — include WEBP ovunque. */
const DEFAULT_ACCEPTED_FORMATS = ["image/png", "image/jpeg", "image/webp"];
const DEFAULT_MAX_SIZE_MB = 10; // limite REALE (compressImage), non i 5MB cosmetici.
const DEFAULT_FILL_MODES: MediaFillMode[] = ["blur", "dominant", "color", "none"];
const DEFAULT_DRAWER_WIDTH = 420; // sm

/** Etichette accessibili uniformi (nessuna variazione per contesto). */
const EDIT_LABEL = "Modifica";
const REMOVE_LABEL = "Rimuovi immagine";

/**
 * Risultato di conferma. Stessa shape di `MediaFraming` prodotta oggi da
 * Featured/Stories (contratto invariato). `file` è null quando si ri-inquadra
 * un'immagine remota esistente senza cambiare file (solo update framing).
 * `url` è valorizzato solo se è stato passato `onUpload` (già cache-busted).
 */
export interface ImageUploadEditorResult {
    /**
     * File da caricare; null = solo ri-inquadratura (no re-upload). In modalità
     * `bake`, è l'immagine GIÀ ritagliata (crop applicato ai pixel).
     */
    file: File | null;
    /** URL finale cache-busted — presente solo se `onUpload` è stato fornito. */
    url?: string;
    /**
     * Framing canonico (camelCase), identico a Featured/Stories. In modalità
     * `bake` il crop è già applicato al file: questo resta a scopo informativo,
     * il chiamante non deve persisterlo.
     */
    framing: MediaFraming;
    /**
     * Ratio dell'immagine risultante. In `bake` è il ratio target (output già
     * ritagliato); altrimenti il ratio naturale del sorgente. Null se ignoto.
     */
    aspectRatio: number | null;
}

export interface ImageUploadEditorProps {
    /** Ratio del riquadro di inquadratura (w/h). Es. 1, 16/9, 4/5. */
    aspectRatio: number;
    /**
     * Modalità fill ammesse. In questa fase governa solo la visibilità del
     * pannello (tutto-o-niente): `ImageReframeEditor` non filtra per modalità.
     */
    backgroundFillModes?: MediaFillMode[];
    /** Limite dimensione file in MB. Default 10 (limite reale). */
    maxSizeMB?: number;
    /** MIME accettati. Default PNG/JPEG/WEBP (WEBP sempre incluso). */
    acceptedFormats?: string[];
    /**
     * Profilo di compressione esplicito. Se assente, derivato da `aspectRatio`
     * via `deriveCompressProfile` (usa `compressLongEdge`).
     */
    compress?: CompressOptions;
    /** Lato lungo target per il profilo derivato. Default 1280. */
    compressLongEdge?: number;
    /**
     * Se presente, al conferma il framing viene applicato ai pixel (canvas) e il
     * risultato è un unico file GIÀ ritagliato al ratio target — nessun framing
     * metadata da persistere. `aspectRatio` è il ratio del frame. Omettere per il
     * percorso "framing metadata + FramedMedia" (default, es. Prodotto).
     */
    bake?: Omit<BakeOptions, "aspectRatio">;

    // --- Presentazione (FASE 11) -------------------------------------------
    /**
     * `"field"` (default): campo completo con header (label + icone
     * Modifica/Rimuovi) e anteprima; l'editing avviene SEMPRE in un
     * `SystemDrawer`. `"embedded"`: solo dropzone → editor inline, per host che
     * gestiscono un flusso proprio (es. Gallery "Aggiungi foto"): niente header,
     * niente drawer interno, niente anteprima-di-esistente.
     */
    variant?: "field" | "embedded";
    /** Etichetta del campo mostrata nell'header (variant `field`). */
    fieldLabel?: string;
    /** Titolo del `SystemDrawer` di editing (variant `field`). */
    drawerTitle?: string;
    /** Larghezza del drawer di editing. Default 420 (sm). */
    drawerWidth?: number;
    /**
     * Se true, il click su "Rimuovi" chiede conferma inline nell'header (chip
     * "Rimuovere? ✕ ✓") prima di invocare `onRemove`. Se false, rimozione
     * immediata. Default false. Vedi FASE 10 (Logo/Cover/Avatar = true).
     */
    requiresConfirm?: boolean;
    /**
     * Handler di rimozione. Se assente, l'icona cestino non viene renderizzata.
     * Il wrapper NON conosce la semantica (delete immediata vs flag bozza): la
     * decide il chiamante.
     */
    onRemove?: () => void | Promise<void>;
    /** Stato "rimozione in corso" (disabilita le azioni header). */
    removing?: boolean;

    // --- Contesto edit (immagine esistente) --------------------------------
    /** URL remoto dell'immagine corrente (contesto modifica). */
    initialSource?: string | null;
    /** Framing salvato dell'immagine corrente. Default: centered cover + blur. */
    initialFraming?: MediaFraming;
    /** Ratio naturale dell'immagine corrente. Null → path legacy cover. */
    initialAspectRatio?: number | null;

    /**
     * Upload delegato opzionale. Se fornito e c'è un nuovo file, il wrapper
     * carica e applica SEMPRE il cache-buster all'URL restituito, poi lo passa
     * in `result.url`. Se assente, il wrapper restituisce solo il File e
     * l'upload resta al chiamante.
     */
    onUpload?: (file: File) => Promise<string>;

    onConfirm: (result: ImageUploadEditorResult) => void | Promise<void>;
    onCancel?: () => void;
    className?: string;
}

type Stage = "select" | "edit";

/** Etichetta leggibile del ratio per l'header (null se non standard). */
function formatRatioLabel(ratio: number): string | null {
    const known: Array<[number, string]> = [
        [1, "1:1"],
        [16 / 9, "16:9"],
        [4 / 3, "4:3"],
        [3 / 2, "3:2"],
        [4 / 5, "4:5"],
        [9 / 16, "9:16"],
        [3 / 4, "3:4"]
    ];
    for (const [r, label] of known) {
        if (Math.abs(ratio - r) < 0.01) return label;
    }
    return null;
}

/**
 * Campo upload + framing unificato (FASE 11). Compone i building block esistenti
 * (`ImageUploadField` → `compressImageWithMeta` → `ImageReframeEditor` → bake/
 * `FramedMedia`) e possiede l'INTERO campo: header con 2 icone, anteprima,
 * housing dell'editor in un `SystemDrawer`, rimozione con eventuale conferma
 * inline. Il motore di reframe/zoom/background-fill/bake NON è modificato: è solo
 * riposizionato dentro il drawer. Contratto dati invariato: `MediaFraming`.
 */
export function ImageUploadEditor({
    aspectRatio,
    backgroundFillModes = DEFAULT_FILL_MODES,
    maxSizeMB = DEFAULT_MAX_SIZE_MB,
    acceptedFormats = DEFAULT_ACCEPTED_FORMATS,
    compress,
    compressLongEdge = 1280,
    bake,
    variant = "field",
    fieldLabel,
    drawerTitle,
    drawerWidth = DEFAULT_DRAWER_WIDTH,
    requiresConfirm = false,
    onRemove,
    removing = false,
    initialSource = null,
    initialFraming,
    initialAspectRatio = null,
    onUpload,
    onConfirm,
    onCancel,
    className
}: ImageUploadEditorProps) {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [stage, setStage] = useState<Stage>("select");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmingRemove, setConfirmingRemove] = useState(false);

    // Sorgente mostrata nell'editor: object URL locale (nuovo file) o URL remoto.
    const [editSource, setEditSource] = useState<string | null>(null);
    // File compresso pendente; null quando si ri-inquadra il remoto esistente.
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    // Ratio naturale: nuovo file → dal compress; ri-inquadra → initialAspectRatio.
    const [pendingAspectRatio, setPendingAspectRatio] = useState<number | null>(null);
    const [framing, setFraming] = useState<MediaFraming>(initialFraming ?? FRAMING_DEFAULTS);

    const replaceInputRef = useRef<HTMLInputElement>(null);

    // Object URL vivo da revocare (solo per file locali).
    const objectUrlRef = useRef<string | null>(null);
    const revokeObjectUrl = useCallback(() => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
    }, []);
    useEffect(() => revokeObjectUrl, [revokeObjectUrl]);

    const showFillPanel = resolveShowFillPanel(backgroundFillModes);
    const resolvedCompress: CompressOptions =
        compress ?? deriveCompressProfile(aspectRatio, { longEdge: compressLongEdge });

    const isField = variant === "field";
    const hasImage = isField && initialSource != null;
    const ratioLabel = formatRatioLabel(aspectRatio);

    const resetEditState = useCallback(() => {
        revokeObjectUrl();
        setEditSource(null);
        setPendingFile(null);
        setPendingAspectRatio(null);
        setStage("select");
        setError(null);
    }, [revokeObjectUrl]);

    // Compressione + entrata in stage edit (nuovo file: da dropzone o "Sostituisci").
    const handleFile = useCallback(
        async (file: File) => {
            setError(null);
            if (!acceptedFormats.includes(file.type)) {
                setError("Formato non supportato. Usa PNG, JPG o WEBP.");
                return;
            }
            try {
                setBusy(true);
                const { file: compressed, naturalWidth, naturalHeight } =
                    await compressImageWithMeta(file, resolvedCompress, undefined, maxSizeMB * 1024 * 1024);
                revokeObjectUrl();
                const objectUrl = URL.createObjectURL(compressed);
                objectUrlRef.current = objectUrl;
                setPendingFile(compressed);
                setPendingAspectRatio(naturalHeight > 0 ? naturalWidth / naturalHeight : null);
                setFraming(FRAMING_DEFAULTS); // nuovo file → framing di default
                setEditSource(objectUrl);
                setStage("edit");
            } catch (err) {
                const msg =
                    err instanceof CompressionError
                        ? err.message
                        : "Errore durante l'elaborazione dell'immagine.";
                setError(msg);
            } finally {
                setBusy(false);
            }
        },
        [acceptedFormats, resolvedCompress, maxSizeMB, revokeObjectUrl]
    );

    // Apertura drawer (variant field): immagine esistente → edit sul remoto;
    // nessuna immagine → select (dropzone dentro il drawer).
    const openDrawer = useCallback(() => {
        setError(null);
        if (hasImage && initialSource) {
            setPendingFile(null);
            setPendingAspectRatio(initialAspectRatio);
            setFraming(initialFraming ?? FRAMING_DEFAULTS);
            setEditSource(initialSource);
            setStage("edit");
        } else {
            resetEditState();
        }
        setDrawerOpen(true);
    }, [hasImage, initialSource, initialAspectRatio, initialFraming, resetEditState]);

    // Drop diretto sul campo vuoto: apre il drawer e carica subito il file.
    const openDrawerWithFile = useCallback(
        (file: File) => {
            setDrawerOpen(true);
            void handleFile(file);
        },
        [handleFile]
    );

    const triggerReplace = useCallback(() => {
        if (busy) return;
        replaceInputRef.current?.click();
    }, [busy]);

    const handleConfirm = useCallback(async () => {
        try {
            setBusy(true);

            // In modalità bake: applica il framing ai pixel → un solo file già
            // ritagliato. Altrimenti passa il file compresso + framing metadata.
            let outFile = pendingFile;
            let outAspectRatio = pendingAspectRatio;
            if (bake && editSource) {
                outFile = await bakeFramedImage(editSource, framing, { ...bake, aspectRatio });
                outAspectRatio = aspectRatio;
            }

            let url: string | undefined;
            if (outFile && onUpload) {
                url = appendCacheBuster(await onUpload(outFile));
            }
            await onConfirm({ file: outFile, url, framing, aspectRatio: outAspectRatio });
            resetEditState();
            setDrawerOpen(false);
        } catch {
            setError("Errore durante il salvataggio dell'immagine.");
        } finally {
            setBusy(false);
        }
    }, [
        pendingFile,
        pendingAspectRatio,
        bake,
        editSource,
        framing,
        aspectRatio,
        onUpload,
        onConfirm,
        resetEditState
    ]);

    const handleCancel = useCallback(() => {
        resetEditState();
        setDrawerOpen(false);
        onCancel?.();
    }, [resetEditState, onCancel]);

    // --- Rimozione (header) -------------------------------------------------
    const handleRemoveClick = useCallback(() => {
        if (!onRemove) return;
        if (requiresConfirm) {
            setConfirmingRemove(true);
        } else {
            void onRemove();
        }
    }, [onRemove, requiresConfirm]);

    const confirmRemove = useCallback(() => {
        setConfirmingRemove(false);
        void onRemove?.();
    }, [onRemove]);

    // Editor riusato dentro il drawer (field) o inline (embedded).
    const editStage = (
        <div className={styles.editStack}>
            <div className={styles.replaceRow}>
                <input
                    ref={replaceInputRef}
                    type="file"
                    accept={acceptedFormats.join(",")}
                    className={styles.hiddenInput}
                    onChange={e => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void handleFile(f);
                    }}
                />
                <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    leftIcon={<RefreshCw size={14} />}
                    onClick={triggerReplace}
                    disabled={busy}
                >
                    Sostituisci foto
                </Button>
            </div>

            {editSource && (
                <ImageReframeEditor
                    source={editSource}
                    value={framing}
                    onChange={setFraming}
                    aspectRatio={aspectRatio}
                    showFillPanel={showFillPanel}
                />
            )}

            {error && (
                <Text variant="body-sm" colorVariant="error">
                    {error}
                </Text>
            )}
        </div>
    );

    const selectStage = (
        <>
            <ImageUploadField
                imageUrl={null}
                onFileChange={handleFile}
                accept={acceptedFormats.join(",")}
                maxSizeMb={maxSizeMB}
                thumbShape={aspectRatio >= 1 ? "wide" : "square"}
            />
            {error && (
                <Text variant="body-sm" colorVariant="error">
                    {error}
                </Text>
            )}
        </>
    );

    // --- Variant embedded: solo dropzone → editor inline (flusso host) ------
    if (!isField) {
        return (
            <div className={`${styles.editor} ${className ?? ""}`}>
                {stage === "edit" && editSource ? (
                    <>
                        {editStage}
                        <div className={styles.inlineActions}>
                            <Button variant="secondary" onClick={handleCancel} disabled={busy}>
                                Annulla
                            </Button>
                            <Button variant="primary" onClick={handleConfirm} loading={busy}>
                                Conferma
                            </Button>
                        </div>
                    </>
                ) : (
                    selectStage
                )}
            </div>
        );
    }

    // --- Variant field: header a 2 icone + anteprima + drawer di editing ----
    return (
        <div className={`${styles.field} ${className ?? ""}`}>
            <div className={styles.fieldHeader}>
                <div className={styles.fieldLabelWrap}>
                    {fieldLabel && (
                        <Text as="span" variant="body-sm" weight={600}>
                            {fieldLabel}
                        </Text>
                    )}
                    {ratioLabel && <span className={styles.ratioChip}>{ratioLabel}</span>}
                </div>

                {hasImage && !confirmingRemove && (
                    <div className={styles.headerActions}>
                        <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={openDrawer}
                            disabled={removing}
                            title={EDIT_LABEL}
                            aria-label={EDIT_LABEL}
                        >
                            <Pencil size={16} />
                        </button>
                        {onRemove && (
                            <button
                                type="button"
                                className={styles.iconBtn}
                                onClick={handleRemoveClick}
                                disabled={removing}
                                title={REMOVE_LABEL}
                                aria-label={REMOVE_LABEL}
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                )}

                {hasImage && confirmingRemove && (
                    <div className={styles.confirmChip}>
                        <span className={styles.confirmChipText}>Rimuovere?</span>
                        <button
                            type="button"
                            className={styles.confirmChipBtn}
                            onClick={() => setConfirmingRemove(false)}
                            disabled={removing}
                            aria-label="Annulla"
                            title="Annulla"
                        >
                            <X size={15} />
                        </button>
                        <button
                            type="button"
                            className={`${styles.confirmChipBtn} ${styles.confirmChipDanger}`}
                            onClick={confirmRemove}
                            disabled={removing}
                            aria-label="Conferma rimozione"
                            title="Conferma rimozione"
                        >
                            <Check size={15} />
                        </button>
                    </div>
                )}
            </div>

            <div className={styles.fieldBody}>
                <div className={styles.previewBox} style={{ aspectRatio: String(aspectRatio) }}>
                    {hasImage && initialSource ? (
                        <FramedMedia
                            source={initialSource}
                            framing={initialFraming ?? FRAMING_DEFAULTS}
                            aspectRatio={initialAspectRatio}
                            frameRatio={aspectRatio}
                            alt={fieldLabel ? `Anteprima ${fieldLabel}` : "Anteprima immagine"}
                        />
                    ) : (
                        <div
                            className={styles.dropzone}
                            role="button"
                            tabIndex={0}
                            onClick={openDrawer}
                            onKeyDown={e => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    openDrawer();
                                }
                            }}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => {
                                e.preventDefault();
                                const f = e.dataTransfer.files?.[0];
                                if (f) openDrawerWithFile(f);
                            }}
                        >
                            <ImagePlus size={20} aria-hidden="true" />
                            <Text as="span" variant="body-sm">
                                Clicca o trascina un&apos;immagine
                            </Text>
                        </div>
                    )}
                </div>
            </div>

            <SystemDrawer open={drawerOpen} onClose={handleCancel} width={drawerWidth}>
                <DrawerLayout
                    header={
                        <Text as="span" variant="title-sm">
                            {drawerTitle ?? "Modifica immagine"}
                        </Text>
                    }
                    footer={
                        <div className={styles.drawerFooter}>
                            <Button variant="secondary" onClick={handleCancel} disabled={busy}>
                                Annulla
                            </Button>
                            {stage === "edit" && editSource && (
                                <Button variant="primary" onClick={handleConfirm} loading={busy}>
                                    Conferma
                                </Button>
                            )}
                        </div>
                    }
                >
                    <div className={styles.drawerBody}>
                        {stage === "edit" && editSource ? editStage : selectStage}
                    </div>
                </DrawerLayout>
            </SystemDrawer>
        </div>
    );
}
