import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { RadioGroup } from "@/components/ui/RadioGroup/RadioGroup";
import { Select } from "@/components/ui/Select/Select";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { useToast } from "@/context/Toast/ToastContext";
import { moveCrmStage } from "@/services/supabase/crm";
import { addCrmObjection } from "@/services/supabase/crmObjections";
import { CRM_OBJECTION_CATEGORIES, CRM_OBJECTION_LABEL } from "@/utils/crm/objections";
import { CRM_LOST_KIND_LABEL, crmErrorMessage } from "@/utils/crm/stages";
import type { CrmLostKind, CrmObjectionCategory } from "@/types/crm";
import styles from "./Crm.module.scss";

/**
 * Spostamento in Perso: tipo e motivo obbligatori (vincolo anche a DB).
 * Obiezione = si può riprovare; stop = non vuole essere contattato, definitivo.
 * Per un'obiezione si sceglie anche la categoria: entra nella libreria delle
 * obiezioni (`crm_objections`) col motivo come nota.
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
    const [category, setCategory] = useState<CrmObjectionCategory | "">("");
    const { showToast } = useToast();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!venueId) return;
        setKind("obiezione");
        setReason("");
        setCategory("");
        setError(null);
    }, [venueId]);

    async function handleConfirm() {
        if (!venueId) return false;
        if (!reason.trim()) {
            setError("Scrivi il motivo: serve alla libreria delle obiezioni.");
            return false;
        }
        if (kind === "obiezione" && !category) {
            setError("Scegli quale obiezione: serve alla libreria delle obiezioni.");
            return false;
        }
        try {
            await moveCrmStage(venueId, "perso", { kind, reason: reason.trim() });
            if (kind === "obiezione" && category) {
                // Lo spostamento è fatto: se la libreria non si scrive, lo si dice e basta.
                try {
                    await addCrmObjection({ venueId, category, note: reason, source: "perso" });
                } catch {
                    showToast({ message: "Spostato in Perso, ma l'obiezione non è entrata nella libreria.", type: "warning" });
                }
            }
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
                {kind === "obiezione" && (
                    <Select
                        label="Quale obiezione"
                        required
                        value={category}
                        onChange={e => setCategory(e.target.value as CrmObjectionCategory | "")}
                        options={[
                            { value: "", label: "Scegli" },
                            ...CRM_OBJECTION_CATEGORIES.map(c => ({ value: c, label: CRM_OBJECTION_LABEL[c] }))
                        ]}
                    />
                )}
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
