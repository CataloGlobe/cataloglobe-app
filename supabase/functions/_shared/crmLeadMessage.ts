// @ts-nocheck
// =============================================================================
// CRM interno: dati di un messaggio Telegram, letti dal DB (service role)
// =============================================================================
// Condiviso da `crm-notify` (primo invio) e `crm-telegram-webhook` (riscrittura
// dopo un passaggio): stesso messaggio, stessi dati.
// =============================================================================

import { CRM_SOURCE_LABEL, CRM_STAGE_LABEL } from "./crmLabels.ts";
import {
    buildLeadMessage,
    romeWindowMinutesBetween,
    type CrmLeadMessageData,
    type CrmNotificationKind,
    type CrmReturnedContext,
    type CrmTeamMemberLite,
    type TelegramMessage
} from "./crmTelegram.ts";
import { telegramCall, isNotModified } from "./telegramApi.ts";
import { withRecipientLine } from "./crmRecipientLine.ts";
import { signWaLink } from "./crmWhatsapp.ts";

/**
 * Link «Scrivi su WhatsApp» per un destinatario: passa dall'edge `crm-wa`, che
 * registra il contatto e rimanda a wa.me. Null se manca il segreto o l'URL.
 */
export async function whatsappLinkFor(leadId: string, userId: string): Promise<string | null> {
    const secret = Deno.env.get("CRM_WA_LINK_SECRET");
    const base = Deno.env.get("SUPABASE_URL");
    if (!secret || !base) return null;
    const params = await signWaLink(secret, leadId, userId, Math.floor(Date.now() / 1000));
    return `${base}/functions/v1/crm-wa?${new URLSearchParams({ ...params }).toString()}`;
}

export interface TeamMemberRow extends CrmTeamMemberLite {
    telegram_chat_id: number | null;
    is_default_assignee: boolean;
    receives_escalations: boolean;
}

export async function loadTeam(supabase): Promise<TeamMemberRow[]> {
    const { data, error } = await supabase
        .from("crm_team_members")
        .select("user_id, display_name, telegram_chat_id, is_default_assignee, receives_escalations")
        .order("display_name");
    if (error) throw error;
    return data ?? [];
}

export async function loadLeadMessageData(
    supabase,
    leadId: string,
    kind: CrmNotificationKind,
    appUrl: string | null,
    now: Date = new Date()
): Promise<CrmLeadMessageData | null> {
    const { data: lead, error } = await supabase
        .from("crm_leads")
        .select("id, venue_id, source, ad_name, campaign, interests, form_answers, received_at, venue_name_given, venue_name_match, venue_name_check, crm_contacts(name, phone_e164), crm_venues(id, name, city, stage, lost_kind, assigned_to, created_at, stage_changed_at)")
        .eq("id", leadId)
        .maybeSingle();
    if (error) throw error;
    if (!lead || !lead.crm_venues) return null;

    const venue = lead.crm_venues;
    let returned: CrmReturnedContext | undefined;
    if (kind === "returned") {
        // Fase al momento del ritorno: l'ingresso può averla cambiata
        // (Perso «non adesso» → Nuovo).
        const { data: event } = await supabase
            .from("crm_events")
            .select("payload")
            .eq("lead_id", lead.id)
            .eq("type", "lead_returned")
            .maybeSingle();
        returned = {
            leadId: lead.id,
            knownSince: venue.created_at,
            stageKey: venue.stage,
            daysInStage: Math.max(0, Math.floor((now.getTime() - new Date(venue.stage_changed_at).getTime()) / 86_400_000)),
            previousStage: event?.payload?.stage ?? null,
            previousLostKind: event?.payload?.lost_kind ?? null,
            venueNameGiven: lead.venue_name_given ?? null,
            venueNameMatch: lead.venue_name_match ?? null,
            venueNameCheck: lead.venue_name_check ?? null
        };
    }

    const waitingMinutes = kind === "escalation"
        ? romeWindowMinutesBetween(new Date(lead.received_at), now)
        : 0;

    return {
        kind,
        venueId: venue.id,
        venueName: venue.name,
        city: venue.city,
        stageLabel: CRM_STAGE_LABEL[venue.stage] ?? venue.stage,
        contactName: lead.crm_contacts?.name ?? null,
        phoneE164: lead.crm_contacts?.phone_e164 ?? null,
        sourceLabel: CRM_SOURCE_LABEL[lead.source] ?? lead.source,
        adName: lead.ad_name,
        campaign: lead.campaign,
        interests: lead.interests ?? [],
        formAnswers: lead.form_answers ?? {},
        stoppedBefore: venue.stage === "perso" && venue.lost_kind === "stop",
        assignedTo: venue.assigned_to,
        waitingHours: kind === "escalation" ? Math.max(2, Math.floor(waitingMinutes / 60)) : undefined,
        adminUrl: appUrl ? `${appUrl}/admin/lead/${venue.id}` : null,
        hasPhone: Boolean(lead.crm_contacts?.phone_e164),
        returned
    };
}

/**
 * Riscrive tutti i messaggi già mandati per un locale (dopo un passaggio):
 * a ciascuno il suo testo e i suoi pulsanti.
 */
export async function refreshVenueMessages(
    supabase,
    token: string,
    venueId: string,
    appUrl: string | null
): Promise<void> {
    const [team, { data: rows, error }] = await Promise.all([
        loadTeam(supabase),
        supabase
            .from("crm_telegram_messages")
            .select("lead_id, user_id, kind, chat_id, message_id")
            .eq("venue_id", venueId)
            .not("message_id", "is", null)
    ]);
    if (error) throw error;

    // Chi ha ricevuto lo stesso avviso: serve alla riga del destinatario.
    const recipientsByKey = new Map<string, string[]>();
    for (const row of rows ?? []) {
        const key = `${row.lead_id}:${row.kind}`;
        recipientsByKey.set(key, [...(recipientsByKey.get(key) ?? []), row.user_id]);
    }

    const cache = new Map<string, CrmLeadMessageData | null>();
    for (const row of rows ?? []) {
        const key = `${row.lead_id}:${row.kind}`;
        if (!cache.has(key)) {
            cache.set(key, await loadLeadMessageData(supabase, row.lead_id, row.kind, appUrl));
        }
        const data = cache.get(key);
        if (!data) continue;
        const message: TelegramMessage = withRecipientLine(
            buildLeadMessage(data, row.user_id, team, await whatsappLinkFor(row.lead_id, row.user_id)),
            team,
            recipientsByKey.get(key) ?? [row.user_id],
            row.user_id
        );
        const result = await telegramCall(token, "editMessageText", {
            chat_id: row.chat_id,
            message_id: row.message_id,
            text: message.text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: message.reply_markup
        });
        if (!result.ok && !isNotModified(result)) {
            console.warn("crm refresh: edit fallito", row.chat_id, row.message_id, result.description);
        }
    }
}
