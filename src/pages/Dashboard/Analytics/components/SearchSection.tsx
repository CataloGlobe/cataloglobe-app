import { BarList } from "@/components/ui/BarList/BarList";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import type { SearchTermData } from "@/services/supabase/analytics";
import styles from "../Analytics.module.scss";

type Props = {
    data: SearchTermData[];
    isLoading: boolean;
};

const nf = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

/**
 * «Cosa cercano» (§36.2/1): il dato col valore più alto per singolo evento,
 * primo dopo il campione. Ogni riga è una parola che un cliente ha scritto;
 * quelle senza risultati lo dicono. Trovato / non trovato separati: fuori
 * lotto (A1, serve una RPC).
 */
export default function SearchSection({ data, isLoading }: Props) {
    return (
        <Card title="Cosa cercano" subtitle="Ogni riga è una parola che un cliente ha scritto">
            <BarList
                aria-label="Parole cercate"
                loading={isLoading}
                limit={10}
                emptyTitle="Nessuna ricerca nel periodo"
                items={data.map(term => ({
                    id: term.search_term,
                    label: (
                        <span className={styles.labelStack}>
                            <span>{term.search_term}</span>
                            <Text as="span" variant="caption" colorVariant={term.avg_results === 0 ? "warning" : "muted"}>
                                {term.avg_results === 0
                                    ? "nessun risultato"
                                    : `${nf.format(term.avg_results)} risultati in media`}
                            </Text>
                        </span>
                    ),
                    value: term.search_count,
                    valueLabel: `${term.search_count} ${term.search_count === 1 ? "volta" : "volte"}`
                }))}
            />
        </Card>
    );
}
