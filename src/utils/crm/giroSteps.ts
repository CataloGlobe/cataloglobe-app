/**
 * Il giro di un messaggio, passo per passo (canvas M1, deciso da Alex il
 * 2026-10-05): per ogni passo, i messaggi di oggi che ci sono passati o che ci
 * aspettano. Puro: legge messaggi, bozze e diario già caricati.
 */
import type { CrmAgentDecision, CrmAgentDraftRow, CrmAgentDraftStatus, CrmMessage, CrmMessagePurpose } from "@/types/crm";
import { formatWait, waitLevel, workingMinutesBetween } from "@shared/crmGuide";
import { isRomeToday } from "./agentsOverview";

export type GiroStepNumber = 1 | 2 | 3 | 4 | 5;
export type GiroTone = "success" | "warning" | "danger" | "neutral" | "brand";

export interface GiroItem {
    key: string;
    /** Ora di Roma («16:42»), o l'attesa al passo 4 («45 min»). */
    when: string;
    venueId: string;
    venueName: string;
    text: string;
    tag: string;
    tone: GiroTone;
    /** Al passo 4: la bozza da mandare così. */
    draftId?: string;
}

export interface GiroSources {
    messages: CrmMessage[];
    drafts: CrmAgentDraftRow[];
    decisions: CrmAgentDecision[];
    venueName: (venueId: string) => string;
    now: Date;
}

/** Quante righe mostra il riquadro del passo. */
export const GIRO_ITEMS_LIMIT = 5;

const HOUR = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

function hour(iso: string): string {
    return HOUR.format(new Date(iso));
}

function excerpt(text: string | null, fallback: string): string {
    const clean = (text ?? "").replace(/\s+/g, " ").trim();
    if (!clean) return fallback;
    return clean.length > 110 ? `${clean.slice(0, 109)}…` : clean;
}

const DRAFT_TAG: Record<CrmAgentDraftStatus, [string, GiroTone]> = {
    pending: ["aspetta voi", "warning"],
    sent: ["partita così", "success"],
    edited: ["corretta e partita", "success"],
    discarded: ["scartata", "neutral"],
    expired: ["scaduta", "neutral"],
    scheduled: ["programmata", "brand"],
    handled: ["gestita da voi", "neutral"]
};

const PURPOSE: Record<CrmMessagePurpose, string> = {
    first_message: "Primo messaggio",
    reply: "Risposta",
    follow_up: "Sollecito",
    call_confirm: "Conferma della chiamata",
    call_reminder: "Promemoria della chiamata",
    call_soon: "Chiamata tra poco"
};

const KIND_TEXT: Record<CrmMessage["kind"], string> = {
    text: "Messaggio",
    voice: "Messaggio vocale",
    image: "Foto",
    video: "Video",
    document: "Documento",
    sticker: "Adesivo",
    other: "Messaggio"
};

const byNewest = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

/** I messaggi di oggi al passo dato, i più recenti prima (al passo 4 i più vecchi). */
export function giroItems(step: GiroStepNumber, src: GiroSources): GiroItem[] {
    const { messages, drafts, decisions, venueName, now } = src;
    const todayDrafts = drafts.filter(d => isRomeToday(d.created_at, now));

    if (step === 1) {
        // L'ultima bozza di oggi del locale dice a che punto è la risposta.
        const lastDraft = new Map<string, CrmAgentDraftRow>();
        for (const d of [...todayDrafts].sort((a, b) => byNewest(b.created_at, a.created_at))) lastDraft.set(d.venue_id, d);
        return messages
            .filter(m => m.direction === "in" && isRomeToday(m.created_at, now))
            .sort((a, b) => byNewest(a.created_at, b.created_at))
            .slice(0, GIRO_ITEMS_LIMIT)
            .map(m => {
                const draft = lastDraft.get(m.venue_id);
                const answered = draft && draft.created_at >= m.created_at;
                const [tag, tone]: [string, GiroTone] = answered
                    ? draft.status === "pending"
                        ? ["bozza pronta", "brand"]
                        : DRAFT_TAG[draft.status]
                    : ["da rispondere", "neutral"];
                return {
                    key: m.id,
                    when: hour(m.created_at),
                    venueId: m.venue_id,
                    venueName: venueName(m.venue_id),
                    text: m.kind === "text" ? excerpt(m.body, "Messaggio") : KIND_TEXT[m.kind],
                    tag,
                    tone
                };
            });
    }

    if (step === 2) {
        return [...todayDrafts]
            .sort((a, b) => byNewest(a.created_at, b.created_at))
            .slice(0, GIRO_ITEMS_LIMIT)
            .map(d => ({
                key: d.id,
                when: hour(d.created_at),
                venueId: d.venue_id,
                venueName: d.venue_name,
                text: excerpt(d.proposed_text, d.reason ?? "Bozza senza testo"),
                tag: DRAFT_TAG[d.status][0],
                tone: DRAFT_TAG[d.status][1]
            }));
    }

    if (step === 3) {
        return decisions
            .filter(d => d.review_outcome !== null && d.venue_id !== null && isRomeToday(d.created_at, now))
            .sort((a, b) => byNewest(a.created_at, b.created_at))
            .slice(0, GIRO_ITEMS_LIMIT)
            .map(d => {
                const stopped = d.review_outcome === "rejected";
                return {
                    key: d.id,
                    when: hour(d.created_at),
                    venueId: d.venue_id as string,
                    venueName: venueName(d.venue_id as string),
                    text: stopped ? excerpt(d.reason, "Fermata dal revisore") : "Prezzi, promesse e tono a posto",
                    tag: stopped ? "fermata" : "passa",
                    tone: stopped ? ("danger" as const) : ("success" as const)
                };
            });
    }

    if (step === 4) {
        return drafts
            .filter(d => d.status === "pending")
            .sort((a, b) => byNewest(b.created_at, a.created_at))
            .slice(0, GIRO_ITEMS_LIMIT)
            .map(d => {
                const minutes = workingMinutesBetween(new Date(d.created_at), now);
                const level = waitLevel(minutes);
                return {
                    key: d.id,
                    when: formatWait(minutes),
                    venueId: d.venue_id,
                    venueName: d.venue_name,
                    text: excerpt(d.proposed_text, d.reason ?? "Bozza senza testo"),
                    tag: "aspetta",
                    tone: level === "rosso" ? ("danger" as const) : level === "arancio" ? ("warning" as const) : ("neutral" as const),
                    draftId: d.id
                };
            });
    }

    return messages
        .filter(m => m.direction === "out" && m.status === "sent" && m.sent_at !== null && isRomeToday(m.sent_at, now))
        .sort((a, b) => byNewest(a.sent_at as string, b.sent_at as string))
        .slice(0, GIRO_ITEMS_LIMIT)
        .map(m => ({
            key: m.id,
            when: hour(m.sent_at as string),
            venueId: m.venue_id,
            venueName: venueName(m.venue_id),
            text: `${m.purpose ? PURPOSE[m.purpose] : "Messaggio"}: ${excerpt(m.body, "senza testo")}`,
            tag: m.author === "agent" ? "dall'agente" : "da voi",
            tone: m.author === "agent" ? ("brand" as const) : ("neutral" as const)
        }));
}

/** Messaggi arrivati dai lead oggi (il numero del passo 1). */
export function arrivedToday(messages: CrmMessage[], now: Date): number {
    return messages.filter(m => m.direction === "in" && isRomeToday(m.created_at, now)).length;
}
