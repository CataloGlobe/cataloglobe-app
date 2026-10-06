import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { moveCrmStage } from "@/services/supabase/crm";
import { CRM_STAGE_LABEL, crmErrorMessage } from "@/utils/crm/stages";
import type { CrmStage } from "@/types/crm";

export interface StopExitRequest {
    venueId: string;
    venueName: string;
    stage: CrmStage;
}

/**
 * Il locale ha chiesto di non essere contattato (Perso, stop): per spostarlo
 * in un'altra fase serve un sì esplicito (D50). Il database rifiuta lo
 * spostamento senza conferma (`stop_confirm_required`).
 */
export function StopExitDialog({
    request,
    onClose,
    onMoved
}: {
    request: StopExitRequest | null;
    onClose: () => void;
    onMoved: (request: StopExitRequest) => void;
}) {
    const [error, setError] = useState<string | null>(null);

    return (
        <ConfirmDialog
            isOpen={request !== null}
            onClose={() => {
                setError(null);
                onClose();
            }}
            title="Ha chiesto di non essere contattato"
            message={
                request
                    ? `${request.venueName} ha chiesto lo stop. Spostarlo in ${CRM_STAGE_LABEL[request.stage]} vuol dire che vi ha ricontattato o ha cambiato idea. Il suo numero resta nella lista stop: gli invii automatici restano fermi.`
                    : undefined
            }
            confirmLabel={request ? `Sposta in ${CRM_STAGE_LABEL[request.stage]}` : "Sposta"}
            cancelLabel="Lascialo in Perso"
            confirmVariant="danger"
            error={error}
            onConfirm={async () => {
                if (!request) return true;
                setError(null);
                try {
                    await moveCrmStage(request.venueId, request.stage, undefined, "perso", { confirmStop: true });
                    onMoved(request);
                    return true;
                } catch (err) {
                    setError(crmErrorMessage(err));
                    return false;
                }
            }}
        />
    );
}
