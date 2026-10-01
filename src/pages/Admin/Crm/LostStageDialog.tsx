import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { RadioGroup } from "@/components/ui/RadioGroup/RadioGroup";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { moveCrmStage } from "@/services/supabase/crm";
import { CRM_LOST_KIND_LABEL, crmErrorMessage } from "@/utils/crm/stages";
import type { CrmLostKind } from "@/types/crm";
import styles from "./Crm.module.scss";

/**
 * Spostamento in Perso: tipo e motivo obbligatori (vincolo anche a DB).
 * Obiezione = si può riprovare; stop = non vuole essere contattato, definitivo.
 * Usato dalla scheda del locale e dal kanban.
 */

const LOST_KIND_OPTIONS = (Object.keys(CRM_LOST_KIND_LABEL) as CrmLostKind[]).map(kind => ({
    value: kind,
    label: CRM_LOST_KIND_LABEL[kind]
}));

type Props = {
    venueId: string | null;
    onClose: () => void;
    onMoved: () => Promise<void> | void;
};

export function LostStageDialog({ venueId, onClose, onMoved }: Props) {
    const [kind, setKind] = useState<CrmLostKind>("obiezione");
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!venueId) return;
        setKind("obiezione");
        setReason("");
        setError(null);
    }, [venueId]);

    async function handleConfirm() {
        if (!venueId) return false;
        if (!reason.trim()) {
            setError("Scrivi il motivo: serve alla libreria delle obiezioni.");
            return false;
        }
        try {
            await moveCrmStage(venueId, "perso", { kind, reason: reason.trim() });
            await onMoved();
            return true;
        } catch (err) {
            setError(crmErrorMessage(err));
            return false;
        }
    }

    return (
        <ConfirmDialog
            isOpen={venueId !== null}
            onClose={onClose}
            onConfirm={handleConfirm}
            title="Sposta in Perso"
            confirmLabel="Sposta in Perso"
            confirmVariant="primary"
            error={error}
        >
            <div className={styles.drawerForm}>
                <RadioGroup
                    label="Tipo"
                    value={kind}
                    onChange={value => setKind(value as CrmLostKind)}
                    options={LOST_KIND_OPTIONS}
                />
                <Textarea
                    label="Motivo"
                    required
                    rows={3}
                    maxLength={500}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Es. usa già un altro menù digitale, costa troppo, non ha tempo adesso."
                />
            </div>
        </ConfirmDialog>
    );
}
