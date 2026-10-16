import { ArrowLeftRight } from "lucide-react";
import type { CrmExpenseCategory } from "@/types/crm";
import { CATEGORY_META } from "./expenseCategoryMeta";
import styles from "../Costs.module.scss";

/**
 * Il segno di una riga di spesa: un'icona per tipo di spesa, una sua per i
 * soldi passati fra voi (Alex, 2026-10-16: un movimento non è una spesa).
 * Solo aspetto: il nome lo dice la riga.
 */
export function ExpenseIcon({ category, move = false }: { category?: CrmExpenseCategory; move?: boolean }) {
    const Icon = move ? ArrowLeftRight : CATEGORY_META[category ?? "other"].icon;
    return (
        <span className={styles.mark} data-tone={move ? "move" : (category ?? "other")} aria-hidden="true">
            <Icon size={16} strokeWidth={1.75} />
        </span>
    );
}
