import type { ReactNode } from "react";
import { Check } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { SeatsInput } from "@/components/ui/SeatsInput/SeatsInput";
import { Mail } from "lucide-react";
import { COMPANY } from "@/config/company";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import type { BillingInterval, Plan, PlanCode } from "@/types/plan";
import type { GraduatedBreakdown } from "@/utils/pricing";
import { INTERVAL_PERIOD_NOUN } from "@/utils/planPricing";
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

/** Whole euros for the big price figure ("€39", "€390"). */
function formatEuroWhole(cents: number): string {
    return `€${Math.round(cents / 100)}`;
}

const INTERVAL_TOTAL_LABEL: Record<BillingInterval, string> = { month: "Totale mensile", year: "Totale annuale" };
const INTERVAL_OPTION_LABEL: Record<BillingInterval, string> = { month: "Mensile", year: "Annuale · 2 mesi gratis" };

/** Costruisce un mailto precompilato per richiesta offerta multi-sede. */
function buildMultiSeatQuoteMailto(seats: number, planName: string | undefined): string {
    const subject = "Richiesta offerta multi-sede — CataloGlobe";
    const planPart = planName ? ` sul piano ${planName}` : "";
    const body =
        `Salve, sono interessato a un'offerta dedicata per ${seats} sedi${planPart}. ` +
        `Vi lascio i miei riferimenti per essere ricontattato.`;
    return `mailto:${COMPANY.contact.support}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export interface PlanSeatsSelectorProps {
    plans: Plan[];
    planCode: PlanCode;
    onPlanChange: (code: PlanCode) => void;
    /** First-seat unit price per plan for the CURRENT interval, in cents (from `plan_prices`). */
    unitPriceCentsByPlan: Partial<Record<PlanCode, number>>;
    /** Current billing interval. Drives the price unit and the total label. Default "month". */
    billingInterval?: BillingInterval;
    /**
     * Intervals the customer can actually buy. The switch is rendered only when
     * there is more than one; with a single interval the selector looks exactly
     * as it did before the yearly option existed.
     */
    availableIntervals?: BillingInterval[];
    onIntervalChange?: (interval: BillingInterval) => void;
    /** Per plan, what the same period would cost paying month by month (yearly only), in cents. */
    monthByMonthCentsByPlan?: Partial<Record<PlanCode, number>>;
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
    unitPriceCentsByPlan,
    billingInterval = "month",
    availableIntervals = ["month"],
    onIntervalChange,
    monthByMonthCentsByPlan = {},
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
    const showIntervalSwitch = availableIntervals.length > 1 && !!onIntervalChange;

    return (
        <div className={styles.root}>
            {showIntervalSwitch && (
                <div className={styles.intervalSwitch}>
                    <SegmentedControl<BillingInterval>
                        value={billingInterval}
                        onChange={onIntervalChange}
                        options={availableIntervals.map(interval => ({
                            value: interval,
                            label: INTERVAL_OPTION_LABEL[interval]
                        }))}
                    />
                </div>
            )}

            <div className={styles.planGrid}>
                {plans.map(plan => {
                    const selected = plan.code === planCode;
                    const features = planFeatures[plan.code] ?? [];
                    const badge = planBadges[plan.code];
                    const unitCents = unitPriceCentsByPlan[plan.code] ?? 0;
                    const monthByMonthCents = monthByMonthCentsByPlan[plan.code];
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
                                <span className={styles.planPriceValue}>{formatEuroWhole(unitCents)}</span>
                                <span className={styles.planPriceUnit}>{`/sede/${INTERVAL_PERIOD_NOUN[billingInterval]}`}</span>
                            </span>
                            {monthByMonthCents !== undefined && (
                                <span className={styles.planPriceCompare}>
                                    {formatEuroWhole(monthByMonthCents)} pagando mese per mese
                                </span>
                            )}
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
                            <span>{INTERVAL_TOTAL_LABEL[billingInterval]}</span>
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
                        <a
                            className={styles.overLimitButton}
                            href={buildMultiSeatQuoteMailto(
                                seats,
                                plans.find(p => p.code === planCode)?.name
                            )}
                        >
                            <Mail size={16} aria-hidden />
                            <span>Richiedi un'offerta</span>
                        </a>
                    </div>
                )}

                {footerHint}
            </div>
        </div>
    );
}
