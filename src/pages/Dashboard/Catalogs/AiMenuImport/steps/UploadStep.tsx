import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, X, FileText, Plus, Sparkles, AlertTriangle } from "lucide-react";
import styles from "../aiMenuImport.module.scss";

interface UploadStepProps {
    files: File[];
    onFilesChange: (files: File[]) => void;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

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
            const rejected = all.filter(f => !ACCEPTED_TYPES.includes(f.type));
            if (rejected.length > 0) {
                setFileWarning("Formati supportati: JPG, PNG, PDF");
            }

            const accepted = all.filter(f => ACCEPTED_TYPES.includes(f.type));

            // Check file size
            const tooLarge = accepted.filter(f => f.size > MAX_FILE_SIZE);
            if (tooLarge.length > 0) {
                const names = tooLarge.map(f => f.name).join(", ");
                setFileWarning(`File troppo grande (max 10MB): ${names}`);
            }

            const valid = accepted.filter(f => f.size <= MAX_FILE_SIZE);
            if (valid.length === 0) return;

            const combined = [...files, ...valid].slice(0, MAX_FILES);
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
                accept="image/jpeg,image/png,application/pdf"
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
                accept="image/jpeg,image/png,application/pdf"
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
