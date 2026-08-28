import { useTranslation } from "react-i18next";
import styles from "./ReservationRecap.module.scss";

// Righe di riepilogo di una prenotazione: sede, data, ora, persone, nome.
// Estratto da SuccessRecap perché la pagina di disdetta mostra esattamente gli
// stessi fatti e non ha motivo di disegnarli in modo diverso.
//
// Il locale è una prop invece che dedotto qui: SuccessRecap formatta le date in
// it-IT da sempre (difetto noto, non in scope) e cambiarlo di soppiatto
// significherebbe modificare la schermata post-prenotazione mentre se ne
// costruisce un'altra. La pagina nuova passa la lingua attiva; il chiamante
// vecchio continua a passare "it-IT" finché non lo si sistema di proposito.

type Props = {
    /** BCP-47 usato per la data, es. "it-IT" oppure `i18n.language`. */
    locale: string;
    venueName: string;
    /** `YYYY-MM-DD`. */
    reservationDate: string;
    /** `HH:MM` o `HH:MM:SS`. */
    reservationTime: string;
    /** Numero coperti; accetta la stringa che arriva dal form. */
    partySize: number | string;
    customerName: string;
};

function formatDate(iso: string, locale: string): string {
    if (!iso) return "—";
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    const formatted = new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(d);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatTime(value: string): string {
    if (!value) return "—";
    return value.slice(0, 5);
}

export default function ReservationRecap({
    locale,
    venueName,
    reservationDate,
    reservationTime,
    partySize,
    customerName
}: Props) {
    const { t } = useTranslation("public");

    const partyN = Number(partySize);
    const partyLabel =
        Number.isInteger(partyN) && partyN >= 1
            ? t("reservation.party_count", { count: partyN })
            : String(partySize);

    return (
        <div className={styles.recap}>
            <div className={styles.row}>
                <span className={styles.rowLabel}>{t("reservation.venue")}</span>
                <span className={styles.rowValue}>{venueName}</span>
            </div>
            <div className={styles.divider} aria-hidden="true" />
            <div className={styles.row}>
                <span className={styles.rowLabel}>{t("reservation.date")}</span>
                <span className={styles.rowValue}>{formatDate(reservationDate, locale)}</span>
            </div>
            <div className={styles.row}>
                <span className={styles.rowLabel}>{t("reservation.time")}</span>
                <span className={styles.rowValue}>{formatTime(reservationTime)}</span>
            </div>
            <div className={styles.row}>
                <span className={styles.rowLabel}>{t("reservation.people")}</span>
                <span className={styles.rowValue}>{partyLabel}</span>
            </div>
            <div className={styles.divider} aria-hidden="true" />
            <div className={styles.row}>
                <span className={styles.rowLabel}>{t("reservation.name_short")}</span>
                <span className={styles.rowValue}>{customerName}</span>
            </div>
        </div>
    );
}
