// Quali mancanze di un prodotto il backoffice segnala, e come si rilevano.
//
// REGOLA: ambra SOLO per le mancanze con una conseguenza funzionale.
// - prezzo assente   → il prodotto non è ordinabile
// - fuori catalogo   → il prodotto non è in nessun menù
// Immagine, descrizione, allergeni, ingredienti, caratteristiche e traduzioni
// NON si segnalano in lista: su staging 719 prodotti su 744 sono senza
// immagine e 736 senza caratteristiche — segnalarle renderebbe illeggibile
// anche il segnale che conta. I testi dicono cosa manca ("Senza prezzo",
// "Fuori catalogo"), mai un generico "Da configurare".
//
// ⚠️ "Fuori catalogo" è un fatto verificabile (zero righe in
// `catalog_category_products`), NON "invisibile ai clienti": un prodotto in un
// catalogo che nessuna regola di programmazione pubblica resta invisibile lo
// stesso. Rilevarlo richiederebbe la catena catalogo → schedule → sede, che
// qui non è disponibile. I testi UI non devono promettere più di così.
//
// ── Prezzo ──────────────────────────────────────────────────────────────
// "Questo prodotto ha un prezzo?" — formulazione UNICA lato dashboard.
//
// Prima di questo file la stessa domanda era scritta in tre modi diversi:
// `row.price === null && row.from_price === null` (CatalogEngine), la catena
// di rendering della colonna Prezzo (Products) e — con la forma del payload
// pubblico — `hasOrderablePrice` in
// `src/components/PublicCollectionView/itemPricing.ts`.
//
// ⚠️ Rapporto con `itemPricing.ts`: le due funzioni rispondono alla STESSA
// domanda su DUE forme di dato diverse e restano volutamente separate.
// `itemPricing` lavora sul payload risolto del catalogo pubblico
// (`optionGroups[].values[].absolutePrice`, camelCase, ereditarietà già
// applicata dal resolver); qui si lavora su `ProductListMetadata`, dove i
// formati sono GIÀ aggregati in `pricedFormatsCount` (conteggio dei soli
// formati con `absolute_price` valido, da `resolvePriceSummary`). Un adapter
// fra le due forme costerebbe più di quanto renda. La semantica coincide:
// - esiste un gruppo PRIMARY_PRICE con almeno un valore prezzato → prezzato
//   (`pricedFormatsCount > 0`);
// - gruppo presente ma senza valori prezzati → NON prezzato: `base_price` non
//   è un fallback, esattamente come nel server e nel resolver pubblico;
// - nessun formato → decide `base_price`.
// L'unico ramo che qui non è rappresentabile è "gruppo PRIMARY_PRICE esistente
// ma con zero valori prezzati mentre `base_price` è valorizzato": il metadata
// non distingue "nessun gruppo" da "gruppo senza valori prezzati"
// (`pricedFormatsCount === 0` in entrambi i casi), quindi la dashboard
// considera prezzato un prodotto in quello stato mentre il gate pubblico lo
// rifiuta. È l'unica divergenza nota ed è conservativa nel verso giusto: non
// segnala mai come "senza prezzo" un prodotto ordinabile.

/** Fatti sul prezzo di un singolo prodotto, come li espone `ProductListMetadata` + la riga prodotto. */
export type ProductPriceFacts = {
    /** `products.base_price`. NULL per una variante che eredita dal padre. */
    basePrice: number | null | undefined;
    /** Formati con prezzo valido (`ProductListMetadata.pricedFormatsCount`). */
    pricedFormatsCount?: number | null;
};

/**
 * Il prodotto ha un prezzo configurato, guardato in isolamento.
 *
 * NON applica l'ereditarietà variante→padre: per una riga variante usare
 * `hasConfiguredEffectivePrice`.
 */
export function hasConfiguredPrice(facts: ProductPriceFacts): boolean {
    if ((facts.pricedFormatsCount ?? 0) > 0) return true;
    return typeof facts.basePrice === "number" && Number.isFinite(facts.basePrice);
}

/**
 * Prezzo effettivo di una riga variante: la variante senza prezzo proprio
 * eredita quello del padre, quindi non è "da configurare" se il padre è
 * prezzato. Con `parent` assente (prodotto base, o variante senza padre noto)
 * degrada a `hasConfiguredPrice`.
 */
export function hasConfiguredEffectivePrice(
    own: ProductPriceFacts,
    parent?: ProductPriceFacts | null
): boolean {
    if (hasConfiguredPrice(own)) return true;
    return parent != null && hasConfiguredPrice(parent);
}

// ── Appartenenza a un catalogo ──────────────────────────────────────────

/** Fatti sull'appartenenza ai menù, da `ProductListMetadata.catalogsCount`. */
export type ProductCatalogFacts = {
    /** Menù distinti che contengono il prodotto (o la variante). */
    catalogsCount?: number | null;
};

/**
 * Il prodotto è in almeno un menù, guardato in isolamento.
 *
 * NON applica l'ereditarietà variante→padre: per una riga variante usare
 * `isInAnyCatalogEffective`.
 */
export function isInAnyCatalog(facts: ProductCatalogFacts): boolean {
    return (facts.catalogsCount ?? 0) > 0;
}

/**
 * Appartenenza effettiva di una riga variante: nella pagina pubblica la
 * variante si raggiunge attraverso il prodotto base, quindi un padre in
 * catalogo la rende raggiungibile anche senza un collegamento proprio.
 * Stessa forma dell'ereditarietà del prezzo.
 */
export function isInAnyCatalogEffective(
    own: ProductCatalogFacts,
    parent?: ProductCatalogFacts | null
): boolean {
    if (isInAnyCatalog(own)) return true;
    return parent != null && isInAnyCatalog(parent);
}

// ── Aggregato ───────────────────────────────────────────────────────────

/** Tutti i fatti che concorrono alle mancanze segnalate, per un prodotto. */
export type ProductCompletenessFacts = ProductPriceFacts & ProductCatalogFacts;

/** Le mancanze segnalate. Una sola sorgente per badge, filtri e contatori. */
export type ProductIssues = {
    missingPrice: boolean;
    outOfCatalog: boolean;
};

/**
 * Mancanze di un prodotto, con l'ereditarietà dal padre applicata a entrambe
 * le domande. `parent` assente = prodotto base.
 */
export function getProductIssues(
    own: ProductCompletenessFacts,
    parent?: ProductCompletenessFacts | null
): ProductIssues {
    return {
        missingPrice: !hasConfiguredEffectivePrice(own, parent),
        outOfCatalog: !isInAnyCatalogEffective(own, parent)
    };
}

/** Almeno una mancanza da segnalare. Sorgente del filtro e dei contatori. */
export function hasAnyIssue(issues: ProductIssues): boolean {
    return issues.missingPrice || issues.outOfCatalog;
}
