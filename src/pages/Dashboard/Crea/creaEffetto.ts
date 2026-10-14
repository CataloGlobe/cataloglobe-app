// «Cosa cambia nel calendario» in «Controlla»: una riga di somma e, sotto, le sedi
// raccolte per ciò che succede. Puro: i fatti arrivano dalla settimana (`SedeEff`).
import { q } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { hoursText, listIt, type SedeEff } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { CreaKind as Kind } from "./creaModel";

export type EffIco = "off" | "posto" | "insieme" | "solo";
export type EffGroup = { key: string; ico: EffIco; lab: string; hrs: string; ids: string[]; off: boolean };
export type EffSum = { on: number; same: boolean; mins: number; groups: EffGroup[] };

const hrs = (x: SedeEff) => x.days + " " + (x.days === 1 ? "giorno" : "giorni") + ", " + hoursText(x.mins);

/** Cosa succede in una sede: `insieme` = sta con gli altri (menù insieme, stile che lascia gli altri). */
export function effLab(x: SedeEff, kind: Kind, insieme: boolean): { lab: string; ico: EffIco } {
    if (!x.mins) return { lab: x.by.length ? "Questa settimana non va mai in onda: lo copre " + listIt(x.by.map(q)) : "Questa settimana non c'è", ico: "off" };
    if (!x.cov.length) return { lab: kind === "stile" ? "Non incrocia altri stili" : kind === "menu" ? "Non incrocia altri menù" : "Non incrocia altri contenuti", ico: "solo" };
    const who = listIt(x.cov.map(q));
    if (!insieme) return { lab: "Prende il posto di " + who, ico: "posto" };
    return { lab: kind === "stile" ? "Lascia " + who : "Insieme a " + who + (kind === "menu" ? ": il cliente sceglie" : ""), ico: "insieme" };
}

/** Le sedi con lo stesso esito stanno insieme: prima quelle in onda, poi le più numerose. */
export function effSum(sedi: readonly SedeEff[], kind: Kind, insieme: boolean): EffSum {
    const on = sedi.filter(x => x.mins);
    const same = on.length > 0 && on.every(x => x.mins === on[0].mins && x.days === on[0].days);
    const g = new Map<string, EffGroup>();
    for (const x of sedi) {
        const { lab, ico } = effLab(x, kind, insieme);
        const h = same || !x.mins ? "" : hrs(x);
        const key = lab + "|" + h;
        const cur = g.get(key);
        if (cur) cur.ids.push(x.id);
        else g.set(key, { key, ico, lab, hrs: h, ids: [x.id], off: !x.mins });
    }
    const groups = [...g.values()].sort((a, b) => Number(a.off) - Number(b.off) || b.ids.length - a.ids.length);
    return { on: on.length, same, mins: on[0]?.mins ?? 0, groups };
}

/** Le sedi di un gruppo da mostrare: fino a quattro tutte, oltre le prime tre e «+N». */
export const effChips = (ids: readonly string[], open: boolean): { ids: string[]; more: number } =>
    open || ids.length <= 4 ? { ids: [...ids], more: 0 } : { ids: ids.slice(0, 3), more: ids.length - 3 };
