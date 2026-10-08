import { Clock } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { Chip } from "@/components/ui/Chip/Chip";
import Text from "@/components/ui/Text/Text";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import type { MatrixRow } from "@/utils/scheduleMatrix";
import { seatWatchLabel, seatWatchReason } from "@/utils/seatsToWatch";
import styles from "./CompanyNowCard.module.scss";

/** Quante sedi da guardare la card nomina prima del «+N»: due, una al telefono. */
const MAX_CHIPS = 2;
const MAX_CHIPS_PHONE = 1;

type CompanyNowCardProps = {
    /** «17:30», ora di Roma. */
    time: string;
    rows: ReadonlyArray<MatrixRow<LayoutRule>>;
    catalogLabel: string;
    /** Abbonamento non attivo: le regole vincono, ma il cliente non vede il menù. */
    subscriptionInactive: boolean;
    /** Il chip di una sede porta alla sua Programmazione. */
    onSeatOpen: (activityId: string) => void;
    /** «Vedi tutte»: il pannello «Cosa vedono i clienti». */
    onShowAll: () => void;
};

/**
 * La card «Adesso» di Programmazione d'azienda (T9b, PG5): una riga sola,
 * alta uguale con qualsiasi numero di sedi. Dice quante sedi sono a posto e
 * nomina in ambra solo quelle da guardare (al massimo due, poi «+N»); il
 * dettaglio sta nel pannello.
 */
export function CompanyNowCard({ time, rows, catalogLabel, subscriptionInactive, onSeatOpen, onShowAll }: CompanyNowCardProps) {
    const isPhone = useMediaQuery("(max-width: 767px)");
    const watch = rows.flatMap(row => {
        const reason = seatWatchReason(row);
        return reason ? [{ row, reason }] : [];
    });
    const fine = rows.length - watch.length;
    const summary =
        watch.length === 0
            ? `tutte le ${rows.length} sedi senza problemi`
            : `${fine} ${fine === 1 ? "sede" : "sedi"} senza problemi`;
    const shown = watch.slice(0, isPhone ? MAX_CHIPS_PHONE : MAX_CHIPS);
    const hidden = watch.length - shown.length;

    return (
        <Card className={styles.card} bodyClassName={styles.cardBody}>
            <div className={styles.row}>
                <span className={styles.title}>
                    <Clock size={16} aria-hidden className={styles.clock} />
                    <Text as="h2" variant="body" weight={600}>
                        Adesso, {time} · {summary}
                    </Text>
                </span>
                {watch.length > 0 && (
                    <span className={styles.chips}>
                        {shown.map(({ row, reason }) => (
                            <Chip
                                key={row.activityId}
                                tone="warning"
                                label={`${row.name}: ${seatWatchLabel(reason, catalogLabel)}`}
                                ariaLabel={`Apri la programmazione di ${row.name}: ${seatWatchLabel(reason, catalogLabel)}`}
                                onClick={() => onSeatOpen(row.activityId)}
                            />
                        ))}
                        {hidden > 0 && (
                            <Chip
                                tone="warning"
                                label={`+${hidden}`}
                                ariaLabel={`Altre ${hidden} sedi da guardare`}
                                onClick={onShowAll}
                            />
                        )}
                    </span>
                )}
                <Button variant="secondary" size="sm" className={styles.showAll} onClick={onShowAll}>
                    Vedi tutte le {rows.length} sedi
                </Button>
            </div>
            {subscriptionInactive && (
                <Text variant="caption" colorVariant="muted" className={styles.note}>
                    Abbonamento non attivo: nessuna sede mostra il menù.
                </Text>
            )}
        </Card>
    );
}
