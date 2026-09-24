import { BellRing, BellOff, Clock3, TriangleAlert } from "lucide-react";
import type { V2Reservation } from "@/types/reservation";
import {
    reminderFailureReason,
    reminderState,
    showReminderStatus,
    RESERVATION_TIMEZONE
} from "./reminderStatus";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import Text from "@/components/ui/Text/Text";
import styles from "./Reservations.module.scss";

// Stato del promemoria della sera prima, nel drawer di dettaglio, accanto alla
// conferma del cliente.
//
// ── Il colore segnala solo l'eccezione ──────────────────────────────────────
// "In attesa" e "non previsto" non sono problemi: sono la vita normale di una
// prenotazione. Colorarli allenerebbe il ristoratore a ignorare i colori, e il
// giorno che ne compare uno vero non lo guarderebbe nessuno. Quindi solo i due
// casi di perdita hanno un colore, e gli altri stanno in grigio.
//
// ── L'errore grezzo non è testo da leggere ──────────────────────────────────
// `Gateway Timeout` non dice niente a chi gestisce una sala, e mostrarglielo
// gli chiede di interpretare un guasto nostro. Nel testo visibile va la
// distinzione utile — e solo dove è utile: su "non consegnato" il promemoria è
// perso comunque, quindi nessun qualificatore (vedi `reminderFailureReason`).
// Il messaggio originale resta nel `title`, dove lo trova chi lo cerca.
//
// La classificazione vive in `reminderStatus.ts`: qui c'è solo la resa.

type Props = {
    reservation: V2Reservation;
    /**
     * `activities.reservation_reminder_enabled` della sede. `undefined` =
     * sede non ancora caricata: si assume acceso.
     */
    reminderEnabled?: boolean;
};

// Ore rese nel fuso della sede, non in quello del browser: un promemoria
// partito alle 18:00 di Roma deve leggersi "18:00" anche da un portatile
// impostato altrove.
const DATE_FMT = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "long",
    timeZone: RESERVATION_TIMEZONE
});

const TIME_FMT = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: RESERVATION_TIMEZONE
});

function formatDate(iso: string): string | null {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : DATE_FMT.format(d);
}

function formatDateAndTime(iso: string): string | null {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return `${DATE_FMT.format(d)} alle ${TIME_FMT.format(d)}`;
}

export default function ReminderStatusMark({ reservation, reminderEnabled }: Props) {
    // Al tavolo o servita: la domanda non esiste più (vedi `showReminderStatus`).
    if (!showReminderStatus(reservation.status)) return null;

    const state = reminderState(reservation, { reminderEnabled });

    if (state === "sent") {
        const when = reservation.reminder_sent_at
            ? formatDateAndTime(reservation.reminder_sent_at)
            : null;
        return (
            <Text as="span" variant="caption-xs" weight={500} colorVariant="muted" className={styles.reminderMark}>
                <BellRing size={14} strokeWidth={2} aria-hidden />
                <span>{when ? `Promemoria inviato · ${when}` : "Promemoria inviato"}</span>
            </Text>
        );
    }

    if (state === "claimed_not_delivered" || state === "failed") {
        const when = reservation.reminder_failed_at
            ? formatDate(reservation.reminder_failed_at)
            : null;
        const reason = reminderFailureReason(state, reservation.reminder_last_error);
        const headline =
            state === "claimed_not_delivered"
                ? "Promemoria non consegnato"
                : "Promemoria non inviato";
        const detail =
            state === "claimed_not_delivered"
                ? `Il cliente non l'ha ricevuto e non verrà ritentato. Motivo: ${reason}.`
                : `Motivo: ${reason}.`;

        return (
            // Il messaggio originale non sparisce: smette di essere testo da
            // leggere e diventa dettaglio da cercare (il `title`).
            <div title={reservation.reminder_last_error ?? undefined}>
                <InlineBanner variant="warning" icon={<TriangleAlert size={16} strokeWidth={2.25} aria-hidden />}>
                    {headline}
                    {when ? ` · ${when}` : ""}
                    {". "}
                    <span className={styles.reminderMarkDetail}>{detail}</span>
                </InlineBanner>
            </div>
        );
    }

    if (state === "pending") {
        return (
            <Text as="span" variant="caption-xs" weight={500} colorVariant="muted" className={styles.reminderMark}>
                <Clock3 size={14} strokeWidth={2} aria-hidden />
                <span>Promemoria in attesa · parte la sera prima, dalle 18</span>
            </Text>
        );
    }

    // I tre "non previsto". Il motivo compare solo quando c'è un gesto dietro:
    // la sede si può riaccendere, la prenotazione si può confermare. Per una
    // data ormai passata non c'è niente da dire e non si dice niente.
    const why =
        state === "not_planned_venue"
            ? " · la sede non invia promemoria"
            : state === "not_planned_status"
                ? " · solo per le prenotazioni confermate"
                : "";

    return (
        <Text as="span" variant="caption-xs" weight={500} colorVariant="muted" className={styles.reminderMark}>
            <BellOff size={14} strokeWidth={2} aria-hidden />
            <span>{`Promemoria non previsto${why}`}</span>
        </Text>
    );
}
