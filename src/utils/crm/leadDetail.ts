/**
 * La scheda del lead in dati (canvas V5 e T8b, versione finale del
 * 2026-10-05): la chat con gli eventi in mezzo, la riga «In breve», le
 * risposte pronte e la storia. Puro: legge ciò che la pagina ha già caricato.
 */
import type { CrmAccountState, CrmAgentDraftRow, CrmEvent, CrmLead, CrmMessage, CrmNextStep, CrmStage, CrmVenue } from "@/types/crm";
import { CRM_ACCOUNT_STATE_LABEL } from "@/utils/crm/accountLabels";
import { describeCallEvent } from "@/utils/crm/agenda";
import { CRM_SOURCE_LABEL, CRM_STAGE_LABEL } from "@/utils/crm/stages";
import { romeParts } from "@shared/crmCallSlots";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
const WEEKDAY_SHORT = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "short" });

function romeDayNumber(at: Date): number {
    const p = romeParts(at);
    return Date.UTC(p.year, p.month - 1, p.day) / DAY_MS;
}

/** L'ora di un messaggio: «oggi 13:40», «ieri 9:10», «ven 10:44», poi «3 ott 10:44». */
export function chatTime(iso: string, now: Date): string {
    const at = new Date(iso);
    const diff = romeDayNumber(now) - romeDayNumber(at);
    const time = HOUR.format(at);
    if (diff <= 0) return `oggi ${time}`;
    if (diff === 1) return `ieri ${time}`;
    if (diff < 7) return `${WEEKDAY_SHORT.format(at).replace(/\.$/, "")} ${time}`;
    return `${at.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short" })} ${time}`;
}

// ── Storia ─────────────────────────────────────────────────────────────────

/** Una riga della storia, senza il titolo (CRM_EVENT_LABEL). */
export function describeEvent(event: CrmEvent, teamName: (id: string | null) => string): string {
    const p = event.payload;
    switch (event.type) {
        case "stage_changed": {
            const from = CRM_STAGE_LABEL[p.from as CrmStage] ?? String(p.from);
            const to = CRM_STAGE_LABEL[p.to as CrmStage] ?? String(p.to);
            const reason = p.lost_reason ? ` (${String(p.lost_reason)})` : "";
            return `${from} → ${to}${reason}`;
        }
        case "assigned":
            return `A ${teamName((p.to as string) ?? null)}`;
        case "note":
            return String(p.text ?? "");
        case "venue_renamed":
            return `${String(p.from ?? "")} → ${String(p.to ?? "")}`;
        case "stage_locked": {
            const to = CRM_STAGE_LABEL[p.to as CrmStage] ?? String(p.to);
            return `In ${to}: ${String(p.note ?? "")}`;
        }
        case "subscription_changed": {
            const to = (p.to ?? {}) as { state?: CrmAccountState | null };
            const from = (p.from ?? {}) as { state?: CrmAccountState | null };
            const label = (state?: CrmAccountState | null) => (state ? CRM_ACCOUNT_STATE_LABEL[state] : "nessuno");
            return from.state === to.state
                ? `Account ${label(to.state)}, prova aggiornata`
                : `Account: ${label(from.state)} → ${label(to.state)}`;
        }
        case "lead_in":
        case "lead_returned": {
            const source = CRM_SOURCE_LABEL[p.source as keyof typeof CRM_SOURCE_LABEL];
            const given =
                event.type === "lead_returned" && p.venue_name_given && p.venue_name_match !== "same"
                    ? `, ha scritto «${String(p.venue_name_given)}»`
                    : "";
            return source ? `Da ${source}${given}` : "";
        }
        case "venue_name_confirmed":
            return `Resta «${String(p.kept ?? "")}», «${String(p.given ?? "")}» era lo stesso`;
        case "venue_name_deferred":
            return `Ha scritto «${String(p.given ?? "")}», da chiarire`;
        case "call_scheduled":
        case "call_moved":
        case "call_cancelled":
        case "call_caller_answered":
        case "call_outcome":
            return describeCallEvent(event.type, p, teamName);
        default:
            return "";
    }
}

// ── Chat ───────────────────────────────────────────────────────────────────

/** Gli eventi che stanno in mezzo alla chat come riga centrata (V5). Le note stanno a destra. */
const CHAT_EVENTS = new Set<CrmEvent["type"]>([
    "lead_in",
    "lead_returned",
    "stage_changed",
    "assigned",
    "agent_hold",
    "agent_released",
    "call_scheduled",
    "call_moved",
    "call_cancelled",
    "call_outcome"
]);

export type ChatItem =
    | { kind: "message"; key: string; at: string; message: CrmMessage }
    | { kind: "event"; key: string; at: string; text: string };

/** Messaggi ed eventi in un filo solo, dal più vecchio. */
export function chatItems(
    messages: CrmMessage[],
    events: CrmEvent[],
    teamName: (id: string | null) => string,
    labelOf: (type: CrmEvent["type"]) => string
): ChatItem[] {
    const items: ChatItem[] = messages.map(m => ({
        kind: "message",
        key: `m-${m.id}`,
        at: m.sent_at ?? m.created_at,
        message: m
    }));
    for (const e of events) {
        if (!CHAT_EVENTS.has(e.type)) continue;
        const detail = describeEvent(e, teamName);
        items.push({ kind: "event", key: `e-${e.id}`, at: e.created_at, text: detail ? `${labelOf(e.type)}: ${detail}` : labelOf(e.type) });
    }
    return items.sort((a, b) => a.at.localeCompare(b.at));
}

/** «Menù con QR» → «menù con QR»: solo la prima lettera. */
function lowerFirst(text: string): string {
    return text.charAt(0).toLowerCase() + text.slice(1);
}

// ── In breve ───────────────────────────────────────────────────────────────

/**
 * La riga «In breve» in cima alla chat: dove sta, cosa vuole, a che punto è
 * la conversazione e il prossimo passo. Messa insieme dai dati del lead, non
 * scritta da un agente: la pagina lo dice.
 */
export function leadBrief(input: {
    venue: Pick<CrmVenue, "city" | "stage" | "agent_hold_at">;
    leads: Pick<CrmLead, "interests" | "source">[];
    messages: Pick<CrmMessage, "direction" | "status">[];
    draft: Pick<CrmAgentDraftRow, "kind"> | null;
    nextStep: Pick<CrmNextStep, "step"> | null;
}): string {
    const { venue, leads, messages, draft, nextStep } = input;
    const parts: string[] = [];
    if (venue.city) parts.push(`A ${venue.city}.`);
    const interests = [...new Set(leads.flatMap(l => l.interests))];
    if (interests.length > 0) parts.push(`Vuole ${interests.map(lowerFirst).join(", ")}.`);

    const live = messages.filter(m => m.status !== "cancelled" && m.status !== "failed");
    const last = live[live.length - 1];
    if (draft?.kind === "reply") parts.push("Ha scritto: la risposta dell'agente è pronta.");
    else if (draft) parts.push("Un sollecito dell'agente è pronto.");
    else if (!last) parts.push("Nessun messaggio ancora.");
    else if (last.direction === "in") parts.push("Ha scritto per ultimo: tocca a noi.");
    else parts.push("Aspettiamo la sua risposta.");

    if (venue.agent_hold_at) parts.push("Lo gestisce una persona, l'agente non scrive.");
    if (nextStep) parts.push(`Prossimo passo: ${lowerFirst(nextStep.step).replace(/[.!]$/, "")}.`);
    return parts.join(" ");
}

// ── Risposte pronte ────────────────────────────────────────────────────────

export interface QuickReply {
    label: string;
    text: string;
}

/**
 * Le risposte pronte sotto la bozza (V5): un clic mette il testo nella bozza
 * da modificare, non lo manda. Fisse per ora; quando serviranno diverse per
 * persona diventano una tabella.
 */
export const QUICK_REPLIES: QuickReply[] = [
    {
        label: "Proponi la telefonata",
        text: "Ti va se te lo mostro in 10 minuti al telefono? Dimmi tu giorno e ora che ti sono comodi."
    },
    {
        label: "Manda l'esempio",
        text: "Ti mando un esempio di menù fatto con CataloGlobe, così vedi come lo trovano i clienti dal QR."
    },
    {
        label: "Chiedi quante sedi",
        text: "Per capire cosa ti serve: quante sedi avete?"
    }
];

/** Il prossimo passo è scaduto? (scadenza prima di oggi, a Roma). */
export function nextStepOverdue(step: Pick<CrmNextStep, "due_on"> | null, now: Date): boolean {
    if (!step?.due_on) return false;
    const p = romeParts(now);
    const today = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    return step.due_on < today;
}

/** «entro oggi», «entro domani», «entro gio 8 ott». */
export function nextStepDue(dueOn: string, now: Date): string {
    const p = romeParts(now);
    const today = Date.UTC(p.year, p.month - 1, p.day) / DAY_MS;
    const [y, m, d] = dueOn.split("-").map(Number);
    const due = Date.UTC(y, m - 1, d) / DAY_MS;
    const diff = due - today;
    if (diff < 0) return "scaduto";
    if (diff === 0) return "entro oggi";
    if (diff === 1) return "entro domani";
    const at = new Date(Date.UTC(y, m - 1, d, 12));
    return `entro ${at.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "")}`;
}
