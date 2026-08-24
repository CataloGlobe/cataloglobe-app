import { describe, it, expect } from "vitest";
import { Document, Image, Link, Page, Path, Svg, Text, View } from "@react-pdf/renderer";

import { MenuPdfDocument, type MenuPdfAssets } from "@/services/pdf/MenuPdfDocument";
import { DEFAULT_STYLE_TOKENS } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import type {
    MenuPdfAllergenCoverage,
    MenuPdfClosingInfo,
    MenuPdfData,
    MenuPdfProduct
} from "@/services/pdf/menuPdfTypes";

// react-pdf primitives = nodi "host": non vanno invocati come componenti.
// Tutto il resto (i nostri ClosingPage/InfoLine/LegendSection/CategorySection…)
// è un componente funzione da espandere per raggiungere il testo reso.
const PRIMITIVES = new Set<unknown>([Document, Page, View, Text, Link, Image, Svg, Path]);

type El = { type: unknown; props?: { children?: unknown; [k: string]: unknown } };

function isEl(node: unknown): node is El {
    return typeof node === "object" && node !== null && "type" in node;
}

/** Espande i componenti funzione, lascia i primitivi come host. */
function expand(node: unknown): unknown {
    if (node == null || typeof node === "boolean") return null;
    if (Array.isArray(node)) return node.map(expand);
    if (!isEl(node)) return node;
    const { type, props } = node;
    if (typeof type === "function" && !PRIMITIVES.has(type)) {
        try {
            return expand((type as (p: unknown) => unknown)(props ?? {}));
        } catch {
            // Componente che non rende in isolamento (es. icone): trattalo da host.
        }
    }
    return { type, props: { ...props, children: expand(props?.children) } };
}

function collectStrings(node: unknown, out: string[]): void {
    if (node == null) return;
    if (typeof node === "string" || typeof node === "number") {
        out.push(String(node));
        return;
    }
    if (Array.isArray(node)) {
        node.forEach(n => collectStrings(n, out));
        return;
    }
    if (isEl(node)) collectStrings(node.props?.children, out);
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

type DynamicPageProps = {
    pageNumber: number;
    totalPages: number;
    subPageNumber: number;
    subPageTotalPages: number;
};

function findRenderFn(node: unknown): ((ctx: DynamicPageProps) => string) | null {
    if (Array.isArray(node)) {
        for (const n of node) {
            const found = findRenderFn(n);
            if (found) return found;
        }
        return null;
    }
    if (!isEl(node)) return null;
    if (typeof node.props?.render === "function") {
        return node.props.render as (ctx: DynamicPageProps) => string;
    }
    return findRenderFn(node.props?.children);
}

function stringsOf(node: unknown): string[] {
    const out: string[] = [];
    collectStrings(node, out);
    return out;
}

/** Conta gli spaziatori elastici finalSpacer = esattamente { flexGrow: 1 }. */
function countElasticSpacers(node: unknown): number {
    if (Array.isArray(node)) return node.reduce((n, c) => n + countElasticSpacers(c), 0);
    if (!isEl(node)) return 0;
    const st = node.props?.style;
    const isSpacer =
        st &&
        typeof st === "object" &&
        !Array.isArray(st) &&
        (st as Record<string, unknown>).flexGrow === 1 &&
        Object.keys(st as Record<string, unknown>).length === 1;
    return (isSpacer ? 1 : 0) + countElasticSpacers(node.props?.children);
}

/**
 * Sequenza DFS dei marker della riga prodotto: "fmt" per una riga formato
 * (Text col nome formato), "icon" per la sub-line allergeni/caratteristiche
 * (Svg via PdfIcon). Serve a verificare l'ordine formati → allergeni.
 */
function orderedRowMarkers(node: unknown, formatNames: Set<string>): string[] {
    if (Array.isArray(node)) return node.flatMap(n => orderedRowMarkers(n, formatNames));
    if (!isEl(node)) return [];
    if (node.type === Svg) return ["icon"]; // icona: non ricorrere dentro
    if (node.type === Text) {
        const txt = stringsOf(node).join("");
        if (formatNames.has(txt)) return ["fmt"];
        return [];
    }
    return orderedRowMarkers(node.props?.children, formatNames);
}

// ── Fixtures ──────────────────────────────────────────────────────────
function product(): MenuPdfProduct {
    return {
        id: "p1",
        name: "Prodotto",
        description: null,
        priceLabel: "€ 10.00",
        originalPriceLabel: null,
        formats: [],
        addons: [],
        allergens: [{ code: "milk", label: "Latte", euNumber: 7 }],
        characteristics: [{ code: "vegan", label: "Vegano", icon: "leaf" }],
        imageUrl: null,
        imageFraming: null,
        imageAspectRatio: null,
        isDisabled: false,
        variants: []
    };
}

function buildData(
    activityName: string,
    address: string,
    closingInfo: MenuPdfClosingInfo,
    // Default = copertura piena (il prodotto della fixture ha "Latte"): i test
    // storici restano nel caso "sopra soglia", con la nota di rito in fondo.
    coverage: MenuPdfAllergenCoverage = { productsTotal: 1, productsWithAllergens: 1 }
): MenuPdfData {
    return {
        meta: {
            activityName,
            catalogName: "Menu",
            slug: "sede",
            address,
            generatedAt: "2026-07-23T10:00:00.000Z",
            closingInfo
        },
        brand: { tokens: DEFAULT_STYLE_TOKENS, styleName: null, logoUrl: null, coverUrl: null },
        categories: [
            {
                id: "c1",
                name: "Categoria",
                level: 0,
                parentCategoryId: null,
                products: [product()]
            }
        ],
        allergenLegend: [{ code: "milk", label: "Latte", euNumber: 7 }],
        allergenCoverage: coverage
    };
}

const SAN_PIETRO: MenuPdfClosingInfo = {
    phone: "02 7862 2210",
    email: null,
    website: null,
    whatsapp: null,
    instagram: "sanpietromilano",
    facebook: null,
    googleReviewUrl: "https://search.google.com/local/writereview?placeid=ChIJpUiEYb",
    hours: [
        { label: "Lun–Ven", value: "07:30–22:30" },
        { label: "Sab–Dom", value: "07:30–23:00" }
    ],
    fees: []
};

const SEDE_TEST: MenuPdfClosingInfo = {
    phone: "3451559558",
    email: "info@esempio.it",
    website: "https://www.esempio.it",
    whatsapp: "3451559558",
    instagram: "lorenzo.calzi",
    facebook: "facebook/pagina",
    googleReviewUrl: "https://search.google.com/local/writereview?placeid=ChIJf2r1nV",
    hours: [
        { label: "Lun", value: "Chiuso" },
        { label: "Mar–Gio", value: "09:00–18:00" },
        { label: "Ven–Dom", value: "Chiuso" }
    ],
    fees: [
        { label: "Coperto", value: "2.5 €/persona" },
        { label: "Servizio", value: "10 %" },
        { label: "Prenotazione minima", value: "20 €" },
        { label: "Spesa minima", value: "5 €" },
        { label: "Età minima", value: "8 anni" }
    ]
};

const EMPTY_ASSETS: MenuPdfAssets = { logoDataUrl: null, coverDataUrl: null, qrDataUrl: null };

function renderPages(data: MenuPdfData) {
    const tree = expand(MenuPdfDocument({ data, assets: EMPTY_ASSETS }));
    const pages: El[] = [];
    findPages(tree, pages);
    return { tree, pages };
}

const NOTE = "In caso di allergie o intolleranze si prega di informare il personale di sala.";

describe("MenuPdfDocument — pagina finale allergeni", () => {
    it("3 pagine: copertina + prodotti + finale", () => {
        const { pages } = renderPages(buildData("San Pietro", "Indirizzo", SAN_PIETRO));
        expect(pages).toHaveLength(3);
    });

    it("pagina finale = 'Allergeni e caratteristiche' (no colophon/contatti/orari)", () => {
        const { pages } = renderPages(buildData("San Pietro", "Indirizzo", SAN_PIETRO));
        const [, products, final] = pages;
        // Allergeni/caratteristiche non più in pagina prodotti
        expect(stringsOf(products)).not.toContain("Allergeni");
        const s = stringsOf(final);
        expect(s).toContain("Allergeni e caratteristiche"); // titolo pagina
        expect(s).toContain("Allergeni"); // sotto-intestazione
        expect(s).toContain("Caratteristiche");
        expect(s).toContain("Latte"); // allergene presente
        expect(s).toContain("Vegano"); // caratteristica presente
        expect(s).toContain(NOTE); // nota di rito
        // Colophon/contatti/orari rimossi dalla pagina finale
        expect(s).not.toContain("Grazie per averci scelto");
        expect(s).not.toContain("Contatti");
        expect(s).not.toContain("02 7862 2210");
        expect(s).not.toContain("@sanpietromilano");
        expect(s).not.toContain("Orari");
    });

    it("orari rimossi dalla copertina (anche se presenti nel data layer)", () => {
        // SAN_PIETRO ha hours valorizzati: NON devono comparire in copertina.
        const { pages } = renderPages(buildData("San Pietro", "Indirizzo", SAN_PIETRO));
        const cover = stringsOf(pages[0]).join(" ");
        expect(cover).toContain("San Pietro"); // copertina resa
        expect(cover).not.toContain("07:30");
        expect(cover).not.toContain("Lun–Ven");
    });

    it("Sede TEST: nessun orario in copertina; caratteristiche presenti in finale", () => {
        const { pages } = renderPages(
            buildData("Sede TEST AI", "Piazza XX Settembre, 12 — 23900 Lecco (LC)", SEDE_TEST)
        );
        const cover = stringsOf(pages[0]).join(" ");
        expect(cover).not.toContain("Chiuso");
        expect(cover).not.toContain("09:00");
        const final = stringsOf(pages[2]);
        expect(final).toContain("Caratteristiche");
        expect(final).toContain("Vegano");
    });

    it("zero caratteristiche: sezione 'Caratteristiche' assente, pagina comunque resa", () => {
        const data = buildData("Senza Car", "Via Y, 2", SAN_PIETRO);
        data.categories[0].products[0].characteristics = [];
        const final = renderPages(data).pages[2];
        const s = stringsOf(final);
        expect(s).toContain("Allergeni e caratteristiche");
        expect(s).toContain("Allergeni");
        expect(s).not.toContain("Caratteristiche");
        expect(s).toContain(NOTE);
        // Allineato in alto: 1 solo spacer (prima della nota) anche senza caratteristiche
        // → contenuto in alto, nota ancorata in fondo (niente centraggio).
        expect(countElasticSpacers(final)).toBe(1);
    });

    it("contenuto allineato in alto: 1 spaziatore prima della nota, nota in fondo", () => {
        const { pages } = renderPages(buildData("San Pietro", "Indirizzo", SAN_PIETRO));
        const final = pages[2];
        // Con caratteristiche: stesso singolo spacer → contenuto in alto, nota in fondo.
        expect(countElasticSpacers(final)).toBe(1);
        const s = stringsOf(final);
        // Ordine: titolo in alto, nota in fondo.
        expect(s.indexOf("Allergeni e caratteristiche")).toBeLessThan(s.indexOf(NOTE));
    });

    it("copertina: ordine nome sede → indirizzo → titolo menù", () => {
        const data = buildData("San Pietro", "Corso Buenos Aires, 6 — 20121 Milano (MI)", SAN_PIETRO);
        // header.showAddress è false nei token di default → forzo true per il test.
        data.brand = {
            ...data.brand,
            tokens: {
                ...data.brand.tokens,
                header: { ...data.brand.tokens.header, showAddress: true }
            }
        };
        const s = stringsOf(renderPages(data).pages[0]);
        const iName = s.indexOf("San Pietro");
        const iAddr = s.indexOf("Corso Buenos Aires, 6 — 20121 Milano (MI)");
        const iCatalog = s.indexOf("Menu");
        expect(iName).toBeGreaterThanOrEqual(0);
        expect(iAddr).toBeGreaterThan(iName); // indirizzo sotto il nome sede
        expect(iCatalog).toBeGreaterThan(iAddr); // titolo menù dopo l'indirizzo
    });

    it("paginazione locale alla Page prodotti: sub-page, nessun offset globale", () => {
        const { pages } = renderPages(buildData("San Pietro", "Indirizzo", SAN_PIETRO));
        const render = findRenderFn(pages[1]); // footer nella pagina prodotti
        expect(render).not.toBeNull();
        // 4 pagine fisiche di prodotti → "1 di 4" … "4 di 4".
        expect(render!({ pageNumber: 2, totalPages: 6, subPageNumber: 1, subPageTotalPages: 4 }))
            .toBe("Pagina 1 di 4");
        expect(render!({ pageNumber: 5, totalPages: 6, subPageNumber: 4, subPageTotalPages: 4 }))
            .toBe("Pagina 4 di 4");
    });

    it("chiusura su 2 pagine: il totale prodotti resta corretto", () => {
        // Il difetto storico: con `totalPages - 2` una chiusura su due pagine
        // sovrastimava il totale di 1 ("Pagina 1 di 2" con una sola pagina
        // prodotti). Gli indici globali ora non entrano più nel calcolo.
        const { pages } = renderPages(buildData("San Pietro", "Indirizzo", SAN_PIETRO));
        const render = findRenderFn(pages[1]);
        expect(render).not.toBeNull();
        // Copertina + 1 prodotti + 2 di chiusura = 4 pagine fisiche.
        expect(render!({ pageNumber: 2, totalPages: 4, subPageNumber: 1, subPageTotalPages: 1 }))
            .toBe("Pagina 1 di 1");
    });
});

describe("MenuPdfDocument — pagina finale, testo per copertura allergeni", () => {
    const CAPTION = "Gli allergeni evidenziati sono presenti in almeno un piatto di questo menù.";
    const CAPTION_NO_DATA = "Elenco dei 14 allergeni previsti dal Regolamento UE 1169/2011.";
    // Frammento e non frase intera: i testi sono in revisione legale, e la
    // riga di cautela è già stata accorciata una volta.
    const CAUTION_FRAGMENT = "non sono stati segnalati";
    const ASK_IN_ROOM =
        "Le informazioni su ingredienti e allergeni di ogni piatto sono disponibili in sala su richiesta.";

    function finalPageStrings(coverage: MenuPdfAllergenCoverage): string[] {
        return stringsOf(renderPages(buildData("Sede", "Indirizzo", SAN_PIETRO, coverage)).pages[2]);
    }

    function hasCaution(strings: string[]): boolean {
        return strings.some(s => s.includes(CAUTION_FRAGMENT));
    }

    it("copertura zero: didascalia normativa, blocco promosso, nota una sola volta", () => {
        const data = buildData("Sede", "Indirizzo", SAN_PIETRO, {
            productsTotal: 12,
            productsWithAllergens: 0
        });
        const { tree, pages } = renderPages(data);
        const final = stringsOf(pages[2]);

        expect(final).toContain(CAPTION_NO_DATA);
        expect(final).not.toContain(CAPTION);
        expect(final).toContain(NOTE); // promossa in testa
        expect(final).toContain(ASK_IN_ROOM);
        expect(hasCaution(final)).toBe(false);

        // Promossa, non duplicata: una sola occorrenza in TUTTO il documento.
        expect(stringsOf(tree).filter(s => s === NOTE)).toHaveLength(1);
        // In testa davvero: dopo la didascalia, prima della griglia.
        expect(final.indexOf(CAPTION_NO_DATA)).toBeLessThan(final.indexOf(NOTE));
        expect(final.indexOf(NOTE)).toBeLessThan(final.indexOf(ASK_IN_ROOM));
        expect(final.indexOf(ASK_IN_ROOM)).toBeLessThan(final.indexOf("Latte"));
    });

    it("copertura zero: griglia, caratteristiche e struttura invariate", () => {
        const final = finalPageStrings({ productsTotal: 12, productsWithAllergens: 0 });
        expect(final).toContain("Allergeni e caratteristiche");
        expect(final).toContain("Allergeni");
        expect(final).toContain("Caratteristiche");
        expect(final).toContain("Latte"); // i 14 restano tutti elencati
        expect(final).toContain("Vegano");
    });

    it("copertura sotto soglia: didascalia + riga di cautela", () => {
        const final = finalPageStrings({ productsTotal: 10, productsWithAllergens: 3 });
        expect(final).toContain(CAPTION);
        expect(hasCaution(final)).toBe(true);
        expect(final).not.toContain(CAPTION_NO_DATA);
        expect(final).not.toContain(ASK_IN_ROOM);
        expect(final).toContain(NOTE); // resta in fondo
    });

    it("copertura sopra soglia: solo didascalia, nessuna cautela", () => {
        const final = finalPageStrings({ productsTotal: 10, productsWithAllergens: 8 });
        expect(final).toContain(CAPTION);
        expect(hasCaution(final)).toBe(false);
        expect(final).not.toContain(CAPTION_NO_DATA);
        expect(final).toContain(NOTE);
    });

    it("soglia 50%: esattamente a metà NON è copertura bassa", () => {
        const final = finalPageStrings({ productsTotal: 10, productsWithAllergens: 5 });
        expect(hasCaution(final)).toBe(false);
    });

    it("catalogo senza prodotti stampabili: nessuna divisione per zero, ricade su copertura zero", () => {
        const final = finalPageStrings({ productsTotal: 0, productsWithAllergens: 0 });
        expect(final).toContain(CAPTION_NO_DATA);
        expect(hasCaution(final)).toBe(false);
    });

    it("spaziatore elastico invariato in tutti i casi (contenuto in alto)", () => {
        const cases: MenuPdfAllergenCoverage[] = [
            { productsTotal: 12, productsWithAllergens: 0 },
            { productsTotal: 10, productsWithAllergens: 3 },
            { productsTotal: 10, productsWithAllergens: 8 }
        ];
        for (const coverage of cases) {
            const final = renderPages(buildData("Sede", "Indirizzo", SAN_PIETRO, coverage)).pages[2];
            expect(countElasticSpacers(final)).toBe(1);
        }
    });
});

describe("MenuPdfDocument — pagina finale con molte caratteristiche", () => {
    /** N caratteristiche distinte sul prodotto della fixture. */
    function dataWithCharacteristics(count: number): MenuPdfData {
        const data = buildData("Sede", "Indirizzo", SAN_PIETRO);
        data.categories[0].products[0].characteristics = Array.from(
            { length: count },
            (_, i) => ({
                code: `char-${i}`,
                // Label lunga come le più lunghe del seed di piattaforma
                // ("Può contenere ingredienti surgelati", 35 caratteri).
                label: `Caratteristica numero ${String(i).padStart(2, "0")}`,
                icon: "lucide:leaf"
            })
        );
        return data;
    }

    /** Un `wrap={false}` che racchiuda l'INTERO gruppo legenda = il difetto. */
    function countUnwrappableNodes(node: unknown): number {
        if (Array.isArray(node)) return node.reduce<number>((n, c) => n + countUnwrappableNodes(c), 0);
        if (!isEl(node)) return 0;
        const self = node.props?.wrap === false ? 1 : 0;
        return self + countUnwrappableNodes(node.props?.children);
    }

    for (const count of [26, 31]) {
        it(`${count} caratteristiche: nessun contenuto perso, nota una sola volta`, () => {
            const data = dataWithCharacteristics(count);
            const { tree, pages } = renderPages(data);
            const final = stringsOf(pages[2]);

            // Tutte le voci presenti nell'albero: nessuna scartata dal render.
            for (let i = 0; i < count; i += 1) {
                expect(final).toContain(`Caratteristica numero ${String(i).padStart(2, "0")}`);
            }
            // I 14 allergeni restano al loro posto.
            expect(final).toContain("Latte");
            expect(final).toContain("Molluschi");
            // La nota di rito non si duplica.
            expect(stringsOf(tree).filter(s => s === NOTE)).toHaveLength(1);
        });
    }

    it("il gruppo legenda non è più un unico blocco indivisibile", () => {
        // Il wrap={false} sopravvive solo a granularità fine (item singolo e
        // sottotitolo+prima riga), mai sull'intera sezione: un blocco più alto
        // della pagina verrebbe disegnato oltre il bordo invece di impaginarsi.
        const withMany = renderPages(dataWithCharacteristics(31)).pages[2];
        const withFew = renderPages(dataWithCharacteristics(2)).pages[2];
        const many = countUnwrappableNodes(withMany);
        const few = countUnwrappableNodes(withFew);
        // Cresce con le voci → è per-item, non un contenitore unico.
        expect(many).toBeGreaterThan(few);
        // 14 allergeni + 31 caratteristiche + 2 header di sezione = 47.
        expect(many).toBe(14 + 31 + 2);
    });

    it("poche caratteristiche: struttura invariata (spaziatore + nota in fondo)", () => {
        const final = renderPages(dataWithCharacteristics(2)).pages[2];
        expect(countElasticSpacers(final)).toBe(1);
        const s = stringsOf(final);
        expect(s).toContain(NOTE);
        expect(s.indexOf("Caratteristiche")).toBeLessThan(s.indexOf(NOTE));
    });
});

describe("MenuPdfDocument — ordine riga prodotto (allergeni per ultimi)", () => {
    const FORMAT_NAMES = new Set(["Calice", "Bottiglia"]);
    const FORMATS = [
        { name: "Calice", priceLabel: "€ 9.00" },
        { name: "Bottiglia", priceLabel: "€ 45.00" }
    ];
    const MILK = { code: "milk", label: "Latte", euNumber: 7 };

    function rowData(over: Partial<MenuPdfProduct>): MenuPdfData {
        const data = buildData("Sede", "Indirizzo", SAN_PIETRO);
        data.categories[0].products[0] = {
            ...data.categories[0].products[0],
            name: "Vino",
            priceLabel: null,
            formats: [],
            allergens: [],
            characteristics: [],
            ...over
        };
        return data;
    }

    function markers(data: MenuPdfData, assets?: MenuPdfAssets): string[] {
        const tree = expand(MenuPdfDocument({ data, assets: assets ?? EMPTY_ASSETS }));
        const pages: El[] = [];
        findPages(tree, pages);
        return orderedRowMarkers(pages[1], FORMAT_NAMES); // pages[1] = pagina prodotti
    }

    it("multi-formato + allergene: formati PRIMA, allergeni per ultimi", () => {
        const m = markers(rowData({ formats: FORMATS, allergens: [MILK] }));
        expect(m).toEqual(["fmt", "fmt", "icon"]);
        expect(m.lastIndexOf("fmt")).toBeLessThan(m.indexOf("icon"));
    });

    it("multi-formato senza allergeni: nessuna sub-line icone", () => {
        const m = markers(rowData({ formats: FORMATS }));
        expect(m).toEqual(["fmt", "fmt"]);
        expect(m).not.toContain("icon");
    });

    it("prezzo singolo + allergene: nessun formato, sub-line icone presente", () => {
        const m = markers(rowData({ priceLabel: "€ 10.00", allergens: [MILK] }));
        expect(m).toEqual(["icon"]);
    });

    it("photoMode: stesso ordine formati → allergeni", () => {
        const data = rowData({ formats: FORMATS, allergens: [MILK], imageUrl: "https://x/y.jpg" });
        // photoMode deriva da productImages non vuoto; thumb presente per p1 → niente placeholder Svg.
        const assets: MenuPdfAssets = {
            logoDataUrl: null,
            coverDataUrl: null,
            qrDataUrl: null,
            productImages: { p1: "data:image/png;base64,AAAA" }
        };
        expect(markers(data, assets)).toEqual(["fmt", "fmt", "icon"]);
    });
});
