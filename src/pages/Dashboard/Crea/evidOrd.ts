// In evidenza, «L'ordine» (D187): in cima al menù i contenuti stanno uno sotto
// l'altro e ogni sede tiene il suo ordine. Il nuovo parte per primo. L'ordine
// per sede lo tiene il database nuovo (`featured_content_positions`).
import type { CalEntry, CalWhere, DayNum } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { DB, DB_WAIT, NEW_MODEL, sediOf } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { Tunnel } from "./creaModel";

/** Il contenuto che si sta creando, dentro un ordine. */
export const ME = "me";
export type Other = { id: string; name: string };
/** Per ogni sede, gli altri contenuti in evidenza, dall'alto in basso. */
export type Others = Record<string, Other[]>;
type Sedi = Parameters<typeof sediOf>[1];
type Gruppi = Parameters<typeof sediOf>[2];

/** Gli altri contenuti in evidenza di ogni sede, dalle voci accese del Calendario non ancora finite. */
export function evOthers(entries: readonly CalEntry[], sedi: Sedi, groups: Gruppi, today: DayNum, selfId: string | null = null): Others {
    const out: Others = {};
    for (const e of entries) {
        if (e.kind !== "featured" || e.preview || (e.when.period && e.when.period.to < today)) continue;
        const where: CalWhere = e.where;
        for (const c of [...e.rule.featured_contents].sort((a, b) => a.sort_order - b.sort_order)) {
            if (`${e.ruleId}:featured:${c.featured_content_id}` !== e.id || c.featured_content_id === selfId) continue;
            for (const id of sediOf(where, sedi, groups)) {
                const list = (out[id] ??= []);
                if (!list.some(x => x.id === c.featured_content_id)) list.push({ id: c.featured_content_id, name: e.thing });
            }
        }
    }
    return out;
}

/** Le sedi scelte dove c'è già un altro contenuto: solo lì c'è un ordine da scegliere. */
export const ordIds = (ids: readonly string[], o: Others): string[] => ids.filter(id => (o[id]?.length ?? 0) > 0);

/** Il passo c'è? Creando un contenuto che va in onda, se in una delle sue sedi ce n'è già un altro. */
export const hasOrd = (t: Tunnel, ids: readonly string[] | undefined): boolean => NEW_MODEL.evid && t.kind === "evid" && !t.edit && !!ids?.length;

/** Rimette l'ordine in pari con le sedi scelte e coi contenuti che ci sono: i nuovi in fondo, i tolti via. */
export function syncOrd(t: Tunnel, ids: readonly string[], o: Others): void {
    const next: Record<string, string[]> = {};
    for (const id of ordIds(ids, o)) {
        const there = o[id].map(x => x.id);
        const kept = t.ordSame ? [] : (t.ord[id] ?? []).filter(x => x === ME || there.includes(x));
        next[id] = kept.includes(ME) ? [...kept, ...there.filter(x => !kept.includes(x))] : [ME, ...there];
    }
    t.ord = next;
    if (t.ordOpen && !next[t.ordOpen]) t.ordOpen = null;
}

/** «per primo», «per ultimo», «2° di 4». */
export function posTxt(arr: readonly string[]): string {
    const i = arr.indexOf(ME);
    return i <= 0 ? "per primo" : i === arr.length - 1 ? "per ultimo" : `${i + 1}° di ${arr.length}`;
}

/** Sposta una riga: da lì l'ordine non è più uguale in tutte le sedi. */
export function ordMove(t: Tunnel, id: string, i: number, j: number): void {
    const a = t.ord[id];
    if (!a || j < 0 || j >= a.length || i === j) return;
    a.splice(j, 0, a.splice(i, 1)[0]);
    t.ordSame = false;
}

/** «Sì»: di nuovo per primo dappertutto. */
export function ordFirst(t: Tunnel): void {
    t.ordSame = true;
    for (const id of Object.keys(t.ord)) t.ord[id] = [ME, ...t.ord[id].filter(x => x !== ME)];
    t.ordOpen = null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ordSummary(t: Tunnel, sede: (id: string) => string): string {
    const ids = Object.keys(t.ord);
    if (t.ordSame || !ids.length) return ids.length > 1 ? "Per primo in tutte le sedi" : "Per primo";
    return ids.length === 1 ? cap(posTxt(t.ord[ids[0]])) : ids.map(id => sede(id) + ": " + posTxt(t.ord[id])).join(" · ");
}

/** Un ordine diverso dal «per primo» lo tiene solo il database nuovo. */
export const ordWait = (t: Tunnel): string => (DB.ready || !NEW_MODEL.evid || t.kind !== "evid" || t.edit || t.ordSame || t.onda !== "on" ? "" : Object.values(t.ord).some(a => a[0] !== ME) ? "«L'ordine»: " + DB_WAIT : "");

/** Le righe da scrivere, sede per sede: la posizione di ogni contenuto, dall'alto. */
export function ordRows(t: Tunnel, selfId: string, ids: readonly string[]): { activity_id: string; featured_content_id: string; position: number }[] {
    return ids.flatMap(id => (t.ord[id] ?? [ME]).map((x, position) => ({ activity_id: id, featured_content_id: x === ME ? selfId : x, position })));
}
