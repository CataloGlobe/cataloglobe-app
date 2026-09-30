import Text from "@/components/ui/Text/Text";
import { Card } from "@/components/ui/Card/Card";
import { ProgressBar } from "@/components/ui/ProgressBar/ProgressBar";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import type { AiUsageCycle } from "@/types/aiUsage";
import { buildUsageDetail, formatResetDate, formatUsagePercent } from "@/utils/aiUsage";
import styles from "./AiUsageSection.module.scss";

interface AiUsageSectionProps {
    usage: AiUsageCycle | null;
    /** Nome piano leggibile (es. "Pro"), dalla pagina Abbonamento. */
    planName: string;
    /** Numero sedi pagate. */
    seats: number;
}

/**
 * Card «Credito AI» nella pagina Abbonamento — fonte di verità permanente
 * dello stato quota. Solo percentuali e linguaggio naturale: mai costi/valute/
 * token (vincolo FASE 5, §37.7 rettificata). Legge `usage` dall'Outlet
 * context (fetch unico in MainLayout). Ancora `#utilizzo-ai` per il deep-link
 * dalla pill dell'header.
 */
export function AiUsageSection({ usage, planName, seats }: AiUsageSectionProps) {
    const subtitle = `Incluso nel piano ${planName} · ${seats} ${seats === 1 ? "sede" : "sedi"}`;

    // Nessun dato ancora (primo fetch): la card resta, con la forma di quello
    // che arriva.
    if (!usage) {
        return (
            <section id="utilizzo-ai" className={styles.anchor}>
                <Card title="Credito AI" subtitle={subtitle}>
                    <div className={styles.skeleton}>
                        <Skeleton height="16px" width="30%" />
                        <Skeleton height="6px" radius="var(--radius-pill)" />
                    </div>
                </Card>
            </section>
        );
    }

    // Tenant senza diritto al servizio: messaggio distinto, NON una barra a zero.
    if (usage.status === "not_eligible" || !usage.eligible) {
        return (
            <section id="utilizzo-ai" className={styles.anchor}>
                <Card title="Credito AI" subtitle={subtitle}>
                    <InlineBanner variant="warning">
                        L&apos;AI è disponibile con un abbonamento attivo. Riattivalo per usare import menù, descrizioni
                        e traduzioni automatiche.
                    </InlineBanner>
                </Card>
            </section>
        );
    }

    const isWarning = usage.status === "warning";
    const isBlocked = usage.status === "blocked";
    const percent = Math.min(100, Math.max(0, Math.round(usage.percent ?? 0)));
    const detail = buildUsageDetail(usage);

    return (
        <section id="utilizzo-ai" className={styles.anchor}>
            <Card title="Credito AI" subtitle={subtitle}>
                <div className={styles.body}>
                    <ProgressBar
                        value={percent}
                        max={100}
                        variant={isBlocked || isWarning ? "warning" : "brand"}
                        label={formatUsagePercent(usage.percent)}
                        aria-label="Credito AI usato questo mese"
                    />
                    <Text as="p" variant="caption" colorVariant="muted">
                        Si azzera il {formatResetDate(usage.resetAt)}
                    </Text>

                    {isWarning && (
                        <InlineBanner variant="warning">
                            Ci siamo quasi: stai per esaurire l&apos;AI di questo mese.
                        </InlineBanner>
                    )}
                    {isBlocked && (
                        <InlineBanner variant="error">
                            Hai esaurito l&apos;AI di questo mese. Riparte il {formatResetDate(usage.resetAt)}.
                        </InlineBanner>
                    )}

                    {detail.length > 0 && (
                        <div className={styles.detail}>
                            <Text as="p" variant="caption" colorVariant="muted" weight={600}>
                                Dettaglio
                            </Text>
                            <ul className={styles.detailList}>
                                {detail.map(row => (
                                    <li key={row.operation} className={styles.detailRow}>
                                        <Text as="span" variant="body-sm" className={styles.detailLabel}>
                                            {row.label}
                                        </Text>
                                        <ProgressBar
                                            value={Math.min(100, row.percent)}
                                            max={100}
                                            label={row.percentLabel}
                                            inline
                                            aria-label={row.label}
                                            className={styles.detailBar}
                                        />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </Card>
        </section>
    );
}
