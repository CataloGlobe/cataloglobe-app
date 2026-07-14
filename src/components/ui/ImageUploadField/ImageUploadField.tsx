import { useRef, useState } from "react";
import { ImagePlus, RefreshCw } from "lucide-react";
import { InputBase } from "@components/ui/Input/InputBase";
import { Button } from "@components/ui/Button/Button";
import Text from "@components/ui/Text/Text";
import styles from "./ImageUploadField.module.scss";

export type ImageUploadThumbShape = "wide" | "square";

export interface ImageUploadFieldProps {
    label?: string;
    helperText?: string;
    required?: boolean;
    disabled?: boolean;

    /**
     * URL dell'immagine da mostrare (objectURL del file pendente o URL salvato).
     * null → stato vuoto (dropzone compatto).
     */
    imageUrl: string | null;
    /** File pendente non ancora salvato — usato per mostrare nome + dimensione. */
    pendingFile?: File | null;

    /** Selezione di un nuovo file (mai null: la rimozione passa da onRemove). */
    onFileChange: (file: File) => void;
    /**
     * Rimozione dell'immagine corrente. Presentazionale: il parent marca la
     * rimozione come modifica PENDENTE (draft) — nessuna delete immediata.
     * Se omesso, il bottone "Rimuovi" non viene renderizzato.
     */
    onRemove?: () => void;

    /** wide = 96×64 (copertine), square = 64×64 (immagini blocco). Default wide. */
    thumbShape?: ImageUploadThumbShape;
    accept?: string;
    maxSizeMb?: number;
}

function formatFileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Controllo upload immagine compatto — variante controlled/presentazionale.
 * Stato vuoto: dropzone compatto. Stato pieno: miniatura, con meta (nome +
 * dimensione) SOLO per un file pendente appena scelto — un'immagine già
 * salvata ha per nome l'UUID di storage, rumore illeggibile per l'utente:
 * nessuna riga meta in quel caso, la miniatura basta a confermare. Azioni
 * RAGGRUPPATE sotto — "Sostituisci" (bottone secondary, bersaglio frequente)
 * + "Rimuovi" (testo defilato, distruttivo/raro). Nessun overlay-hover,
 * nessuna icona-only: touch-friendly. Non esegue upload né delete: il
 * parent possiede il draft e persiste al Salva (pattern draft-inline).
 * Compone InputBase (stesso primitive di FileInput).
 */
export function ImageUploadField({
    label,
    helperText,
    required,
    disabled,
    imageUrl,
    pendingFile,
    onFileChange,
    onRemove,
    thumbShape = "wide",
    accept = "image/*",
    maxSizeMb = 5
}: ImageUploadFieldProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [sizeError, setSizeError] = useState<string | null>(null);

    const openDialog = () => {
        if (disabled || !inputRef.current) return;
        inputRef.current.value = "";
        inputRef.current.click();
    };

    const handleFile = (file?: File) => {
        if (!file) return;
        if (maxSizeMb && file.size > maxSizeMb * 1024 * 1024) {
            setSizeError(`File troppo grande. Massimo ${maxSizeMb}MB.`);
            return;
        }
        setSizeError(null);
        onFileChange(file);
    };

    return (
        <InputBase
            label={label}
            helperText={helperText}
            error={sizeError ?? undefined}
            required={required}
            disabled={disabled}
        >
            {({ inputId, describedById, isDisabled }) => (
                <>
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
                        <div className={`${styles.filled} ${isDisabled ? styles.disabled : ""}`}>
                            <div className={styles.filledRow}>
                                <img
                                    src={imageUrl}
                                    alt="Anteprima immagine"
                                    className={`${styles.thumb} ${
                                        thumbShape === "square" ? styles.thumbSquare : styles.thumbWide
                                    }`}
                                />

                                {pendingFile && (
                                    <div className={styles.meta}>
                                        <Text as="span" variant="body-sm" className={styles.fileName}>
                                            {pendingFile.name}
                                        </Text>
                                        <Text as="span" variant="body-sm" colorVariant="muted">
                                            {formatFileSize(pendingFile.size)} · non salvato
                                        </Text>
                                    </div>
                                )}
                            </div>

                            <div className={styles.actions}>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    leftIcon={<RefreshCw size={14} />}
                                    className={styles.replaceBtn}
                                    onClick={openDialog}
                                    disabled={isDisabled}
                                >
                                    Sostituisci
                                </Button>
                                {onRemove && (
                                    <button
                                        type="button"
                                        className={styles.removeBtn}
                                        onClick={onRemove}
                                        disabled={isDisabled}
                                    >
                                        Rimuovi
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div
                            className={`${styles.dropzone} ${isDisabled ? styles.disabled : ""}`}
                            role="button"
                            tabIndex={isDisabled ? -1 : 0}
                            onClick={openDialog}
                            onKeyDown={e => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    openDialog();
                                }
                            }}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => {
                                e.preventDefault();
                                if (!isDisabled) handleFile(e.dataTransfer.files?.[0]);
                            }}
                        >
                            <ImagePlus size={18} aria-hidden="true" />
                            <Text as="span" variant="body-sm">
                                Clicca o trascina un&apos;immagine
                            </Text>
                        </div>
                    )}
                </>
            )}
        </InputBase>
    );
}
