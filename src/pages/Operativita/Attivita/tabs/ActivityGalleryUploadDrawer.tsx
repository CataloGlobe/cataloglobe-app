import React, { useState, useRef, useCallback } from "react";
import { IconUpload, IconX, IconPhoto } from "@tabler/icons-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { uploadAndInsertActivityMedia } from "@/services/supabase/activity-media";
import { useToast } from "@/context/Toast/ToastContext";
import { V2Activity } from "@/types/activity";
import { ActivityMedia } from "@/types/activity-media";
import styles from "./ActivityGalleryUploadDrawer.module.scss";

interface ActivityGalleryUploadDrawerProps {
    open: boolean;
    onClose: () => void;
    activity: V2Activity;
    onSuccess: (inserted: ActivityMedia[]) => void;
}

interface FilePreview {
    file: File;
    previewUrl: string;
}

export const ActivityGalleryUploadDrawer: React.FC<ActivityGalleryUploadDrawerProps> = ({
    open,
    onClose,
    activity,
    onSuccess
}) => {
    const { showToast } = useToast();
    const [files, setFiles] = useState<FilePreview[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleClose = () => {
        if (isUploading) return;
        files.forEach(f => URL.revokeObjectURL(f.previewUrl));
        setFiles([]);
        setIsDragging(false);
        onClose();
    };

    const addFiles = (incoming: FileList | File[]) => {
        const valid = Array.from(incoming).filter(f => f.type.startsWith("image/"));
        if (valid.length < Array.from(incoming).length) {
            showToast({ message: "Alcuni file non sono immagini e sono stati ignorati.", type: "warning" });
        }
        const previews: FilePreview[] = valid.map(f => ({
            file: f,
            previewUrl: URL.createObjectURL(f)
        }));
        setFiles(prev => [...prev, ...previews]);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) addFiles(e.target.files);
        e.target.value = "";
    };

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
    }, []);

    const handleRemove = (index: number) => {
        setFiles(prev => {
            URL.revokeObjectURL(prev[index].previewUrl);
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleUpload = async () => {
        if (!files.length) return;
        setIsUploading(true);
        const inserted: ActivityMedia[] = [];
        const failed: string[] = [];

        for (const { file } of files) {
            try {
                const media = await uploadAndInsertActivityMedia(activity, file);
                inserted.push(media);
            } catch {
                failed.push(file.name);
            }
        }

        setIsUploading(false);

        if (failed.length) {
            showToast({
                message: `${failed.length} immagine/i non caricate. Riprova.`,
                type: "error"
            });
        }

        if (inserted.length) {
            showToast({
                message: `${inserted.length} immagine/i caricate con successo.`,
                type: "success"
            });
            onSuccess(inserted);
            handleClose();
        }
    };

    return (
        <SystemDrawer open={open} onClose={handleClose} width={520}>
            <DrawerLayout
                header={<Text as="span" variant="title-sm">Carica immagini</Text>}
                footer={
                    <>
                        <Button variant="secondary" onClick={handleClose} disabled={isUploading}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleUpload}
                            loading={isUploading}
                            disabled={!files.length}
                        >
                            {files.length > 0
                                ? `Carica ${files.length} immagin${files.length === 1 ? "e" : "i"}`
                                : "Carica immagini"}
                        </Button>
                    </>
                }
            >
                <div className={styles.content}>
                    {/* Drop zone */}
                    <div
                        className={`${styles.dropZone} ${isDragging ? styles.dragging : ""}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => inputRef.current?.click()}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => e.key === "Enter" && inputRef.current?.click()}
                    >
                        <IconUpload size={28} stroke={1.5} />
                        <Text variant="body" weight={500} className={styles.dropLabel}>
                            Trascina le immagini qui, oppure <span>sfoglia</span>
                        </Text>
                        <Text variant="caption" colorVariant="muted" className={styles.dropHint}>PNG, JPG, WEBP — più file supportati</Text>
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className={styles.hiddenInput}
                            onChange={handleInputChange}
                        />
                    </div>

                    {/* Preview list */}
                    {files.length > 0 && (
                        <div className={styles.previewSection}>
                            <Text variant="body-sm" weight={500} colorVariant="muted" className={styles.previewCount}>
                                {files.length} immagin{files.length === 1 ? "e" : "i"} selezionat{files.length === 1 ? "a" : "e"}
                            </Text>
                            <div className={styles.previewGrid}>
                                {files.map(({ previewUrl, file }, i) => (
                                    <div key={previewUrl} className={styles.previewItem}>
                                        <img src={previewUrl} alt={file.name} className={styles.previewImg} />
                                        <button
                                            className={styles.removeBtn}
                                            onClick={() => handleRemove(i)}
                                            type="button"
                                            aria-label="Rimuovi"
                                            disabled={isUploading}
                                        >
                                            <IconX size={12} />
                                        </button>
                                    </div>
                                ))}
                                {/* Add more */}
                                <button
                                    className={styles.addMoreBtn}
                                    onClick={() => inputRef.current?.click()}
                                    type="button"
                                    disabled={isUploading}
                                >
                                    <IconPhoto size={20} stroke={1.5} />
                                    <Text as="span" variant="caption">Aggiungi</Text>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
};
