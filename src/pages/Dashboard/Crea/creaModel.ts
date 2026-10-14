// I tunnel di creazione (artifact «Tunnel di creazione», D124: dentro l'app
// come «Aggiungi» del Calendario, il «Quando» comincia con una domanda, a
// destra la settimana, quattro scelte per l'aspetto dello stile).
//
// Qui solo i dati del tunnel, i passi e le frasi: niente React, niente database.
// Il Quando e il Dove usano il tempo e le sedi del Calendario (`CalWhen`,
// `CalWhere`), così la regola si salva con le sue funzioni.
//
// Il database di oggi (D122 → A, ripresa da D124 per la storia): il multi menù
// non c'è, una sola fascia oraria e mai dopo mezzanotte. Quelle parti ci sono
// già, spente. La storia non ha sedi né orari (D191): sta col suo prodotto o
// con la sede di cui parla.
import type { StoryBlock } from "@/services/supabase/stories";
import type { FeaturedContentType } from "@/services/supabase/featuredContents";
import { DEFAULT_STYLE_TOKENS, type FontFamily, type StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { DB_LATER, NEW_MODEL, daysLong, elides, listIt, mShort, perGroups, perText, whereFor, whereText, type Draft, type DraftLookups } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { durLabel, hhmm, romeToday, type CalWhen, type CalWhere, type DayNum } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import type { PickProduct } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { AiMenuCategory } from "@/pages/Dashboard/Catalogs/AiMenuImport/analyzeMenu";
import { computeProductMatch } from "@/utils/importMatching";
import { btnName, dateTxt, effBtn, newEvDate, type EvBtn, type EvDate } from "./evidData";
import { hasOrd, ordSummary, posTxt } from "./evidOrd";
import { adopt, allDishes, badFormat, clash, total } from "./menuTree";
import { LIGHT_BG, lookKey, lum, sameHex } from "./stileLook";

export type CreaKind = "menu" | "stile" | "evid" | "storia";
export const CREA_KINDS: readonly CreaKind[] = ["menu", "stile", "evid", "storia"];

/** Le storie col quando e con più sedi (D124 4 → A) aspettano la voce 1 di Lorenzo. */

/** L'indirizzo: /crea/menu, /crea/stile, /crea/evidenza, /crea/storia. */
export const SLUG: Record<CreaKind, string> = { menu: "menu", stile: "stile", evid: "evidenza", storia: "storia" };
export const kindOfSlug = (s: string | undefined): CreaKind | null => CREA_KINDS.find(k => SLUG[k] === s) ?? null;

export const KIND: Record<CreaKind, { t: string; edit: string; page: string; list: string; pub: string; noun: string }> = {
    menu: { t: "Nuovo menù", edit: "Modifica il menù", page: "Menù", list: "catalogs", pub: "Metti in onda", noun: "menù" },
    stile: { t: "Nuovo stile", edit: "Modifica lo stile", page: "Stili", list: "styles", pub: "Metti in onda", noun: "stile" },
    evid: { t: "Nuovo contenuto in evidenza", edit: "Modifica il contenuto in evidenza", page: "In evidenza", list: "featured", pub: "Metti in onda", noun: "contenuto" },
    storia: { t: "Nuova storia", edit: "Modifica la storia", page: "Storie", list: "stories", pub: "Metti in onda", noun: "storia" }
};

/** Le parole della scelta «in onda / pronto» (D189): la storia è femminile. */
export const ONDA: Record<CreaKind, { Il: string; q: string; lo: string; pronto: string; Pronto: string; completo: string; spento: string }> = {
    menu: { Il: "Il menù", q: "questo menù", lo: "lo", pronto: "pronto", Pronto: "Pronto", completo: "completo e controllato", spento: "spento" },
    stile: { Il: "Lo stile", q: "questo stile", lo: "lo", pronto: "pronto", Pronto: "Pronto", completo: "completo e controllato", spento: "spento" },
    evid: { Il: "Il contenuto", q: "questo contenuto", lo: "lo", pronto: "pronto", Pronto: "Pronto", completo: "completo e controllato", spento: "spento" },
    storia: { Il: "La storia", q: "questa storia", lo: "la", pronto: "pronta", Pronto: "Pronta", completo: "completa e controllata", spento: "spenta" }
};

/** «No, per ora lo tengo pronto». */
export const keepReady = (k: CreaKind) => `No, per ora ${ONDA[k].lo} tengo ${ONDA[k].pronto}`;

export type EvType = "annuncio" | "evento" | "promo" | "bundle";
/** Il contenuto porta dei piatti: è questo, non un tipo scelto, a decidere come si salva (D187). */
export const hasDishes = (t: { evType: EvType | null }) => t.evType === "promo" || t.evType === "bundle";
/** Come si salva: il tipo nel database (D187), non più una scelta del tunnel. */
export const EV: Record<EvType, { type: FeaturedContentType }> = {
    annuncio: { type: "announcement" },
    evento: { type: "event" },
    promo: { type: "promo" },
    bundle: { type: "bundle" }
};

/** I colori pronti dell'aspetto; gli altri nella tavolozza. */
export const COLORS: readonly [string, string][] = [
    ["#be123c", "Rosso"],
    ["#5f7a61", "Salvia"],
    ["#1d4ed8", "Blu"],
    ["#7c3aed", "Viola"],
    ["#b45309", "Ambra"],
    ["#0f172a", "Notte"]
];
/** I nove caratteri dello stile. */
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
    /** Aperto dal Calendario: si cambiano solo il dove e il quando, il resto si modifica dalla sua pagina. */
    cal?: boolean;
    /** Dal Calendario, da «Aggiungi»: una cosa che c'è già e non ha ancora la sua voce. */
    add?: boolean;
};

/** Quello che arriva da «E adesso?»: la cosa appena creata (D194). */
export type From = {
    /** Che cos'era: da una storia non si ereditano sedi e ore. */
    kind: CreaKind;
    name: string;
    /** Il menù appena creato, se era un menù. */
    catalogId: string | null;
    /** La regola del menù: uno stile col suo stesso quando e dove ci va dentro. */
    ruleId: string | null;
    /** I piatti del menù, per la promo e il bundle. */
    productIds: string[];
    /** Il suo primo piatto: il contenuto in evidenza e la storia partono da lì. */
    dish: { id: string; name: string } | null;
    /** In onda o tenuto pronto: tenuto pronto, la cosa nuova lo richiede. */
    onda: "on" | "off" | null;
    /** La sua prima sede: da uno stile, la storia racconta il locale lì. */
    sede?: string | null;
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
    /**
     * Si accavalla con altri: per il menù true = «Mettili insieme» (D135), per lo
     * stile true = «Lascia gli altri». Non ancora scelto: undefined.
     */
    insieme?: boolean;
    /** «È uguale per tutte le sedi?»: con «no» ogni sede ha le sue scelte in `hm` (`sede|altro`). */
    hSame?: "si" | "no";
    hm?: Record<string, "ins" | "pos">;
    /** In modifica: gli incroci nuovi a cui si è già risposto (le sedi, in fila). Solo schermo. */
    hOk?: string;
    /** La parte del «Quando» che si vede: 1 le ore, 2 «In onda insieme». Solo schermo. */
    qPart?: 1 | 2;
    name: string;
    source: "zero" | "foto" | "copia";
    /** Il menù da cui si copia: categorie e piatti arrivano da lì, poi si cambiano. */
    copyFrom: string | null;
    /** Un import fermo sul resoconto (D180): finché non lo aggiungi o lo butti via non si va avanti. */
    impOpen?: boolean;
    /** L'ultimo import aggiunto, per «Annulla l'import»: le chiavi dei piatti e delle categorie nati con lui. */
    lastImport: { file: string; dishes: string[]; secs: string[] } | null;
    sections: Section[];
    // lo stile
    base: "zero" | "copy";
    baseStyleId: string | null;
    /** L'aspetto intero (D186): tutte le scelte dello stile, come nell'editor. */
    look: StyleTokenModel;
    // in evidenza
    evType: EvType | null;
    /** L'idea da cui si è partiti creando: dà solo gli esempi nei campi. */
    idea: string | null;
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
    /** «Quando succede» (D187): la data scritta sulla card, solo un'informazione. */
    date: EvDate;
    /** «Il pulsante» (D187): una scelta fra quattro; `cta` resta il link libero di un contenuto salvato prima. */
    btn: EvBtn;
    /** Al «Quando» ci si è già arrivati: la data non lo riscrive una seconda volta. */
    qset: boolean;
    /** Il giorno della card messo come fine del periodo (punto 14). */
    qauto: DayNum | null;
    /** «L'ordine» (D187): per ogni sede con altri contenuti, chi sta sopra e chi sotto (`ME` = questo). */
    ord: Record<string, string[]>;
    /** Per primo in tutte le sedi: la risposta già data. */
    ordSame: boolean;
    /** La sede aperta nel passo «L'ordine»: è quella del telefono. */
    ordOpen: string | null;
    // la storia
    kicker: string;
    cover: File | null;
    coverUrl: string | null;
    linked: string;
    /** Di cosa parla (D191): un prodotto (`linked`) o il locale (`sede`, con più sedi). */
    about: "prod" | "loc" | null;
    sede: string;
    blocks: StoryBlock[];
    /** I blocchi immagine con una foto nuova da caricare (i file stanno fuori dal modello). */
    pending: string[];
    // quando e dove
    qmode: "sempre" | "momenti";
    when: CalWhen;
    where: CalWhere;
    /** Le ore per sede, quando le sedi non hanno le stesse ore (D145, F1); null = le stesse. */
    per: Draft["per"];
    from: From | null;
    /** Da «E adesso?»: le sedi ereditate si confermano («si») o si cambiano («cambio»). */
    inhD?: "si" | "cambio" | null;
    /** Lo stesso per gli orari. */
    inhQ?: "si" | "cambio" | null;
    /** Aperto da «Crea un menù nuovo» del Calendario con la bozza messa da parte: quando e dove vengono da lì. */
    aside: boolean;
    edit: Edit | null;
    /**
     * «Dove e quando» (D189): in onda, o pronto ma spento. Creando nessuna è scelta;
     * modificando parte da com'è adesso. Chi non gestisce il Calendario non sceglie: pronto.
     */
    onda: "on" | "off" | null;
};

let seq = 0;
export const key = () => "k" + ++seq;

export function newTunnel(kind: CreaKind, where: CalWhere, from: From | null = null): Tunnel {
    // da una storia non si ereditano sedi e ore: solo il suo piatto
    const inh = from && from.kind !== "storia" ? from : null;
    const many = !!inh && !inh.where.all && inh.where.activityIds.length + inh.where.groupIds.length > 1;
    // la storia sta in una sede o in tutte, e non ha ore
    const w = !inh ? where : kind === "storia" && many ? { all: true, activityIds: [], groupIds: [] } : inh.where;
    const timed = !!inh && kind !== "storia";
    return {
        kind,
        i: 0,
        seen: 0,
        name: "",
        source: "zero",
        copyFrom: null,
        lastImport: null,
        sections: [],
        base: "zero",
        baseStyleId: null,
        look: structuredClone(DEFAULT_STYLE_TOKENS),
        // dal piatto della cosa appena creata: già scelto, col suo prezzo
        evType: kind === "evid" && from?.dish ? "promo" : null,
        idea: null,
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
        dishes: kind === "evid" && from?.dish ? [from.dish.id] : [],
        notes: {},
        bundle: "",
        showOrig: true,
        date: newEvDate(romeToday()),
        btn: "",
        qset: false,
        qauto: null,
        ord: {},
        ordSame: true,
        ordOpen: null,
        kicker: "",
        cover: null,
        coverUrl: null,
        linked: kind === "storia" && from?.dish ? from.dish.id : "",
        // dal suo piatto; da uno stile, il locale nella sua prima sede
        about: kind !== "storia" ? null : from?.dish ? "prod" : from?.kind === "stile" ? "loc" : null,
        sede: (kind === "storia" && !from?.dish && from?.kind === "stile" && from.sede) || "",
        blocks: [],
        pending: [],
        qmode: timed && (inh.when.period || inh.when.days || inh.when.ranges) ? "momenti" : "sempre",
        when: timed ? cloneWhen(inh.when) : {},
        where: { all: w.all, activityIds: [...w.activityIds], groupIds: [...w.groupIds] },
        per: timed ? clonePer(inh.per) : null,
        from,
        aside: false,
        edit: null,
        // era in onda: lo è anche questa, salvo dire di no; tenuta pronta, si richiede
        onda: inh?.onda === "on" ? "on" : null
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
    | "parti"
    | "sezioni"
    | "serve"
    | "nome"
    | "aspetto"
    | "contenuto"
    | "piatti"
    | "tema"
    | "racconto"
    | "blocchi"
    | "onda"
    | "quando"
    | "dove"
    | "ordine"
    | "controlla";

export const STEP_LABEL: Record<StepId, string> = {
    modifica: "Cosa vuoi modificare?",
    parti: "Da dove parti",
    sezioni: "Categorie e piatti",
    serve: "A cosa serve",
    nome: "Il nome",
    aspetto: "L'aspetto",
    contenuto: "Il contenuto",
    piatti: "Piatti",
    tema: "Di cosa parla",
    racconto: "Il racconto",
    blocchi: "I blocchi",
    onda: "In onda?",
    quando: "Quando",
    dove: "Dove",
    ordine: "L'ordine",
    controlla: "Controlla"
};

/** Chi crea e dove: `owner` gestisce il Calendario (Dove e quando), `multi` ha più sedi. */
/** `clash`: nelle sue ore c'è già un altro menù o stile, e si sceglie cosa fare (dal Calendario a destra). */
/** `ordSedi`: le sedi scelte dove c'è già un altro contenuto in evidenza (passo «L'ordine»). */
/** `hNuovi`: in modifica, le sedi (per nome) con un incrocio che prima non c'era e ancora senza risposta (D196). */
export type Ctx = { owner: boolean; multi: boolean; clash?: boolean; ordSedi?: readonly string[]; hNuovi?: readonly string[] };

/** Il nome del passo: modificando un menù «Da dove parti» è solo il nome. */
export const stepLabel = (t: Tunnel, s: StepId): string => (t.edit && s === "parti" ? "Il nome" : STEP_LABEL[s]);

/** Con più sedi il Dove viene prima del Quando, in due passi; con una sola c'è solo il Quando. La storia non ha né l'uno né l'altro (D191): solo «In onda?». */
const calSteps = (t: Tunnel, c: Ctx): StepId[] => (t.kind === "storia" ? ["onda"] : !c.multi ? ["quando"] : ["dove", "quando"]);

/** «tutte e due le sedi», «tutte e tre le sedi», «tutte le 12 sedi». */
export const nTutte = (n: number) => (n === 2 ? "tutte e due le sedi" : n === 3 ? "tutte e tre le sedi" : `tutte le ${n} sedi`);

/** Le ore in breve, nella seconda parte del «Quando»: «Lun–Ven 12–15 · uguale in tutte e tre le sedi». */
export function oreSummary(t: Tunnel, ids: readonly string[]): string {
    const b = durLabel(effWhen(t)), n = ids.length;
    const d = t.per ? ids.filter(id => JSON.stringify(t.per![id]) !== JSON.stringify(t.when)).length : 0;
    if (d) return `${b} · uguale in ${n - d}, ${d === 1 ? "diversa in 1 sede" : `diversa in ${d} sedi`}`;
    return b + (n > 1 ? " · uguale in " + nTutte(n) : "");
}

/** Tenuto pronto nel «Dove»: il «Quando» non serve, si salta. */
export const skipped = (t: Tunnel, s: StepId, c: Ctx): boolean => (s === "quando" && c.multi && t.onda === "off") || (s === "ordine" && t.onda === "off");

export function steps(t: Tunnel, c: Ctx): StepId[] {
    if (t.edit) return editSteps(t, c);
    const content: StepId[] =
        t.kind === "menu"
            ? ["parti", "sezioni"]
            : t.kind === "stile"
              ? ["serve", "nome", "aspetto"]
              : t.kind === "evid"
                ? ["contenuto"]
                : ["serve", "tema", "racconto", "blocchi"];
    const when: StepId[] = c.owner ? calSteps(t, c) : [];
    const ord: StepId[] = c.owner && hasOrd(t, c.ordSedi) ? ["ordine"] : [];
    return [...content, ...when, ...ord, "controlla"];
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

/** Nessuna delle due scelte di «Dove e quando»: non si va avanti. */
export const CHOOSE = "Scegli una delle due per andare avanti";

/** In onda per chi salva: chi non gestisce il Calendario tiene sempre pronto. */
/** «E adesso?»: cosa hai appena fatto, in una frase (D194). */
export function adessoDid(t: Tunnel, saved: { name: string; live: boolean }, c: { multi: boolean; sedi: readonly string[]; place: string }): string {
    const n = "«" + saved.name + "»", o = ONDA[t.kind];
    if (!saved.live) return `${n} è ${o.pronto}: nessun cliente ${o.lo} vede finché non ${o.lo} metti in onda.`;
    if (t.kind === "storia") return `${n} è in onda: si vede ${c.place}.`;
    return `${n} è in onda${c.multi && c.sedi.length ? " a " + listIt([...c.sedi]) : ""}, ${durLabel(effWhen(t)).toLowerCase()}.`;
}

/** Da «E adesso?» sedi e orari arrivano già scelti, e si chiede di confermarli (D194). */
export const inhAsk = (t: Pick<Tunnel, "from" | "edit" | "kind">) => !!t.from && !t.edit && t.kind !== "storia" && t.from.kind !== "storia";

export const goesLive = (t: Tunnel, c: Ctx) => c.owner && t.onda === "on";

/**
 * Spegnere uno stile in onda: la sua voce è la regola del menù, e spegnerla
 * spegnerebbe anche il menù. Aspetta il database nuovo.
 */
export const offLater = (t: Tunnel) => t.kind === "stile" && t.edit?.orig.onda === "on";

/** Il quando che conta: «Sempre» non guarda il modulo, anche se è stato toccato. */
export const effWhen = (t: Tunnel): CalWhen => (t.qmode === "sempre" ? {} : t.when);

/** Cosa manca per andare avanti da questo passo; "" se niente. */
export function blocker(t: Tunnel, step: StepId, c: Ctx): string {
    switch (step) {
        case "modifica":
            return t.edit && (t.edit.picked.length || changedSteps(t, c).length) ? "" : "Scegli almeno una cosa";
        case "parti":
            if (!t.name.trim()) return "Manca il nome del menù";
            return !t.edit && t.source === "copia" && !t.copyFrom ? "Scegli da quale menù copiare" : "";
        case "sezioni":
            return t.impOpen ? "Hai un import aperto: aggiungi i piatti o butta via l'import" : hasDish(t) ? menuProblem(t.sections) : "Aggiungi almeno un piatto";
        case "nome":
            if (!t.name.trim()) return "Manca il nome dello stile";
            return t.base === "copy" && !t.baseStyleId ? "Scegli lo stile da cui partire" : "";
        case "aspetto":
            return "";
        case "contenuto":
            if (NEW_MODEL.evid && t.date.k === "period" && t.date.to < t.date.from) return "La fine del periodo viene prima dell'inizio";
            if (t.cta && t.ctaLink.trim() && !/^https:\/\//.test(t.ctaLink.trim())) return "Il link del bottone deve cominciare con https://";
            if (t.cta && !t.ctaText.trim()) return "Manca il testo del bottone";
            if (!t.title.trim()) return "Manca il titolo";
            return hasDishes(t) ? blocker(t, "piatti", c) : "";
        case "piatti":
            if (!t.dishes.length) return "Aggiungi almeno un piatto";
            return t.evType === "bundle" && !(price(t.bundle) > 0) ? "Manca il prezzo unico" : "";
        case "tema":
            // modificando, una storia di tutte le sedi resta com'è finché non la si tocca
            if (t.edit && !changed(t, "tema")) return "";
            if (!t.about) return "Scegli di cosa parla";
            if (t.about === "prod") return t.linked ? "" : "Scegli il prodotto";
            return c.multi && !t.sede ? "Scegli la sede" : "";
        case "racconto":
            return t.title.trim() ? "" : "Manca il titolo";
        case "onda":
            return t.onda ? "" : CHOOSE;
        case "quando":
            if (!t.onda) return CHOOSE;
            if (t.onda === "off") return "";
            if (inhAsk(t) && t.inhQ == null) return "Conferma gli orari o cambiali";
            for (const w of t.per ? Object.values(t.per) : [effWhen(t)]) {
                const why = whenProblem(w);
                if (why) return why;
            }
            if (c.clash && t.insieme == null && (t.kind === "menu" || t.kind === "stile")) return t.kind === "stile" ? "Scegli: prende il posto dell'altro o lo lascia" : "Scegli: insieme o al posto degli altri";
            // in modifica la scelta di prima vale per gli incroci di prima; per uno nuovo si chiede (D196)
            if (c.clash && c.hNuovi?.length && (t.kind === "menu" || t.kind === "stile"))
                return `Scegli: a ${listIt([...c.hNuovi])} c'è un incrocio nuovo, ${t.kind === "stile" ? "prende il posto dell'altro o lo lascia" : "insieme o al posto degli altri"}`;
            return "";
        case "dove":
            if (!t.onda) return CHOOSE;
            if (t.onda === "off" || !c.multi) return "";
            if (!t.where.all && !t.where.activityIds.length && !t.where.groupIds.length) return "Scegli almeno una sede";
            // le ore sono nel passo dopo, «Quando»
            return inhAsk(t) && t.inhD == null ? "Conferma le sedi o cambiale" : "";
        default:
            return "";
    }
}

/** Modificando, un passo da guardare: cambiato, o con un import da foto ancora aperto. */
export const touched = (t: Tunnel, step: StepId, c?: Ctx) => changed(t, step) || (step === "sezioni" && !!t.impOpen) || (step === "quando" && !!c?.hNuovi?.length);

/** Il primo passo con qualcosa che manca, prima di «Controlla». */
export function firstBlock(t: Tunnel, c: Ctx): { i: number; why: string } | null {
    const st = steps(t, c);
    for (let i = 0; i < st.length - 1; i++) {
        // modificando conta solo quello che si è cambiato: il resto era già così
        if (t.edit && !touched(t, st[i], c)) continue;
        if (skipped(t, st[i], c)) continue;
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
    /** È già fra i tuoi prodotti: si collega a lui, col suo prezzo. */
    productId: string | null;
    description: string | null;
    formats?: { name: string; price: number | null }[];
    /** Perché è «da controllare»; null se l'AI ne era sicura. */
    why: string | null;
};

/**
 * I piatti letti dall'AI (D172, D180). Un piatto col nome di un solo prodotto
 * tuo si collega a lui, col suo prezzo; con più prodotti dello stesso nome,
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
            const price = mine ? (mine.listPrice ?? null) : formats ? (prices.length ? Math.min(...prices) : null) : it.base_price;
            return {
                key: key(),
                path: path.length ? path : ["Piatti"],
                name: mine?.name ?? it.name.trim(),
                price,
                productId: mine?.id ?? null,
                description: mine ? null : it.description,
                formats,
                why: !mine && !(price !== null && price > 0) ? "il prezzo non si leggeva" : m.status === "reusable_ambiguous" ? "somiglia a più prodotti tuoi" : it.confidence !== "high" ? "l'AI non ne era sicura" : null
            };
        });
    });
}

/** Quello che il Salva non potrebbe scrivere: meglio dirlo nel passo che fermarsi a metà. */
function menuProblem(sections: readonly Section[]): string {
    const c = clash(sections);
    if (c) return c.a === c.b ? `«${c.dish.name}» è due volte in «${c.a.name}»: toglilo una volta` : `«${c.dish.name}» è sia in «${c.a.name}» sia in «${c.b.name}», che le sta dentro: toglilo da una delle due`;
    const f = badFormat(sections);
    return f ? `«${f.name}»: una variante è senza nome o senza prezzo` : "";
}

/** C'è qualcosa da perdere uscendo. */
export const isDirty = (t: Tunnel) =>
    !!t.impOpen || (t.edit ? EDIT_PARTS.some(s => changed(t, s)) :
    t.i > 0 || !!t.name.trim() || !!t.title.trim() || !!t.evType || t.sections.length > 0);

/* ---------- modificare (D140) ---------- */

/** I passi che cambiano la cosa, in ordine: il passo 0 e «Controlla» stanno attorno. */
const EDIT_PARTS: readonly StepId[] = ["parti", "sezioni", "nome", "aspetto", "contenuto", "piatti", "tema", "racconto", "blocchi", "onda", "quando", "dove"];

function editSteps(t: Tunnel, c: Ctx): StepId[] {
    const content: StepId[] =
        t.kind === "menu"
            ? ["parti", "sezioni"]
            : t.kind === "stile"
              ? ["nome", "aspetto"]
              : t.kind === "evid"
                ? ["contenuto"]
                : ["tema", "racconto", "blocchi"];
    // il «Dove e quando» cambia la sua regola del Calendario: c'è se è una sola, o nessuna
    // (allora la si crea mettendolo in onda); la storia non ha regole: ha «In onda?»
    const one = t.kind === "storia" || (t.edit?.rules ?? 0) <= 1;
    const when: StepId[] = c.owner && one ? calSteps(t, c) : [];
    return ["modifica", ...(t.edit?.cal && when.length ? [] : content), ...when, "controlla"];
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
            return lookKey(t.look);
        case "contenuto":
            // i piatti stanno nel passo del contenuto (D187): cambiarli è cambiare il contenuto
            return [t.title.trim(), t.sub.trim(), t.inner.trim(), t.text.trim(), !!t.image, t.imageUrl, t.cta && [t.ctaText.trim(), t.ctaLink.trim()], t.slot, partOf(t, "piatti"), dateTxt(t.date), effBtn(t)];
        case "piatti":
            if (!hasDishes(t)) return null;
            return [t.evType, t.dishes, t.evType === "bundle" ? [t.bundle.trim(), t.showOrig] : t.dishes.map(d => t.notes[d]?.trim() ?? "")];
        case "racconto":
            return [t.kicker.trim(), t.title.trim(), !!t.cover, t.coverUrl];
        case "tema":
            return [t.about, t.about === "prod" ? t.linked : null, t.about === "loc" ? t.sede : null];
        case "onda":
            return t.onda;
        case "blocchi":
            return [t.blocks, t.pending];
        // spento, sedi e orari non contano: restano quelli della sua voce
        case "dove":
            if (t.onda !== "on") return t.onda;
            return [t.onda, t.where.all, sorted(t.where.activityIds), sorted(t.where.groupIds)];
        case "quando":
            return t.onda !== "on" ? t.onda : [t.onda, cloneWhen(effWhen(t)), t.per, !!t.insieme];
        default:
            return null;
    }
}

/** Modificando: in questo passo è cambiato qualcosa. */
export const changed = (t: Tunnel, s: StepId): boolean => !!t.edit && JSON.stringify(partOf(t, s)) !== JSON.stringify(partOf(t.edit.orig, s));

export const changedSteps = (t: Tunnel, c: Ctx): StepId[] => steps(t, c).filter(s => changed(t, s) && !skipped(t, s, c));

/** Viola nella fila dei passi: scelto nel passo 0, o grigio ma poi toccato. */
export const lit = (t: Tunnel, s: StepId): boolean => !!t.edit && (t.edit.picked.includes(s) || changed(t, s));

/** Toccati senza averli scelti: «Controlla» chiede di guardarli. */
export const strays = (t: Tunnel, c: Ctx): StepId[] => changedSteps(t, c).filter(s => !t.edit?.picked.includes(s));

/** Dove porta «Avanti» (dir 1) o «Indietro» (dir -1): modificando, solo fra i passi viola. */
export function stepFrom(t: Tunnel, c: Ctx, i: number, dir: 1 | -1): number {
    const st = steps(t, c);
    if (!t.edit || (t.edit.free && !t.edit.picked.length)) {
        let j = i + dir;
        while (j > 0 && j < st.length - 1 && skipped(t, st[j], c)) j += dir;
        return Math.max(0, Math.min(j, st.length - 1));
    }
    for (let j = i + dir; j > 0 && j < st.length - 1; j += dir) if (lit(t, st[j]) && !skipped(t, st[j], c)) return j;
    return dir > 0 ? st.length - 1 : 0;
}

/** Mette in piedi la modifica: `t` è la cosa com'è oggi, letta dal database. */
export function asEdit(t: Tunnel, id: string, rule: { id: string | null; count: number; live: boolean }): Tunnel {
    const orig: Tunnel = { ...t, i: 0, seen: 0, edit: null, onda: rule.live ? "on" : "off" };
    return { ...structuredClone(orig), seen: 99, edit: { id, picked: [], orig, ruleId: rule.id, rules: rule.count } };
}

/**
 * Dopo un salvataggio in modifica fermo a metà: `fresh` è la cosa riletta dal database.
 * La bozza resta com'è, ma il confronto riparte da quello che c'è davvero: «Riprova»
 * non rifà i passi già scritti e non cerca righe che non ci sono più (review #388.2).
 */
export function rebase(t: Tunnel, fresh: Tunnel): Tunnel {
    if (!t.edit || !fresh.edit) return t;
    const sections = structuredClone(t.sections);
    adopt(sections, fresh.edit.orig.sections);
    return { ...t, sections, edit: { ...t.edit, orig: fresh.edit.orig, ruleId: fresh.edit.ruleId, rules: fresh.edit.rules } };
}

/** Il clic sulla riga: lo stesso tunnel, già dentro al primo passo, senza niente di scelto. */
export function asInside(t: Tunnel): Tunnel {
    return t.edit ? { ...t, i: 1, edit: { ...t.edit, free: true } } : t;
}

/**
 * «Metti in onda» dall'elenco (D189): la stessa modifica, già sul «Dove» (con una
 * sede sola, sul «Quando») scelto e con «Sì» acceso. Senza quel passo (chi non gestisce il Calendario,
 * o più voci), resta la modifica di sempre.
 */
export function asMetti(t: Tunnel, c: Ctx): Tunnel {
    if (!t.edit) return t;
    const cal = calSteps(t, c), s = cal[0];
    const x: Tunnel = { ...t, onda: "on", edit: { ...t.edit, picked: cal } };
    const i = steps(x, c).indexOf(s);
    return i < 0 ? t : { ...x, i, seen: Math.max(t.seen, i) };
}

/**
 * Dal Calendario: la stessa modifica, coi soli passi del dove e del quando.
 * `add`: da «Aggiungi», già sul primo dei due con «Sì» acceso, come «Metti in onda».
 */
export function asCal(t: Tunnel, c: Ctx, add: boolean): Tunnel {
    if (!t.edit) return t;
    const x: Tunnel = { ...t, edit: { ...t.edit, cal: true } };
    if (!add) return x;
    const m = asMetti(x, c);
    return m.edit ? { ...m, edit: { ...m.edit, add: true } } : m;
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
    if (t.kind === "stile") return t.insieme ? `la pagina prende lo stile ${q(n)}, ma dove c'è già un altro stile resta quello` : `la pagina prende lo stile ${q(n)}`;
    if (t.kind === "evid") return `${q(n)} va in evidenza, ${t.slot === "before" ? "in cima al" : "sotto il"} menù`;
    return `la storia ${q(n)} compare`;
}

type Names = Pick<DraftLookups, "products" | "sedi" | "multi">;

/** «Il prodotto «Carbonara»», «Il locale · Porto»: di cosa parla la storia, in breve. */
export function aboutShort(t: Pick<Tunnel, "about" | "linked" | "sede">, L: Names): string {
    if (!t.about) return "Da scegliere";
    if (t.about === "prod") return t.linked ? "Il prodotto " + q(L.products.get(t.linked)?.name ?? "Prodotto") : "Un prodotto, da scegliere";
    return "Il locale" + (L.multi ? (t.sede ? " · " + (L.sedi.get(t.sede) ?? "Sede") : ", sede da scegliere") : "");
}

/** Dove si vede la storia: in fondo alla scheda del suo prodotto, o nella pagina del locale. */
export function aboutPlace(t: Pick<Tunnel, "about" | "linked" | "sede">, L: Names): string {
    if (!t.about) return "sotto il menù";
    if (t.about === "prod") return "in fondo alla scheda di " + q(t.linked ? (L.products.get(t.linked)?.name ?? "Prodotto") : "…");
    return "nella pagina del locale" + (L.multi && t.sede ? " di " + q(L.sedi.get(t.sede) ?? "Sede") : "");
}

/** Le sedi dove non si vede perché lì resta un altro, e chi resta: la coda di «In una frase». */
export type Nascosto = { sedi: string[]; by: string[] };

/** «In una frase»: quando, dove e cosa succede; `hid`: dove non si vede, perché resta un altro (D196). */
export function sentence(t: Tunnel, L: DraftLookups, hid?: Nascosto | null): string {
    const s = sentence0(t, L);
    if (t.onda !== "on" || !hid?.sedi.length) return s;
    return s.slice(0, -1) + `; a ${listIt(hid.sedi)} non si vede: lì resta ${listIt(hid.by.map(q))}.`;
}

function sentence0(t: Tunnel, L: DraftLookups): string {
    if (t.onda !== "on") return readySentence(t);
    // la storia non ha sedi né orari (D191): segue la cosa di cui parla
    if (t.kind === "storia")
        return (t.about === "prod" ? "Dove e quando " + q(L.products.get(t.linked)?.name ?? "Prodotto") + " è nel menù" : "Sempre" + (L.multi && t.sede ? ", solo per " + (L.sedi.get(t.sede) ?? "Sede") : "")) + ": " + what(t) + " " + aboutPlace(t, L) + ".";
    if (t.per) return perGroups(t.per).map(g => whenWords(g.when) + ", " + whereFor({ all: false, activityIds: g.ids, groupIds: [] }, L)).join("; ") + ": " + what(t) + ".";
    return whenWords(effWhen(t)) + (L.multi ? ", " + whereFor(t.where, L) : "") + ": " + what(t) + ".";
}

/** «In una frase» quando non va in onda: creando è pronto e spento, modificando esce da tutte le sedi. */
export function readySentence(t: Tunnel): string {
    const o = ONDA[t.kind], n = q(thingName(t));
    if (t.edit?.orig.onda === "on") return `${o.Il} ${n} esce da tutte le sedi: da quando salvi nessun cliente ${o.lo} vede.`;
    return `${o.Il} ${n} è ${o.pronto} ma ${o.spento}: nessun cliente ${o.lo} vede finché non ${o.lo} metti in onda.`;
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
        case "parti":
            return t.edit ? t.name.trim() : `${t.name.trim()} · ${t.source === "foto" ? "da una foto o un PDF" : t.source === "copia" ? `copia di ${q(L.catalogs.get(t.copyFrom ?? "") ?? "…")}` : "da zero"}`;
        case "sezioni":
            return t.sections.map(x => `${x.name} (${total(x)})`).join(", ") || "—";
        case "nome":
            return t.name.trim() + (t.base === "copy" && t.baseStyleId ? ` · copia di ${styleName(t.baseStyleId)}` : "");
        case "aspetto":
            return [
                COLORS.find(c => sameHex(c[0], t.look.colors.primary))?.[1] ?? "un tuo colore",
                "sfondo " + (sameHex(t.look.colors.pageBackground, LIGHT_BG) ? "bianco" : lum(t.look.colors.pageBackground) < 0.35 ? "scuro" : "chiaro"),
                FONTS[t.look.typography.fontFamily].name,
                t.look.card.productStyle === "compact" ? "piatti in elenco" : "piatti a riquadri"
            ].join(" · ");
        case "contenuto":
            return [
                t.title.trim() + (t.slot === "after" ? " · sotto il menù" : ""),
                dateTxt(t.date),
                t.cta ? `pulsante «${t.ctaText.trim()}»` : effBtn(t) ? `pulsante «${btnName(t)}»` : NEW_MODEL.evid ? "senza pulsante" : "",
                hasDishes(t) ? stepSummary(t, "piatti", L, styleName) : ""
            ]
                .filter(Boolean)
                .join(" · ");
        case "piatti":
            return t.evType === "bundle"
                ? `${t.dishes.map(product).join(", ")} · ${t.bundle.trim()} €${t.showOrig ? " · totale di prima barrato" : ""}`
                : t.dishes.map(d => product(d) + (t.notes[d]?.trim() ? ` (${t.notes[d].trim()})` : "")).join(", ");
        case "racconto":
            return [t.kicker.trim(), t.title.trim()].filter(Boolean).join(" · ") + (t.cover || t.coverUrl ? " · con copertina" : "");
        case "tema":
            return aboutShort(t, L);
        case "onda":
            return t.onda === "on" ? "Sì, si vede " + aboutPlace(t, L) : t.onda === "off" ? "No, per ora la tengo pronta" : "Da scegliere";
        case "blocchi": {
            if (!t.blocks.length) return "Nessun blocco";
            const n = new Map<StoryBlock["type"], number>();
            for (const b of t.blocks) n.set(b.type, (n.get(b.type) ?? 0) + 1);
            return [...n].map(([k, c]) => `${c} ${BLOCK_NAME[k][c === 1 ? 0 : 1]}`).join(", ");
        }
        case "quando":
            return t.onda === "off" ? keepReady(t.kind) : t.per ? perText(t.per, L) : durLabel(effWhen(t));
        case "dove":
            return t.onda === "off" ? keepReady(t.kind) : whereText(t.where, L);
        case "ordine":
            return ordSummary(t, id => L.sedi.get(id) ?? "sede");
        default:
            return "";
    }
}

/** Modificando, la riga di «Dove e quando» in «Le tue modifiche»: com'era e com'è adesso. */
export function ondaChange(t: Tunnel, s: StepId, L: DraftLookups): [string, string] {
    const was = (x: Tunnel) => (x.onda === "on" ? "in onda, " + stepSummary(x, s, L, () => "") : "non in onda");
    const orig = t.edit ? { ...t.edit.orig, edit: t.edit } : t;
    return ["Prima: " + was(orig), "Adesso: " + (t.onda === "on" ? "in onda, " + stepSummary(t, s, L, () => "") : keepReady(t.kind).toLowerCase())];
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
        case "ordine": {
            const ids = Object.keys(t.ord), sd = t.ordOpen && t.ord[t.ordOpen] ? t.ordOpen : ids[0];
            return [ids.length > 1 ? "L'ordine a " + (L.sedi.get(sd) ?? "sede") : "L'ordine", `Uno sotto l'altro, in cima al menù: ${posTxt(t.ord[sd] ?? [])}.`];
        }
        case "parti":
            return [t.name.trim() || "Il nome del menù", "Il cliente lo legge in cima, sopra le categorie."];
        case "sezioni":
            return ["Categorie e piatti", "Nello stesso ordine in cui li metti qui."];
        case "serve":
            return t.kind === "stile" ? [baseName ? `Lo stile «${baseName}»` : "Lo stile", "I colori e i caratteri di tutta la pagina."] : ["Le storie", "Nella pagina del locale o nella scheda di un prodotto."];
        case "nome":
            return [t.name.trim() || "Lo stile nuovo", t.base === "copy" && baseName ? `Parte da «${baseName}».` : "Parte dai colori di CataloGlobe."];
        case "aspetto":
            return ["L'aspetto", "Su tutta la pagina, con ogni menù."];
        case "contenuto":
            return [t.title.trim() || "Il titolo", t.slot === "before" ? "Sopra il menù, appena sotto il nome." : "Sotto il menù, in fondo alla pagina."];
        case "racconto":
            return [t.title.trim() || "Il titolo", t.about ? `Così si presenta ${aboutPlace(t, L)}.` : "Così si presenta nell'elenco delle storie."];
        case "tema":
            if (!t.about) return ["Di cosa parla", "Scegli un prodotto o il locale: qui vedi dove compare."];
            if (t.about === "prod") return [(t.linked && L.products.get(t.linked)?.name) || "Il prodotto", "In fondo alla sua scheda, quando il cliente lo apre."];
            return ["La pagina del locale", (L.multi && t.sede ? (L.sedi.get(t.sede) ?? "Sede") + ": " : "") + "sotto il menù, nelle storie."];
        case "onda":
            return [t.onda === "off" ? "Pronta, non in onda" : t.onda === "on" ? "In onda" : "In onda?", `Si vede ${aboutPlace(t, L)}.`];
        case "blocchi":
            return ["La storia aperta", "Si legge toccando la storia."];
        case "controlla":
            return ["Così lo vede il cliente", "Dal momento in cui va in onda."];
        default:
            if (t.per) return ["Ore diverse per sede", perText(t.per, L)];
            return [durLabel(effWhen(t)), L.multi ? whereText(t.where, L) : "Si cambia quando vuoi dal Calendario."];
    }
}
