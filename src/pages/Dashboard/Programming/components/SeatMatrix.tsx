import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card/Card";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import type { LayoutRule, RuleType } from "@/services/supabase/layoutScheduling";
import type { MatrixRow } from "@/utils/scheduleMatrix";
import { matrixLayers } from "./matrixLayers";
import styles from "./SeatMatrix.module.scss";

type SeatMatrixProps = {
    rows: MatrixRow<LayoutRule>[];
    /** Il cursore è sull'ora di adesso («fuori fascia adesso»). */
    atNow: boolean;
    catalogLabel: string;
    catalogName: (catalogId: string) => string | undefined;
    ruleHref: (rule: { id: string; rule_type: RuleType }) => string;
    seatHref: (activityId: string) => string;
};

/**
 * Sotto questa larghezza del contenuto sei colonne non stanno (circa 145 px
 * l'una): un blocco per sede. Si misura lo spazio, non la finestra: a 1024
 * con la sidebar aperta ce n'è meno che a 1023 con la sidebar chiusa.
 */
const MATRIX_TABLE_MIN_WIDTH = 880;

/**
 * «Cosa vede ogni sede» (§20.3): una riga per sede, una colonna per strato,
 * chi vince nell'ora del cursore e, dove non vince nessuno, perché. La sede
 * sospesa resta leggibile, spenta.
 */
export function SeatMatrix({ rows, atNow, catalogLabel, catalogName, ruleHref, seatHref }: SeatMatrixProps) {
    // Quando sei colonne non stanno, un blocco per sede con gli strati su due
    // colonne (mockup telefono).
    const boxRef = useRef<HTMLDivElement>(null);
    const [asBlocks, setAsBlocks] = useState(false);
    useLayoutEffect(() => {
        const box = boxRef.current;
        if (!box) return;
        const measure = () => setAsBlocks(box.clientWidth < MATRIX_TABLE_MIN_WIDTH);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(box);
        return () => observer.disconnect();
    }, []);
    const layers = matrixLayers({ atNow, catalogLabel, catalogName, ruleHref });

    const seatCell = (row: MatrixRow<LayoutRule>) => (
        <div className={styles.cell}>
            <Link to={seatHref(row.activityId)} className={styles.seatLink}>
                {row.name}
            </Link>
            {row.suspended && <StatusBadge variant="neutral" label="Sospesa" />}
        </div>
    );

    const columns: ColumnDefinition<MatrixRow<LayoutRule>>[] = [
        { id: "seat", header: "Sede", cell: (_value, row) => seatCell(row) },
        ...layers.map(layer => ({ id: layer.id, header: layer.header, cell: (_value: unknown, row: MatrixRow<LayoutRule>) => layer.render(row) }))
    ];

    return (
        <div ref={boxRef}>
            <Card title="Cosa vede ogni sede" subtitle={asBlocks ? "un blocco per sede, uno spazio per strato" : "una riga per sede, una colonna per strato"} flush>
                {asBlocks ? (
                    <ul className={styles.blocks} aria-label="Cosa vede ogni sede">
                        {rows.map(row => (
                            <li key={row.activityId} className={`${styles.block}${row.suspended ? ` ${styles.blockMuted}` : ""}`}>
                                {seatCell(row)}
                                <dl className={styles.layers}>
                                    {layers.map(layer => (
                                        <div key={layer.id} className={styles.layer}>
                                            <Text as="dt" variant="caption-xs" colorVariant="muted" className={styles.layerLabel}>
                                                {layer.header}
                                            </Text>
                                            <dd className={styles.layerValue}>{layer.render(row)}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <DataTable<MatrixRow<LayoutRule>>
                        ariaLabel="Cosa vede ogni sede"
                        data={rows}
                        columns={columns}
                        getRowId={row => row.activityId}
                        mutedRowIds={rows.filter(row => row.suspended).map(row => row.activityId)}
                        pageSize={Math.max(rows.length, 1)}
                        pageSizeOptions={[Math.max(rows.length, 1)]}
                        showFooter={false}
                        maxHeight="none"
                    />
                )}
                {/* L'ordine in cui si applicano gli strati (§20.6). */}
                <Text variant="body-sm" className={styles.note}>
                    <strong>Le colonne non sono elenchi paralleli: sono i passaggi in fila.</strong> Il sistema sceglie il{" "}
                    {catalogLabel.toLowerCase()}, poi applica la disponibilità programmata, poi i prezzi, e infine le modifiche a mano
                    della sede — l'ultima colonna, che vince su tutte le altre. Dentro una colonna le regole competono fra loro; fra
                    colonne no, si sommano in quest'ordine. <strong>«A mano» non è una regola</strong>: è quello che qualcuno ha
                    cambiato dal locale, e nessuna regola lo sovrascrive.
                </Text>
            </Card>
        </div>
    );
}
