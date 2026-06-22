import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { AiMenuImportWizard } from "./AiMenuImportWizard";

interface AiMenuImportDrawerProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function AiMenuImportDrawer({ open, onClose, onSuccess }: AiMenuImportDrawerProps) {
    // Stato "operazione in corso" sollevato dal wizard (analisi Gemini O creazione DB).
    const [isBusy, setIsBusy] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    // Reset pulito ad ogni riapertura: nessun guard/confirm residuo.
    useEffect(() => {
        if (open) {
            setIsBusy(false);
            setConfirmOpen(false);
        }
    }, [open]);

    // Guard condiviso: overlay-click + Escape (SystemDrawer) e bottoni footer (wizard)
    // passano tutti da qui. Se un'operazione e' in corso, chiedi conferma invece di chiudere.
    const handleRequestClose = () => {
        if (isBusy) {
            setConfirmOpen(true);
        } else {
            onClose();
        }
    };

    return (
        <>
            <SystemDrawer open={open} onClose={handleRequestClose} width={720}>
                <AiMenuImportWizard
                    onClose={handleRequestClose}
                    onSuccess={onSuccess}
                    onBusyChange={setIsBusy}
                />
            </SystemDrawer>

            {/* Reso DOPO SystemDrawer: stesso z-index (1000) portato su document.body,
                quindi l'ordine DOM successivo lo fa dipingere SOPRA il drawer e il suo overlay. */}
            <ConfirmDialog
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={async () => {
                    onClose();
                    return true;
                }}
                title="Operazione in corso"
                message="Se chiudi ora l'operazione in corso verrà persa e dovrai ricominciare. Chiudere comunque?"
                confirmLabel="Chiudi comunque"
                confirmVariant="danger"
            />
        </>
    );
}
