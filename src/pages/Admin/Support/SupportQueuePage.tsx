import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, LifeBuoy } from "lucide-react";
import { ChipGroupSingle, type ChipOption } from "@/components/ui/Chip/ChipGroup";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState/LoadingState";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { usePageHeader } from "@/context/usePageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { listAllTickets } from "@/services/supabase/support";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import { relativeAgo } from "@/utils/crm/crmHome";
import {
    DEFAULT_SUPPORT_FILTER,
    SUPPORT_QUEUE_FILTERS,
    groupSupportQueue,
    matchesSupportFilter,
    supportFilterCounts,
    supportFilterFrom,
    supportWaitIsLate,
    waitsForUs,
    type SupportQueueFilter
} from "@/utils/supportQueue";
import type { V2SupportTicketWithContext } from "@/types/support";
import { SUPPORT_STATUS_LABEL, SUPPORT_STATUS_VARIANT } from "@/pages/Dashboard/Support/supportLabels";
import styles from "./SupportQueuePage.module.scss";
import { adminErrorMessage } from "@/utils/crm/stages";

/**
 * Coda di supporto della piattaforma: i ticket di TUTTI i tenant.
 *
 * ── Ordinamento e filtro ────────────────────────────────────────────────────
 * `last_message_at` ASC — chi aspetta da più tempo in cima. È l'opposto della
 * vista cliente (DESC, il più recente prima) perché rispondono a due domande
 * diverse: "cosa è successo di recente" contro "chi non ha ancora ricevuto
 * risposta".
 *
 * Si scarica tutto una volta e si filtra qui (ritocco R5): i chip dicono quante
 * richieste ci sono in ogni vista, e una coda di supporto non ha i volumi per
 * cui valga la pena filtrare sul server. Le chiuse sono fuori dalla vista di
 * partenza, «Da gestire», e restano nel loro chip.
 *
 * ── Chi aspetta chi ─────────────────────────────────────────────────────────
 * `last_message_kind === 'customer'` su una richiesta non chiusa: l'ultima
 * parola è del cliente e tocca a voi. Quelle righe stanno nel gruppo
 * «Aspettano voi», in cima, col pallino; oltre `SUPPORT_LATE_HOURS` l'attesa si
 * legge in arancione. Lo stato da solo non basta a dirlo — un ticket può essere
 * `in_progress` con l'ultima parola già nostra.
 */

/** «da 6 ore», «da ieri»; «adesso» resta com'è. */
function waitLabel(iso: string, now: Date): string {
    const ago = relativeAgo(iso, now);
    return ago === "adesso" ? ago : `da ${ago}`;
}

function lastLine(ticket: V2SupportTicketWithContext): string {
    const when = formatDateTimeIt(ticket.last_message_at);
    if (ticket.status === "closed") return `chiusa, ultimo messaggio ${when}`;
    if (ticket.last_message_kind === "customer") return `ultimo messaggio del cliente, ${when}`;
    if (ticket.last_message_kind === "platform") return `avete risposto voi, ${when}`;
    return when;
}

export default function SupportQueuePage() {
    usePageTitle("Supporto");
    const navigate = useNavigate();

    const [tickets, setTickets] = useState<V2SupportTicketWithContext[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    // Il filtro sta nell'indirizzo: la richiesta aperta lo tiene e «‹ Supporto»
    // torna qui con lo stesso.
    const [searchParams, setSearchParams] = useSearchParams();
    const filter = supportFilterFrom(searchParams.get("filtro"));
    const setFilter = useCallback(
        (next: SupportQueueFilter) =>
            setSearchParams(
                prev => {
                    const params = new URLSearchParams(prev);
                    if (next === DEFAULT_SUPPORT_FILTER) params.delete("filtro");
                    else params.set("filtro", next);
                    return params;
                },
                { replace: true }
            ),
        [setSearchParams]
    );
    // Un orologio per caricamento: le attese restano coerenti fra loro.
    const [now, setNow] = useState(() => new Date());

    const load = useCallback(async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            setTickets(await listAllTickets());
            setNow(new Date());
        } catch (err) {
            setLoadError(adminErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const counts = useMemo(() => supportFilterCounts(tickets), [tickets]);
    const groups = useMemo(
        () => groupSupportQueue(tickets.filter(t => matchesSupportFilter(t, filter)), filter),
        [tickets, filter]
    );

    const chipOptions = useMemo<ChipOption<SupportQueueFilter>[]>(
        () =>
            SUPPORT_QUEUE_FILTERS.map(f => ({
                value: f.value,
                label: f.label,
                count: counts[f.value],
                tone:
                    (f.value === "aspettano_voi" && counts.aspettano_voi > 0) || (f.value === "non_gestite" && counts.non_gestite > 0)
                        ? "warning"
                        : undefined
            })),
        [counts]
    );

    const subtitle = useMemo(() => {
        if (isLoading) return undefined;
        const n = counts.aspettano_voi;
        if (n === 0) return "Nessuna richiesta aspetta una vostra risposta.";
        return n === 1 ? "1 richiesta aspetta una vostra risposta." : `${n} richieste aspettano una vostra risposta.`;
    }, [isLoading, counts.aspettano_voi]);

    usePageHeader({ title: "Supporto", subtitle });

    if (isLoading) {
        return <LoadingState message="Caricamento coda…" />;
    }

    if (loadError) {
        return (
            <EmptyState
                icon={<LifeBuoy size={40} strokeWidth={1.5} />}
                title="Non è stato possibile caricare la coda"
                description={loadError}
            />
        );
    }

    return (
        <div className={styles.page}>
            <ChipGroupSingle options={chipOptions} value={filter} onChange={setFilter} ariaLabel="Filtra le richieste" layout="auto" />

            {groups.length === 0 ? (
                <EmptyState
                    icon={<LifeBuoy size={40} strokeWidth={1.5} />}
                    title="Nessuna richiesta"
                    description={
                        filter === "da_gestire"
                            ? "Nessuna richiesta aperta. Le chiuse restano nel loro filtro."
                            : "Nessuna richiesta con questo filtro."
                    }
                />
            ) : (
                <div className={styles.panel}>
                    {groups.map(group => (
                        <section key={group.title} aria-label={group.title}>
                            <h2 className={styles.groupHead}>
                                <Text as="span" variant="caption" weight={600} colorVariant="muted">
                                    {group.title}
                                </Text>
                                <Text as="span" variant="caption" colorVariant="muted">
                                    · {group.tickets.length}
                                </Text>
                            </h2>
                            <ul className={styles.list}>
                                {group.tickets.map(ticket => {
                                    const ours = waitsForUs(ticket);
                                    const late = supportWaitIsLate(ticket, now);
                                    return (
                                        <li key={ticket.id}>
                                            <button
                                                type="button"
                                                className={styles.row}
                                                data-ours={ours || undefined}
                                                onClick={() =>
                                                    navigate(filter === DEFAULT_SUPPORT_FILTER ? ticket.id : `${ticket.id}?filtro=${filter}`)
                                                }
                                            >
                                                <span className={styles.flag} aria-hidden="true" />
                                                <span className={styles.main}>
                                                    <Text as="span" variant="body-sm" weight={600} className={styles.ellipsis}>
                                                        {ticket.subject}
                                                    </Text>
                                                    <Text as="span" variant="caption" colorVariant="muted" className={styles.ellipsis}>
                                                        {lastLine(ticket)}
                                                    </Text>
                                                </span>
                                                <span className={styles.who}>
                                                    {/* `null` quando l'embed non risolve: non
                                                        distinguibile da "azienda cancellata". */}
                                                    <Text as="span" variant="body-sm" className={styles.ellipsis}>
                                                        {ticket.tenants?.name ?? "Azienda sconosciuta"}
                                                    </Text>
                                                    <Text as="span" variant="caption" colorVariant="muted" className={styles.ellipsis}>
                                                        {ticket.activities?.name ?? "tutta l'azienda"}
                                                    </Text>
                                                </span>
                                                <Text
                                                    as="span"
                                                    variant="body-sm"
                                                    weight={late ? 600 : undefined}
                                                    colorVariant={late ? "warning" : ours ? "default" : "muted"}
                                                    className={styles.wait}
                                                >
                                                    {ticket.status === "closed" ? "chiusa" : waitLabel(ticket.last_message_at, now)}
                                                </Text>
                                                <span className={styles.badge}>
                                                    <StatusBadge
                                                        variant={SUPPORT_STATUS_VARIANT[ticket.status]}
                                                        label={SUPPORT_STATUS_LABEL[ticket.status]}
                                                    />
                                                </span>
                                                <ChevronRight size={16} className={styles.chevron} aria-hidden="true" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
