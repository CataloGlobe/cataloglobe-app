import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { LayoutRule, RuleType } from "@/services/supabase/layoutScheduling";
import type { MatrixRow } from "@/utils/scheduleMatrix";
import { ruleTypeLabel } from "../ruleTypeLabel";
import type { MatrixLayer } from "./matrixLayers";
import styles from "./LayerSteps.module.scss";

type LayerStepsProps = {
    row: MatrixRow<LayoutRule>;
    layers: ReadonlyArray<MatrixLayer>;
    catalogLabel: string;
    /** Lo strato della tab aperta; null in «Tutte» e nel simulatore. */
    highlight?: RuleType | null;
    /** Il pannello del simulatore è stretto: sempre due colonne al massimo. */
    narrow?: boolean;
};

/**
 * I cinque passaggi in fila per una sede (correzioni UI PG1/PG4), numerati,
 * con esito e regola: la card «Adesso» e il simulatore li mostrano uguali.
 * «A mano» in ambra se ci sono modifiche. Al telefono, con uno strato
 * evidenziato, restano a vista quello e «A mano»; gli altri dietro «Altri 3
 * passaggi».
 */
export function LayerSteps({ row, layers, catalogLabel, highlight = null, narrow = false }: LayerStepsProps) {
    const isPhone = useMediaQuery("(max-width: 767px)");
    const [showAll, setShowAll] = useState(false);
    const collapsible = isPhone && highlight !== null;
    const visible = collapsible && !showAll ? layers.filter(layer => layer.id === highlight || layer.id === "manual") : layers;
    const hidden = layers.length - visible.length;

    return (
        <>
            <ol className={`${styles.steps}${narrow ? ` ${styles.narrow}` : ""}`} aria-label={`Cosa vede ${row.name}`}>
                {visible.map(layer => {
                    const active = layer.id === highlight;
                    const manual = layer.id === "manual" && (row.manualCount ?? 0) > 0;
                    return (
                        <li
                            key={layer.id}
                            className={`${styles.step}${active ? ` ${styles.active}` : ""}${manual ? ` ${styles.manual}` : ""}`}
                            aria-current={active ? "step" : undefined}
                        >
                            <Text as="span" variant="caption" weight={600} colorVariant={active ? "primary" : "muted"}>
                                {layers.indexOf(layer) + 1} · {layer.id === "manual" ? layer.header : ruleTypeLabel(layer.id, catalogLabel)}
                            </Text>
                            {layer.render(row)}
                        </li>
                    );
                })}
            </ol>
            {collapsible && hidden > 0 && (
                <button type="button" className={styles.more} onClick={() => setShowAll(true)} aria-expanded={false}>
                    <Text as="span" variant="body-sm" weight={500} colorVariant="primary">
                        Altri {hidden} passaggi
                    </Text>
                    <ChevronDown size={16} aria-hidden />
                </button>
            )}
        </>
    );
}
