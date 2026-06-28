import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import type { AiImportSession } from "@/hooks/useAiImportSession";
import { AiMenuImportWizard } from "./AiMenuImportWizard";

interface AiMenuImportDrawerProps {
    /** Sessione import sollevata in MainLayout (stato + azioni). */
    session: AiImportSession;
}

export function AiMenuImportDrawer({ session }: AiMenuImportDrawerProps) {
    const { isOpen, isBusy, close } = session;
    const [confirmOpen, setConfirmOpen] = useState(false);

    // Reset pulito ad ogni riapertura: nessun guard/confirm residuo.
    useEffect(() => {
        if (isOpen) {
            setConfirmOpen(false);
        }
    }, [isOpen]);

    // Guard condiviso: overlay-click + Escape (SystemDrawer) e bottoni footer (wizard)
    // passano tutti da qui. Se un'operazione e' in corso, chiedi conferma invece di chiudere.
    const handleRequestClose = () => {
        if (isBusy) {
            setConfirmOpen(true);
        } else {
            close();
        }
    };

    return (
        <>
            <SystemDrawer open={isOpen} onClose={handleRequestClose} width={720}>
                <AiMenuImportWizard session={session} />
            </SystemDrawer>

            {/* Reso DOPO SystemDrawer: stesso z-index (1000) portato su document.body,
                quindi l'ordine DOM successivo lo fa dipingere SOPRA il drawer e il suo overlay. */}
            <ConfirmDialog
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={async () => {
                    close();
                    return true;
                }}
                title="Analisi in corso"
                message="Se chiudi adesso perdi il risultato dell'analisi. La richiesta è già stata avviata, quindi resta comunque conteggiata tra quelle giornaliere."
                confirmLabel="Chiudi e annulla"
                confirmVariant="danger"
            />
        </>
    );
}
