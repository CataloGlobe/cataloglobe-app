// «È uguale per tutte le sedi?»: la scelta «insieme / al posto» sede per sede,
// menù per menù (o stile per stile). Puro. Di base ogni sede segue la risposta
// data sopra; una voce cambiata fa la sede «diversa» («Sì, uguale» le toglie tutte). Si salva col database nuovo.
import { DB_WAIT, type Scontro, type SedeEff } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { Nascosto, Tunnel } from "./creaModel";

/** `ins`: insieme (menù) o «lascia l'altro» (stile); `pos`: al posto. */
export type HVal = "ins" | "pos";
/**
 * Un altro menù (o stile) che la bozza incontra in una sede, e quando.
 * `copre`: lì oggi vince lui (più vicino alla sede, orari più stretti): la scelta si fa lo stesso (D196).
 */
export type HAltro = { con: string; quando: string; copre?: boolean };

const key = (sede: string, con: string) => sede + "|" + con;
const q = (x: string) => "«" + x + "»";

/** Per sede, chi incontra: da tutti gli scontri, chiunque vinca oggi, nell'ordine in cui arrivano. */
export function hAltri(scontri: readonly Scontro[]): Map<string, HAltro[]> {
    const m = new Map<string, HAltro[]>();
    for (const x of scontri)
        for (const id of x.ids ?? []) {
            const l = m.get(id) ?? [];
            const cur = l.find(a => a.con === x.con);
            if (cur) {
                cur.quando += ", " + x.quando;
                cur.copre = cur.copre && !x.vince;
            } else l.push({ con: x.con, quando: x.quando, copre: !x.vince });
            m.set(id, l);
        }
    return m;
}

/** Le sedi dove almeno un altro oggi vince sul tuo. */
export const hCoperte = (altri: ReadonlyMap<string, HAltro[]>): string[] => [...altri].filter(([, l]) => l.some(a => a.copre)).map(([id]) => id);

export const hDef = (t: Tunnel): HVal | null => (t.insieme == null ? null : t.insieme ? "ins" : "pos");
export const hVal = (t: Tunnel, sede: string, con: string): HVal | null => (t.insieme == null ? null : (t.hm?.[key(sede, con)] ?? hDef(t)));
export const hDiff = (t: Tunnel, sede: string, altri: readonly HAltro[]): boolean => altri.some(a => hVal(t, sede, a.con) !== hDef(t));

/** Una voce scelta: tornando alla risposta di sopra, la riga sparisce. */
export function hSet(t: Tunnel, sede: string, con: string, v: HVal): void {
    const m = { ...(t.hm ?? {}) };
    if (v === hDef(t)) delete m[key(sede, con)];
    else m[key(sede, con)] = v;
    t.hm = m;
}

/** Quante sedi sono diverse dalla risposta di sopra. */
export const hDiverse = (t: Tunnel, altri: ReadonlyMap<string, HAltro[]>): number => [...altri].filter(([id, l]) => hDiff(t, id, l)).length;

/**
 * La riga di una sede: chi sta col tuo, di chi prende il posto e, per il menù,
 * chi resta da solo: un menù che oggi vince lì sta al posto degli altri (D196, punto 1),
 * quindi con «Insieme» il cliente vede solo lui e il tuo lì non si vede.
 */
export function hEsito(t: Tunnel, sede: string, altri: readonly HAltro[]): { ins: string[]; pos: string[]; solo: string[] } {
    const v = (a: HAltro) => hVal(t, sede, a.con);
    const solo = t.kind === "menu" ? altri.filter(a => a.copre && v(a) === "ins").map(a => a.con) : [];
    return { ins: altri.filter(a => v(a) === "ins" && !solo.includes(a.con)).map(a => a.con), pos: altri.filter(a => v(a) === "pos").map(a => a.con), solo };
}

/** Sotto la voce di un altro che oggi vince: cosa succede con la risposta scelta. */
export function hCopreText(t: Tunnel, a: HAltro, v: HVal | null): string {
    if (!a.copre || v == null) return "";
    if (v === "pos") return `Al posto di ${q(a.con)}, che oggi qui vince: ${DB_WAIT}.`;
    return t.kind === "stile" ? `Qui, in quelle ore, resta lo stile ${q(a.con)}.` : `${q(a.con)} sta al posto degli altri: qui, in quelle ore, il tuo non si vede.`;
}

/** Al posto di uno che oggi vince in quella sede: il database di oggi non lo sa dire. */
export function copreWait(t: Tunnel, altri: ReadonlyMap<string, HAltro[]>, names: ReadonlyMap<string, string>): string {
    if (t.onda !== "on" || t.insieme == null) return "";
    for (const [id, l] of altri) {
        const a = l.find(x => x.copre && hVal(t, id, x.con) === "pos");
        if (a) return `Al posto di ${q(a.con)} a ${names.get(id) ?? "una sede"}: ${DB_WAIT}`;
    }
    return "";
}

export const nTutteSedi = (n: number) => (n === 2 ? "tutte e due le sedi" : n === 3 ? "tutte e tre le sedi" : `tutte le ${n} sedi`);

/** Con una scelta diversa in una sede non si salva ancora: il database di oggi tiene una risposta per regola. */
export function sedePerWait(t: Tunnel, altri: ReadonlyMap<string, HAltro[]>): string {
    if (t.onda !== "on" || t.insieme == null) return "";
    // «Insieme» dove oggi vince l'altro è già quello che succede: non chiede il database nuovo
    const conta = [...altri].some(([id, l]) => l.some(a => hVal(t, id, a.con) !== hDef(t) && !(a.copre && hVal(t, id, a.con) === "ins")));
    if (!conta) return "";
    return "Scelte diverse fra le sedi: " + DB_WAIT;
}

/** Le sedi dove la settimana non lo mostra mai perché resta un altro (e non hai scelto di prenderne il posto). */
export function nascosto(t: Tunnel, sedi: readonly SedeEff[] | undefined): Nascosto | null {
    const l = (sedi ?? []).filter(x => !x.mins && x.by.length && x.by.every(c => hVal(t, x.id, c) !== "pos"));
    return l.length ? { sedi: l.map(x => x.name), by: [...new Set(l.flatMap(x => x.by))] } : null;
}

/** Le chiavi «sede|altro» degli incroci: in modifica si ricordano quelle di partenza. */
export const hKeys = (altri: ReadonlyMap<string, HAltro[]>): string[] => [...altri].flatMap(([id, l]) => l.map(a => key(id, a.con)));

/** In modifica: le sedi con un incrocio che alla partenza non c'era. */
export const hNuove = (altri: ReadonlyMap<string, HAltro[]>, base: readonly string[]): string[] => [...altri].filter(([id, l]) => l.some(a => !base.includes(key(id, a.con)))).map(([id]) => id);
