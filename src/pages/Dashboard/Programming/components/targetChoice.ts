import type { TargetMode } from "./TargetSection";

export type TargetChoice = { targetMode: TargetMode; activityIds: string[]; groupIds: string[] };

/**
 * Dalle sedi spuntate al «dove» della regola (D151): tutte prese = tutte, anche
 * quelle che si aggiungeranno; un gruppo intero = il gruppo, anche chi ci entrerà.
 * Una regola già su più gruppi resta sui suoi gruppi finché le sedi spuntate
 * sono ancora esattamente le loro: riaprire la scelta non la fa diventare
 * «sedi specifiche».
 */
export function targetChoice(
    next: readonly string[],
    sedi: readonly { id: string }[],
    gruppi: readonly { id: string; sedeIds: readonly string[] }[],
    current: { allowAllSites: boolean; groupIds: readonly string[] }
): TargetChoice {
    if (current.allowAllSites && sedi.length > 1 && next.length === sedi.length) return { targetMode: "all", activityIds: [], groupIds: [] };
    const g = gruppi.find(x => x.sedeIds.length > 1 && x.sedeIds.length === next.length && x.sedeIds.every(id => next.includes(id)));
    if (g) return { targetMode: "groups", activityIds: [], groupIds: [g.id] };
    const mine = gruppi.filter(x => current.groupIds.includes(x.id) && x.sedeIds.length > 0 && x.sedeIds.every(id => next.includes(id)));
    const covered = new Set(mine.flatMap(x => x.sedeIds));
    if (mine.length > 1 && next.every(id => covered.has(id))) return { targetMode: "groups", activityIds: [], groupIds: mine.map(x => x.id) };
    return { targetMode: "activities", activityIds: [...next], groupIds: [] };
}
