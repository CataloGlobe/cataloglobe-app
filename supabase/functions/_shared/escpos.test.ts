import { describe, it, expect } from "vitest";
import {
    LINE_WIDTH,
    wrapText,
    EscPosBuilder,
    bytesToHex,
    stripControlChars,
    renderComandaEscPos,
    renderAnnulloEscPos,
    formatComandaDateTime,
    type ComandaPayload
} from "./escpos";

// ============================================================
// wrapText — conteggio per caratteri, non per byte
// ============================================================

describe("wrapText", () => {
    it("ritorna una sola riga se il testo entra nella larghezza", () => {
        expect(wrapText("Margherita", 48)).toEqual(["Margherita"]);
    });

    it("riga esattamente a 48 caratteri: nessun wrap", () => {
        const line = "a".repeat(48);
        expect(wrapText(line, LINE_WIDTH)).toEqual([line]);
    });

    it("riga a 49 caratteri: va a capo", () => {
        const line = "a".repeat(49);
        const out = wrapText(line, LINE_WIDTH);
        expect(out).toHaveLength(2);
        expect(out[0]).toHaveLength(48);
        expect(out[1]).toBe("a");
    });

    it("spezza sugli spazi quando possibile", () => {
        const out = wrapText("uno due tre quattro cinque", 10);
        expect(out).toEqual(["uno due", "tre", "quattro", "cinque"]);
    });

    it("gli accenti contano 1 carattere anche se sono 2 byte UTF-8", () => {
        // 48 x "è" = 48 caratteri, 96 byte. Deve restare UNA riga.
        const line = "è".repeat(48);
        expect(new TextEncoder().encode(line).length).toBe(96);
        expect(wrapText(line, LINE_WIDTH)).toEqual([line]);
    });

    it("testo accentato con spazi: wrap a 48 caratteri, non a 48 byte", () => {
        // "Caffè" ripetuto: ogni token 5 char / 6 byte.
        const words = Array.from({ length: 12 }, () => "Caffè"); // 12*5 + 11 spazi = 71 char
        const out = wrapText(words.join(" "), LINE_WIDTH);
        // Prime 8 parole = 8*5 + 7 = 47 char → riga 1; restanti 4 → riga 2.
        expect(out).toEqual([
            Array.from({ length: 8 }, () => "Caffè").join(" "),
            Array.from({ length: 4 }, () => "Caffè").join(" ")
        ]);
    });

    it("applica l'indent alle righe successive alla prima", () => {
        const out = wrapText("uno due tre quattro", 10, { hangingIndent: 3 });
        expect(out).toEqual(["uno due", "   tre", "   quattro"]);
    });

    it("stringa vuota → una riga vuota", () => {
        expect(wrapText("", 48)).toEqual([""]);
    });

    it("newline nel testo forza il wrap (note ordine multiriga)", () => {
        expect(wrapText("prima\nseconda", 48)).toEqual(["prima", "seconda"]);
    });
});

// ============================================================
// bytesToHex / EscPosBuilder — serializzazione sui byte UTF-8
// ============================================================

describe("bytesToHex", () => {
    it("serializza in esadecimale minuscolo, 2 cifre per byte", () => {
        expect(bytesToHex(new Uint8Array([0x1b, 0x40, 0x00, 0xff]))).toBe("1b4000ff");
    });
});

describe("stripControlChars / anti-injection", () => {
    it("rimuove ESC, GS, DLE, NUL, DEL e C1 lasciando il testo", () => {
        const evil = "Ma\u001bp\u0000\u0019\u00farco\u001dV\u0001\u0010\u007f\u0085!";
        expect(stripControlChars(evil)).toBe("MapúrcoV!");
    });

    it("EscPosBuilder.text non emette mai 1b/1d/10 da input utente", () => {
        const b = new EscPosBuilder();
        b.text("\u001b=\u0000\u001d(k\u0010\u0004\u0001A");
        expect(b.toHex()).toBe(bytesToHex(new TextEncoder().encode("=(kA")));
    });

    it("renderComandaEscPos: nome cliente/note ostili non introducono opcode extra", () => {
        const hex = renderComandaEscPos({
            ...BASE_PAYLOAD,
            customer_name: "X\u001bp\u0000\u0019\u00faY",
            notes: "cut\u001dV\u0001now",
            items: [{
                quantity: 1,
                product_name: "P\u001b@rod",
                primary_option: "\u001d(E",
                addons: ["\u0010\u0004B"],
                item_notes: "\u001b=\u0000"
            }]
        });
        const clean = renderComandaEscPos({
            ...BASE_PAYLOAD,
            customer_name: "XpúY",
            notes: "cutVnow",
            items: [{
                quantity: 1,
                product_name: "P@rod",
                primary_option: "(E",
                addons: ["B"],
                item_notes: "="
            }]
        });
        expect(hex).toBe(clean);
    });
});

describe("EscPosBuilder", () => {
    it("init emette ESC @", () => {
        const b = new EscPosBuilder();
        b.init();
        expect(b.toHex()).toBe("1b40");
    });

    it("text serializza i caratteri accentati come UTF-8 (2 byte) + LF", () => {
        const b = new EscPosBuilder();
        b.line("è");
        // "è" = c3 a8, poi LF 0a
        expect(b.toHex()).toBe("c3a80a");
    });

    it("comandi di allineamento, doppia dimensione e taglio hanno gli opcode attesi", () => {
        const b = new EscPosBuilder();
        b.align("center");
        b.doubleSize(true);
        b.doubleSize(false);
        b.bold(true);
        b.bold(false);
        b.feed(3);
        b.cut();
        expect(b.toHex()).toBe(
            "1b6101" + // ESC a 1
            "1d2111" + // GS ! 0x11 (double width + height)
            "1d2100" + // GS ! 0
            "1b4501" + // ESC E 1
            "1b4500" + // ESC E 0
            "1b6403" + // ESC d 3
            "1d5601"   // GS V 1 (partial cut)
        );
    });
});

// ============================================================
// formatComandaDateTime — it-IT, Europe/Rome
// ============================================================

describe("formatComandaDateTime", () => {
    it("formatta in it-IT con fuso Europe/Rome (CEST = UTC+2 in settembre)", () => {
        expect(formatComandaDateTime("2026-09-07T19:15:00Z")).toBe("07/09/2026, 21:15");
    });

    it("gestisce l'ora solare (CET = UTC+1 in gennaio)", () => {
        expect(formatComandaDateTime("2026-01-10T19:15:00Z")).toBe("10/01/2026, 20:15");
    });
});

// ============================================================
// renderComandaEscPos — replica PrintReceipt.tsx
// ============================================================

function hexToText(hex: string): string {
    const bytes = new Uint8Array(hex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
    return new TextDecoder().decode(bytes);
}

/** Estrae solo il testo stampabile (strip dei comandi ESC/GS) per gli assert. */
function printableLines(hex: string): string[] {
    const raw = hexToText(hex);
    // Rimuove ESC x n / GS x n (comandi a 1 byte di parametro) e caratteri di controllo residui.
    // Regex costruite a runtime: eslint no-control-regex vieta \x1b letterale.
    const esc = String.fromCharCode(0x1b);
    const gs = String.fromCharCode(0x1d);
    const stripped = raw
        .replace(new RegExp(`${esc}@`, "g"), "")
        .replace(new RegExp(`${esc}[aEd][\\s\\S]`, "g"), "")
        .replace(new RegExp(`${gs}[!V][\\s\\S]`, "g"), "");
    return stripped.split("\n").filter(l => l.length > 0);
}

const BASE_PAYLOAD: ComandaPayload = {
    order_id: "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9",
    submitted_at: "2026-09-07T19:15:00Z",
    table_label: "12",
    table_zone: "Sala",
    operator_label: null,
    customer_name: "Marco",
    is_rectification: false,
    notes: null,
    items: [
        {
            quantity: 2,
            product_name: "Pizza Margherita",
            primary_option: "Grande",
            addons: ["Bufala", "Olive"],
            item_notes: "senza basilico"
        },
        {
            quantity: 1,
            product_name: "Acqua naturale",
            primary_option: null,
            addons: [],
            item_notes: null
        }
    ]
};

describe("renderComandaEscPos", () => {
    it("replica la struttura di PrintReceipt: titolo, tavolo, meta, righe, note, footer", () => {
        const hex = renderComandaEscPos(BASE_PAYLOAD);
        const lines = printableLines(hex);
        expect(lines).toEqual([
            "COMANDA",
            "TAVOLO 12 · Sala",
            "07/09/2026, 21:15",
            "Cliente: Marco",
            "-".repeat(LINE_WIDTH),
            "2x Pizza Margherita",
            "   Grande",
            "   + Bufala",
            "   + Olive",
            "   • senza basilico",
            "",
            "1x Acqua naturale",
            "-".repeat(LINE_WIDTH),
            "#0A1B2C3D"
        ].filter(l => l.length > 0));
    });

    it("usa 'Operatore:' quando l'ordine e' inserito dallo staff e omette il cliente", () => {
        const hex = renderComandaEscPos({
            ...BASE_PAYLOAD,
            operator_label: "Giulia Rossi",
            customer_name: "Marco"
        });
        const lines = printableLines(hex);
        expect(lines).toContain("Operatore: Giulia Rossi");
        expect(lines).not.toContain("Cliente: Marco");
    });

    it("omette la zona se assente e stampa le note ordine", () => {
        const hex = renderComandaEscPos({
            ...BASE_PAYLOAD,
            table_zone: null,
            notes: "Allergia noci"
        });
        const lines = printableLines(hex);
        expect(lines).toContain("TAVOLO 12");
        expect(lines).toContain("Note: Allergia noci");
    });

    it("stampa il banner RETTIFICA quando is_rectification", () => {
        const hex = renderComandaEscPos({ ...BASE_PAYLOAD, is_rectification: true });
        expect(printableLines(hex)).toContain("*** RETTIFICA ***");
    });

    it("nome prodotto lungo con accenti: wrap a 48 caratteri con indent", () => {
        const longName = "Tagliatelle al ragù di cinghiale con tartufo nero pregiato"; // 58 char
        const hex = renderComandaEscPos({
            ...BASE_PAYLOAD,
            items: [{
                quantity: 1,
                product_name: longName,
                primary_option: null,
                addons: [],
                item_notes: null
            }]
        });
        const lines = printableLines(hex);
        const first = lines.find(l => l.startsWith("1x "))!;
        expect(Array.from(first).length).toBeLessThanOrEqual(LINE_WIDTH);
        expect(lines).toContain("1x Tagliatelle al ragù di cinghiale con tartufo");
        expect(lines).toContain("   nero pregiato");
    });

    it("il titolo in doppia dimensione e' preceduto da GS ! 0x11 e seguito da GS ! 0", () => {
        const hex = renderComandaEscPos(BASE_PAYLOAD);
        const titleHex = bytesToHex(new TextEncoder().encode("COMANDA"));
        const on = hex.indexOf("1d2111");
        const title = hex.indexOf(titleHex);
        const off = hex.indexOf("1d2100");
        expect(on).toBeGreaterThanOrEqual(0);
        expect(on).toBeLessThan(title);
        expect(off).toBeGreaterThan(title);
    });

    it("inizia con ESC @ e termina con feed + taglio", () => {
        const hex = renderComandaEscPos(BASE_PAYLOAD);
        expect(hex.startsWith("1b40")).toBe(true);
        expect(hex.endsWith("1d5601")).toBe(true);
    });

    it("output e' hex puro (solo [0-9a-f], lunghezza pari)", () => {
        const hex = renderComandaEscPos(BASE_PAYLOAD);
        expect(hex).toMatch(/^[0-9a-f]+$/);
        expect(hex.length % 2).toBe(0);
    });
});

// ============================================================
// renderAnnulloEscPos — ticket di annullamento (blocco 3a)
// ============================================================

describe("renderAnnulloEscPos", () => {
    it("titolo ANNULLATO, tavolo, orario, righe compatte, id — niente meta operatore/cliente", () => {
        const hex = renderAnnulloEscPos(BASE_PAYLOAD);
        const lines = printableLines(hex);
        expect(lines).toEqual([
            "ANNULLATO",
            "TAVOLO 12 · Sala",
            "07/09/2026, 21:15",
            "-".repeat(LINE_WIDTH),
            "2x Pizza Margherita",
            "1x Acqua naturale",
            "-".repeat(LINE_WIDTH),
            "#0A1B2C3D"
        ]);
    });

    it("non stampa mai il titolo COMANDA (foglio inconfondibile)", () => {
        const hex = renderAnnulloEscPos(BASE_PAYLOAD);
        expect(printableLines(hex)).not.toContain("COMANDA");
    });

    it("omette opzioni, addon e note riga: solo qty x nome prodotto", () => {
        const hex = renderAnnulloEscPos(BASE_PAYLOAD);
        const lines = printableLines(hex);
        expect(lines).not.toContain("   Grande");
        expect(lines).not.toContain("   + Bufala");
        expect(lines).not.toContain("   • senza basilico");
    });

    it("omette la zona se assente", () => {
        const hex = renderAnnulloEscPos({ ...BASE_PAYLOAD, table_zone: null });
        expect(printableLines(hex)).toContain("TAVOLO 12");
    });

    it("il titolo in doppia dimensione e' preceduto da GS ! 0x11 e seguito da GS ! 0", () => {
        const hex = renderAnnulloEscPos(BASE_PAYLOAD);
        const titleHex = bytesToHex(new TextEncoder().encode("ANNULLATO"));
        const on = hex.indexOf("1d2111");
        const title = hex.indexOf(titleHex);
        const off = hex.indexOf("1d2100");
        expect(on).toBeGreaterThanOrEqual(0);
        expect(on).toBeLessThan(title);
        expect(off).toBeGreaterThan(title);
    });

    it("inizia con ESC @ e termina con feed + taglio", () => {
        const hex = renderAnnulloEscPos(BASE_PAYLOAD);
        expect(hex.startsWith("1b40")).toBe(true);
        expect(hex.endsWith("1d5601")).toBe(true);
    });

    it("nome prodotto ostile non introduce opcode extra (stesso choke-point anti-injection)", () => {
        const hex = renderAnnulloEscPos({
            ...BASE_PAYLOAD,
            items: [{
                quantity: 1,
                product_name: "P@rod",
                primary_option: null,
                addons: [],
                item_notes: null
            }]
        });
        const clean = renderAnnulloEscPos({
            ...BASE_PAYLOAD,
            items: [{
                quantity: 1,
                product_name: "P@rod",
                primary_option: null,
                addons: [],
                item_notes: null
            }]
        });
        expect(hex).toBe(clean);
    });

    it("output e' hex puro e diverso dalla comanda a parita' di payload", () => {
        const annullo = renderAnnulloEscPos(BASE_PAYLOAD);
        const comanda = renderComandaEscPos(BASE_PAYLOAD);
        expect(annullo).toMatch(/^[0-9a-f]+$/);
        expect(annullo.length % 2).toBe(0);
        expect(annullo).not.toBe(comanda);
    });
});
