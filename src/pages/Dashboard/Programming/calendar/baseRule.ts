import type { LayoutRule } from "@/services/supabase/layoutScheduling";

/**
 * Regola di base: sempre, in tutte le sedi, senza date. Per il menù vale una
 * `layout` o una `menu`, per lo stile una `layout` o una `style` (multi menù:
 * le `layout` diventano una `menu` e una `style`).
 */
const isBaseFor = (r: LayoutRule, part: "menu" | "style") =>
    r.enabled &&
    r.applyToAll &&
    r.time_mode === "always" &&
    !r.start_at &&
    !r.end_at &&
    (part === "menu"
        ? (r.rule_type === "layout" || r.rule_type === "menu") && !!r.layout?.catalog_id
        : (r.rule_type === "layout" || r.rule_type === "style") && !!r.layout?.style_id);

const isBaseMenu = (r: LayoutRule) => isBaseFor(r, "menu");

/** Menù e stile di base, anche da due regole diverse; null se ne manca uno. */
export const basePair = (rules: readonly LayoutRule[]): { catalogId: string; styleId: string } | null => {
    const catalogId = rules.find(r => isBaseFor(r, "menu"))?.layout?.catalog_id;
    const styleId = rules.find(r => isBaseFor(r, "style"))?.layout?.style_id;
    return catalogId && styleId ? { catalogId, styleId } : null;
};

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
