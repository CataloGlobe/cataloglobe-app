import type { ReactNode } from "react";
import { Check, ChevronDown, User, Users } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Menu } from "@/components/ui/Menu";
import { CRM_EXPENSE_CATEGORIES } from "@shared/crmExpenses";
import { JOINT_FILTER } from "@/utils/crm/expenseFilters";
import type { CrmExpenseCategory } from "@/types/crm";
import { CATEGORY_META } from "./expenseCategoryMeta";
import styles from "../Costs.module.scss";

interface Option {
    value: string;
    label: string;
    icon: ReactNode;
}

/** Il testo del bottone: «Tutti», il nome scelto, o quanti. */
function summary(all: string, options: Option[], chosen: string[]): string {
    if (chosen.length === 0) return all;
    if (chosen.length === 1) return options.find(o => o.value === chosen[0])?.label ?? all;
    return `${chosen.length} scelti`;
}

/** Un menù a scelta multipla (funzione, non componente: una voce sola per file). */
function multiMenu({
    ariaLabel,
    all,
    options,
    chosen,
    onChange
}: {
    ariaLabel: string;
    all: string;
    options: Option[];
    chosen: string[];
    onChange: (next: string[]) => void;
}) {
    const toggle = (value: string) =>
        onChange(chosen.includes(value) ? chosen.filter(v => v !== value) : [...chosen, value]);
    const tick = (on: boolean) =>
        on ? (
            <>
                <Check size={16} aria-hidden="true" />
                <span className="visually-hidden">scelto</span>
            </>
        ) : null;
    return (
        <Menu
            align="end"
            trigger={
                <Button variant="secondary" size="sm" aria-label={`${ariaLabel}: ${summary(all, options, chosen)}`}>
                    <span className={styles.filterTrigger}>
                        {summary(all, options, chosen)}
                        <ChevronDown size={14} aria-hidden="true" />
                    </span>
                </Button>
            }
        >
            {/* Il menù resta aperto: si sceglie più di una voce. */}
            <Menu.Item
                onSelect={e => {
                    e.preventDefault();
                    onChange([]);
                }}
                trailing={tick(chosen.length === 0)}
            >
                {all}
            </Menu.Item>
            <Menu.Separator />
            {options.map(o => (
                <Menu.Item
                    key={o.value}
                    leading={o.icon}
                    onSelect={e => {
                        e.preventDefault();
                        toggle(o.value);
                    }}
                    trailing={tick(chosen.includes(o.value))}
                >
                    {o.label}
                </Menu.Item>
            ))}
        </Menu>
    );
}

/**
 * I filtri delle spese in alto a destra delle schede (Alex, 2026-10-16): chi
 * paga e tipo, a scelta multipla, validi in tutte le schede. Una persona ha
 * l'icona della persona, i conti comuni quella delle due persone, i tipi la
 * loro.
 */
export function ExpenseFilterMenus({
    team,
    who,
    types,
    onChange
}: {
    team: string[];
    who: string[];
    types: CrmExpenseCategory[];
    onChange: (values: { chi?: string[]; tipo?: string[] }) => void;
}) {
    const whoOptions: Option[] = [
        ...team.map(name => ({ value: name, label: name, icon: <User size={16} /> })),
        { value: JOINT_FILTER, label: "Conti comuni", icon: <Users size={16} /> }
    ];
    const typeOptions: Option[] = CRM_EXPENSE_CATEGORIES.map(c => {
        const { icon: Icon, label } = CATEGORY_META[c];
        return { value: c, label, icon: <Icon size={16} strokeWidth={1.75} /> };
    });
    return (
        <div className={styles.filterMenus}>
            {multiMenu({ ariaLabel: "Chi paga", all: "Tutti", options: whoOptions, chosen: who, onChange: v => onChange({ chi: v }) })}
            {multiMenu({
                ariaLabel: "Tipo di spesa",
                all: "Tutti i tipi",
                options: typeOptions,
                chosen: types,
                onChange: v => onChange({ tipo: v })
            })}
        </div>
    );
}
