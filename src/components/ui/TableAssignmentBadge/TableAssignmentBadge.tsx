import { Armchair, TriangleAlert } from "lucide-react";
import { formatTableLabels } from "./formatTableLabels";
import styles from "./TableAssignmentBadge.module.scss";

// Tavolo assegnato a una prenotazione, in forma di chip.
//
// ── Perché non è uno StatusBadge ───────────────────────────────────────────
// Il tavolo è un fatto, non uno stato: quando va tutto bene non ha colore.
// "Tavolo 3" (deciso dall'operatore) e "Tavolo 3 · proposto" (scelta del
// sistema, ancora ricalcolabile) sono entrambi neutri. Il colore è riservato
// all'eccezione: la variante warning compare SOLO se c'è un conflitto, così
// sulla riga l'unico elemento ambrato è quello che chiede attenzione.
//
// Vocabolario: "proposto" per la scelta del sistema. La decisione
// dell'operatore non si annuncia (è lo stato normale). Mai "automatico" /
// "manuale" nei testi.
//
// Nessuna assegnazione = nessun badge: il chiamante non deve renderizzarlo.

export type TableAssignmentConflictKind = "overlap" | "table_deleted";

/** Vista pronta per il render, calcolata UNA volta dalla pagina. */
export interface TableAssignmentView {
    /** Etichette dei tavoli, già ordinate per etichetta. */
    labels: string[];
    /** Tavoli con la zona, per il drawer. Stesso ordine di `labels`. */
    rows: Array<{ table_id: string; label: string; zone_name: string | null; deleted: boolean }>;
    /** true = tutte le righe sono `system` (nessuna decisione dell'operatore). */
    proposed: boolean;
    /** Conflitto più grave, o null. Una riga di spiegazione già composta. */
    conflict: { kind: TableAssignmentConflictKind; message: string } | null;
}

interface Props {
    view: TableAssignmentView;
    className?: string;
}

export function TableAssignmentBadge({ view, className }: Props) {
    if (view.labels.length === 0) return null;

    const text = formatTableLabels(view.labels);
    const hasConflict = view.conflict !== null;
    const title = hasConflict
        ? view.conflict!.message
        : view.proposed
          ? `${text} · proposto dal sistema, non ancora confermato`
          : text;

    return (
        <span
            className={`${styles.badge} ${hasConflict ? styles.conflict : ""} ${className ?? ""}`}
            title={title}
        >
            {hasConflict ? (
                <TriangleAlert size={12} strokeWidth={2.25} aria-hidden className={styles.icon} />
            ) : (
                <Armchair size={12} strokeWidth={2} aria-hidden className={styles.icon} />
            )}
            <span className={styles.text}>{text}</span>
            {view.proposed && !hasConflict && (
                <span className={styles.suffix}>· proposto</span>
            )}
            {/* Il `title` non è raggiungibile da tastiera né da screen reader:
                il conflitto lo dice anche un'etichetta visivamente nascosta. */}
            {hasConflict && <span className={styles.srOnly}>{view.conflict!.message}</span>}
        </span>
    );
}

export default TableAssignmentBadge;
