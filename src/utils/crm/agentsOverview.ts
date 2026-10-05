/**
 * La pagina Agenti in numeri (grafica del CRM decisa il 2026-10-05): il giro di
 * un messaggio di oggi e una riga per agente. Puro: legge bozze, fiducia,
 * interruttori e diario già caricati, e il «oggi» di Roma.
 */
import type { CrmAgentDecision, CrmAgentDraftRow, CrmAgentTrialSettings, CrmAgentTrust, CrmAiRole } from "@/types/crm";
import { formatWait, waitLevel, workingMinutesBetween, type CrmWaitLevel } from "@shared/crmGuide";
import { romeParts, romeWallClock } from "@shared/crmCallSlots";

const ROME_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" });

export function isRomeToday(iso: string, now: Date): boolean {
    return ROME_DAY.format(new Date(iso)) === ROME_DAY.format(now);
}

/** La mezzanotte di Roma di oggi, in ISO: da qui si contano i numeri di oggi. */
export function romeTodayStart(now: Date): string {
    const p = romeParts(now);
    return romeWallClock(p.year, p.month, p.day, 0, 0).toISOString();
}

export interface GiroToday {
    written: number;
    reviewed: number;
    stopped: number;
    waiting: number;
    /** Attesa della bozza più vecchia, già nel formato unico («45 min»). */
    oldestWait: string | null;
    oldestLevel: CrmWaitLevel;
    sent: number;
}

const SENT: CrmAgentDraftRow["status"][] = ["sent", "edited"];

export function giroToday(drafts: CrmAgentDraftRow[], decisions: CrmAgentDecision[], now: Date): GiroToday {
    const today = drafts.filter(d => isRomeToday(d.created_at, now));
    const pending = drafts.filter(d => d.status === "pending");
    const oldest = pending.reduce<string | null>((min, d) => (min === null || d.created_at < min ? d.created_at : min), null);
    const oldestMinutes = oldest ? workingMinutesBetween(new Date(oldest), now) : 0;
    const reviews = decisions.filter(d => d.review_outcome !== null && isRomeToday(d.created_at, now));
    const autoSent = decisions.filter(d => d.action === "draft_auto_sent" && isRomeToday(d.created_at, now)).length;
    return {
        written: today.length,
        reviewed: reviews.length,
        stopped: reviews.filter(d => d.review_outcome === "rejected").length,
        waiting: pending.length,
        oldestWait: oldest ? formatWait(oldestMinutes) : null,
        oldestLevel: oldest ? waitLevel(oldestMinutes) : "normale",
        sent: drafts.filter(d => SENT.includes(d.status) && d.decided_at && isRomeToday(d.decided_at, now)).length + autoSent
    };
}

export type AgentStep = 2 | 3 | 4 | 5 | null;
export type AgentTone = "success" | "warning" | "neutral";

export interface AgentRow {
    /** Id della voce in `CRM_GUIDE`. */
    id: "conversazione" | "solleciti" | "decisioni_sensibili" | "revisore" | "riattivazione" | "gea";
    name: string;
    /** Il ruolo AI che lavora per lui: modello e spesa. Solleciti e riattivazione usano quello della conversazione. */
    role: CrmAiRole | null;
    /** La spesa è contata sulla riga di un altro agente (stesso ruolo AI). */
    spendShared: boolean;
    step: AgentStep;
    status: string;
    tone: AgentTone;
    today: string;
    /** Inviate senza modifiche sul totale deciso, da 0 a 1; null se nessuna decisa. */
    approvedShare: number | null;
    /** Inviate così, corrette, non mandate: quote da 0 a 1 per la barra a tre colori. */
    mix: DraftMix | null;
}

export interface DraftMix {
    approved: number;
    edited: number;
    discarded: number;
}

function trialStatus(on: boolean, trust: CrmAgentTrust | undefined, autonomyOn: boolean): { status: string; tone: AgentTone } {
    if (!on) return { status: "Spento", tone: "neutral" };
    if (trust?.autonomous && autonomyOn) return { status: "Fuori dalla prova", tone: "success" };
    if (trust) return { status: `In prova · ${trust.approved_in_row} di ${trust.required_in_row}`, tone: "warning" };
    return { status: "In prova", tone: "warning" };
}

function share(trust: CrmAgentTrust | undefined): number | null {
    return mixOf(trust)?.approved ?? null;
}

export function mixOf(trust: CrmAgentTrust | undefined): DraftMix | null {
    if (!trust) return null;
    const decided = trust.total_approved + trust.total_edited + trust.total_discarded;
    if (decided === 0) return null;
    return {
        approved: trust.total_approved / decided,
        edited: trust.total_edited / decided,
        discarded: trust.total_discarded / decided
    };
}

function countLabel(n: number, one: string, many: string): string {
    if (n === 0) return "nulla";
    return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

export function agentRows(input: {
    settings: CrmAgentTrialSettings;
    trust: CrmAgentTrust[];
    drafts: CrmAgentDraftRow[];
    giro: GiroToday;
    now: Date;
}): AgentRow[] {
    const { settings, trust, drafts, giro, now } = input;
    const today = drafts.filter(d => isRomeToday(d.created_at, now));
    const ofKind = (kind: CrmAgentDraftRow["kind"]) => today.filter(d => d.kind === kind).length;
    const replyTrust = trust.find(t => t.kind === "reply");
    const followTrust = trust.find(t => t.kind === "follow_up");
    const reactivationOn = Boolean(settings.agent_reactivation_message?.trim());
    return [
        {
            id: "conversazione",
            name: "Conversazione",
            role: "conversation",
            spendShared: false,
            step: 2,
            ...trialStatus(settings.agent_replies_on, replyTrust, settings.agent_autonomy_on),
            today: countLabel(ofKind("reply"), "bozza", "bozze"),
            approvedShare: share(replyTrust),
            mix: mixOf(replyTrust)
        },
        {
            id: "solleciti",
            name: "Solleciti",
            role: "conversation",
            spendShared: true,
            step: 2,
            ...trialStatus(settings.agent_followups_on, followTrust, settings.agent_autonomy_on),
            today: countLabel(ofKind("follow_up"), "bozza", "bozze"),
            approvedShare: share(followTrust),
            mix: mixOf(followTrust)
        },
        {
            id: "decisioni_sensibili",
            name: "Decisioni sensibili",
            role: "sensitive",
            spendShared: false,
            step: 2,
            status: "Predisposto",
            tone: "neutral",
            today: "nulla",
            approvedShare: null,
            mix: null
        },
        {
            id: "revisore",
            name: "Revisore",
            role: "reviewer",
            spendShared: false,
            step: 3,
            status: "Acceso",
            tone: "success",
            today:
                giro.reviewed === 0
                    ? "nulla"
                    : `${giro.reviewed} ${giro.reviewed === 1 ? "riletta" : "rilette"}, ${giro.stopped} ${giro.stopped === 1 ? "fermata" : "fermate"}`,
            approvedShare: null,
            mix: null
        },
        {
            id: "riattivazione",
            name: "Riattivazione",
            role: "conversation",
            spendShared: true,
            step: reactivationOn ? 2 : null,
            status: reactivationOn ? "Accesa" : "Spenta",
            tone: reactivationOn ? "success" : "neutral",
            today: countLabel(ofKind("reactivation"), "bozza", "bozze"),
            approvedShare: null,
            mix: null
        },
        {
            id: "gea",
            name: "Gea",
            role: "gea",
            spendShared: false,
            step: null,
            status: "Su Telegram",
            tone: "success",
            today: "—",
            approvedShare: null,
            mix: null
        }
    ];
}

/** La spesa AI per ruolo, sommando le chiamate già lette (di oggi). */
export function spendByRole(usage: { role: CrmAiRole; cost_usd: number }[]): Record<CrmAiRole, number> {
    const out: Record<CrmAiRole, number> = { conversation: 0, reviewer: 0, sensitive: 0, gea: 0 };
    for (const u of usage) out[u.role] += u.cost_usd;
    return out;
}

/** Quanto è costato in media un messaggio partito oggi; null senza messaggi. */
export function costPerMessage(dayUsd: number, sentToday: number): number | null {
    return sentToday > 0 ? dayUsd / sentToday : null;
}

const QUEUE_HOUR = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
const QUEUE_DAY = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "short" });

/** Quando parte un messaggio in coda: «adesso», «15:00» oggi, «dom» un altro giorno. */
export function queueWhen(sendAfter: string | null, now: Date): string {
    if (!sendAfter || new Date(sendAfter) <= now) return "adesso";
    return isRomeToday(sendAfter, now) ? QUEUE_HOUR.format(new Date(sendAfter)) : QUEUE_DAY.format(new Date(sendAfter));
}
