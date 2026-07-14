import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui/Button/Button";
import { ImageUploadField } from "@/components/ui/ImageUploadField/ImageUploadField";
import { FramedMedia } from "@/components/ui/FramedMedia";
import {
    frameToRatio,
    FRAMING_DEFAULTS,
    type MediaFrame,
    type MediaFraming
} from "@/components/ui/ImageReframeEditor/types";
import { StoryImageBlock } from "@/services/supabase/stories";
import { useToast } from "@/context/Toast/ToastContext";
import { StoryImageFramingDrawer } from "./StoryImageFramingDrawer";
import styles from "./ImageBlock.module.scss";

/**
 * Blocco immagine — presentazionale/controlled. Nella RIGA vive solo il contenuto
 * (anteprima già inquadrata nel formato reale + Didascalia); la PRESENTAZIONE
 * (formato, inquadratura, sostituzione) vive nel drawer. Riga a stato vuoto =
 * dropzone. L'ImageReframeEditor è montato solo nel drawer → il backfill di
 * `mediaAspectRatio` avviene su interazione, non sporca il draft all'apertura.
 *
 * File selezionato = PENDENTE (posseduto dal parent), caricato solo al Salva.
 * `mediaAspectRatio` (ratio naturale) scritto SEMPRE alla selezione.
 */
interface ImageBlockProps {
    block: StoryImageBlock;
    /** File pendente per questo blocco (posseduto dal parent). */
    pendingFile: File | null;
    onPendingFileChange: (file: File | null) => void;
    onChange: (next: StoryImageBlock) => void;
    disabled?: boolean;
}

const MAX_SIZE_MB = 5;

/** Legge il ratio naturale (w/h) di un'immagine da URL. null se non caricabile. */
function readImageRatio(src: string): Promise<number | null> {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

export function ImageBlock({ block, pendingFile, onPendingFileChange, onChange, disabled }: ImageBlockProps) {
    const { showToast } = useToast();
    const [framingOpen, setFramingOpen] = useState(false);

    // objectURL del file pendente — posseduto qui, revocato su cambio/unmount.
    const pendingPreview = useMemo(
        () => (pendingFile ? URL.createObjectURL(pendingFile) : null),
        [pendingFile]
    );
    useEffect(() => {
        return () => {
            if (pendingPreview) URL.revokeObjectURL(pendingPreview);
        };
    }, [pendingPreview]);

    const imageUrl = pendingPreview ?? (block.url || null);
    const frame: MediaFrame = block.frame ?? "3:2";
    const framing: MediaFraming = block.framing ?? FRAMING_DEFAULTS;

    // Selezione file (dropzone o Sostituisci nel drawer): valida size, legge il
    // ratio naturale, bubbla il file grezzo al parent e scrive ratio + framing
    // neutro. Il formato scelto resta invariato.
    const acceptFile = useCallback(
        async (file: File) => {
            if (file.size > MAX_SIZE_MB * 1024 * 1024) {
                showToast({ type: "error", message: `File troppo grande. Massimo ${MAX_SIZE_MB}MB.` });
                return;
            }
            const url = URL.createObjectURL(file);
            const ratio = await readImageRatio(url);
            URL.revokeObjectURL(url);
            if (ratio == null) {
                showToast({ type: "error", message: "Immagine non valida o corrotta." });
                return;
            }
            onPendingFileChange(file);
            onChange({ ...block, mediaAspectRatio: ratio, framing: FRAMING_DEFAULTS });
        },
        [block, onChange, onPendingFileChange, showToast]
    );

    // Conferma dal drawer: committa formato + framing (pin fillMode "blur") e
    // garantisce mediaAspectRatio anche per immagini legacy remote (mai un
    // framing senza ratio → trappola featured).
    const applyDraft = useCallback(
        async (nextFrame: MediaFrame, nextFraming: MediaFraming) => {
            const pinned: MediaFraming = { ...nextFraming, fillMode: "blur", fillColor: null };
            let ratio = block.mediaAspectRatio;
            if (ratio == null && imageUrl) {
                ratio = (await readImageRatio(imageUrl)) ?? undefined;
            }
            if (ratio == null) {
                showToast({ type: "error", message: "Immagine non valida o corrotta." });
                return;
            }
            onChange({ ...block, frame: nextFrame, framing: pinned, mediaAspectRatio: ratio });
        },
        [block, imageUrl, onChange, showToast]
    );

    return (
        <div className={styles.root}>
            {imageUrl ? (
                <div className={styles.previewRow}>
                    <div className={styles.previewBox} data-frame={frame}>
                        <FramedMedia
                            source={imageUrl}
                            framing={framing}
                            aspectRatio={block.mediaAspectRatio ?? null}
                            frameRatio={frameToRatio(frame)}
                            alt={block.caption ?? ""}
                        />
                    </div>
                    {!disabled && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            leftIcon={<Pencil size={14} />}
                            onClick={() => setFramingOpen(true)}
                        >
                            Modifica
                        </Button>
                    )}
                </div>
            ) : (
                <ImageUploadField
                    label="Immagine"
                    imageUrl={null}
                    onFileChange={f => void acceptFile(f)}
                    accept="image/*"
                    maxSizeMb={MAX_SIZE_MB}
                    disabled={disabled}
                />
            )}

            <TextInput
                label="Didascalia (opzionale)"
                value={block.caption ?? ""}
                onChange={e => onChange({ ...block, caption: e.target.value })}
                disabled={disabled}
            />

            {imageUrl && (
                <StoryImageFramingDrawer
                    open={framingOpen}
                    onClose={() => setFramingOpen(false)}
                    source={imageUrl}
                    frame={frame}
                    framing={framing}
                    onReplace={f => void acceptFile(f)}
                    onConfirm={(nextFrame, nextFraming) => void applyDraft(nextFrame, nextFraming)}
                />
            )}
        </div>
    );
}
