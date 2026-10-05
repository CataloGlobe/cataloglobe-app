import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import type { CrmAppointmentWithVenue, CrmVenueListItem } from "@/types/crm";
import type { VenueWait } from "@/utils/crm/crmHome";
import { relativeAgo } from "@/utils/crm/crmHome";
import { contactLine, shortDayAndTime, waitSentence } from "@/utils/crm/leadViews";
import { CRM_STAGE_LABEL, CRM_STAGE_VARIANT } from "@/utils/crm/stages";
import styles from "../Leads.module.scss";

/**
 * L'elenco dei lead al telefono (T8a): una riga per locale con il tempo a
 * destra, la frase di cosa succede e la fase. Le righe che aspettano voi
 * prendono il colore dell'urgenza.
 */
export function LeadPhoneList({
    venues,
    waits,
    next,
    nameOf,
    now
}: {
    venues: CrmVenueListItem[];
    waits: Map<string, VenueWait>;
    next: Map<string, CrmAppointmentWithVenue>;
    nameOf: (userId: string | null) => string | null;
    now: Date;
}) {
    return (
        <ul className={styles.phoneList} aria-label="Lead">
            {venues.map(v => {
                const wait = waits.get(v.id);
                const appointment = next.get(v.id);
                const level = wait && wait.level !== "normale" ? wait.level : undefined;
                const when = wait ? wait.wait : appointment ? shortDayAndTime(appointment.starts_at, now) : relativeAgo(v.last_activity_at, now);
                const caller = appointment ? nameOf(appointment.caller_user_id) : null;
                const sentence = wait
                    ? waitSentence(wait.text)
                    : appointment
                      ? `${v.stage === "demo_fissata" ? "Demo" : "Telefonata"}${caller ? `, chiama ${caller}` : ""}`
                      : contactLine({ venue: v, wait: undefined, next: undefined, now }).text;
                return (
                    <li key={v.id}>
                        <Link to={`/admin/lead/${v.id}`} className={styles.phoneRow} data-level={level}>
                            <span className={styles.phoneRowTop}>
                                <Text as="span" variant="body" weight={700}>
                                    {v.name}
                                </Text>
                                <Text as="span" variant="caption" className={styles.phoneWhen} data-level={level}>
                                    {when}
                                </Text>
                            </span>
                            {/* «Ieri» a destra e «Ieri» sotto: la frase si toglie. */}
                            {sentence.toLowerCase() !== when.toLowerCase() && (
                                <Text as="span" variant="body-sm" colorVariant="muted">
                                    {sentence}
                                </Text>
                            )}
                            <StatusBadge
                                variant={CRM_STAGE_VARIANT[v.stage]}
                                label={CRM_STAGE_LABEL[v.stage]}
                                className={styles.phoneBadge}
                            />
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}
