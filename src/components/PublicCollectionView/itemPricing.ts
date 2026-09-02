// Predicato di ordinabilità per prezzo — colocato e testabile in isolamento
// (i test Vitest girano in `environment: node` e non possono importare alberi
// UI .tsx, stesso criterio di framedMediaPath.ts / parseInlineEmphasis.ts).
//
// ⚠️ Allineato a supabase/functions/_shared/validateOrderItems.ts:664-700:
// il server calcola l'unit price da PRIMARY_PRICE (absolute_price del valore
// scelto) OPPURE, in assenza di gruppo PRIMARY_PRICE, da products.base_price;
// se nessuno dei due fornisce un numero lancia INVALID_OPTIONS
// (`primary_value_missing_price` / `product_missing_base_price`).
// Qui replichiamo la stessa domanda lato client PRIMA che il prodotto entri
// nel carrello, così il totale mostrato non è mai falso.
//
// NB semantico: il gate NON dice "prodotto senza prezzo = fuori dal menù".
// Dice: di questo prodotto non conosciamo il prezzo, quindi non è aggiungibile
// alla selezione. Resta visibile e consultabile. La formulazione resta valida
// per un futuro stato esplicito "su richiesta / prezzo di mercato": anche
// allora il prodotto non sarà ordinabile.

/** Un prezzo è utilizzabile solo se è un numero finito. */
export function isOrderablePrice(price: number | null | undefined): boolean {
    return typeof price === "number" && Number.isFinite(price);
}

export type PriceableOptionValue = {
    absolutePrice?: number | null;
};

export type PriceableOptionGroup = {
    group_kind?: string | null;
    values?: PriceableOptionValue[] | null;
};

/**
 * Forma minima e strutturale dell'item: NON importa
 * `CollectionViewSectionItem` (vive in un .tsx). Il tipo reale è un
 * sovra-insieme compatibile.
 */
export type PriceableItem = {
    price?: number | null;
    effective_price?: number | null;
    optionGroups?: PriceableOptionGroup[] | null;
};

function findPrimaryPriceGroup(
    item: PriceableItem
): PriceableOptionGroup | undefined {
    return (item.optionGroups ?? []).find(
        g => g.group_kind?.toUpperCase() === "PRIMARY_PRICE"
    );
}

/**
 * Il prodotto ha almeno un prezzo utilizzabile per l'ordinazione?
 *
 * Copre i tre casi che il server rifiuta:
 * - `base_price` NULL e nessun gruppo PRIMARY_PRICE con valori
 * - gruppo PRIMARY_PRICE presente ma senza alcun valore
 * - prodotto "formats" senza alcun formato prezzato
 *
 * Quando il gruppo PRIMARY_PRICE esiste, `base_price` NON è un fallback: è la
 * stessa precedenza del server (`primaryGroup && primaryValue` vince) e del
 * resolver pubblico.
 */
export function hasOrderablePrice(item: PriceableItem): boolean {
    const primary = findPrimaryPriceGroup(item);
    if (primary) {
        return (primary.values ?? []).some(v => isOrderablePrice(v.absolutePrice));
    }
    return isOrderablePrice(item.effective_price ?? item.price);
}
