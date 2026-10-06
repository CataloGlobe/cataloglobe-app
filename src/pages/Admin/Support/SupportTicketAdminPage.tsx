import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { ChipGroupSingle, type ChipOption } from "@/components/ui/Chip/ChipGroup";
import Text from "@/components/ui/Text/Text";
import { LoadingState } from "@/components/ui/LoadingState/LoadingState";
import { Select } from "@/components/ui/Select/Select";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import {
    SupportThread,
    type SupportThreadMessage
} from "@/components/Support/SupportThread/SupportThread";
import { useAdminOutletContext } from "@/layouts/AdminLayout/outletContext";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePageTitle } from "@/hooks/usePageTitle";
import { usePollingRefresh } from "@/hooks/usePollingRefresh";
import {
    getTicket,
    listAllTickets,
    listMessages,
    postPlatformMessage,
    updateTicketStatus
} from "@/services/supabase/support";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import type {
    SupportTicketStatus,
    V2SupportMessage,
    V2SupportTicketWithContext
} from "@/types/support";
import {
    SUPPORT_QUEUE_FILTERS,
    SUPPORT_READY_REPLIES,
    DEFAULT_SUPPORT_FILTER,
    nextWaitingTicket,
    orderSupportQueue,
    supportFilterCounts,
    supportFilterFrom,
    type SupportQueueFilter
} from "@/utils/supportQueue";
import { SUPPORT_STATUS_LABEL } from "@/pages/Dashboard/Support/supportLabels";
import { SupportCustomerCard } from "./components/SupportCustomerCard";
import { SupportQueueColumn } from "./components/SupportQueueColumn";
import styles from "./SupportTicketAdminPage.module.scss";

const STATUS_OPTIONS = (
    ["open", "in_progress", "closed"] as SupportTicketStatus[]
).map(s => ({ value: s, label: SUPPORT_STATUS_LABEL[s] }));

/**
 * Confronto dei messaggi per lunghezza più id dell'ultimo.
 *
 * Basta perché i messaggi sono IMMUTABILI a database: UPDATE e DELETE su
 * `support_messages` sono negate a tutti da due policy RESTRICTIVE
 * (20260827100003), quindi l'unico modo in cui la lista può differire è che ne
 * siano arrivati di nuovi in coda.
 */
function sameMessageList(a: V2SupportMessage[], b: V2SupportMessage[]): boolean {
    if (a.length !== b.length) return false;
    if (a.length === 0) return true;
    return a[a.length - 1].id === b[b.length - 1].id;
}

/**
 * Solo i campi che questa pagina disegna. Include i due embed, che la vista
 * cliente non ha: qui l'azienda è l'informazione principale dell'intestazione.
 */
function sameTicketView(
    a: V2SupportTicketWithContext | null,
    b: V2SupportTicketWithContext | null
): boolean {
    if (a === null || b === null) return a === b;
    return (
        a.id === b.id &&
        a.subject === b.subject &&
        a.status === b.status &&
        a.created_at === b.created_at &&
        (a.tenants?.name ?? null) === (b.tenants?.name ?? null) &&
        (a.activities?.name ?? null) === (b.activities?.name ?? null)
    );
}

/**
 * Dettaglio di una richiesta dal lato piattaforma.
 *
 * ── I nomi dei clienti non sono risolvibili, e non è un limite da aggirare ──
 * `get_tenant_member_names` è gated su `get_my_tenant_ids()` e un platform
 * admin non è membro del tenant. Gli autori `customer` mostrano quindi
 * l'etichetta "Cliente", senza nome proprio. Il contesto che serve a chi
 * risponde è QUALE AZIENDA scrive, e quello arriva dal ticket (embed
 * `tenants(name)`, sbloccato dalla migration 20260828130000).
 *
 * ── Il cambio stato è un Select con salvataggio immediato ───────────────────
 * Tre valori mutuamente esclusivi, cambiati di rado, e ogni transizione è
 * reversibile — anche "Chiusa", che un messaggio del cliente riapre da sola
 * via trigger. Non c'è nulla da confermare, quindi niente dialog: un ConfirmDialog
 * su un'azione annullabile è attrito senza contropartita. Un gruppo di bottoni
 * avrebbe occupato la stessa riga dell'header per un'azione che si usa una
 * volta per conversazione.
 *
 * ── Tre colonne da 768 in su (D39, Proposta 2 scelta da Alex il 2026-10-05) ──
 * In alto «‹ Supporto» e i filtri coi numeri (`?filtro=`, lo stesso
 * dell'elenco); sotto le richieste del filtro, la conversazione con le
 * risposte pronte, la scheda del cliente. «Invia e passa alla prossima» apre
 * la prossima che aspetta voi dentro il filtro. Sul telefono resta una
 * colonna sola con la testata del guscio.
 */

export default function SupportTicketAdminPage() {
    const { ticketId = "" } = useParams<{ ticketId: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const filter = supportFilterFrom(searchParams.get("filtro"));
    const isPhone = useMediaQuery("(max-width: 767px)");
    usePageTitle("Supporto");
    // Optional-chained: il context esiste solo dentro l'Outlet di AdminLayout.
    // Stessa forma di `refreshSupportUnread` nel dettaglio lato cliente.
    const refreshSupportPending = useAdminOutletContext()?.refreshSupportPending;

    const [ticket, setTicket] = useState<V2SupportTicketWithContext | null>(null);
    const [messages, setMessages] = useState<V2SupportMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [draft, setDraft] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isChangingStatus, setIsChangingStatus] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [queue, setQueue] = useState<V2SupportTicketWithContext[]>([]);
    const [now, setNow] = useState(() => new Date());

    const filterSuffix = filter === DEFAULT_SUPPORT_FILTER ? "" : `?filtro=${filter}`;
    const hrefOf = useCallback((id: string) => `/admin/supporto/${id}${filterSuffix}`, [filterSuffix]);
    const backHref = `/admin/supporto${filterSuffix}`;

    // L'elenco a sinistra e i numeri dei filtri: si ricarica dopo ogni
    // risposta o cambio stato, non a ogni poll.
    const loadQueue = useCallback(async () => {
        try {
            setQueue(await listAllTickets());
            setNow(new Date());
        } catch {
            // Senza elenco la richiesta si legge e si risponde lo stesso.
        }
    }, []);

    useEffect(() => {
        if (!isPhone) void loadQueue();
    }, [isPhone, loadQueue]);

    /**
     * `silent` = ricarica di background (poll o ritorno in focus). Un errore di
     * rete lì NON deve far comparire "questa richiesta non esiste": è la
     * connessione ad aver fatto un buco, non il ticket a essere sparito. Solo
     * il caricamento iniziale può concludere che non è accessibile.
     */
    const loadThread = useCallback(
        async ({ silent = false }: { silent?: boolean } = {}) => {
            if (!ticketId) return;
            try {
                const [ticketRow, messageRows] = await Promise.all([
                    getTicket(ticketId),
                    listMessages(ticketId)
                ]);
                // Aggiornamenti condizionali: se il poll non porta nulla di
                // nuovo si restituisce lo stesso riferimento e React salta il
                // render, così la conversazione non si ridisegna ogni 15
                // secondi sotto le mani di chi sta scrivendo.
                setMessages(prev => (sameMessageList(prev, messageRows) ? prev : messageRows));
                setTicket(prev => (sameTicketView(prev, ticketRow) ? prev : ticketRow));
            } catch {
                if (!silent) setNotFound(true);
            } finally {
                if (!silent) setIsLoading(false);
            }
        },
        [ticketId]
    );

    useEffect(() => {
        setIsLoading(true);
        setNotFound(false);
        void loadThread();
    }, [loadThread]);

    // Sospeso durante l'invio e durante il cambio stato: un poll che atterrasse
    // a metà sovrascriverebbe lo stato mentre la scrittura è in volo.
    const refreshInBackground = useCallback(() => {
        void loadThread({ silent: true });
    }, [loadThread]);
    usePollingRefresh(refreshInBackground, {
        enabled: !isSending && !isChangingStatus && !notFound
    });

    const threadMessages = useMemo<SupportThreadMessage[]>(
        () =>
            messages.map(m => ({
                id: m.id,
                body: m.body,
                createdAt: m.created_at,
                authorKind: m.author_kind,
                authorUserId: m.author_user_id,
                // "Cliente" è un valore legittimo, non un fallback: da qui i
                // nomi dei membri del tenant non sono risolvibili per
                // costruzione. Per gli autori `platform` il componente ignora
                // questo campo e mostra "Supporto" più il badge CataloGlobe.
                authorName: "Cliente"
            })),
        [messages]
    );

    const handleStatusChange = useCallback(
        async (next: SupportTicketStatus) => {
            if (!ticket || next === ticket.status) return;
            setIsChangingStatus(true);
            setActionError(null);
            try {
                await updateTicketStatus(ticketId, next);
                // Ricarica invece di aggiornare in locale: `closed_at` lo
                // deriva un trigger BEFORE UPDATE, quindi il valore vero lo
                // conosce solo il database.
                await loadThread({ silent: true });
                void loadQueue();
                // Chiudere o riaprire una richiesta la toglie o la rimette
                // nella coda di chi aspetta: il pallino in sidebar va rivalutato.
                refreshSupportPending?.();
            } catch {
                setActionError("Non è stato possibile cambiare lo stato.");
            } finally {
                setIsChangingStatus(false);
            }
        },
        [ticket, ticketId, loadThread, loadQueue, refreshSupportPending]
    );

    const ordered = useMemo(() => orderSupportQueue(queue, filter), [queue, filter]);
    const nextTicket = useMemo(() => nextWaitingTicket(ordered, ticketId), [ordered, ticketId]);

    const handleSend = useCallback(async (goNext = false) => {
        const body = draft.trim();
        if (!body || isSending) return;
        // La prossima si sceglie prima di inviare: dopo, questa non aspetta più.
        const target = goNext ? nextTicket : null;
        setIsSending(true);
        setActionError(null);
        try {
            await postPlatformMessage(ticketId, body);
            setDraft("");
            if (target) {
                refreshSupportPending?.();
                navigate(hrefOf(target.id));
                return;
            }
            // Ricarica: il trigger aggiorna `last_message_kind` e
            // `last_message_at` sul ticket, che l'header e la coda leggono.
            await loadThread({ silent: true });
            // Rispondere sposta `last_message_kind` a 'platform': questa
            // richiesta non aspetta più, e il pallino in sidebar si spegne se
            // era l'ultima.
            refreshSupportPending?.();
            void loadQueue();
        } catch {
            setActionError("Non è stato possibile inviare il messaggio.");
        } finally {
            setIsSending(false);
        }
    }, [draft, isSending, ticketId, loadThread, loadQueue, refreshSupportPending, nextTicket, navigate, hrefOf]);

    // MEMOIZZATI. `usePageHeader` confronta `actions` e `leading` per
    // reference: un nodo JSX inline scatena un loop di setConfig che blocca
    // l'intera area /admin, dove il provider è montato in AdminLayout.
    const leading = useMemo(
        () => (
            // `leftIcon` e non l'icona fra i children: i children finiscono
            // dentro lo span `.label` del Button, che è `display: flex` senza
            // gap né align-items — l'SVG si allineava al bordo alto della riga
            // di testo e restava attaccato alle lettere. La prop lo avvolge
            // invece in `.icon` (inline-flex centrato) e lo rende fratello del
            // testo, quindi prende il `gap: 0.45rem` del bottone. Stesso uso di
            // CreateBusinessWizard.
            <Button
                variant="ghost"
                onClick={() => navigate(backHref)}
                leftIcon={<ArrowLeft size={16} />}
            >
                Supporto
            </Button>
        ),
        [navigate, backHref]
    );

    const headerActions = useMemo(
        () =>
            ticket ? (
                <Select
                    value={ticket.status}
                    onChange={e =>
                        void handleStatusChange(e.target.value as SupportTicketStatus)
                    }
                    options={STATUS_OPTIONS}
                    disabled={isChangingStatus}
                    aria-label="Stato della richiesta"
                />
            ) : undefined,
        [ticket, isChangingStatus, handleStatusChange]
    );

    const subtitle = useMemo(() => {
        if (!ticket) return undefined;
        return [
            ticket.tenants?.name ?? "Azienda sconosciuta",
            ticket.activities?.name,
            `Aperta il ${formatDateTimeIt(ticket.created_at)}`
        ]
            .filter(Boolean)
            .join(" · ");
    }, [ticket]);

    // Il "← Supporto" non è una sezione: non c'è niente da scegliere, si torna
    // in un posto solo. Lo stato del ticket è invece una mutazione dell'entità,
    // quindi sta sempre a vista come Bozza/Pubblicata delle storie.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        backAction: { label: "Supporto", onClick: () => navigate(backHref) },
        statusControl: ticket
            ? {
                  options: STATUS_OPTIONS,
                  value: ticket.status,
                  onChange: value => void handleStatusChange(value as SupportTicketStatus),
                  label: "Stato della richiesta",
                  disabled: isChangingStatus
              }
            : undefined
    }), [navigate, backHref, ticket, isChangingStatus, handleStatusChange]);

    // Da 768 in su la testata la disegna la pagina, come nella scheda del lead.
    usePageHeader(
        isPhone
            ? { title: ticket?.subject ?? "Richiesta", subtitle, leading, actions: headerActions, compact: headerCompact }
            : {}
    );

    const counts = useMemo(() => supportFilterCounts(queue), [queue]);
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
    const others = useMemo(
        () => (ticket ? queue.filter(t => t.tenant_id === ticket.tenant_id && t.id !== ticket.id) : []),
        [queue, ticket]
    );

    if (isLoading) {
        return <LoadingState message="Caricamento richiesta…" />;
    }

    if (notFound || !ticket) {
        return (
            <div className={styles.page}>
                <p className={styles.notFound}>Questa richiesta non esiste.</p>
                <Button variant="secondary" onClick={() => navigate(backHref)}>
                    Torna alla coda
                </Button>
            </div>
        );
    }

    const readyReplies = (
        <div className={styles.ready} role="group" aria-label="Risposte pronte">
            {SUPPORT_READY_REPLIES.map(r => (
                <button
                    key={r.label}
                    type="button"
                    className={styles.readyChip}
                    disabled={isSending}
                    onClick={() => setDraft(prev => (prev.trim() ? `${prev.trimEnd()}\n\n${r.text}` : r.text))}
                >
                    <Text as="span" variant="caption" weight={500}>
                        {r.label}
                    </Text>
                </button>
            ))}
        </div>
    );

    const composer = (
        <div className={styles.composer}>
            {!isPhone && readyReplies}
            <Textarea
                label="Rispondi come CataloGlobe"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Scrivi la risposta…"
                rows={4}
                disabled={isSending}
            />
            {actionError && <p className={styles.error}>{actionError}</p>}
            <div className={styles.composerActions}>
                {!isPhone && nextTicket ? (
                    <>
                        <Button variant="secondary" onClick={() => void handleSend()} loading={isSending} disabled={!draft.trim()}>
                            Invia
                        </Button>
                        <Button variant="primary" onClick={() => void handleSend(true)} loading={isSending} disabled={!draft.trim()}>
                            Invia e passa alla prossima
                        </Button>
                    </>
                ) : (
                    <Button variant="primary" onClick={() => void handleSend()} loading={isSending} disabled={!draft.trim()}>
                        Invia risposta
                    </Button>
                )}
            </div>
        </div>
    );

    // viewerSide="platform": da qui le risposte del supporto stanno a destra.
    // Nessun `currentUserId`: gli autori customer sono tutti "Cliente", quindi
    // un "· tu" non distinguerebbe nulla.
    const thread = <SupportThread messages={threadMessages} viewerSide="platform" />;

    if (isPhone) {
        return (
            <div className={styles.page}>
                {thread}
                {composer}
            </div>
        );
    }

    return (
        <div className={styles.desk}>
            <div className={styles.toolbar}>
                <Link to={backHref} className={styles.backLink}>
                    <Text as="span" variant="body-sm" weight={600} color="inherit">
                        ‹ Supporto
                    </Text>
                </Link>
                <ChipGroupSingle
                    options={chipOptions}
                    value={filter}
                    onChange={next => navigate(next === DEFAULT_SUPPORT_FILTER ? `/admin/supporto/${ticketId}` : `/admin/supporto/${ticketId}?filtro=${next}`, { replace: true })}
                    ariaLabel="Filtra le richieste"
                    layout="auto"
                />
            </div>
            <div className={styles.frame}>
                <SupportQueueColumn tickets={queue} filter={filter} currentId={ticketId} now={now} hrefOf={hrefOf} />

                <section className={styles.center} aria-labelledby="ticket-subject">
                    <header className={styles.head}>
                        <div className={styles.titleRow}>
                            <Text as="h1" id="ticket-subject" variant="title-md" weight={700} className={styles.ellipsis}>
                                {ticket.subject}
                            </Text>
                            <span className={styles.titleActions}>{headerActions}</span>
                        </div>
                        <Text as="p" variant="caption" colorVariant="muted">
                            {subtitle}
                        </Text>
                    </header>
                    <div className={styles.conversation}>
                        {thread}
                        {composer}
                    </div>
                </section>

                <SupportCustomerCard ticket={ticket} others={others} hrefOf={hrefOf} />
            </div>
        </div>
    );
}
