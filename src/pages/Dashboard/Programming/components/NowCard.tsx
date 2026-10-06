import { Button } from "@/components/ui/Button/Button";
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
};

/**
 * La card «Adesso» di Programmazione (correzioni UI PG1), al posto della banda
 * fissa: per una sede i cinque passaggi in fila, con esito e regola, come nel
 * simulatore. Uguale in tutte le tab; evidenzia lo strato della tab aperta.
 */
export function NowCard({ time, row, layers, catalogLabel, highlight, seatOptions, onSeatChange, onSimulate }: NowCardProps) {
    return (
        <Card
            title={`Adesso, ${time}`}
            badge={row.suspended ? <StatusBadge variant="neutral" label="Sospesa" /> : undefined}
            actions={
                <div className={styles.actions}>
                    {seatOptions.length > 1 && (
                        <Select
                            aria-label="Sede della card Adesso"
                            value={row.activityId}
                            onChange={e => onSeatChange(e.target.value)}
                            options={seatOptions}
                        />
                    )}
                    <Button variant="secondary" size="sm" className={styles.simulate} onClick={onSimulate}>
                        Simula un altro momento
                    </Button>
                </div>
            }
        >
            <LayerSteps row={row} layers={layers} catalogLabel={catalogLabel} highlight={highlight} />
        </Card>
    );
}
