// ESC/POS — builder puro per la comanda stampata su Sunmi cloud printer.
//
// Nessuna dipendenza da DB, Deno.env o rete: prende un `ComandaPayload` gia'
// risolto (vedi buildComanda.ts) e produce la stringa esadecimale che Sunmi
// pushContent si aspetta nel campo `content`.
//
// Layout: replica FEDELE di src/pages/Dashboard/Orders/PrintReceipt.tsx
// (scontrino browser 72mm gia' validato in produzione). Stesso contenuto,
// stesso ordine: COMANDA / TAVOLO {label} · {zona} / data-ora it-IT /
// Operatore o Cliente / [RETTIFICA] / divider / righe `{qty}x {nome}` +
// opzione primaria + addon `+` + note riga `•` / divider / Note ordine /
// `#{id.slice(0,8).toUpperCase()}`.
//
// ⚠️ Due grandezze diverse, non confonderle:
//   * WRAPPING = conteggio in CARATTERI (code point). "è" = 1 colonna.
//   * SERIALIZZAZIONE = BYTE UTF-8. "è" = 2 byte → "c3a8" in hex.
//   `wrapText` lavora sui caratteri, `EscPosBuilder` sui byte.
//
// LINE_WIDTH = 48 assume font A (12x24 dot) su carta 80mm (576 dot). Da
// confermare con stampa di prova: se la stampante e' 58mm o usa font B, cambia
// SOLO questa costante.

export const LINE_WIDTH = 48;

/** Larghezza effettiva quando il testo e' in doppia larghezza. */
export const LINE_WIDTH_DOUBLE = Math.floor(LINE_WIDTH / 2);

/** Indent delle righe di dettaglio (opzione/addon/note) sotto `{qty}x `. */
const DETAIL_INDENT = 3;

// ============================================================
// Opcode ESC/POS
// ============================================================

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// ============================================================
// Payload
// ============================================================

export interface ComandaItem {
    quantity: number;
    product_name: string;
    primary_option: string | null;
    addons: string[];
    item_notes: string | null;
}

export interface ComandaPayload {
    order_id: string;
    /** ISO 8601 (orders.submitted_at). */
    submitted_at: string;
    table_label: string;
    table_zone: string | null;
    /** Nome operatore se ordine inserito dallo staff, altrimenti null. */
    operator_label: string | null;
    /** customer_name_snapshot (stampato SOLO se operator_label e' null). */
    customer_name: string | null;
    is_rectification: boolean;
    notes: string | null;
    items: ComandaItem[];
}

// ============================================================
// Wrapping (caratteri)
// ============================================================

export interface WrapOptions {
    /** Spazi anteposti a ogni riga DOPO la prima. */
    hangingIndent?: number;
}

function _charLen(s: string): number {
    return Array.from(s).length;
}

function _sliceChars(s: string, start: number, end?: number): string {
    return Array.from(s).slice(start, end).join("");
}

/**
 * Spezza `text` in righe di al piu' `width` CARATTERI (non byte).
 * Preferisce gli spazi; una parola piu' lunga della riga viene tagliata.
 * `\n` nel testo forza sempre un a-capo.
 */
export function wrapText(text: string, width: number, options: WrapOptions = {}): string[] {
    const indent = " ".repeat(Math.max(0, options.hangingIndent ?? 0));
    const out: string[] = [];

    const paragraphs = text.split("\n");
    for (const paragraph of paragraphs) {
        const words = paragraph.split(" ").filter(w => w.length > 0);
        if (words.length === 0) {
            out.push(out.length === 0 ? "" : indent);
            continue;
        }

        let current = "";
        const flush = () => {
            out.push(out.length === 0 ? current : indent + current);
            current = "";
        };
        const avail = () => (out.length === 0 ? width : width - _charLen(indent));

        for (const word of words) {
            let w = word;
            // Parola piu' lunga della riga disponibile: taglio duro.
            while (_charLen(w) > avail()) {
                if (current.length > 0) flush();
                const take = avail();
                out.push(out.length === 0 ? _sliceChars(w, 0, take) : indent + _sliceChars(w, 0, take));
                w = _sliceChars(w, take);
            }
            if (w.length === 0) continue;

            const candidate = current.length === 0 ? w : `${current} ${w}`;
            if (_charLen(candidate) <= avail()) {
                current = candidate;
            } else {
                flush();
                current = w;
            }
        }
        if (current.length > 0) flush();
    }

    return out.length === 0 ? [""] : out;
}

// ============================================================
// Serializzazione (byte)
// ============================================================

export function bytesToHex(bytes: Uint8Array): string {
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
}

/**
 * Rimuove ogni carattere di controllo (C0 incluso \n, DEL, C1): i comandi
 * ESC/POS li emette SOLO il builder. I \n legittimi vengono gia' trasformati
 * in righe da wrapText prima di arrivare a `text()`; `line()` emette LF da se'.
 * Loop sui code point (niente regex: eslint no-control-regex).
 */
export function stripControlChars(s: string): string {
    let out = "";
    for (const ch of s) {
        const c = ch.codePointAt(0) ?? 0;
        if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) continue;
        out += ch;
    }
    return out;
}

export type EscPosAlign = "left" | "center" | "right";

const ALIGN_CODE: Record<EscPosAlign, number> = { left: 0, center: 1, right: 2 };

/**
 * Accumula byte ESC/POS. Ogni metodo ritorna `this` per il chaining.
 * Il testo e' codificato UTF-8: la stampante deve essere configurata (o
 * auto-rilevare) UTF-8; se stampa accenti sbagliati, il punto da verificare
 * e' la code page del dispositivo, non il conteggio del wrapping.
 */
export class EscPosBuilder {
    private readonly _chunks: Uint8Array[] = [];
    private readonly _enc = new TextEncoder();

    private _push(...bytes: number[]): this {
        this._chunks.push(Uint8Array.from(bytes));
        return this;
    }

    /** ESC @ — reset stampante. */
    init(): this {
        return this._push(ESC, 0x40);
    }

    /** ESC a n — allineamento. */
    align(a: EscPosAlign): this {
        return this._push(ESC, 0x61, ALIGN_CODE[a]);
    }

    /** GS ! n — doppia larghezza + doppia altezza (0x11) o normale (0x00). */
    doubleSize(on: boolean): this {
        return this._push(GS, 0x21, on ? 0x11 : 0x00);
    }

    /** ESC E n — grassetto. */
    bold(on: boolean): this {
        return this._push(ESC, 0x45, on ? 0x01 : 0x00);
    }

    /**
     * Testo grezzo (UTF-8) senza a-capo.
     * ⚠️ Unico choke-point anti-injection: il testo arriva da campi scritti dal
     * cliente anonimo (customer_name, notes, item_notes) e dal tenant
     * (product_name). Qualsiasi byte di controllo (ESC, GS, FS, DLE, ...)
     * verrebbe ESEGUITO dalla stampante (apertura cassetto, taglio, QR
     * arbitrari, riconfigurazione). Vengono rimossi qui, sempre.
     */
    text(s: string): this {
        this._chunks.push(this._enc.encode(stripControlChars(s)));
        return this;
    }

    /** Testo + LF. */
    line(s: string): this {
        this.text(s);
        return this._push(LF);
    }

    /** Solo LF. */
    newline(): this {
        return this._push(LF);
    }

    /** ESC d n — avanza n righe. */
    feed(n: number): this {
        return this._push(ESC, 0x64, Math.max(0, Math.min(255, n)));
    }

    /** GS V 1 — taglio parziale. */
    cut(): this {
        return this._push(GS, 0x56, 0x01);
    }

    toBytes(): Uint8Array {
        const total = this._chunks.reduce((n, c) => n + c.length, 0);
        const out = new Uint8Array(total);
        let offset = 0;
        for (const c of this._chunks) {
            out.set(c, offset);
            offset += c.length;
        }
        return out;
    }

    toHex(): string {
        return bytesToHex(this.toBytes());
    }
}

// ============================================================
// Data/ora — stesso formato di PrintReceipt (it-IT, 2-digit)
// ============================================================

const DATETIME_FORMATTER = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome"
});

/**
 * "07/09/2026, 21:15". PrintReceipt usa il fuso del browser; qui il server e'
 * in UTC quindi fissiamo Europe/Rome (stesso TODO multi-region di
 * get_operative_day_start).
 */
export function formatComandaDateTime(iso: string): string {
    return DATETIME_FORMATTER.format(new Date(iso));
}

// ============================================================
// Render comanda
// ============================================================

function _writeWrapped(b: EscPosBuilder, text: string, width: number, indent = 0): void {
    for (const l of wrapText(text, width, { hangingIndent: indent })) b.line(l);
}

/** Riga di dettaglio: OGNI riga (anche la prima) indentata di DETAIL_INDENT. */
function _writeDetail(b: EscPosBuilder, text: string): void {
    const indent = " ".repeat(DETAIL_INDENT);
    for (const l of wrapText(text, LINE_WIDTH - DETAIL_INDENT)) b.line(indent + l);
}

/**
 * ComandaPayload → hex ESC/POS. Vedi header del file per la corrispondenza
 * 1:1 con PrintReceipt.tsx.
 */
export function renderComandaEscPos(payload: ComandaPayload): string {
    const b = new EscPosBuilder();
    b.init();

    // ── Titolo: .prTitle (18px bold center) → doppia dimensione + bold.
    b.align("center").doubleSize(true).bold(true);
    _writeWrapped(b, "COMANDA", LINE_WIDTH_DOUBLE);
    b.doubleSize(false);

    // ── Tavolo: .prTable (15px bold center) → bold, dimensione normale.
    const tableLine = payload.table_zone
        ? `TAVOLO ${payload.table_label} · ${payload.table_zone}`
        : `TAVOLO ${payload.table_label}`;
    _writeWrapped(b, tableLine, LINE_WIDTH);
    b.bold(false);

    // ── Meta: .prMeta (data-ora, Operatore | Cliente) → left, normale.
    b.align("left");
    b.line(formatComandaDateTime(payload.submitted_at));
    if (payload.operator_label) {
        _writeWrapped(b, `Operatore: ${payload.operator_label}`, LINE_WIDTH);
    } else if (payload.customer_name) {
        _writeWrapped(b, `Cliente: ${payload.customer_name}`, LINE_WIDTH);
    }

    // ── Banner rettifica: .prRectification (bold center).
    if (payload.is_rectification) {
        b.align("center").bold(true).line("*** RETTIFICA ***").bold(false).align("left");
    }

    // ── Divider: .prDivider (dashed).
    const divider = "-".repeat(LINE_WIDTH);
    b.line(divider);

    // ── Righe: .prItem — `{qty}x {nome}` bold, dettagli indentati.
    payload.items.forEach((item, idx) => {
        if (idx > 0) b.newline(); // gap 8px tra item
        b.bold(true);
        _writeWrapped(b, `${item.quantity}x ${item.product_name}`, LINE_WIDTH, DETAIL_INDENT);
        b.bold(false);
        if (item.primary_option) _writeDetail(b, item.primary_option);
        for (const addon of item.addons) _writeDetail(b, `+ ${addon}`);
        if (item.item_notes) _writeDetail(b, `• ${item.item_notes}`);
    });

    b.line(divider);

    // ── Note ordine: .prOrderNotes (pre-wrap → i \n sono rispettati da wrapText).
    if (payload.notes) {
        _writeWrapped(b, `Note: ${payload.notes}`, LINE_WIDTH);
    }

    // ── Footer: .prFooter (right) → `#ABCD1234`.
    b.align("right").line(`#${payload.order_id.slice(0, 8).toUpperCase()}`).align("left");

    b.feed(4).cut();
    return b.toHex();
}

/**
 * ComandaPayload → hex ESC/POS per il ticket di annullamento (blocco 3a).
 * Foglio corto, deliberatamente diverso dalla comanda: titolo "ANNULLATO"
 * (stesso trattamento tipografico del titolo comanda, testo diverso — chi lo
 * vede sul rullo deve riconoscerlo in mezzo secondo), niente meta
 * operatore/cliente, niente opzioni/addon/note riga (il cuoco deve solo
 * sapere COSA fermare, non i dettagli di preparazione). Stampato SOLO dallo
 * sweeper (mai inline), vedi _shared/printJobs.ts.
 */
export function renderAnnulloEscPos(payload: ComandaPayload): string {
    const b = new EscPosBuilder();
    b.init();

    // ── Titolo: stesso trattamento del titolo comanda (doppia dim. + bold).
    b.align("center").doubleSize(true).bold(true);
    _writeWrapped(b, "ANNULLATO", LINE_WIDTH_DOUBLE);
    b.doubleSize(false);

    // ── Tavolo: identico alla comanda, per riconoscere subito il tavolo.
    const tableLine = payload.table_zone
        ? `TAVOLO ${payload.table_label} · ${payload.table_zone}`
        : `TAVOLO ${payload.table_label}`;
    _writeWrapped(b, tableLine, LINE_WIDTH);
    b.bold(false);

    // ── Meta: solo data-ora (niente operatore/cliente — non serve al cuoco).
    b.align("left");
    b.line(formatComandaDateTime(payload.submitted_at));

    const divider = "-".repeat(LINE_WIDTH);
    b.line(divider);

    // ── Righe: forma compatta `{qty}x {nome}`, niente opzioni/addon/note.
    for (const item of payload.items) {
        b.bold(true);
        _writeWrapped(b, `${item.quantity}x ${item.product_name}`, LINE_WIDTH, DETAIL_INDENT);
        b.bold(false);
    }

    b.line(divider);

    // ── Footer: stesso id troncato della comanda, per riconciliazione.
    b.align("right").line(`#${payload.order_id.slice(0, 8).toUpperCase()}`).align("left");

    b.feed(4).cut();
    return b.toHex();
}
