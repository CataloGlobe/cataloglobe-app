// «È uguale per tutte le sedi?»: la scelta «insieme / al posto» sede per sede,
// menù per menù (o stile per stile). Puro. Di base ogni sede segue la risposta
// data sopra; una voce cambiata fa la sede «diversa» («Sì, uguale» le toglie tutte). Si salva col database nuovo.
import { DB_WAIT, type Scontro } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { Tunnel } from "./creaModel";

/** `ins`: insieme (menù) o «lascia l'altro» (stile); `pos`: al posto. */
export type HVal = "ins" | "pos";
/** Un altro menù (o stile) che la bozza incontra in una sede, e quando. */
export type HAltro = { con: string; quando: string };

const key = (sede: string, con: string) => sede + "|" + con;

/** Per sede, chi incontra: dagli scontri che la bozza vince, nell'ordine in cui arrivano. */
export function hAltri(scontri: readonly Scontro[]): Map<string, HAltro[]> {
    const m = new Map<string, HAltro[]>();
    for (const x of scontri)
        if (x.vince)
            for (const id of x.ids ?? []) {
                const l = m.get(id) ?? [];
                const cur = l.find(a => a.con === x.con);
                if (cur) cur.quando += ", " + x.quando;
                else l.push({ con: x.con, quando: x.quando });
                m.set(id, l);
            }
    return m;
}

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

/** La riga di una sede: chi sta col tuo e di chi prende il posto. */
export function hEsito(t: Tunnel, sede: string, altri: readonly HAltro[]): { ins: string[]; pos: string[] } {
    return { ins: altri.filter(a => hVal(t, sede, a.con) === "ins").map(a => a.con), pos: altri.filter(a => hVal(t, sede, a.con) === "pos").map(a => a.con) };
}

export const nTutteSedi = (n: number) => (n === 2 ? "tutte e due le sedi" : n === 3 ? "tutte e tre le sedi" : `tutte le ${n} sedi`);

/** Con una scelta diversa in una sede non si salva ancora: il database di oggi tiene una risposta per regola. */
export function sedePerWait(t: Tunnel, altri: ReadonlyMap<string, HAltro[]>): string {
    if (t.onda !== "on" || t.insieme == null || !hDiverse(t, altri)) return "";
    return "Scelte diverse fra le sedi: " + DB_WAIT;
}
