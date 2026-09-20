/**
 * Taglie del SystemDrawer (design system §5): `sm` 420 · `md` 520 · `lg` 720.
 * Sopra `lg` non esiste: è una route (regola 2).
 */
export type SystemDrawerSize = "sm" | "md" | "lg";

/** Soglie della mappatura width → size: la taglia più vicina per eccesso. */
const WIDTH_TO_SIZE: Array<[max: number, size: SystemDrawerSize]> = [
    [460, "sm"],
    [620, "md"],
    [800, "lg"]
];

const warned = new Set<string>();
function warnOnce(key: string, message: string) {
    if (!import.meta.env.DEV || warned.has(key)) return;
    warned.add(key);
    console.warn(`[SystemDrawer] ${message}`);
}

/**
 * Risolve taglia e larghezza esplicita. `size` vince; `width` numerica è
 * deprecata e mappata (≤ 460 → sm, ≤ 620 → md, ≤ 800 → lg) con un avviso in
 * dev; oltre 800 resta la larghezza com'era (route nel lotto 5).
 */
export function resolveDrawerSize(
    size: SystemDrawerSize | undefined,
    width: number | undefined
): { size: SystemDrawerSize; explicitWidth?: number } {
    if (size) return { size };
    if (width === undefined) return { size: "md" };
    const band = WIDTH_TO_SIZE.find(([max]) => width <= max);
    if (band) {
        warnOnce(`width:${width}`, `width={${width}} deprecata: usa size="${band[1]}"`);
        return { size: band[1] };
    }
    warnOnce(
        `width:${width}`,
        `width={${width}} è sopra lg (720): resta com'è, ma diventa una route nel lotto 5 (regola 2)`
    );
    return { size: "lg", explicitWidth: width };
}
