/** Regole di scelta di un gruppo Configurazioni (logica pura, lotto Prodotti P7). */

export type MaxSelectableMode = "one" | "many";

export function parseMaxSelectable(mode: MaxSelectableMode, n: string): number | null {
    if (mode === "one") return 1;
    const parsed = parseInt(n, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Frase collassata di riepilogo delle regole di scelta — deve restare
 * coerente coi valori reali del gruppo anche quando il pannello è chiuso
 * (in modifica di un gruppo esistente i default possono non essere quelli
 * di fabbrica "una sola/facoltativo"). */
export function describeChoiceRules(mode: MaxSelectableMode, n: string, required: boolean): string {
    const parsedN = parseMaxSelectable(mode, n);
    const countPart = mode === "one" ? "una sola opzione" : `fino a ${parsedN ?? "più"} opzioni`;
    const requiredPart = required ? "e deve sceglierla per ordinare" : "e può anche non sceglierla";
    return `Il cliente sceglie ${countPart}, ${requiredPart}.`;
}
