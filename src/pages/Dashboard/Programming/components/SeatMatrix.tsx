import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card/Card";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import type { LayoutRule, RuleType } from "@/services/supabase/layoutScheduling";
import {
    describeDiagnosis,
    describeManual,
    describeWinner,
    type MatrixCell,
    type MatrixRow
} from "@/utils/scheduleMatrix";
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

/** Due righe: sopra cosa si vede, sotto il perché. */
function CellLines({ primary, secondary, warn }: { primary: ReactNode; secondary: ReactNode; warn?: boolean }) {
    return (
        <div className={styles.cell}>
            <Text as="span" variant="body-sm" colorVariant={primary === null ? "muted" : "default"}>
                {primary ?? "—"}
            </Text>
            {secondary !== null && (
                <Text as="span" variant="caption" colorVariant={warn ? "warning" : "muted"}>
                    {secondary}
                </Text>
            )}
        </div>
    );
}

/**
 * «Cosa vede ogni sede» (§20.3): una riga per sede, una colonna per strato,
 * chi vince nell'ora del cursore e, dove non vince nessuno, perché. La sede
 * sospesa resta leggibile, spenta.
 */
export function SeatMatrix({ rows, atNow, catalogLabel, catalogName, ruleHref, seatHref }: SeatMatrixProps) {
    const renderLayer = (cell: MatrixCell<LayoutRule>): ReactNode => {
        if (cell.kind === "empty") {
            return <CellLines primary={null} secondary={describeDiagnosis(cell.diagnosis, atNow)} warn={cell.diagnosis.kind === "draft"} />;
        }
        const catalogId = cell.rule.layout?.catalog_id;
        const { primary, secondary } = describeWinner(cell.rule, catalogId ? catalogName(catalogId) : undefined);
        const ruleName = cell.rule.rule_type === "layout" && secondary ? secondary : primary;
        const link = (
            <Link to={ruleHref(cell.rule)} className={styles.link}>
                {ruleName}
            </Link>
        );
        return cell.rule.rule_type === "layout" && secondary ? (
            <CellLines primary={primary} secondary={link} />
        ) : (
            <CellLines primary={link} secondary={secondary} />
        );
    };

    const columns = useMemo<ColumnDefinition<MatrixRow<LayoutRule>>[]>(
        () => [
            {
                id: "seat",
                header: "Sede",
                cell: (_value, row) => (
                    <div className={styles.cell}>
                        <Link to={seatHref(row.activityId)} className={styles.seatLink}>
                            {row.name}
                        </Link>
                        {row.suspended && <StatusBadge variant="neutral" label="Sospesa" />}
                    </div>
                )
            },
            { id: "layout", header: catalogLabel, cell: (_value, row) => renderLayer(row.cells.layout) },
            ...LAYER_COLUMNS.map(({ type, header }) => ({
                id: type,
                header,
                cell: (_value: unknown, row: MatrixRow<LayoutRule>) => renderLayer(row.cells[type])
            })),
            {
                id: "manual",
                header: "A mano",
                cell: (_value, row) => {
                    const { primary, secondary } = describeManual(row.manualCount);
                    return <CellLines primary={primary} secondary={secondary} warn={primary !== null} />;
                }
            }
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps -- renderLayer legge solo le props elencate
        [atNow, catalogLabel, catalogName, ruleHref, seatHref]
    );

    return (
        <Card title="Cosa vede ogni sede" subtitle="una riga per sede, una colonna per strato" flush>
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
        </Card>
    );
}
