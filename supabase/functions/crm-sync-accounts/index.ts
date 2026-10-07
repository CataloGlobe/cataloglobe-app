// @ts-nocheck
// =============================================================================
// crm-sync-accounts — legame tra lead del CRM e account CataloGlobe
// =============================================================================
//
// Invocata da pg_cron ogni 15 minuti (migration 20261001150300). Tre passi:
//   1. telefono del proprietario (profiles.phone, normalizzato E.164) uguale a
//      quello di un contatto del CRM → crm_link_account('phone_auto'), salvo
//      che quel collegamento sia stato scartato a mano (proposta dismessa);
//   2. per ogni locale collegato:
//      a. lo stato dell'abbonamento (accountStateFor: 'registrato' senza
//         subscription), il tipo di prova (metadata `trial_no_card` letti da
//         Stripe, solo per le prove in corso e solo finché non è noto) e la
//         scadenza (trial_until) vanno sul locale con crm_sync_account_state,
//         che scrive `subscription_changed` nella storia se cambiano;
//      b. la fase segue l'abbonamento (nextStageForAccount: trialing → In
//         prova, active → Cliente pagante, solo in avanti; mai Perso, mai una
//         «Fase bloccata a mano») via crm_move_stage con la fase attesa,
//         attore NULL = sistema;
//   3. email del proprietario o nome dell'azienda uguali a quelli di un locale
//      non collegato → proposta in crm_account_suggestions (mai automatica).
//   4. post-vendita (migration 20261006090000): per i locali collegati i gesti
//      da fare (menù non online, prova in scadenza, crescita, passaparola,
//      _shared/crmPostSale.ts) vanno su Telegram una volta per gesto, nei
//      feriali dalle 10 alle 18, al massimo POST_SALE_ALERTS_PER_RUN per giro.
//      Passo a parte: se fallisce (o la migration manca) i passi 1-3 restano.
// Regole in _shared/crmAccountSync.ts e _shared/crmPostSale.ts (puri, testati).
//
// AUTENTICAZIONE fail-CLOSED: X-Job-Secret = CRM_JOB_SECRET.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRM_JOB_SECRET,
// STRIPE_SECRET_KEY (facoltativa: senza, il tipo di prova resta da sapere),
// TELEGRAM_BOT_TOKEN e APP_URL (facoltativi: avvisi del post-vendita).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualStr } from "../_shared/timingSafeEqual.ts";
import { normalizePhoneToE164 } from "../_shared/phoneNormalize.ts";
import {
    accountStateFor,
    nextStageForAccount,
    normalizeVenueName,
    pickTenant,
    trialKindFromMetadata
} from "../_shared/crmAccountSync.ts";
import {
    POST_SALE_LABEL,
    isPostSaleAlertTime,
    needsPostSaleAlert,
    postSaleReason,
    postSaleSignals
} from "../_shared/crmPostSale.ts";
import { sendToTeam } from "../_shared/crmTeamAlert.ts";
import { escapeHtml } from "../_shared/crmTelegram.ts";
import { getPublicSiteUrl } from "../_shared/publicSiteUrl.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JOB_SECRET = Deno.env.get("CRM_JOB_SECRET");
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

function json(status: number, body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

const PAGE = 1000;
const PROFILE_CHUNK = 100;

/** PostgREST risponde al massimo 1000 righe: si legge a pagine. */
async function fetchAll(build) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await build().range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) return rows;
    }
}

/**
 * Tipo di prova dai metadata della subscription su Stripe. null se non si
 * può sapere adesso (chiave assente, Stripe lento o in errore): riprova al
 * giro dopo.
 */
async function fetchTrialKind(subscriptionId: string): Promise<"carta" | "codice" | null> {
    if (!STRIPE_SECRET_KEY) return null;
    try {
        const res = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
            headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) {
            console.warn("crm-sync-accounts: Stripe", res.status);
            return null;
        }
        const sub = await res.json();
        return trialKindFromMetadata(sub?.metadata);
    } catch (err) {
        console.warn("crm-sync-accounts: Stripe non raggiungibile", String(err));
        return null;
    }
}

async function sync(supabase) {
    const stats = { linked: 0, moved: 0, suggested: 0, account_changes: 0, failed: 0 };
    // Un locale che fallisce si salta: il giro va avanti con gli altri, invece
    // di fermarsi ogni volta sullo stesso.
    const skipVenue = (venueId: string, error: { code?: string; message?: string }) => {
        stats.failed += 1;
        console.error("crm-sync-accounts: locale saltato", venueId, error.code ?? "", error.message ?? "");
    };

    const [tenants, venues, suggestionRows] = await Promise.all([
        fetchAll(() =>
            supabase
                .from("tenants")
                .select("id, name, owner_user_id, subscription_status, stripe_subscription_id, trial_until, created_at")
                .is("deleted_at", null)
                .order("id")
        ),
        fetchAll(() =>
            supabase
                .from("crm_venues")
                .select(
                    "id, name, name_pending, stage, tenant_id, stage_locked_at, account_state, trial_kind, trial_ends_at, crm_contacts(phone_e164, email)"
                )
                .order("id")
        ),
        fetchAll(() =>
            supabase.from("crm_account_suggestions").select("venue_id, tenant_id, dismissed_at").order("id")
        )
    ]);

    // Gli id dei proprietari a gruppi: tutti insieme sforano la lunghezza dell'URL.
    const ownerIds = [...new Set(tenants.map(t => t.owner_user_id).filter(Boolean))];
    const profiles = [];
    for (let i = 0; i < ownerIds.length; i += PROFILE_CHUNK) {
        const { data, error } = await supabase
            .from("profiles")
            .select("id, phone, email")
            .in("id", ownerIds.slice(i, i + PROFILE_CHUNK));
        if (error) throw error;
        profiles.push(...(data ?? []));
    }

    const profileById = new Map(profiles.map(p => [p.id, p]));
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

    const known = new Set(suggestionRows.map(s => `${s.venue_id}:${s.tenant_id}`));
    const dismissed = new Set(suggestionRows.filter(s => s.dismissed_at).map(s => `${s.venue_id}:${s.tenant_id}`));

    for (const venue of venues) {
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
                if (error) {
                    skipVenue(venue.id, error);
                    continue;
                }
                tenantId = tenant.id;
                stats.linked += 1;
            }
        }

        if (tenantId) {
            const tenant = tenantById.get(tenantId);
            if (!tenant) continue;

            // 2a. Stato dell'abbonamento sul locale (e nella storia se cambia).
            const state = accountStateFor(tenant);
            const trialKind =
                state === "trialing" && !venue.trial_kind && tenant.stripe_subscription_id
                    ? await fetchTrialKind(tenant.stripe_subscription_id)
                    : null;
            const trialEndsAt = state === "trialing" ? tenant.trial_until ?? null : null;
            const sameEnd =
                (venue.trial_ends_at ? Date.parse(venue.trial_ends_at) : null) ===
                (trialEndsAt ? Date.parse(trialEndsAt) : null);
            if (venue.account_state !== state || !sameEnd || (trialKind && trialKind !== venue.trial_kind)) {
                const { data: changed, error } = await supabase.rpc("crm_sync_account_state", {
                    p_venue_id: venue.id,
                    p_account_state: state,
                    p_trial_kind: trialKind,
                    p_trial_ends_at: trialEndsAt
                });
                if (error) {
                    skipVenue(venue.id, error);
                    continue;
                }
                if (changed) stats.account_changes += 1;
            }

            // 2b. La fase segue l'abbonamento, salvo Perso e fase bloccata a mano.
            const next = nextStageForAccount(venue.stage, tenant.subscription_status, {
                locked: Boolean(venue.stage_locked_at)
            });
            if (next) {
                // Fase attesa = quella letta a inizio giro: se nel frattempo
                // qualcuno ha spostato la carta, vince lui.
                const { data: moved, error } = await supabase.rpc("crm_move_stage", {
                    p_venue_id: venue.id,
                    p_stage: next,
                    p_expected_stage: venue.stage
                });
                if (error) {
                    skipVenue(venue.id, error);
                    continue;
                }
                if (moved) stats.moved += 1;
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
        // Locale da completare: `name` è quello della persona, non del locale.
        const venueNameKey = venue.name_pending ? "" : normalizeVenueName(venue.name);
        for (const t of (venueNameKey ? byName.get(venueNameKey) : null) ?? []) {
            if (!suggestions.has(t.id)) suggestions.set(t.id, "name");
        }
        for (const [suggestedTenantId, reason] of suggestions) {
            if (known.has(`${venue.id}:${suggestedTenantId}`)) continue;
            const { error } = await supabase
                .from("crm_account_suggestions")
                .insert({ venue_id: venue.id, tenant_id: suggestedTenantId, reason });
            if (error && error.code !== "23505") {
                skipVenue(venue.id, error);
                break;
            }
            if (!error) stats.suggested += 1;
        }
    }
    return stats;
}

const POST_SALE_ALERTS_PER_RUN = 5;

async function postSaleAlerts(supabase, now: Date) {
    const stats = { post_sale_alerts: 0 };
    if (!isPostSaleAlertTime(now)) return stats;

    const { data: accounts, error } = await supabase.rpc("crm_post_sale_accounts");
    if (error) throw error;
    if (!accounts?.length) return stats;

    const [venuesRes, actionsRes] = await Promise.all([
        supabase.from("crm_venues").select("id, name, assigned_to, account_state, trial_ends_at").not("tenant_id", "is", null),
        supabase.from("crm_post_sale_actions").select("venue_id, kind, alerted_at, done_at, snoozed_until")
    ]);
    if (venuesRes.error) throw venuesRes.error;
    if (actionsRes.error) throw actionsRes.error;

    const venueById = new Map(venuesRes.data.map(v => [v.id, v]));
    const actionByKey = new Map(
        actionsRes.data.map(a => [
            `${a.venue_id}:${a.kind}`,
            { kind: a.kind, alertedAt: a.alerted_at, doneAt: a.done_at, snoozedUntil: a.snoozed_until }
        ])
    );
    const appUrl = getPublicSiteUrl();

    for (const row of accounts) {
        const venue = venueById.get(row.venue_id);
        if (!venue) continue;
        const signals = postSaleSignals(
            {
                accountState: venue.account_state,
                trialEndsAt: venue.trial_ends_at,
                tenantCreatedAt: row.tenant_created_at,
                plan: row.plan,
                activitiesTotal: row.activities_total,
                hasLiveMenu: row.has_live_menu,
                liveMenuSince: row.live_menu_since
            },
            now
        );
        for (const signal of signals) {
            if (stats.post_sale_alerts >= POST_SALE_ALERTS_PER_RUN) return stats;
            if (!needsPostSaleAlert(actionByKey.get(`${venue.id}:${signal.kind}`), now)) continue;
            const lines = [
                `<b>Clienti · ${escapeHtml(POST_SALE_LABEL[signal.kind])}</b>`,
                escapeHtml(venue.name),
                escapeHtml(postSaleReason(signal))
            ];
            if (appUrl) lines.push(`<a href="${appUrl}/admin/clienti">Apri Clienti nel CRM</a>`);
            const delivered = await sendToTeam(supabase, lines.join("\n"), {
                preferUserIds: [venue.assigned_to],
                logTag: "crm-sync-accounts post-vendita"
            });
            if (delivered === 0) continue;
            const { error: upsertError } = await supabase.from("crm_post_sale_actions").upsert(
                { venue_id: venue.id, kind: signal.kind, alerted_at: now.toISOString(), updated_at: now.toISOString() },
                { onConflict: "venue_id,kind" }
            );
            if (upsertError) throw upsertError;
            stats.post_sale_alerts += 1;
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
        try {
            Object.assign(stats, await postSaleAlerts(supabase, new Date()));
        } catch (err) {
            const e = err as { code?: unknown; message?: unknown };
            console.error("crm-sync-accounts: post-vendita", e?.code ?? "", e?.message ?? String(err));
        }
        console.log(JSON.stringify({ event: "crm_sync_accounts", ...stats }));
        return json(200, stats);
    } catch (err) {
        const e = err as { code?: unknown; message?: unknown };
        console.error("crm-sync-accounts: error", e?.code ?? "", e?.message ?? String(err));
        return json(500, { error: "sync_failed" });
    }
});
