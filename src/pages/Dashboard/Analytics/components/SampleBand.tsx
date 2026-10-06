import { StatCard } from "@/components/ui/StatCard/StatCard";
import Text from "@/components/ui/Text/Text";
import { calculateDelta, isBelowSample, SAMPLE_THRESHOLD } from "../utils/periodComparison";
import styles from "../Analytics.module.scss";

type Props = {
    visits: number;
    previousVisits: number | null;
    /** Media degli eventi per visita. */
    eventsPerVisit: number;
    /** Visite arrivate ad aggiungere qualcosa alla selezione, e la loro %. */
    selections: number;
    selectionPct: number;
    /** «negli ultimi 30 giorni», «oggi». */
    periodPhrase: string;
    /** «30 giorni prima». */
    previousPeriodLabel: string;
    sedeCount: number;
    isLoading: boolean;
};

const nf = new Intl.NumberFormat("it-IT");

/**
 * Il primo blocco, «Pagina pubblica» (§36.1/1–2, correzioni UI T15 AN2): il
 * campione prima di ogni numero derivato, poi i numeri chiave in una riga
 * sola, come Ordini e Prenotazioni. Cosa conta come visita lo dice la frase
 * sotto il titolo; sotto le 100 visite niente confronti né percentuali.
 */
export default function SampleBand({
    visits,
    previousVisits,
    eventsPerVisit,
    selections,
    selectionPct,
    periodPhrase,
    previousPeriodLabel,
    sedeCount,
    isLoading
}: Props) {
    const small = isBelowSample(visits);
    const delta = !small && previousVisits != null ? calculateDelta(visits, previousVisits) : null;
    return (
        <section className={styles.section} aria-label="Pagina pubblica">
            <div className={styles.bandText}>
                <Text as="h2" variant="title-sm" weight={600}>
                    Pagina pubblica
                </Text>
                <Text as="p" variant="caption" colorVariant="muted">
                    {periodPhrase}, su {sedeCount} {sedeCount === 1 ? "sede" : "sedi"}. Una visita è un&apos;apertura
                    della pagina: la stessa persona che torna nel pomeriggio conta due volte. Non misuriamo le persone.
                </Text>
                {small && (
                    <Text as="p" variant="caption" colorVariant="muted">
                        Sotto le {SAMPLE_THRESHOLD} visite nel periodo non compaiono percentuali né confronti fra
                        periodi: su questi numeri direbbero il caso, non il vostro locale.
                    </Text>
                )}
            </div>
            <div className={styles.statGrid}>
                <StatCard
                    label="Visite"
                    value={nf.format(visits)}
                    loading={isLoading}
                    delta={delta != null ? { value: delta, period: `vs ${previousPeriodLabel}` } : undefined}
                />
                <StatCard label="Eventi per visita" value={nf.format(eventsPerVisit)} loading={isLoading} />
                <StatCard
                    label="Visite con un'aggiunta alla selezione"
                    value={small ? nf.format(selections) : `${nf.format(selectionPct)}%`}
                    sample={small ? { count: selections, total: visits } : undefined}
                    loading={isLoading}
                />
            </div>
        </section>
    );
}
