import { Check } from "lucide-react";
import styles from "../aiMenuImport.module.scss";

type StepDef = { key: string; label: string };

const STEPS: StepDef[] = [
    { key: "upload", label: "Caricamento" },
    { key: "analyzing", label: "Analisi" },
    { key: "review", label: "Revisione" }
];

interface StepIndicatorProps {
    current: string;
}

export function StepIndicator({ current }: StepIndicatorProps) {
    const currentIdx = STEPS.findIndex(s => s.key === current);

    return (
        <div className={styles.stepIndicator}>
            {STEPS.map((step, i) => {
                const isComplete = i < currentIdx;
                const isActive = i === currentIdx;

                return (
                    <div key={step.key} className={styles.stepItem}>
                        {i > 0 && (
                            <div
                                className={`${styles.stepLine} ${isComplete ? styles.stepLineComplete : ""}`}
                            />
                        )}
                        <span
                            className={[
                                styles.stepCircle,
                                isActive ? styles.stepCircleActive : "",
                                isComplete ? styles.stepCircleComplete : ""
                            ]
                                .filter(Boolean)
                                .join(" ")}
                        >
                            {isComplete ? <Check size={14} strokeWidth={3} /> : i + 1}
                        </span>
                        <span
                            className={[
                                styles.stepLabel,
                                isActive ? styles.stepLabelActive : "",
                                isComplete ? styles.stepLabelComplete : ""
                            ]
                                .filter(Boolean)
                                .join(" ")}
                        >
                            {step.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
