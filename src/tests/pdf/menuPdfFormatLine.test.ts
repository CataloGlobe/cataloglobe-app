// Riga formato del PDF menu: label in bold + leader dots verso il prezzo.
// La riga del prezzo principale NON ha dots (il nome può wrappare su 2 righe
// e il filler resterebbe agganciato alla prima) — asserito qui per non
// reintrodurlo per distrazione.
import { describe, it, expect } from "vitest";
import { Document, Image, Link, Page, Path, Svg, Text, View } from "@react-pdf/renderer";

import { MenuPdfDocument } from "@/services/pdf/MenuPdfDocument";
import { DEFAULT_STYLE_TOKENS } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import type { MenuPdfData, MenuPdfProduct } from "@/services/pdf/menuPdfTypes";

const PRIMITIVES = new Set<unknown>([Document, Page, View, Text, Link, Image, Svg, Path]);

type El = { type: unknown; props?: { children?: unknown; [k: string]: unknown } };
type Style = Record<string, unknown>;

function isEl(node: unknown): node is El {
    return typeof node === "object" && node !== null && "type" in node;
}

function expand(node: unknown): unknown {
    if (node == null || typeof node === "boolean") return null;
    if (Array.isArray(node)) return node.map(expand);
    if (!isEl(node)) return node;
    const { type, props } = node;
    if (typeof type === "function" && !PRIMITIVES.has(type)) {
        try {
            return expand((type as (p: unknown) => unknown)(props ?? {}));
        } catch {
            // Componente che non rende in isolamento (icone): trattalo da host.
        }
    }
    return { type, props: { ...props, children: expand(props?.children) } };
}

function styleOf(node: El): Style | null {
    const st = node.props?.style;
    if (!st || typeof st !== "object" || Array.isArray(st)) return null;
    return st as Style;
}

function textOf(node: unknown): string {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (isEl(node)) return textOf(node.props?.children);
    return "";
}

/** Righe (View flexDirection row) i cui figli Text contengono `label`. */
function findRowsContaining(node: unknown, label: string, out: El[]): void {
    if (Array.isArray(node)) {
        node.forEach(n => findRowsContaining(n, label, out));
        return;
    }
    if (!isEl(node)) return;
    const st = styleOf(node);
    if (node.type === View && st?.flexDirection === "row" && textOf(node).includes(label)) {
        out.push(node);
    }
    findRowsContaining(node.props?.children, label, out);
}

function childrenOf(node: El): El[] {
    const raw = node.props?.children;
    const flat = Array.isArray(raw) ? raw.flat(Infinity) : [raw];
    return flat.filter(isEl);
}

function product(): MenuPdfProduct {
    return {
        id: "p1",
        name: "Barolo",
        description: "Nebbiolo in purezza.",
        priceLabel: null,
        originalPriceLabel: null,
        formats: [
            { name: "Calice", priceLabel: "€ 9,00" },
            { name: "Bottiglia", priceLabel: "€ 68,00" }
        ],
        addons: [],
        allergens: [],
        characteristics: [],
        imageUrl: null,
        imageFraming: null,
        imageAspectRatio: null,
        isDisabled: false,
        variants: []
    };
}

function singlePriceProduct(): MenuPdfProduct {
    return { ...product(), id: "p2", name: "Caffè", priceLabel: "€ 1,50", formats: [] };
}

function buildData(products: MenuPdfProduct[]): MenuPdfData {
    return {
        meta: {
            activityName: "Sede",
            catalogName: "Menu",
            slug: "sede",
            address: null,
            generatedAt: "2026-07-28T10:00:00.000Z",
            closingInfo: {
                phone: null,
                email: null,
                website: null,
                whatsapp: null,
                instagram: null,
                facebook: null,
                googleReviewUrl: null,
                hours: [],
                fees: []
            }
        },
        brand: { tokens: DEFAULT_STYLE_TOKENS, styleName: null, logoUrl: null, coverUrl: null },
        categories: [
            { id: "c1", name: "Vini", level: 0, parentCategoryId: null, products }
        ],
        allergenLegend: [],
        allergenCoverage: { productsTotal: products.length, productsWithAllergens: 0 }
    };
}

function render(products: MenuPdfProduct[]): unknown {
    return expand(MenuPdfDocument({ data: buildData(products) }));
}

describe("riga formato — label bold + leader dots", () => {
    it("mette la label formato in bold, più marcata della descrizione", () => {
        const tree = render([product()]);
        const rows: El[] = [];
        findRowsContaining(tree, "Calice", rows);
        expect(rows.length).toBeGreaterThan(0);

        const label = childrenOf(rows[0]).find(c => c.type === Text && textOf(c) === "Calice");
        expect(label).toBeDefined();
        expect(styleOf(label as El)?.fontWeight).toBe(700);
    });

    it("inserisce un filler punteggiato elastico tra label e prezzo", () => {
        const tree = render([product()]);
        const rows: El[] = [];
        findRowsContaining(tree, "Calice", rows);

        const kids = childrenOf(rows[0]);
        const dots = kids.find(c => c.type === View);
        expect(dots).toBeDefined();
        const st = styleOf(dots as El);
        expect(st?.flexGrow).toBe(1);
        expect(st?.borderBottomStyle).toBe("dotted");
        expect(st?.borderBottomWidth).toBe(1);

        // Ordine: label → dots → prezzo.
        expect(kids.map(k => (k.type === Text ? textOf(k) : "·"))).toEqual([
            "Calice",
            "·",
            "€ 9,00"
        ]);
    });

    it("lascia il prezzo formato senza peso bold (solo la label risalta)", () => {
        const tree = render([product()]);
        const rows: El[] = [];
        findRowsContaining(tree, "Calice", rows);
        const price = childrenOf(rows[0]).find(c => c.type === Text && textOf(c) === "€ 9,00");
        expect(styleOf(price as El)?.fontWeight).toBeUndefined();
    });

    it("non mette leader dots sulla riga nome → prezzo principale", () => {
        const tree = render([singlePriceProduct()]);
        const rows: El[] = [];
        findRowsContaining(tree, "Caffè", rows);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            for (const kid of childrenOf(row)) {
                expect(styleOf(kid)?.borderBottomStyle).toBeUndefined();
            }
        }
    });
});
