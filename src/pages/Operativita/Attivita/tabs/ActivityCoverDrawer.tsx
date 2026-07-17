import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import {
    ImageUploadEditor,
    IMAGE_UPLOAD_PRESETS,
    type ImageUploadEditorResult
} from "@/components/ui/ImageUploadEditor";
import { uploadActivityCover, removeActivityCover } from "@/services/supabase/activities";
import { useToast } from "@/context/Toast/ToastContext";
import { V2Activity } from "@/types/activity";
import styles from "./ActivityCoverDrawer.module.scss";

interface ActivityCoverDrawerProps {
    open: boolean;
    onClose: () => void;
    activity: V2Activity;
    onSuccess: (newUrl: string | null) => void;
}

export const ActivityCoverDrawer: React.FC<ActivityCoverDrawerProps> = ({
    open,
    onClose,
    activity,
    onSuccess
}) => {
    const { showToast } = useToast();
    const [isRemoving, setIsRemoving] = useState(false);
    const [confirmingRemove, setConfirmingRemove] = useState(false);

    const handleClose = () => {
        if (isRemoving) return;
        setConfirmingRemove(false);
        onClose();
    };

    // Riceve dal wrapper l'immagine GIÀ ritagliata 16:9 (baked): carica col
    // servizio esistente. Nessun framing metadata persistito — tutti i consumer
    // di cover_image la rendono con object-fit:cover in box 16:9, invariato.
    const handleCoverConfirm = async ({ file }: ImageUploadEditorResult) => {
        if (!file) return;
        try {
            const url = await uploadActivityCover(activity, file);
            showToast({ message: "Immagine di copertina aggiornata.", type: "success" });
            onSuccess(url);
            onClose();
        } catch {
            showToast({ message: "Errore durante il caricamento dell'immagine.", type: "error" });
        }
    };

    const handleRemoveCover = async () => {
        if (!activity.cover_image) return;
        setIsRemoving(true);
        try {
            await removeActivityCover(activity.id, activity.tenant_id, activity.cover_image);
            showToast({ message: "Immagine di copertina rimossa", type: "success" });
            onSuccess(null);
            setConfirmingRemove(false);
            onClose();
        } catch {
            showToast({ message: "Errore durante la rimozione dell'immagine.", type: "error" });
        } finally {
            setIsRemoving(false);
        }
    };

    return (
        <SystemDrawer open={open} onClose={handleClose} width={520}>
            <DrawerLayout
                header={
                    <Text as="span" variant="title-sm">Modifica immagine di copertina</Text>
                }
                footer={
                    <Button variant="secondary" onClick={handleClose} disabled={isRemoving}>
                        Chiudi
                    </Button>
                }
            >
                <div className={styles.content}>
                    <Text variant="body-sm" colorVariant="muted">
                        Utilizzata come sfondo principale nella testata del catalogo
                        pubblico. PNG, JPG o WEBP — max 10 MB. Inquadra e ritaglia in
                        formato 16:9 prima di salvare.
                    </Text>

                    <ImageUploadEditor
                        aspectRatio={IMAGE_UPLOAD_PRESETS.coverSede.aspectRatio}
                        backgroundFillModes={IMAGE_UPLOAD_PRESETS.coverSede.backgroundFillModes}
                        maxSizeMB={IMAGE_UPLOAD_PRESETS.coverSede.maxSizeMB}
                        compressLongEdge={IMAGE_UPLOAD_PRESETS.coverSede.compressLongEdge}
                        bake={{ size: 1280, format: "image/webp", quality: 0.85, fileName: "cover.webp" }}
                        initialSource={activity.cover_image ?? null}
                        onConfirm={handleCoverConfirm}
                    />

                    {activity.cover_image && !confirmingRemove && (
                        <button
                            type="button"
                            className={styles.removeCoverLink}
                            onClick={() => setConfirmingRemove(true)}
                            disabled={isRemoving}
                        >
                            <Trash2 size={15} strokeWidth={2} />
                            <span>Rimuovi immagine di copertina</span>
                        </button>
                    )}

                    {activity.cover_image && confirmingRemove && (
                        <div className={styles.removeConfirmRow}>
                            <span className={styles.removeConfirmText}>
                                Rimuovere l'immagine di copertina?
                            </span>
                            <div className={styles.removeConfirmActions}>
                                <button
                                    type="button"
                                    className={styles.removeConfirmCancel}
                                    onClick={() => setConfirmingRemove(false)}
                                    disabled={isRemoving}
                                >
                                    Annulla
                                </button>
                                <button
                                    type="button"
                                    className={styles.removeConfirmDanger}
                                    onClick={handleRemoveCover}
                                    disabled={isRemoving}
                                >
                                    {isRemoving ? "Rimozione…" : "Rimuovi"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
};
