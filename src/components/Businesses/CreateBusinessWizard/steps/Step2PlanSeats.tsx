import { Check } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { SeatsInput } from "@/components/ui/SeatsInput/SeatsInput";
import type { Plan, PlanCode } from "@/types/plan";
import type { GraduatedBreakdown } from "@/utils/pricing";
import styles from "../CreateBusinessWizard.module.scss";

interface Step2PlanSeatsProps {
    plans: Plan[];
    planCode: PlanCode;
    onPlanChange: (code: PlanCode) => void;
    seats: number;
    onSeatsChange: (value: number) => void;
    breakdown: GraduatedBreakdown;
    maxSeats: number;
    discountPercent: number;
    overLimit: boolean;
    disabled: boolean;
}

const PLAN_FEATURES: Record<PlanCode, string[]> = {
    base: [
        "Menu digitale illimitato",
        "QR code per ogni sede",
        "Programmazione visibilità",
        "Gestione catalogo (prodotti, categorie, varianti)",
        "Stili e branding personalizzati",
        "Multilingua",
        "Analitiche e recensioni",
    ],
    pro: [
        "Tutto del piano Base",
        "Prenotazione tavolo",
        "Ordinazione al tavolo",
        "Gestione sale e tavoli",
    ],
};

const PLAN_BADGE: Partial<Record<PlanCode, string>> = {
    pro: "Più scelto",
};

function formatEuro(value: number): string {
    return `€${value.toFixed(2).replace(".", ",")}`;
}

export function Step2PlanSeats({
    plans,
    planCode,
    onPlanChange,
    seats,
    onSeatsChange,
    breakdown,
    maxSeats,
    discountPercent,
    overLimit,
    disabled,
}: Step2PlanSeatsProps) {
    return (
        <div className={styles.stepRoot}>
            <div className={styles.stepHeader}>
                <Text variant="title-sm" weight={700}>Scegli il piano e le sedi</Text>
                <span className={styles.stepSubtitle}>
                    Puoi cambiare piano o aggiungere sedi successivamente in qualsiasi momento.
                </span>
            </div>

            <div className={styles.planGrid}>
                {plans.map(plan => {
                    const selected = plan.code === planCode;
                    const features = PLAN_FEATURES[plan.code] ?? [];
                    const badge = PLAN_BADGE[plan.code];
                    const monthly = (plan.monthly_price_cents ?? 0) / 100;
                    return (
                        <button
                            type="button"
                            key={plan.code}
                            onClick={() => onPlanChange(plan.code)}
                            disabled={disabled}
                            aria-pressed={selected}
                            className={`${styles.planCard} ${selected ? styles.planCardSelected : ""}`}
                        >
                            {badge && <span className={styles.planBadge}>{badge}</span>}
                            <span className={styles.planName}>{plan.name}</span>
                            <span className={styles.planPrice}>
                                <span className={styles.planPriceValue}>€{Math.round(monthly)}</span>
                                <span className={styles.planPriceUnit}>/sede/mese</span>
                            </span>
                            {plan.description && (
                                <span className={styles.planDescription}>{plan.description}</span>
                            )}
                            <ul className={styles.planFeatures}>
                                {features.map(f => (
                                    <li key={f} className={styles.planFeature}>
                                        <Check size={16} className={styles.planFeatureIcon} aria-hidden />
                                        <span>{f}</span>
                                    </li>
                                ))}
                            </ul>
                        </button>
                    );
                })}
            </div>

            <div className={styles.seatsPanel}>
                <div className={styles.seatsHeader}>
                    <Text variant="body" weight={600}>Numero di sedi</Text>
                    <span className={styles.seatsHint}>
                        Sconto del {discountPercent}% dalla seconda sede in poi.
                    </span>
                </div>

                <div className={styles.seatsRow}>
                    <SeatsInput
                        value={seats}
                        onChange={onSeatsChange}
                        min={1}
                        max={20}
                        disabled={disabled}
                    />
                    <span className={styles.seatsUnit}>
                        {seats === 1 ? "sede" : "sedi"}
                    </span>
                </div>

                {!overLimit && (
                    <div className={styles.breakdownBox}>
                        {breakdown.lines.map(line => (
                            <div key={line.seat} className={styles.breakdownRow}>
                                <span className={styles.breakdownLabel}>
                                    {line.seat === 1 ? "1ª sede" : `${line.seat}ª sede`}
                                    {line.discounted && (
                                        <span className={styles.breakdownDiscountChip}>
                                            −{discountPercent}%
                                        </span>
                                    )}
                                </span>
                                <span>{formatEuro(line.unitPrice)}</span>
                            </div>
                        ))}
                        <div className={styles.breakdownTotalRow}>
                            <span>Totale mensile</span>
                            <span>{formatEuro(breakdown.subtotal)}</span>
                        </div>
                    </div>
                )}

                {overLimit && (
                    <div className={styles.overLimit}>
                        <span className={styles.overLimitTitle}>
                            Hai più di {maxSeats} sedi?
                        </span>
                        <span className={styles.overLimitText}>
                            Per attività con più sedi offriamo condizioni dedicate e supporto personalizzato. Contattaci per un'offerta su misura.
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
