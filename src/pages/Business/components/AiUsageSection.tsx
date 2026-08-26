import { Sparkles, AlertTriangle } from "lucide-react";
import Text from "@/components/ui/Text/Text";
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
 * Sezione "Utilizzo AI" nella pagina Abbonamento — fonte di verità permanente
 * dello stato quota. Solo percentuali e linguaggio naturale: mai costi/valute/
 * token (vincolo FASE 5). Legge `usage` dall'Outlet context (fetch unico in
 * MainLayout). Ancora `#utilizzo-ai` per il deep-link dalla pill dell'header.
 */
export function AiUsageSection({ usage, planName, seats }: AiUsageSectionProps) {
    // Nessun dato ancora (primo fetch/errore transitorio): non mostrare un box
    // vuoto. La pagina Abbonamento resta completa senza questa sezione.
    if (!usage) return null;

    const seatsLabel = `${seats} ${seats === 1 ? "sede" : "sedi"}`;
    const subtitle = `Incluso nel tuo piano ${planName} · ${seatsLabel}`;

    const header = (
        <div className={styles.sectionHeader}>
            <Sparkles size={18} />
            <Text variant="title-sm" weight={600}>
                Utilizzo AI
            </Text>
        </div>
    );

    // Tenant senza diritto al servizio: messaggio distinto, NON una barra a zero.
    if (usage.status === "not_eligible" || !usage.eligible) {
        return (
            <section id="utilizzo-ai" className={styles.section}>
                {header}
                <Text variant="body-sm" colorVariant="muted">
                    {subtitle}
                </Text>
                <div className={styles.notEligible}>
                    <AlertTriangle size={16} />
                    <Text variant="body-sm" weight={500}>
                        L&apos;AI è disponibile con un abbonamento attivo. Riattiva l&apos;abbonamento
                        per usare import menù, descrizioni e traduzioni automatiche.
                    </Text>
                </div>
            </section>
        );
    }

    const isWarning = usage.status === "warning";
    const isBlocked = usage.status === "blocked";
    const percentText = formatUsagePercent(usage.percent);
    // La barra si ferma visivamente al 100% anche a quota superata.
    const fillWidth = Math.min(100, Math.max(0, Math.round(usage.percent ?? 0)));
    const detail = buildUsageDetail(usage);

    return (
        <section id="utilizzo-ai" className={styles.section}>
            {header}
            <Text variant="body-sm" colorVariant="muted">
                {subtitle}
            </Text>

            <div className={styles.meter}>
                <div className={styles.percentRow}>
                    <span
                        className={`${styles.percent} ${
                            isBlocked ? styles.percentBlocked : isWarning ? styles.percentWarning : ""
                        }`}
                    >
                        {percentText}
                    </span>
                    <Text variant="body-sm" colorVariant="muted">
                        Si azzera il {formatResetDate(usage.resetAt)}
                    </Text>
                </div>

                <div className={styles.barTrack}>
                    <div
                        className={`${styles.barFill} ${
                            isBlocked ? styles.barBlocked : isWarning ? styles.barWarning : ""
                        }`}
                        style={{ width: `${fillWidth}%` }}
                    />
                </div>
            </div>

            {isWarning && (
                <div className={styles.noteWarning}>
                    <AlertTriangle size={16} />
                    <Text variant="body-sm" weight={500}>
                        Ci siamo quasi: stai per esaurire l&apos;AI di questo mese.
                    </Text>
                </div>
            )}

            {isBlocked && (
                <div className={styles.noteBlocked}>
                    <AlertTriangle size={16} />
                    <Text variant="body-sm" weight={500}>
                        Hai esaurito l&apos;AI di questo mese. Riparte il {formatResetDate(usage.resetAt)}.
                    </Text>
                </div>
            )}

            {detail.length > 0 && (
                <div className={styles.detail}>
                    <Text variant="caption" colorVariant="muted" weight={600}>
                        Dettaglio
                    </Text>
                    <ul className={styles.detailList}>
                        {detail.map(row => (
                            <li key={row.operation} className={styles.detailRow}>
                                <Text variant="body-sm">{row.label}</Text>
                                <div className={styles.detailBarTrack}>
                                    <div
                                        className={styles.detailBarFill}
                                        style={{ width: `${Math.min(100, row.percent)}%` }}
                                    />
                                </div>
                                <Text variant="body-sm" colorVariant="muted" className={styles.detailPercent}>
                                    {row.percentLabel}
                                </Text>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}
