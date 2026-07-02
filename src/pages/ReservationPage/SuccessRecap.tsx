import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckIcon } from "./icons";
import type { SubmitReservationStatus } from "@/services/supabase/reservations";
import type { FormFields } from "./types";
import styles from "./SuccessRecap.module.scss";

type Props = {
    /** Menu href con lingua preservata (`/:slug` o `/:slug/:lang`). */
    backHref: string;
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

export default function SuccessRecap({ backHref, brandName, snapshot, status }: Props) {
    const { t } = useTranslation("public");
    const dateLabel = formatDateIt(snapshot.reservation_date);
    const dateCapitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
    const isConfirmed = status === "confirmed";
    const copy = {
        title: t(isConfirmed ? "reservation.confirmed_title" : "reservation.pending_title"),
        lead: t(isConfirmed ? "reservation.confirmed_lead" : "reservation.pending_lead"),
        pill: t(isConfirmed ? "reservation.confirmed_pill" : "reservation.pending_pill")
    };

    const partyN = Number(snapshot.party_size);
    const partyLabel =
        Number.isInteger(partyN) && partyN >= 1
            ? t("reservation.party_count", { count: partyN })
            : snapshot.party_size;

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
                    <span className={styles.rowLabel}>{t("reservation.venue")}</span>
                    <span className={styles.rowValue}>{brandName}</span>
                </div>
                <div className={styles.divider} aria-hidden="true" />
                <div className={styles.row}>
                    <span className={styles.rowLabel}>{t("reservation.date")}</span>
                    <span className={styles.rowValue}>{dateCapitalized}</span>
                </div>
                <div className={styles.row}>
                    <span className={styles.rowLabel}>{t("reservation.time")}</span>
                    <span className={styles.rowValue}>{formatTime(snapshot.reservation_time)}</span>
                </div>
                <div className={styles.row}>
                    <span className={styles.rowLabel}>{t("reservation.people")}</span>
                    <span className={styles.rowValue}>{partyLabel}</span>
                </div>
                <div className={styles.divider} aria-hidden="true" />
                <div className={styles.row}>
                    <span className={styles.rowLabel}>{t("reservation.name_short")}</span>
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

            <Link to={backHref} className={styles.cta}>
                {t("reservation.back_to_menu")}
            </Link>
        </div>
    );
}
