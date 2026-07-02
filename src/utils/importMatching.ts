/**
 * Matching puro per l'import AI in un catalogo esistente (FASE 2B).
 *
 * Nessuna dipendenza da Supabase né da slugify: funzioni pure, testabili in
 * isolamento. Il name-compare usa `normalizeName` (case/accento/spazi
 * insensitive), distinto dallo slug (che serve solo per gli URL pubblici).
 *
 * Le decisioni finali per prodotto (Crea/Riusa/Salta) vengono prese in FASE 2C
 * combinando questi stati con le scelte dell'utente; qui si calcola solo lo
 * stato di partenza.
 */

/** Prodotto minimale usato per il confronto per nome. */
export interface MatchProduct {
    id: string;
    name: string;
}

export type ProductMatchStatus =
    | "in_category"
    | "reusable_single"
    | "reusable_ambiguous"
    | "none";

export type ProductMatchResult =
    | { status: "in_category" }
    | { status: "reusable_single"; productId: string }
    | { status: "reusable_ambiguous"; candidates: MatchProduct[] }
    | { status: "none" };

/** Gruppo di prodotti dello stesso scan con nome normalizzato identico. */
export interface InScanDuplicateGroup {
    normalized: string;
    ids: string[];
}

/**
 * Normalizza un nome per il confronto: minuscolo, trim, diacritici rimossi
 * (NFD + strip combining marks), spazi multipli collassati in uno.
 */
export function normalizeName(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

/** Lunghezza normalizzata minima per considerare un accostamento categoria valido. */
const SIMILAR_MIN_LENGTH = 3;

/**
 * Ritorna la categoria esistente "simile" (per suggerimento soft), o null.
 * Regola: normalizzati, una contiene l'altra, esclusa l'uguaglianza esatta
 * (es. "Primi" ~ "Primi Piatti"). Guardia falsi positivi: ignora i nomi
 * normalizzati troppo corti (< 3). Ritorna il nome ORIGINALE (casing intatto).
 *
 * SOLO hint UI: non usare per decisioni automatiche (il mapping esatto resta
 * gestito da `normalizeName` uguaglianza altrove).
 */
export function findSimilarCategory(aiName: string, existing: string[]): string | null {
    const a = normalizeName(aiName);
    if (a.length < SIMILAR_MIN_LENGTH) return null;

    for (const candidate of existing) {
        const e = normalizeName(candidate);
        if (e.length < SIMILAR_MIN_LENGTH) continue;
        if (e === a) continue;
        if (e.includes(a) || a.includes(e)) return candidate;
    }
    return null;
}

/**
 * Calcola lo stato di match di un prodotto AI rispetto al DB del tenant.
 *
 * - `in_category`       → già presente nella categoria di destinazione (Salta).
 * - `reusable_single`   → 1 solo match nel tenant fuori dalla categoria (Riusa auto).
 * - `reusable_ambiguous`→ ≥2 match nel tenant (scelta manuale in 2C).
 * - `none`              → nessun match (Crea).
 *
 * `existingInCategory` sono i prodotti già associati alla categoria di
 * destinazione risolta (NON l'intero catalogo). `existingInTenant` è il DB
 * globale del tenant (prodotti base).
 */
export function computeProductMatch(
    aiName: string,
    lists: { existingInCategory: MatchProduct[]; existingInTenant: MatchProduct[] }
): ProductMatchResult {
    const target = normalizeName(aiName);

    const inCategory = lists.existingInCategory.some(p => normalizeName(p.name) === target);
    if (inCategory) return { status: "in_category" };

    const tenantMatches = lists.existingInTenant.filter(p => normalizeName(p.name) === target);
    if (tenantMatches.length === 0) return { status: "none" };
    if (tenantMatches.length === 1) {
        return { status: "reusable_single", productId: tenantMatches[0].id };
    }
    return { status: "reusable_ambiguous", candidates: tenantMatches };
}

/**
 * Rileva i gruppi di prodotti dello STESSO scan con nome normalizzato identico
 * (badge "possibile doppione" in 2C). Non decide nulla: solo flag. Preserva
 * l'ordine di prima apparizione del gruppo.
 */
export function detectInScanDuplicates(
    aiProducts: ReadonlyArray<MatchProduct>
): InScanDuplicateGroup[] {
    const order: string[] = [];
    const byNorm = new Map<string, string[]>();

    for (const p of aiProducts) {
        const key = normalizeName(p.name);
        const ids = byNorm.get(key);
        if (ids) {
            ids.push(p.id);
        } else {
            byNorm.set(key, [p.id]);
            order.push(key);
        }
    }

    const groups: InScanDuplicateGroup[] = [];
    for (const key of order) {
        const ids = byNorm.get(key)!;
        if (ids.length >= 2) groups.push({ normalized: key, ids });
    }
    return groups;
}
