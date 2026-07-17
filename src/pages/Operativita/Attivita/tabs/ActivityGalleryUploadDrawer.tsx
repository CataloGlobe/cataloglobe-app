import React from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import {
    ImageUploadEditor,
    IMAGE_UPLOAD_PRESETS,
    type ImageUploadEditorResult
} from "@/components/ui/ImageUploadEditor";
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

/**
 * Aggiunta foto galleria — una foto alla volta con inquadratura 16:9 (baked).
 * L'editor è single-image: ogni Conferma carica+inserisce una foto e resetta,
 * così l'utente può aggiungerne altre in sequenza senza chiudere il drawer.
 * Il framing è applicato ai pixel (nessun MediaFraming persistito). La logica di
 * lista (riordino/rimozione/set-as-cover) resta in ActivityProfileTab, invariata:
 * qui notifichiamo solo `onSuccess([media])` per ogni foto caricata.
 */
export const ActivityGalleryUploadDrawer: React.FC<ActivityGalleryUploadDrawerProps> = ({
    open,
    onClose,
    activity,
    onSuccess
}) => {
    const { showToast } = useToast();

    const handleConfirm = async ({ file }: ImageUploadEditorResult) => {
        if (!file) return;
        try {
            const media = await uploadAndInsertActivityMedia(activity, file);
            onSuccess([media]);
            showToast({ message: "Immagine caricata.", type: "success" });
        } catch {
            showToast({ message: "Errore durante il caricamento dell'immagine.", type: "error" });
        }
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={520}>
            <DrawerLayout
                header={
                    <Text as="span" variant="title-sm">
                        Aggiungi immagine
                    </Text>
                }
                footer={
                    <Button variant="secondary" onClick={onClose}>
                        Chiudi
                    </Button>
                }
            >
                <div className={styles.content}>
                    <Text variant="body-sm" colorVariant="muted">
                        Aggiungi una foto alla galleria. PNG, JPG o WEBP — max 10 MB.
                        Inquadra e ritaglia in formato 16:9; ogni foto viene salvata
                        subito. Puoi aggiungerne altre una alla volta.
                    </Text>

                    <ImageUploadEditor
                        aspectRatio={IMAGE_UPLOAD_PRESETS.gallery.aspectRatio}
                        backgroundFillModes={IMAGE_UPLOAD_PRESETS.gallery.backgroundFillModes}
                        maxSizeMB={IMAGE_UPLOAD_PRESETS.gallery.maxSizeMB}
                        compressLongEdge={IMAGE_UPLOAD_PRESETS.gallery.compressLongEdge}
                        bake={{ size: 1280, format: "image/webp", quality: 0.85, fileName: "gallery.webp" }}
                        onConfirm={handleConfirm}
                    />
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
};
