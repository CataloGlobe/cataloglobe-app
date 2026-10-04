// @ts-nocheck
// =============================================================================
// crm-agent-check — prova di collegamento a Claude da /admin, pagina Agenti
// =============================================================================
//
// POST { role } con il JWT di un admin di piattaforma. Una chiamata minima
// col modello di quel ruolo, dalla stessa strada degli agenti
// (_shared/crmClaude.ts): verifica chiave, modello, registro dei costi e
// tetti. Il freno a mano non la ferma (non scrive a nessun lead), i tetti sì.
// Costa una frazione di centesimo e finisce nel registro come le altre.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRM_ANTHROPIC_API_KEY,
// TELEGRAM_BOT_TOKEN (facoltativo, per gli avvisi di spesa).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callCrmClaude } from "../_shared/crmClaude.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ROLES = new Set(["conversation", "reviewer", "sensitive", "gea"]);

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
    const role = typeof body?.role === "string" ? body.role : "";
    if (!ROLES.has(role)) return json(400, { error: "invalid_role" });

    const started = Date.now();
    const result = await callCrmClaude(supabase, {
        role,
        system: ["Questa è una prova di collegamento. Rispondi solo con la parola: ok"],
        messages: [{ role: "user", content: "Prova" }],
        maxTokens: 10,
        timeoutMs: 30_000,
        ignoreBrake: true
    });
    const latencyMs = Date.now() - started;

    if (!result.ok) {
        console.warn("crm-agent-check:", role, result.reason, result.detail ?? "");
        return json(200, { ok: false, reason: result.reason, model: result.model ?? null, detail: result.detail ?? null });
    }
    return json(200, {
        ok: true,
        model: result.model,
        reply: result.text.slice(0, 40),
        cost_usd: result.costUsd,
        latency_ms: latencyMs
    });
});
