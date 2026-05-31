import { AlertCircle } from "lucide-react";
import type { OrderingStateReason } from "@/types/orders";
import styles from "./TableUnavailablePage.module.scss";

interface Props {
    /** Reason strutturato. Mantenuto in signature per future render variant
     *  (es. icone / CTA diverse per causa). Oggi tutti i reason renderizzano
     *  lo stesso layout: titolo generico + message custom + hint staff. */
    reason: OrderingStateReason;
    message: string;
}

export default function TableUnavailablePage({ reason, message }: Props) {
    return (
        <div className={styles.container} data-reason={reason}>
            <div className={styles.icon}>
                <AlertCircle size={48} aria-hidden="true" />
            </div>
            <h1 className={styles.title}>Servizio momentaneamente non disponibile</h1>
            <p className={styles.message}>{message}</p>
            <p className={styles.hint}>
                Per assistenza, chiedi direttamente allo staff del ristorante.
            </p>
        </div>
    );
}
