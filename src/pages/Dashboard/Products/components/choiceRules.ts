/** Regole di scelta di un gruppo Configurazioni (logica pura, lotto Prodotti P7). */

export type MaxSelectableMode = "one" | "many";

/**
 * `max_selectable` dal form. `null` = senza limite (è lo stato più comune in
 * staging, e resta valido): «più d'una» con N vuoto. N = 1, 0 o non intero è
 * un errore, mai un limite deciso in silenzio (r.8).
 */
export type ParsedMaxSelectable = { ok: true; value: number | null } | { ok: false; error: string };

export const MAX_SELECTABLE_ERROR = "Scrivi un numero da 2 in su, o lascia vuoto per nessun limite.";

export function parseMaxSelectable(mode: MaxSelectableMode, n: string): ParsedMaxSelectable {
    if (mode === "one") return { ok: true, value: 1 };
    const trimmed = n.trim();
    if (trimmed === "") return { ok: true, value: null };
    if (!/^\d+$/.test(trimmed) || Number(trimmed) < 2) return { ok: false, error: MAX_SELECTABLE_ERROR };
    return { ok: true, value: Number(trimmed) };
}

/** Il controllo per un gruppo che esiste: `null` si apre «più d'una, senza limite». */
export function choiceRulesFromMax(max: number | null): { mode: MaxSelectableMode; n: string } {
    if (max === null) return { mode: "many", n: "" };
    if (max > 1) return { mode: "many", n: String(max) };
    return { mode: "one", n: "2" };
}

/** Frase collassata di riepilogo delle regole di scelta — deve restare
 * coerente coi valori reali del gruppo anche quando il pannello è chiuso
 * (in modifica di un gruppo esistente i default possono non essere quelli
 * di fabbrica "una sola/facoltativo"). */
export function describeChoiceRules(mode: MaxSelectableMode, n: string, required: boolean): string {
    const parsed = parseMaxSelectable(mode, n);
    const countPart =
        mode === "one"
            ? "una sola opzione"
            : parsed.ok && parsed.value === null
              ? "più opzioni, senza limite"
              : `fino a ${parsed.ok ? parsed.value : "più"} opzioni`;
    const requiredPart = required ? "e deve sceglierla per ordinare" : "e può anche non sceglierla";
    return `Il cliente sceglie ${countPart}, ${requiredPart}.`;
}
