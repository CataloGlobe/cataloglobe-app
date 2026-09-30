import { StatCard } from "@/components/ui/StatCard/StatCard";
import Text from "@/components/ui/Text/Text";
import { calculateDelta, isBelowSample, SAMPLE_THRESHOLD } from "../utils/periodComparison";
import styles from "../Analytics.module.scss";

type Props = {
    visits: number;
    previousVisits: number | null;
    /** «negli ultimi 30 giorni», «oggi». */
    periodPhrase: string;
    /** «30 giorni prima». */
    previousPeriodLabel: string;
    sedeCount: number;
    isLoading: boolean;
};

const nf = new Intl.NumberFormat("it-IT");

/**
 * La banda del campione (§36.1/1–2): il denominatore di tutto il resto, prima
 * di ogni numero derivato. Una parola sola, «visite», definita qui; sotto le
 * 100 visite niente confronto fra periodi.
 */
export default function SampleBand({ visits, previousVisits, periodPhrase, previousPeriodLabel, sedeCount, isLoading }: Props) {
    const delta =
        !isBelowSample(visits) && previousVisits != null ? calculateDelta(visits, previousVisits) : null;
    return (
        <StatCard
            label="Visite"
            variant="hero"
            value={nf.format(visits)}
            loading={isLoading}
            delta={delta != null ? { value: delta, period: `vs ${previousPeriodLabel}` } : undefined}
        >
            <div className={styles.bandText}>
                <Text as="p" variant="body-sm">
                    {periodPhrase}, su {sedeCount} {sedeCount === 1 ? "sede" : "sedi"}.
                </Text>
                <Text as="p" variant="caption" colorVariant="muted">
                    Una visita è un&apos;apertura della pagina: la stessa persona che torna nel pomeriggio conta due
                    volte. Non misuriamo le persone.
                </Text>
                {isBelowSample(visits) && (
                    <Text as="p" variant="caption" colorVariant="muted">
                        Sotto le {SAMPLE_THRESHOLD} visite nel periodo non compaiono percentuali né confronti fra
                        periodi: su questi numeri direbbero il caso, non il vostro locale.
                    </Text>
                )}
            </div>
        </StatCard>
    );
}
