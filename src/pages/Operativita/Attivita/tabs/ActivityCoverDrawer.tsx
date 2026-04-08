import React, { useState, useRef, useCallback } from "react";
import { IconPhoto, IconUpload, IconX } from "@tabler/icons-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { uploadActivityCover } from "@/services/supabase/activities";
import { useToast } from "@/context/Toast/ToastContext";
import { V2Activity } from "@/types/activity";
import styles from "./ActivityCoverDrawer.module.scss";

interface ActivityCoverDrawerProps {
    open: boolean;
    onClose: () => void;
    activity: V2Activity;
    onSuccess: (newUrl: string) => void;
}

export const ActivityCoverDrawer: React.FC<ActivityCoverDrawerProps> = ({
    open,
    onClose,
    activity,
    onSuccess
}) => {
    const { showToast } = useToast();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleClose = () => {
        if (isSaving) return;
        setSelectedFile(null);
        setPreviewUrl(null);
        setIsDragging(false);
        onClose();
    };

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

    const handleFileSelect = (file: File) => {
        if (!file.type.startsWith("image/")) {
            showToast({ message: "Seleziona un'immagine valida.", type: "error" });
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            showToast({ message: "L'immagine supera il limite di 5 MB.", type: "error" });
            return;
        }
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelect(file);
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
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileSelect(file);
    }, []);

    const handleRemoveSelected = () => {
        setSelectedFile(null);
        setPreviewUrl(null);
        if (inputRef.current) inputRef.current.value = "";
    };

    const handleSave = async () => {
        if (!selectedFile) return;
        setIsSaving(true);
        try {
            const url = await uploadActivityCover(activity, selectedFile);
            showToast({ message: "Immagine di copertina aggiornata.", type: "success" });
            onSuccess(url);
            handleClose();
        } catch {
            showToast({ message: "Errore durante il caricamento dell'immagine.", type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    const displayUrl = previewUrl ?? activity.cover_image ?? null;

    return (
        <SystemDrawer open={open} onClose={handleClose} width={520}>
            <DrawerLayout
                header={
                    <Text as="span" variant="title-sm">Modifica immagine di copertina</Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={handleClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSave}
                            loading={isSaving}
                            disabled={!selectedFile}
                        >
                            Salva
                        </Button>
                    </>
                }
            >
                <div className={styles.content}>
                    {/* Preview */}
                    {displayUrl ? (
                        <div className={styles.previewWrapper}>
                            <img src={displayUrl} alt="Anteprima copertina" className={styles.previewImage} />
                            {previewUrl && (
                                <button
                                    className={styles.removeBtn}
                                    onClick={handleRemoveSelected}
                                    type="button"
                                    aria-label="Rimuovi selezione"
                                >
                                    <IconX size={14} />
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className={styles.previewEmpty}>
                            <IconPhoto size={40} stroke={1.5} />
                            <Text as="span" variant="body-sm" colorVariant="muted">Nessuna immagine</Text>
                        </div>
                    )}

                    {/* Upload area */}
                    <div
                        className={`${styles.uploadArea} ${isDragging ? styles.dragging : ""}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => inputRef.current?.click()}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => e.key === "Enter" && inputRef.current?.click()}
                    >
                        <IconUpload size={24} stroke={1.5} />
                        <Text variant="body" weight={500} className={styles.uploadLabel}>
                            Trascina qui un'immagine, oppure <span>sfoglia</span>
                        </Text>
                        <Text variant="caption" colorVariant="muted" className={styles.uploadHint}>PNG, JPG, WEBP — max 5 MB</Text>
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/*"
                            className={styles.hiddenInput}
                            onChange={handleInputChange}
                        />
                    </div>

                    <Text variant="caption" colorVariant="muted" className={styles.hint}>
                        Utilizzata come sfondo principale nella testata del catalogo pubblico. Formato consigliato: 16:9.
                    </Text>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
};
