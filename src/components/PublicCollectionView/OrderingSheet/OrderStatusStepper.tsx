import { Fragment, useEffect, useState } from "react";
import { Check, Clock, ChefHat, BellRing } from "lucide-react";
import type { SessionOrderSummary } from "@/types/orders";
import styles from "./OrderStatusStepper.module.scss";

interface Props {
    order: SessionOrderSummary;
}

type StepState = "done" | "active" | "pending";
type StepIcon = "check" | "clock" | "chef-hat" | "bell-ring";

interface StepDef {
    label: string;
    state: StepState;
    icon: StepIcon;
}

function computeSteps(order: SessionOrderSummary): StepDef[] {
    if (order.status === "submitted") {
        return [
            { label: "Inviato", state: "active", icon: "clock" },
            { label: "In cucina", state: "pending", icon: "chef-hat" },
            { label: "Pronto", state: "pending", icon: "bell-ring" },
            { label: "Consegnato", state: "pending", icon: "check" }
        ];
    }
    if (order.status === "acknowledged") {
        return [
            { label: "Inviato", state: "done", icon: "check" },
            { label: "In cucina", state: "active", icon: "chef-hat" },
            { label: "Pronto", state: "pending", icon: "bell-ring" },
            { label: "Consegnato", state: "pending", icon: "check" }
        ];
    }
    if (order.status === "ready") {
        return [
            { label: "Inviato", state: "done", icon: "check" },
            { label: "In cucina", state: "done", icon: "check" },
            { label: "Pronto", state: "active", icon: "bell-ring" },
            { label: "Consegnato", state: "pending", icon: "check" }
        ];
    }
    if (order.status === "delivered") {
        return [
            { label: "Inviato", state: "done", icon: "check" },
            { label: "In cucina", state: "done", icon: "check" },
            { label: "Pronto", state: "done", icon: "check" },
            { label: "Consegnato", state: "done", icon: "check" }
        ];
    }
    // Fallback (cancelled gestito a livello parent, ma safety)
    return [
        { label: "Inviato", state: "done", icon: "check" },
        { label: "In cucina", state: "pending", icon: "chef-hat" },
        { label: "Pronto", state: "pending", icon: "bell-ring" },
        { label: "Consegnato", state: "pending", icon: "check" }
    ];
}

function formatMinutesSince(iso: string | null): number | null {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    return minutes >= 0 ? minutes : 0;
}

function renderIcon(icon: StepIcon, size: number) {
    if (icon === "check") return <Check size={size} />;
    if (icon === "clock") return <Clock size={size} />;
    if (icon === "bell-ring") return <BellRing size={size} />;
    return <ChefHat size={size} />;
}

export default function OrderStatusStepper({ order }: Props) {
    // Re-render ogni 30s quando acknowledged per aggiornare "da N min".
    // Tick state silenzioso, unused-let by design (effect = trigger re-render).
    const [, setTick] = useState(0);
    useEffect(() => {
        if (order.status !== "acknowledged") return;
        const interval = setInterval(() => setTick(t => t + 1), 30_000);
        return () => clearInterval(interval);
    }, [order.status]);

    const steps = computeSteps(order);

    const minutesInKitchen =
        order.status === "acknowledged"
            ? formatMinutesSince(order.acknowledged_at)
            : null;

    return (
        <div className={styles.stepper} role="status" aria-live="polite">
            <div className={styles.row}>
                {steps.map((step, idx) => (
                    <Fragment key={idx}>
                        <div className={`${styles.step} ${styles[`step--${step.state}`]}`}>
                            <div className={styles.dot}>
                                {step.state !== "pending" && renderIcon(step.icon, 14)}
                                {step.state === "active" && (
                                    <span className={styles.pulse} aria-hidden="true" />
                                )}
                            </div>
                            <div className={styles.label}>{step.label}</div>
                        </div>
                        {idx < steps.length - 1 && (
                            <div
                                className={`${styles.connector} ${
                                    steps[idx + 1].state !== "pending" || step.state === "done"
                                        ? styles["connector--done"]
                                        : ""
                                }`}
                            />
                        )}
                    </Fragment>
                ))}
            </div>
            {minutesInKitchen !== null && (
                <div className={styles.kitchenTime}>
                    In preparazione da {minutesInKitchen}{" "}
                    {minutesInKitchen === 1 ? "minuto" : "minuti"}
                </div>
            )}
        </div>
    );
}
