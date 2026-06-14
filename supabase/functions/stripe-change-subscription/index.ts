// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { createStripeClient } from "../_shared/stripe-helpers.ts";

// ---------------------------------------------------------------------------
// stripe-change-subscription
//
// Motore self-service per il cambio piano (base↔pro) e numero sedi.
// Due azioni:
//   - "preview": ritorna { chargeToday, nextAmount, nextDate, effective }
//                via Stripe invoice preview, SENZA modificare nulla.
//   - "commit":  applica il cambio.
//        upgrade   → subscriptions.update + always_invoice (addebito prorata
//                    immediato sulla carta in archivio), live nell'istante.
//        downgrade → subscription schedule (fase 2 al current_period_end),
//                    revocabile via subscriptionSchedules.release().
//
// La sincronizzazione di `tenants` è delegata ESCLUSIVAMENTE al webhook
// (customer.subscription.updated) — qui non si scrive mai su `tenants`.
//
// Policy (decisa a monte):
//   - upgrade   = base→pro, oppure aumento sedi senza downgrade di piano → immediato.
//   - downgrade = pro→base, oppure riduzione sedi → a fine periodo, nessun rimborso.
//   - caso misto (downgrade piano + aumento sedi) → prevale il downgrade.
//   - cap self-service = plans.max_self_service_seats (oltre → assistenza).
//   - floor sedi = COUNT(*) activities del tenant (coerente con enforce_seat_limit).
//   - permesso richiesto: billing.manage sul tenant.
//   - interval-agnostic: prezzo/intervallo letti dalla subscription/Price Stripe.
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://staging.cataloglobe.com",
    "https://cataloglobe.com",
    "https://www.cataloglobe.com"
];

function corsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get("origin") ?? "";
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "";
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
        "Content-Type": "application/json"
    };
}

const ALLOWED_PLAN_CODES = new Set(["base", "pro"]);
// Rank piani per classificazione up/down (il cambio piano prevale sulle sedi).
const PLAN_RANK: Record<string, number> = { base: 0, pro: 1 };

type Action = "preview" | "commit";
type Body = {
    tenantId?: string;
    action?: Action;
    plan?: string;
    seats?: number;
};

function json(req: Request, status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

function toIso(seconds: number | null | undefined): string | null {
    return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/** Periodo di fatturazione corrente, item-level con fallback top-level (API basil). */
function periodEndSeconds(sub: Stripe.Subscription): number | null {
    return sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end ?? null;
}

serve(async req => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
            console.error("stripe-change-subscription: Missing env vars");
            return json(req, 500, { error: "server_misconfigured" });
        }

        // --- Auth: JWT del chiamante ---
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return json(req, 401, { error: "unauthorized" });
        }

        const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: authData, error: authError } = await supabaseUser.auth.getUser();
        const userId = authData?.user?.id;
        if (authError || !userId) {
            return json(req, 401, { error: "unauthorized" });
        }

        // --- Parse body ---
        let payload: Body | null = null;
        try {
            payload = await req.json();
        } catch {
            return json(req, 400, { error: "invalid_json" });
        }

        const tenantId = payload?.tenantId?.trim();
        if (!tenantId) return json(req, 400, { error: "missing_tenant_id" });

        const action: Action = payload?.action === "commit" ? "commit" : "preview";
        if (payload?.action !== "preview" && payload?.action !== "commit") {
            return json(req, 400, { error: "invalid_action" });
        }

        const targetPlan = (payload?.plan ?? "").trim().toLowerCase();
        if (!ALLOWED_PLAN_CODES.has(targetPlan)) {
            return json(req, 400, { error: "invalid_plan" });
        }

        const newSeats = Math.floor(Number(payload?.seats));
        if (!Number.isFinite(newSeats) || newSeats < 1) {
            return json(req, 400, { error: "invalid_seats" });
        }

        // --- Permesso: billing.manage sul tenant (via client utente, SECURITY DEFINER) ---
        const { data: permRows, error: permError } = await supabaseUser.rpc("get_my_permissions", {
            p_tenant_id: tenantId
        });
        if (permError) {
            // 42501 (non membro) o altro → fail-closed.
            console.warn(`stripe-change-subscription: get_my_permissions failed: ${permError.message}`);
            return json(req, 403, { error: "forbidden" });
        }
        const permissions: string[] = Array.isArray(permRows) ? permRows[0]?.permissions ?? [] : [];
        if (!permissions.includes("billing.manage")) {
            return json(req, 403, { error: "forbidden" });
        }

        // --- Service-role client per letture autoritative (tenant billing, plans, activities) ---
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { data: tenant, error: tenantError } = await admin
            .from("tenants")
            .select("id, stripe_customer_id, stripe_subscription_id, plan, paid_seats")
            .eq("id", tenantId)
            .maybeSingle();

        if (tenantError || !tenant) {
            return json(req, 404, { error: "tenant_not_found" });
        }
        if (!tenant.stripe_subscription_id || !tenant.stripe_customer_id) {
            return json(req, 422, { error: "NO_SUBSCRIPTION" });
        }

        // --- Piano target → price ID + cap self-service (DB = source of truth) ---
        const { data: targetPlanRow, error: targetPlanError } = await admin
            .from("plans")
            .select("code, stripe_price_id, max_self_service_seats")
            .eq("code", targetPlan)
            .maybeSingle();

        if (targetPlanError || !targetPlanRow?.stripe_price_id) {
            console.error(`stripe-change-subscription: plan ${targetPlan} not configured`);
            return json(req, 500, { error: "plan_not_configured" });
        }
        const newPriceId = targetPlanRow.stripe_price_id.trim();
        const maxSeats = Number(targetPlanRow.max_self_service_seats) || 0;

        // --- Cap self-service ---
        if (newSeats > maxSeats) {
            return json(req, 422, { error: "SEATS_OVER_SELF_SERVICE", details: { max_seats: maxSeats } });
        }

        // --- Floor sedi: non sotto il totale sedi del tenant (coerente con enforce_seat_limit) ---
        const { count: activityCount, error: countError } = await admin
            .from("activities")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId);
        if (countError) {
            console.error(`stripe-change-subscription: activity count failed: ${countError.message}`);
            return json(req, 500, { error: "activity_count_failed" });
        }
        const minSeats = activityCount ?? 0;
        if (newSeats < minSeats) {
            return json(req, 422, { error: "SEATS_BELOW_ACTIVITIES", details: { min_seats: minSeats } });
        }

        // --- Stripe: carica la subscription corrente ---
        const stripe: Stripe | null = createStripeClient();
        if (!stripe) return json(req, 500, { error: "server_misconfigured" });

        let sub: Stripe.Subscription;
        try {
            sub = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`stripe-change-subscription: subscription retrieve failed: ${message}`);
            return json(req, 422, { error: "NO_SUBSCRIPTION" });
        }

        const item = sub.items?.data?.[0];
        if (!item) return json(req, 422, { error: "NO_SUBSCRIPTION" });
        const itemId = item.id;
        const currentPriceId = item.price?.id;
        const currentSeats = item.quantity ?? 1;
        const currentPeriodEndSec = periodEndSeconds(sub);
        const currency = sub.currency ?? item.price?.currency ?? "eur";

        // --- Piano corrente: metadata → fallback reverse-lookup su price (source of truth) ---
        let currentPlan = sub.metadata?.plan_code?.toLowerCase();
        if (!currentPlan || !ALLOWED_PLAN_CODES.has(currentPlan)) {
            const { data: cur } = await admin
                .from("plans")
                .select("code")
                .eq("stripe_price_id", currentPriceId)
                .maybeSingle();
            currentPlan = cur?.code?.toLowerCase() ?? (tenant.plan as string)?.toLowerCase();
        }

        // --- No-change guard ---
        if (currentPlan === targetPlan && currentSeats === newSeats) {
            return json(req, 422, { error: "NO_CHANGE" });
        }

        // --- Classificazione up/down: il cambio piano prevale sulle sedi (decisione #1) ---
        const curRank = PLAN_RANK[currentPlan] ?? 0;
        const tgtRank = PLAN_RANK[targetPlan] ?? 0;
        let classification: "upgrade" | "downgrade";
        if (tgtRank > curRank) classification = "upgrade";
        else if (tgtRank < curRank) classification = "downgrade";
        else classification = newSeats > currentSeats ? "upgrade" : "downgrade";

        const newItems = [{ id: itemId, price: newPriceId, quantity: newSeats }];
        const periodEndIso = toIso(currentPeriodEndSec);
        const effective = classification === "upgrade" ? "now" : periodEndIso;

        // =====================================================================
        // PREVIEW — nessuna scrittura su Stripe
        // =====================================================================
        if (action === "preview") {
            // nextAmount = totale ricorrente del piano target (senza proration).
            let nextAmount = 0;
            try {
                const nextPreview = await stripe.invoices.createPreview({
                    customer: tenant.stripe_customer_id,
                    subscription: tenant.stripe_subscription_id,
                    subscription_details: { items: newItems, proration_behavior: "none" }
                });
                nextAmount = nextPreview.total ?? 0;
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`stripe-change-subscription: next preview failed: ${message}`);
                return json(req, 502, { error: "preview_failed" });
            }

            let chargeToday = 0;
            if (classification === "upgrade") {
                try {
                    const upPreview = await stripe.invoices.createPreview({
                        customer: tenant.stripe_customer_id,
                        subscription: tenant.stripe_subscription_id,
                        subscription_details: { items: newItems, proration_behavior: "always_invoice" }
                    });
                    chargeToday = Math.max(0, upPreview.amount_due ?? 0);
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.error(`stripe-change-subscription: upgrade preview failed: ${message}`);
                    return json(req, 502, { error: "preview_failed" });
                }
            }

            return json(req, 200, {
                classification,
                plan: targetPlan,
                seats: newSeats,
                currency,
                chargeToday,
                nextAmount,
                nextDate: periodEndIso,
                effective
            });
        }

        // =====================================================================
        // COMMIT
        // =====================================================================
        if (classification === "upgrade") {
            // Upgrade → immediato con addebito prorata sulla carta in archivio.
            // error_if_incomplete: se il pagamento fallisce / richiede azione (3DS)
            // Stripe lancia e il cambio NON viene applicato.
            try {
                await stripe.subscriptions.update(tenant.stripe_subscription_id, {
                    items: newItems,
                    proration_behavior: "always_invoice",
                    payment_behavior: "error_if_incomplete",
                    metadata: { ...(sub.metadata ?? {}), plan_code: targetPlan }
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                const type = (err as { type?: string })?.type ?? "";
                const code = (err as { code?: string })?.code ?? "";
                // Carta rifiutata / pagamento incompleto / richiede azione.
                if (
                    type === "StripeCardError" ||
                    code === "subscription_payment_intent_requires_action" ||
                    /incomplete|requires_action|card_declined|payment/i.test(message)
                ) {
                    console.warn(`stripe-change-subscription: upgrade payment failed: ${message}`);
                    return json(req, 402, { error: "PAYMENT_FAILED", details: { message } });
                }
                console.error(`stripe-change-subscription: upgrade update failed: ${message}`);
                return json(req, 502, { error: "stripe_update_failed" });
            }

            console.log(
                `stripe-change-subscription: UPGRADE applied tenant=${tenantId} plan=${targetPlan} seats=${newSeats}`
            );
            // tenants viene sincronizzato dal webhook (customer.subscription.updated).
            return json(req, 200, {
                ok: true,
                classification: "upgrade",
                plan: targetPlan,
                seats: newSeats,
                effective: "now"
            });
        }

        // Downgrade → subscription schedule, fase target al current_period_end. Revocabile.
        //
        // Lo stato atteso è SEMPRE esattamente 2 fasi pulite:
        //   [fase corrente reale (piano attuale → current_period_end),
        //    fase target (nuovo piano da current_period_end in poi)].
        //
        // Per essere deterministici NON si riusa né si estende uno schedule
        // preesistente (porterebbe ad accumulo di fasi e confini stantii): se
        // esiste, lo si RILASCIA e si ricrea fresco from_subscription (che
        // rilegge il periodo corrente reale). La fase 0 va replicata VERBATIM
        // dall'oggetto fresco: ricalcolare le date fa rifiutare l'update con
        // "You can not update a phase that has already ended".
        let createdScheduleId: string | null = null;
        try {
            // 1) Se esiste già uno schedule, rilascialo (no riuso, no lettura fasi).
            const existingScheduleId =
                typeof sub.schedule === "string" ? sub.schedule : (sub.schedule as { id?: string })?.id ?? null;
            if (existingScheduleId) {
                try {
                    await stripe.subscriptionSchedules.release(existingScheduleId);
                } catch (relErr) {
                    // Già rilasciato/terminale → procedi comunque alla ricreazione.
                    const relMsg = relErr instanceof Error ? relErr.message : String(relErr);
                    console.warn(`stripe-change-subscription: release of existing schedule ${existingScheduleId} failed (continuing): ${relMsg}`);
                }
            }

            // 2) Crea uno schedule fresco: rilegge il periodo corrente reale.
            const schedule = await stripe.subscriptionSchedules.create({
                from_subscription: tenant.stripe_subscription_id
            });
            createdScheduleId = schedule.id;

            // 3) Fase 0 corrente: dati presi TALI E QUALI dall'oggetto fresco.
            const currentPhase = schedule.phases?.[0];
            if (!currentPhase) {
                throw new Error("schedule has no current phase to preserve");
            }
            const currentPhaseItems = (currentPhase.items ?? []).map(it => ({
                price: typeof it.price === "string" ? it.price : it.price?.id,
                quantity: it.quantity ?? 1
            }));

            await stripe.subscriptionSchedules.update(schedule.id, {
                end_behavior: "release",
                phases: [
                    {
                        // Fase corrente replicata verbatim (start/end identici al reale).
                        items: currentPhaseItems,
                        start_date: currentPhase.start_date,
                        end_date: currentPhase.end_date,
                        proration_behavior: "none"
                    },
                    {
                        // Fase target: parte automaticamente alla fine della fase 0.
                        items: [{ price: newPriceId, quantity: newSeats }],
                        proration_behavior: "none",
                        metadata: { plan_code: targetPlan }
                    }
                ]
            });

            console.log(
                `stripe-change-subscription: DOWNGRADE scheduled tenant=${tenantId} plan=${targetPlan} seats=${newSeats} effective=${periodEndIso} schedule=${schedule.id}`
            );
            return json(req, 200, {
                ok: true,
                classification: "downgrade",
                plan: targetPlan,
                seats: newSeats,
                effective: periodEndIso,
                scheduledChange: true,
                scheduleId: schedule.id
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // Se avevamo appena creato uno schedule, rilascialo: la subscription non
            // deve restare agganciata a uno schedule monco.
            if (createdScheduleId) {
                try {
                    await stripe.subscriptionSchedules.release(createdScheduleId);
                } catch (relErr) {
                    const relMsg = relErr instanceof Error ? relErr.message : String(relErr);
                    console.error(`stripe-change-subscription: schedule release after failure failed: ${relMsg}`);
                }
            }
            console.error(`stripe-change-subscription: downgrade schedule failed: ${message}`);
            return json(req, 502, { error: "stripe_schedule_failed" });
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("stripe-change-subscription: Unhandled error:", message);
        return json(req, 500, { error: "change_failed", detail: message });
    }
});
