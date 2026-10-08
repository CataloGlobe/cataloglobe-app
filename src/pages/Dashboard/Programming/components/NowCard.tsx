import { Clock, History } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Card } from "@/components/ui/Card/Card";
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
    onSimulate: () => void;
    /** Abbonamento non attivo: le regole vincono, ma il cliente non vede il menù. */
    subscriptionInactive: boolean;
};

/**
 * La card «Adesso» di Programmazione (correzioni UI PG1), al posto della banda
 * fissa: per una sede i cinque passaggi in fila, con esito e regola, come nel
 * simulatore. Uguale in tutte le tab; evidenzia lo strato della tab aperta.
 */
export function NowCard({ time, row, layers, catalogLabel, highlight, onSimulate, subscriptionInactive }: NowCardProps) {
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

    // Testata compatta come nel mockup (PG1): orologio, «Adesso, 17:30»,
    // «Simula» a destra; al telefono «Simula» in fondo. La card è di una sede
    // sola: con più sedi c'è `CompanyNowCard` (PG5).
    return (
        <Card className={styles.card} bodyClassName={styles.cardBody}>
            <div className={styles.head}>
                <span className={styles.title}>
                    <Clock size={16} aria-hidden className={styles.clock} />
                    <Text as="h2" variant="body" weight={600}>
                        Adesso, {time}
                    </Text>
                    {row.suspended && <StatusBadge variant="neutral" label="Sospesa" />}
                </span>
                {!isPhone && <div className={styles.simulateEnd}>{simulate}</div>}
            </div>
            {subscriptionInactive && (
                <Text variant="caption" colorVariant="muted" className={styles.note}>
                    Abbonamento non attivo: nessuna sede mostra il menù.
                </Text>
            )}
            <div className={styles.steps}>
                <LayerSteps row={row} layers={layers} catalogLabel={catalogLabel} highlight={highlight} />
                {isPhone && <div className={styles.simulateBelow}>{simulate}</div>}
            </div>
        </Card>
    );
}
