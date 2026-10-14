// Confronto «vincitore uguale a prima» per il pacchetto database dell'Officina.
//
// Per ogni sede e ogni 15 minuti di una settimana calcola chi vince in ogni
// strato (layout, prezzi, visibilità, in evidenza) col giudice vero
// (`scheduleCompetition.ts`, importato, non copiato) e cosa vede il cliente.
// La fotografia dei dati arriva da `fotografia.sql`, letta in sola lettura.
// Le migrazioni della fase (b) (M1 fasce, M2 ore per sede, M3 menù e stile,
// M5 giudice nuovo) si controllano così: esito prima, esito dopo, confronto.
//
// Puro: niente I/O, niente query. Il CLI è in `cli.ts`.

import {
    COMPETITION_RULE_TYPES,
    resolveCompetition,
    type CompetitionRule,
    type CompetitionRuleType,
    type CompetitionSeat,
    type RomeDateTime
} from "../../supabase/functions/_shared/scheduleCompetition";
import { toRomeDateTime } from "../../supabase/functions/_shared/schedulingNow";

// ── Fotografia (righe come escono da fotografia.sql) ────────────────────────

export type SnapshotActivity = {
    id: string;
    tenant_id: string;
    tenant_name: string;
    name: string;
    status: string;
    group_ids: string[];
};

export type SnapshotSchedule = {
    id: string;
    tenant_id: string;
    name: string | null;
    rule_type: CompetitionRuleType;
    enabled: boolean;
    apply_to_all: boolean;
    priority: number;
    created_at: string;
    time_mode: "always" | "window";
    days_of_week: number[] | null;
    time_from: string | null;
    time_to: string | null;
    start_at: string | null;
    end_at: string | null;
};

export type SnapshotTarget = {
    schedule_id: string;
    target_type: "activity" | "activity_group";
    target_id: string;
};

export type SnapshotLayout = {
    schedule_id: string;
    catalog_id: string | null;
    style_id: string | null;
};

export type SnapshotFeaturedLink = {
    schedule_id: string;
    featured_content_id: string;
    slot: string;
    sort_order: number;
    status: string;
};

export type SnapshotSlot = {
    id: string;
    schedule_id: string;
    days_of_week: number[] | null;
    start_minute: number;
    end_minute: number;
};

export type Snapshot = {
    fonte: string;
    letta_il: string;
    activities: SnapshotActivity[];
    schedules: SnapshotSchedule[];
    targets: SnapshotTarget[];
    layouts: SnapshotLayout[];
    featured_links: SnapshotFeaturedLink[];
    /** Tabelle della fase (a): vuote finché la (b) non le riempie. */
    slots?: SnapshotSlot[];
};

// ── Esito ───────────────────────────────────────────────────────────────────

/** Un tratto di tempo in cui in uno strato non cambia niente. */
export type EsitoTratto = {
    /** Inizio incluso, ISO UTC. */
    da: string;
    /** Fine esclusa, ISO UTC. */
    a: string;
    /** Etichetta leggibile dell'inizio, ora di Roma («lun 12:15»). */
    quando: string;
    /** La regola che vince, o null. */
    regola: string | null;
    /** Cosa vede il cliente: è il valore che si confronta. */
    cosa: string;
    /** Le altre regole in finestra che perdono, nell'ordine del giudice. */
    altre: string[];
};

export type EsitoSede = {
    id: string;
    nome: string;
    azienda: string;
    stato: string;
    strati: Record<CompetitionRuleType, EsitoTratto[]>;
};

export type Esito = {
    giudice: string;
    fonte: string;
    letta_il: string;
    /** Lunedì della settimana, AAAA-MM-GG, ora di Roma. */
    settimana: string;
    passo_minuti: number;
    nomi: Record<string, string>;
    sedi: EsitoSede[];
};

/**
 * Un giudice: dati della fotografia, sede, istante → per ogni strato chi vince,
 * chi perde in finestra e cosa vede il cliente. Il giudice di oggi è
 * `giudiceDiOggi`; quello della fase (b) dovrà rispettare la stessa forma.
 */
export type Giudice = (
    ctx: GiudiceContesto,
    activity: SnapshotActivity,
    now: RomeDateTime
) => Record<CompetitionRuleType, { regola: string | null; cosa: string; altre: string[] }>;

export type GiudiceContesto = {
    snapshot: Snapshot;
    rulesByTenant: Map<string, CompetitionRule[]>;
    layoutBySchedule: Map<string, SnapshotLayout>;
    featuredBySchedule: Map<string, SnapshotFeaturedLink[]>;
};

// ── Regole per il giudice ───────────────────────────────────────────────────

/**
 * Le regole come le costruisce `scheduleResolver.ts`: `apply_to_all` vince sui
 * target residui; i target sono sedi e gruppi da `schedule_targets` (le colonne
 * `schedules.target_type/target_id` il resolver non le legge); una regola
 * layout senza catalogo è candidata ma non vince (`hasPayload`).
 */
export function buildCompetitionRules(snapshot: Snapshot): Map<string, CompetitionRule[]> {
    const targetsBySchedule = groupBy(snapshot.targets, t => t.schedule_id);
    const layoutBySchedule = new Map(snapshot.layouts.map(l => [l.schedule_id, l]));
    const byTenant = new Map<string, CompetitionRule[]>();

    for (const s of snapshot.schedules) {
        const targets = targetsBySchedule.get(s.id) ?? [];
        const rule: CompetitionRule = {
            id: s.id,
            rule_type: s.rule_type,
            enabled: s.enabled,
            priority: s.priority,
            created_at: s.created_at,
            time_mode: s.time_mode,
            days_of_week: s.days_of_week,
            time_from: s.time_from,
            time_to: s.time_to,
            start_at: s.start_at,
            end_at: s.end_at,
            applyToAll: s.apply_to_all,
            activityIds: s.apply_to_all
                ? []
                : targets.filter(t => t.target_type === "activity").map(t => t.target_id),
            groupIds: s.apply_to_all
                ? []
                : targets.filter(t => t.target_type === "activity_group").map(t => t.target_id)
        };
        if (s.rule_type === "layout") {
            rule.hasPayload = (layoutBySchedule.get(s.id)?.catalog_id ?? null) !== null;
        }
        const list = byTenant.get(s.tenant_id) ?? [];
        list.push(rule);
        byTenant.set(s.tenant_id, list);
    }
    return byTenant;
}

export function buildContext(snapshot: Snapshot): GiudiceContesto {
    const featuredBySchedule = groupBy(snapshot.featured_links, f => f.schedule_id);
    for (const list of featuredBySchedule.values()) {
        list.sort(
            (a, b) =>
                slotRank(a.slot) - slotRank(b.slot) ||
                a.sort_order - b.sort_order ||
                a.featured_content_id.localeCompare(b.featured_content_id)
        );
    }
    return {
        snapshot,
        rulesByTenant: buildCompetitionRules(snapshot),
        layoutBySchedule: new Map(snapshot.layouts.map(l => [l.schedule_id, l])),
        featuredBySchedule
    };
}

function slotRank(slot: string): number {
    return slot === "before_catalog" ? 0 : 1;
}

/**
 * Cosa vede il cliente quando vince una regola:
 * - layout: menù e stile;
 * - in evidenza: i contenuti pubblicati, prima quelli sopra il menù e poi
 *   quelli sotto, ognuno col suo posto (come la RPC che filtra `published`);
 * - prezzi e visibilità: la regola stessa (il dettaglio per piatto non serve
 *   alle migrazioni M1, M2, M3, M5).
 */
export function cosaVede(
    ctx: GiudiceContesto,
    type: CompetitionRuleType,
    ruleId: string | null
): string {
    if (!ruleId) return "-";
    if (type === "layout") {
        const layout = ctx.layoutBySchedule.get(ruleId);
        return `menu:${layout?.catalog_id ?? "-"} stile:${layout?.style_id ?? "-"}`;
    }
    if (type === "featured") {
        const links = (ctx.featuredBySchedule.get(ruleId) ?? []).filter(l => l.status === "published");
        if (links.length === 0) return "nessun contenuto";
        return links.map(l => `${l.slot === "before_catalog" ? "sopra" : "sotto"}:${l.featured_content_id}`).join(" ");
    }
    return `regola:${ruleId}`;
}

/** Il giudice di oggi: `resolveCompetition` sulle regole dell'azienda. */
export const giudiceDiOggi: Giudice = (ctx, activity, now) => {
    const rules = ctx.rulesByTenant.get(activity.tenant_id) ?? [];
    const seat: CompetitionSeat = { activityId: activity.id, groupIds: activity.group_ids };
    const outcome = resolveCompetition(rules, seat, now);
    const result = {} as ReturnType<Giudice>;
    for (const type of COMPETITION_RULE_TYPES) {
        const winner = outcome[type].winner?.rule.id ?? null;
        result[type] = {
            regola: winner,
            cosa: cosaVede(ctx, type, winner),
            altre: outcome[type].contenders.map(c => c.rule.id)
        };
    }
    return result;
};

// ── Settimana ───────────────────────────────────────────────────────────────

const WEEKDAY_LABEL = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

export function labelRome(epoch: number): string {
    const r = toRomeDateTime(new Date(epoch));
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${WEEKDAY_LABEL[r.dayOfWeek]} ${pad(r.hour)}:${pad(r.minute)}`;
}

/** Epoch della mezzanotte di Roma del giorno dato (gestisce l'ora legale). */
export function romeMidnightEpoch(isoDate: string): number {
    const [y, m, d] = isoDate.split("-").map(Number);
    const wall = Date.UTC(y, m - 1, d);
    let epoch = wall - romeOffsetMs(wall);
    epoch = wall - romeOffsetMs(epoch);
    return epoch;
}

function romeOffsetMs(epoch: number): number {
    const r = toRomeDateTime(new Date(epoch));
    return Date.UTC(r.year, r.month, r.day, r.hour, r.minute, r.second) - epoch;
}

/** Gli istanti della settimana, dal lunedì 00:00 di Roma al lunedì dopo escluso. */
export function weekInstants(monday: string, stepMinutes = 15): number[] {
    const start = romeMidnightEpoch(monday);
    if (toRomeDateTime(new Date(start)).dayOfWeek !== 1) {
        throw new Error(`${monday} non è un lunedì`);
    }
    const [y, m, d] = monday.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
    const end = romeMidnightEpoch(next);
    const out: number[] = [];
    for (let t = start; t < end; t += stepMinutes * 60_000) out.push(t);
    return out;
}

// ── Calcolo ─────────────────────────────────────────────────────────────────

export function calcolaEsito(
    snapshot: Snapshot,
    monday: string,
    opts: { giudice?: Giudice; nomeGiudice?: string; stepMinutes?: number } = {}
): Esito {
    const giudice = opts.giudice ?? giudiceDiOggi;
    const stepMinutes = opts.stepMinutes ?? 15;
    const ctx = buildContext(snapshot);
    const instants = weekInstants(monday, stepMinutes);
    const weekEnd = instants[instants.length - 1] + stepMinutes * 60_000;

    const sedi: EsitoSede[] = [...snapshot.activities]
        .sort((a, b) => a.tenant_name.localeCompare(b.tenant_name) || a.name.localeCompare(b.name))
        .map(activity => {
            const strati = {} as EsitoSede["strati"];
            for (const type of COMPETITION_RULE_TYPES) strati[type] = [];

            instants.forEach(epoch => {
                const now = toRomeDateTime(new Date(epoch));
                const verdict = giudice(ctx, activity, now);
                for (const type of COMPETITION_RULE_TYPES) {
                    const v = verdict[type];
                    const list = strati[type];
                    const last = list[list.length - 1];
                    if (
                        last &&
                        last.regola === v.regola &&
                        last.cosa === v.cosa &&
                        last.altre.join() === v.altre.join()
                    ) {
                        continue;
                    }
                    if (last) last.a = new Date(epoch).toISOString();
                    list.push({
                        da: new Date(epoch).toISOString(),
                        a: "",
                        quando: labelRome(epoch),
                        regola: v.regola,
                        cosa: v.cosa,
                        altre: v.altre
                    });
                }
            });
            for (const type of COMPETITION_RULE_TYPES) {
                const list = strati[type];
                if (list.length > 0) list[list.length - 1].a = new Date(weekEnd).toISOString();
            }

            return {
                id: activity.id,
                nome: activity.name,
                azienda: activity.tenant_name,
                stato: activity.status,
                strati
            };
        });

    const nomi: Record<string, string> = {};
    for (const s of snapshot.schedules) nomi[s.id] = s.name ?? s.id;

    return {
        giudice: opts.nomeGiudice ?? "oggi",
        fonte: snapshot.fonte,
        letta_il: snapshot.letta_il,
        settimana: monday,
        passo_minuti: stepMinutes,
        nomi,
        sedi
    };
}

// ── Confronto ───────────────────────────────────────────────────────────────

export type Differenza = {
    sede: string;
    azienda: string;
    strato: CompetitionRuleType;
    da: string;
    a: string;
    quando: string;
    prima: string;
    dopo: string;
    regola_prima: string | null;
    regola_dopo: string | null;
};

/**
 * Dove il cliente vede qualcosa di diverso (`cosa`), tratto per tratto.
 * Un cambio solo di regola con la stessa `cosa` non è una differenza: dopo
 * M3 una regola layout diventa due regole (menù e stile) con id nuovi.
 */
export function confronta(prima: Esito, dopo: Esito): Differenza[] {
    if (prima.settimana !== dopo.settimana || prima.passo_minuti !== dopo.passo_minuti) {
        throw new Error(
            `settimane diverse: ${prima.settimana}/${prima.passo_minuti} e ${dopo.settimana}/${dopo.passo_minuti}`
        );
    }
    const dopoById = new Map(dopo.sedi.map(s => [s.id, s]));
    const out: Differenza[] = [];
    // Si uniscono solo tratti della stessa sede (per id: i nomi possono ripetersi).
    let lastSedeId: string | null = null;

    for (const sede of prima.sedi) {
        const altra = dopoById.get(sede.id);
        for (const type of COMPETITION_RULE_TYPES) {
            const a = sede.strati[type];
            const b = altra?.strati[type] ?? [];
            for (const piece of overlay(a, b)) {
                if (piece.prima.cosa === piece.dopo.cosa) continue;
                const last = out[out.length - 1];
                if (
                    last &&
                    lastSedeId === sede.id &&
                    last.strato === type &&
                    last.a === piece.da &&
                    last.prima === piece.prima.cosa &&
                    last.dopo === piece.dopo.cosa
                ) {
                    last.a = piece.a;
                    continue;
                }
                out.push({
                    sede: sede.nome,
                    azienda: sede.azienda,
                    strato: type,
                    da: piece.da,
                    a: piece.a,
                    quando: labelRome(Date.parse(piece.da)),
                    prima: piece.prima.cosa,
                    dopo: piece.dopo.cosa,
                    regola_prima: piece.prima.regola,
                    regola_dopo: piece.dopo.regola
                });
                lastSedeId = sede.id;
            }
        }
    }
    // Sedi che ci sono solo dopo: tutto ciò che vedono è nuovo.
    const primaIds = new Set(prima.sedi.map(s => s.id));
    for (const sede of dopo.sedi) {
        if (primaIds.has(sede.id)) continue;
        for (const type of COMPETITION_RULE_TYPES) {
            for (const t of sede.strati[type]) {
                if (t.cosa === "-") continue;
                out.push({
                    sede: sede.nome,
                    azienda: sede.azienda,
                    strato: type,
                    da: t.da,
                    a: t.a,
                    quando: t.quando,
                    prima: "(sede assente)",
                    dopo: t.cosa,
                    regola_prima: null,
                    regola_dopo: t.regola
                });
            }
        }
    }
    return out;
}

const VUOTO: EsitoTratto = { da: "", a: "", quando: "", regola: null, cosa: "-", altre: [] };

/** Sovrappone due elenchi di tratti sulla stessa settimana. */
function overlay(
    a: EsitoTratto[],
    b: EsitoTratto[]
): { da: string; a: string; prima: EsitoTratto; dopo: EsitoTratto }[] {
    const cuts = new Set<string>();
    for (const t of [...a, ...b]) {
        cuts.add(t.da);
        cuts.add(t.a);
    }
    const sorted = [...cuts].sort();
    const at = (list: EsitoTratto[], iso: string) => list.find(t => t.da <= iso && iso < t.a) ?? VUOTO;
    const out = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        out.push({ da: sorted[i], a: sorted[i + 1], prima: at(a, sorted[i]), dopo: at(b, sorted[i]) });
    }
    return out;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
        const k = key(item);
        const list = map.get(k) ?? [];
        list.push(item);
        map.set(k, list);
    }
    return map;
}
