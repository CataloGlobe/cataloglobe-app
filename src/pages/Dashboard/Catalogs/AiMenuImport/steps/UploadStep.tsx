import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, X, FileText, Plus, Sparkles, AlertTriangle } from "lucide-react";
import styles from "../aiMenuImport.module.scss";
import { partitionBySizeBudget } from "../sizeBudget";
import { IMPORT_MIME_TYPES } from "../aiImportFormats";

interface UploadStepProps {
    files: File[];
    onFilesChange: (files: File[]) => void;
}

const MAX_FILES = 5;

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadStep({ files, onFilesChange }: UploadStepProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const addInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [fileWarning, setFileWarning] = useState<string | null>(null);

    // Auto-clear warning after 5s
    useEffect(() => {
        if (!fileWarning) return;
        const t = setTimeout(() => setFileWarning(null), 5000);
        return () => clearTimeout(t);
    }, [fileWarning]);

    const addFiles = useCallback(
        (newFiles: FileList | File[]) => {
            const all = Array.from(newFiles);

            // Check unsupported types
            const rejected = all.filter(f => !IMPORT_MIME_TYPES.includes(f.type));
            if (rejected.length > 0) {
                setFileWarning("Formati supportati: JPG, PNG, WebP, PDF");
            }

            const accepted = all.filter(f => IMPORT_MIME_TYPES.includes(f.type));

            // Partizionamento per cap (per-tipo 25/20 MB + aggregato 30 MB) via
            // helper puro. I warning derivano dalle rejection, con la stessa
            // precedenza della logica inline precedente: per-file (immagine prima
            // di PDF) e poi aggregato che sovrascrive.
            const { accepted: withinBudget, rejected: sizeRejected } = partitionBySizeBudget(files, accepted);

            const imageRejects = sizeRejected.filter(r => r.reason === "image_too_large").map(r => r.file);
            const pdfRejects = sizeRejected.filter(r => r.reason === "pdf_too_large").map(r => r.file);
            const aggregateRejects = sizeRejected
                .filter(r => r.reason === "aggregate_exceeded")
                .map(r => r.file);

            if (imageRejects.length > 0) {
                const names = imageRejects.map(f => f.name).join(", ");
                setFileWarning(`Immagine troppo grande (max 25 MB): ${names}`);
            } else if (pdfRejects.length > 0) {
                const names = pdfRejects.map(f => f.name).join(", ");
                setFileWarning(`PDF troppo grande (max 20 MB): ${names}`);
            }
            if (aggregateRejects.length > 0) {
                const names = aggregateRejects.map(f => `«${f.name}»`).join(", ");
                const single = aggregateRejects.length === 1;
                setFileWarning(
                    `${names} super${single ? "a" : "ano"} il limite totale di 30 MB e ` +
                        `non ${single ? "è stato aggiunto" : "sono stati aggiunti"}.`
                );
            }
            if (withinBudget.length === 0) return;

            // Lo slice scarta i file oltre MAX_FILES: avvisa invece di troncare in
            // silenzio. Niente reset dei file gia' validi: ne accettiamo fino al cap.
            const combined = [...files, ...withinBudget].slice(0, MAX_FILES);
            if (files.length + withinBudget.length > MAX_FILES) {
                setFileWarning(
                    `Puoi caricare al massimo ${MAX_FILES} file: i file in eccesso non sono stati aggiunti.`
                );
            }
            onFilesChange(combined);
        },
        [files, onFilesChange]
    );

    const removeFile = useCallback(
        (index: number) => {
            onFilesChange(files.filter((_, i) => i !== index));
        },
        [files, onFilesChange]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files.length > 0) {
                addFiles(e.dataTransfer.files);
            }
        },
        [addFiles]
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const hasFiles = files.length > 0;
    const canAddMore = files.length < MAX_FILES;

    return (
        <div className={styles.uploadContainer}>
            <div className={styles.uploadHeader}>
                <div className={styles.uploadTitle}>Carica il tuo menù</div>
                <div className={styles.uploadSubtitle}>
                    Carica foto o PDF del menù e l'intelligenza artificiale estrarrà automaticamente
                    prodotti, prezzi e categorie.
                </div>
            </div>

            {!hasFiles ? (
                /* Empty dropzone */
                <div
                    className={`${styles.dropzone} ${isDragOver ? styles.dropzoneDragging : ""}`}
                    onClick={() => inputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                >
                    <div className={styles.dropzoneIconBox}>
                        <Upload size={24} />
                    </div>
                    <span className={styles.dropzoneText}>Trascina qui le foto del menù</span>
                    <span className={styles.dropzoneClickHint}>
                        oppure <span className={styles.accentLink}>clicca per selezionare</span>
                    </span>
                    <div className={styles.dropzoneBadges}>
                        <span className={styles.dropzoneBadge}>JPG</span>
                        <span className={styles.dropzoneBadge}>PNG</span>
                        <span className={styles.dropzoneBadge}>WebP</span>
                        <span className={styles.dropzoneBadge}>PDF</span>
                        <span className={styles.dropzoneBadge}>max {MAX_FILES} file</span>
                    </div>
                </div>
            ) : (
                /* Thumbnail grid */
                <div
                    className={styles.thumbnailGrid}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                >
                    {files.map((file, i) => (
                        <ThumbnailCard
                            key={`${file.name}-${i}`}
                            file={file}
                            onRemove={() => removeFile(i)}
                        />
                    ))}
                    {canAddMore && (
                        <button
                            type="button"
                            className={styles.thumbnailAdd}
                            onClick={() => addInputRef.current?.click()}
                        >
                            <Plus size={20} />
                            Aggiungi
                        </button>
                    )}
                </div>
            )}

            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
                style={{ display: "none" }}
                onChange={e => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                }}
            />
            <input
                ref={addInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
                style={{ display: "none" }}
                onChange={e => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                }}
            />

            {fileWarning && (
                <div className={styles.fileWarning}>
                    <AlertTriangle size={14} />
                    <span>{fileWarning}</span>
                </div>
            )}

            <div className={styles.infoBox}>
                <div className={styles.infoBoxIcon}>
                    <Sparkles size={16} />
                </div>
                <div className={styles.infoBoxContent}>
                    <div className={styles.infoBoxTitle}>Come funziona</div>
                    <div className={styles.infoBoxText}>
                        L'AI analizza le immagini del tuo menù, identifica i prodotti con nomi,
                        descrizioni e prezzi, e li organizza in categorie. Potrai revisionare
                        tutto prima dell'importazione.
                    </div>
                </div>
            </div>
        </div>
    );
}

function ThumbnailCard({ file, onRemove }: { file: File; onRemove: () => void }) {
    const isImage = file.type.startsWith("image/");
    const [thumb] = useState(() => (isImage ? URL.createObjectURL(file) : null));

    return (
        <div className={styles.thumbnail}>
            {thumb ? (
                <img src={thumb} alt={file.name} className={styles.thumbnailImg} />
            ) : (
                <div className={styles.thumbnailPdf}>
                    <FileText size={28} />
                </div>
            )}
            <div className={styles.thumbnailInfo}>
                <span className={styles.thumbnailName}>{file.name}</span>
                <span className={styles.thumbnailSize}>{formatSize(file.size)}</span>
            </div>
            <button type="button" className={styles.thumbnailRemove} onClick={onRemove}>
                <X size={12} />
            </button>
        </div>
    );
}
