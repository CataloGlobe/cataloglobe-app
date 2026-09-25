import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card/Card";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { LayoutRule, RuleType } from "@/services/supabase/layoutScheduling";
import {
    describeDiagnosis,
    describeManual,
    describeWinner,
    type MatrixCell,
    type MatrixRow
} from "@/utils/scheduleMatrix";
import { MatrixCellLines as CellLines } from "./MatrixCellLines";
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

/** Le colonne degli strati, nell'ordine in cui si applicano (§20.6). */
const LAYER_COLUMNS: ReadonlyArray<{ type: RuleType; header: string }> = [
    { type: "visibility", header: "Disponibilità" },
    { type: "price", header: "Prezzi" },
    { type: "featured", header: "In evidenza" }
];

/**
 * «Cosa vede ogni sede» (§20.3): una riga per sede, una colonna per strato,
 * chi vince nell'ora del cursore e, dove non vince nessuno, perché. La sede
 * sospesa resta leggibile, spenta.
 */
export function SeatMatrix({ rows, atNow, catalogLabel, catalogName, ruleHref, seatHref }: SeatMatrixProps) {
    // Sotto 768 una tabella a sei colonne non sta: un blocco per sede, gli
    // strati su due colonne (mockup telefono).
    const isPhone = useMediaQuery("(max-width: 767px)");
    const renderLayer = (cell: MatrixCell<LayoutRule>): ReactNode => {
        if (cell.kind === "empty") {
            return <CellLines primary={null} secondary={describeDiagnosis(cell.diagnosis, atNow)} warn={cell.diagnosis.kind === "draft"} />;
        }
        const catalogId = cell.rule.layout?.catalog_id;
        const { primary, secondary } = describeWinner(cell.rule, catalogId ? catalogName(catalogId) : undefined);
        // Il link porta alla regola: nel menù è la riga sotto, altrove il nome sopra.
        const menuWithCatalog = cell.rule.rule_type === "layout" && secondary !== null;
        const link = (
            <Link to={ruleHref(cell.rule)} className={styles.link}>
                {menuWithCatalog ? secondary : primary}
            </Link>
        );
        return menuWithCatalog ? <CellLines primary={primary} secondary={link} /> : <CellLines primary={link} secondary={secondary} />;
    };

    // Gli strati, nell'ordine in cui si applicano: colonne della tabella e
    // voci del blocco sul telefono.
    const layers: ReadonlyArray<{ id: string; header: string; render: (row: MatrixRow<LayoutRule>) => ReactNode }> = [
        { id: "layout", header: catalogLabel, render: row => renderLayer(row.cells.layout) },
        ...LAYER_COLUMNS.map(({ type, header }) => ({
            id: type,
            header,
            render: (row: MatrixRow<LayoutRule>) => renderLayer(row.cells[type])
        })),
        {
            id: "manual",
            header: "A mano",
            render: row => {
                const { primary, secondary } = describeManual(row.manualCount);
                return <CellLines primary={primary} secondary={secondary} warn={primary !== null} />;
            }
        }
    ];

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
        <Card title="Cosa vede ogni sede" subtitle={isPhone ? "un blocco per sede, uno spazio per strato" : "una riga per sede, una colonna per strato"} flush>
            {isPhone ? (
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
    );
}
