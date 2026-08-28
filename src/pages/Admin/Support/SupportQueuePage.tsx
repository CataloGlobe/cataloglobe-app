import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LifeBuoy } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState/LoadingState";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Select } from "@/components/ui/Select/Select";
import { usePageHeader } from "@/context/usePageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { listAllTickets } from "@/services/supabase/support";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import type { SupportTicketStatus, V2SupportTicketWithContext } from "@/types/support";
import {
    SUPPORT_STATUS_LABEL,
    SUPPORT_STATUS_VARIANT
} from "@/pages/Dashboard/Support/supportLabels";
import styles from "./SupportQueuePage.module.scss";

/**
 * Coda di supporto della piattaforma: i ticket di TUTTI i tenant.
 *
 * ── Ordinamento e filtro ────────────────────────────────────────────────────
 * `last_message_at` ASC — chi aspetta da più tempo in cima. È l'opposto della
 * vista cliente (DESC, il più recente prima) perché rispondono a due domande
 * diverse: "cosa è successo di recente" contro "chi non ha ancora ricevuto
 * risposta".
 *
 * I chiusi sono nascosti di default: sono conversazioni finite, e tenerli in
 * coda diluisce il lavoro da fare. Restano raggiungibili dal filtro.
 *
 * ── L'evidenza sulle righe in attesa ────────────────────────────────────────
 * `last_message_kind === 'customer'` significa che l'ultima parola è del
 * cliente: quelle righe aspettano una risposta ed è l'informazione più utile
 * della pagina. Lo stato da solo non basta a dirlo — un ticket può essere
 * `in_progress` con l'ultima parola già nostra.
 */

type StatusFilter = SupportTicketStatus | "all" | "open_only";

const FILTER_OPTIONS = [
    { value: "open_only", label: "Da gestire (nasconde le chiuse)" },
    { value: "open", label: "Solo aperte" },
    { value: "in_progress", label: "Solo in lavorazione" },
    { value: "closed", label: "Solo chiuse" },
    { value: "all", label: "Tutte" }
];

export default function SupportQueuePage() {
    usePageTitle("Supporto");
    const navigate = useNavigate();

    const [tickets, setTickets] = useState<V2SupportTicketWithContext[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [filter, setFilter] = useState<StatusFilter>("open_only");

    const load = useCallback(async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            // "open_only" non è un valore di `status`: è l'assenza di 'closed'.
            // Si scarica tutto e si filtra qui — il filtro server-side accetta
            // un solo stato, e una coda di supporto non ha i volumi per cui
            // valga la pena complicare il service.
            const rows = await listAllTickets(
                filter === "all" || filter === "open_only" ? undefined : { status: filter }
            );
            setTickets(
                filter === "open_only" ? rows.filter(t => t.status !== "closed") : rows
            );
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        void load();
    }, [load]);

    const waitingCount = useMemo(
        () => tickets.filter(t => t.last_message_kind === "customer").length,
        [tickets]
    );

    // MEMOIZZATO: usePageHeader confronta `actions` per reference, e un nodo
    // JSX inline scatena un loop di setConfig che blocca l'area /admin.
    const headerActions = useMemo(
        () => (
            <Select
                value={filter}
                onChange={e => setFilter(e.target.value as StatusFilter)}
                options={FILTER_OPTIONS}
                aria-label="Filtra per stato"
            />
        ),
        [filter]
    );

    const subtitle = useMemo(() => {
        if (isLoading) return undefined;
        if (waitingCount === 0) return "Nessuna richiesta in attesa di risposta.";
        return waitingCount === 1
            ? "1 richiesta aspetta una risposta."
            : `${waitingCount} richieste aspettano una risposta.`;
    }, [isLoading, waitingCount]);

    usePageHeader({
        title: "Supporto",
        subtitle,
        actions: headerActions
    });

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

    if (tickets.length === 0) {
        return (
            <EmptyState
                icon={<LifeBuoy size={40} strokeWidth={1.5} />}
                title="Nessuna richiesta"
                description={
                    filter === "open_only"
                        ? "Nessuna richiesta aperta. Le chiuse restano nel filtro."
                        : "Nessuna richiesta con questo filtro."
                }
            />
        );
    }

    return (
        <ul className={styles.list}>
            {tickets.map(ticket => {
                const waiting = ticket.last_message_kind === "customer";
                return (
                    <li key={ticket.id}>
                        <button
                            type="button"
                            className={styles.row}
                            data-waiting={waiting || undefined}
                            onClick={() => navigate(ticket.id)}
                        >
                            <span className={styles.rowMain}>
                                <span className={styles.subject}>{ticket.subject}</span>
                                <span className={styles.meta}>
                                    {/* `null` quando l'embed non risolve: non
                                        distinguibile da "azienda cancellata". */}
                                    {ticket.tenants?.name ?? "Azienda sconosciuta"}
                                    {ticket.activities?.name
                                        ? ` · ${ticket.activities.name}`
                                        : ""}
                                    {` · ${formatDateTimeIt(ticket.last_message_at)}`}
                                </span>
                            </span>

                            {waiting && (
                                <span className={styles.waitingTag}>In attesa</span>
                            )}

                            <StatusBadge
                                variant={SUPPORT_STATUS_VARIANT[ticket.status]}
                                label={SUPPORT_STATUS_LABEL[ticket.status]}
                            />
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
