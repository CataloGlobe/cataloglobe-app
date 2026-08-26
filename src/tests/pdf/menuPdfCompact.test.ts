// Menù compatto: le sequenze di voci senza descrizione vengono affiancate su
// due colonne. La regola guarda SOLO la lunghezza della sequenza — nessuna
// soglia percentuale sulla categoria — e cede sempre alle foto.
import { describe, it, expect } from "vitest";
import { Document, Image, Link, Page, Path, Svg, Text, View } from "@react-pdf/renderer";

import { MenuPdfDocument, type MenuPdfAssets } from "@/services/pdf/MenuPdfDocument";
import {
    COMPACT_MIN_RUN,
    buildCategoryBlocks,
    isCompactCandidate
} from "@/services/pdf/compactMenuLayout";
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

function findPages(node: unknown, out: El[]): void {
    if (Array.isArray(node)) {
        node.forEach(n => findPages(n, out));
        return;
    }
    if (!isEl(node)) return;
    if (node.type === Page) out.push(node);
    findPages(node.props?.children, out);
}

/** Stili del nodo, normalizzati: `style` può essere un oggetto o un array. */
function stylesOf(node: El): Style[] {
    const st = node.props?.style;
    if (!st || typeof st !== "object") return [];
    return (Array.isArray(st) ? st : [st]).filter(
        (s): s is Style => !!s && typeof s === "object"
    );
}

/** Container di griglia compatta = row + wrap. */
function isCompactGrid(node: El): boolean {
    return (
        node.type === View &&
        stylesOf(node).some(s => s.flexDirection === "row" && s.flexWrap === "wrap")
    );
}

/** Cella affiancata = riga prodotto con productRowHalf (width 50%). */
function isHalfCell(node: El): boolean {
    return node.type === View && stylesOf(node).some(s => s.width === "50%");
}

function collect(node: unknown, pred: (el: El) => boolean, out: El[]): void {
    if (Array.isArray(node)) {
        node.forEach(n => collect(n, pred, out));
        return;
    }
    if (!isEl(node)) return;
    if (pred(node)) out.push(node);
    collect(node.props?.children, pred, out);
}

function findAll(node: unknown, pred: (el: El) => boolean): El[] {
    const out: El[] = [];
    collect(node, pred, out);
    return out;
}

/**
 * Nomi prodotto sotto un nodo, in ordine di documento.
 *
 * `productName` e `productPrice` condividono fontWeight 700 + fontSize 11: il
 * discriminante è `flexGrow` (il nome riempie la riga e wrappa, il prezzo ha
 * flexShrink 0 e non cresce).
 */
function productNamesUnder(node: unknown): string[] {
    const texts: El[] = [];
    collect(node, el => el.type === Text, texts);
    return texts
        .map(el => {
            const st = stylesOf(el)[0];
            if (st?.fontWeight !== 700 || st?.fontSize !== 11) return null;
            if (st?.flexGrow !== 1) return null;
            const raw = el.props?.children;
            return typeof raw === "string" ? raw : null;
        })
        .filter((n): n is string => n !== null);
}

// ── Fixtures ──────────────────────────────────────────────────────────
function nude(name: string): MenuPdfProduct {
    return {
        id: name,
        name,
        description: null,
        priceLabel: "€ 10,00",
        originalPriceLabel: null,
        formats: [],
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

function described(name: string): MenuPdfProduct {
    return { ...nude(name), description: "Con una descrizione." };
}

/** Stringa vuota, non null: il mapper la lascia passare ed è comunque "nuda". */
function blankDescription(name: string): MenuPdfProduct {
    return { ...nude(name), description: "   " };
}

function multiFormat(name: string): MenuPdfProduct {
    return {
        ...nude(name),
        priceLabel: null,
        formats: [
            { name: "Calice", priceLabel: "€ 9,00" },
            { name: "Bottiglia", priceLabel: "€ 45,00" }
        ]
    };
}

function buildData(products: MenuPdfProduct[]): MenuPdfData {
    return {
        meta: {
            activityName: "Sede",
            catalogName: "Menu",
            slug: "sede",
            address: null,
            generatedAt: "2026-08-26T10:00:00.000Z",
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
            { id: "c1", name: "Categoria", level: 0, parentCategoryId: null, products }
        ],
        allergenLegend: [],
        allergenCoverage: { productsTotal: products.length, productsWithAllergens: 0 }
    };
}

const EMPTY_ASSETS: MenuPdfAssets = { logoDataUrl: null, coverDataUrl: null, qrDataUrl: null };

/** Pagina prodotti (pages[1]: copertina, prodotti, chiusura). */
function productsPage(
    products: MenuPdfProduct[],
    compact: boolean,
    assets: MenuPdfAssets = EMPTY_ASSETS
): El {
    const tree = expand(MenuPdfDocument({ data: buildData(products), assets, compact }));
    const pages: El[] = [];
    findPages(tree, pages);
    return pages[1];
}

function nudeRun(count: number, prefix = "N"): MenuPdfProduct[] {
    return Array.from({ length: count }, (_, i) => nude(`${prefix}${i + 1}`));
}

// ── buildCategoryBlocks (logica pura) ─────────────────────────────────
describe("buildCategoryBlocks — sequenze", () => {
    it("compact off: un solo blocco a righe piene, qualunque sia il contenuto", () => {
        const blocks = buildCategoryBlocks(nudeRun(10), false);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].kind).toBe("full");
        expect(blocks[0].products).toHaveLength(10);
    });

    it("categoria vuota: nessun blocco", () => {
        expect(buildCategoryBlocks([], true)).toEqual([]);
    });

    it(`sequenza di ${COMPACT_MIN_RUN} voci nude: un blocco griglia`, () => {
        const blocks = buildCategoryBlocks(nudeRun(COMPACT_MIN_RUN), true);
        expect(blocks.map(b => b.kind)).toEqual(["grid"]);
    });

    it(`sequenza di ${COMPACT_MIN_RUN - 1} voci nude: resta a righe piene`, () => {
        const blocks = buildCategoryBlocks(nudeRun(COMPACT_MIN_RUN - 1), true);
        expect(blocks.map(b => b.kind)).toEqual(["full"]);
    });

    it("una voce descritta spezza la sequenza: i due tronconi sono valutati a sé", () => {
        // 5 nude | descritta | 2 nude → griglia, poi righe piene (la coda è corta).
        const blocks = buildCategoryBlocks(
            [...nudeRun(5, "A"), described("D"), ...nudeRun(2, "B")],
            true
        );
        expect(blocks.map(b => b.kind)).toEqual(["grid", "full"]);
        expect(blocks[0].products.map(p => p.name)).toEqual(["A1", "A2", "A3", "A4", "A5"]);
        // La descritta e la coda corta confluiscono in un unico blocco pieno.
        expect(blocks[1].products.map(p => p.name)).toEqual(["D", "B1", "B2"]);
    });

    it("due sequenze lunghe separate da una descritta: due griglie", () => {
        const blocks = buildCategoryBlocks(
            [...nudeRun(4, "A"), described("D"), ...nudeRun(4, "B")],
            true
        );
        expect(blocks.map(b => b.kind)).toEqual(["grid", "full", "grid"]);
        expect(blocks[1].products.map(p => p.name)).toEqual(["D"]);
    });

    it("voci alternate una a una: nessuna griglia, layout identico a oggi", () => {
        const products = [
            nude("N1"),
            described("D1"),
            nude("N2"),
            described("D2"),
            nude("N3"),
            described("D3")
        ];
        const blocks = buildCategoryBlocks(products, true);
        expect(blocks.map(b => b.kind)).toEqual(["full"]);
        expect(blocks[0].products).toHaveLength(6);
    });

    it("descrizione di soli spazi = voce nuda (il mapper lascia passare la stringa vuota)", () => {
        expect(isCompactCandidate(blankDescription("X"))).toBe(true);
        expect(isCompactCandidate(described("Y"))).toBe(false);
        const blocks = buildCategoryBlocks(
            Array.from({ length: COMPACT_MIN_RUN }, (_, i) => blankDescription(`B${i}`)),
            true
        );
        expect(blocks.map(b => b.kind)).toEqual(["grid"]);
    });

    it("multi-formato escluso: è alto quanto i suoi formati, spezza come una descritta", () => {
        expect(isCompactCandidate(multiFormat("V"))).toBe(false);
        const blocks = buildCategoryBlocks(
            [...nudeRun(4, "A"), multiFormat("V"), ...nudeRun(4, "B")],
            true
        );
        expect(blocks.map(b => b.kind)).toEqual(["grid", "full", "grid"]);
        expect(blocks[1].products.map(p => p.name)).toEqual(["V"]);
    });
});

// ── Render ────────────────────────────────────────────────────────────
describe("MenuPdfDocument — menù compatto, render", () => {
    it(`sequenza di ${COMPACT_MIN_RUN} voci nude: celle affiancate`, () => {
        const page = productsPage(nudeRun(COMPACT_MIN_RUN), true);
        expect(findAll(page, isCompactGrid).length).toBeGreaterThan(0);
        expect(findAll(page, isHalfCell)).toHaveLength(COMPACT_MIN_RUN);
    });

    it(`sequenza di ${COMPACT_MIN_RUN - 1} voci nude: nessuna cella affiancata`, () => {
        const page = productsPage(nudeRun(COMPACT_MIN_RUN - 1), true);
        expect(findAll(page, isCompactGrid)).toHaveLength(0);
        expect(findAll(page, isHalfCell)).toHaveLength(0);
    });

    it("toggle off: nessun container wrap introdotto, layout identico a oggi", () => {
        const page = productsPage(nudeRun(10), false);
        expect(findAll(page, isCompactGrid)).toHaveLength(0);
        expect(findAll(page, isHalfCell)).toHaveLength(0);
    });

    it("default del componente = toggle off", () => {
        const tree = expand(
            MenuPdfDocument({ data: buildData(nudeRun(10)), assets: EMPTY_ASSETS })
        );
        const pages: El[] = [];
        findPages(tree, pages);
        expect(findAll(pages[1], isCompactGrid)).toHaveLength(0);
    });

    it("photoMode attivo + toggle on: le foto vincono, nessun affiancamento", () => {
        const products = nudeRun(8);
        const assets: MenuPdfAssets = {
            ...EMPTY_ASSETS,
            productImages: { N1: "data:image/png;base64,AAAA" }
        };
        const page = productsPage(products, true, assets);
        expect(findAll(page, isCompactGrid)).toHaveLength(0);
        expect(findAll(page, isHalfCell)).toHaveLength(0);
    });

    it("voci alternate una a una: nessun affiancamento", () => {
        const products = [
            nude("N1"),
            described("D1"),
            nude("N2"),
            described("D2"),
            nude("N3"),
            described("D3")
        ];
        const page = productsPage(products, true);
        expect(findAll(page, isCompactGrid)).toHaveLength(0);
    });

    it("solo le voci della sequenza sono affiancate, le descritte restano piene", () => {
        const products = [...nudeRun(5, "A"), described("D"), ...nudeRun(5, "B")];
        const page = productsPage(products, true);
        const affiancate = findAll(page, isHalfCell).flatMap(productNamesUnder);
        expect(affiancate).toEqual(["A1", "A2", "A3", "A4", "A5", "B1", "B2", "B3", "B4", "B5"]);
        expect(affiancate).not.toContain("D");
    });

    it("header e prima riga della griglia restano indivisibili, il resto scorre", () => {
        const page = productsPage(nudeRun(6), true);
        // Blocco wrap={false} che contiene il titolo di categoria.
        const heads = findAll(
            page,
            el =>
                el.type === View &&
                el.props?.wrap === false &&
                productNamesUnder(el).length > 0 &&
                findAll(el, e => e.type === Text).some(t => t.props?.children === "Categoria")
        );
        expect(heads).toHaveLength(1);
        // Esattamente le prime due celle salgono con l'header: contenendone due a
        // width 50%, la griglia successiva riparte allineata.
        expect(productNamesUnder(heads[0])).toEqual(["N1", "N2"]);
        expect(findAll(heads[0], isCompactGrid)).toHaveLength(1);
        // Il container indivisibile NON è la griglia intera.
        expect(findAll(heads[0], isHalfCell)).toHaveLength(2);
        expect(findAll(page, isHalfCell)).toHaveLength(6);
    });

    it("nessun wrap={false} sul container di griglia (blocco più alto della pagina)", () => {
        const page = productsPage(nudeRun(40), true);
        const grids = findAll(page, isCompactGrid);
        expect(grids.length).toBeGreaterThan(0);
        for (const grid of grids) expect(grid.props?.wrap).not.toBe(false);
    });

    it("le celle affiancate restano indivisibili una per una", () => {
        const cells = findAll(productsPage(nudeRun(6), true), isHalfCell);
        expect(cells).toHaveLength(6);
        for (const cell of cells) expect(cell.props?.wrap).toBe(false);
    });
});
