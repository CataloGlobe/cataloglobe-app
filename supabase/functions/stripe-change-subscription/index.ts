// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import {
    createStripeClient,
    releaseScheduleIfAny,
    scheduleStripeCancel,
    reactivateStripeSubIfScheduled
} from "../_shared/stripe-helpers.ts";
import { sendEmail } from "../_shared/sendEmail.ts";
import {
    upgradeEmail,
    downgradeEmail,
    cancelEmail,
    reactivateEmail
} from "../_shared/subscriptionEmails.ts";
import { buildIdempotencyKey } from "../_shared/idempotency.ts";

// ---------------------------------------------------------------------------
// stripe-change-subscription
//
// Motore self-service abbonamento. Action (campo `action` nel body):
//   - "preview":   stima (non-mutante) di un cambio piano/sedi.
//   - "commit":    applica il cambio piano/sedi (upgrade immediato / downgrade
//                  programmato a fine periodo).
//   - "state":     (read-only) stato corrente: current_period_end,
//                  cancel_at_period_end, cambio programmato pendente.
//   - "cancel":    disdetta a fine periodo (cancel_at_period_end=true).
//   - "reactivate":annulla la disdetta programmata (cancel_at_period_end=false).
//
// La sincronizzazione di `tenants` è delegata ESCLUSIVAMENTE al webhook
// (customer.subscription.updated/deleted) — qui non si scrive mai su `tenants`.
//
// Permessi (gate per-action, fail-closed):
//   - preview / commit / state → billing.manage
//   - cancel / reactivate      → billing.cancel
//
// Policy: upgrade=immediato prorata; downgrade/disdetta=fine periodo, nessun
// rimborso. cap self-service = plans.max_self_service_seats. floor sedi =
// COUNT(*) activities. Interval-agnostic (prezzo/intervallo da Stripe).
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

type Action = "preview" | "commit" | "state" | "cancel" | "reactivate";
const VALID_ACTIONS = new Set<Action>(["preview", "commit", "state", "cancel", "reactivate"]);

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

/** Reverse-lookup plan_code dal price ID via tabella `plans` (source of truth). */
async function lookupPlanCodeByPriceId(
    admin: ReturnType<typeof createClient>,
    priceId: string | null | undefined
): Promise<string | null> {
    if (!priceId) return null;
    const { data } = await admin
        .from("plans")
        .select("code")
        .eq("stripe_price_id", priceId)
        .maybeSingle();
    const code = data?.code?.toLowerCase();
    return code && ALLOWED_PLAN_CODES.has(code) ? code : null;
}

/**
 * Totale ricorrente PIENO (in centesimi) per un Price graduato a `quantity`
 * sedi, calcolato dai tiers del Price. Indipendente da qualsiasi schedule
 * attivo sulla subscription. Ritorna `null` su Price non graduated-tiered.
 */
async function graduatedTotalFromPrice(
    stripe: Stripe,
    priceId: string,
    quantity: number
): Promise<number | null> {
    try {
        const price = await stripe.prices.retrieve(priceId, { expand: ["tiers"] });
        if (
            price.billing_scheme !== "tiered" ||
            price.tiers_mode !== "graduated" ||
            !Array.isArray(price.tiers)
        ) {
            console.warn(
                `graduatedTotalFromPrice: price ${priceId} non graduated-tiered (scheme=${price.billing_scheme}, mode=${price.tiers_mode}) — fallback`
            );
            return null;
        }
        const tiers = [...price.tiers].sort((a, b) => {
            const au = a.up_to ?? Number.POSITIVE_INFINITY;
            const bu = b.up_to ?? Number.POSITIVE_INFINITY;
            return au - bu;
        });
        let remaining = quantity;
        let lower = 0;
        let total = 0;
        for (const tier of tiers) {
            if (remaining <= 0) break;
            const upTo = tier.up_to ?? Number.POSITIVE_INFINITY;
            const capacity = upTo - lower;
            const units = Math.min(remaining, capacity);
            if (units <= 0) continue;
            total += (tier.flat_amount ?? 0) + (tier.unit_amount ?? 0) * units;
            remaining -= units;
            lower = upTo;
        }
        if (remaining > 0) {
            console.warn(`graduatedTotalFromPrice: quantity ${quantity} oltre i tiers di ${priceId} — fallback`);
            return null;
        }
        return total;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`graduatedTotalFromPrice: retrieve fallito per ${priceId}: ${message}`);
        return null;
    }
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

        const action = (payload?.action ?? "").trim() as Action;
        if (!VALID_ACTIONS.has(action)) {
            return json(req, 400, { error: "invalid_action" });
        }

        // --- Permesso per-action (fail-closed) ---
        // preview/commit/state → billing.manage; cancel/reactivate → billing.cancel.
        const requiredPermission =
            action === "cancel" || action === "reactivate" ? "billing.cancel" : "billing.manage";

        const { data: permRows, error: permError } = await supabaseUser.rpc("get_my_permissions", {
            p_tenant_id: tenantId
        });
        if (permError) {
            // 42501 (non membro) o altro → fail-closed.
            console.warn(`stripe-change-subscription: get_my_permissions failed: ${permError.message}`);
            return json(req, 403, { error: "forbidden" });
        }
        const permissions: string[] = Array.isArray(permRows) ? permRows[0]?.permissions ?? [] : [];
        if (!permissions.includes(requiredPermission)) {
            return json(req, 403, { error: "forbidden" });
        }

        // --- Service-role client per letture autoritative ---
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { data: tenant, error: tenantError } = await admin
            .from("tenants")
            .select("id, owner_user_id, stripe_customer_id, stripe_subscription_id, plan, paid_seats")
            .eq("id", tenantId)
            .maybeSingle();

        if (tenantError || !tenant) {
            return json(req, 404, { error: "tenant_not_found" });
        }
        if (!tenant.stripe_subscription_id || !tenant.stripe_customer_id) {
            return json(req, 422, { error: "NO_SUBSCRIPTION" });
        }

        // --- Destinatario email di conferma: owner del tenant, fallback al caller.
        // Memoizzato + risolto solo quando serve (non sui poll di `state`/`preview`).
        let recipientCache: string | null | undefined;
        async function getRecipient(): Promise<string | null> {
            if (recipientCache !== undefined) return recipientCache;
            let email: string | null = null;
            try {
                if (tenant.owner_user_id) {
                    const { data } = await admin.auth.admin.getUserById(tenant.owner_user_id);
                    email = data?.user?.email ?? null;
                }
            } catch (err) {
                console.error("[stripe-change-subscription] owner email lookup failed:", err);
            }
            recipientCache = email ?? authData.user?.email ?? null;
            return recipientCache;
        }

        // --- Stripe client + subscription corrente (comune a tutte le action) ---
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
        const periodEndIso = toIso(currentPeriodEndSec);

        // --- Piano corrente: metadata → fallback reverse-lookup su price ---
        let currentPlan = sub.metadata?.plan_code?.toLowerCase();
        if (!currentPlan || !ALLOWED_PLAN_CODES.has(currentPlan)) {
            currentPlan =
                (await lookupPlanCodeByPriceId(admin, currentPriceId)) ?? (tenant.plan as string)?.toLowerCase();
        }

        // --- Stato abbonamento live (cambio programmato + disdetta) ---
        // Cambio programmato letto dall'ULTIMA fase dello schedule attivo.
        async function buildSubscriptionState() {
            const scheduleId =
                typeof sub.schedule === "string" ? sub.schedule : (sub.schedule as { id?: string })?.id ?? null;
            let pendingChange: Record<string, unknown> | null = null;
            if (scheduleId) {
                try {
                    const sched = await stripe.subscriptionSchedules.retrieve(scheduleId);
                    const phases = sched.phases ?? [];
                    // Pendente solo se c'è una fase target oltre la corrente.
                    if (phases.length >= 2) {
                        const targetPhase = phases[phases.length - 1];
                        const pItem = targetPhase.items?.[0];
                        const pPriceId = typeof pItem?.price === "string" ? pItem.price : pItem?.price?.id;
                        pendingChange = {
                            targetPlan: await lookupPlanCodeByPriceId(admin, pPriceId),
                            targetSeats: pItem?.quantity ?? null,
                            effectiveDate: toIso(targetPhase.start_date)
                        };
                    }
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.warn(`stripe-change-subscription: schedule retrieve for state failed: ${message}`);
                }
            }
            return {
                currentPeriodEnd: periodEndIso,
                cancelAtPeriodEnd: !!sub.cancel_at_period_end,
                pendingChange
            };
        }

        // =====================================================================
        // STATE — sola lettura
        // =====================================================================
        if (action === "state") {
            return json(req, 200, await buildSubscriptionState());
        }

        // =====================================================================
        // CANCEL — disdetta a fine periodo
        // =====================================================================
        if (action === "cancel") {
            // Rilascia un eventuale schedule (cancel_at_period_end è in conflitto con
            // una sub gestita da schedule); il downgrade pendente viene scartato
            // (coerente: stai disdicendo).
            const scheduleId =
                typeof sub.schedule === "string" ? sub.schedule : (sub.schedule as { id?: string })?.id ?? null;
            await releaseScheduleIfAny(stripe, scheduleId);

            const result = await scheduleStripeCancel(stripe, tenant.stripe_subscription_id, { tenant_id: tenantId });
            if (result === "error") {
                return json(req, 502, { error: "stripe_cancel_failed" });
            }
            console.log(`stripe-change-subscription: CANCEL scheduled tenant=${tenantId} result=${result}`);
            try {
                const to = await getRecipient();
                if (to) await sendEmail({ to, ...cancelEmail({ activeUntilIso: periodEndIso }) });
            } catch (err) {
                console.error("[stripe-change-subscription] cancel email error:", err);
            }
            return json(req, 200, {
                currentPeriodEnd: periodEndIso,
                cancelAtPeriodEnd: true,
                pendingChange: null
            });
        }

        // =====================================================================
        // REACTIVATE — annulla la disdetta programmata
        // =====================================================================
        if (action === "reactivate") {
            const result = await reactivateStripeSubIfScheduled(stripe, tenant.stripe_subscription_id, {
                tenant_id: tenantId
            });
            if (result === "error") {
                return json(req, 502, { error: "stripe_reactivate_failed" });
            }
            console.log(`stripe-change-subscription: REACTIVATE tenant=${tenantId} result=${result}`);
            try {
                const to = await getRecipient();
                if (to) await sendEmail({ to, ...reactivateEmail({ renewalDateIso: periodEndIso }) });
            } catch (err) {
                console.error("[stripe-change-subscription] reactivate email error:", err);
            }
            // NB: non resuscita un downgrade precedentemente scartato dal cancel.
            return json(req, 200, {
                currentPeriodEnd: periodEndIso,
                cancelAtPeriodEnd: false,
                pendingChange: null
            });
        }

        // =====================================================================
        // PREVIEW / COMMIT — richiedono target piano + sedi (validati qui)
        // =====================================================================
        const targetPlan = (payload?.plan ?? "").trim().toLowerCase();
        if (!ALLOWED_PLAN_CODES.has(targetPlan)) {
            return json(req, 400, { error: "invalid_plan" });
        }

        const newSeats = Math.floor(Number(payload?.seats));
        if (!Number.isFinite(newSeats) || newSeats < 1) {
            return json(req, 400, { error: "invalid_seats" });
        }

        // Piano target → price ID + cap self-service (DB = source of truth).
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

        if (newSeats > maxSeats) {
            return json(req, 422, { error: "SEATS_OVER_SELF_SERVICE", details: { max_seats: maxSeats } });
        }

        // Floor sedi: non sotto il totale sedi del tenant (coerente con enforce_seat_limit).
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

        // No-change guard.
        if (currentPlan === targetPlan && currentSeats === newSeats) {
            return json(req, 422, { error: "NO_CHANGE" });
        }

        // Classificazione up/down: il cambio piano prevale sulle sedi.
        const curRank = PLAN_RANK[currentPlan] ?? 0;
        const tgtRank = PLAN_RANK[targetPlan] ?? 0;
        let classification: "upgrade" | "downgrade";
        if (tgtRank > curRank) classification = "upgrade";
        else if (tgtRank < curRank) classification = "downgrade";
        else classification = newSeats > currentSeats ? "upgrade" : "downgrade";

        const newItems = [{ id: itemId, price: newPriceId, quantity: newSeats }];
        const effective = classification === "upgrade" ? "now" : periodEndIso;

        // ----------------------------- PREVIEW -----------------------------
        if (action === "preview") {
            const existingScheduleId =
                typeof sub.schedule === "string" ? sub.schedule : (sub.schedule as { id?: string })?.id ?? null;

            let nextAmount = 0;
            if (classification === "upgrade") {
                // Pieno graduato al target dai tiers (indipendente da schedule attivi);
                // fallback a createPreview solo se il Price non è graduated-tiered.
                const tiered = await graduatedTotalFromPrice(stripe, newPriceId, newSeats);
                if (tiered != null) {
                    nextAmount = tiered;
                } else {
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
                }
            } else {
                // Downgrade: createPreview riflette legittimamente la fase target.
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
                effective,
                willDiscardScheduledChange: classification === "upgrade" && !!existingScheduleId
            });
        }

        // ----------------------------- COMMIT ------------------------------
        if (classification === "upgrade") {
            // Upgrade → immediato. Rilascia ogni schedule attivo PRIMA dell'update
            // (Stripe rifiuta update su sub schedule-managed); il downgrade pendente
            // viene scartato (l'upgrade lo supera).
            const existingScheduleId =
                typeof sub.schedule === "string" ? sub.schedule : (sub.schedule as { id?: string })?.id ?? null;
            await releaseScheduleIfAny(stripe, existingScheduleId);

            const upgradeKey = buildIdempotencyKey({
                operation: "upgrade",
                tenantId,
                subscriptionId: tenant.stripe_subscription_id,
                currentPlan,
                currentSeats,
                targetPlan,
                targetSeats: newSeats
            });

            let updated: Stripe.Subscription | undefined;
            try {
                updated = await stripe.subscriptions.update(
                    tenant.stripe_subscription_id,
                    {
                        items: newItems,
                        proration_behavior: "always_invoice",
                        payment_behavior: "error_if_incomplete",
                        expand: ["latest_invoice"],
                        metadata: { ...(sub.metadata ?? {}), plan_code: targetPlan }
                    },
                    { idempotencyKey: upgradeKey }
                );
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                const type = (err as { type?: string })?.type ?? "";
                const code = (err as { code?: string })?.code ?? "";
                if (
                    type === "StripeCardError" ||
                    code === "subscription_payment_intent_requires_action" ||
                    /incomplete|requires_action|card_declined|payment/i.test(message)
                ) {
                    console.warn(`stripe-change-subscription: upgrade payment failed: ${message}`);
                    return json(req, 402, { error: "PAYMENT_FAILED" });
                }
                console.error(`stripe-change-subscription: upgrade update failed: ${message}`);
                return json(req, 502, { error: "stripe_update_failed" });
            }

            console.log(
                `stripe-change-subscription: UPGRADE applied tenant=${tenantId} plan=${targetPlan} seats=${newSeats}`
            );
            // Email best-effort (importo addebitato oggi dall'invoice reale).
            try {
                const to = await getRecipient();
                const monthlyTotalCents = await graduatedTotalFromPrice(stripe, newPriceId, newSeats);
                if (to && monthlyTotalCents != null) {
                    const inv = updated?.latest_invoice;
                    const amountPaidTodayCents = inv && typeof inv !== "string" ? inv.amount_paid ?? null : null;
                    await sendEmail({
                        to,
                        ...upgradeEmail({
                            plan: targetPlan,
                            seats: newSeats,
                            amountPaidTodayCents,
                            monthlyTotalCents,
                            renewalDateIso: periodEndIso
                        })
                    });
                }
            } catch (err) {
                console.error("[stripe-change-subscription] upgrade email error:", err);
            }
            return json(req, 200, {
                ok: true,
                classification: "upgrade",
                plan: targetPlan,
                seats: newSeats,
                effective: "now"
            });
        }

        // Downgrade → subscription schedule a 2 fasi pulite. Revocabile.
        // Fase 0 replicata VERBATIM dall'oggetto fresco (ricalcolare le date fa
        // rifiutare l'update con "phase has already ended").
        let createdScheduleId: string | null = null;
        try {
            const existingScheduleId =
                typeof sub.schedule === "string" ? sub.schedule : (sub.schedule as { id?: string })?.id ?? null;
            await releaseScheduleIfAny(stripe, existingScheduleId);

            const scheduleCreateKey = buildIdempotencyKey({
                operation: "downgrade-create",
                tenantId,
                subscriptionId: tenant.stripe_subscription_id,
                currentPlan,
                currentSeats,
                targetPlan,
                targetSeats: newSeats
            });
            const scheduleUpdateKey = buildIdempotencyKey({
                operation: "downgrade-update",
                tenantId,
                subscriptionId: tenant.stripe_subscription_id,
                currentPlan,
                currentSeats,
                targetPlan,
                targetSeats: newSeats
            });

            const schedule = await stripe.subscriptionSchedules.create(
                { from_subscription: tenant.stripe_subscription_id },
                { idempotencyKey: scheduleCreateKey }
            );
            createdScheduleId = schedule.id;

            const currentPhase = schedule.phases?.[0];
            if (!currentPhase) {
                throw new Error("schedule has no current phase to preserve");
            }
            const currentPhaseItems = (currentPhase.items ?? []).map(it => ({
                price: typeof it.price === "string" ? it.price : it.price?.id,
                quantity: it.quantity ?? 1
            }));

            await stripe.subscriptionSchedules.update(
                schedule.id,
                {
                    end_behavior: "release",
                    phases: [
                        {
                            items: currentPhaseItems,
                            start_date: currentPhase.start_date,
                            end_date: currentPhase.end_date,
                            proration_behavior: "none"
                        },
                        {
                            items: [{ price: newPriceId, quantity: newSeats }],
                            proration_behavior: "none",
                            metadata: { plan_code: targetPlan }
                        }
                    ]
                },
                { idempotencyKey: scheduleUpdateKey }
            );

            console.log(
                `stripe-change-subscription: DOWNGRADE scheduled tenant=${tenantId} plan=${targetPlan} seats=${newSeats} effective=${periodEndIso} schedule=${schedule.id}`
            );
            try {
                const to = await getRecipient();
                if (to) {
                    await sendEmail({
                        to,
                        ...downgradeEmail({
                            plan: targetPlan,
                            seats: newSeats,
                            effectiveDateIso: periodEndIso,
                            losesQrFeatures: currentPlan === "pro" && targetPlan === "base"
                        })
                    });
                }
            } catch (err) {
                console.error("[stripe-change-subscription] downgrade email error:", err);
            }
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
        return json(req, 500, { error: "change_failed", detail: "Impossibile completare il cambio. Riprova." });
    }
});
