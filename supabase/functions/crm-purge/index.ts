// @ts-nocheck
// =============================================================================
// crm-purge — conservazione dei locali del CRM (12 mesi)
// =============================================================================
//
// Invocata da pg_cron ogni notte (migration 20261001160200). Le regole stanno
// in SQL, in public.crm_purge_venues (20261001160000): ultima richiesta
// (crm_leads.received_at) di più di 12 mesi fa, come dice l'informativa, non
// In prova né Cliente pagante, nessun account collegato. Contatti, ingressi ed eventi vanno via a cascata; un
// locale in stop lascia l'impronta del telefono in crm_suppressions.
// Poi public.crm_purge_agent_decisions (20261002210100): righe del diario degli
// agenti senza locale né lead, stessa soglia. Poi public.crm_purge_messages
// (20261002220100): messaggi WhatsApp più vecchi della soglia, anche nei
// locali che restano.
//
// AUTENTICAZIONE fail-CLOSED: X-Job-Secret = CRM_JOB_SECRET.
// DRY-RUN DI DEFAULT: senza `{"dry_run": false}` nel body conta e basta.
// Soglia: stessi 12 mesi di calendario di purge-leads (leadRetentionCutoff).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRM_JOB_SECRET.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualStr } from "../_shared/timingSafeEqual.ts";
import { leadRetentionCutoff } from "../_shared/leadRetention.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JOB_SECRET = Deno.env.get("CRM_JOB_SECRET");

function json(status: number, body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

Deno.serve(async (req: Request) => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    const provided = req.headers.get("X-Job-Secret");
    if (!JOB_SECRET || !provided || !timingSafeEqualStr(provided, JOB_SECRET)) {
        return json(401, { error: "unauthorized" });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        console.error("crm-purge: env mancante");
        return json(500, { error: "misconfigured" });
    }

    let body: Record<string, unknown> = {};
    try {
        body = await req.json();
    } catch {
        body = {}; // body assente o non JSON: resta dry-run
    }
    const dryRun = body.dry_run !== false;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const cutoff = leadRetentionCutoff(new Date()).toISOString();

    try {
        const { data, error } = await supabase.rpc("crm_purge_venues", {
            p_cutoff: cutoff,
            p_dry_run: dryRun
        });
        if (error) throw error;
        const count = typeof data === "number" ? data : 0;
        // Diario degli agenti: righe senza locale né lead (le altre vanno a cascata sopra).
        const { data: diary, error: diaryError } = await supabase.rpc("crm_purge_agent_decisions", {
            p_cutoff: cutoff,
            p_dry_run: dryRun
        });
        if (diaryError) throw diaryError;
        const decisions = typeof diary === "number" ? diary : 0;
        // Messaggi WhatsApp: quelli dei locali cancellati sono già andati a cascata.
        const { data: chat, error: chatError } = await supabase.rpc("crm_purge_messages", {
            p_cutoff: cutoff,
            p_dry_run: dryRun
        });
        if (chatError) throw chatError;
        const messages = typeof chat === "number" ? chat : 0;
        const result = dryRun
            ? {
                  dry_run: true,
                  cutoff,
                  would_delete: count,
                  would_delete_decisions: decisions,
                  would_delete_messages: messages
              }
            : { dry_run: false, cutoff, deleted: count, deleted_decisions: decisions, deleted_messages: messages };
        console.log(JSON.stringify({ event: "crm_purge", ...result }));
        return json(200, result);
    } catch (err) {
        const e = err as { code?: unknown; message?: unknown };
        console.error("crm-purge: error", e?.code ?? "", e?.message ?? String(err));
        return json(500, { error: "purge_failed" });
    }
});
