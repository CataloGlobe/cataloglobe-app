import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { moveCrmStageLocked } from "@/services/supabase/crm";
import { CRM_STAGE_LABEL, crmErrorMessage } from "@/utils/crm/stages";
import type { CrmStage } from "@/types/crm";
import styles from "./Crm.module.scss";

/**
 * Spostamento a mano dentro o fuori da In prova o Cliente pagante: quelle
 * fasi le muove il job dall'abbonamento, quindi la carta si blocca, con una
 * nota obbligatoria. Il job continua a scrivere nella storia i cambi di
 * abbonamento; «Sblocca» nella scheda la riporta in automatico.
 * Usato dalla scheda del locale e dal kanban.
 */

export type StageLockRequest = { venueId: string; venueName: string; stage: CrmStage };

type Props = {
    request: StageLockRequest | null;
    onClose: () => void;
    onMoved: (request: StageLockRequest) => Promise<void> | void;
};

export function StageLockDialog({ request, onClose, onMoved }: Props) {
    const [note, setNote] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!request) return;
        setNote("");
        setError(null);
    }, [request]);

    async function handleConfirm() {
        if (!request) return false;
        if (!note.trim()) {
            setError("Scrivi una nota: perché la fase non deve seguire l'abbonamento.");
            return false;
        }
        try {
            await moveCrmStageLocked(request.venueId, request.stage, note.trim());
            await onMoved(request);
            return true;
        } catch (err) {
            setError(crmErrorMessage(err));
            return false;
        }
    }

    return (
        <ConfirmDialog
            isOpen={request !== null}
            onClose={onClose}
            onConfirm={handleConfirm}
            title={request ? `Sposta in ${CRM_STAGE_LABEL[request.stage]} e blocca la fase` : ""}
            confirmLabel="Sposta e blocca"
            confirmVariant="primary"
            error={error}
        >
            <div className={styles.drawerForm}>
                <Text variant="body-sm">
                    In prova e Cliente pagante seguono l&apos;abbonamento. Spostata a mano, la carta prende
                    l&apos;etichetta «Fase bloccata a mano»: il job non la sposta più, ma scrive nella storia i
                    cambi di abbonamento. Puoi sbloccarla dalla scheda.
                </Text>
                <Textarea
                    label="Nota"
                    required
                    rows={3}
                    maxLength={500}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Es. prova prolungata a voce fino a fine mese, paga con bonifico."
                />
            </div>
        </ConfirmDialog>
    );
}
