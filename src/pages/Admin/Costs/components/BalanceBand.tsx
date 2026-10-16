import { CheckCircle2, Scale } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { formatEuroCents } from "@shared/crmExpenses";
import type { ExpenseBalance } from "@/utils/crm/expenseBalance";
import styles from "../Costs.module.scss";

/**
 * Il saldo fra voi in cima alla pagina (proposta 1 del 2026-10-16): è la cosa
 * che si guarda per prima, con l'unico gesto che chiude il conto. Il resto di
 * «Chi ha pagato» resta nella sua card.
 */
export function BalanceBand({
    balance,
    disabled,
    onSettle
}: {
    balance: ExpenseBalance;
    /** La tabella dei movimenti non c'è ancora: niente pareggio. */
    disabled: boolean;
    onSettle: () => void;
}) {
    const even = balance.transfers.length === 0;
    return (
        <section className={styles.balanceBand} data-even={even || undefined} aria-label="Il saldo fra voi">
            <span className={styles.balanceIcon} aria-hidden="true">
                {even ? <CheckCircle2 size={20} /> : <Scale size={20} />}
            </span>
            <div className={styles.balanceText}>
                <Text as="p" variant="body" weight={700} color="inherit">
                    {even
                        ? "Siete in pari"
                        : balance.transfers.map(t => `${t.from} deve ${formatEuroCents(t.amountCents)} a ${t.to}`).join(" · ")}
                </Text>
                <Text as="p" variant="caption" color="inherit" className={styles.balanceNote}>
                    {even
                        ? "Spese e movimenti fra voi si compensano."
                        : "Con un bonifico all'altro o un versamento sul conto comune, poi segnalo qui."}
                </Text>
            </div>
            {!even && (
                <Button variant="primary" size="sm" onClick={onSettle} disabled={disabled}>
                    Segna come pareggiato
                </Button>
            )}
        </section>
    );
}
