// src/pages/Dashboard/Highlights/components/FeaturedMediaDrawer.tsx
import React, { useState, useRef } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Image } from "lucide-react";
import {
    updateFeaturedContent,
    type FeaturedContent
} from "@/services/supabase/featuredContents";
import { uploadFeaturedContentImage } from "@/services/supabase/upload";
import { compressImage } from "@/utils/compressImage";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./FeaturedMediaDrawer.module.scss";

type Props = {
    open: boolean;
    onClose: () => void;
    content: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
};

export function FeaturedMediaDrawer({ open, onClose, content, tenantId, onSuccess }: Props) {
    const { showToast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = async (file: File) => {
        if (!file.type.startsWith("image/")) {
            showToast({ type: "error", message: "Seleziona un'immagine (PNG, JPG, WEBP)" });
            return;
        }
        try {
            setIsUploading(true);
            const compressed = await compressImage(file, 1200, 0.85);
            const url = await uploadFeaturedContentImage(tenantId, content.id, compressed);
            await updateFeaturedContent(content.id, tenantId, { media_id: url });
            showToast({ type: "success", message: "Immagine caricata" });
            onSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore durante il caricamento dell'immagine" });
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemove = async () => {
        try {
            setIsUploading(true);
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

    return (
        <SystemDrawer open={open} onClose={onClose} width={480}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Modifica immagine
                    </Text>
                }
                footer={
                    <Button variant="secondary" onClick={onClose} disabled={isUploading}>
                        Chiudi
                    </Button>
                }
            >
                {content.media_id ? (
                    <div className={styles.preview}>
                        <img
                            src={content.media_id}
                            alt="Anteprima"
                            className={styles.previewImg}
                        />
                        <div className={styles.previewOverlay}>
                            <button
                                type="button"
                                className={styles.previewRemoveBtn}
                                onClick={handleRemove}
                                disabled={isUploading}
                            >
                                Rimuovi
                            </button>
                        </div>
                    </div>
                ) : (
                    <div
                        className={`${styles.uploadArea} ${
                            isDragging ? styles.uploadAreaDragging : ""
                        }`}
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
                        {isUploading ? (
                            <Text colorVariant="muted">Caricamento in corso...</Text>
                        ) : (
                            <>
                                <Image size={28} strokeWidth={1.5} />
                                <Text variant="body" weight={500}>
                                    Trascina qui o clicca per caricare
                                </Text>
                                <Text variant="caption" colorVariant="muted">
                                    PNG, JPG, WEBP — max 5 MB
                                </Text>
                            </>
                        )}
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
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}
