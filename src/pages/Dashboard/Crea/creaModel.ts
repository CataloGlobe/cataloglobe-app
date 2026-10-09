// I tunnel di creazione (artifact «Tunnel di creazione», D124: dentro l'app
// come «Aggiungi» del Calendario, il «Quando» comincia con una domanda, a
// destra la settimana, quattro scelte per l'aspetto dello stile).
//
// Qui solo i dati del tunnel, i passi e le frasi: niente React, niente database.
// Il Quando e il Dove usano il tempo e le sedi del Calendario (`CalWhen`,
// `CalWhere`), così la regola si salva con le sue funzioni.
//
// Il database di oggi (D122 → A, ripresa da D124 per la storia): il multi menù
// non c'è, una sola fascia oraria e mai dopo mezzanotte; la storia va in tutte
// le sedi o in una, sempre. Quelle parti ci sono già, spente.
import type { StoryBlock } from "@/services/supabase/stories";
import type { FeaturedContentType } from "@/services/supabase/featuredContents";
import type { FontFamily } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { DB_LATER, NEW_MODEL, daysLong, elides, listIt, mShort, perGroups, perText, whereFor, whereText, type Draft, type DraftLookups } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { durLabel, hhmm, type CalWhen, type CalWhere } from "@/pages/Dashboard/Programming/calendar/calendarModel";

export type CreaKind = "menu" | "stile" | "evid" | "storia";
export const CREA_KINDS: readonly CreaKind[] = ["menu", "stile", "evid", "storia"];

/** Le storie col quando e con più sedi (D124 4 → A) aspettano la voce 1 di Lorenzo. */
export const STORIA_WHEN = false;

/** L'indirizzo: /crea/menu, /crea/stile, /crea/evidenza, /crea/storia. */
export const SLUG: Record<CreaKind, string> = { menu: "menu", stile: "stile", evid: "evidenza", storia: "storia" };
export const kindOfSlug = (s: string | undefined): CreaKind | null => CREA_KINDS.find(k => SLUG[k] === s) ?? null;

export const KIND: Record<CreaKind, { t: string; page: string; list: string; pub: string; noun: string }> = {
    menu: { t: "Nuovo menù", page: "Menù", list: "catalogs", pub: "Metti in onda", noun: "menù" },
    stile: { t: "Nuovo stile", page: "Stili", list: "styles", pub: "Metti in onda", noun: "stile" },
    evid: { t: "Nuovo contenuto in evidenza", page: "In evidenza", list: "featured", pub: "Pubblica", noun: "contenuto" },
    storia: { t: "Nuova storia", page: "Storie", list: "stories", pub: "Pubblica", noun: "storia" }
};

export type EvType = "annuncio" | "evento" | "promo" | "bundle";
export const EV: Record<EvType, { name: string; desc: string; type: FeaturedContentType; ex: [string, string] }> = {
    annuncio: { name: "Annuncio", desc: "Una notizia: «Chiusi il 25 dicembre».", type: "announcement", ex: ["Chiusi il 25 dicembre", "Ci vediamo il 26, a pranzo."] },
    evento: { name: "Evento", desc: "Una serata con data: «Jazz giovedì alle 21».", type: "event", ex: ["Jazz giovedì alle 21", "Trio dal vivo, prenota il tavolo."] },
    promo: { name: "Promo", desc: "Alcuni piatti col loro prezzo, ognuno con una nota: «-20% a pranzo».", type: "promo", ex: ["Pranzo veloce", "Due piatti, serviti in dieci minuti."] },
    bundle: { name: "Bundle", desc: "Più piatti insieme a un prezzo unico.", type: "bundle", ex: ["Menù degustazione", "Cinque portate, solo a cena."] }
};

/** I colori veloci dell'aspetto; gli altri nell'editor dello stile. */
export const COLORS: readonly [string, string][] = [
    ["#be123c", "Rosso"],
    ["#5f7a61", "Salvia"],
    ["#1d4ed8", "Blu"],
    ["#7c3aed", "Viola"],
    ["#b45309", "Ambra"],
    ["#0f172a", "Notte"]
];
/** I nove caratteri dell'editor; nell'aspetto se ne vedono tre, gli altri nell'editor. */
export const FONTS: Record<FontFamily, { name: string; css: string }> = {
    inter: { name: "Inter", css: '"Inter", system-ui, sans-serif' },
    poppins: { name: "Poppins", css: '"Poppins", system-ui, sans-serif' },
    montserrat: { name: "Montserrat", css: '"Montserrat", system-ui, sans-serif' },
    "josefin-sans": { name: "Josefin Sans", css: '"Josefin Sans", system-ui, sans-serif' },
    raleway: { name: "Raleway", css: '"Raleway", system-ui, sans-serif' },
    spectral: { name: "Spectral", css: '"Spectral", Georgia, serif' },
    lora: { name: "Lora", css: '"Lora", Georgia, serif' },
    "eb-garamond": { name: "EB Garamond", css: '"EB Garamond", Georgia, serif' },
    "patrick-hand": { name: "Patrick Hand", css: '"Patrick Hand", "Segoe Print", cursive' }
};
export const FONT_QUICK: readonly FontFamily[] = ["inter", "lora", "patrick-hand"];
export type CardKey = "foto" | "lista" | "compatti";
export const CARDS: Record<CardKey, string> = { foto: "Card con la foto", lista: "Card senza foto", compatti: "Compatti" };

export type Dish = { key: string; productId: string | null; name: string; price: number | null };
export type Section = { key: string; name: string; dishes: Dish[] };

/** Quello che arriva da «E adesso?»: il menù appena messo in onda. */
export type FromMenu = {
    name: string;
    catalogId: string;
    /** La regola del menù: uno stile col suo stesso quando e dove ci va dentro. */
    ruleId: string | null;
    /** I piatti del menù, per la promo e il bundle. */
    productIds: string[];
    when: CalWhen;
    where: CalWhere;
    /** Le ore per sede del menù, se le sedi non avevano le stesse ore (D145). */
    per: Draft["per"];
};

export type Tunnel = {
    kind: CreaKind;
    i: number;
    seen: number;
    // il menù
    menuType: "classico" | "multi" | null;
    /** Si accavalla con un altro menù: true = «Mettili insieme» (D135). */
    insieme?: boolean;
    name: string;
    source: "zero" | "foto";
    /** Il menù creato dall'import con l'AI: si salva lui, non uno nuovo. */
    importedId: string | null;
    sections: Section[];
    // lo stile
    base: "zero" | "copy";
    baseStyleId: string | null;
    color: string | null;
    dark: boolean;
    font: FontFamily;
    card: CardKey;
    // in evidenza
    evType: EvType | null;
    title: string;
    sub: string;
    inner: string;
    text: string;
    image: File | null;
    cta: boolean;
    ctaText: string;
    ctaLink: string;
    slot: "before" | "after";
    dishes: string[];
    notes: Record<string, string>;
    bundle: string;
    showOrig: boolean;
    // la storia
    kicker: string;
    cover: File | null;
    linked: string;
    blocks: StoryBlock[];
    // quando e dove
    qmode: "sempre" | "momenti";
    when: CalWhen;
    where: CalWhere;
    /** Le ore per sede, quando le sedi non hanno le stesse ore (D145, F1); null = le stesse. */
    per: Draft["per"];
    from: FromMenu | null;
    /** Aperto da «Crea un menù nuovo» del Calendario con la bozza messa da parte: quando e dove vengono da lì. */
    aside: boolean;
};

let seq = 0;
export const key = () => "k" + ++seq;

export function newTunnel(kind: CreaKind, where: CalWhere, from: FromMenu | null = null): Tunnel {
    const w = from ? from.where : where;
    return {
        kind,
        i: 0,
        seen: 0,
        menuType: null,
        name: "",
        source: "zero",
        importedId: null,
        sections: [],
        base: "zero",
        baseStyleId: null,
        color: null,
        dark: false,
        font: "inter",
        card: "foto",
        evType: null,
        title: "",
        sub: "",
        inner: "",
        text: "",
        image: null,
        cta: false,
        ctaText: "Prenota",
        ctaLink: "",
        slot: "before",
        dishes: [],
        notes: {},
        bundle: "",
        showOrig: true,
        kicker: "",
        cover: null,
        linked: "",
        blocks: [],
        qmode: from && (from.when.period || from.when.days || from.when.ranges) ? "momenti" : "sempre",
        when: from ? cloneWhen(from.when) : {},
        where: { all: w.all, activityIds: [...w.activityIds], groupIds: [...w.groupIds] },
        per: clonePer(from?.per ?? null),
        from,
        aside: false
    };
}

/** Il tunnel aperto dal Calendario parte dal quando e dal dove della bozza messa da parte. */
export function withAside(t: Tunnel, a: { when: CalWhen; where: CalWhere; per?: Draft["per"] }): Tunnel {
    const some = !!(a.when.period || a.when.days || a.when.ranges);
    return {
        ...t,
        qmode: some ? "momenti" : "sempre",
        when: some ? cloneWhen(a.when) : {},
        where: { all: a.where.all, activityIds: [...a.where.activityIds], groupIds: [...a.where.groupIds] },
        per: clonePer(a.per ?? null),
        aside: true
    };
}

export const clonePer = (per: Draft["per"]): Draft["per"] => (per ? Object.fromEntries(Object.entries(per).map(([id, w]) => [id, cloneWhen(w)])) : null);

export const cloneWhen = (w: CalWhen): CalWhen => ({
    ...(w.period ? { period: { ...w.period } } : {}),
    ...(w.days ? { days: [...w.days] } : {}),
    ...(w.ranges ? { ranges: w.ranges.map(r => [r[0], r[1]] as [number, number]) } : {})
});

/* ---------- i passi ---------- */

export type StepId =
    | "tipo"
    | "parti"
    | "sezioni"
    | "serve"
    | "nome"
    | "aspetto"
    | "cosa"
    | "contenuto"
    | "piatti"
    | "racconto"
    | "blocchi"
    | "quando"
    | "dove"
    | "controlla";

export const STEP_LABEL: Record<StepId, string> = {
    tipo: "Che menù è",
    parti: "Da dove parti",
    sezioni: "Sezioni e piatti",
    serve: "A cosa serve",
    nome: "Il nome",
    aspetto: "L'aspetto",
    cosa: "Che cosa",
    contenuto: "Il contenuto",
    piatti: "Piatti",
    racconto: "Il racconto",
    blocchi: "I blocchi",
    quando: "Quando",
    dove: "Dove e quando",
    controlla: "Controlla"
};

/** Chi crea e dove: `owner` gestisce il Calendario (Dove e quando), `multi` ha più sedi. */
export type Ctx = { owner: boolean; multi: boolean };

export function steps(t: Tunnel, c: Ctx): StepId[] {
    const content: StepId[] =
        t.kind === "menu"
            ? ["tipo", "parti", "sezioni"]
            : t.kind === "stile"
              ? ["serve", "nome", "aspetto"]
              : t.kind === "evid"
                ? ["cosa", "contenuto", ...(t.evType === "promo" || t.evType === "bundle" ? (["piatti"] as StepId[]) : [])]
                : ["serve", "racconto", "blocchi"];
    // con più sedi un passo solo, «Dove e quando» (D145); con una, il Quando
    const when: StepId[] = c.owner ? [c.multi ? "dove" : "quando"] : [];
    return [...content, ...when, "controlla"];
}

const price = (s: string) => parseFloat(s.replace(",", "."));
const hasDish = (t: Tunnel) => t.sections.some(s => s.dishes.length > 0);

/** Il tempo che il database di oggi non lascerebbe passare. */
export function whenProblem(w: CalWhen): string {
    if (w.period && w.period.to < w.period.from) return "La fine del periodo viene prima dell'inizio";
    if (w.days && !w.days.length) return "Scegli almeno un giorno";
    const rs = w.ranges;
    if (rs && rs.some(([a, b]) => b <= a)) return "Una fascia finisce prima di cominciare";
    if (rs && !NEW_MODEL.overnight && rs.some(([, b]) => b > 1440)) return "Dopo mezzanotte " + DB_LATER;
    if (rs && !NEW_MODEL.multiRange && rs.length > 1) return "Più fasce " + DB_LATER;
    return "";
}

/** Il quando che conta: «Sempre» non guarda il modulo, anche se è stato toccato. */
export const effWhen = (t: Tunnel): CalWhen => (t.qmode === "sempre" ? {} : t.when);

/** Cosa manca per andare avanti da questo passo; "" se niente. */
export function blocker(t: Tunnel, step: StepId, c: Ctx): string {
    switch (step) {
        case "tipo":
            return t.menuType ? "" : "Scegli che menù è";
        case "parti":
            if (!t.name.trim()) return "Manca il nome del menù";
            return t.source === "foto" && !t.importedId ? "Carica la foto o il PDF del menù" : "";
        case "sezioni":
            return hasDish(t) ? "" : "Aggiungi almeno un piatto";
        case "nome":
            if (!t.name.trim()) return "Manca il nome dello stile";
            return t.base === "copy" && !t.baseStyleId ? "Scegli lo stile da cui partire" : "";
        case "aspetto":
            return t.color ? "" : "Scegli un colore";
        case "cosa":
            return t.evType ? "" : "Scegli cosa mettere in evidenza";
        case "contenuto":
            if (t.cta && t.ctaLink.trim() && !/^https:\/\//.test(t.ctaLink.trim())) return "Il link del bottone deve cominciare con https://";
            if (t.cta && !t.ctaText.trim()) return "Manca il testo del bottone";
            return t.title.trim() ? "" : "Manca il titolo";
        case "piatti":
            if (!t.dishes.length) return "Aggiungi almeno un piatto";
            return t.evType === "bundle" && !(price(t.bundle) > 0) ? "Manca il prezzo del bundle" : "";
        case "racconto":
            return t.title.trim() ? "" : "Manca il titolo";
        case "quando":
            return whenProblem(effWhen(t));
        case "dove":
            if (!c.multi) return "";
            if (!t.where.all && !t.where.activityIds.length && !t.where.groupIds.length) return "Scegli almeno una sede";
            if (t.kind === "storia" && !STORIA_WHEN && !t.where.all && (t.where.groupIds.length || t.where.activityIds.length > 1))
                return "Una storia in più sedi " + DB_LATER;
            for (const w of t.per ? Object.values(t.per) : [effWhen(t)]) {
                const why = whenProblem(w);
                if (why) return why;
            }
            return "";
        default:
            return "";
    }
}

/** Il primo passo con qualcosa che manca, prima di «Controlla». */
export function firstBlock(t: Tunnel, c: Ctx): { i: number; why: string } | null {
    const st = steps(t, c);
    for (let i = 0; i < st.length - 1; i++) {
        const why = blocker(t, st[i], c);
        if (why) return { i, why };
    }
    return null;
}

/** C'è qualcosa da perdere uscendo. */
export const isDirty = (t: Tunnel) =>
    t.i > 0 || !!t.name.trim() || !!t.title.trim() || !!t.menuType || !!t.evType || t.sections.length > 0 || !!t.importedId;

/* ---------- le frasi ---------- */

export function thingName(t: Tunnel): string {
    if (t.kind === "evid" || t.kind === "storia") return t.title.trim() || "Senza titolo";
    return t.name.trim() || (t.kind === "menu" ? "Menù senza nome" : "Stile senza nome");
}

/** «Nuovo menù · Pranzo»: il titolo del tunnel. */
export function tunnelTitle(t: Tunnel): string {
    const n = (t.kind === "evid" || t.kind === "storia" ? t.title : t.name).trim();
    return KIND[t.kind].t + (n ? " · " + n : "");
}

const q = (s: string) => "«" + s + "»";

function what(t: Tunnel): string {
    const n = thingName(t);
    if (t.kind === "menu") return t.insieme ? `${q(n)} si aggiunge agli altri menù` : `${q(n)} prende il posto degli altri menù`;
    if (t.kind === "stile") return `la pagina prende lo stile ${q(n)}`;
    if (t.kind === "evid") return `${q(n)} va in evidenza, ${t.slot === "before" ? "sopra" : "sotto"} il menù`;
    return `la storia ${q(n)} compare sotto il menù`;
}

/** «In una frase»: quando, dove e cosa succede. */
export function sentence(t: Tunnel, L: DraftLookups): string {
    if (t.per) return perGroups(t.per).map(g => whenWords(g.when) + ", " + whereFor({ all: false, activityIds: g.ids, groupIds: [] }, L)).join("; ") + ": " + what(t) + ".";
    return whenWords(effWhen(t)) + (L.multi ? ", " + whereFor(t.where, L) : "") + ": " + what(t) + ".";
}

function whenWords(w: CalWhen): string {
    const p = [
        w.period
            ? (elides(w.period.from) ? "Dall'" : "Dal ") + mShort(w.period.from) + (elides(w.period.to) ? " all'" : " al ") + mShort(w.period.to)
            : w.days || w.ranges
              ? "Ogni settimana"
              : "Da subito, sempre"
    ];
    if (w.days) p.push(daysLong(w.days));
    if (w.ranges) p.push(listIt(w.ranges.map(([a, b]) => "dalle " + hhmm(a) + " alle " + hhmm(b))));
    return p.join(", ");
}

const eur = (v: number) => v.toFixed(2).replace(".", ",") + " €";
const BLOCK_NAME: Record<StoryBlock["type"], [string, string]> = {
    text: ["blocco di testo", "blocchi di testo"],
    heading: ["titolo", "titoli"],
    quote: ["citazione", "citazioni"],
    list: ["elenco", "elenchi"],
    image: ["immagine", "immagini"],
    video: ["video", "video"],
    product: ["prodotto", "prodotti"]
};

/** La riga di «Le tue scelte» per un passo. */
export function stepSummary(t: Tunnel, s: StepId, L: DraftLookups, styleName: (id: string) => string): string {
    const product = (id: string) => L.products.get(id)?.name ?? "Prodotto";
    switch (s) {
        case "tipo":
            return t.menuType === "multi" ? "Multi menù" : "Menù classico";
        case "parti":
            return `${t.name.trim()} · ${t.source === "foto" ? "da una foto o un PDF" : "da zero"}`;
        case "sezioni":
            return t.sections.map(x => `${x.name} (${x.dishes.length})`).join(", ") || "—";
        case "nome":
            return t.name.trim() + (t.base === "copy" && t.baseStyleId ? ` · copia di ${styleName(t.baseStyleId)}` : "");
        case "aspetto":
            return [
                COLORS.find(c => c[0] === t.color)?.[1] ?? "—",
                "sfondo " + (t.dark ? "scuro" : "chiaro"),
                FONTS[t.font].name,
                CARDS[t.card].toLowerCase()
            ].join(" · ");
        case "cosa":
            return t.evType ? EV[t.evType].name : "—";
        case "contenuto":
            return `${t.title.trim()} · ${t.slot === "before" ? "sopra" : "sotto"} il menù${t.cta ? ` · bottone «${t.ctaText.trim()}»` : ""}`;
        case "piatti":
            return t.evType === "bundle"
                ? `${t.dishes.map(product).join(", ")} · ${t.bundle.trim()} €${t.showOrig ? " · totale originale barrato" : ""}`
                : t.dishes.map(d => product(d) + (t.notes[d]?.trim() ? ` (${t.notes[d].trim()})` : "")).join(", ");
        case "racconto":
            return [t.kicker.trim(), t.title.trim()].filter(Boolean).join(" · ") + (t.cover ? " · con copertina" : "") + (t.linked ? ` · anche in ${product(t.linked)}` : "");
        case "blocchi": {
            if (!t.blocks.length) return "Nessun blocco";
            const n = new Map<StoryBlock["type"], number>();
            for (const b of t.blocks) n.set(b.type, (n.get(b.type) ?? 0) + 1);
            return [...n].map(([k, c]) => `${c} ${BLOCK_NAME[k][c === 1 ? 0 : 1]}`).join(", ");
        }
        case "quando":
            return durLabel(effWhen(t));
        case "dove":
            return t.per ? perText(t.per, L) : whereText(t.where, L) + " · " + durLabel(effWhen(t));
        default:
            return "";
    }
}

/** Il totale dei piatti di un bundle, a listino. */
export function bundleTotal(t: Tunnel, L: DraftLookups): number {
    return t.dishes.reduce((a, d) => a + (L.products.get(d)?.listPrice ?? 0), 0);
}
export const bundlePrice = (t: Tunnel) => price(t.bundle);
export { eur as euro };

/** Il prezzo di un piatto nel tunnel, o una lineetta se non c'è. */
export const priceText = (p: number | null) => (p == null ? "—" : eur(p));

/* ---------- la card sopra il telefono ---------- */

/** La card fissa sopra il telefono: cosa si guarda, in due righe. */
export function qcardText(t: Tunnel, step: StepId, L: DraftLookups, baseName: string | null): [string, string] {
    switch (step) {
        case "tipo":
            return t.menuType === "classico" ? ["Menù classico", "Sezioni e piatti, uno sotto l'altro."] : ["Il menù", "Tocca una scelta: qui vedi com'è."];
        case "parti":
            return [t.name.trim() || "Il nome del menù", "Il cliente lo legge in cima, sopra le sezioni."];
        case "sezioni":
            return ["Sezioni e piatti", "Nello stesso ordine in cui li metti qui."];
        case "serve":
            return t.kind === "stile" ? [baseName ? `Lo stile «${baseName}»` : "Lo stile", "I colori e i caratteri di tutta la pagina."] : ["Le storie", "Sotto il menù, con testo e foto."];
        case "nome":
            return [t.name.trim() || "Lo stile nuovo", t.base === "copy" && baseName ? `Parte da «${baseName}».` : "Parte dai colori di CataloGlobe."];
        case "aspetto":
            return ["L'aspetto", "Su tutta la pagina, con ogni menù."];
        case "cosa":
            return [t.evType ? EV[t.evType].name : "In evidenza", "In cima al menù o in fondo, a colpo d'occhio."];
        case "contenuto":
            return [t.title.trim() || "Il titolo", t.slot === "before" ? "Sopra il menù, appena sotto il nome." : "Sotto il menù, in fondo alla pagina."];
        case "piatti":
            return ["I piatti", t.evType === "promo" ? "Ognuno col suo prezzo e la sua nota." : "Tutti insieme, a un prezzo unico."];
        case "racconto":
            return [t.title.trim() || "Il titolo", "Così si presenta nell'elenco delle storie."];
        case "blocchi":
            return ["La storia aperta", "Si legge toccando la storia."];
        case "controlla":
            return ["Così lo vede il cliente", "Dal momento in cui va in onda."];
        default:
            if (t.per) return ["Ore diverse per sede", perText(t.per, L)];
            return [durLabel(effWhen(t)), L.multi ? whereText(t.where, L) : "Si cambia quando vuoi dal Calendario."];
    }
}
