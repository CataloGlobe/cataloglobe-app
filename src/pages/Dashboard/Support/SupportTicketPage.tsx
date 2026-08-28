import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { LoadingState } from "@/components/ui/LoadingState/LoadingState";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import {
    SupportThread,
    type SupportThreadMessage
} from "@/components/Support/SupportThread/SupportThread";
import { usePageHeader } from "@/context/usePageHeader";
import { usePermissions } from "@/context/PermissionsContext";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { useBusinessOutletContext } from "@/layouts/MainLayout/outletContext";
import { canDoOnAnyActivity } from "@/lib/permissions";
import { getActivities } from "@/services/supabase/activities";
import { getTenantMemberNames } from "@/services/supabase/team";
import {
    getTicket,
    listMessages,
    markTicketRead,
    postCustomerMessage
} from "@/services/supabase/support";
import { COMPANY } from "@/config/company";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import type { V2SupportMessage, V2SupportTicket } from "@/types/support";
import { SUPPORT_STATUS_LABEL, SUPPORT_STATUS_VARIANT } from "./supportLabels";
import styles from "./SupportTicketPage.module.scss";

/**
 * Dettaglio di una richiesta: intestazione, thread, composer.
 *
 * Route figlia (`support/:ticketId`) e non stato della lista: il thread è
 * deep-linkable — le email di notifica dovranno puntarci — il tasto indietro
 * funziona, e la conversazione ha bisogno dell'altezza piena della pagina, che
 * un drawer non le darebbe.
 */
export default function SupportTicketPage() {
    const { ticketId = "" } = useParams<{ ticketId: string }>();
    const tenantId = useTenantId();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { permissions } = usePermissions();
    const refreshSupportUnread = useBusinessOutletContext()?.refreshSupportUnread;

    const [ticket, setTicket] = useState<V2SupportTicket | null>(null);
    const [messages, setMessages] = useState<V2SupportMessage[]>([]);
    const [memberNames, setMemberNames] = useState<Map<string, string>>(() => new Map());
    const [activityName, setActivityName] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [draft, setDraft] = useState("");
    const [isSending, setIsSending] = useState(false);

    const canWrite = permissions ? canDoOnAnyActivity(permissions, "support.write") : false;

    const loadThread = useCallback(async () => {
        if (!ticketId) return;
        try {
            const [ticketRow, messageRows] = await Promise.all([
                getTicket(ticketId),
                listMessages(ticketId)
            ]);
            setTicket(ticketRow);
            setMessages(messageRows);
        } catch {
            // "inesistente" e "non tuo" sono indistinguibili per costruzione:
            // RLS li rende tali di proposito, e la UI non deve provare a
            // distinguerli.
            setNotFound(true);
        } finally {
            setIsLoading(false);
        }
    }, [ticketId]);

    useEffect(() => {
        setIsLoading(true);
        setNotFound(false);
        void loadThread();
    }, [loadThread]);

    // Nomi dei membri e nome della sede: secondari rispetto al thread, quindi
    // non bloccano la prima pittura. `getTenantMemberNames` è già anti-crash
    // (Map vuota su errore) e il fallback del componente copre il resto.
    useEffect(() => {
        if (!tenantId) return;
        let cancelled = false;
        void getTenantMemberNames(tenantId).then(names => {
            if (!cancelled) setMemberNames(names);
        });
        return () => {
            cancelled = true;
        };
    }, [tenantId]);

    useEffect(() => {
        if (!tenantId || !ticket?.activity_id) return;
        let cancelled = false;
        void getActivities(tenantId)
            .then(rows => {
                if (cancelled) return;
                setActivityName(rows.find(a => a.id === ticket.activity_id)?.name ?? null);
            })
            .catch(() => {
                /* il nome della sede è ornamentale: un errore non merita un toast */
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId, ticket?.activity_id]);

    // Marca letto all'apertura, una sola volta per ticket. `useRef` e non una
    // dipendenza dell'effetto: `markTicketRead` sposta customer_last_read_at,
    // quindi rieseguirlo a ogni render sarebbe una scrittura per render.
    const markedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!ticketId || notFound || markedRef.current === ticketId) return;
        markedRef.current = ticketId;
        void markTicketRead(ticketId)
            .then(() => refreshSupportUnread?.())
            .catch(() => {
                /* il pallino non è un dato critico: un fallimento qui non
                   merita di disturbare chi sta leggendo la conversazione */
            });
    }, [ticketId, notFound, refreshSupportUnread]);

    const threadMessages = useMemo<SupportThreadMessage[]>(
        () =>
            messages.map(m => ({
                id: m.id,
                body: m.body,
                createdAt: m.created_at,
                authorKind: m.author_kind,
                // Risolto qui, non nel componente: la mappa dei nomi è un
                // fatto della pagina. Per gli autori `platform` il valore è
                // ignorato — il componente mostra l'etichetta neutra.
                authorName: m.author_user_id
                    ? memberNames.get(m.author_user_id) ?? null
                    : null
            })),
        [messages, memberNames]
    );

    const leading = useMemo(
        () => (
            <Button variant="ghost" onClick={() => navigate("..")}>
                <ArrowLeft size={16} />
                Assistenza
            </Button>
        ),
        [navigate]
    );

    // MEMOIZZATO, e non è un vezzo: `usePageHeader` confronta `actions`,
    // `leading` e `titleAddon` PER REFERENCE. Un nodo JSX costruito inline è
    // nuovo a ogni render → l'effetto rivede una dipendenza cambiata →
    // `setConfig` → nuovo render → all'infinito, finché React non alza
    // "Maximum update depth exceeded" e la pagina si blocca. Stesso pattern di
    // StatusIncidentsPage e delle altre pagine con header ricco.
    const headerActions = useMemo(
        () =>
            ticket ? (
                <StatusBadge
                    variant={SUPPORT_STATUS_VARIANT[ticket.status]}
                    label={SUPPORT_STATUS_LABEL[ticket.status]}
                />
            ) : undefined,
        [ticket]
    );

    // Stringa, quindi confrontata per valore: qui l'inline sarebbe innocuo, ma
    // sta accanto agli altri campi dell'header per leggibilità.
    const headerSubtitle = useMemo(() => {
        if (!ticket) return undefined;
        return [`Aperta il ${formatDateTimeIt(ticket.created_at)}`, activityName]
            .filter(Boolean)
            .join(" · ");
    }, [ticket, activityName]);

    usePageHeader({
        title: ticket?.subject ?? "Richiesta",
        subtitle: headerSubtitle,
        leading,
        actions: headerActions
    });

    async function handleSend() {
        const body = draft.trim();
        if (!body || isSending) return;
        setIsSending(true);
        try {
            await postCustomerMessage(ticketId, body);
            setDraft("");
            // Ricarica il thread invece di appendere in locale: il messaggio
            // del cliente può aver RIAPERTO il ticket (trigger AFTER INSERT),
            // quindi anche l'intestazione va rifatta, non solo la lista.
            await loadThread();
            refreshSupportUnread?.();
        } catch (err) {
            showToast({
                message:
                    err instanceof Error && err.message === "SUPPORT_NOT_ALLOWED"
                        ? "Non hai i permessi per scrivere in questa richiesta."
                        : "Non è stato possibile inviare il messaggio. Riprova.",
                type: "error"
            });
        } finally {
            setIsSending(false);
        }
    }

    if (isLoading) {
        return <LoadingState message="Caricamento richiesta…" />;
    }

    if (notFound || !ticket) {
        return (
            <div className={styles.page}>
                <p className={styles.notFound}>
                    Questa richiesta non esiste o non è più accessibile.
                </p>
                <Button variant="secondary" onClick={() => navigate("..")}>
                    Torna alle richieste
                </Button>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            {/* Il thread è il figlio flex che scorre: il contratto richiesto da
                SupportThread è `flex:1 1 auto; min-height:0` sul PADRE, ed è
                `.page` a fornirlo. */}
            <SupportThread messages={threadMessages} />

            <div className={styles.composer}>
                {canWrite ? (
                    <>
                        <Textarea
                            label="Rispondi"
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            placeholder="Scrivi un messaggio…"
                            rows={3}
                            disabled={isSending}
                        />
                        <div className={styles.composerActions}>
                            <Button
                                variant="primary"
                                onClick={handleSend}
                                loading={isSending}
                                disabled={!draft.trim()}
                            >
                                Invia
                            </Button>
                        </div>
                    </>
                ) : (
                    <p className={styles.composerFallback}>
                        Per rispondere scrivi a{" "}
                        <a href={`mailto:${COMPANY.contact.support}`}>
                            {COMPANY.contact.support}
                        </a>
                        .
                    </p>
                )}
            </div>
        </div>
    );
}
