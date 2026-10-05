import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { getSupportTenantProfile, type SupportTenantProfile } from "@/services/supabase/support";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import type { V2SupportTicketWithContext } from "@/types/support";
import { SUPPORT_STATUS_LABEL, SUPPORT_STATUS_VARIANT } from "@/pages/Dashboard/Support/supportLabels";
import styles from "../SupportTicketAdminPage.module.scss";

const SUBSCRIPTION_LABEL: Record<string, { label: string; variant: StatusBadgeVariant }> = {
    trialing: { label: "In prova", variant: "warning" },
    active: { label: "Attivo", variant: "success" },
    suspended: { label: "Senza abbonamento", variant: "neutral" },
    canceled: { label: "Disdetto", variant: "danger" }
};

function dayIt(iso: string): string {
    return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

function planLabel(plan: string | null): string {
    if (!plan) return "Nessun piano";
    return `Piano ${plan.charAt(0).toUpperCase()}${plan.slice(1)}`;
}

/**
 * La colonna a destra della richiesta (Proposta 2 di D39): chi è il cliente,
 * piano, da quando c'è, le sedi e le sue altre richieste. Legge l'azienda via
 * le policy di lettura del platform admin; se non si carica, resta il nome dal
 * ticket.
 */
export function SupportCustomerCard({
    ticket,
    others,
    hrefOf
}: {
    ticket: V2SupportTicketWithContext;
    /** Le altre richieste della stessa azienda, già caricate. */
    others: V2SupportTicketWithContext[];
    hrefOf: (ticketId: string) => string;
}) {
    const [profile, setProfile] = useState<SupportTenantProfile | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        setProfile(null);
        setFailed(false);
        getSupportTenantProfile(ticket.tenant_id)
            .then(p => alive && setProfile(p))
            .catch(() => alive && setFailed(true));
        return () => {
            alive = false;
        };
    }, [ticket.tenant_id]);

    const status = profile?.subscriptionStatus ? SUBSCRIPTION_LABEL[profile.subscriptionStatus] : undefined;

    return (
        <aside className={styles.side} aria-label="Il cliente">
            <section className={styles.fact}>
                <Text as="span" variant="caption-xs" weight={700} colorVariant="muted">
                    Il cliente
                </Text>
                <Text as="p" variant="body" weight={700}>
                    {profile?.name ?? ticket.tenants?.name ?? "Azienda sconosciuta"}
                </Text>
                {profile && (
                    <>
                        <span className={styles.factRow}>
                            <Text as="span" variant="body-sm">
                                {planLabel(profile.plan)}
                            </Text>
                            {status && <StatusBadge variant={status.variant} label={status.label} />}
                        </span>
                        <Text as="p" variant="caption" colorVariant="muted">
                            Con noi dal {dayIt(profile.createdAt)}
                            {profile.subscriptionStatus === "trialing" && profile.trialUntil
                                ? ` · prova fino al ${dayIt(profile.trialUntil)}`
                                : ""}
                        </Text>
                    </>
                )}
                {!profile && !failed && (
                    <Text as="p" variant="caption" colorVariant="muted">
                        Caricamento…
                    </Text>
                )}
                {failed && (
                    <Text as="p" variant="caption" colorVariant="muted">
                        Piano e sedi non caricati.
                    </Text>
                )}
            </section>

            {profile && (
                <section className={styles.fact}>
                    <Text as="span" variant="caption-xs" weight={700} colorVariant="muted">
                        {profile.activities.length === 1 ? "1 sede" : `${profile.activities.length} sedi`}
                    </Text>
                    {profile.activities.length === 0 ? (
                        <Text as="p" variant="caption" colorVariant="muted">
                            Nessuna sede.
                        </Text>
                    ) : (
                        <ul className={styles.factList}>
                            {profile.activities.map(a => (
                                <li key={a.id} className={styles.factRow}>
                                    <Text
                                        as="span"
                                        variant="body-sm"
                                        weight={a.id === ticket.activity_id ? 600 : undefined}
                                        className={styles.ellipsis}
                                    >
                                        {a.name}
                                    </Text>
                                    <StatusBadge
                                        variant={a.status === "active" ? "success" : "neutral"}
                                        label={a.status === "active" ? "Pubblicata" : "Sospesa"}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                    <Text as="p" variant="caption" colorVariant="muted">
                        {ticket.activity_id ? "In grassetto la sede della richiesta." : "La richiesta riguarda tutta l'azienda."}
                    </Text>
                </section>
            )}

            <section className={styles.fact}>
                <Text as="span" variant="caption-xs" weight={700} colorVariant="muted">
                    Altre richieste
                </Text>
                {others.length === 0 ? (
                    <Text as="p" variant="caption" colorVariant="muted">
                        È la prima.
                    </Text>
                ) : (
                    <ul className={styles.factList}>
                        {others.map(o => (
                            <li key={o.id}>
                                <Link to={hrefOf(o.id)} className={styles.otherLink}>
                                    <Text as="span" variant="body-sm" className={styles.ellipsis}>
                                        {o.subject}
                                    </Text>
                                    <span className={styles.factRow}>
                                        <Text as="span" variant="caption" colorVariant="muted">
                                            {formatDateTimeIt(o.created_at)}
                                        </Text>
                                        <StatusBadge variant={SUPPORT_STATUS_VARIANT[o.status]} label={SUPPORT_STATUS_LABEL[o.status]} />
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </aside>
    );
}
