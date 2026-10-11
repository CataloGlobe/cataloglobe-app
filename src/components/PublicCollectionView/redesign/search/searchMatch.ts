import type { CollectionViewSection, CollectionViewSectionItem } from "@/components/PublicCollectionView/CollectionView/CollectionView";

/**
 * Ricerca del redesign (spec §4): stesso punteggio della `SearchOverlay` di
 * oggi (nome che inizia con la parola 100, parola intera 50, pezzo di nome 20,
 * varianti 40/15, descrizione 5 solo senza altro), più i tratti da evidenziare
 * nel nome. Puro, senza DOM.
 */

/** Minuscole, senza accenti né spazi ai lati. */
export function normalizeForSearch(text: string): string {
    return foldWithMap(text).folded.trim();
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function scoreItem(item: CollectionViewSectionItem, query: string): number {
    if (!query) return 0;
    const word = new RegExp(`\\b${escapeRegex(query)}\\b`);
    const name = normalizeForSearch(item.name ?? "");
    let score = 0;
    if (name.startsWith(query) && word.test(name)) score = 100;
    else if (word.test(name)) score = 50;
    else if (name.includes(query)) score = 20;
    for (const variant of item.variants ?? []) {
        const variantName = normalizeForSearch(variant?.name ?? "");
        if (word.test(variantName)) score = Math.max(score, 40);
        else if (variantName.includes(query)) score = Math.max(score, 15);
    }
    if (score === 0 && normalizeForSearch(item.description ?? "").includes(query)) score = 5;
    return score;
}

export type SearchHit = { item: CollectionViewSectionItem; score: number };
export type SearchGroup = { section: CollectionViewSection; hits: SearchHit[] };

/**
 * Risultati per sezione, nell'ordine del menu; dentro la sezione per punteggio
 * (a pari punteggio l'ordine del menu). Un piatto in più sezioni compare una
 * volta, nella prima.
 */
export function searchSections(sections: readonly CollectionViewSection[], rawQuery: string): SearchGroup[] {
    const query = normalizeForSearch(rawQuery);
    if (!query) return [];
    const seen = new Set<string>();
    const groups: SearchGroup[] = [];
    for (const section of sections) {
        const hits: SearchHit[] = [];
        for (const item of section.items) {
            if (seen.has(item.id)) continue;
            const score = scoreItem(item, query);
            if (score === 0) continue;
            seen.add(item.id);
            hits.push({ item, score });
        }
        if (hits.length === 0) continue;
        // sort stabile: a pari punteggio resta l'ordine del menu
        hits.sort((a, b) => b.score - a.score);
        groups.push({ section, hits });
    }
    return groups;
}

export function countHits(groups: readonly SearchGroup[]): number {
    return groups.reduce((sum, group) => sum + group.hits.length, 0);
}

/** Pezzi del testo originale, con `match` sui tratti che corrispondono alla ricerca. */
export type TextPart = { text: string; match: boolean };

export function highlightParts(text: string, rawQuery: string): TextPart[] {
    const query = normalizeForSearch(rawQuery);
    if (!query || !text) return text ? [{ text, match: false }] : [];
    const { folded, origin } = foldWithMap(text);
    const parts: TextPart[] = [];
    let cursor = 0;
    let from = folded.indexOf(query);
    while (from !== -1) {
        const start = origin[from];
        const end = from + query.length < origin.length ? origin[from + query.length] : text.length;
        if (start > cursor) parts.push({ text: text.slice(cursor, start), match: false });
        parts.push({ text: text.slice(start, end), match: true });
        cursor = end;
        from = folded.indexOf(query, from + query.length);
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
    return parts;
}

/** Testo piegato (minuscole, senza segni diacritici) e, per ogni suo carattere, l'indice nel testo originale. */
function foldWithMap(text: string): { folded: string; origin: number[] } {
    let folded = "";
    const origin: number[] = [];
    let index = 0;
    for (const char of text) {
        const piece = char.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        for (let k = 0; k < piece.length; k++) origin.push(index);
        folded += piece;
        index += char.length;
    }
    return { folded, origin };
}
