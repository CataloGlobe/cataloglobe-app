import { useId } from "react";
import Text from "@/components/ui/Text/Text";
import { CRM_EXPENSE_CATEGORIES } from "@shared/crmExpenses";
import type { CrmExpenseCategory } from "@/types/crm";
import { CATEGORY_META } from "./expenseCategoryMeta";
import styles from "../Costs.module.scss";

/**
 * «Tipo di spesa»: una fila di scelte con l'icona accanto al nome, la stessa
 * che poi segna la riga. Radio nativi: frecce e lettori di schermo gratis.
 */
export function CategoryPicker({
    value,
    onChange,
    disabled
}: {
    value: CrmExpenseCategory;
    onChange: (category: CrmExpenseCategory) => void;
    disabled?: boolean;
}) {
    const name = useId();
    return (
        <fieldset className={styles.picker} disabled={disabled}>
            <Text as="legend" variant="body-sm" weight={500}>
                Tipo di spesa
            </Text>
            <div className={styles.pickerRow}>
                {CRM_EXPENSE_CATEGORIES.map(category => {
                    const { icon: Icon, label } = CATEGORY_META[category];
                    return (
                        <label key={category} className={styles.pickerOption} data-tone={category}>
                            <input
                                type="radio"
                                name={name}
                                value={category}
                                checked={value === category}
                                onChange={() => onChange(category)}
                            />
                            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                            <span>{label}</span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}
