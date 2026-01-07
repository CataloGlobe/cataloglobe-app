import React from "react";
import Text from "@components/ui/Text/Text";
import styles from "./CoverUploader.module.scss";

interface CoverUploaderProps {
    label: string;
    previewUrl: string | null;
    onFileChange: (file: File | null) => void;
    onRemove: () => void;
}

export const CoverUploader: React.FC<CoverUploaderProps> = ({
    label,
    previewUrl,
    onFileChange,
    onRemove
}) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        onFileChange(file);
    };

    return (
        <div className={styles.wrapper}>
            <Text as="label" variant="body" weight={600} className={styles.label}>
                {label}
            </Text>

            {/* Preview o placeholder */}
            {previewUrl ? (
                <div className={styles.imagePreview}>
                    <img src={previewUrl} alt="Anteprima copertina" />
                </div>
            ) : (
                <div className={styles.imagePlaceholder}>
                    <Text variant="caption" colorVariant="muted">
                        Nessuna immagine caricata
                    </Text>
                </div>
            )}

            <div className={styles.actions}>
                <input
                    type="file"
                    accept="image/*"
                    onChange={handleChange}
                    className={styles.fileInput}
                />

                {previewUrl && (
                    <button type="button" className={styles.removeButton} onClick={onRemove}>
                        Rimuovi
                    </button>
                )}
            </div>
        </div>
    );
};
