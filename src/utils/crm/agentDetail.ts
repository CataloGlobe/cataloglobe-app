/**
 * La pagina di un agente (canvas A2, approvato da Alex il 2026-10-05): quattro
 * numeri, cosa ha in corso e cosa ha fatto oggi, la spesa degli ultimi sette
 * giorni. Puro: legge bozze, diario, fiducia e chiamate a Claude già caricati.
 */
import type { CrmAgentDecision, CrmAgentDraftKind, CrmAgentDraftRow, CrmAgentTrust, CrmAiRole, CrmAiUsageCost } from "@/types/crm";
import { formatUsd } from "@shared/crmAi";
import { romeParts, romeWallClock } from "@shared/crmCallSlots";
import { isRomeToday, mixOf, type AgentRow } from "./agentsOverview";
import type { GiroTone } from "./giroSteps";

export interface AgentKpi {
    label: string;
    value: string;
}

export interface AgentActivityItem {
    key: string;
    /** «16:42», o vuoto per ciò che è in corso. */
    when: string;
    text: string;
    sub: string;
    tag: string;
    tone: GiroTone;
}

export interface AgentSpendDay {
    /** «AAAA-MM-GG» di Roma. */
    day: string;
    /** «lun», o «oggi». */
    label: string;
    usd: number;
    /** Altezza della barra, da 0 a 10 (decimi del giorno più caro). */
    level: number;
}

export interface AgentDetailData {
    kpis: AgentKpi[];
    current: AgentActivityItem[];
    done: AgentActivityItem[];
    week: AgentSpendDay[];
    /** La spesa del ruolo AI nel mese; null se l'agente non usa Claude. */
    monthUsd: number | null;
    /** «0,05 $ a bozza oggi»; null se oggi non c'è niente da dividere. */
    perUnit: string | null;
    /** Il conto AI è diviso con altri agenti. */
    sharedNote: string | null;
}

export interface AgentDetailSources {
    drafts: CrmAgentDraftRow[];
    decisions: CrmAgentDecision[];
    trust: CrmAgentTrust[];
    /** Chiamate a Claude almeno dagli ultimi 7 giorni e dall'inizio del mese. */
    usage: CrmAiUsageCost[];
    venueName: (venueId: string) => string;
    now: Date;
}

/** Le bozze di chi: ogni tipo di bozza ha un solo agente. */
export const AGENT_DRAFT_KINDS: Record<AgentRow["id"], CrmAgentDraftKind[]> = {
    conversazione: ["reply", "bot_question", "ask", "schedule"],
    solleciti: ["follow_up"],
    riattivazione: ["reactivation"],
    decisioni_sensibili: ["stop_check", "lost_proposal"],
    revisore: [],
    gea: []
};

const SHARED_AGENTS: AgentRow["id"][] = ["conversazione", "solleciti", "riattivazione"];
const SHARED_NAMES: Record<string, string> = {
    conversazione: "Solleciti e Riattivazione",
    solleciti: "Conversazione e Riattivazione",
    riattivazione: "Conversazione e Solleciti"
};

const ROME_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" });
const HOUR = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
const WEEKDAY = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

function romeDay(iso: string): string {
    return ROME_DAY.format(new Date(iso));
}

function hour(iso: string): string {
    return HOUR.format(new Date(iso));
}

function excerpt(text: string | null, fallback: string): string {
    const clean = (text ?? "").replace(/\s+/g, " ").trim();
    if (!clean) return fallback;
    return clean.length > 90 ? `${clean.slice(0, 89)}…` : clean;
}

function shiftDay(day: string, delta: number): string {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
}

function percent(share: number | null | undefined): string {
    return share == null ? "—" : `${Math.round(share * 100)}%`;
}

/** Da quando leggere le chiamate a Claude: il primo fra inizio mese e sei giorni fa, a mezzanotte di Roma. */
export function agentUsageSince(now: Date): string {
    const p = romeParts(now);
    const monthStart = romeWallClock(p.year, p.month, 1, 0, 0);
    const today = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    const [y, m, d] = shiftDay(today, -6).split("-").map(Number);
    const weekStart = romeWallClock(y, m, d, 0, 0);
    return (monthStart < weekStart ? monthStart : weekStart).toISOString();
}

/** La spesa di un ruolo giorno per giorno, gli ultimi sette con oggi in fondo. */
export function spendWeek(usage: CrmAiUsageCost[], role: CrmAiRole | null, now: Date): AgentSpendDay[] {
    const today = romeDay(now.toISOString());
    const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6));
    const totals = new Map(days.map(d => [d, 0]));
    if (role) {
        for (const u of usage) {
            if (u.role !== role) continue;
            const day = romeDay(u.created_at);
            if (totals.has(day)) totals.set(day, (totals.get(day) ?? 0) + u.cost_usd);
        }
    }
    const max = Math.max(0, ...totals.values());
    return days.map(day => {
        const usd = totals.get(day) ?? 0;
        return {
            day,
            label: day === today ? "oggi" : WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()],
            usd,
            // Un giorno con spesa non sparisce: almeno un decimo.
            level: max > 0 && usd > 0 ? Math.max(1, Math.round((usd / max) * 10)) : 0
        };
    });
}

/** La spesa del mese per ruolo, dalle chiamate già lette. */
export function monthSpendByRole(usage: CrmAiUsageCost[], now: Date): Record<CrmAiRole, number> {
    const month = romeDay(now.toISOString()).slice(0, 7);
    const out: Record<CrmAiRole, number> = { conversation: 0, reviewer: 0, sensitive: 0, gea: 0 };
    for (const u of usage) if (romeDay(u.created_at).startsWith(month)) out[u.role] += u.cost_usd;
    return out;
}

function todayRoleUsd(usage: CrmAiUsageCost[], role: CrmAiRole | null, now: Date): number {
    if (!role) return 0;
    return usage.filter(u => u.role === role && isRomeToday(u.created_at, now)).reduce((sum, u) => sum + u.cost_usd, 0);
}

const DRAFT_DONE: Record<string, [string, GiroTone]> = {
    sent: ["Partita", "success"],
    edited: ["Corretta", "success"],
    discarded: ["Scartata", "neutral"],
    expired: ["Scaduta", "neutral"],
    handled: ["Gestita da voi", "neutral"]
};

function draftItems(drafts: CrmAgentDraftRow[], now: Date): { current: AgentActivityItem[]; done: AgentActivityItem[] } {
    const byNewest = [...drafts].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const current = byNewest
        .filter(d => d.status === "pending" || d.status === "scheduled")
        .map(d => ({
            key: d.id,
            when: d.status === "scheduled" ? hour(d.created_at) : "",
            text: `Bozza per ${d.venue_name}`,
            sub: excerpt(d.proposed_text, d.reason ?? "senza testo"),
            tag: d.status === "pending" ? "Aspetta voi" : "Programmata",
            tone: d.status === "pending" ? ("warning" as const) : ("brand" as const)
        }));
    const done = byNewest
        .filter(d => isRomeToday(d.created_at, now) && DRAFT_DONE[d.status])
        .map(d => ({
            key: d.id,
            when: hour(d.decided_at ?? d.created_at),
            text: `Bozza per ${d.venue_name}`,
            sub: excerpt(d.final_text ?? d.proposed_text, d.reason ?? "senza testo"),
            tag: DRAFT_DONE[d.status][0],
            tone: DRAFT_DONE[d.status][1]
        }));
    return { current, done };
}

/** I numeri e le righe della pagina di un agente. */
export function agentDetail(row: AgentRow, src: AgentDetailSources): AgentDetailData {
    const { drafts, decisions, trust, usage, venueName, now } = src;
    const kinds = AGENT_DRAFT_KINDS[row.id];
    const mine = drafts.filter(d => kinds.includes(d.kind));
    const mineToday = mine.filter(d => isRomeToday(d.created_at, now));
    const roleToday = todayRoleUsd(usage, row.role, now);
    const week = spendWeek(usage, row.role, now);
    const monthUsd = row.role ? monthSpendByRole(usage, now)[row.role] : null;

    // Conversazione, Solleciti e Riattivazione hanno un conto AI solo: oggi si divide per numero di bozze.
    const shared = SHARED_AGENTS.includes(row.id);
    let spendToday = roleToday;
    if (shared) {
        const sharedToday = drafts.filter(
            d => isRomeToday(d.created_at, now) && SHARED_AGENTS.some(id => AGENT_DRAFT_KINDS[id].includes(d.kind))
        ).length;
        spendToday = sharedToday > 0 ? (roleToday * mineToday.length) / sharedToday : row.id === "conversazione" ? roleToday : 0;
    }
    const sharedNote = shared
        ? `Il conto AI è unico con ${SHARED_NAMES[row.id]}: il grafico e il mese sono di tutti e tre, la spesa di oggi è divisa per numero di bozze.`
        : null;

    if (row.id === "revisore") {
        const reviewed = decisions.filter(d => d.review_outcome !== null && isRomeToday(d.created_at, now));
        const stopped = reviewed.filter(d => d.review_outcome === "rejected").length;
        return {
            kpis: [
                { label: "Rilette oggi", value: String(reviewed.length) },
                { label: "Fermate", value: String(stopped) },
                { label: "Passate", value: String(reviewed.length - stopped) },
                { label: "Spesa oggi", value: formatUsd(spendToday) }
            ],
            current: [],
            done: reviewed.map(d => {
                const isStop = d.review_outcome === "rejected";
                return {
                    key: d.id,
                    when: hour(d.created_at),
                    text: `${isStop ? "Fermata la bozza" : "Ok alla bozza"} per ${d.venue_id ? venueName(d.venue_id) : "un locale"}`,
                    sub: isStop ? excerpt(d.reason, "") : "",
                    tag: isStop ? "Fermata" : "Ok",
                    tone: isStop ? ("danger" as const) : ("success" as const)
                };
            }),
            week,
            monthUsd,
            perUnit: reviewed.length > 0 ? `${formatUsd(roleToday / reviewed.length)} a rilettura oggi` : null,
            sharedNote
        };
    }

    if (row.id === "gea") {
        const actions = decisions.filter(d => d.actor === "gea" && isRomeToday(d.created_at, now));
        return {
            kpis: [
                { label: "Azioni oggi", value: String(actions.length) },
                { label: "Spesa oggi", value: formatUsd(spendToday) },
                { label: "Spesa del mese", value: formatUsd(monthUsd ?? 0) },
                { label: "Ultimi 7 giorni", value: formatUsd(week.reduce((sum, d) => sum + d.usd, 0)) }
            ],
            current: [],
            done: actions.map(d => ({
                key: d.id,
                when: hour(d.created_at),
                text: excerpt(d.reason, d.action),
                sub: d.venue_id ? venueName(d.venue_id) : "",
                tag: "Fatto",
                tone: "success" as const
            })),
            week,
            monthUsd,
            perUnit: null,
            sharedNote
        };
    }

    const { current, done } = draftItems(mine, now);
    const kindTrust = row.id === "conversazione" ? "reply" : row.id === "solleciti" ? "follow_up" : null;
    const mix = kindTrust ? mixOf(trust.find(t => t.kind === kindTrust)) : null;
    return {
        kpis: [
            { label: row.id === "decisioni_sensibili" ? "Casi oggi" : "Bozze oggi", value: String(mineToday.length) },
            kindTrust
                ? { label: "Inviate così", value: percent(mix?.approved) }
                : { label: "Partite oggi", value: String(mineToday.filter(d => d.status === "sent" || d.status === "edited").length) },
            { label: "Aspettano voi", value: String(mine.filter(d => d.status === "pending").length) },
            { label: "Spesa oggi", value: row.role ? formatUsd(spendToday) : "—" }
        ],
        current,
        done,
        week,
        monthUsd,
        perUnit: mineToday.length > 0 && spendToday > 0 ? `${formatUsd(spendToday / mineToday.length)} a bozza oggi` : null,
        sharedNote
    };
}
