import React, { useEffect, useMemo, useRef, useState } from "react";
import { InputBase } from "./InputBase";
import Text from "@components/ui/Text/Text";
import styles from "./FileInput.module.scss";

export type FileInputPreviewMode = "auto" | "none" | "custom";

export interface FileInputProps {
    id?: string;
    label?: string;
    helperText?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;

    /**
     * Se passato → FileInput è controllato
     * Se NON passato → usa state interno (default)
     */
    value?: File | null;
    onChange?: (file: File | null) => void;

    accept?: string;
    maxSizeMb?: number;

    /**
     * auto   → preview interna (default)
     * none   → nessuna preview
     * custom → preview gestita esternamente
     */
    preview?: FileInputPreviewMode;

    containerClassName?: string;
}

export const FileInput: React.FC<FileInputProps> = ({
    id,
    label,
    helperText,
    error,
    required,
    disabled,

    value,
    onChange,

    accept,
    maxSizeMb = 5,
    preview = "auto",

    containerClassName
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    /* ===============================
       STATE INTERNO (fallback)
    =============================== */

    const [internalFile, setInternalFile] = useState<File | null>(null);

    /**
     * File attivo:
     * - value se controllato
     * - internalFile se uncontrolled
     */
    const activeFile = value !== undefined ? value : internalFile;

    /* ===============================
       HANDLERS
    =============================== */

    const openDialog = () => {
        if (disabled) return;

        if (inputRef.current) {
            inputRef.current.value = "";
            inputRef.current.click();
        }
    };

    const handleFile = (file?: File) => {
        if (!file) {
            setInternalFile(null);
            onChange?.(null);
            return;
        }

        if (maxSizeMb && file.size > maxSizeMb * 1024 * 1024) {
            // validazione volutamente esterna
            return;
        }

        // preview interna
        if (value === undefined) {
            setInternalFile(file);
        }

        // notifica esterna
        onChange?.(file);
    };

    const handleRemove = () => {
        setInternalFile(null);
        onChange?.(null);

        if (inputRef.current) {
            inputRef.current.value = "";
        }
    };

    /* ===============================
       PREVIEW LOGIC
    =============================== */

    const previewUrl = useMemo(() => {
        if (preview !== "auto") return null;
        if (!activeFile) return null;
        if (!activeFile.type.startsWith("image/")) return null;

        return URL.createObjectURL(activeFile);
    }, [activeFile, preview]);

    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    const showPreview = preview === "auto" && Boolean(previewUrl);

    /* ===============================
       RENDER
    =============================== */

    return (
        <InputBase
            id={id}
            label={label}
            helperText={helperText}
            error={error}
            required={required}
            disabled={disabled}
            className={containerClassName}
        >
            {({ inputId, describedById, hasError, isDisabled }) => (
                <>
                    {/* INPUT NATIVO (NASCOSTO) */}
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

                    {/* CUSTOM MODE → NON RENDERIZZIAMO NULLA */}
                    {preview === "custom" ? null : (
                        <div
                            className={`${styles.container} ${hasError ? styles.hasError : ""} ${
                                isDisabled ? styles.disabled : ""
                            }`}
                            role="button"
                            tabIndex={0}
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
                                handleFile(e.dataTransfer.files?.[0]);
                            }}
                        >
                            {/* PREVIEW AUTOMATICA */}
                            {showPreview ? (
                                <div className={styles.preview}>
                                    <img src={previewUrl!} alt="Anteprima file" />

                                    <div className={styles.overlay}>
                                        <button
                                            type="button"
                                            onClick={e => {
                                                e.stopPropagation();
                                                openDialog();
                                            }}
                                        >
                                            Cambia
                                        </button>
                                        <button
                                            type="button"
                                            onClick={e => {
                                                e.stopPropagation();
                                                handleRemove();
                                            }}
                                        >
                                            Rimuovi
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.placeholder}>
                                    <Text as="span" variant="body">
                                        Clicca o trascina un file qui
                                    </Text>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </InputBase>
    );
};
