import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LayoutRule, RuleType } from "@/services/supabase/layoutScheduling";
import { describeDiagnosis, describeManual, describeWinner, type MatrixCell, type MatrixRow } from "@/utils/scheduleMatrix";
import { MatrixCellLines as CellLines } from "./MatrixCellLines";
import styles from "./SeatMatrix.module.scss";

/** Le colonne degli strati, nell'ordine in cui si applicano (§20.6). */
const LAYER_COLUMNS: ReadonlyArray<{ type: RuleType; header: string }> = [
    { type: "visibility", header: "Disponibilità" },
    { type: "price", header: "Prezzi" },
    { type: "featured", header: "In evidenza" }
];

export type MatrixLayer = {
    id: RuleType | "manual";
    header: string;
    render: (row: MatrixRow<LayoutRule>) => ReactNode;
};

type MatrixLayersInput = {
    /** Il momento è adesso («fuori fascia adesso»). */
    atNow: boolean;
    catalogLabel: string;
    catalogName: (catalogId: string) => string | undefined;
    ruleHref: (rule: { id: string; rule_type: RuleType }) => string;
};

/**
 * Gli strati, nell'ordine in cui si applicano (§20.6): colonne della matrice,
 * voci del blocco sul telefono e passaggi della card «Adesso» (PG1). Una cella
 * vuota dice perché; quella che vince porta alla regola.
 */
export function matrixLayers({ atNow, catalogLabel, catalogName, ruleHref }: MatrixLayersInput): ReadonlyArray<MatrixLayer> {
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

    return [
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
}

