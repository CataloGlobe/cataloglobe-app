import { describe, it, expect } from "vitest";
import {
    parseInlineEmphasis,
    type InlineNode
} from "@/components/PublicCollectionView/StoryView/blocks/parseInlineEmphasis";

const text = (value: string): InlineNode => ({ type: "text", value });
const strong = (value: string): InlineNode => ({ type: "strong", value });
const em = (value: string): InlineNode => ({ type: "em", value });

describe("parseInlineEmphasis", () => {
    it("testo semplice senza marcatori → un solo nodo text", () => {
        expect(parseInlineEmphasis("Ciao mondo")).toEqual([text("Ciao mondo")]);
    });

    it("`**x**` → strong", () => {
        expect(parseInlineEmphasis("**accesa**")).toEqual([strong("accesa")]);
    });

    it("`*x*` → em", () => {
        expect(parseInlineEmphasis("*farina*")).toEqual([em("farina")]);
    });

    it("misto: testo + strong + testo + em + testo (frase dell'audit)", () => {
        const raw =
            "Ogni mattina la cucina è già **accesa**. È lì che comincia: *farina, burro, uova* e il resto.";
        expect(parseInlineEmphasis(raw)).toEqual([
            text("Ogni mattina la cucina è già "),
            strong("accesa"),
            text(". È lì che comincia: "),
            em("farina, burro, uova"),
            text(" e il resto.")
        ]);
    });

    it("`**` non chiuso → letterale", () => {
        expect(parseInlineEmphasis("ciao **mondo")).toEqual([text("ciao **mondo")]);
    });

    it("`*` singolo (3 * 4) → letterale", () => {
        expect(parseInlineEmphasis("3 * 4 = 12")).toEqual([text("3 * 4 = 12")]);
    });

    it("longest-match: `**x**` NON letto come due `*` vuoti", () => {
        expect(parseInlineEmphasis("**x**")).toEqual([strong("x")]);
    });

    it("newline dentro l'enfasi è preservato", () => {
        expect(parseInlineEmphasis("**riga1\nriga2**")).toEqual([strong("riga1\nriga2")]);
    });

    it("niente annidamento: `*` dentro `**...**` resta letterale nel value", () => {
        expect(parseInlineEmphasis("**bold *nested* end**")).toEqual([
            strong("bold *nested* end")
        ]);
    });

    it("input ostile: nessun markup emesso, esce come value di text", () => {
        const raw = "<script>alert(1)</script>";
        const nodes = parseInlineEmphasis(raw);
        expect(nodes).toEqual([text("<script>alert(1)</script>")]);
        // Nessun nodo trasporta HTML: i value sono stringhe grezze, React le escapa.
        expect(nodes.every(nd => typeof nd.value === "string")).toBe(true);
    });

    it("stringa vuota → array vuoto (nessun nodo)", () => {
        expect(parseInlineEmphasis("")).toEqual([]);
    });

    it("grassetto e corsivo adiacenti in sequenza", () => {
        expect(parseInlineEmphasis("**a***b*")).toEqual([strong("a"), em("b")]);
    });
});
