import Text from "@/components/ui/Text/Text";
import { CRM_EXPENSE_CATEGORIES, formatEuroCents } from "@shared/crmExpenses";
import { formatMonthIt, type CrmExpenseMonth } from "@/utils/crm/expenses";
import { CATEGORY_META } from "./expenseCategoryMeta";
import styles from "../Costs.module.scss";

function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Mese per mese diviso per tipo di spesa (proposta 13 del 2026-10-16): una
 * barra a pezzi per mese, la legenda con le stesse icone delle righe. SVG con
 * le misure negli attributi, i colori dal CSS.
 */
export function MonthsByCategory({
    months,
    scaleMax,
    legend = true,
    legendMonths,
    future = false
}: {
    months: CrmExpenseMonth[];
    /** La barra piena; senza, il mese più caro dell'elenco. */
    scaleMax?: number;
    legend?: boolean;
    /** I mesi da cui prendere i tipi della legenda; senza, `months`. */
    legendMonths?: CrmExpenseMonth[];
    /** Addebiti ancora da pagare: barre più chiare. */
    future?: boolean;
}) {
    const max = scaleMax ?? Math.max(1, ...months.map(m => m.totalCents));
    const usedIn = (list: CrmExpenseMonth[]) =>
        CRM_EXPENSE_CATEGORIES.filter(c => list.some(m => (m.byCategory[c] ?? 0) > 0));
    const used = usedIn(months);

    return (
        <div className={styles.monthsChart} data-future={future || undefined}>
            {legend && (
            <ul className={styles.legend} aria-label="Tipi di spesa">
                {usedIn(legendMonths ?? months).map(c => {
                    const { icon: Icon, label } = CATEGORY_META[c];
                    return (
                        <li key={c} className={styles.legendItem} data-tone={c}>
                            <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                            <Text as="span" variant="caption" color="inherit">
                                {label}
                            </Text>
                        </li>
                    );
                })}
            </ul>
            )}
            <ul className={styles.monthsRows}>
                {months.map(m => {
                    let x = 0;
                    const parts = used
                        .map(c => ({ c, cents: Math.max(0, m.byCategory[c] ?? 0) }))
                        .filter(p => p.cents > 0);
                    const description = parts.map(p => `${CATEGORY_META[p.c].label} ${formatEuroCents(p.cents)}`).join(", ");
                    return (
                        <li key={m.month} className={styles.monthsRow}>
                            <Text as="span" variant="body-sm" className={styles.ellipsis}>
                                {capitalize(formatMonthIt(m.month))}
                            </Text>
                            <svg
                                className={styles.monthsBar}
                                viewBox="0 0 100 10"
                                preserveAspectRatio="none"
                                role="img"
                                aria-label={description || "Nessuna spesa"}
                            >
                                {parts.map(p => {
                                    const width = (p.cents / max) * 100;
                                    const rect = <rect key={p.c} x={x} y={0} width={width} height={10} data-tone={p.c} />;
                                    x += width;
                                    return rect;
                                })}
                            </svg>
                            <Text as="span" variant="body-sm" weight={600} className={styles.figureValue}>
                                {formatEuroCents(m.totalCents)}
                            </Text>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
