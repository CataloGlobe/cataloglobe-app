import { DateInput } from "@/components/ui/Input/DateInput";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import { JOINT_ACCOUNT, type SettlementDraft, type SettlementDraftErrors } from "@/utils/crm/expenseBalance";
import styles from "../Costs.module.scss";

type Props = {
    formId: string;
    draft: SettlementDraft;
    errors: SettlementDraftErrors;
    people: string[];
    disabled: boolean;
    onChange: (patch: Partial<SettlementDraft>) => void;
    onSubmit: () => void;
};

/** Da chi, a chi, quanto e quando. «A» comprende il conto comune (un versamento). */
export function SettlementForm({ formId, draft, errors, people, disabled, onChange, onSubmit }: Props) {
    const fromOptions = [{ value: "", label: "Scegli…" }, ...people.map(p => ({ value: p, label: p }))];
    const toOptions = [
        { value: "", label: "Scegli…" },
        ...people.map(p => ({ value: p, label: p })),
        { value: JOINT_ACCOUNT, label: `${JOINT_ACCOUNT} (versamento)` }
    ];

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
            <div className={styles.fieldRow}>
                <Select
                    label="Da"
                    value={draft.fromName}
                    onChange={e => onChange({ fromName: e.target.value })}
                    options={fromOptions}
                    error={errors.fromName}
                    disabled={disabled}
                />
                <Select
                    label="A"
                    value={draft.toName}
                    onChange={e => onChange({ toName: e.target.value })}
                    options={toOptions}
                    error={errors.toName}
                    disabled={disabled}
                />
            </div>
            <div className={styles.fieldRow}>
                <TextInput
                    label="Importo in euro"
                    required
                    inputMode="decimal"
                    placeholder="120"
                    value={draft.amount}
                    onChange={e => onChange({ amount: e.target.value })}
                    error={errors.amount}
                    disabled={disabled}
                />
                <DateInput
                    label="Il giorno"
                    required
                    value={draft.settledOn}
                    onChange={e => onChange({ settledOn: e.target.value })}
                    error={errors.settledOn}
                    disabled={disabled}
                />
            </div>
            <TextInput
                label="Nota"
                maxLength={300}
                placeholder="Per esempio bonifico di ottobre"
                value={draft.note}
                onChange={e => onChange({ note: e.target.value })}
                error={errors.note}
                helperText="Un versamento sul conto comune conta come una spesa pagata da chi versa."
                disabled={disabled}
            />
        </form>
    );
}
