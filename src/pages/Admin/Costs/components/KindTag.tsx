import Text from "@/components/ui/Text/Text";
import styles from "../Costs.module.scss";

const KIND_LABEL = { subscription: "Abbonamento", one_off: "Una tantum", move: "Movimento" } as const;

/**
 * Che cosa è la riga dello storico: abbonamento, una tantum o soldi passati
 * fra voi (Alex, 2026-10-16). Etichetta a testo, non un colore da indovinare.
 */
export function KindTag({ kind }: { kind: keyof typeof KIND_LABEL }) {
    return (
        <Text as="span" variant="caption" color="inherit" className={styles.kindTag} data-kind={kind}>
            {KIND_LABEL[kind]}
        </Text>
    );
}
