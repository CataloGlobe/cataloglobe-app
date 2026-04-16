import type { FunnelStep } from "@/services/supabase/analytics";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    data: FunnelStep[];
    isLoading: boolean;
};

const stepColors: Record<string, string> = {
    page_view: "#1C1917",
    product_detail_open: "#57534E",
    selection_add: "#A8A29E"
};

export default function ConversionFunnel({ data, isLoading }: Props) {
    if (isLoading) {
        return (
            <article className={styles.chartCard} aria-label="Funnel di conversione">
                <header className={styles.chartCardHeader}>
                    <Text variant="title-sm" align="left">
                        Funnel di conversione
                    </Text>
                </header>
                <div className={styles.chartCardBody}>
                    <div className={styles.funnelSkeletons}>
                        {Array.from({ length: 3 }, (_, i) => (
                            <Skeleton key={i} height="52px" radius="8px" />
                        ))}
                    </div>
                </div>
            </article>
        );
    }

    if (data.length === 0) {
        return (
            <article className={styles.chartCard} aria-label="Funnel di conversione">
                <header className={styles.chartCardHeader}>
                    <Text variant="title-sm" align="left">
                        Funnel di conversione
                    </Text>
                </header>
                <div className={styles.chartCardBody}>
                    <div className={styles.chartEmpty}>
                        <Text variant="body" colorVariant="muted">
                            Nessun dato nel periodo selezionato
                        </Text>
                    </div>
                </div>
            </article>
        );
    }

    const lastStep = data[data.length - 1];
    const conversionText = lastStep.percentage > 0
        ? `Il ${lastStep.percentage.toFixed(1)}% dei visitatori aggiunge prodotti alla selezione`
        : "Nessun visitatore ha aggiunto prodotti alla selezione";

    const stepLabels: Record<string, string> = {
        page_view: "Visite",
        product_detail_open: "Dettaglio prodotto",
        selection_add: "Aggiunti alla selezione"
    };

    return (
        <article className={styles.chartCard} aria-label="Funnel di conversione">
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    Funnel di conversione
                </Text>
            </header>
            <div className={styles.chartCardBody}>
                <div className={styles.funnelContent}>
                    <div className={styles.funnelSteps}>
                        {data.map((step, index) => {
                            const color = stepColors[step.step_name] || "#1C1917";
                            const label = stepLabels[step.step_name] || step.step_label;
                            return (
                                <div key={step.step_name} className={styles.funnelStep}>
                                    <div className={styles.funnelStepLabel}>
                                        {label}
                                        {index > 0 && (
                                            <span className={styles.funnelStepPct}>
                                                {" · "}{step.percentage.toFixed(1)}%
                                            </span>
                                        )}
                                    </div>
                                    <div className={styles.funnelStepBar}>
                                        <div
                                            className={styles.funnelStepBarFill}
                                            style={{
                                                width: `${step.percentage}%`,
                                                backgroundColor: color
                                            }}
                                        />
                                    </div>
                                    <div className={styles.funnelStepCount}>{step.session_count}</div>
                                </div>
                            );
                        })}
                    </div>

                    <div className={styles.funnelSummary}>
                        <Text variant="body" colorVariant="muted">
                            {conversionText}
                        </Text>
                    </div>
                </div>
            </div>
        </article>
    );
}
