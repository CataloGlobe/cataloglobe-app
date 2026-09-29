import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useToast } from "@/context/Toast/ToastContext";
import { deleteStory, StoryWithProduct } from "@/services/supabase/stories";

type StoryDeleteDialogProps = {
    open: boolean;
    onClose: () => void;
    storyData: StoryWithProduct | null;
    onSuccess: () => void;
};

/** Elimina una storia: irreversibile, quindi un ConfirmDialog (scheda «ConfirmDialog»). */
export default function StoryDeleteDialog({ open, onClose, storyData, onSuccess }: StoryDeleteDialogProps) {
    const { showToast } = useToast();

    const handleDelete = async (): Promise<boolean> => {
        if (!storyData) return false;
        try {
            await deleteStory(storyData.id, storyData.tenant_id);
            showToast({ message: "Storia eliminata.", type: "success" });
            onSuccess();
            return true;
        } catch (error) {
            console.error("Errore nell'eliminazione della storia:", error);
            showToast({ message: "Impossibile eliminare la storia.", type: "error" });
            return false;
        }
    };

    return (
        <ConfirmDialog
            isOpen={open && storyData !== null}
            onClose={onClose}
            onConfirm={handleDelete}
            title={`Eliminare «${storyData?.title ?? ""}»?`}
            message="La storia sparisce dalla pagina pubblica, con le sue immagini, e non si torna indietro."
            confirmLabel="Elimina storia"
        />
    );
}
