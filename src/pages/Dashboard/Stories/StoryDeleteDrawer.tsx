import { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { deleteStory, StoryWithProduct } from "@/services/supabase/stories";
import { IconAlertTriangle } from "@tabler/icons-react";
import styles from "./Stories.module.scss";

type StoryDeleteDrawerProps = {
    open: boolean;
    onClose: () => void;
    storyData: StoryWithProduct | null;
    onSuccess: () => void;
};

export default function StoryDeleteDrawer({ open, onClose, storyData, onSuccess }: StoryDeleteDrawerProps) {
    const { showToast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!storyData) return;
        setIsDeleting(true);
        try {
            await deleteStory(storyData.id, storyData.tenant_id);
            showToast({ message: "Storia eliminata con successo.", type: "success" });
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Errore nell'eliminazione della storia:", error);
            const fallback = "Impossibile eliminare la storia.";
            const message = error instanceof Error && error.message ? error.message : fallback;
            showToast({ message, type: "error" });
        } finally {
            setIsDeleting(false);
        }
    };

    if (!storyData) return null;

    return (
        <SystemDrawer open={open} onClose={onClose}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600} colorVariant="error">
                        Elimina storia
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
                            Annulla
                        </Button>
                        <Button variant="danger" onClick={handleDelete} loading={isDeleting}>
                            Conferma eliminazione
                        </Button>
                    </>
                }
            >
                <div className={styles.warningBox}>
                    <IconAlertTriangle size={24} color="var(--color-warning-500)" />
                    <div>
                        <Text variant="body" weight={600}>
                            Azione distruttiva permanente
                        </Text>
                        <Text variant="body-sm" style={{ marginTop: 4 }}>
                            Stai per eliminare la storia <strong>{storyData.title}</strong>. La
                            storia verrà rimossa immediatamente dal catalogo pubblico.
                        </Text>
                    </div>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
