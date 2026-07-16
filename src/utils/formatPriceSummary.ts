import type { PriceSummary } from "@/utils/priceSummary";

/**
 * Dove viene mostrato il prezzo — riservato a rese future differenziate per
 * contesto (es. un domani il backoffice potrebbe voler mostrare un range
 * dove il pubblico mostra ancora "da X"). Oggi non cambia l'output: la
 * decisione su "da X" vs range resta fuori da questa funzione fondamenta.
 */
export type PriceDisplayContext = "public" | "backoffice";

export type PriceSummaryFormatOptions = {
    context?: PriceDisplayContext;
    currencySymbol?: string;
};

/**
 * Traduce i fatti (`PriceSummary`) nella stringa da mostrare, riprendendo
 * il pattern della stringa i18n pubblica `product.price_from` ("da
 * {{price}}" con price = "€ X.XX" — vedi CollectionView.tsx): "€ X.XX" /
 * "da € X.XX" / null. Non chiama `t()` direttamente (nessuna dipendenza da
 * i18next in una utility pura testabile in isolamento) — riproduce lo
 * stesso output a mano. Il backoffice ha oggi una convenzione diversa
 * (virgola, simbolo dopo il numero) non ancora unificata qui: nessun call
 * site chiama questa funzione in questo step, quindi non c'è nulla da
 * preservare per quel lato finché lo step 2 non lo collega. Il campo `max`
 * di `summary` non è ancora usato: è il punto di innesto per una futura
 * sintesi a range, non implementata ora.
 */
export function formatPriceSummary(
    summary: PriceSummary,
    options?: PriceSummaryFormatOptions
): string | null {
    const currencySymbol = options?.currencySymbol ?? "€";

    if (summary.kind === "none" || summary.min === null) {
        return null;
    }

    const minLabel = `${currencySymbol} ${summary.min.toFixed(2)}`;

    if (summary.kind === "single") {
        return minLabel;
    }

    return `da ${minLabel}`;
}
