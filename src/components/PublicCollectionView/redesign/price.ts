import { formatDecimal } from "@/utils/formatCurrency";

/**
 * Prezzo della pagina pubblica nuova (spec §6): virgola, simbolo dopo, spazio
 * che non va a capo. `22` → «22,00 €». La pagina di oggi resta su «€ 22,00».
 */
export function formatPublicPrice(value: number): string {
    return `${formatDecimal(value)}\u00a0€`;
}

/** Sovrapprezzo di una scelta: solo se c'è, mai «+0» né «incluso». */
export function formatSurcharge(value: number | null | undefined): string | null {
    return value != null && value > 0 ? `+${formatPublicPrice(value)}` : null;
}
