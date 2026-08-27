import type { ActiveCatalogMeta } from "@/services/supabase/activeCatalog";

/**
 * Esito della fetch batch `getActiveCatalogForActivities`, valido per l'intero
 * blocco: una sola chiamata risolve tutte le sedi, quindi lo stato è comune.
 */
export type CatalogFetchStatus = "loading" | "ready" | "error";

/**
 * Stato del "menù attivo ora" per UNA sede. Quattro valori, non tre: il
 * fallimento della risoluzione non è "nessun menù attivo". Dire a chi guarda
 * che la vetrina è spenta quando in realtà non lo sappiamo è peggio che
 * ammettere di non saperlo — porta a intervenire su una programmazione che
 * magari sta funzionando.
 */
export type ActiveCatalogState = "loading" | "resolved" | "none" | "error";

/** Risoluzione fallita: stato ignoto, mai presentato come "spento". */
export const ACTIVE_CATALOG_ERROR_LABEL = "Stato menù non disponibile";

/** Nessuna regola copre questo istante. Vetrina spenta per davvero. */
export const ACTIVE_CATALOG_NONE_LABEL = "Nessun menù attivo in questo momento";

/** Variante breve per card e tabella Sedi, dove la colonna è già intitolata. */
export const ACTIVE_CATALOG_NONE_SHORT_LABEL = "Nessun catalogo attivo";

/**
 * Catalogo risolto ma senza nome leggibile. Caso raro (dato incompleto), ma
 * distinto da "nessun catalogo": la vetrina è accesa, manca solo l'etichetta.
 */
export const ACTIVE_CATALOG_UNNAMED_LABEL = "Menù senza nome";

/**
 * Deriva lo stato per-sede da esito della fetch + riga della mappa.
 *
 * Una sede assente dalla mappa a fetch riuscita è un'anomalia, non un "nessun
 * menù": il resolver restituisce una riga per ogni id richiesto. Trattarla come
 * `error` evita di spacciare un buco per una risposta.
 */
export function deriveActiveCatalogState(
    status: CatalogFetchStatus,
    meta: ActiveCatalogMeta | null | undefined
): ActiveCatalogState {
    if (status === "loading") return "loading";
    if (status === "error") return "error";
    if (!meta) return "error";
    return meta.hasActiveCatalog ? "resolved" : "none";
}

/** Nome da mostrare a stato `resolved`. Mai stringa vuota. */
export function activeCatalogDisplayName(meta: ActiveCatalogMeta | null | undefined): string {
    const name = meta?.catalogName?.trim();
    return name ? name : ACTIVE_CATALOG_UNNAMED_LABEL;
}
