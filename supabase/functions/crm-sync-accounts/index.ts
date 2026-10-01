// @ts-nocheck
// =============================================================================
// crm-sync-accounts — legame tra lead del CRM e account CataloGlobe
// =============================================================================
//
// Invocata da pg_cron ogni 15 minuti (migration 20261001150300). Tre passi:
//   1. telefono del proprietario (profiles.phone, normalizzato E.164) uguale a
//      quello di un contatto del CRM → crm_link_account('phone_auto'), salvo
//      che quel collegamento sia stato scartato a mano (proposta dismessa);
//   2. per ogni locale collegato, la fase segue l'abbonamento
//      (nextStageForAccount: trialing → In prova, active → Cliente pagante,
//      solo in avanti) via crm_move_stage, attore NULL = sistema;
//   3. email del proprietario o nome dell'azienda uguali a quelli di un locale
//      non collegato → proposta in crm_account_suggestions (mai automatica).
// Regole in _shared/crmAccountSync.ts (puro, testato).
//
// AUTENTICAZIONE fail-CLOSED: X-Job-Secret = CRM_JOB_SECRET.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRM_JOB_SECRET.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualStr } from "../_shared/timingSafeEqual.ts";
import { normalizePhoneToE164 } from "../_shared/phoneNormalize.ts";
import { nextStageForAccount, normalizeVenueName, pickTenant } from "../_shared/crmAccountSync.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JOB_SECRET = Deno.env.get("CRM_JOB_SECRET");

function json(status: number, body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

async function sync(supabase) {
    const stats = { linked: 0, moved: 0, suggested: 0 };

    const [tenantsRes, venuesRes, dismissedRes] = await Promise.all([
        supabase
            .from("tenants")
            .select("id, name, owner_user_id, subscription_status, created_at")
            .is("deleted_at", null),
        supabase
            .from("crm_venues")
            .select("id, name, stage, tenant_id, crm_contacts(phone_e164, email)"),
        supabase.from("crm_account_suggestions").select("venue_id, tenant_id, dismissed_at")
    ]);
    if (tenantsRes.error) throw tenantsRes.error;
    if (venuesRes.error) throw venuesRes.error;
    if (dismissedRes.error) throw dismissedRes.error;

    const tenants = tenantsRes.data ?? [];
    const ownerIds = [...new Set(tenants.map(t => t.owner_user_id).filter(Boolean))];
    const { data: profiles, error: profilesError } = ownerIds.length
        ? await supabase.from("profiles").select("id, phone, email").in("id", ownerIds)
        : { data: [], error: null };
    if (profilesError) throw profilesError;

    const profileById = new Map((profiles ?? []).map(p => [p.id, p]));
    const tenantById = new Map(tenants.map(t => [t.id, t]));
    const byPhone = new Map<string, typeof tenants>();
    const byEmail = new Map<string, typeof tenants>();
    const byName = new Map<string, typeof tenants>();
    const push = (map, key, tenant) => {
        if (!key) return;
        map.set(key, [...(map.get(key) ?? []), tenant]);
    };
    for (const tenant of tenants) {
        const profile = profileById.get(tenant.owner_user_id);
        push(byPhone, normalizePhoneToE164(profile?.phone ?? null), tenant);
        push(byEmail, profile?.email?.trim().toLowerCase(), tenant);
        push(byName, normalizeVenueName(tenant.name ?? ""), tenant);
    }

    const known = new Set((dismissedRes.data ?? []).map(s => `${s.venue_id}:${s.tenant_id}`));
    const dismissed = new Set(
        (dismissedRes.data ?? []).filter(s => s.dismissed_at).map(s => `${s.venue_id}:${s.tenant_id}`)
    );

    for (const venue of venuesRes.data ?? []) {
        let tenantId = venue.tenant_id;

        // 1. Telefono identico → collegamento automatico.
        if (!tenantId) {
            const candidates = (venue.crm_contacts ?? [])
                .flatMap(c => byPhone.get(c.phone_e164) ?? [])
                .filter(t => !dismissed.has(`${venue.id}:${t.id}`));
            const tenant = pickTenant(candidates);
            if (tenant) {
                const { error } = await supabase.rpc("crm_link_account", {
                    p_venue_id: venue.id,
                    p_tenant_id: tenant.id,
                    p_link_source: "phone_auto"
                });
                if (error) throw error;
                tenantId = tenant.id;
                stats.linked += 1;
            }
        }

        // 2. La fase segue l'abbonamento.
        if (tenantId) {
            const tenant = tenantById.get(tenantId);
            const next = tenant ? nextStageForAccount(venue.stage, tenant.subscription_status) : null;
            if (next) {
                const { error } = await supabase.rpc("crm_move_stage", {
                    p_venue_id: venue.id,
                    p_stage: next
                });
                if (error) throw error;
                stats.moved += 1;
            }
            continue;
        }

        // 3. Email o nome uguali → solo proposta.
        const suggestions = new Map<string, "email" | "name">();
        for (const contact of venue.crm_contacts ?? []) {
            for (const t of byEmail.get(contact.email?.trim().toLowerCase() ?? "") ?? []) {
                suggestions.set(t.id, "email");
            }
        }
        for (const t of byName.get(normalizeVenueName(venue.name)) ?? []) {
            if (!suggestions.has(t.id)) suggestions.set(t.id, "name");
        }
        for (const [suggestedTenantId, reason] of suggestions) {
            if (known.has(`${venue.id}:${suggestedTenantId}`)) continue;
            const { error } = await supabase
                .from("crm_account_suggestions")
                .insert({ venue_id: venue.id, tenant_id: suggestedTenantId, reason });
            if (error && error.code !== "23505") throw error;
            stats.suggested += 1;
        }
    }
    return stats;
}

Deno.serve(async (req: Request) => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    const provided = req.headers.get("X-Job-Secret");
    if (!JOB_SECRET || !provided || !timingSafeEqualStr(provided, JOB_SECRET)) {
        return json(401, { error: "unauthorized" });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        console.error("crm-sync-accounts: env mancante");
        return json(500, { error: "misconfigured" });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    try {
        const stats = await sync(supabase);
        console.log(JSON.stringify({ event: "crm_sync_accounts", ...stats }));
        return json(200, stats);
    } catch (err) {
        const e = err as { code?: unknown; message?: unknown };
        console.error("crm-sync-accounts: error", e?.code ?? "", e?.message ?? String(err));
        return json(500, { error: "sync_failed" });
    }
});
