import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import type { AiImportSession } from "@/hooks/useAiImportSession";
import { AiMenuImportWizard } from "./AiMenuImportWizard";

interface AiMenuImportDrawerProps {
    /** Sessione import sollevata in MainLayout (stato + azioni). */
    session: AiImportSession;
}

export function AiMenuImportDrawer({ session }: AiMenuImportDrawerProps) {
    // Chiudere è ora sicuro: la richiesta vive nel hook e continua a girare anche
    // a drawer chiuso. `close()` nasconde soltanto — nessun guard, nessun
    // annullamento. Riaprire ri-aggancia la sessione alla vista corrente.
    return (
        <SystemDrawer open={session.isOpen} onClose={session.close} width={720}>
            <AiMenuImportWizard session={session} />
        </SystemDrawer>
    );
}
