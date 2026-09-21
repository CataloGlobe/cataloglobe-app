import { useRef, useState, type DragEvent } from "react";
import { Crop, ImagePlus, RefreshCw } from "lucide-react";
import { InputBase } from "@components/ui/Input/InputBase";
import { Button } from "@components/ui/Button/Button";
import Text from "@components/ui/Text/Text";
import { ProgressBar } from "@components/ui/ProgressBar/ProgressBar";
import { FramedMedia } from "@components/ui/FramedMedia/FramedMedia";
import { FRAMING_DEFAULTS, type MediaFraming } from "@components/ui/ImageReframeEditor/types";
import styles from "./ImageUploadField.module.scss";

/**
 * ImageUploadField — un'immagine da caricare: logo, foto della sede,
 * immagine del piatto (design system §5, scheda ImageUploadField).
 *
 * Label · zona tratteggiata (icona 24 · «Trascina qui o scegli un file» ·
 * vincoli in caption) · anteprima con FramedMedia quando c'è · azioni
 * «Sostituisci · Rimuovi» · «Inquadra» apre l'editor (lo apre il chiamante
 * via `onReframe`). Varianti square (logo, avatar) · wide 16:10 (sede,
 * storia) · product 4:3. Stati: vuoto · trascinamento (bordo brand, fondo
 * brand-soft) · caricamento (ProgressBar sotto la zona) · pronto · errore
 * (FormField error, la zona resta) · disabilitato.
 *
 * Non esegue upload né delete: il parent possiede il draft e persiste al
 * Salva. Non per più immagini, non per un file non immagine (→ Input file).
 */
export type ImageUploadVariant = "square" | "wide" | "product";
/** @deprecated Alias storico: `wide` = wide, `square` = square. Usa `variant`. */
export type ImageUploadThumbShape = "wide" | "square";

const RATIO: Record<ImageUploadVariant, number> = { square: 1, wide: 16 / 10, product: 4 / 3 };
const RATIO_LABEL: Record<ImageUploadVariant, string> = { square: "quadrata", wide: "16:10", product: "4:3" };

export interface ImageUploadFieldProps {
    label?: string;
    helperText?: string;
    required?: boolean;
    disabled?: boolean;
    /** Errore dal parent (formato, peso, upload fallito): la zona resta. */
    error?: string;

    /**
     * URL dell'immagine da mostrare (objectURL del file pendente o URL salvato).
     * null → stato vuoto.
     */
    imageUrl: string | null;
    /** File pendente non ancora salvato — nome + dimensione sotto l'anteprima. */
    pendingFile?: File | null;
    /** Inquadratura salvata; default centrata cover. */
    framing?: MediaFraming;

    /** Selezione di un nuovo file (mai null: la rimozione passa da onRemove). */
    onFileChange: (file: File) => void;
    /** Rimozione (presentazionale: il parent la marca come modifica pendente). Se omesso, niente «Rimuovi». */
    onRemove?: () => void;
    /** «Inquadra»: il parent apre ImageReframeEditor. Se omesso, niente bottone. */
    onReframe?: () => void;

    /** square (logo, avatar) · wide 16:10 (sede, storia) · product 4:3. Default wide. */
    variant?: ImageUploadVariant;
    /** @deprecated Usa `variant`. */
    thumbShape?: ImageUploadThumbShape;
    accept?: string;
    maxSizeMb?: number;
    /** Riga dei vincoli in caption; default da accept/maxSizeMb/variant. */
    constraints?: string;
    /** 0–100 durante l'upload: ProgressBar sotto la zona. null/undefined = fermo. */
    uploadProgress?: number | null;
}

function formatFileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatsFromAccept(accept: string): string {
    if (accept === "image/*") return "JPG, PNG o WebP";
    return accept
        .split(",")
        .map(a => a.trim().replace("image/", "").replace("jpeg", "jpg").toUpperCase())
        .filter(Boolean)
        .join(", ");
}

export function ImageUploadField({
    label,
    helperText,
    required,
    disabled,
    error,
    imageUrl,
    pendingFile,
    framing = FRAMING_DEFAULTS,
    onFileChange,
    onRemove,
    onReframe,
    variant,
    thumbShape,
    accept = "image/*",
    maxSizeMb = 5,
    constraints,
    uploadProgress
}: ImageUploadFieldProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [sizeError, setSizeError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const resolved: ImageUploadVariant = variant ?? thumbShape ?? "wide";
    const uploading = typeof uploadProgress === "number";

    const openDialog = () => {
        if (disabled || uploading || !inputRef.current) return;
        inputRef.current.value = "";
        inputRef.current.click();
    };

    const handleFile = (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setSizeError("Serve un'immagine.");
            return;
        }
        if (maxSizeMb && file.size > maxSizeMb * 1024 * 1024) {
            setSizeError(`File troppo grande. Massimo ${maxSizeMb} MB.`);
            return;
        }
        setSizeError(null);
        onFileChange(file);
    };

    const dragProps = (isDisabled: boolean) => ({
        onDragEnter: (e: DragEvent) => {
            e.preventDefault();
            if (!isDisabled && !uploading) setDragging(true);
        },
        onDragOver: (e: DragEvent) => {
            e.preventDefault();
        },
        onDragLeave: (e: DragEvent) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setDragging(false);
        },
        onDrop: (e: DragEvent) => {
            e.preventDefault();
            setDragging(false);
            if (!isDisabled && !uploading) handleFile(e.dataTransfer.files?.[0]);
        }
    });

    const constraintsText = constraints ?? `${formatsFromAccept(accept)} · max ${maxSizeMb} MB · ${RATIO_LABEL[resolved]}`;

    return (
        <InputBase label={label} helperText={helperText} error={error ?? sizeError ?? undefined} required={required} disabled={disabled}>
            {({ inputId, describedById, isDisabled }) => (
                <div className={`${styles.root} ${isDisabled ? styles.disabled : ""}`.trim()}>
                    <input
                        ref={inputRef}
                        id={inputId}
                        type="file"
                        accept={accept}
                        disabled={isDisabled}
                        aria-describedby={describedById}
                        className={styles.hiddenInput}
                        onChange={e => handleFile(e.target.files?.[0])}
                    />

                    {imageUrl ? (
                        <div className={styles.filled} {...dragProps(isDisabled)}>
                            <div className={`${styles.preview} ${styles[resolved]}`}>
                                <FramedMedia source={imageUrl} framing={framing} aspectRatio={null} alt="Anteprima immagine" frameRatio={RATIO[resolved]} eager />
                            </div>
                            <div className={styles.side}>
                                {pendingFile && (
                                    <div className={styles.meta}>
                                        <Text as="span" variant="body-sm" className={styles.fileName}>
                                            {pendingFile.name}
                                        </Text>
                                        <Text as="span" variant="caption" colorVariant="muted">
                                            {formatFileSize(pendingFile.size)} · non salvato
                                        </Text>
                                    </div>
                                )}
                                <div className={styles.actions}>
                                    <Button type="button" variant="secondary" size="sm" leftIcon={<RefreshCw size={14} />} onClick={openDialog} disabled={isDisabled || uploading}>
                                        Sostituisci
                                    </Button>
                                    {onReframe && (
                                        <Button type="button" variant="ghost" size="sm" leftIcon={<Crop size={14} />} onClick={onReframe} disabled={isDisabled || uploading}>
                                            Inquadra
                                        </Button>
                                    )}
                                    {onRemove && (
                                        <Button type="button" variant="ghost" size="sm" onClick={onRemove} disabled={isDisabled || uploading}>
                                            Rimuovi
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div
                            className={[styles.dropzone, dragging ? styles.dragging : ""].join(" ").trim()}
                            role="button"
                            tabIndex={isDisabled ? -1 : 0}
                            aria-disabled={isDisabled || undefined}
                            onClick={openDialog}
                            onKeyDown={e => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    openDialog();
                                }
                            }}
                            {...dragProps(isDisabled)}
                        >
                            <ImagePlus size={24} strokeWidth={1.5} aria-hidden="true" className={styles.dropIcon} />
                            <Text as="span" variant="body-sm" weight={500}>
                                Trascina qui o scegli un file
                            </Text>
                            <Text as="span" variant="caption" colorVariant="muted">
                                {constraintsText}
                            </Text>
                        </div>
                    )}

                    {uploading && (
                        <ProgressBar value={uploadProgress} max={100} label={`${Math.round(uploadProgress)} %`} aria-label="Caricamento dell'immagine" />
                    )}
                </div>
            )}
        </InputBase>
    );
}
