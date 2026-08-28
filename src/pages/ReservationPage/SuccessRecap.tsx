import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckIcon } from "./icons";
import ReservationRecap from "./ReservationRecap";
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

export default function SuccessRecap({ backHref, brandName, snapshot, status }: Props) {
    const { t } = useTranslation("public");
    const isConfirmed = status === "confirmed";
    const copy = {
        title: t(isConfirmed ? "reservation.confirmed_title" : "reservation.pending_title"),
        lead: t(isConfirmed ? "reservation.confirmed_lead" : "reservation.pending_lead"),
        pill: t(isConfirmed ? "reservation.confirmed_pill" : "reservation.pending_pill")
    };

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

            {/* it-IT fisso: comportamento storico di questa schermata,
                preservato tal quale. Il difetto è noto e va corretto di
                proposito, non di rimbalzo. */}
            <ReservationRecap
                locale="it-IT"
                venueName={brandName}
                reservationDate={snapshot.reservation_date}
                reservationTime={snapshot.reservation_time}
                partySize={snapshot.party_size}
                customerName={snapshot.customer_name}
            />

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
