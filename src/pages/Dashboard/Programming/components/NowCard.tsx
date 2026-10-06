import { Clock, History } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Card } from "@/components/ui/Card/Card";
import { Select, type SelectOption } from "@/components/ui/Select/Select";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import type { LayoutRule, RuleType } from "@/services/supabase/layoutScheduling";
import type { MatrixRow } from "@/utils/scheduleMatrix";
import { LayerSteps } from "./LayerSteps";
import type { MatrixLayer } from "./matrixLayers";
import styles from "./NowCard.module.scss";

type NowCardProps = {
    /** «17:30», ora di Roma. */
    time: string;
    row: MatrixRow<LayoutRule>;
    layers: ReadonlyArray<MatrixLayer>;
    catalogLabel: string;
    /** Lo strato della tab aperta; null in «Tutte». */
    highlight: RuleType | null;
    /** Le sedi tra cui scegliere; con una sola il selettore non c'è. */
    seatOptions: SelectOption[];
    onSeatChange: (activityId: string) => void;
    onSimulate: () => void;
    /** Abbonamento non attivo: le regole vincono, ma il cliente non vede il menù. */
    subscriptionInactive: boolean;
};

/**
 * La card «Adesso» di Programmazione (correzioni UI PG1), al posto della banda
 * fissa: per una sede i cinque passaggi in fila, con esito e regola, come nel
 * simulatore. Uguale in tutte le tab; evidenzia lo strato della tab aperta.
 */
export function NowCard({ time, row, layers, catalogLabel, highlight, seatOptions, onSeatChange, onSimulate, subscriptionInactive }: NowCardProps) {
    const isPhone = useMediaQuery("(max-width: 767px)");
    const simulate = (
        <Button
            variant="secondary"
            size="sm"
            leftIcon={<History size={16} aria-hidden />}
            className={styles.simulate}
            onClick={onSimulate}
        >
            Simula un altro momento
        </Button>
    );

    // Testata compatta come nel mockup (PG1): orologio, «Adesso, 17:30», la
    // sede accanto, «Simula» a destra; al telefono la sede va a tutta
    // larghezza e «Simula» in fondo.
    return (
        <Card className={styles.card}>
            <div className={styles.head}>
                <span className={styles.title}>
                    <Clock size={18} aria-hidden className={styles.clock} />
                    <Text as="h2" variant="title-sm">
                        Adesso, {time}
                    </Text>
                    {row.suspended && <StatusBadge variant="neutral" label="Sospesa" />}
                </span>
                {seatOptions.length > 1 && (
                    <div className={styles.seat}>
                        <Select
                            aria-label="Sede della card Adesso"
                            value={row.activityId}
                            onChange={e => onSeatChange(e.target.value)}
                            options={seatOptions}
                        />
                    </div>
                )}
                {!isPhone && <div className={styles.simulateEnd}>{simulate}</div>}
            </div>
            {subscriptionInactive && (
                <Text variant="caption" colorVariant="muted" className={styles.note}>
                    Abbonamento non attivo: nessuna sede mostra il menù.
                </Text>
            )}
            <LayerSteps row={row} layers={layers} catalogLabel={catalogLabel} highlight={highlight} />
            {isPhone && <div className={styles.simulateBelow}>{simulate}</div>}
        </Card>
    );
}
