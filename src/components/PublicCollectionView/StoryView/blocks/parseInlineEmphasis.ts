/**
 * Parser inline ristretto per il blocco testo delle Storie (Strada A).
 * Riconosce SOLO grassetto (`**testo**`) e corsivo (`*testo*`), plain text.
 *
 * Regole (v1 — vedi FASE rich-text):
 * - Longest-match: `**` provato prima di `*`.
 * - Solo coppie chiuse convertono; marcatori spaiati restano testo letterale.
 * - Niente annidamento: dentro un'enfasi gli altri marcatori restano letterali.
 * - Newline dentro l'enfasi consentito (usa indexOf, non regex `.`).
 * - Input senza marcatori → un solo nodo `text` (no-op per le storie esistenti).
 * - Emette SOLO nodi (`text`/`strong`/`em`) con `value` grezzo: MAI HTML. È il
 *   render (React) a escapare il testo → nessun vettore di injection.
 *
 * ⚠️ SYNC: le regole di pairing sono duplicate nella regex di strip-excerpt in
 * `supabase/functions/resolve-public-story/index.ts` (l'edge Deno non può
 * importare questo modulo). Se cambiano qui, aggiornarle anche lì.
 */
export type InlineNode =
    | { type: "text"; value: string }
    | { type: "strong"; value: string }
    | { type: "em"; value: string };

export function parseInlineEmphasis(raw: string): InlineNode[] {
    const nodes: InlineNode[] = [];
    let buffer = "";

    const flush = () => {
        if (buffer.length > 0) {
            nodes.push({ type: "text", value: buffer });
            buffer = "";
        }
    };

    let i = 0;
    const n = raw.length;

    while (i < n) {
        // Grassetto: `**...**`. Provato per primo (longest-match) così `**x**`
        // non viene letto come due `*` vuoti.
        if (raw.startsWith("**", i)) {
            const close = raw.indexOf("**", i + 2);
            if (close !== -1) {
                flush();
                nodes.push({ type: "strong", value: raw.slice(i + 2, close) });
                i = close + 2;
                continue;
            }
            // Nessuna chiusura → marcatore letterale.
            buffer += "**";
            i += 2;
            continue;
        }

        // Corsivo: `*...*`. Raggiunto solo se NON è un `**` (già gestito sopra).
        if (raw[i] === "*") {
            const close = raw.indexOf("*", i + 1);
            if (close !== -1) {
                flush();
                nodes.push({ type: "em", value: raw.slice(i + 1, close) });
                i = close + 1;
                continue;
            }
            buffer += "*";
            i += 1;
            continue;
        }

        buffer += raw[i];
        i += 1;
    }

    flush();
    return nodes;
}
