import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import type { BillingInterval } from "@/types/plan";
import styles from "./BillingIntervalSwitch.module.scss";

/**
 * Interruttore mensile/annuale, unico per tutti i punti in cui compare
 * (selettore piano e sedi, pagina Abbonamento, landing).
 *
 * Le due etichette sono pari ("Mensile" / "Annuale") e il controllo è solo il
 * controllo: l'argomento di vendita dell'annuale vive nella card del piano,
 * come riga sotto il prezzo (vedi `yearlySavingsNote` in planPricing), non in
 * un badge ancorato fuori dal rettangolo.
 */

const INTERVAL_LABEL: Record<BillingInterval, string> = { month: "Mensile", year: "Annuale" };

export interface BillingIntervalSwitchProps {
    value: BillingInterval;
    onChange: (interval: BillingInterval) => void;
    /** Intervalli acquistabili, nell'ordine di visualizzazione. */
    intervals: BillingInterval[];
    className?: string;
}

export function BillingIntervalSwitch({ value, onChange, intervals, className }: BillingIntervalSwitchProps) {
    return (
        <div className={[styles.root, className].filter(Boolean).join(" ")}>
            <SegmentedControl<BillingInterval>
                value={value}
                onChange={onChange}
                options={intervals.map(interval => ({ value: interval, label: INTERVAL_LABEL[interval] }))}
            />
        </div>
    );
}
