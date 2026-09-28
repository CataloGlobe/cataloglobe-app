import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LifeBuoy, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import {
    SupportThread,
    type SupportThreadMessage
} from "@/components/Support/SupportThread/SupportThread";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { usePermissions } from "@/context/PermissionsContext";
import { useAuth } from "@/context/useAuth";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { useBusinessOutletContext } from "@/layouts/MainLayout/outletContext";
import { usePollingRefresh } from "@/hooks/usePollingRefresh";
import { canDoOnAnyActivity, canDoOnTenant } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { getTenantMemberNames } from "@/services/supabase/team";
import {
    getTicket,
    listMessages,
    markTicketRead,
    postCustomerMessage
} from "@/services/supabase/support";
import { COMPANY } from "@/config/company";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import type { V2SupportMessage, V2SupportTicketWithContext } from "@/types/support";
import { SUPPORT_STATUS_LABEL, SUPPORT_STATUS_VARIANT } from "./supportLabels";
import styles from "./SupportTicketPage.module.scss";

/**
 * Confronto dei messaggi per lunghezza più id dell'ultimo.
 *
 * Basta perché i messaggi sono IMMUTABILI a database: UPDATE e DELETE su
 * `support_messages` sono negate a tutti da due policy RESTRICTIVE
 * (20260827100003). Un messaggio, una volta scritto, non cambia più — quindi
 * l'unico modo in cui la lista può differire è che ne siano arrivati di nuovi
 * in coda. Se quell'invariante cadesse, questo confronto andrebbe rifatto.
 */
function sameMessageList(a: V2SupportMessage[], b: V2SupportMessage[]): boolean {
    if (a.length !== b.length) return false;
    if (a.length === 0) return true;
    return a[a.length - 1].id === b[b.length - 1].id;
}

/** Solo i campi del ticket che questa pagina disegna. */
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
        a.activity_id === b.activity_id &&
        a.activities?.name === b.activities?.name
    );
}

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
    const { user } = useAuth();
    const refreshSupportUnread = useBusinessOutletContext()?.refreshSupportUnread;

    const [ticket, setTicket] = useState<V2SupportTicketWithContext | null>(null);
    const [messages, setMessages] = useState<V2SupportMessage[]>([]);
    const [memberNames, setMemberNames] = useState<Map<string, string>>(() => new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [draft, setDraft] = useState("");
    const [isSending, setIsSending] = useState(false);

    // Stesso gate di lettura della lista (tenant, vedi Support.tsx), prima di
    // ogni fetch: chi non legge non apre il thread dal link di una notifica.
    const canRead = permissions != null && canDoOnTenant(permissions, "support.read");
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "support.write") : false;

    /**
     * `silent` = ricarica di background (poll o ritorno in focus). Un errore
     * di rete in quel contesto NON deve far comparire "questa richiesta non
     * esiste": la conversazione è ancora lì, è la connessione ad aver fatto
     * un buco. Solo il caricamento iniziale può concludere che il ticket non
     * è accessibile.
     */
    const loadThread = useCallback(
        async ({ silent = false }: { silent?: boolean } = {}) => {
            if (!ticketId || !canRead) return;
            try {
                const [ticketRow, messageRows] = await Promise.all([
                    getTicket(ticketId),
                    listMessages(ticketId)
                ]);
                // Aggiornamenti condizionali: se il poll non porta nulla di
                // nuovo si restituisce lo stesso riferimento e React salta il
                // render. Senza, ogni 15 secondi il thread si ridisegnerebbe
                // identico, perdendo per giunta la selezione del testo.
                setMessages(prev => (sameMessageList(prev, messageRows) ? prev : messageRows));
                setTicket(prev => (sameTicketView(prev, ticketRow) ? prev : ticketRow));
            } catch {
                // "inesistente" e "non tuo" sono indistinguibili per
                // costruzione: RLS li rende tali di proposito, e la UI non deve
                // provare a distinguerli.
                if (!silent) setNotFound(true);
            } finally {
                if (!silent) setIsLoading(false);
            }
        },
        [ticketId, canRead]
    );

    useEffect(() => {
        if (!canRead) return;
        setIsLoading(true);
        setNotFound(false);
        void loadThread();
    }, [loadThread, canRead]);

    // Ricarica di background. Sospesa durante l'invio: un poll che atterrasse
    // a metà sovrascriverebbe lo stato mentre la scrittura è in volo.
    const refreshInBackground = useCallback(() => {
        void loadThread({ silent: true });
    }, [loadThread]);
    usePollingRefresh(refreshInBackground, { enabled: canRead && !isSending && !notFound });

    // Nomi dei membri e nome della sede: secondari rispetto al thread, quindi
    // non bloccano la prima pittura. `getTenantMemberNames` è già anti-crash
    // (Map vuota su errore) e il fallback del componente copre il resto.
    useEffect(() => {
        if (!tenantId || !canRead) return;
        let cancelled = false;
        void getTenantMemberNames(tenantId).then(names => {
            if (!cancelled) setMemberNames(names);
        });
        return () => {
            cancelled = true;
        };
    }, [tenantId, canRead]);

    // Marca letto all'apertura, una sola volta per ticket. `useRef` e non una
    // dipendenza dell'effetto: `markTicketRead` sposta customer_last_read_at,
    // quindi rieseguirlo a ogni render sarebbe una scrittura per render.
    const markedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!ticketId || !canRead || notFound || markedRef.current === ticketId) return;
        markedRef.current = ticketId;
        void markTicketRead(ticketId)
            .then(() => refreshSupportUnread?.())
            .catch(() => {
                /* il pallino non è un dato critico: un fallimento qui non
                   merita di disturbare chi sta leggendo la conversazione */
            });
    }, [ticketId, canRead, notFound, refreshSupportUnread]);

    const threadMessages = useMemo<SupportThreadMessage[]>(
        () =>
            messages.map(m => ({
                id: m.id,
                body: m.body,
                createdAt: m.created_at,
                authorKind: m.author_kind,
                authorUserId: m.author_user_id,
                // Risolto qui, non nel componente: la mappa dei nomi è un
                // fatto della pagina. Per gli autori `platform` il valore è
                // ignorato — il componente mostra l'etichetta neutra.
                authorName: m.author_user_id
                    ? memberNames.get(m.author_user_id) ?? null
                    : null
            })),
        [messages, memberNames]
    );

    // MEMOIZZATO, e non è un vezzo: `usePageHeader` confronta `actions` PER
    // REFERENCE; un nodo JSX inline è nuovo a ogni render e l'header si
    // riscriverebbe all'infinito ("Maximum update depth exceeded").
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

    // Qui lo stato non si cambia, si legge: resta un'indicazione, non diventa un
    // controllo che sulla pagina non esiste. Stesso trattamento del "Salvato ✓".
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        backAction: { label: "Assistenza", onClick: () => navigate("..") },
        statusIndicator: ticket
            ? { label: SUPPORT_STATUS_LABEL[ticket.status] }
            : undefined
    }), [navigate, ticket]);

    usePageHeader({ actions: headerActions, compact: headerCompact });

    // L'oggetto della richiesta nella briciola (come Stili, Storie, In
    // evidenza): prima stava in un `title` che lo slot non rende, e la pagina
    // non diceva mai di quale richiesta si trattasse.
    const breadcrumbItems = useMemo(
        () => [
            { label: "Assistenza", to: `/business/${tenantId}/support` },
            { label: isLoading ? "Caricamento..." : ticket?.subject ?? "Richiesta" }
        ],
        [tenantId, isLoading, ticket?.subject]
    );
    useBreadcrumbItems(breadcrumbItems);

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
            await loadThread({ silent: true });
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

    if (permissions != null && !canRead) {
        return <PageGate readPermission="support.read" scope="tenant">{() => null}</PageGate>;
    }

    if (isLoading || permissions == null) {
        return (
            <div className={styles.page} aria-busy="true" aria-label="Caricamento richiesta">
                <Skeleton height="16px" width="40%" />
                <Skeleton height="96px" />
                <Skeleton height="96px" />
            </div>
        );
    }

    if (notFound || !ticket) {
        // «Inesistente» e «non tua» sono indistinguibili per RLS, di proposito.
        return (
            <EmptyState
                variant="page"
                icon={<LifeBuoy />}
                title="Richiesta non trovata"
                description="Questa richiesta non esiste o non è più accessibile."
                action={
                    <Button variant="secondary" onClick={() => navigate("..")}>
                        Torna alle richieste
                    </Button>
                }
            />
        );
    }

    const mailLink = (
        <a href={`mailto:${COMPANY.contact.support}`}>{COMPANY.contact.support}</a>
    );

    return (
        <div className={styles.page}>
            {/* Data e sede stavano in un `subtitle` che lo slot non rende (S2).
                Il nome della sede arriva dall'embed di `getTicket`: nessuna
                seconda richiesta delle sedi. */}
            <Text as="p" variant="caption" colorVariant="muted">
                {[`Aperta il ${formatDateTimeIt(ticket.created_at)}`, ticket.activities?.name]
                    .filter(Boolean)
                    .join(" · ")}
            </Text>

            {/* Il thread è il figlio flex che scorre: il contratto richiesto da
                SupportThread è `flex:1 1 auto; min-height:0` sul PADRE, ed è
                `.page` a fornirlo. */}
            {/* viewerSide="customer": chi guarda da qui è l'azienda, quindi i
                suoi messaggi vanno a destra anche se scritti da un collega.
                `currentUserId` marca "· tu" fra i nomi dei colleghi. */}
            <SupportThread
                messages={threadMessages}
                viewerSide="customer"
                currentUserId={user?.id ?? null}
            />

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
                    <InlineBanner variant="info" icon={<Mail size={16} aria-hidden />}>
                        Per rispondere scrivi a {mailLink}.
                    </InlineBanner>
                )}
            </div>
        </div>
    );
}
