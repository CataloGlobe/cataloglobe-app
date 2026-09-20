import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";

interface Props {
    isOpen: boolean;
    tenantName: string;
    onClose: () => void;
    /** Deve resolvere normalmente in caso di successo, lanciare in caso di errore. */
    onConfirm: () => Promise<void>;
}

export function DeleteTenantDialog({ isOpen, tenantName, onClose, onConfirm }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset state ogni volta che la dialog viene aperta/chiusa
    useEffect(() => {
        if (!isOpen) {
            setLoading(false);
            setError(null);
        }
    }, [isOpen]);

    const handleConfirm = async () => {
        setLoading(true);
        setError(null);
        try {
            await onConfirm();
            // onConfirm gestisce il redirect — non chiudiamo manualmente
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Errore durante l'eliminazione. Riprova."
            );
            setLoading(false);
        }
    };

    return (
        <ConfirmDialog
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={handleConfirm}
            title={`Eliminare “${tenantName}”?`}
            message="L'attività verrà spostata nell'area “In eliminazione” nel workspace. Potrai ripristinarla entro 30 giorni. Dopo questo periodo verrà eliminata definitivamente."
            confirmText={tenantName}
            confirmLabel="Elimina attività"
            confirmVariant="danger"
            isLoading={loading}
            error={error}
        />
    );
}
