// «Cosa cambia nel calendario» in «Controlla»: una riga di somma e, sotto, le sedi
// raccolte per ciò che succede. Puro: i fatti arrivano dalla settimana (`SedeEff`).
import { q } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { DB_WAIT, hoursText, listIt, type SedeEff } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { CreaKind as Kind } from "./creaModel";

export type EffIco = "off" | "posto" | "insieme" | "solo";
export type EffGroup = { key: string; ico: EffIco; lab: string; hrs: string; ids: string[]; off: boolean };
/** `on`: le sedi dove va in onda (anche quelle dove lo farà col database nuovo); `tot`: tutte quelle guardate. */
export type EffSum = { on: number; tot: number; same: boolean; mins: number; groups: EffGroup[] };

const hrs = (x: SedeEff) => x.days + " " + (x.days === 1 ? "giorno" : "giorni") + ", " + hoursText(x.mins);

/**
 * La risposta «insieme / al posto» per un altro in una sede: `ins` sta con gli altri
 * (menù insieme, stile che lascia gli altri), `pos` prende il posto. Con un booleano
 * vale la risposta unica, e chi oggi copre il tuo resta detto come prima (senza la scelta).
 */
export type EffVal = boolean | ((sede: string, con: string) => "ins" | "pos" | null);

/** Cosa succede in una sede. Anche dove oggi vince un altro si dice che cosa porta la scelta (D196). */
export function effLab(x: SedeEff, kind: Kind, val: EffVal): { lab: string; ico: EffIco } {
    const v = (con: string) => (typeof val === "function" ? val(x.id, con) : null);
    const ins = (con: string) => (typeof val === "function" ? val(x.id, con) === "ins" : val);
    const byPos = x.by.filter(c => v(c) === "pos"), byKeep = x.by.filter(c => v(c) === "ins");
    if (!x.mins) {
        if (!x.by.length) return { lab: "Questa settimana non c'è", ico: "off" };
        if (byPos.length) return { lab: "Prende il posto di " + listIt(byPos.map(q)) + ": " + DB_WAIT, ico: "posto" };
        if (byKeep.length) return { lab: kind === "stile" ? "Lascia " + listIt(byKeep.map(q)) + ": lì resta il suo stile" : "Non si vede: lì resta " + listIt(byKeep.map(q)) + ", al posto degli altri", ico: "off" };
        return { lab: `Questa settimana non va mai in onda: ${x.by.length > 1 ? "lo coprono" : "lo copre"} ` + listIt(x.by.map(q)), ico: "off" };
    }
    if (!x.cov.length && !byPos.length && !byKeep.length) return { lab: kind === "stile" ? "Non incrocia altri stili" : kind === "menu" ? "Non incrocia altri menù" : "Non incrocia altri contenuti", ico: "solo" };
    const posto = x.cov.filter(c => !ins(c)), insieme = x.cov.filter(c => ins(c)), out: string[] = [];
    if (posto.length) out.push("Prende il posto di " + listIt(posto.map(q)));
    if (insieme.length) out.push(kind === "stile" ? "Lascia " + listIt(insieme.map(q)) : "Insieme a " + listIt(insieme.map(q)) + (kind === "menu" ? ": il cliente sceglie" : ""));
    if (byPos.length) out.push((out.length ? "prende il posto di " : "Prende il posto di ") + listIt(byPos.map(q)) + ": " + DB_WAIT);
    if (byKeep.length) out.push((out.length ? "in parte resta " : "In parte resta ") + listIt(byKeep.map(q)));
    return { lab: out.join(" · "), ico: posto.length || byPos.length ? "posto" : insieme.length ? "insieme" : "solo" };
}

/** Le sedi con lo stesso esito stanno insieme: prima quelle in onda, poi le più numerose. */
export function effSum(sedi: readonly SedeEff[], kind: Kind, insieme: EffVal): EffSum {
    const on = sedi.filter(x => x.mins);
    const same = on.length > 0 && on.every(x => x.mins === on[0].mins && x.days === on[0].days);
    const g = new Map<string, EffGroup>();
    let n = 0;
    for (const x of sedi) {
        const { lab, ico } = effLab(x, kind, insieme), off = ico === "off";
        if (!off) n++;
        const h = same || !x.mins ? "" : hrs(x);
        const key = lab + "|" + h;
        const cur = g.get(key);
        if (cur) cur.ids.push(x.id);
        else g.set(key, { key, ico, lab, hrs: h, ids: [x.id], off });
    }
    const groups = [...g.values()].sort((a, b) => Number(a.off) - Number(b.off) || b.ids.length - a.ids.length);
    return { on: n, tot: sedi.length, same, mins: on[0]?.mins ?? 0, groups };
}

/** Le sedi di un gruppo da mostrare: fino a quattro tutte, oltre le prime tre e «+N». */
export const effChips = (ids: readonly string[], open: boolean): { ids: string[]; more: number } =>
    open || ids.length <= 4 ? { ids: [...ids], more: 0 } : { ids: ids.slice(0, 3), more: ids.length - 3 };
