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
import type { PickProduct } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { AiMenuCategory } from "@/pages/Dashboard/Catalogs/AiMenuImport/analyzeMenu";
import { computeProductMatch } from "@/utils/importMatching";
import { allDishes, total } from "./menuTree";

export type CreaKind = "menu" | "stile" | "evid" | "storia";
export const CREA_KINDS: readonly CreaKind[] = ["menu", "stile", "evid", "storia"];

/** Le storie col quando e con più sedi (D124 4 → A) aspettano la voce 1 di Lorenzo. */
export const STORIA_WHEN = false;

/** L'indirizzo: /crea/menu, /crea/stile, /crea/evidenza, /crea/storia. */
export const SLUG: Record<CreaKind, string> = { menu: "menu", stile: "stile", evid: "evidenza", storia: "storia" };
export const kindOfSlug = (s: string | undefined): CreaKind | null => CREA_KINDS.find(k => SLUG[k] === s) ?? null;

export const KIND: Record<CreaKind, { t: string; edit: string; page: string; list: string; pub: string; noun: string }> = {
    menu: { t: "Nuovo menù", edit: "Modifica il menù", page: "Menù", list: "catalogs", pub: "Metti in onda", noun: "menù" },
    stile: { t: "Nuovo stile", edit: "Modifica lo stile", page: "Stili", list: "styles", pub: "Metti in onda", noun: "stile" },
    evid: { t: "Nuovo contenuto in evidenza", edit: "Modifica il contenuto in evidenza", page: "In evidenza", list: "featured", pub: "Pubblica", noun: "contenuto" },
    storia: { t: "Nuova storia", edit: "Modifica la storia", page: "Storie", list: "stories", pub: "Pubblica", noun: "storia" }
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

export type Dish = {
    key: string;
    productId: string | null;
    name: string;
    price: number | null;
    /** Letti dalla foto (D172): la descrizione e i formati vanno nel prodotto nuovo. */
    description?: string | null;
    formats?: { name: string; price: number | null }[];
    /** Arrivato con l'ultimo import (D180): si vede «importato» finché non si salva. */
    imp?: boolean;
    /** Modificando (D140): il piatto è già nel menù, con questa riga e questo posto. */
    linkId?: string;
    sort?: number;
    /** La riga è una variante: questo è il suo prodotto. */
    parentId?: string;
};
/** `id`: la sezione c'è già nel menù che si modifica (D140). */
export type Section = {
    key: string;
    id?: string;
    sort?: number;
    name: string;
    dishes: Dish[];
    /** Le sottocategorie (D177): fino a tre livelli in tutto, come nel database. */
    subs: Section[];
};

/**
 * Modificare una cosa già creata (D140): lo stesso tunnel, con un passo 0
 * «Cosa vuoi modificare?». Si salva solo quello che è cambiato da `orig`.
 */
export type Edit = {
    id: string;
    /** I passi scelti nel passo 0: gli altri restano grigi, ma ci si può andare. */
    picked: StepId[];
    /** Aperto dal clic sulla riga, senza passare dal passo 0: finché non scegli niente ti muovi un passo alla volta. */
    free?: boolean;
    /** Com'era la cosa aprendo il tunnel. */
    orig: Tunnel;
    /** La regola del Calendario che la mette in onda, se è una sola: il «Dove e quando» cambia quella. */
    ruleId: string | null;
    /** In quante regole del Calendario compare. */
    rules: number;
};

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
    /** Un import fermo sul resoconto (D180): finché non lo aggiungi o lo butti via non si va avanti. */
    impOpen?: boolean;
    /** L'ultimo import aggiunto, per «Annulla l'import»: le chiavi dei piatti e delle categorie nati con lui. */
    lastImport: { file: string; dishes: string[]; secs: string[] } | null;
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
    /** La foto che c'è già, modificando; null se non c'è o se è stata tolta. */
    imageUrl: string | null;
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
    coverUrl: string | null;
    linked: string;
    blocks: StoryBlock[];
    /** I blocchi immagine con una foto nuova da caricare (i file stanno fuori dal modello). */
    pending: string[];
    // quando e dove
    qmode: "sempre" | "momenti";
    when: CalWhen;
    where: CalWhere;
    /** Le ore per sede, quando le sedi non hanno le stesse ore (D145, F1); null = le stesse. */
    per: Draft["per"];
    from: FromMenu | null;
    /** Aperto da «Crea un menù nuovo» del Calendario con la bozza messa da parte: quando e dove vengono da lì. */
    aside: boolean;
    edit: Edit | null;
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
        lastImport: null,
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
        imageUrl: null,
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
        coverUrl: null,
        linked: "",
        blocks: [],
        pending: [],
        qmode: from && (from.when.period || from.when.days || from.when.ranges) ? "momenti" : "sempre",
        when: from ? cloneWhen(from.when) : {},
        where: { all: w.all, activityIds: [...w.activityIds], groupIds: [...w.groupIds] },
        per: clonePer(from?.per ?? null),
        from,
        aside: false,
        edit: null
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
    | "modifica"
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
    modifica: "Cosa vuoi modificare?",
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

/** Il nome del passo: modificando un menù «Da dove parti» è solo il nome. */
export const stepLabel = (t: Tunnel, s: StepId): string => (t.edit && s === "parti" ? "Il nome" : STEP_LABEL[s]);

export function steps(t: Tunnel, c: Ctx): StepId[] {
    if (t.edit) return editSteps(t, c);
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
const hasDish = (t: Tunnel) => allDishes(t.sections).length > 0;

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
        case "modifica":
            return t.edit && (t.edit.picked.length || changedSteps(t, c).length) ? "" : "Scegli almeno una cosa";
        case "tipo":
            return t.menuType ? "" : "Scegli che menù è";
        case "parti":
            return t.name.trim() ? "" : "Manca il nome del menù";
        case "sezioni":
            return t.impOpen ? "Hai un import aperto: aggiungilo o buttalo via" : hasDish(t) ? "" : "Aggiungi almeno un piatto";
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
        // modificando conta solo quello che si è cambiato: il resto era già così
        if (t.edit && !changed(t, st[i])) continue;
        const why = blocker(t, st[i], c);
        if (why) return { i, why };
    }
    return null;
}

/** Le foto o i PDF che l'AI legge insieme, come nel drawer dell'import. */
export const MAX_IMPORT_FILES = 5;

/** Un piatto letto dalla foto o dal PDF, prima che entri nel menù (D180). */
export type Read = {
    key: string;
    /** La categoria dove l'AI l'ha trovato, dall'alto in basso. */
    path: string[];
    name: string;
    price: number | null;
    /** È già fra i vostri prodotti: si collega a lui, col suo prezzo. */
    productId: string | null;
    description: string | null;
    formats?: { name: string; price: number | null }[];
    /** Perché è «da controllare»; null se l'AI ne era sicura. */
    why: string | null;
};

/**
 * I piatti letti dall'AI (D172, D180). Un piatto col nome di un solo prodotto
 * vostro si collega a lui, col suo prezzo; con più prodotti dello stesso nome,
 * senza prezzo, o se l'AI non ne era sicura, è «da controllare». L'AI scrive le
 * sottocategorie nel nome («Primi — Di terra»): qui tornano una strada.
 */
export function readFromAi(categories: readonly AiMenuCategory[], pick: readonly PickProduct[]): Read[] {
    const tenant = pick.map(p => ({ id: p.id, name: p.name }));
    return categories.flatMap(c => {
        const path = c.name
            .split(/\s+[—–›>]\s+/)
            .map(x => x.trim())
            .filter(Boolean);
        return c.items.map(it => {
            const m = computeProductMatch(it.name, { existingInCategory: [], existingInTenant: tenant });
            const mine = m.status === "reusable_single" ? pick.find(p => p.id === m.productId) ?? null : null;
            const formats = !mine && it.product_type === "formats" && it.formats?.length ? it.formats.map(f => ({ name: f.name, price: f.price })) : undefined;
            const prices = (formats ?? []).map(f => f.price).filter((v): v is number => v !== null);
            const price = mine ? mine.listPrice : formats ? (prices.length ? Math.min(...prices) : null) : it.base_price;
            return {
                key: key(),
                path: path.length ? path : ["Piatti"],
                name: mine?.name ?? it.name.trim(),
                price,
                productId: mine?.id ?? null,
                description: mine ? null : it.description,
                formats,
                why: !(price !== null && price > 0) ? "il prezzo non si leggeva" : m.status === "reusable_ambiguous" ? "somiglia a più prodotti vostri" : it.confidence !== "high" ? "l'AI non ne era sicura" : null
            };
        });
    });
}

/** C'è qualcosa da perdere uscendo. */
export const isDirty = (t: Tunnel) =>
    !!t.impOpen || (t.edit ? EDIT_PARTS.some(s => changed(t, s)) :
    t.i > 0 || !!t.name.trim() || !!t.title.trim() || !!t.menuType || !!t.evType || t.sections.length > 0);

/* ---------- modificare (D140) ---------- */

/** I passi che cambiano la cosa, in ordine: il passo 0 e «Controlla» stanno attorno. */
const EDIT_PARTS: readonly StepId[] = ["parti", "sezioni", "nome", "aspetto", "contenuto", "piatti", "racconto", "blocchi", "quando", "dove"];

function editSteps(t: Tunnel, c: Ctx): StepId[] {
    const content: StepId[] =
        t.kind === "menu"
            ? ["parti", "sezioni"]
            : t.kind === "stile"
              ? ["nome", "aspetto"]
              : t.kind === "evid"
                ? ["contenuto", ...(t.evType === "promo" || t.evType === "bundle" ? (["piatti"] as StepId[]) : [])]
                : ["racconto", "blocchi"];
    // il «Dove e quando» cambia la sua regola del Calendario: c'è solo se è una (la storia non ha regole)
    const one = t.kind === "storia" ? c.multi : !!t.edit?.ruleId;
    const when: StepId[] = c.owner && one ? [c.multi ? "dove" : "quando"] : [];
    return ["modifica", ...content, ...when, "controlla"];
}

const sorted = (x: readonly string[]) => [...x].sort();

/** Categorie e piatti con nomi, ordine e posto: basta spostarne uno perché il passo sia cambiato. */
const secPart = (list: readonly Section[]): unknown =>
    list.map(x => [x.id ?? x.key, x.name.trim(), x.dishes.map(d => d.linkId ?? [d.key, d.productId, d.name.trim(), d.price, d.formats ?? null]), secPart(x.subs)]);

/** Quello che un passo decide, da confrontare con com'era. */
function partOf(t: Tunnel, s: StepId): unknown {
    switch (s) {
        case "parti":
        case "nome":
            return t.name.trim();
        case "sezioni":
            return secPart(t.sections);
        case "aspetto":
            return [t.color, t.dark, t.font, t.card];
        case "contenuto":
            return [t.title.trim(), t.sub.trim(), t.inner.trim(), t.text.trim(), !!t.image, t.imageUrl, t.cta && [t.ctaText.trim(), t.ctaLink.trim()], t.slot];
        case "piatti":
            return [t.dishes, t.evType === "bundle" ? [t.bundle.trim(), t.showOrig] : t.dishes.map(d => t.notes[d]?.trim() ?? "")];
        case "racconto":
            return [t.kicker.trim(), t.title.trim(), !!t.cover, t.coverUrl, t.linked];
        case "blocchi":
            return [t.blocks, t.pending];
        case "quando":
        case "dove":
            return [cloneWhen(effWhen(t)), t.where.all, sorted(t.where.activityIds), sorted(t.where.groupIds), t.per];
        default:
            return null;
    }
}

/** Modificando: in questo passo è cambiato qualcosa. */
export const changed = (t: Tunnel, s: StepId): boolean => !!t.edit && JSON.stringify(partOf(t, s)) !== JSON.stringify(partOf(t.edit.orig, s));

export const changedSteps = (t: Tunnel, c: Ctx): StepId[] => steps(t, c).filter(s => changed(t, s));

/** Viola nella fila dei passi: scelto nel passo 0, o grigio ma poi toccato. */
export const lit = (t: Tunnel, s: StepId): boolean => !!t.edit && (t.edit.picked.includes(s) || changed(t, s));

/** Toccati senza averli scelti: «Controlla» chiede di guardarli. */
export const strays = (t: Tunnel, c: Ctx): StepId[] => changedSteps(t, c).filter(s => !t.edit?.picked.includes(s));

/** Dove porta «Avanti» (dir 1) o «Indietro» (dir -1): modificando, solo fra i passi viola. */
export function stepFrom(t: Tunnel, c: Ctx, i: number, dir: 1 | -1): number {
    const st = steps(t, c);
    if (!t.edit || (t.edit.free && !t.edit.picked.length)) return Math.max(0, Math.min(i + dir, st.length - 1));
    for (let j = i + dir; j > 0 && j < st.length - 1; j += dir) if (lit(t, st[j])) return j;
    return dir > 0 ? st.length - 1 : 0;
}

/** Mette in piedi la modifica: `t` è la cosa com'è oggi, letta dal database. */
export function asEdit(t: Tunnel, id: string, rule: { id: string | null; count: number }): Tunnel {
    const orig = { ...t, i: 0, seen: 0, edit: null };
    return { ...structuredClone(orig), seen: 99, edit: { id, picked: [], orig, ruleId: rule.id, rules: rule.count } };
}

/** Il clic sulla riga: lo stesso tunnel, già dentro al primo passo, senza niente di scelto. */
export function asInside(t: Tunnel): Tunnel {
    return t.edit ? { ...t, i: 1, edit: { ...t.edit, free: true } } : t;
}

/* ---------- le frasi ---------- */

export function thingName(t: Tunnel): string {
    if (t.kind === "evid" || t.kind === "storia") return t.title.trim() || "Senza titolo";
    return t.name.trim() || (t.kind === "menu" ? "Menù senza nome" : "Stile senza nome");
}

/** «Nuovo menù · Pranzo»: il titolo del tunnel. */
export function tunnelTitle(t: Tunnel): string {
    if (t.edit) return KIND[t.kind].edit + " · " + thingName(t.edit.orig);
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
            return t.edit ? t.name.trim() : `${t.name.trim()} · ${t.source === "foto" ? "da una foto o un PDF" : "da zero"}`;
        case "sezioni":
            return t.sections.map(x => `${x.name} (${total(x)})`).join(", ") || "—";
        case "nome":
            return t.name.trim() + (t.base === "copy" && t.baseStyleId ? ` · copia di ${styleName(t.baseStyleId)}` : "");
        case "aspetto":
            return [
                COLORS.find(c => c[0] === t.color)?.[1] ?? t.color ?? "—",
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
            return [t.kicker.trim(), t.title.trim()].filter(Boolean).join(" · ") + (t.cover || t.coverUrl ? " · con copertina" : "") + (t.linked ? ` · anche in ${product(t.linked)}` : "");
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
        case "modifica":
            return [thingName(t), "Com'è adesso. Cambia mentre modifichi."];
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
