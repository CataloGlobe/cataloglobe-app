import { ChipGroupSingle } from "@/components/ui/Chip/ChipGroup";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection/CollapsibleSection";
import { Select } from "@/components/ui/Select/Select";
import { Switch } from "@/components/ui/Switch/Switch";
import { TextInput } from "@/components/ui/Input/TextInput";
import { DateInput } from "@/components/ui/Input/DateInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import Text from "@/components/ui/Text/Text";
import { CRM_EXPENSE_CATEGORIES, CRM_EXPENSE_CATEGORY_LABEL, type CrmExpenseCategory } from "@shared/crmExpenses";
import {
    CRM_EXPENSE_FREQUENCY_OPTIONS,
    expenseDateOf,
    expenseDraftSummary,
    frequencyOf,
    withExpenseDate,
    withFrequency,
    type CrmExpenseDraft,
    type CrmExpenseDraftErrors,
    type CrmExpenseFrequency
} from "@/utils/crm/expenses";
import styles from "../Costs.module.scss";

/**
 * Form puro di una spesa: controllato, nessuna logica di drawer né di
 * salvataggio. La bozza e gli errori stanno in `ExpenseDrawer`.
 *
 * Proposta 1 di D38 (scelta da Alex il 2026-10-05): cinque campi a vista
 * (Cosa, Importo, Quanto spesso, Data, Pagata da), il resto in «Altre
 * opzioni», «Disdetto» solo su una spesa che c'è già.
 */

const CATEGORY_OPTIONS = CRM_EXPENSE_CATEGORIES.map(value => ({
    value,
    label: CRM_EXPENSE_CATEGORY_LABEL[value]
}));

type Props = {
    formId: string;
    draft: CrmExpenseDraft;
    errors: CrmExpenseDraftErrors;
    disabled: boolean;
    /** Spesa già salvata: compare «Disdetto». */
    isEdit: boolean;
    onChange: (next: CrmExpenseDraft) => void;
    onSubmit: () => void;
    /** Nomi pronti per «Pagata da»: il team e il conto comune. */
    payers?: string[];
};

export function ExpenseForm({ formId, draft, errors, disabled, isEdit, onChange, onSubmit, payers = [] }: Props) {
    const patch = (p: Partial<CrmExpenseDraft>) => onChange({ ...draft, ...p });
    const frequency = frequencyOf(draft);
    const isSubscription = draft.kind === "subscription";
    const pickedPayer = payers.find(p => p.toLocaleLowerCase("it") === draft.paidBy.trim().toLocaleLowerCase("it"));
    const summary = expenseDraftSummary(draft);
    const dateError = isSubscription ? errors.firstChargeOn : errors.paidOn;

    return (
        <form
            id={formId}
            className={styles.form}
            noValidate
            onSubmit={e => {
                e.preventDefault();
                onSubmit();
            }}
        >
            <TextInput
                label="Cosa"
                required
                maxLength={120}
                placeholder="Per esempio Claude Max, dominio"
                value={draft.name}
                onChange={e => patch({ name: e.target.value })}
                error={errors.name}
                disabled={disabled}
            />
            <div className={styles.fieldRow}>
                <TextInput
                    label="Importo in euro"
                    required
                    inputMode="decimal"
                    placeholder="109,80"
                    value={draft.amount}
                    onChange={e => patch({ amount: e.target.value })}
                    error={errors.amount}
                    disabled={disabled}
                />
                <Select
                    label="Quanto spesso"
                    value={frequency}
                    onChange={e => onChange(withFrequency(draft, e.target.value as CrmExpenseFrequency))}
                    options={CRM_EXPENSE_FREQUENCY_OPTIONS}
                    disabled={disabled}
                />
            </div>
            <DateInput
                label={isSubscription ? "Primo addebito" : "Pagata il"}
                required
                value={expenseDateOf(draft)}
                onChange={e => onChange(withExpenseDate(draft, e.target.value))}
                error={dateError}
                disabled={disabled}
            />
            <div className={styles.payerField}>
                <TextInput
                    label="Pagata da"
                    maxLength={60}
                    placeholder="Per esempio Alessandro"
                    value={draft.paidBy}
                    onChange={e => patch({ paidBy: e.target.value })}
                    disabled={disabled}
                />
                {payers.length > 0 && (
                    <ChipGroupSingle
                        options={payers.map(p => ({ value: p, label: p, disabled }))}
                        value={pickedPayer}
                        onChange={paidBy => patch({ paidBy })}
                        ariaLabel="Chi l'ha pagata"
                        layout="auto"
                    />
                )}
            </div>
            {summary && (
                <Text as="p" variant="body-sm" colorVariant="muted" className={styles.formSummary} aria-live="polite">
                    {summary}
                </Text>
            )}
            {isEdit && isSubscription && (
                <>
                    <Switch
                        label="Disdetto"
                        description="Dal giorno della disdetta non si contano più rinnovi."
                        checked={draft.cancelled}
                        onChange={cancelled => patch({ cancelled })}
                        disabled={disabled}
                    />
                    {draft.cancelled && (
                        <DateInput
                            label="Disdetto il"
                            required
                            value={draft.cancelledOn}
                            onChange={e => patch({ cancelledOn: e.target.value })}
                            error={errors.cancelledOn}
                            disabled={disabled}
                        />
                    )}
                </>
            )}
            <CollapsibleSection label="Altre opzioni" defaultOpen={Boolean(draft.notes.trim() || errors.remindDaysBefore)}>
                <div className={styles.form}>
                    <Select
                        label="Categoria"
                        value={draft.category}
                        onChange={e => patch({ category: e.target.value as CrmExpenseCategory })}
                        options={CATEGORY_OPTIONS}
                        disabled={disabled}
                    />
                    {isSubscription && (
                        <>
                            <Switch
                                label="Promemoria su Telegram prima del rinnovo"
                                checked={draft.remind}
                                onChange={remind => patch({ remind })}
                                disabled={disabled}
                            />
                            {draft.remind && (
                                <TextInput
                                    label="Giorni prima"
                                    inputMode="numeric"
                                    value={draft.remindDaysBefore}
                                    onChange={e => patch({ remindDaysBefore: e.target.value })}
                                    error={errors.remindDaysBefore}
                                    disabled={disabled}
                                />
                            )}
                        </>
                    )}
                    <Textarea
                        label="Note"
                        rows={3}
                        maxLength={1000}
                        placeholder="Per esempio: divisa su Splitwise, da disdire a fine mese."
                        value={draft.notes}
                        onChange={e => patch({ notes: e.target.value })}
                        disabled={disabled}
                    />
                </div>
            </CollapsibleSection>
        </form>
    );
}
