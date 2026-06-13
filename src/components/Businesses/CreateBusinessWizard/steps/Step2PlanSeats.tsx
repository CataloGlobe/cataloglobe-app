import Text from "@/components/ui/Text/Text";
import { PlanSeatsSelector } from "@/components/ui/PlanSeatsSelector/PlanSeatsSelector";
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
                seats={seats}
                onSeatsChange={onSeatsChange}
                breakdown={breakdown}
                discountPercent={discountPercent}
                overLimit={overLimit}
                maxSeats={maxSeats}
                minSeats={1}
                stepperMax={20}
                disabled={disabled}
            />
        </div>
    );
}
