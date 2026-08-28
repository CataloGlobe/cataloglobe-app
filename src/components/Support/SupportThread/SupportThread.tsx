import { useCallback, useLayoutEffect, useRef } from "react";
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
 * ── Bolle allineate per PARTE, non per persona ──────────────────────────────
 * "Destra = io" non funzionerebbe: il thread è letto da più persone della
 * stessa azienda, e chi ha aperto il ticket spesso non è chi lo sta leggendo.
 * Destra = LA MIA PARTE invece è definito per ogni lettore — lato cliente
 * tutti i messaggi dell'azienda stanno a destra anche se scritti da un
 * collega, lato piattaforma tutti quelli del supporto.
 *
 * Il layout è quindi specchiato fra i due lati, ed è voluto: ciascuna parte
 * vede sé stessa a destra. Da qui la prop `viewerSide`, che è l'unico dato di
 * contesto che il componente riceve.
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
 *  persona, e i dati del nostro staff non vanno esposti ai clienti.
 *
 *  "Supporto" e basta, senza il badge "CataloGlobe" che stava qui accanto: era
 *  la stessa informazione due volte di fila.
 *
 *  Da quando il tono segue il lato e non l'autore, questo nome è l'UNICO
 *  segnale che dice da dove arriva il messaggio senza dipendere né dal colore
 *  né dalla posizione — cioè l'unico che regge per chi non li percepisce.
 *  Non accorciarlo oltre. */
const PLATFORM_AUTHOR_LABEL = "Supporto";

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
     * Serve solo a marcare "· tu" confrontandolo con `currentUserId`. `null`
     * quando l'account è stato cancellato (FK ON DELETE SET NULL).
     */
    authorUserId: string | null;
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
    /**
     * Da quale parte guarda chi legge. I messaggi di questa parte vanno a
     * destra, gli altri a sinistra. È l'organizzazione, non la persona.
     */
    viewerSide: SupportAuthorKind;
    /**
     * Utente corrente, per marcare "· tu" sui propri messaggi fra quelli dei
     * colleghi. Ha senso solo lato cliente, dove i nomi sono reali: lato
     * piattaforma gli autori `customer` sono tutti "Cliente" e il marcatore
     * non distinguerebbe nulla, quindi quella pagina non lo passa.
     */
    currentUserId?: string | null;
    isLoading?: boolean;
    emptyMessage?: string;
}

function resolveAuthorName(message: SupportThreadMessage): string {
    if (message.authorKind === "platform") return PLATFORM_AUTHOR_LABEL;
    return message.authorName?.trim() || UNKNOWN_AUTHOR_LABEL;
}

/**
 * Distanza dal fondo entro cui si considera che l'utente stia "seguendo" la
 * conversazione. Sotto questa soglia un messaggio nuovo fa scorrere; sopra, si
 * presume che stia leggendo più su e non lo si strappa via.
 */
const NEAR_BOTTOM_PX = 100;

function prefersReducedMotion(): boolean {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Il marcatore vale solo sui messaggi `customer`: identifica te fra i tuoi
 * colleghi. Su un messaggio della piattaforma non aggiungerebbe nulla — lì il
 * nome è "Supporto" per tutti, e un "tu" rivelerebbe soltanto che chi guarda è
 * l'operatore che l'ha scritto.
 */
function isOwnMessage(
    message: SupportThreadMessage,
    currentUserId: string | null | undefined
): boolean {
    if (!currentUserId || message.authorKind === "platform") return false;
    return message.authorUserId === currentUserId;
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
    viewerSide,
    currentUserId,
    isLoading = false,
    emptyMessage = "Nessun messaggio in questa richiesta."
}: SupportThreadProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Aggiornato a ogni scroll invece di essere letto quando serve: dopo che
    // React ha inserito il messaggio nuovo la posizione è GIÀ cambiata, e
    // misurarla lì direbbe dove si trova ora, non dove si trovava prima.
    const nearBottomRef = useRef(true);
    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        nearBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    }, []);

    // Id dell'ultimo messaggio visto. È il confronto che distingue "è arrivato
    // qualcosa" da "il poll ha ricreato l'array identico": senza, ogni giro di
    // polling riporterebbe in fondo chi sta leggendo più su.
    const lastMessageIdRef = useRef<string | null>(null);

    // `useLayoutEffect` e non `useEffect`: al primo caricamento la posizione va
    // fissata PRIMA che il browser dipinga, altrimenti si vede il thread
    // partire dall'alto e scattare in fondo.
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const lastId = messages.length ? messages[messages.length - 1].id : null;
        if (lastId === lastMessageIdRef.current) return;

        const isFirstPaint = lastMessageIdRef.current === null;
        lastMessageIdRef.current = lastId;

        // Messaggio nuovo mentre si legge più su: lo si lascia dov'è. Il
        // messaggio resta comunque in lista, solo non si va a prenderlo.
        if (!isFirstPaint && !nearBottomRef.current) return;

        el.scrollTo({
            top: el.scrollHeight,
            // Istantaneo alla prima pittura: deve sembrare che il thread fosse
            // già lì. Animato dopo, perché lì lo scorrimento È l'informazione
            // ("è arrivato qualcosa in fondo").
            behavior: isFirstPaint || prefersReducedMotion() ? "auto" : "smooth"
        });
    }, [messages]);

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
        <div className={styles.thread} ref={scrollRef} onScroll={handleScroll}>
            <ol className={styles.list}>
                {messages.map(message => (
                    <li
                        key={message.id}
                        className={styles.message}
                        // `data-side` governa posizione E colore (variante in
                        // prova, vedi lo SCSS). `data-author` non è più usato
                        // dagli stili ma resta esposto: è l'aggancio con cui si
                        // torna a legare il tono all'autore, ed è il dato vero
                        // sulla riga — il lato è solo il punto di vista di chi
                        // guarda.
                        data-side={message.authorKind === viewerSide ? "own" : "other"}
                        data-author={message.authorKind}
                    >
                        {/* Nome e orario sulla STESSA riga, separati da un punto
                            mediano: è la forma già usata nel repo per i metadati
                            in linea (StatusPage, coda supporto). */}
                        <div className={styles.header}>
                            <span className={styles.author}>
                                {resolveAuthorName(message)}
                            </span>
                            {message.authorKind !== "platform" && message.authorRole && (
                                <span className={styles.role}>{message.authorRole}</span>
                            )}
                            {isOwnMessage(message, currentUserId) && (
                                <span className={styles.you}>tu</span>
                            )}
                            <time className={styles.time} dateTime={message.createdAt}>
                                {formatDateTimeIt(message.createdAt)}
                            </time>
                        </div>
                        {/* Testo, non markup. Vedi nota in testa al file. */}
                        <p className={styles.body}>{message.body}</p>
                    </li>
                ))}
            </ol>
        </div>
    );
}
