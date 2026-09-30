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
            message="Sedi, cataloghi, prodotti, ordini e prenotazioni spariscono e le pagine pubbliche vanno offline subito. Hai 30 giorni per ripristinare l'azienda dal Workspace."
            confirmText={tenantName}
            confirmFieldLabel="Scrivi il nome dell'azienda per confermare"
            confirmLabel="Elimina l'azienda"
            confirmVariant="danger"
            isLoading={loading}
            error={error}
        />
    );
}
