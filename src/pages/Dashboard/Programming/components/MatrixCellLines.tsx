import type { ReactNode } from "react";
import Text from "@/components/ui/Text/Text";
import styles from "./SeatMatrix.module.scss";

/**
 * Una cella della matrice di Programmazione, su due righe: sopra cosa si
 * vede (o «—»), sotto il perché. `warn` colora la seconda riga (bozza, «A
 * mano» che ha l'ultima parola).
 */
export function MatrixCellLines({ primary, secondary, warn }: { primary: ReactNode; secondary: ReactNode; warn?: boolean }) {
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
