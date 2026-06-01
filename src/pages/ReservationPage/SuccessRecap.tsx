import { Link } from "react-router-dom";
import { CheckIcon } from "./icons";
import type { FormFields } from "./types";
import styles from "./SuccessRecap.module.scss";

type Props = {
    slug: string;
    brandName: string;
    snapshot: FormFields;
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

export default function SuccessRecap({ slug, brandName, snapshot }: Props) {
    const dateLabel = formatDateIt(snapshot.reservation_date);
    const dateCapitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

    return (
        <div className={styles.card}>
            <div className={styles.icon}>
                <CheckIcon size={30} />
            </div>

            <h1 className={styles.title}>Richiesta inviata!</h1>
            <p className={styles.lead}>
                Riceverai una conferma via email non appena la sede approverà la prenotazione.
            </p>

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

            <span className={styles.statusLine}>
                <span className={styles.statusDot} aria-hidden="true" />
                In attesa di conferma del locale
            </span>

            <Link to={`/${slug}`} className={styles.cta}>
                Torna al menu
            </Link>
        </div>
    );
}
