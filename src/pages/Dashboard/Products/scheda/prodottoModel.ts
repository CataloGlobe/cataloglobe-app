import type { StylePalette } from "@/components/ui/StyleSwatch/StyleSwatch";
import type { GroupWithValues } from "@/services/supabase/productOptions";
import type { FieldLanguageState } from "@/services/supabase/translationStatus";
import { INHERITED, type ProdottoPart } from "./prodottoCopy";

/** Una lingua del menù per la descrizione, col suo stato. */
export interface ProdottoLingua {
    code: string;
    /** «inglese», «spagnolo» (minuscolo, senza articolo). */
    name: string;
    state: FieldLanguageState;
}

/** Una scelta del cliente, già scritta. */
export interface ProdottoScelta {
    name: string;
    /** «una sola · obbligatoria», «fino a 3». */
    rule: string;
    options: { name: string; price: string }[];
}

/**
 * Quello che serve alle tessere, a «Oggi» e al telefono, preso dalle bozze
 * (prima del Salva) e dai dati del prodotto. Lo costruisce `ProductPage`.
 */
export interface ProdottoFacts {
    name: string;
    description: string;
    imageUrl: string | null;
    /** Il prodotto da cui viene, per una variante. */
    parentName: string | null;
    /** «da 2,50 €», «9,50 €», «—». */
    priceLabel: string;
    priceMode: "unico" | "formato";
    formats: { name: string; price: string }[];
    /** Una variante senza un prezzo suo usa quello del padre. */
    inheritsPrice: boolean;
    characteristics: string[];
    allergens: string[];
    ingredients: string[];
    pairings: string[];
    notes: { label: string; value: string }[];
    choices: ProdottoScelta[];
    /** Le scelte senza opzioni: il cliente non le vede. */
    emptyChoices: string[];
    optionsLoading: boolean;
    /** null mentre si carica. */
    languages: ProdottoLingua[] | null;
    catalogs: string[];
    places: string[];
    usageLoading: boolean;
    variants: string[];
    attributes: string[];
    /** Le parti che il verticale usa. */
    show: Record<ProdottoPart, boolean>;
    labels: {
        product: string;
        productPlural: string;
        /** «menù», «catalogo». */
        catalog: string;
        attributes: string;
        /** Il titolo della parte in cima: «Il piatto», o il nome del prodotto. */
        dish: string;
    };
    businessName: string;
    palette: StylePalette;
    styleName: string | null;
    /** Il menù da cui viene lo stile del telefono. */
    styleMenu: string | null;
}

/** L'id del campo descrizione: «Scrivila» di «Oggi» ci porta il cursore. */
export const DESCRIPTION_FIELD_ID = "prodotto-descrizione";

export const isVariant = (f: ProdottoFacts): boolean => f.parentName !== null;

/** Una parte che una variante prende dal prodotto da cui viene. */
export const inheritedPart = (f: ProdottoFacts, part: ProdottoPart): boolean =>
    isVariant(f) && INHERITED.includes(part);

/** Oggi nessuno lo vede (solo a dati caricati). */
export const hiddenToday = (f: ProdottoFacts): boolean => !f.usageLoading && f.places.length === 0;

/** «A», «A e B», «A, B e C». */
export function joinNames(names: string[]): string {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** «l'inglese», «lo spagnolo», «il francese». */
export function withArticle(name: string): string {
    if (/^[aeiou]/i.test(name)) return `l'${name}`;
    if (/^(s[^aeiou]|z|gn|ps|x|y)/i.test(name)) return `lo ${name}`;
    return `il ${name}`;
}

/** «una sola» · «fino a 3» · «quante vuole», più «obbligatoria». */
export function ruleText(group: GroupWithValues): string {
    const count =
        group.max_selectable === 1
            ? "una sola"
            : group.max_selectable === null
              ? "quante vuole"
              : `fino a ${group.max_selectable}`;
    return group.is_required ? `${count} · obbligatoria` : count;
}

export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Le lingue che il cliente non trova tradotte (in corso a parte). */
export function missingLanguages(f: ProdottoFacts): ProdottoLingua[] {
    return (f.languages ?? []).filter(l => l.state !== "done" && l.state !== "pending");
}

/** Le parti che si vedono sul telefono adesso. */
export function partOnPhone(part: ProdottoPart, f: ProdottoFacts): boolean {
    if (!f.show[part]) return false;
    switch (part) {
        case "piatto":
        case "prezzo":
            return true;
        case "caratteristiche":
            return !isVariant(f) && f.characteristics.length > 0;
        case "allergeni":
            return f.allergens.length > 0;
        case "scelte":
            return f.choices.length > 0;
        case "abbinamenti":
            return !isVariant(f) && f.pairings.length > 0;
        case "ingredienti":
            return f.ingredients.length > 0;
        case "note":
            return !isVariant(f) && f.notes.length > 0;
        default:
            return false;
    }
}
