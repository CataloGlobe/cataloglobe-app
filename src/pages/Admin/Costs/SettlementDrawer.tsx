import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import Text from "@/components/ui/Text/Text";
import { createCrmExpenseSettlements } from "@/services/supabase/crmExpenses";
import {
    settlementDraftToInput,
    validateSettlementDraft,
    type SettlementDraft,
    type SettlementDraftErrors
} from "@/utils/crm/expenseBalance";
import { romeTodayIso } from "@/utils/crm/expenses";
import { crmErrorMessage } from "@/utils/crm/stages";
import { SettlementForm } from "./components/SettlementForm";
import styles from "./Costs.module.scss";

const FORM_ID = "crm-settlement-form";

type Props = {
    open: boolean;
    /** Le persone del conto, per «Da» e «A». */
    people: string[];
    onClose: () => void;
    onSaved: () => Promise<void> | void;
};

function emptyDraft(people: string[]): SettlementDraft {
    return { fromName: people[1] ?? "", toName: people[0] ?? "", amount: "", settledOn: romeTodayIso(), note: "" };
}

/** Un rimborso tra voi o un versamento sul conto comune, a mano. */
export function SettlementDrawer({ open, people, onClose, onSaved }: Props) {
    const [draft, setDraft] = useState<SettlementDraft>(() => emptyDraft(people));
    const [errors, setErrors] = useState<SettlementDraftErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setDraft(emptyDraft(people));
        setErrors({});
        setFormError(null);
        setIsSaving(false);
        // Si riparte da capo solo all'apertura.
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    async function handleSubmit() {
        const found = validateSettlementDraft(draft);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        setFormError(null);
        setIsSaving(true);
        try {
            await createCrmExpenseSettlements([settlementDraftToInput(draft)]);
            await onSaved();
        } catch (err) {
            setFormError(crmErrorMessage(err));
            setIsSaving(false);
        }
    }

    return (
        <SystemDrawer open={open} onClose={onClose} size="sm">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Registra un movimento
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button variant="primary" type="submit" form={FORM_ID} loading={isSaving}>
                            Registra
                        </Button>
                    </>
                }
            >
                <div className={styles.form}>
                    {formError && <InlineBanner variant="error">{formError}</InlineBanner>}
                    <SettlementForm
                        formId={FORM_ID}
                        draft={draft}
                        errors={errors}
                        people={people}
                        disabled={isSaving}
                        onChange={patch => setDraft(prev => ({ ...prev, ...patch }))}
                        onSubmit={() => void handleSubmit()}
                    />
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
