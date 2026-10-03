import { RadioGroup } from "@/components/ui/RadioGroup/RadioGroup";
import { Select } from "@/components/ui/Select/Select";
import { Switch } from "@/components/ui/Switch/Switch";
import { TextInput } from "@/components/ui/Input/TextInput";
import { DateInput } from "@/components/ui/Input/DateInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import {
    CRM_EXPENSE_CATEGORIES,
    CRM_EXPENSE_CATEGORY_LABEL,
    type CrmBillingInterval,
    type CrmExpenseCategory,
    type CrmExpenseKind
} from "@shared/crmExpenses";
import type { CrmExpenseDraft, CrmExpenseDraftErrors } from "@/utils/crm/expenses";
import styles from "../Costs.module.scss";

/**
 * Form puro di una spesa: controllato, nessuna logica di drawer né di
 * salvataggio. La bozza e gli errori stanno in `ExpenseDrawer`.
 */

const KIND_OPTIONS = [
    {
        value: "subscription",
        label: "Abbonamento",
        description: "Si paga ogni mese o ogni anno, finché non lo disdici."
    },
    { value: "one_off", label: "Una tantum", description: "Pagata una volta sola." }
];

const INTERVAL_OPTIONS = [
    { value: "month", label: "Ogni mese" },
    { value: "year", label: "Ogni anno" }
];

const CATEGORY_OPTIONS = CRM_EXPENSE_CATEGORIES.map(value => ({
    value,
    label: CRM_EXPENSE_CATEGORY_LABEL[value]
}));

type Props = {
    formId: string;
    draft: CrmExpenseDraft;
    errors: CrmExpenseDraftErrors;
    disabled: boolean;
    onChange: (patch: Partial<CrmExpenseDraft>) => void;
    onSubmit: () => void;
};

export function ExpenseForm({ formId, draft, errors, disabled, onChange, onSubmit }: Props) {
    const isSubscription = draft.kind === "subscription";

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
            <RadioGroup
                label="Tipo"
                value={draft.kind}
                onChange={value => onChange({ kind: value as CrmExpenseKind })}
                options={KIND_OPTIONS}
                disabled={disabled}
            />
            <TextInput
                label="Cosa"
                required
                maxLength={120}
                placeholder={isSubscription ? "Per esempio Claude Max" : "Per esempio dominio, consulenza"}
                value={draft.name}
                onChange={e => onChange({ name: e.target.value })}
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
                    onChange={e => onChange({ amount: e.target.value })}
                    error={errors.amount}
                    helperText="IVA inclusa: quello che è uscito dal conto."
                    disabled={disabled}
                />
                {isSubscription ? (
                    <Select
                        label="Si rinnova"
                        value={draft.billingInterval}
                        onChange={e => onChange({ billingInterval: e.target.value as CrmBillingInterval })}
                        options={INTERVAL_OPTIONS}
                        disabled={disabled}
                    />
                ) : (
                    <DateInput
                        label="Pagata il"
                        required
                        value={draft.paidOn}
                        onChange={e => onChange({ paidOn: e.target.value })}
                        error={errors.paidOn}
                        disabled={disabled}
                    />
                )}
            </div>
            {isSubscription && (
                <DateInput
                    label="Primo addebito a questo prezzo"
                    required
                    value={draft.firstChargeOn}
                    onChange={e => onChange({ firstChargeOn: e.target.value })}
                    error={errors.firstChargeOn}
                    helperText="Da qui si contano i rinnovi. Un primo mese a prezzo diverso va segnato a parte come una tantum."
                    disabled={disabled}
                />
            )}
            <div className={styles.fieldRow}>
                <Select
                    label="Categoria"
                    value={draft.category}
                    onChange={e => onChange({ category: e.target.value as CrmExpenseCategory })}
                    options={CATEGORY_OPTIONS}
                    disabled={disabled}
                />
                <TextInput
                    label="Pagata da"
                    maxLength={60}
                    placeholder="Per esempio Alex"
                    value={draft.paidBy}
                    onChange={e => onChange({ paidBy: e.target.value })}
                    disabled={disabled}
                />
            </div>
            {isSubscription && (
                <>
                    <Switch
                        label="Promemoria su Telegram prima del rinnovo"
                        description="Arriva alle 9 a tutto il team collegato al bot."
                        checked={draft.remind}
                        onChange={remind => onChange({ remind })}
                        disabled={disabled}
                    />
                    {draft.remind && (
                        <TextInput
                            label="Giorni prima"
                            inputMode="numeric"
                            value={draft.remindDaysBefore}
                            onChange={e => onChange({ remindDaysBefore: e.target.value })}
                            error={errors.remindDaysBefore}
                            disabled={disabled}
                        />
                    )}
                    <Switch
                        label="Disdetto"
                        description="Dal giorno della disdetta non si contano più rinnovi e il promemoria si ferma."
                        checked={draft.cancelled}
                        onChange={cancelled => onChange({ cancelled })}
                        disabled={disabled}
                    />
                    {draft.cancelled && (
                        <DateInput
                            label="Disdetto il"
                            required
                            value={draft.cancelledOn}
                            onChange={e => onChange({ cancelledOn: e.target.value })}
                            error={errors.cancelledOn}
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
                onChange={e => onChange({ notes: e.target.value })}
                disabled={disabled}
            />
        </form>
    );
}
