import type { LayoutRule } from "@/services/supabase/layoutScheduling";

/** La regola di base del menù: sempre, in tutte le sedi, senza date. */
const isBaseMenu = (r: LayoutRule) =>
    r.enabled && r.rule_type === "layout" && r.applyToAll && r.time_mode === "always" && !r.start_at && !r.end_at && !!r.layout?.catalog_id;

/**
 * Spegnere questa regola lascerebbe il locale senza menù: è la sola regola di
 * base accesa. Si spegne solo quando un altro menù la sostituisce (D238).
 */
export const lastBaseMenu = (rules: readonly LayoutRule[], ruleId: string | null | undefined): boolean =>
    !!ruleId && removesLastBase(rules, [ruleId]);

/** Eliminare queste regole (#537) toglierebbe ogni regola di base accesa. */
export const removesLastBase = (rules: readonly LayoutRule[], ids: readonly string[]): boolean => {
    const gone = new Set(ids);
    return rules.some(r => gone.has(r.id) && isBaseMenu(r)) && !rules.some(r => !gone.has(r.id) && isBaseMenu(r));
};

export const LAST_BASE_TIP = "È il menù di base: lo vedono i clienti di tutte le sedi quando non c'è altro in onda. Prima metti in onda un altro menù sempre e in tutte le sedi.";

/** Eliminazione rifiutata perché è la sola regola di base: chi la mostra usa il messaggio. */
export class LastBaseError extends Error {
    constructor() {
        super(LAST_BASE_TIP);
        this.name = "LastBaseError";
    }
}
