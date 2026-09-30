// @ts-nocheck
// =============================================================================
// purge-leads — conservazione dei contatti dalla landing (12 mesi)
// =============================================================================
//
// Invocata da pg_cron ogni notte. Cancella da `public.leads` i contatti più
// vecchi di 12 mesi che non sono diventati clienti (status diverso da 'won').
// Esiste perché l'informativa privacy dichiara quel periodo: dichiararlo senza
// cancellare è una promessa non mantenuta.
//
// AUTENTICAZIONE fail-CLOSED, come `purge-reservation-data`: segreto assente
// dall'env ⇒ 401. DRY-RUN DI DEFAULT: senza `{"dry_run": false}` esplicito
// nel body riporta solo quanti contatti cancellerebbe.
//
// Segreto: LEADS_RETENTION_SECRET (env della funzione) = vault
// `leads_retention_secret` (letto dal cron).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { LEAD_KEPT_STATUS, leadRetentionCutoff } from "../_shared/leadRetention.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JOB_SECRET = Deno.env.get("LEADS_RETENTION_SECRET")!;

// Confronto constant-time, stessa implementazione di purge-reservation-data.
function timingSafeEqualStr(a: string, b: string): boolean {
    const aBytes = new TextEncoder().encode(a);
    const bBytes = new TextEncoder().encode(b);
    const maxLen = Math.max(aBytes.length, bBytes.length);
    let diff = aBytes.length === bBytes.length ? 0 : 1;
    for (let i = 0; i < maxLen; i++) {
        const x = i < aBytes.length ? aBytes[i] : 0;
        const y = i < bBytes.length ? bBytes[i] : 0;
        diff |= x ^ y;
    }
    return diff === 0;
}

function json(status: number, body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

Deno.serve(async (req: Request) => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    const providedSecret = req.headers.get("X-Job-Secret");
    if (!JOB_SECRET || !providedSecret || !timingSafeEqualStr(providedSecret, JOB_SECRET)) {
        return json(401, { error: "unauthorized" });
    }

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        console.error("purge-leads: env mancante (URL / service role)");
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
        if (dryRun) {
            const { count, error } = await supabase
                .from("leads")
                .select("id", { count: "exact", head: true })
                .neq("status", LEAD_KEPT_STATUS)
                .lt("created_at", cutoff);
            if (error) throw error;
            console.log(JSON.stringify({ event: "purge_leads", dry_run: true, cutoff, would_delete: count ?? 0 }));
            return json(200, { dry_run: true, cutoff, would_delete: count ?? 0 });
        }

        const { data, error } = await supabase
            .from("leads")
            .delete()
            .neq("status", LEAD_KEPT_STATUS)
            .lt("created_at", cutoff)
            .select("id");
        if (error) throw error;
        const deleted = data?.length ?? 0;
        console.log(JSON.stringify({ event: "purge_leads", dry_run: false, cutoff, deleted }));
        return json(200, { dry_run: false, cutoff, deleted });
    } catch (err) {
        const e = err as { code?: unknown; message?: unknown };
        console.error("purge-leads: error", e?.code ?? "", e?.message ?? String(err));
        return json(500, { error: "purge_failed" });
    }
});
