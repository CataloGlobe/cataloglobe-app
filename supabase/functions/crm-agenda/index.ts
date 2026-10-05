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
import { loadAgendaBusy, processAgenda } from "../_shared/crmAgendaJob.ts";

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
            return json(200, await loadAgendaBusy(supabase, team, from, to));
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
