import { Link } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import type { CrmAppointmentWithVenue } from "@/types/crm";
import type { TimelineEvent } from "@/utils/crm/crmHome";
import styles from "../Home.module.scss";

/** I pezzi piccoli della Home del CRM: una voce di «Da stamattina», un numero, una riga dell'agenda. */

const HOUR = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "numeric", minute: "2-digit" });

export function MorningFact({ n, one, many }: { n: number; one: string; many: string }) {
    return (
        <Text as="span" variant="body-sm">
            <strong>{n}</strong> {n === 1 ? one : many}
        </Text>
    );
}

export function Figure({
    label,
    short,
    value,
    delta,
    note,
    link,
    compact
}: {
    label: string;
    short?: string;
    value: number;
    delta?: number;
    note?: string;
    link?: { to: string; label: string };
    compact: boolean;
}) {
    if (compact) {
        return (
            <div className={styles.figureInline}>
                <Text as="span" variant="body-sm" colorVariant="muted">
                    {short ?? label}
                </Text>
                <Text as="span" variant="title-sm" weight={700}>
                    {value}
                </Text>
            </div>
        );
    }
    return (
        <div className={styles.figure}>
            <Text as="span" variant="caption" colorVariant="muted">
                {label}
            </Text>
            <Text as="span" variant="title-lg" weight={700} className={styles.figureValue}>
                {value}
            </Text>
            {delta !== undefined && delta !== 0 && (
                <Text as="span" variant="caption" className={styles.delta} data-sign={delta > 0 ? "up" : "down"}>
                    {delta > 0 ? `+${delta}` : delta}
                    <span className="visually-hidden"> rispetto alla settimana prima</span>
                </Text>
            )}
            {note && (
                <Text as="span" variant="caption" colorVariant="muted">
                    {note}
                </Text>
            )}
            {link && (
                <Text as={Link} to={link.to} variant="caption" className={styles.figureLink}>
                    {link.label}
                </Text>
            )}
        </div>
    );
}

export function AgendaRow({ appointment, caller }: { appointment: CrmAppointmentWithVenue; caller: string | null }) {
    return (
        <li>
            <Link to={`/admin/lead/${appointment.venue_id}`} className={styles.agendaRow}>
                <Text as="span" variant="body-sm" weight={700} className={styles.agendaTime}>
                    {HOUR.format(new Date(appointment.starts_at))}
                </Text>
                <span className={styles.agendaBody}>
                    <Text as="span" variant="body-sm">
                        {appointment.venue_name}
                    </Text>
                    <Text as="span" variant="caption" colorVariant="muted">
                        Telefonata{caller ? ` · chiama ${caller}` : ""}
                    </Text>
                </span>
            </Link>
        </li>
    );
}

/** «Libero dopo le 18»: dopo l'ultima telefonata di oggi. */
export function FreeAfter({ appointments }: { appointments: CrmAppointmentWithVenue[] }) {
    const last = appointments[appointments.length - 1];
    return (
        <li className={styles.agendaRow}>
            <span className={styles.agendaTime} aria-hidden="true">
                —
            </span>
            <Text as="span" variant="caption" colorVariant="muted">
                Libero dopo le {HOUR.format(new Date(last.ends_at))}
            </Text>
        </li>
    );
}

export function TimelineItem({ event }: { event: TimelineEvent }) {
    return (
        <div className={styles.event} data-tone={event.tone}>
            <Text as="span" variant="body-sm" className={styles.eventText}>
                {HOUR.format(new Date(event.at))} · {event.before ? `${event.before} ` : ""}
                <Link to={`/admin/lead/${event.venueId}`} className={styles.eventVenue}>
                    {event.venueName}
                </Link>
                {event.after ? ` ${event.after}` : ""}
            </Text>
            {event.tone === "attesa" && (
                <Text as={Link} to={`/admin/lead/${event.venueId}`} variant="body-sm" weight={600} className={styles.eventOpen}>
                    Apri
                </Text>
            )}
        </div>
    );
}
