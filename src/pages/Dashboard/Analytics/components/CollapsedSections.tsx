import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    /** Ordini al tavolo nel piano, e nessun ordine nel periodo. */
    ordersEmpty: boolean;
    /** Prenotazioni nel piano, e nessuna prenotazione nel periodo. */
    reservationsEmpty: boolean;
    /** Sedi (lette) col canale acceso, e sedi in tutto. */
    orderingOn: number;
    reservationsOn: number;
    sedeCount: number;
    /** «in 30 giorni», «oggi». */
    periodPhrase: string;
};

/**
 * Le sezioni senza dati nel periodo (§36.3): restano in elenco — non
 * spariscono — ma in fondo, una riga ciascuna col perché e un'uscita. Quando
 * i dati arrivano la sezione risale da sé al suo posto.
 */
export default function CollapsedSections({ ordersEmpty, reservationsEmpty, orderingOn, reservationsOn, sedeCount, periodPhrase }: Props) {
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();
    if (!ordersEmpty && !reservationsEmpty) return null;

    const onOf = (on: number) => (on === sedeCount ? `su tutte le ${sedeCount} sedi` : `su ${on} ${on === 1 ? "sede" : "sedi"} su ${sedeCount}`);

    return (
        <div className={styles.section}>
            <Card title="Senza dati nel periodo" flush>
                {ordersEmpty && (
                    <ListRow
                        title={`Ordini al tavolo — nessun ordine ${periodPhrase}`}
                        subtitle={
                            orderingOn === 0
                                ? "Il canale è spento su tutte le sedi: si accende dalla scheda della sede."
                                : `Il canale è acceso ${onOf(orderingOn)}, quindi non è una configurazione spenta. Se i QR non sono sui tavoli, il canale è raggiungibile solo da chi conosce l'indirizzo.`
                        }
                        wrapSubtitle
                        trailing={
                            <Button variant="secondary" size="sm" onClick={() => navigate(`/business/${businessId}/locations`)}>
                                Vai alle sedi
                            </Button>
                        }
                    />
                )}
                {reservationsEmpty && (
                    <ListRow
                        title={`Prenotazioni — nessuna prenotazione ${periodPhrase}`}
                        subtitle={
                            reservationsOn === 0
                                ? "Le prenotazioni sono spente su tutte le sedi: si accendono dalla scheda della sede."
                                : `Le prenotazioni sono accese ${onOf(reservationsOn)}.`
                        }
                        wrapSubtitle
                        trailing={
                            <Button variant="secondary" size="sm" onClick={() => navigate(`/business/${businessId}/reservations`)}>
                                Apri Prenotazioni
                            </Button>
                        }
                    />
                )}
            </Card>
            <Text as="p" variant="caption" colorVariant="muted">
                Le sezioni senza dati nel periodo restano in elenco, ma non occupano il primo schermo.
            </Text>
        </div>
    );
}
