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
 * Traduce i fatti (`PriceSummary`) nella stringa da mostrare — stesso
 * output di oggi ("€X.XX" / "da €X.XX" / null), solo consolidato in un
 * punto solo. Il campo `max` di `summary` non è ancora usato qui: è il
 * punto di innesto per una futura sintesi a range, non implementata ora.
 */
export function formatPriceSummary(
    summary: PriceSummary,
    options?: PriceSummaryFormatOptions
): string | null {
    const currencySymbol = options?.currencySymbol ?? "€";

    if (summary.kind === "none" || summary.min === null) {
        return null;
    }

    const minLabel = `${currencySymbol}${summary.min.toFixed(2)}`;

    if (summary.kind === "single") {
        return minLabel;
    }

    return `da ${minLabel}`;
}
