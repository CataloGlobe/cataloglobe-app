import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import type { BillingInterval } from "@/types/plan";
import styles from "./BillingIntervalSwitch.module.scss";

/**
 * Interruttore mensile/annuale, unico per tutti i punti in cui compare
 * (selettore piano e sedi, pagina Abbonamento, landing).
 *
 * Le due etichette sono pari ("Mensile" / "Annuale"): l'argomento di vendita
 * dell'annuale vive in un badge ancorato sopra il controllo, allineato a
 * destra, sempre visibile — invita, non conferma una scelta già fatta.
 * Il badge sta fuori dal track del SegmentedControl (che scorre e taglia) e
 * il wrapper riserva lo spazio in alto, così sborda sul controllo ma non sui
 * vicini.
 */

const INTERVAL_LABEL: Record<BillingInterval, string> = { month: "Mensile", year: "Annuale" };

/** Argomento dell'annuale: 12 mesi al prezzo di 10 (390 vs 12 × 39). */
const YEARLY_BADGE = "2 mesi gratis";

export interface BillingIntervalSwitchProps {
    value: BillingInterval;
    onChange: (interval: BillingInterval) => void;
    /** Intervalli acquistabili, nell'ordine di visualizzazione. */
    intervals: BillingInterval[];
    className?: string;
}

export function BillingIntervalSwitch({ value, onChange, intervals, className }: BillingIntervalSwitchProps) {
    const showBadge = intervals.includes("year");
    return (
        <div className={[styles.root, className].filter(Boolean).join(" ")}>
            <SegmentedControl<BillingInterval>
                value={value}
                onChange={onChange}
                options={intervals.map(interval => ({ value: interval, label: INTERVAL_LABEL[interval] }))}
            />
            {showBadge && <span className={styles.badge}>{YEARLY_BADGE}</span>}
        </div>
    );
}
