import Text from "@/components/ui/Text/Text";
import { PlanSeatsSelector } from "@/components/ui/PlanSeatsSelector/PlanSeatsSelector";
import type { BillingInterval, Plan, PlanCode, PlanPrice } from "@/types/plan";
import type { SeatsPricing } from "@/utils/pricing";
import styles from "../CreateBusinessWizard.module.scss";

interface Step2PlanSeatsProps {
    plans: Plan[];
    planCode: PlanCode;
    onPlanChange: (code: PlanCode) => void;
    unitPriceCentsByPlan: Partial<Record<PlanCode, number>>;
    billingInterval: BillingInterval;
    availableIntervals: BillingInterval[];
    onIntervalChange: (interval: BillingInterval) => void;
    planPrices: PlanPrice[];
    seats: number;
    onSeatsChange: (value: number) => void;
    breakdown: SeatsPricing;
    maxSeats: number;
    overLimit: boolean;
    disabled: boolean;
}

export function Step2PlanSeats({
    plans,
    planCode,
    onPlanChange,
    unitPriceCentsByPlan,
    billingInterval,
    availableIntervals,
    onIntervalChange,
    planPrices,
    seats,
    onSeatsChange,
    breakdown,
    maxSeats,
    overLimit,
    disabled
}: Step2PlanSeatsProps) {
    return (
        <div className={styles.stepRoot}>
            <div className={styles.stepHeader}>
                <Text variant="title-sm" weight={700}>Scegli il piano e le sedi</Text>
                <span className={styles.stepSubtitle}>
                    Puoi cambiare piano o aggiungere sedi successivamente in qualsiasi momento.
                </span>
            </div>

            <PlanSeatsSelector
                plans={plans}
                planCode={planCode}
                onPlanChange={onPlanChange}
                unitPriceCentsByPlan={unitPriceCentsByPlan}
                billingInterval={billingInterval}
                availableIntervals={availableIntervals}
                onIntervalChange={onIntervalChange}
                planPrices={planPrices}
                seats={seats}
                onSeatsChange={onSeatsChange}
                breakdown={breakdown}
                overLimit={overLimit}
                maxSeats={maxSeats}
                minSeats={1}
                stepperMax={20}
                disabled={disabled}
            />
        </div>
    );
}
