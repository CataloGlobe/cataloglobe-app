// src/pages/Dashboard/Highlights/components/FeaturedMediaDrawer.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Image } from "lucide-react";
import { ImageReframeEditor } from "@/components/ui/ImageReframeEditor";
import {
    updateFeaturedContent,
    framingToColumns,
    columnsToFraming,
    type FeaturedContent,
    type MediaFraming
} from "@/services/supabase/featuredContents";
import {
    uploadFeaturedContentImage,
    deleteFeaturedContentImage
} from "@/services/supabase/upload";
import { compressImageWithMeta, COMPRESS_PROFILES } from "@/utils/compressImage";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./FeaturedMediaDrawer.module.scss";

type Props = {
    open: boolean;
    onClose: () => void;
    content: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
};

/** Estrae l'estensione dall'URL dell'immagine (ignora query params) */
function extractExt(url: string): string | null {
    const base = url.split("?")[0];
    const parts = base.split(".");
    return parts.length > 1 ? (parts[parts.length - 1] ?? null) : null;
}

/** Elimina il file dallo storage se esiste un media_id */
async function tryDeleteStorageFile(
    tenantId: string,
    contentId: string,
    mediaUrl: string
): Promise<void> {
    const ext = extractExt(mediaUrl);
    if (!ext) return;
    try {
        await deleteFeaturedContentImage(tenantId, contentId, ext);
    } catch {
        // non-blocking: il file potrebbe non esistere più
    }
}

export function FeaturedMediaDrawer({ open, onClose, content, tenantId, onSuccess }: Props) {
    const { showToast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Editing stage: mostra l'ImageReframeEditor prima di caricare/salvare.
    const [editSource, setEditSource] = useState<string | null>(null);
    // File compresso da caricare; null quando si ri-inquadra un'immagine remota
    // esistente senza cambiare file (solo update del framing, nessun re-upload).
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [framing, setFraming] = useState<MediaFraming>(() => columnsToFraming(content));

    // Object URL vivo da revocare (solo per file locali; gli URL remoti no).
    const objectUrlRef = useRef<string | null>(null);

    const revokeObjectUrl = useCallback(() => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
    }, []);

    // Revoca l'object URL allo smontaggio (nessun leak).
    useEffect(() => revokeObjectUrl, [revokeObjectUrl]);

    const resetEditing = useCallback(() => {
        revokeObjectUrl();
        setEditSource(null);
        setPendingFile(null);
    }, [revokeObjectUrl]);

    // Fase SELECT: nuovo file → comprimi (con dimensioni naturali) → object URL
    // → apri l'editor con framing di default (immagine nuova).
    const handleFile = async (file: File) => {
        if (!file.type.startsWith("image/")) {
            showToast({ type: "error", message: "Seleziona un'immagine (PNG, JPG, WEBP)" });
            return;
        }
        try {
            const { file: compressed } = await compressImageWithMeta(
                file,
                COMPRESS_PROFILES.featured
            );
            revokeObjectUrl();
            const objectUrl = URL.createObjectURL(compressed);
            objectUrlRef.current = objectUrl;
            setPendingFile(compressed);
            setFraming(columnsToFraming({})); // default: immagine nuova
            setEditSource(objectUrl);
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore durante l'elaborazione dell'immagine" });
        }
    };

    // Ri-inquadra l'immagine esistente (URL remoto) senza re-upload.
    const handleReframeExisting = () => {
        if (!content.media_id) return;
        setPendingFile(null);
        setFraming(columnsToFraming(content));
        setEditSource(content.media_id);
    };

    // Fase CONFIRM: upload (solo se nuovo file) + update media_id/framing insieme.
    const handleConfirm = async () => {
        try {
            setIsUploading(true);
            const payload: Partial<FeaturedContent> = { ...framingToColumns(framing) };

            if (pendingFile) {
                // Nuovo file: rimpiazza il vecchio in storage, poi carica.
                if (content.media_id) {
                    await tryDeleteStorageFile(tenantId, content.id, content.media_id);
                }
                const url = await uploadFeaturedContentImage(tenantId, content.id, pendingFile);
                // Cache-bust: stesso path storage → forza il refresh del browser.
                payload.media_id = `${url}?t=${Date.now()}`;
            }

            await updateFeaturedContent(content.id, tenantId, payload);
            showToast({
                type: "success",
                message: pendingFile ? "Immagine caricata" : "Inquadratura aggiornata"
            });
            resetEditing();
            onSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore durante il salvataggio dell'immagine" });
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemove = async () => {
        if (!content.media_id) return;
        try {
            setIsUploading(true);
            // Elimina il file dallo storage prima di aggiornare il DB
            await tryDeleteStorageFile(tenantId, content.id, content.media_id);
            // media_id: null; i default DB di framing restano innocui.
            await updateFeaturedContent(content.id, tenantId, { media_id: null });
            showToast({ type: "success", message: "Immagine rimossa" });
            onSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nella rimozione dell'immagine" });
        } finally {
            setIsUploading(false);
        }
    };

    const uploadArea = (
        <div
            className={`${styles.uploadArea} ${isDragging ? styles.uploadAreaDragging : ""}`}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            onDragOver={e => {
                e.preventDefault();
                setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
            }}
        >
            <Image size={28} strokeWidth={1.5} />
            <Text variant="body" weight={500}>
                {content.media_id
                    ? "Trascina qui o clicca per sostituire"
                    : "Trascina qui o clicca per caricare"}
            </Text>
            <Text variant="caption" colorVariant="muted">
                PNG, JPG, WEBP — max 5 MB
            </Text>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className={styles.fileInputHidden}
                onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) {
                        handleFile(f);
                        e.target.value = "";
                    }
                }}
            />
        </div>
    );

    const isEditing = editSource !== null;

    return (
        <SystemDrawer open={open} onClose={onClose} width={560}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        {isEditing ? "Inquadra immagine" : "Modifica immagine"}
                    </Text>
                }
                footer={
                    isEditing ? (
                        <>
                            <Button variant="secondary" onClick={resetEditing} disabled={isUploading}>
                                Annulla
                            </Button>
                            <Button variant="primary" onClick={handleConfirm} loading={isUploading}>
                                Conferma
                            </Button>
                        </>
                    ) : (
                        <Button variant="secondary" onClick={onClose} disabled={isUploading}>
                            Chiudi
                        </Button>
                    )
                }
            >
                <div className={styles.drawerBody}>
                    {isEditing && editSource ? (
                        <ImageReframeEditor
                            source={editSource}
                            value={framing}
                            onChange={setFraming}
                        />
                    ) : (
                        <>
                            {content.media_id && (
                                <>
                                    <div className={styles.preview}>
                                        <img
                                            src={content.media_id}
                                            alt="Anteprima"
                                            className={styles.previewImg}
                                        />
                                    </div>
                                    <Button
                                        variant="secondary"
                                        onClick={handleReframeExisting}
                                        disabled={isUploading}
                                        fullWidth
                                    >
                                        Ri-inquadra
                                    </Button>
                                    <Button
                                        variant="danger"
                                        onClick={handleRemove}
                                        disabled={isUploading}
                                        fullWidth
                                    >
                                        Rimuovi immagine
                                    </Button>
                                </>
                            )}
                            {uploadArea}
                        </>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
