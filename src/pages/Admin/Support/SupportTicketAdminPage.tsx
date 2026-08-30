import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { LoadingState } from "@/components/ui/LoadingState/LoadingState";
import { Select } from "@/components/ui/Select/Select";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import {
    SupportThread,
    type SupportThreadMessage
} from "@/components/Support/SupportThread/SupportThread";
import { useAdminOutletContext } from "@/layouts/AdminLayout/outletContext";
import { usePageHeader } from "@/context/usePageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { usePollingRefresh } from "@/hooks/usePollingRefresh";
import {
    getTicket,
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
import { SUPPORT_STATUS_LABEL } from "@/pages/Dashboard/Support/supportLabels";
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
 */

export default function SupportTicketAdminPage() {
    const { ticketId = "" } = useParams<{ ticketId: string }>();
    const navigate = useNavigate();
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
                // Chiudere o riaprire una richiesta la toglie o la rimette
                // nella coda di chi aspetta: il pallino in sidebar va rivalutato.
                refreshSupportPending?.();
            } catch {
                setActionError("Non è stato possibile cambiare lo stato.");
            } finally {
                setIsChangingStatus(false);
            }
        },
        [ticket, ticketId, loadThread, refreshSupportPending]
    );

    const handleSend = useCallback(async () => {
        const body = draft.trim();
        if (!body || isSending) return;
        setIsSending(true);
        setActionError(null);
        try {
            await postPlatformMessage(ticketId, body);
            setDraft("");
            // Ricarica: il trigger aggiorna `last_message_kind` e
            // `last_message_at` sul ticket, che l'header e la coda leggono.
            await loadThread({ silent: true });
            // Rispondere sposta `last_message_kind` a 'platform': questa
            // richiesta non aspetta più, e il pallino in sidebar si spegne se
            // era l'ultima.
            refreshSupportPending?.();
        } catch {
            setActionError("Non è stato possibile inviare il messaggio.");
        } finally {
            setIsSending(false);
        }
    }, [draft, isSending, ticketId, loadThread, refreshSupportPending]);

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
                onClick={() => navigate("..")}
                leftIcon={<ArrowLeft size={16} />}
            >
                Supporto
            </Button>
        ),
        [navigate]
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

    usePageHeader({
        title: ticket?.subject ?? "Richiesta",
        subtitle,
        leading,
        actions: headerActions
    });

    if (isLoading) {
        return <LoadingState message="Caricamento richiesta…" />;
    }

    if (notFound || !ticket) {
        return (
            <div className={styles.page}>
                <p className={styles.notFound}>Questa richiesta non esiste.</p>
                <Button variant="secondary" onClick={() => navigate("..")}>
                    Torna alla coda
                </Button>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            {/* viewerSide="platform": da qui le risposte del supporto stanno
                a destra. Nessun `currentUserId`: gli autori customer sono tutti
                "Cliente", quindi un "· tu" non distinguerebbe nulla. */}
            <SupportThread messages={threadMessages} viewerSide="platform" />

            <div className={styles.composer}>
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
                    <Button
                        variant="primary"
                        onClick={handleSend}
                        loading={isSending}
                        disabled={!draft.trim()}
                    >
                        Invia risposta
                    </Button>
                </div>
            </div>
        </div>
    );
}
