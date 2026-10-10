import { CAL_KINDS, dayCtx, fLane, hhmm, type Axis, type CalEntry, type CalKind, type CalSeat, type DayNum } from "./calendarModel";

/**
 * Più sedi nel Calendario (D150, E): una sede si legge come sempre, le altre
 * compaiono sotto il giorno solo dove fanno qualcosa di diverso, e dicono a
 * parole cosa cambia. Con «Tutte le sedi» o un gruppo il riferimento del
 * giorno è quello che fa la maggior parte.
 */

/** Un pezzo del programma di un giorno: una corsia, chi va in onda, da quando a quando. */
export type Pezzo = { k: CalKind; label: string; first: string; from: number; to: number };
export type Programma = { pezzi: Pezzo[]; key: string };
/** Le sedi che quel giorno fanno la stessa cosa diversa, e cosa cambia. */
export type Diversi = { ids: string[]; prog: Programma; what: string };

const pezzoKey = (x: Pezzo) => `${x.k}|${x.label}|${x.from}|${x.to}`;

/** Due tratti vicini con la stessa cosa in onda sono un pezzo solo (sotto può cambiare, qui non conta). */
export function unisci(pezzi: readonly Pezzo[]): Pezzo[] {
    const out: Pezzo[] = [];
    for (const x of pezzi) {
        const last = out[out.length - 1];
        if (last && last.k === x.k && last.label === x.label && last.to === x.from) last.to = x.to;
        else out.push({ ...x });
    }
    return out;
}

export function programmaDi(pezzi: readonly Pezzo[]): Programma {
    const p = unisci(pezzi);
    return { pezzi: p, key: p.map(pezzoKey).join(";") };
}

/** Il programma di una sede in un giorno, corsia per corsia. */
export function programma(entries: readonly CalEntry[], seat: CalSeat, day: DayNum, axis: Axis): Programma {
    return programmaDi(
        CAL_KINDS.flatMap(k =>
            fLane(dayCtx(entries, k, seat, day), axis)
                .filter(g => g.onda.length)
                .map(g => ({ k, label: g.onda.join(" + "), first: g.onda[0], from: g.from, to: g.to }))
        )
    );
}

// «12–15», «18:30–21»
const ora = (m: number) => hhmm(m).replace(/:00$/, "").replace(/^0(\d)/, "$1");
const fh = (x: Pezzo) => `${ora(x.from)}–${ora(x.to)}`;

/** «+ Aperitivo 18–21 · senza Pranzo · Brunch 10–14 invece di 10–13». */
export function cosaCambia(o: readonly Pezzo[], base: readonly Pezzo[]): string {
    const bk = new Set(base.map(pezzoKey)),
        ok = new Set(o.map(pezzoKey));
    const added = o.filter(x => !bk.has(pezzoKey(x))),
        gone = base.filter(x => !ok.has(pezzoKey(x)));
    const used = new Set<Pezzo>();
    const out: string[] = [];
    for (const x of added) {
        const was = gone.find(y => !used.has(y) && y.k === x.k && y.label === x.label);
        if (was) {
            used.add(was);
            out.push(`${x.label} ${fh(x)} invece di ${fh(was)}`);
        } else out.push(`+ ${x.label} ${fh(x)}`);
    }
    for (const y of gone) if (!used.has(y)) out.push(`senza ${y.label}`);
    return out.join(" · ");
}

/** Le sedi raggruppate per programma uguale, le più numerose prima (a pari numero, nell'ordine dato). */
function perProgramma(progs: readonly (readonly [string, Programma])[]): (readonly [string, Programma])[][] {
    const by = new Map<string, (readonly [string, Programma])[]>();
    for (const x of progs) {
        const g = by.get(x[1].key);
        if (g) g.push(x);
        else by.set(x[1].key, [x]);
    }
    return [...by.values()].sort((a, b) => b.length - a.length);
}

/** Con una sede guardata: quante del confronto fanno lo stesso, e chi è diverso. */
export function confrontoGiorno(base: Programma, altre: readonly (readonly [string, Programma])[]): { same: number; diffs: Diversi[] } {
    const diverse = altre.filter(([, p]) => p.key !== base.key);
    return {
        same: altre.length - diverse.length,
        diffs: perProgramma(diverse).map(g => ({ ids: g.map(([id]) => id), prog: g[0][1], what: cosaCambia(g[0][1].pezzi, base.pezzi) }))
    };
}

/** Con «Tutte le sedi» o un gruppo: il riferimento è quello che fa la maggior parte, sotto chi è diverso. */
export function maggioranza(progs: readonly (readonly [string, Programma])[]): { base: Programma; baseIds: string[]; diffs: Diversi[] } | null {
    const groups = perProgramma(progs);
    if (!groups.length) return null;
    const [top, ...rest] = groups;
    const base = top[0][1];
    return {
        base,
        baseIds: top.map(([id]) => id),
        diffs: rest.map(g => ({ ids: g.map(([id]) => id), prog: g[0][1], what: cosaCambia(g[0][1].pezzi, base.pezzi) }))
    };
}
