// @ts-nocheck
// =============================================================================
// crm-agent — agente WhatsApp in prova (F1-3)
// =============================================================================
//
// Invocata da pg_cron ogni minuto, solo quando c'è lavoro (migration
// 20261004010300): bozze di risposta e di follow-up con Claude e Revisore,
// avviso e solleciti su Telegram ad Alex e Lorenzo, stop riconosciuti. Il
// giro è in _shared/crmAgentJob.ts. Al lead non va nulla senza il tocco di
// una persona.
//
// AUTENTICAZIONE fail-CLOSED: X-Job-Secret = CRM_JOB_SECRET (lo stesso di
// crm-notify), confronto constant-time.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRM_JOB_SECRET,
// TELEGRAM_BOT_TOKEN, CRM_ANTHROPIC_API_KEY, GOOGLE_SERVICE_ACCOUNT_JSON
// (facoltativo), APP_URL (facoltativo).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualStr } from "../_shared/timingSafeEqual.ts";
import { getPublicSiteUrl } from "../_shared/publicSiteUrl.ts";
import { loadTeam } from "../_shared/crmLeadMessage.ts";
import { processAgent } from "../_shared/crmAgentJob.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const JOB_SECRET = Deno.env.get("CRM_JOB_SECRET");
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? null;

function json(status: number, body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    const provided = req.headers.get("X-Job-Secret");
    if (!JOB_SECRET || !provided || !timingSafeEqualStr(provided, JOB_SECRET)) {
        return json(401, { error: "unauthorized" });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        console.error("crm-agent: env mancante");
        return json(500, { error: "misconfigured" });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    try {
        const team = await loadTeam(supabase);
        const stats = await processAgent(supabase, team, BOT_TOKEN, getPublicSiteUrl());
        console.log(JSON.stringify({ event: "crm_agent", ...stats }));
        return json(200, stats);
    } catch (err) {
        const e = err as { code?: unknown; message?: unknown };
        console.error("crm-agent: error", e?.code ?? "", e?.message ?? String(err));
        return json(500, { error: "agent_failed" });
    }
});
