import type { LayoutRule } from "@/services/supabase/layoutScheduling";

/** La regola di base del menù: sempre, in tutte le sedi, senza date. */
const isBaseMenu = (r: LayoutRule) =>
    r.enabled && r.rule_type === "layout" && r.applyToAll && r.time_mode === "always" && !r.start_at && !r.end_at && !!r.layout?.catalog_id;

/**
 * Spegnere questa regola lascerebbe il locale senza menù: è la sola regola di
 * base accesa. Si spegne solo quando un altro menù la sostituisce (D238).
 */
export const lastBaseMenu = (rules: readonly LayoutRule[], ruleId: string | null | undefined): boolean => {
    const r = rules.find(x => x.id === ruleId);
    return !!r && isBaseMenu(r) && !rules.some(x => x.id !== r.id && isBaseMenu(x));
};

export const LAST_BASE_TIP = "È il menù di base: lo vedono i clienti di tutte le sedi quando non c'è altro in onda. Prima metti in onda un altro menù sempre e in tutte le sedi.";
