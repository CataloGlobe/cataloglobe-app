import { useCallback, useEffect, useRef, useState } from "react";
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
     * percorso "framing metadata + FramedMedia" (default).
     */
    bake?: Omit<BakeOptions, "aspectRatio">;

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
     * in `result.url` (fix incoerenza cache-buster segnalata in FASE 1). Se
     * assente, il wrapper restituisce solo il File e l'upload resta al chiamante.
     */
    onUpload?: (file: File) => Promise<string>;

    onConfirm: (result: ImageUploadEditorResult) => void | Promise<void>;
    onCancel?: () => void;
    className?: string;
}

type Stage = "select" | "edit";

/**
 * Wrapper generico upload + framing. Compone i building block esistenti
 * (`ImageUploadField` → `compressImageWithMeta` → `ImageReframeEditor`) in un
 * unico flusso parametrizzato per aspect ratio / fill / limiti. NON introduce
 * una nuova shape dati: `MediaFraming` resta il contratto condiviso con
 * Featured/Stories. Presentazionale: nessun drawer proprio, l'adottante lo
 * inserisce nel proprio contenitore (drawer o pagina).
 */
export function ImageUploadEditor({
    aspectRatio,
    backgroundFillModes = DEFAULT_FILL_MODES,
    maxSizeMB = DEFAULT_MAX_SIZE_MB,
    acceptedFormats = DEFAULT_ACCEPTED_FORMATS,
    compress,
    compressLongEdge = 1280,
    bake,
    initialSource = null,
    initialFraming,
    initialAspectRatio = null,
    onUpload,
    onConfirm,
    onCancel,
    className
}: ImageUploadEditorProps) {
    const [stage, setStage] = useState<Stage>("select");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // Sorgente mostrata nell'editor: object URL locale (nuovo file) o URL remoto.
    const [editSource, setEditSource] = useState<string | null>(null);
    // File compresso pendente; null quando si ri-inquadra il remoto esistente.
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    // Ratio naturale: nuovo file → dal compress; ri-inquadra → initialAspectRatio.
    const [pendingAspectRatio, setPendingAspectRatio] = useState<number | null>(null);
    const [framing, setFraming] = useState<MediaFraming>(initialFraming ?? FRAMING_DEFAULTS);

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

    const resetToSelect = useCallback(() => {
        revokeObjectUrl();
        setEditSource(null);
        setPendingFile(null);
        setPendingAspectRatio(null);
        setStage("select");
        setError(null);
    }, [revokeObjectUrl]);

    // SELECT → nuovo file: valida MIME → comprimi → object URL → editor.
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

    // Ri-inquadra l'immagine remota esistente senza re-upload.
    const handleReframeExisting = useCallback(() => {
        if (!initialSource) return;
        setPendingFile(null);
        setPendingAspectRatio(initialAspectRatio);
        setFraming(initialFraming ?? FRAMING_DEFAULTS);
        setEditSource(initialSource);
        setStage("edit");
        setError(null);
    }, [initialSource, initialAspectRatio, initialFraming]);

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
                // Cache-buster SEMPRE applicato qui (fix incoerenza FASE 1).
                url = appendCacheBuster(await onUpload(outFile));
            }
            await onConfirm({ file: outFile, url, framing, aspectRatio: outAspectRatio });
            resetToSelect();
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
        resetToSelect
    ]);

    const handleCancelEdit = useCallback(() => {
        resetToSelect();
        onCancel?.();
    }, [resetToSelect, onCancel]);

    return (
        <div className={`${styles.editor} ${className ?? ""}`}>
            {stage === "edit" && editSource ? (
                <>
                    <ImageReframeEditor
                        source={editSource}
                        value={framing}
                        onChange={setFraming}
                        aspectRatio={aspectRatio}
                        showFillPanel={showFillPanel}
                    />
                    {error && (
                        <Text variant="body-sm" colorVariant="error">
                            {error}
                        </Text>
                    )}
                    <div className={styles.actions}>
                        <Button variant="secondary" onClick={handleCancelEdit} disabled={busy}>
                            Annulla
                        </Button>
                        <Button variant="primary" onClick={handleConfirm} loading={busy}>
                            Conferma
                        </Button>
                    </div>
                </>
            ) : (
                <>
                    {initialSource && (
                        <>
                            <div
                                className={styles.preview}
                                style={{ aspectRatio: String(aspectRatio) }}
                            >
                                <FramedMedia
                                    source={initialSource}
                                    framing={initialFraming ?? FRAMING_DEFAULTS}
                                    aspectRatio={initialAspectRatio}
                                    frameRatio={aspectRatio}
                                    alt="Anteprima immagine"
                                />
                            </div>
                            <Button
                                variant="secondary"
                                onClick={handleReframeExisting}
                                disabled={busy}
                                fullWidth
                            >
                                Ri-inquadra
                            </Button>
                        </>
                    )}
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
            )}
        </div>
    );
}
