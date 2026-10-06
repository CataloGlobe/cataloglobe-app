/**
 * Il nome di un canale realtime, unico per ogni montaggio.
 *
 * `supabase.channel(topic)` restituisce il canale già registrato con lo
 * stesso nome, e `removeChannel` è asincrono: un nome fatto con `Date.now()`
 * si ripete se due montaggi cadono nello stesso millisecondo (lo smontaggio
 * e rimontaggio di StrictMode, due viste che aprono lo stesso hook), e il
 * secondo riceve il canale che il primo sta chiudendo. Un contatore di
 * modulo non si ripete mai nella vita della pagina.
 */
let sequence = 0;

export function realtimeTopic(prefix: string): string {
    sequence += 1;
    return `${prefix}-${sequence}`;
}
