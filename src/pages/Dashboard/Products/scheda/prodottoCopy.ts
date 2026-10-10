import type { LucideIcon } from "lucide-react";
import {
    Carrot,
    Copy,
    Euro,
    HeartHandshake,
    Image,
    Languages,
    ListChecks,
    MapPin,
    NotebookPen,
    SlidersHorizontal,
    Sparkles,
    Wheat
} from "lucide-react";

/**
 * Le parti della pagina del prodotto (Officina 3, D121: il modello C+++ della
 * Scheda della sede, artifact «Scheda del prodotto» approvato da Alex il
 * 2026-10-10). La chiave è anche il valore di `?parte=` della vista a fuoco.
 */
export const PRODOTTO_PARTS = [
    "piatto",
    "prezzo",
    "caratteristiche",
    "allergeni",
    "scelte",
    "abbinamenti",
    "ingredienti",
    "note",
    "traduzioni",
    "dove",
    "varianti",
    "attributi"
] as const;
export type ProdottoPart = (typeof PRODOTTO_PARTS)[number];

export const isProdottoPart = (v: string | null): v is ProdottoPart =>
    v !== null && (PRODOTTO_PARTS as readonly string[]).includes(v);

/** Le parti disegnate sul telefono (le altre restano a voi). */
export type PhonePart = "piatto" | "prezzo" | "caratteristiche" | "allergeni" | "scelte" | "abbinamenti" | "ingredienti" | "note";
export const PHONE_PARTS: readonly ProdottoPart[] = [
    "piatto",
    "prezzo",
    "caratteristiche",
    "allergeni",
    "scelte",
    "abbinamenti",
    "ingredienti",
    "note"
];

export const PART_ICON: Record<ProdottoPart, LucideIcon> = {
    piatto: Image,
    prezzo: Euro,
    caratteristiche: Sparkles,
    allergeni: Wheat,
    scelte: ListChecks,
    abbinamenti: HeartHandshake,
    ingredienti: Carrot,
    note: NotebookPen,
    traduzioni: Languages,
    dove: MapPin,
    varianti: Copy,
    attributi: SlidersHorizontal
};

/** Le parole del verticale che entrano nei titoli delle parti. */
export interface PartLabels {
    product: string;
    attributes: string;
    /** «Il piatto» dove si mangia (artifact), altrimenti il nome del prodotto. */
    dish: string;
}

/** Il titolo delle parti; alcune dipendono dal verticale (es. «Il piatto»). */
export function partTitle(part: ProdottoPart, labels: PartLabels): string {
    switch (part) {
        case "piatto":
            return labels.dish;
        case "prezzo":
            return "Prezzo";
        case "caratteristiche":
            return "Caratteristiche";
        case "allergeni":
            return "Allergeni";
        case "scelte":
            return "Cosa sceglie il cliente";
        case "abbinamenti":
            return "Perfetto con";
        case "ingredienti":
            return "Ingredienti";
        case "note":
            return "Note";
        case "traduzioni":
            return "Traduzioni";
        case "dove":
            return "Dove si vede";
        case "varianti":
            return "Varianti";
        case "attributi":
            return labels.attributes;
    }
}

/** Una riga sotto il titolo della vista a fuoco: perché conta. */
export const PART_WHY: Record<ProdottoPart, string> = {
    piatto: "La prima cosa che vede chi apre il prodotto: la foto, il nome e due righe che fanno venire voglia.",
    prezzo: "Quello che legge il cliente accanto al nome. Con più formati, nel menù si legge «da» col prezzo più basso.",
    caratteristiche: "I segni sotto il nome: vegano, piccante, fatto in casa. Aiutano a scegliere a colpo d'occhio.",
    allergeni: "Li chiede la legge. Segnate quelli che contiene: il cliente li vede sotto la descrizione.",
    scelte: "Le domande quando lo ordina: cottura, salse, aggiunte. Quelle obbligatorie vanno scelte prima di «Aggiungi».",
    abbinamenti: "Quello che consigliate di prendere insieme. Compare prima di «Aggiungi».",
    ingredienti: "Aiutano chi cerca o evita qualcosa. Compaiono più in basso, per chi vuole sapere di più.",
    note: "Provenienza, cottura, quello che non sta nella descrizione.",
    traduzioni: "Le fa l'AI quando salvate la descrizione. Quella che correggete resta vostra.",
    dove: "In quali menù è, e in quali sedi lo trovano oggi i clienti. Si cambia dai menù e dalla programmazione.",
    varianti: "Versioni dello stesso prodotto con un prezzo loro. Nel menù sono prodotti a sé.",
    attributi: "Taglia, colore e gli altri dati del prodotto."
};

/** Le parti che valgono subito, senza Salva: lo dice il piede della vista a fuoco. */
export const PART_IMMEDIATE: Partial<Record<ProdottoPart, string>> = {
    traduzioni: "Le traduzioni valgono subito, senza Salva.",
    scelte: "Le domande valgono subito, senza Salva.",
    varianti: "Le varianti nascono subito, senza Salva."
};

/** La card «Sul telefono» passando su una parte. `**…**` è grassetto. */
export const PART_CAPTION: Record<ProdottoPart, string> = {
    piatto: "In cima: la foto, il nome e la descrizione.",
    prezzo: "Accanto al nome e sul bottone «Aggiungi».",
    caratteristiche: "I segni colorati sotto il nome.",
    allergeni: "Sotto la descrizione, con i bollini.",
    scelte: "Le domande, prima di «Aggiungi».",
    abbinamenti: "«Perfetto con», prima di «Aggiungi».",
    ingredienti: "Più in basso, per chi vuole sapere di più.",
    note: "In fondo, sotto «Da sapere».",
    traduzioni: "Il cliente lo legge **nella sua lingua**.",
    dove: "**Non compare sul telefono**: dice dove lo trovano.",
    varianti: "**Non compare qui**: ogni variante è a sé.",
    attributi: "**Non compare sul telefono**: restano a voi."
};

/** I gruppi del cruscotto, nell'ordine del telefono. */
export const DASH_GROUPS: { key: ProdottoZone; title: string; hint: string; parts: ProdottoPart[] }[] = [
    { key: "sotto", title: "Sotto il nome", hint: "Quello che si legge appena si apre il prodotto.", parts: ["caratteristiche", "allergeni"] },
    { key: "ordina", title: "Quando lo ordina", hint: "Le domande e il consiglio, prima di «Aggiungi».", parts: ["scelte", "abbinamenti"] },
    { key: "basso", title: "Più in basso", hint: "Per chi vuole sapere di più.", parts: ["ingredienti", "note", "traduzioni"] },
    { key: "voi", title: "Solo per voi", hint: "Sul telefono non si vedono.", parts: ["dove", "varianti", "attributi"] }
];

/** La colonna delle parti nella vista a fuoco. */
export const RAIL_GROUPS: { title: string; parts: ProdottoPart[] }[] = [
    { title: "In cima", parts: ["piatto", "prezzo"] },
    ...DASH_GROUPS.map(g => ({ title: g.title, parts: g.parts }))
];

/** Dove è arrivata la pagina mentre scorre: la card «Sul telefono» lo dice. */
export type ProdottoZone = "cima" | "sotto" | "ordina" | "basso" | "voi";
export const ZONE_CARD: Record<ProdottoZone, [string, string]> = {
    cima: ["In cima", "La foto, il nome, il prezzo e due righe."],
    sotto: ["Sotto il nome", "I segni sotto il nome e gli allergeni."],
    ordina: ["Quando lo ordina", "Le domande e «Perfetto con», prima di «Aggiungi»."],
    basso: ["Più in basso", "Ingredienti e note, per chi vuole sapere di più."],
    voi: ["Solo per voi", "Dove si vede e le varianti: sul telefono non ci sono."]
};

/** Le parti che una variante prende dal prodotto da cui viene. */
export const INHERITED: readonly ProdottoPart[] = ["caratteristiche", "note", "abbinamenti", "traduzioni"];
