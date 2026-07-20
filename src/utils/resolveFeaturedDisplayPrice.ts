/**
 * Prezzo da mostrare per un prodotto featured — priorità: formato (fromPrice)
 * su prezzo unico (base_price). Stessa convenzione del resolver (#1/#2/#4):
 * quando esiste un gruppo PRIMARY_PRICE con valori, il gruppo vince sempre su
 * base_price, anche nel caso teorico (mai osservato nei dati) in cui un
 * prodotto abbia entrambi valorizzati.
 *
 * Nota: is_from_price non entra qui — decide solo l'ETICHETTA ("da X" vs
 * secco) a valle, non quale numero mostrare. Vedi FeaturedContentDetail.tsx.
 */
export function resolveFeaturedDisplayPrice(p: {
    fromPrice: number | null;
    base_price: number | null;
}): number | null {
    return p.fromPrice ?? p.base_price ?? null;
}
