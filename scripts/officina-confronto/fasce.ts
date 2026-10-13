// Prova a secco di M1 (fasce) e M2 (ore per sede), solo in memoria.
//
// `simulaM1` riempie le fasce come scritto nel pacchetto (parte 2, «Dati di
// oggi» di M1): una fascia per ogni regola `window`; una fascia 0-1440 coi
// giorni per le regole `always` che hanno dei giorni; nessuna fascia per le
// `always` senza giorni. `giudiceConFasce` è il giudice di oggi con il solo
// controllo dell'ora sostituito dalle fasce (anche quelle di ieri che passano
// la mezzanotte) e dalle sedi delle fasce (M2). L'ordine resta quello di
// `compareCandidates`: il giudice nuovo di M5 non è qui.
//
// Confrontando `calcolaEsito(simulaM1(foto), …, { giudice: giudiceConFasce })`
// con l'esito di oggi si vede se M1 e M2 cambiano qualcosa per il cliente.

import {
    COMPETITION_RULE_TYPES,
    compareCandidates,
    specificityFor,
    type CompetitionRule,
    type RankedRule,
    type RomeDateTime
} from "../../supabase/functions/_shared/scheduleCompetition";
import { cosaVede, type Giudice, type GiudiceContesto, type Snapshot, type SnapshotSlot } from "./model";

export type SlotTarget = {
    slot_id: string;
    target_type: "activity" | "activity_group";
    target_id: string;
};

export type SnapshotConFasce = Snapshot & { slots: SnapshotSlot[]; slot_targets?: SlotTarget[] };

function toMinutes(hhmm: string | null): number | null {
    if (!hhmm) return null;
    const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
    return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
}

/**
 * Le fasce di M1 dalle colonne di oggi. 23:59 vale 1440. Una fascia con la fine
 * prima dell'inizio passa la mezzanotte (fine + 1440): oggi una regola così non
 * è mai attiva, dopo M1 sì. Le fasce già presenti si tengono e la regola non
 * si riempie due volte.
 */
export function simulaM1(snapshot: Snapshot): SnapshotConFasce {
    const existing = snapshot.slots ?? [];
    const filled = new Set(existing.map(s => s.schedule_id));
    const slots: SnapshotSlot[] = [...existing];

    for (const s of snapshot.schedules) {
        if (filled.has(s.id)) continue;
        if (s.time_mode === "window") {
            const from = toMinutes(s.time_from);
            const rawTo = toMinutes(s.time_to);
            const to = rawTo === 23 * 60 + 59 ? 1440 : rawTo;
            let start = 0;
            let end = 1440;
            let days = s.days_of_week;
            if (from !== null && to !== null) {
                start = from;
                end = to < from ? to + 1440 : to;
                // Inizio uguale alla fine: oggi la regola non è mai attiva; una
                // fascia di durata zero non è ammessa, quindi nessun giorno.
                if (to === from) days = [];
            }
            slots.push({
                id: `sim-${s.id}`,
                schedule_id: s.id,
                days_of_week: days,
                start_minute: start,
                end_minute: end === start ? start + 1 : end
            });
        } else if (s.days_of_week !== null) {
            slots.push({
                id: `sim-${s.id}`,
                schedule_id: s.id,
                days_of_week: s.days_of_week,
                start_minute: 0,
                end_minute: 1440
            });
        }
    }
    return { ...snapshot, slots };
}

/** La fascia vale per la sede? Senza sedi proprie vale per tutte quelle della regola. */
function slotReaches(
    slot: SnapshotSlot,
    targetsBySlot: Map<string, SlotTarget[]>,
    activityId: string,
    groupIds: readonly string[]
): boolean {
    const targets = targetsBySlot.get(slot.id);
    if (!targets || targets.length === 0) return true;
    return targets.some(t =>
        t.target_type === "activity" ? t.target_id === activityId : groupIds.includes(t.target_id)
    );
}

/** Una fascia è attiva adesso, oggi o perché è partita ieri e passa la mezzanotte. */
export function slotActiveNow(slot: SnapshotSlot, now: RomeDateTime): boolean {
    const minute = now.hour * 60 + now.minute;
    const allows = (day: number) => slot.days_of_week === null || slot.days_of_week.includes(day);
    if (allows(now.dayOfWeek) && slot.start_minute <= minute && minute < slot.end_minute) return true;
    const yesterday = (now.dayOfWeek + 6) % 7;
    return slot.end_minute > 1440 && allows(yesterday) && minute < slot.end_minute - 1440;
}

/** Il periodo della regola, come oggi (inizio incluso, fine esclusa). */
function periodActive(rule: CompetitionRule, now: RomeDateTime): boolean {
    if (rule.start_at && now.epoch < new Date(rule.start_at).getTime()) return false;
    if (rule.end_at && now.epoch >= new Date(rule.end_at).getTime()) return false;
    if (rule.time_mode === "window" && rule.start_at && !rule.end_at) return false;
    return true;
}

/**
 * La regola come la vede l'ordine di oggi, ma con «ore» e «giorni» presi dalle
 * fasce: ore se una fascia non è 0-1440, giorni se una fascia ha dei giorni.
 * Così `compareCandidates` (non copiato) dà lo stesso punteggio che il giudice
 * nuovo leggerà dalle fasce.
 */
function asRankedRule(rule: CompetitionRule, slots: SnapshotSlot[]): CompetitionRule {
    if (slots.length === 0) return { ...rule, time_from: null, time_to: null, days_of_week: null };
    const hasHours = slots.some(s => s.start_minute !== 0 || s.end_minute !== 1440);
    const hasDays = slots.some(s => s.days_of_week !== null && s.days_of_week.length > 0);
    return {
        ...rule,
        time_from: hasHours ? "00:00" : null,
        time_to: hasHours ? "00:01" : null,
        days_of_week: hasDays ? [0] : null
    };
}

type FasceCache = {
    slotsBySchedule: Map<string, SnapshotSlot[]>;
    targetsBySlot: Map<string, SlotTarget[]>;
};

const caches = new WeakMap<GiudiceContesto, FasceCache>();

function cacheFor(ctx: GiudiceContesto): FasceCache {
    let cache = caches.get(ctx);
    if (!cache) {
        const snap = ctx.snapshot as SnapshotConFasce;
        const slotsBySchedule = new Map<string, SnapshotSlot[]>();
        for (const s of snap.slots ?? []) {
            slotsBySchedule.set(s.schedule_id, [...(slotsBySchedule.get(s.schedule_id) ?? []), s]);
        }
        const targetsBySlot = new Map<string, SlotTarget[]>();
        for (const t of snap.slot_targets ?? []) {
            targetsBySlot.set(t.slot_id, [...(targetsBySlot.get(t.slot_id) ?? []), t]);
        }
        cache = { slotsBySchedule, targetsBySlot };
        caches.set(ctx, cache);
    }
    return cache;
}

export const giudiceConFasce: Giudice = (ctx, activity, now) => {
    const { slotsBySchedule, targetsBySlot } = cacheFor(ctx);
    const rules = ctx.rulesByTenant.get(activity.tenant_id) ?? [];
    const seat = { activityId: activity.id, groupIds: activity.group_ids };
    const result = {} as ReturnType<Giudice>;

    for (const type of COMPETITION_RULE_TYPES) {
        const ranked: (RankedRule & { original: CompetitionRule })[] = [];
        for (const rule of rules) {
            if (rule.rule_type !== type || !rule.enabled) continue;
            const specificity = specificityFor(rule, seat);
            if (specificity === null) continue;
            const slots = slotsBySchedule.get(rule.id) ?? [];
            ranked.push({ rule: asRankedRule(rule, slots), specificity, original: rule });
        }
        ranked.sort(compareCandidates);

        const inPlay = ranked.filter(entry => {
            const rule = entry.original;
            if (rule.hasPayload === false || !periodActive(rule, now)) return false;
            const slots = (slotsBySchedule.get(rule.id) ?? []).filter(s =>
                slotReaches(s, targetsBySlot, activity.id, activity.group_ids)
            );
            const allSlots = slotsBySchedule.get(rule.id) ?? [];
            // Senza fasce la regola vale sempre; con fasce ma nessuna per questa
            // sede, la regola qui non vale.
            if (allSlots.length === 0) return true;
            return slots.some(s => slotActiveNow(s, now));
        });

        const winner = inPlay[0]?.original.id ?? null;
        result[type] = {
            regola: winner,
            cosa: cosaVede(ctx, type, winner),
            altre: inPlay.slice(1).map(e => e.original.id)
        };
    }
    return result;
};
