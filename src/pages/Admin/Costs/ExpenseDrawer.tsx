import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { createCrmExpense, updateCrmExpense } from "@/services/supabase/crmExpenses";
import {
    expenseDraftFrom,
    expenseDraftToInput,
    romeTodayIso,
    validateExpenseDraft,
    type CrmExpenseDraft,
    type CrmExpenseDraftErrors
} from "@/utils/crm/expenses";
import { crmErrorMessage } from "@/utils/crm/stages";
import type { CrmExpense } from "@/types/crm";
import { ExpenseForm } from "./components/ExpenseForm";
import styles from "./Costs.module.scss";

const FORM_ID = "crm-expense-form";

type Props = {
    open: boolean;
    /** null = nuova spesa. */
    expense: CrmExpense | null;
    onClose: () => void;
    onSaved: (mode: "create" | "edit") => Promise<void> | void;
};

export function ExpenseDrawer({ open, expense, onClose, onSaved }: Props) {
    const [draft, setDraft] = useState<CrmExpenseDraft>(() => expenseDraftFrom(null, romeTodayIso()));
    const [errors, setErrors] = useState<CrmExpenseDraftErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setDraft(expenseDraftFrom(expense, romeTodayIso()));
        setErrors({});
        setFormError(null);
        setIsSaving(false);
    }, [open, expense]);

    async function handleSubmit() {
        const found = validateExpenseDraft(draft);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        setFormError(null);
        setIsSaving(true);
        try {
            const input = expenseDraftToInput(draft);
            if (expense) await updateCrmExpense(expense.id, input);
            else await createCrmExpense(input);
            await onSaved(expense ? "edit" : "create");
        } catch (err) {
            setFormError(crmErrorMessage(err));
            setIsSaving(false);
        }
    }

    return (
        <SystemDrawer open={open} onClose={onClose} size="md">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        {expense ? "Modifica spesa" : "Aggiungi spesa"}
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button variant="primary" type="submit" form={FORM_ID} loading={isSaving}>
                            {expense ? "Salva" : "Aggiungi"}
                        </Button>
                    </>
                }
            >
                <div className={styles.form}>
                    {formError && <InlineBanner variant="error">{formError}</InlineBanner>}
                    <ExpenseForm
                        formId={FORM_ID}
                        draft={draft}
                        errors={errors}
                        disabled={isSaving}
                        onChange={patch => setDraft(prev => ({ ...prev, ...patch }))}
                        onSubmit={() => void handleSubmit()}
                    />
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
