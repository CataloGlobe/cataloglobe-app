/**
 * Libreria delle obiezioni (F2-5): categorie, riepilogo del periodo e report
 * ridotto per Ferdinando. Puro.
 */
import type { CrmAppointmentWithVenue, CrmObjection, CrmObjectionCategory, CrmVenueListItem } from "@/types/crm";
import { PIPELINE_STAGES, trackIndex, type SummaryPeriod } from "@/utils/crm/leadViews";

/**
 * Le categorie, nell'ordine dei menu. Stesso elenco del CHECK in
 * 20261006100000_crm_objections.sql: cambiarle insieme, con una migration nuova.
 */
export const CRM_OBJECTION_CATEGORIES: CrmObjectionCategory[] = [
    "prezzo",
    "ha_gia_soluzione",
    "non_serve",
    "tempo",
    "decide_altri",
    "non_ora",
    "diffidenza",
    "altro"
];

export const CRM_OBJECTION_LABEL: Record<CrmObjectionCategory, string> = {
    prezzo: "Costa troppo",
    ha_gia_soluzione: "Ha già un menù digitale o un'altra soluzione",
    non_serve: "Non gli serve, i clienti non lo userebbero",
    tempo: "Non ha tempo per configurarlo",
    decide_altri: "Decide qualcun altro (socio, titolare)",
    non_ora: "Non adesso, più avanti",
    diffidenza: "Non si fida della tecnologia",
    altro: "Altro"
};

const DAY_MS = 86_400_000;

export interface ObjectionSummaryRow {
    category: CrmObjectionCategory;
    count: number;
    /** Le note più recenti (al massimo tre), per capire come la dicono. */
    notes: string[];
}

/** Le obiezioni del periodo per categoria, la più frequente in cima. */
export function objectionSummary(objections: CrmObjection[], period: SummaryPeriod, now: Date): ObjectionSummaryRow[] {
    const from = now.getTime() - Number(period) * DAY_MS;
    const rows = new Map<CrmObjectionCategory, ObjectionSummaryRow>();
    const recent = objections
        .filter(o => Date.parse(o.created_at) >= from)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    for (const o of recent) {
        const row = rows.get(o.category) ?? { category: o.category, count: 0, notes: [] };
        row.count += 1;
        const note = o.note?.trim();
        if (note && row.notes.length < 3) row.notes.push(note);
        rows.set(o.category, row);
    }
    return [...rows.values()].sort(
        (a, b) => b.count - a.count || CRM_OBJECTION_CATEGORIES.indexOf(a.category) - CRM_OBJECTION_CATEGORIES.indexOf(b.category)
    );
}

// ── Report per Ferdinando ───────────────────────────────────────────────

const PERIOD_TEXT: Record<SummaryPeriod, string> = {
    "7": "ultimi 7 giorni",
    "30": "ultimi 30 giorni",
    "90": "ultimi 3 mesi"
};

const CALL_INDEX = PIPELINE_STAGES.indexOf("telefonata_fissata");
const TRIAL_INDEX = PIPELINE_STAGES.indexOf("in_prova");
const PAYING_INDEX = PIPELINE_STAGES.indexOf("cliente_pagante");
const NO_AD = "Senza annuncio (landing, WhatsApp, a mano)";

export interface FerdinandoAdRow {
    ad: string;
    leads: number;
    calls: number;
    trials: number;
    clients: number;
}

/**
 * Per annuncio: lead arrivati nel periodo, quanti hanno fissato una
 * telefonata (fase raggiunta o appuntamento in agenda), quanti sono in prova o
 * oltre, quanti pagano. L'annuncio è quello del primo ingresso del locale.
 * Solo numeri: niente nomi di locali né di persone.
 */
export function ferdinandoAdRows(input: {
    venues: CrmVenueListItem[];
    appointments: CrmAppointmentWithVenue[];
    period: SummaryPeriod;
    now: Date;
}): FerdinandoAdRow[] {
    const from = input.now.getTime() - Number(input.period) * DAY_MS;
    const withCall = new Set(input.appointments.filter(a => a.status !== "cancelled").map(a => a.venue_id));
    const rows = new Map<string, FerdinandoAdRow>();
    for (const v of input.venues) {
        if (Date.parse(v.created_at) < from) continue;
        const first = v.crm_leads[v.crm_leads.length - 1];
        const ad = first?.ad_name?.trim() || NO_AD;
        const row = rows.get(ad) ?? { ad, leads: 0, calls: 0, trials: 0, clients: 0 };
        const index = trackIndex(v.stage) ?? -1;
        row.leads += 1;
        if (index >= CALL_INDEX || withCall.has(v.id)) row.calls += 1;
        if (index >= TRIAL_INDEX) row.trials += 1;
        if (index >= PAYING_INDEX) row.clients += 1;
        rows.set(ad, row);
    }
    return [...rows.values()].sort((a, b) => (a.ad === NO_AD ? 1 : b.ad === NO_AD ? -1 : b.leads - a.leads || a.ad.localeCompare(b.ad, "it")));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Il testo da copiare e mandare a Ferdinando. */
export function ferdinandoReportText(input: {
    rows: FerdinandoAdRow[];
    objections: ObjectionSummaryRow[];
    period: SummaryPeriod;
}): string {
    const { rows, objections, period } = input;
    const total = rows.reduce(
        (acc, r) => ({ leads: acc.leads + r.leads, calls: acc.calls + r.calls, trials: acc.trials + r.trials, clients: acc.clients + r.clients }),
        { leads: 0, calls: 0, trials: 0, clients: 0 }
    );
    const lines = [
        `CataloGlobe, ${PERIOD_TEXT[period]}`,
        "",
        `Lead: ${total.leads} · telefonate fissate: ${total.calls} · in prova o oltre: ${total.trials} · clienti paganti: ${total.clients}`
    ];
    if (rows.length > 0) {
        lines.push("", "Per annuncio:");
        for (const r of rows) {
            lines.push(
                `- ${r.ad}: ${plural(r.leads, "lead", "lead")}, ${plural(r.calls, "telefonata", "telefonate")}, ${r.trials} in prova, ${plural(r.clients, "cliente", "clienti")}`
            );
        }
    }
    if (objections.length > 0) {
        lines.push("", "Obiezioni più sentite:");
        for (const o of objections.slice(0, 3)) lines.push(`- ${CRM_OBJECTION_LABEL[o.category]}: ${o.count}`);
    }
    return lines.join("\n");
}
