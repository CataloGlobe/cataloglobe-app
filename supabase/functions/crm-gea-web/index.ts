// @ts-nocheck
// =============================================================================
// crm-gea-web — Gea dal computer, pannello di /admin (canvas V9)
// =============================================================================
//
// POST { text, history?, page? } con il JWT di una persona che è admin di
// piattaforma e nel team del CRM. Stesso giro di Telegram (crmGeaJob.think):
// domande, testi da copiare e i comandi immediati (nota, fase, assegnazione,
// pausa), con la persona come attore e la riga nel diario. I comandi che su
// Telegram chiedono «Sì, fallo» qui non partono: lo dice la risposta.
// Gea non scrive mai ai lead. Spesa e tetti come ogni chiamata a Claude
// (crm_ai_gate e crm_record_ai_usage dentro callCrmClaude, ruolo gea).
//
// La memoria corta la manda il browser: crm_gea_inbox accetta solo messaggi
// di Telegram, e questa funzione non tocca tabelle né funzioni esistenti.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRM_ANTHROPIC_API_KEY,
// TELEGRAM_BOT_TOKEN (per riscrivere i messaggi di un lead riassegnato),
// APP_URL (facoltativo).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPublicSiteUrl } from "../_shared/publicSiteUrl.ts";
import { loadTeam } from "../_shared/crmLeadMessage.ts";
import { GEA_TEXT } from "../_shared/crmGea.ts";
import { think } from "../_shared/crmGeaJob.ts";
import { GEA_WEB_TEXT, parseGeaWebRequest, webReply, withPageHint } from "../_shared/crmGeaWeb.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(status: number, body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" }
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

    const parsed = parseGeaWebRequest(await req.json().catch(() => null));
    if ("invalid" in parsed) {
        if (parsed.invalid === "too_long") return json(200, { status: "answered", reply: GEA_TEXT.tooLong });
        return json(400, { error: "invalid_request", detail: parsed.invalid });
    }

    let team;
    try {
        team = await loadTeam(supabase);
    } catch (err) {
        console.error("crm-gea-web: team", err?.code ?? "", err?.message ?? String(err));
        return json(500, { error: "team_failed" });
    }
    const actor = team.find(m => m.user_id === userData.user.id);
    if (!actor) return json(403, { error: "not_in_team", reply: GEA_WEB_TEXT.notInTeam });

    let venueName = null;
    if (parsed.page?.kind === "lead") {
        const { data: venue } = await supabase.from("crm_venues").select("name").eq("id", parsed.page.venueId).maybeSingle();
        venueName = venue?.name ?? null;
    }

    const now = new Date();
    try {
        const out = await think(
            supabase,
            BOT_TOKEN,
            withPageHint(parsed.text, parsed.page, venueName),
            actor,
            team,
            getPublicSiteUrl(),
            now,
            parsed.history,
            // Una pausa chiesta dal pannello è una pausa da /admin.
            "admin"
        );
        if (out.error) console.warn("crm-gea-web:", out.status, out.error);
        return json(200, { status: out.status, reply: webReply(out), cost_usd: out.costUsd });
    } catch (err) {
        console.error("crm-gea-web: giro", err?.fn ?? "", err?.code ?? "", err?.message ?? String(err));
        return json(200, { status: "failed", reply: GEA_TEXT.failed });
    }
});
