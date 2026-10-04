// @ts-nocheck
// =============================================================================
// crm-agenda — agenda delle telefonate da /admin (F1-4a)
// =============================================================================
//
// POST con il JWT di un admin di piattaforma:
//   { action: "busy", from, to }  impegni tra due istanti (al massimo 14
//       giorni): eventi del calendario CataloGlobe su Google, più le
//       telefonate attive del CRM. Servono alla card «Telefonata» per gli
//       orari liberi e per «Si sovrappone con …, fisso comunque?».
//       Risponde { google: "ok" | "off" | "error", google_error, busy: [...] }.
//   { action: "run" }  il giro dell'agenda subito (evento Google, «Puoi tu?»),
//       dopo che una persona ha fissato, spostato o annullato. Lo stesso giro
//       lo fa il cron ogni 5 minuti: chiamarlo è solo per non aspettare.
//
// Il calendario e la chiave: vedi _shared/crmGoogleCalendar.ts.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN,
// GOOGLE_SERVICE_ACCOUNT_JSON (facoltativo), APP_URL (facoltativo).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPublicSiteUrl } from "../_shared/publicSiteUrl.ts";
import { loadTeam } from "../_shared/crmLeadMessage.ts";
import { processAgenda } from "../_shared/crmAgendaJob.ts";
import { getAccessToken, listEvents, parseCalendarEvents, parseServiceAccount } from "../_shared/crmGoogleCalendar.ts";
import { romeWallClock } from "../_shared/crmCallSlots.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? null;
const MAX_RANGE_MS = 14 * 24 * 60 * 60_000;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(status: number, body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

function romeDayStart(day: string): string {
    const [y, m, d] = day.split("-").map(Number);
    return romeWallClock(y, m, d, 0, 0).toISOString();
}

async function busy(supabase, team, from: Date, to: Date) {
    const { data: rows, error } = await supabase
        .from("crm_appointments")
        .select("id, starts_at, ends_at, caller_user_id, crm_venues(name)")
        .in("status", ["proposed", "confirmed"])
        .lt("starts_at", to.toISOString())
        .gt("ends_at", from.toISOString());
    if (error) throw error;
    const crm = (rows ?? []).map(r => {
        const caller = team.find(m => m.user_id === r.caller_user_id)?.display_name;
        return {
            start: new Date(r.starts_at).toISOString(),
            end: new Date(r.ends_at).toISOString(),
            label: `Telefonata: ${r.crm_venues?.name ?? "locale"}${caller ? ` (chiama ${caller})` : ""}`,
            appointment_id: r.id,
            caller_user_id: r.caller_user_id
        };
    });

    const { data: settings } = await supabase.from("crm_settings").select("google_calendar_id").eq("id", true).maybeSingle();
    const calendarId = settings?.google_calendar_id?.trim() || null;
    const account = parseServiceAccount(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"));
    if (!calendarId) return { google: "off", google_error: null, busy: crm };
    if (!account) {
        return { google: "error", google_error: "Chiave dell'account di servizio Google mancante.", busy: crm };
    }
    try {
        const token = await getAccessToken(account);
        const items = await listEvents(token, calendarId, from.toISOString(), to.toISOString());
        // Gli eventi creati dal CRM ci sono già come telefonate: non si contano due volte.
        const known = new Set(crm.map(c => c.appointment_id));
        const google = parseCalendarEvents(items, romeDayStart)
            .filter(e => !e.appointmentId || !known.has(e.appointmentId))
            .map(e => ({ start: e.start, end: e.end, label: e.label, appointment_id: e.appointmentId, caller_user_id: null }));
        return { google: "ok", google_error: null, busy: [...crm, ...google] };
    } catch (err) {
        console.error("crm-agenda: Google", (err as Error)?.message);
        return { google: "error", google_error: "Calendario Google non raggiungibile.", busy: crm };
    }
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(500, { error: "not_configured" });

    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: userData, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !userData?.user) return json(401, { error: "unauthorized" });

    const { data: admin, error: adminError } = await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", userData.user.id)
        .maybeSingle();
    if (adminError) return json(500, { error: "admin_check_failed" });
    if (!admin) return json(403, { error: "forbidden" });

    const body = await req.json().catch(() => null);
    try {
        const team = await loadTeam(supabase);
        if (body?.action === "busy") {
            const from = new Date(String(body.from ?? ""));
            const to = new Date(String(body.to ?? ""));
            if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > MAX_RANGE_MS) {
                return json(400, { error: "invalid_range" });
            }
            return json(200, await busy(supabase, team, from, to));
        }
        if (body?.action === "run") {
            const stats = await processAgenda(supabase, team, BOT_TOKEN, getPublicSiteUrl());
            return json(200, { ok: true, ...stats });
        }
        return json(400, { error: "invalid_action" });
    } catch (err) {
        const e = err as { code?: unknown; message?: unknown };
        console.error("crm-agenda: error", e?.code ?? "", e?.message ?? String(err));
        return json(500, { error: "agenda_failed" });
    }
});
