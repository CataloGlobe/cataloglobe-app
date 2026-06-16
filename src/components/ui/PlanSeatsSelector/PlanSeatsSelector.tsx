import type { ReactNode } from "react";
import { Check } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { SeatsInput } from "@/components/ui/SeatsInput/SeatsInput";
import type { Plan, PlanCode } from "@/types/plan";
import type { GraduatedBreakdown } from "@/utils/pricing";
import { DEFAULT_PLAN_FEATURES, DEFAULT_PLAN_BADGES } from "./planDefaults";
import styles from "./PlanSeatsSelector.module.scss";

/**
 * Selettore condiviso piano + numero sedi con stima prezzo graduated.
 *
 * Componente PURO e controllato (nessuno stato interno): è usato sia
 * dall'onboarding (CreateBusinessWizard → Step2PlanSeats) sia dal flusso
 * "Modifica piano" self-service nella pagina Abbonamento.
 *
 * Features/badge per piano sono PROP (con default in ./planDefaults), non
 * cablati nel render. `maxSeats` = cap self-service (es. max_self_service_seats);
 * `stepperMax` = limite duro dello stepper (può superare il cap per mostrare
 * il box "contattaci", come fa l'onboarding).
 */

function formatEuro(value: number): string {
    return `€${value.toFixed(2).replace(".", ",")}`;
}

export interface PlanSeatsSelectorProps {
    plans: Plan[];
    planCode: PlanCode;
    onPlanChange: (code: PlanCode) => void;
    seats: number;
    onSeatsChange: (value: number) => void;
    breakdown: GraduatedBreakdown;
    discountPercent: number;
    /** Vero quando `seats` supera il cap self-service: mostra il box "contattaci". */
    overLimit: boolean;
    /** Cap self-service (mostrato nel testo del box over-limit). */
    maxSeats: number;
    /** Floor dello stepper (default 1). */
    minSeats?: number;
    /** Limite duro dello stepper (default = maxSeats). */
    stepperMax?: number;
    disabled?: boolean;
    planFeatures?: Partial<Record<PlanCode, string[]>>;
    planBadges?: Partial<Record<PlanCode, string>>;
    /** Slot opzionale sotto il pannello sedi (es. hint assistenza). */
    footerHint?: ReactNode;
}

export function PlanSeatsSelector({
    plans,
    planCode,
    onPlanChange,
    seats,
    onSeatsChange,
    breakdown,
    discountPercent,
    overLimit,
    maxSeats,
    minSeats = 1,
    stepperMax,
    disabled = false,
    planFeatures = DEFAULT_PLAN_FEATURES,
    planBadges = DEFAULT_PLAN_BADGES,
    footerHint
}: PlanSeatsSelectorProps) {
    const seatStepperMax = stepperMax ?? maxSeats;

    return (
        <div className={styles.root}>
            <div className={styles.planGrid}>
                {plans.map(plan => {
                    const selected = plan.code === planCode;
                    const features = planFeatures[plan.code] ?? [];
                    const badge = planBadges[plan.code];
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
                        min={minSeats}
                        max={seatStepperMax}
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

                {footerHint}
            </div>
        </div>
    );
}
