import type { LeadPart } from "./vetrinaModel";

/** Le pill di Prodotti: le due mancanze, una alla volta (come oggi). */
export type ProdottiFilter = "all" | "missing-price" | "out-of-catalog";

/** «Ordina» di Prodotti (D209 chiusa, `MVO.prd` della copia). */
export type ProdottiSort = "gruppo" | "nome" | "prezzo-su" | "prezzo-giu" | "recenti";

export const PRODOTTI_SORT: readonly { value: ProdottiSort; label: string }[] = [
    { value: "gruppo", label: "Per gruppo, come nel menù" },
    { value: "nome", label: "Per nome, A–Z" },
    { value: "prezzo-su", label: "Prezzo, dal più basso" },
    { value: "prezzo-giu", label: "Prezzo, dal più alto" },
    { value: "recenti", label: "Ultimi creati" }
];

/** Quello che serve per ordinare una riga. */
export type ProdottoOrdine = {
    name: string;
    /** Posizione del primo gruppo del prodotto; senza gruppo va in fondo. */
    groupRank: number;
    /** Il prezzo più basso; senza prezzo è `null`. */
    price: number | null;
    createdAt: string;
};

/**
 * L'ordine scelto (`pPrd`): per gruppo tiene l'ordine dei gruppi e, dentro,
 * il nome; per prezzo i senza prezzo stanno sempre in fondo. A parità, il nome.
 */
export function sortProdotti<T extends ProdottoOrdine>(rows: readonly T[], sort: ProdottiSort): T[] {
    const byName = (a: T, b: T) => a.name.localeCompare(b.name, "it", { sensitivity: "base" });
    const out = [...rows];
    switch (sort) {
        case "gruppo":
            return out.sort((a, b) => a.groupRank - b.groupRank || byName(a, b));
        case "prezzo-su":
            return out.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || byName(a, b));
        case "prezzo-giu":
            return out.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity) || byName(a, b));
        case "recenti":
            return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byName(a, b));
        default:
            return out.sort(byName);
    }
}

/**
 * La frase in cima: «12 prodotti in 8 gruppi. Uno senza prezzo: nel menù si
 * vede senza cifra.» Senza gruppi la seconda metà non c'è.
 */
export function prodottiLead(total: number, groups: number, missingPrice: number, plural: string, catalog: string): LeadPart[] {
    const parts: LeadPart[] = [{ strong: `${total} ${plural}` }];
    if (groups > 0) parts.push({ text: ` in ${groups} ${groups === 1 ? "gruppo" : "gruppi"}.` });
    else parts.push({ text: "." });
    if (missingPrice > 0) {
        parts.push({ text: " " }, { down: `${missingPrice === 1 ? "Uno" : missingPrice} senza prezzo` });
        parts.push({ text: `: nel ${catalog} ${missingPrice === 1 ? "si vede" : "si vedono"} senza cifra.` });
    }
    return parts;
}
