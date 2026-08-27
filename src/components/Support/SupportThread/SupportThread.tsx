import { MessagesSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState/LoadingState";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import type { SupportAuthorKind } from "@/types/support";
import styles from "./SupportThread.module.scss";

/**
 * Thread di una richiesta di supporto. Presentazionale puro: nessuna chiamata
 * a Supabase, nessuno stato interno. Il fetch e la risoluzione dei nomi stanno
 * nelle pagine, perché differiscono fra i due lati.
 *
 * ── Perché lista e non bolle contrapposte ───────────────────────────────────
 * Il thread è letto da PIÙ persone della stessa azienda, quindi "destra = io"
 * non ha un referente: chi ha aperto il ticket e chi lo sta leggendo spesso
 * non sono la stessa persona. In più i messaggi del supporto sono lunghi, e
 * una bolla stretta li impagina peggio di un blocco a larghezza piena.
 *
 * ── Un componente, due lati ─────────────────────────────────────────────────
 * Lo usano `/business/:businessId/*` (cliente) e `/admin/supporto`
 * (piattaforma) con lo stesso aspetto. Il composer NON è qui: le azioni dei
 * due lati sono diverse e lo montano le pagine.
 *
 * ── Corpi dei messaggi ──────────────────────────────────────────────────────
 * Sono testo scritto dagli utenti e restano testo: niente iniezione di HTML
 * grezzo, niente markdown, nessun parser. React li escapa, e
 * `white-space: pre-wrap` preserva i ritorni a capo. Un thread di supporto
 * contiene spesso messaggi d'errore e frammenti incollati: interpretarli come
 * markup sarebbe insieme un vettore XSS e una deformazione del contenuto.
 */

/** Mai un nome proprio per il lato piattaforma: risponde l'azienda, non la
 *  persona, e i dati del nostro staff non vanno esposti ai clienti. */
const PLATFORM_AUTHOR_LABEL = "Supporto CataloGlobe";

/** Autore non risolvibile: `author_user_id` è NULL perché l'account è stato
 *  cancellato (FK ON DELETE SET NULL). */
const UNKNOWN_AUTHOR_LABEL = "Utente rimosso";

export interface SupportThreadMessage {
    id: string;
    body: string;
    /** ISO 8601. */
    createdAt: string;
    authorKind: SupportAuthorKind;
    /**
     * Nome già risolto dalla pagina. `null` → {@link UNKNOWN_AUTHOR_LABEL}.
     * Ignorato quando `authorKind === "platform"`.
     *
     * Il lato piattaforma non può risolvere i nomi dei clienti
     * (`get_tenant_member_names` è gated su `get_my_tenant_ids()` e un platform
     * admin non è membro del tenant) e passa la stringa "Cliente": è un valore
     * legittimo, non un fallback. Da qui la scelta di riservare `null` al solo
     * caso "account cancellato".
     */
    authorName: string | null;
    /**
     * Ruolo del membro, opzionale. Non popolato nella v1: verrebbe da
     * `get_tenant_members`, che richiede `team.read` — permesso che manager ha
     * e staff no. Popolarlo solo per alcuni mostrerebbe la stessa
     * conversazione in modo diverso a due colleghi della stessa azienda.
     */
    authorRole?: string | null;
}

interface SupportThreadProps {
    /** In ordine cronologico ASC: un thread si legge dall'alto. */
    messages: SupportThreadMessage[];
    isLoading?: boolean;
    emptyMessage?: string;
}

function resolveAuthorName(message: SupportThreadMessage): string {
    if (message.authorKind === "platform") return PLATFORM_AUTHOR_LABEL;
    return message.authorName?.trim() || UNKNOWN_AUTHOR_LABEL;
}

/**
 * Il root è il contenitore di scroll (`flex:1 1 auto; min-height:0;
 * overflow-y:auto`). Perché funzioni, il PADRE deve essere un flex column con
 * altezza limitata — in un drawer è il body di `DrawerLayout` con
 * `bodyLayout="flex"`. Senza quel vincolo il thread cresce e a scorrere è la
 * pagina.
 */
export function SupportThread({
    messages,
    isLoading = false,
    emptyMessage = "Nessun messaggio in questa richiesta."
}: SupportThreadProps) {
    if (isLoading) {
        return (
            <div className={styles.thread}>
                <LoadingState message="Caricamento conversazione…" />
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <div className={styles.thread}>
                <EmptyState
                    icon={<MessagesSquare size={40} strokeWidth={1.5} />}
                    title="Conversazione vuota"
                    description={emptyMessage}
                />
            </div>
        );
    }

    return (
        <div className={styles.thread}>
            <ol className={styles.list}>
                {messages.map(message => {
                    const isPlatform = message.authorKind === "platform";
                    return (
                        <li
                            key={message.id}
                            className={styles.message}
                            data-author={message.authorKind}
                        >
                            <div className={styles.header}>
                                <span className={styles.author}>
                                    {resolveAuthorName(message)}
                                </span>
                                {isPlatform && (
                                    <span className={styles.badge}>CataloGlobe</span>
                                )}
                                {!isPlatform && message.authorRole && (
                                    <span className={styles.role}>{message.authorRole}</span>
                                )}
                                <time className={styles.time} dateTime={message.createdAt}>
                                    {formatDateTimeIt(message.createdAt)}
                                </time>
                            </div>
                            {/* Testo, non markup. Vedi nota in testa al file. */}
                            <p className={styles.body}>{message.body}</p>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
