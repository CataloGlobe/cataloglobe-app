import { Link } from "react-router-dom";
import { CheckIcon } from "./icons";
import type { SubmitReservationStatus } from "@/services/supabase/reservations";
import type { FormFields } from "./types";
import styles from "./SuccessRecap.module.scss";

type Props = {
    slug: string;
    brandName: string;
    snapshot: FormFields;
    /** Risultato della submit. `confirmed` = auto-confermata dalla sede;
     *  `pending` = in attesa di approvazione admin (comportamento V0). */
    status: SubmitReservationStatus;
};

function formatDateIt(iso: string): string {
    if (!iso) return "—";
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(d);
}

function formatTime(hhmm: string): string {
    if (!hhmm) return "—";
    return hhmm.slice(0, 5);
}

function formatParty(value: string): string {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) return value;
    return n === 1 ? "1 persona" : `${n} persone`;
}

interface OutcomeCopy {
    title: string;
    lead: string;
    pill: string;
}

const OUTCOME: Record<SubmitReservationStatus, OutcomeCopy> = {
    confirmed: {
        title: "Prenotazione confermata!",
        lead: "La tua prenotazione è confermata. Ti abbiamo inviato l'email di conferma.",
        pill: "Confermata"
    },
    pending: {
        title: "Richiesta inviata!",
        lead:
            "Riceverai una conferma via email non appena la sede approverà la prenotazione.",
        pill: "In attesa di conferma del locale"
    }
};

export default function SuccessRecap({ slug, brandName, snapshot, status }: Props) {
    const dateLabel = formatDateIt(snapshot.reservation_date);
    const dateCapitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
    const copy = OUTCOME[status];

    return (
        <div className={styles.card}>
            <div
                className={
                    status === "confirmed"
                        ? `${styles.icon} ${styles.iconConfirmed}`
                        : styles.icon
                }
            >
                <CheckIcon size={30} />
            </div>

            <h1 className={styles.title}>{copy.title}</h1>
            <p className={styles.lead}>{copy.lead}</p>

            <div className={styles.recap}>
                <div className={styles.row}>
                    <span className={styles.rowLabel}>Sede</span>
                    <span className={styles.rowValue}>{brandName}</span>
                </div>
                <div className={styles.divider} aria-hidden="true" />
                <div className={styles.row}>
                    <span className={styles.rowLabel}>Data</span>
                    <span className={styles.rowValue}>{dateCapitalized}</span>
                </div>
                <div className={styles.row}>
                    <span className={styles.rowLabel}>Ora</span>
                    <span className={styles.rowValue}>{formatTime(snapshot.reservation_time)}</span>
                </div>
                <div className={styles.row}>
                    <span className={styles.rowLabel}>Persone</span>
                    <span className={styles.rowValue}>{formatParty(snapshot.party_size)}</span>
                </div>
                <div className={styles.divider} aria-hidden="true" />
                <div className={styles.row}>
                    <span className={styles.rowLabel}>Nome</span>
                    <span className={styles.rowValue}>{snapshot.customer_name}</span>
                </div>
            </div>

            <span
                className={
                    status === "confirmed"
                        ? `${styles.statusLine} ${styles.statusLineConfirmed}`
                        : styles.statusLine
                }
            >
                <span
                    className={
                        status === "confirmed"
                            ? `${styles.statusDot} ${styles.statusDotConfirmed}`
                            : styles.statusDot
                    }
                    aria-hidden="true"
                />
                {copy.pill}
            </span>

            <Link to={`/${slug}`} className={styles.cta}>
                Torna al menu
            </Link>
        </div>
    );
}
