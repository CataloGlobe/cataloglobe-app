import { AppWindow, ArrowLeftRight, Briefcase, Megaphone, Package, Receipt, type LucideIcon } from "lucide-react";
import type { CrmExpenseCategory } from "@/types/crm";
import styles from "../Costs.module.scss";

const CATEGORY_ICON: Record<CrmExpenseCategory, LucideIcon> = {
    software: AppWindow,
    advertising: Megaphone,
    services: Briefcase,
    hardware: Package,
    other: Receipt
};

/**
 * Il segno di una riga di spesa: un'icona per categoria, una sua per i soldi
 * passati fra voi (Alex, 2026-10-16: Ferdinando non è un abbonamento, e un
 * movimento non è una spesa). Solo aspetto: il nome lo dice la riga.
 */
export function ExpenseIcon({ category, move = false }: { category?: CrmExpenseCategory; move?: boolean }) {
    const Icon = move ? ArrowLeftRight : CATEGORY_ICON[category ?? "other"];
    return (
        <span className={styles.mark} data-tone={move ? "move" : (category ?? "other")} aria-hidden="true">
            <Icon size={16} strokeWidth={1.75} />
        </span>
    );
}
