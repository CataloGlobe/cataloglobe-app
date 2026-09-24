import type { RuleType } from "@/services/supabase/layoutScheduling";

/**
 * Il nome del tipo di regola, uno per tutta Programmazione (elenco, riga,
 * Settimana, dettaglio). «Layout» non si dice più: è «{Menù} e stile»
 * (dizionario #12), con la parola del verticale (§22).
 */
export function ruleTypeLabel(type: RuleType, catalogLabel: string): string {
    if (type === "layout") return `${catalogLabel} e stile`;
    if (type === "featured") return "In evidenza";
    if (type === "price") return "Prezzi";
    return "Disponibilità";
}
