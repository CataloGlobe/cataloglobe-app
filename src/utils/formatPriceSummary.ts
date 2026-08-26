import { formatCurrency } from "@/utils/formatCurrency";
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
 * Traduce i fatti (`PriceSummary`) nella stringa da mostrare: "€ X,XX" /
 * "da € X,XX" / null. Riprende la struttura della stringa i18n pubblica
 * `product.price_from` ("da {{price}}") senza chiamare `t()` (nessuna
 * dipendenza da i18next in una utility pura testabile in isolamento).
 * Il separatore decimale è la virgola italiana via `formatCurrency` — la
 * pagina pubblica usa ancora `toFixed(2)` inline (punto) ed è fuori
 * perimetro qui: migrazione tracciata nel task Notion sulla formattazione
 * monetaria. Il campo `max` di `summary` non è ancora usato: è il punto di
 * innesto per una futura sintesi a range, non implementata ora.
 */
export function formatPriceSummary(
    summary: PriceSummary,
    options?: PriceSummaryFormatOptions
): string | null {
    const currencySymbol = options?.currencySymbol ?? "€";

    if (summary.kind === "none" || summary.min === null) {
        return null;
    }

    const minLabel = formatCurrency(summary.min, currencySymbol);

    if (summary.kind === "single") {
        return minLabel;
    }

    return `da ${minLabel}`;
}
