import { describe, it, expect } from "vitest";
import { Document, Image, Link, Page, Path, Svg, Text, View } from "@react-pdf/renderer";

import { MenuPdfDocument, type MenuPdfAssets } from "@/services/pdf/MenuPdfDocument";
import { ALL_ALLERGENS } from "@/services/pdf/allergenEuNumbers";
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

/**
 * Spaziatori elastici della pagina finale = View il cui UNICO stile è un
 * flexGrow. Non filtra su `=== 1`: i tre spaziatori hanno pesi diversi
 * (1 : 2 : 1.5) per ripartire lo spazio fra le sezioni invece di accumularlo
 * in coda. Ritorna i pesi in ordine di documento.
 */
function elasticSpacerWeights(node: unknown): number[] {
    if (Array.isArray(node)) return node.flatMap(c => elasticSpacerWeights(c));
    if (!isEl(node)) return [];
    const st = node.props?.style;
    const rec =
        st && typeof st === "object" && !Array.isArray(st)
            ? (st as Record<string, unknown>)
            : null;
    const isSpacer =
        rec !== null && typeof rec.flexGrow === "number" && Object.keys(rec).length === 1;
    return [
        ...(isSpacer ? [rec.flexGrow as number] : []),
        ...elasticSpacerWeights(node.props?.children)
    ];
}

function countElasticSpacers(node: unknown): number {
    return elasticSpacerWeights(node).length;
}

/** Numeri UE della riga prodotto: "1" oppure "1 · 3 · 7". */
const EU_NUMBERS_RE = /^\d+( · \d+)*$/;

/**
 * Sequenza DFS dei marker della riga prodotto: "fmt" per una riga formato
 * (Text col nome formato), "al" per i numeri UE degli allergeni (Text) e
 * "icon" per un'icona (Svg via PdfIcon — dopo il passaggio ai numeri restano
 * solo le caratteristiche). Serve a verificare l'ordine formati → allergeni.
 */
function orderedRowMarkers(node: unknown, formatNames: Set<string>): string[] {
    if (Array.isArray(node)) return node.flatMap(n => orderedRowMarkers(n, formatNames));
    if (!isEl(node)) return [];
    if (node.type === Svg) return ["icon"]; // icona: non ricorrere dentro
    if (node.type === Text) {
        const txt = stringsOf(node).join("");
        if (formatNames.has(txt)) return ["fmt"];
        if (EU_NUMBERS_RE.test(txt)) return ["al"];
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

    it("pagina finale = allergeni e contatti (no caratteristiche, no colophon, no orari)", () => {
        const { pages } = renderPages(buildData("San Pietro", "Indirizzo", SAN_PIETRO));
        const [, products, final] = pages;
        // Legenda allergeni non in pagina prodotti (là ci sono solo i numeri).
        expect(stringsOf(products)).not.toContain("Allergeni");
        const s = stringsOf(final);
        expect(s).toContain("Allergeni"); // titolo pagina = sotto-intestazione
        expect(s).toContain("Latte"); // allergene in legenda
        // Le caratteristiche sono uscite dal PDF: su carta non filtrano nulla
        // e molte datano il documento.
        expect(s).not.toContain("Caratteristiche");
        expect(s).not.toContain("Vegano");
        expect(s).toContain(NOTE); // nota di rito
        // Contatti: resi dallo Step 2 (prima erano volutamente assenti).
        expect(s).toContain("Contatti");
        expect(s).toContain("02 7862 2210");
        expect(s).toContain("@sanpietromilano"); // instagram reso come handle
        // Colophon mai esistito; ORARI fuori per scelta di prodotto: un menù
        // stampato che dichiara orari vecchi è peggio di uno che tace.
        expect(s).not.toContain("Grazie per averci scelto");
        expect(s).not.toContain("Orari");
        expect(s).not.toContain("07:30–22:30");
        expect(s).not.toContain("Lun–Ven");
        // googleReviewUrl fuori scope: la pagina informa, non chiede recensioni.
        expect(s.join(" ")).not.toContain("writereview");
    });

    it("orari rimossi dalla copertina (anche se presenti nel data layer)", () => {
        // SAN_PIETRO ha hours valorizzati: NON devono comparire in copertina.
        const { pages } = renderPages(buildData("San Pietro", "Indirizzo", SAN_PIETRO));
        const cover = stringsOf(pages[0]).join(" ");
        expect(cover).toContain("San Pietro"); // copertina resa
        expect(cover).not.toContain("07:30");
        expect(cover).not.toContain("Lun–Ven");
    });

    it("Sede TEST: nessun orario in copertina; nessuna caratteristica in finale", () => {
        const { pages } = renderPages(
            buildData("Sede TEST AI", "Piazza XX Settembre, 12 — 23900 Lecco (LC)", SEDE_TEST)
        );
        const cover = stringsOf(pages[0]).join(" ");
        expect(cover).not.toContain("Chiuso");
        expect(cover).not.toContain("09:00");
        const final = stringsOf(pages[2]);
        expect(final).not.toContain("Caratteristiche");
        expect(final).not.toContain("Vegano");
    });

    it("caratteristiche assegnate o meno: pagina finale identica", () => {
        const withChars = renderPages(buildData("Con Car", "Via Y, 2", SAN_PIETRO)).pages[2];
        const data = buildData("Senza Car", "Via Y, 2", SAN_PIETRO);
        data.categories[0].products[0].characteristics = [];
        const without = renderPages(data).pages[2];

        expect(stringsOf(without)).toEqual(stringsOf(withChars));
        const s = stringsOf(without);
        expect(s).toContain("Allergeni");
        expect(s).not.toContain("Caratteristiche");
        expect(s).toContain(NOTE);
        // Allineato in alto: 1 solo spacer (prima della nota) → contenuto in
        // alto, nota ancorata in fondo (niente centraggio).
        expect(countElasticSpacers(without)).toBe(3);
    });

    it("contenuto allineato in alto: 1 spaziatore prima della nota, nota in fondo", () => {
        const { pages } = renderPages(buildData("San Pietro", "Indirizzo", SAN_PIETRO));
        const final = pages[2];
        expect(countElasticSpacers(final)).toBe(3);
        const s = stringsOf(final);
        // Ordine: titolo in alto, nota in fondo.
        expect(s.indexOf("Allergeni")).toBeLessThan(s.indexOf(NOTE));
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
    const CAPTION =
        "I numeri accanto a ogni piatto corrispondono agli allergeni elencati qui sotto.";
    const CAPTION_NO_DATA = "Elenco dei 14 allergeni previsti dal Regolamento UE 1169/2011.";
    // Frammento e non frase intera: i testi sono in revisione legale, e la
    // riga di cautela è già stata riformulata due volte.
    const CAUTION_FRAGMENT = "I piatti senza numeri";
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

    it("copertura zero: griglia e struttura invariate", () => {
        const final = finalPageStrings({ productsTotal: 12, productsWithAllergens: 0 });
        expect(final).toContain("Allergeni");
        expect(final).toContain("Latte"); // i 14 restano tutti elencati
        expect(final).not.toContain("Caratteristiche");
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
            expect(countElasticSpacers(final)).toBe(3);
        }
    });
});

describe("MenuPdfDocument — contatti e costi di servizio (Step 2)", () => {
    // Delle 5 fee di FEE_DEFINITIONS solo coperto e servizio sono costi: le
    // altre tre (prenotazione minima, spesa minima, età minima) sono condizioni.
    const FEES_TITLE = "Costi e condizioni";

    const NO_CONTACTS: MenuPdfClosingInfo = {
        phone: null,
        email: null,
        website: null,
        whatsapp: null,
        instagram: null,
        facebook: null,
        googleReviewUrl: null,
        hours: [],
        fees: []
    };

    function finalStrings(closingInfo: MenuPdfClosingInfo): string[] {
        return stringsOf(renderPages(buildData("Sede", "Indirizzo", closingInfo)).pages[2]);
    }

    it("contatti e fees presenti: entrambe le sezioni rese", () => {
        // SEDE_TEST ha tutti i contatti + 5 fees.
        const s = finalStrings(SEDE_TEST);
        expect(s).toContain("Contatti");
        expect(s).toContain(FEES_TITLE);
        expect(s).toContain("3451559558"); // telefono
        expect(s).toContain("info@esempio.it");
        expect(s).toContain("Coperto");
        expect(s).toContain("2.5 €/persona");
    });

    it("telefono e WhatsApp uguali: il numero compare una volta sola", () => {
        // SEDE_TEST ha phone === whatsapp: caso reale (stesso numero per
        // chiamate e messaggi), stampato due volte sembrava un errore.
        const s = finalStrings(SEDE_TEST);
        expect(s.filter(v => v === "3451559558")).toHaveLength(1);
    });

    it("stesso numero scritto in modo diverso: comunque una riga sola", () => {
        const s = finalStrings({ ...SEDE_TEST, whatsapp: "+39 345 155-9558" });
        // Il valore stampato resta quello di `phone`, non quello di whatsapp.
        expect(s).toContain("3451559558");
        expect(s).not.toContain("+39 345 155-9558");
        expect(s.filter(v => v.includes("9558"))).toHaveLength(1);
    });

    it("numeri diversi: due righe distinte", () => {
        const s = finalStrings({ ...SEDE_TEST, whatsapp: "333 1234567" });
        expect(s).toContain("3451559558");
        expect(s).toContain("333 1234567");
    });

    it("solo WhatsApp senza telefono: la riga resta", () => {
        const s = finalStrings({ ...NO_CONTACTS, whatsapp: "3451559558" });
        expect(s).toContain("3451559558");
    });

    it("Instagram reso come handle, senza raddoppiare la chiocciola", () => {
        expect(finalStrings({ ...NO_CONTACTS, instagram: "lorenzo.calzi" }))
            .toContain("@lorenzo.calzi");
        expect(finalStrings({ ...NO_CONTACTS, instagram: "@lorenzo.calzi" }))
            .toContain("@lorenzo.calzi");
        expect(finalStrings({ ...NO_CONTACTS, instagram: "https://instagram.com/lorenzo.calzi" }))
            .toContain("@lorenzo.calzi");
    });

    it("Facebook: coda del percorso da un dominio noto, altrimenti valore grezzo", () => {
        expect(finalStrings({ ...NO_CONTACTS, facebook: "https://facebook.com/pagina" }))
            .toContain("pagina");
        // Testo libero non riconoscibile: stampato com'è, non trasformato male.
        expect(finalStrings({ ...NO_CONTACTS, facebook: "facebook/pagina" }))
            .toContain("facebook/pagina");
    });

    it("il protocollo è tolto dal sito, il resto del valore è intatto", () => {
        const s = finalStrings(SEDE_TEST);
        expect(s).toContain("www.esempio.it");
        expect(s).not.toContain("https://www.esempio.it");
    });

    it("gli orari NON sono resi, anche se popolati nel dato", () => {
        // SEDE_TEST.hours ha 3 righe valorizzate.
        const s = finalStrings(SEDE_TEST);
        expect(s).not.toContain("Orari");
        expect(s).not.toContain("09:00–18:00");
        expect(s).not.toContain("Mar–Gio");
    });

    it("solo contatti: nessuna sezione costi", () => {
        const s = finalStrings({ ...SEDE_TEST, fees: [] });
        expect(s).toContain("Contatti");
        expect(s).not.toContain(FEES_TITLE);
    });

    it("solo fees: nessuna sezione contatti", () => {
        const s = finalStrings({ ...NO_CONTACTS, fees: [{ label: "Coperto", value: "2 €/persona" }] });
        expect(s).toContain(FEES_TITLE);
        expect(s).toContain("Coperto");
        expect(s).not.toContain("Contatti");
    });

    it("né contatti né fees: nessun blocco, pagina come prima dello Step 2", () => {
        const s = finalStrings(NO_CONTACTS);
        expect(s).not.toContain("Contatti");
        expect(s).not.toContain(FEES_TITLE);
        // Il resto della pagina è intatto.
        expect(s).toContain("Allergeni");
        expect(s).toContain(NOTE);
    });

    it("fees non pubbliche (array vuoto dal gate fees_public): niente costi", () => {
        // Il gate vive nel loader: qui arriva già come array vuoto.
        const s = finalStrings({ ...SEDE_TEST, fees: [] });
        expect(s).not.toContain(FEES_TITLE);
        expect(s).not.toContain("Coperto");
    });
});

describe("MenuPdfDocument — pagina finale, wrap granulare della legenda", () => {
    /** N caratteristiche distinte sul prodotto della fixture. */
    function dataWithCharacteristics(count: number): MenuPdfData {
        const data = buildData("Sede", "Indirizzo", SAN_PIETRO);
        data.categories[0].products[0].characteristics = Array.from(
            { length: count },
            (_, i) => ({
                code: `char-${i}`,
                label: `Caratteristica numero ${String(i).padStart(2, "0")}`,
                icon: "custom:organic-leaf"
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

    // Le caratteristiche sono uscite dal PDF: quante ne abbia il catalogo non
    // cambia una virgola della pagina finale. Era il caso che sfondava il
    // bordo pagina (26 e 31 voci); ora semplicemente non esiste.
    for (const count of [26, 31]) {
        it(`${count} caratteristiche assegnate: nessuna finisce nel PDF`, () => {
            const { tree, pages } = renderPages(dataWithCharacteristics(count));
            const final = stringsOf(pages[2]);

            for (let i = 0; i < count; i += 1) {
                expect(final).not.toContain(`Caratteristica numero ${String(i).padStart(2, "0")}`);
            }
            expect(final).not.toContain("Caratteristiche");
            // I 14 allergeni restano al loro posto.
            expect(final).toContain("Latte");
            expect(final).toContain("Molluschi");
            // La nota di rito non si duplica.
            expect(stringsOf(tree).filter(s => s === NOTE)).toHaveLength(1);
        });
    }

    it("il wrap={false} resta a granularità fine, mai sull'intero gruppo", () => {
        // Un blocco indivisibile più alto della pagina verrebbe disegnato oltre
        // il bordo invece di impaginarsi: il wrap sta sul singolo item e su
        // sottotitolo+prima riga, mai sulla sezione.
        const final = renderPages(dataWithCharacteristics(31)).pages[2];
        // 14 allergeni + 1 header di sezione + il blocco contatti/costi
        // (unico e indivisibile, Step 2) = 16.
        expect(countUnwrappableNodes(final)).toBe(14 + 1 + 1);
    });

    it("struttura invariata: spaziatore + nota in fondo", () => {
        const final = renderPages(dataWithCharacteristics(2)).pages[2];
        expect(countElasticSpacers(final)).toBe(3);
        const s = stringsOf(final);
        expect(s).toContain(NOTE);
        expect(s.indexOf("Allergeni")).toBeLessThan(s.indexOf(NOTE));
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
        expect(m).toEqual(["fmt", "fmt", "al"]);
        expect(m.lastIndexOf("fmt")).toBeLessThan(m.indexOf("al"));
    });

    it("multi-formato senza allergeni: nessuna sub-line icone", () => {
        const m = markers(rowData({ formats: FORMATS }));
        expect(m).toEqual(["fmt", "fmt"]);
        expect(m).not.toContain("al");
        expect(m).not.toContain("icon");
    });

    it("prezzo singolo + allergene: nessun formato, sub-line numeri presente", () => {
        const m = markers(rowData({ priceLabel: "€ 10,00", allergens: [MILK] }));
        expect(m).toEqual(["al"]);
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
        expect(markers(data, assets)).toEqual(["fmt", "fmt", "al"]);
    });
});

describe("MenuPdfDocument — allergeni come numeri UE nella riga prodotto", () => {
    const MILK = { code: "milk", label: "Latte", euNumber: 7 };
    const GLUTEN = { code: "gluten", label: "Glutine", euNumber: 1 };
    const SULPHITES = { code: "sulphites", label: "Solfiti", euNumber: 12 };
    const EGGS = { code: "eggs", label: "Uova", euNumber: 3 };
    // Icona risolvibile davvero: characteristicIconGeometry accetta solo il
    // prefisso "custom:" + una chiave di CUSTOM_CHARACTERISTIC_ICON_MAP,
    // altrimenti torna null e la caratteristica non renderizza nulla.
    const VEGAN = { code: "vegan", label: "Vegano", icon: "custom:organic-leaf" };

    function rowData(over: Partial<MenuPdfProduct>): MenuPdfData {
        const data = buildData("Sede", "Indirizzo", SAN_PIETRO);
        data.categories[0].products[0] = {
            ...data.categories[0].products[0],
            name: "Piatto",
            priceLabel: null,
            formats: [],
            allergens: [],
            characteristics: [],
            ...over
        };
        return data;
    }

    /** Sub-line della riga prodotto (productIconsLine): l'unica View marginTop 4. */
    function iconsLine(data: MenuPdfData): El | null {
        const tree = expand(MenuPdfDocument({ data, assets: EMPTY_ASSETS }));
        const pages: El[] = [];
        findPages(tree, pages);
        const found: El[] = [];
        const walk = (node: unknown) => {
            if (Array.isArray(node)) return node.forEach(walk);
            if (!isEl(node)) return;
            const st = node.props?.style;
            if (
                st &&
                typeof st === "object" &&
                !Array.isArray(st) &&
                (st as Record<string, unknown>).marginTop === 4 &&
                (st as Record<string, unknown>).flexDirection === "row"
            ) {
                found.push(node);
            }
            walk(node.props?.children);
        };
        walk(pages[1]);
        return found[0] ?? null;
    }

    /** Icone (Svg) dentro la sub-line. */
    function countIcons(node: unknown): number {
        if (Array.isArray(node)) return node.reduce<number>((n, c) => n + countIcons(c), 0);
        if (!isEl(node)) return 0;
        if (node.type === Svg) return 1;
        return countIcons(node.props?.children);
    }

    it("numeri ordinati crescenti e uniti da ' · '", () => {
        // Volutamente disordinati in ingresso: l'ordinamento è del render.
        const line = iconsLine(rowData({ allergens: [SULPHITES, GLUTEN, MILK, EGGS] }));
        expect(stringsOf(line)).toContain("1 · 3 · 7 · 12");
    });

    it("un solo allergene: numero secco, nessun separatore di lista", () => {
        expect(stringsOf(iconsLine(rowData({ allergens: [MILK] })))).toContain("7");
    });

    // Le caratteristiche non entrano nel PDF: né icone, né barra separatrice.
    it("allergeni + caratteristiche: solo i numeri, nessuna icona", () => {
        const line = iconsLine(rowData({ allergens: [MILK], characteristics: [VEGAN] }));
        expect(stringsOf(line)).toEqual(["7"]);
        expect(countIcons(line)).toBe(0);
    });

    it("solo caratteristiche: nessuna sub-line", () => {
        expect(iconsLine(rowData({ characteristics: [VEGAN] }))).toBeNull();
    });

    it("né allergeni né caratteristiche: nessuna sub-line", () => {
        expect(iconsLine(rowData({}))).toBeNull();
    });
});

describe("MenuPdfDocument — pagina finale, respiro distribuito", () => {
    function finalPage(coverage?: MenuPdfAllergenCoverage): El {
        return renderPages(buildData("Sede", "Indirizzo", SEDE_TEST, coverage)).pages[2];
    }

    // 1 : 2 : 1.5 — testata→legenda, legenda→contatti, contatti→nota. Lo stacco
    // fra blocchi di natura diversa pesa più di quello dentro un discorso solo.
    it("tre spaziatori elastici in rapporto 1 : 2 : 1.5", () => {
        expect(elasticSpacerWeights(finalPage())).toEqual([1, 2, 1.5]);
    });

    it("stessa distribuzione nei tre casi di copertura", () => {
        const cases: MenuPdfAllergenCoverage[] = [
            { productsTotal: 12, productsWithAllergens: 0 },
            { productsTotal: 10, productsWithAllergens: 3 },
            { productsTotal: 10, productsWithAllergens: 8 }
        ];
        for (const coverage of cases) {
            expect(elasticSpacerWeights(finalPage(coverage))).toEqual([1, 2, 1.5]);
        }
    });

    // Il difetto già corretto una volta: un blocco indivisibile più alto della
    // pagina viene disegnato oltre il bordo invece di impaginarsi.
    it("nessun wrap={false} sulla Page né su un contenitore dell'intera legenda", () => {
        const page = finalPage();
        expect(page.props?.wrap).not.toBe(false);

        // Quanti nomi di allergene stanno sotto un nodo indivisibile: il wrap
        // fine-grained ne racchiude al massimo LEGEND_COLUMNS (sottotitolo +
        // prima riga). Di più = un contenitore dell'intero gruppo.
        const LABELS = new Set(ALL_ALLERGENS.map(a => a.label));
        const worst = (node: unknown): number => {
            if (Array.isArray(node)) return Math.max(0, ...node.map(worst));
            if (!isEl(node)) return 0;
            const deeper = worst(node.props?.children);
            if (node.props?.wrap !== false) return deeper;
            const own = stringsOf(node).filter(t => LABELS.has(t)).length;
            return Math.max(own, deeper);
        };
        expect(worst(page)).toBeLessThanOrEqual(2);
    });
});

describe("MenuPdfDocument — pagina finale come legenda dei numeri", () => {
    function finalPage(coverage?: MenuPdfAllergenCoverage): El {
        return renderPages(buildData("Sede", "Indirizzo", SAN_PIETRO, coverage)).pages[2];
    }

    it("tutti e 14 gli allergeni con il proprio numero UE", () => {
        const s = stringsOf(finalPage());
        for (const allergen of ALL_ALLERGENS) {
            expect(s).toContain(allergen.label);
            expect(s).toContain(String(allergen.euNumber));
        }
    });

    // La legenda spiega i numeri, non dichiara cosa il locale serve: nessuna
    // differenza di peso fra allergeni presenti nel menù (Latte) e assenti.
    it("nessuna dicotomia presente/attenuato: label e icone tutte allo stesso peso", () => {
        const styleKeys = (node: unknown, acc: Set<string>): Set<string> => {
            if (Array.isArray(node)) {
                node.forEach(n => styleKeys(n, acc));
                return acc;
            }
            if (!isEl(node)) return acc;
            const st = node.props?.style;
            if (st && typeof st === "object" && !Array.isArray(st)) {
                const rec = st as Record<string, unknown>;
                if (rec.fontSize === 11.5 && rec.marginLeft === 10) {
                    acc.add(String(rec.color));
                }
            }
            styleKeys(node.props?.children, acc);
            return acc;
        };
        // Un solo colore label su tutta la pagina finale: niente muted/ink misti.
        expect(styleKeys(finalPage(), new Set<string>()).size).toBe(1);
    });
});
