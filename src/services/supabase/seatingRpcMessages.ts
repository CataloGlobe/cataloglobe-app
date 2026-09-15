/**
 * I messaggi delle RPC del ciclo tavolata che NON devono arrivare grezzi a
 * un toast, tradotti in italiano. Pure, senza Supabase: si testano.
 *
 * È l'unico posto in cui si legge un numero da dentro un messaggio
 * (`OPEN_ORDERS_NEED_ACTION:<n>`). Isolato apposta: il giorno che il
 * formato cambia si rompe un test, non una schermata.
 *
 * Chi genera i codici: `close_seating` (20260915130700) e
 * `_close_order_group_unchecked` (20260915130300) per OPEN_ORDERS_NEED_ACTION,
 * `undo_seating` (20260915131300) per SEATING_HAS_BILLS, il trigger
 * `enforce_order_group_verification` (20260703101000) per GROUP_NOT_VERIFIED.
 */

const OPEN_ORDERS_PREFIX = "OPEN_ORDERS_NEED_ACTION:";

/**
 * Il conteggio da `OPEN_ORDERS_NEED_ACTION:<n>`. `null` se il messaggio non
 * è quello o il numero non torna: chi chiama degrada in una frase senza
 * numero, mai in `NaN`.
 */
export function parseOpenOrdersNeedAction(message: string | undefined | null): number | null {
    if (!message || !message.startsWith(OPEN_ORDERS_PREFIX)) return null;
    const raw = message.slice(OPEN_ORDERS_PREFIX.length).trim();
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function isOpenOrdersNeedAction(message: string | undefined | null): boolean {
    return !!message && message.startsWith(OPEN_ORDERS_PREFIX);
}

/**
 * Rete di sicurezza: la schermata sa PRIMA se ci sono ordini in sospeso e fa
 * la domanda. Se questo messaggio arriva lo stesso, o due operatori si sono
 * incrociati (uno ordina mentre l'altro chiude) o chi guarda ha
 * `seatings.read` senza `orders.read` — e allora la domanda non comparirà
 * MAI: per questo non si dice "riprova" (un giro chiuso) ma dove si chiude
 * davvero, dalle comande.
 */
export function openOrdersNeedActionMessage(count: number | null): string {
    const head =
        count === null
            ? "Ci sono ordini ancora aperti su questa tavolata"
            : count === 1
              ? "C'è un ordine ancora aperto su questa tavolata"
              : `Ci sono ${count} ordini ancora aperti su questa tavolata`;
    return `${head}: ${count === 1 ? "va chiuso" : "vanno chiusi"} dalle comande prima di concludere il servizio.`;
}

export const SEATING_HAS_BILLS_MESSAGE =
    "Questa tavolata ha degli ordini collegati: annullandola resterebbero senza nessuno a cui attribuirli. Se il servizio è finito, usa Servizio concluso.";

export const GROUP_NOT_VERIFIED_MESSAGE =
    "Questi ordini non sono mai stati confermati dal locale, quindi non si possono segnare come serviti. Puoi segnarli come annullati, oppure confermarli prima dalle comande.";

/**
 * Traduce un messaggio del server quando è uno dei codici noti; altrimenti
 * lo restituisce com'è (le RPC usano 22023 per dire cose diverse fra loro, e
 * il testo del server è l'unica informazione utile).
 */
export function translateSeatingRpcMessage(message: string | undefined | null): string | null {
    if (!message) return null;
    if (isOpenOrdersNeedAction(message)) {
        return openOrdersNeedActionMessage(parseOpenOrdersNeedAction(message));
    }
    if (message.startsWith("SEATING_HAS_BILLS")) return SEATING_HAS_BILLS_MESSAGE;
    if (message.startsWith("GROUP_NOT_VERIFIED")) return GROUP_NOT_VERIFIED_MESSAGE;
    return message;
}
