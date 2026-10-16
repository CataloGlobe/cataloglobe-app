import Text from "@/components/ui/Text/Text";
import type { RowKind } from "./expenseCategoryMeta";
import styles from "../Costs.module.scss";

const KIND_LABEL: Record<RowKind, string> = { month: "Mensile", year: "Annuale", one_off: "Una tantum", move: "Movimento" };

/**
 * Che cosa è la riga: abbonamento mensile o annuale, una tantum, o soldi
 * passati fra voi (Alex, 2026-10-16). Etichetta a testo, non un colore da indovinare.
 */
export function KindTag({ kind }: { kind: RowKind }) {
    return (
        <Text as="span" variant="caption" color="inherit" className={styles.kindTag} data-kind={kind}>
            {KIND_LABEL[kind]}
        </Text>
    );
}
