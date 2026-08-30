import { CheckCheck } from "lucide-react";
import styles from "./Reservations.module.scss";

// Segnale che il CLIENTE ha confermato la presenza dal promemoria della sera
// prima (`reservations.guest_confirmed_at`).
//
// ── Perché è discreto, e perché il silenzio non ha un suo segno ─────────────
// La stragrande maggioranza dei clienti non premerà nulla: è il comportamento
// normale, non un problema. Un indicatore sui NULL — un punto giallo, un
// "in attesa di conferma", qualsiasi cosa — riempirebbe la sera di venti
// allarmi per la cosa più comune che succede, e nel giro di una settimana il
// ristoratore smetterebbe di guardarli tutti, allarmi veri compresi.
//
// Quindi: chi ha confermato ha un segno, chi tace non ha niente. Il valore sta
// nel poter dire "questi tre sono sicuri", non nel colpevolizzare gli altri.
//
// Doppia spunta e non spunta singola: è il vocabolario della messaggistica per
// "ricevuto e letto dall'altra parte", che è esattamente cosa comunica.

type Props = {
    /** ISO timestamp della conferma, o null quando il cliente non ha risposto. */
    guestConfirmedAt: string | null;
    /** `inline` per le righe di lista, `labelled` per il drawer di dettaglio. */
    variant?: "inline" | "labelled";
};

function formatConfirmedAt(iso: string): string | null {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit"
    }).format(d);
}

export default function GuestConfirmedMark({ guestConfirmedAt, variant = "inline" }: Props) {
    // Nessuna risposta = nessun segno. Vedi la nota sopra.
    if (!guestConfirmedAt) return null;

    const when = formatConfirmedAt(guestConfirmedAt);
    const title = when
        ? `Il cliente ha confermato la presenza il ${when}`
        : "Il cliente ha confermato la presenza";

    if (variant === "labelled") {
        return (
            <span className={styles.guestConfirmedLabelled}>
                <CheckCheck size={14} strokeWidth={2} aria-hidden />
                <span>{when ? `Confermata dal cliente · ${when}` : "Confermata dal cliente"}</span>
            </span>
        );
    }

    return (
        <span className={styles.guestConfirmedMark} title={title}>
            <CheckCheck size={14} strokeWidth={2} aria-hidden />
            {/* Il titolo non è raggiungibile da tastiera né da screen reader:
                l'etichetta visivamente nascosta lo è. */}
            <span className={styles.srOnly}>{title}</span>
        </span>
    );
}
