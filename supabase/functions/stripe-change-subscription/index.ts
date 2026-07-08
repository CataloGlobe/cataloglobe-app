// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import {
    createStripeClient,
    releaseScheduleIfAny,
    scheduleStripeCancel,
    reactivateStripeSubIfScheduled,
    updateSchedulePhases
} from "../_shared/stripe-helpers.ts";
import { sendEmail } from "../_shared/sendEmail.ts";
import {
    upgradeEmail,
    downgradeEmail,
    cancelEmail,
    reactivateEmail,
    combinedChangeEmail,
    combinedChangePartialFailureEmail
} from "../_shared/subscriptionEmails.ts";
import { buildIdempotencyKey } from "../_shared/idempotency.ts";
import { classifyChange } from "../_shared/classifyChange.ts";

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
// Rank/routing piani: estratti in _shared/classifyChange.ts (decomposizione per asse).

type Action =
    | "preview"
    | "commit"
    | "state"
    | "cancel"
    | "reactivate"
    | "cancel-scheduled-change"
    | "preview-scheduled-change"
    | "update-scheduled-change";
const VALID_ACTIONS = new Set<Action>([
    "preview",
    "commit",
    "state",
    "cancel",
    "reactivate",
    "cancel-scheduled-change",
    "preview-scheduled-change",
    "update-scheduled-change"
]);

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

type SubscriptionDiscount = {
    percentOff: number | null;
    amountOff: number | null;
    currency: string | null;
    /** `end` è valorizzato SOLO per duration "repeating" — mai per "once"/"forever". */
    end: string | null;
    name: string | null;
    /** Stripe: "forever" | "once" | "repeating". Guida il messaggio in UI. */
    duration: "forever" | "once" | "repeating";
};

/**
 * Coupon attivo sulla subscription (API basil: `discounts[]`, non più il
 * singolare `discount`). Richiede `expand: ["discounts.coupon"]` sulla
 * retrieve — senza expand gli elementi restano ID stringa e il coupon non è
 * leggibile. Ritorna null sia se non c'è alcun discount sia se l'expand non
 * ha risolto l'oggetto (degrada silenziosamente, non rompe la action "state").
 */
function extractDiscount(sub: Stripe.Subscription): SubscriptionDiscount | null {
    return discountFromRaw((sub as unknown as { discounts?: Array<string | Stripe.Discount> }).discounts?.[0]);
}

/** Mapping Discount espanso → SubscriptionDiscount, condiviso tra subscription e invoice. */
function discountFromRaw(raw: string | Stripe.Discount | null | undefined): SubscriptionDiscount | null {
    if (!raw || typeof raw === "string") return null;
    const coupon = typeof raw.coupon === "string" ? null : raw.coupon;
    if (!coupon || (coupon.percent_off == null && coupon.amount_off == null)) return null;
    return {
        percentOff: coupon.percent_off ?? null,
        amountOff: coupon.amount_off ?? null,
        currency: coupon.currency ?? null,
        end: toIso(raw.end),
        name: coupon.name ?? null,
        duration: coupon.duration
    };
}

/** Sconto consumato + totale effettivo (centesimi, come `amountOff`) della fattura scontata. */
type ConsumedDiscount = SubscriptionDiscount & { invoiceTotal: number };

/**
 * Fallback per coupon `once` già consumato: Stripe lo rimuove da
 * `subscription.discounts` alla finalizzazione della fattura che lo ha
 * applicato, quindi con uno sconto "primo mese" la lettura live della sub non
 * lo vede più anche se il periodo corrente è stato scontato. Qui si guarda la
 * fattura più recente della subscription: se copre il periodo corrente e ha un
 * discount, lo si espone come sconto consumato (stato distinto da `discount`).
 *
 * Il periodo coperto si legge dai line item (`lines.data[].period`):
 * `invoice.period_start/period_end` NON sono il periodo di servizio ma la
 * finestra di aggiunta degli item (per il billing anticipato = periodo
 * precedente). Degrada a null su qualsiasi errore o mismatch.
 */
async function extractConsumedDiscountThisPeriod(
    stripe: Stripe,
    subscriptionId: string,
    currentPeriodEndSec: number | null
): Promise<ConsumedDiscount | null> {
    if (!currentPeriodEndSec) return null;
    try {
        // limit 10, non 1: lo stesso periodo può avere più fatture (es. one-off
        // di upgrade immediato dopo la creazione) e la più recente può essere
        // senza sconto anche se il periodo è stato scontato da una precedente.
        const invoices = await stripe.invoices.list({
            subscription: subscriptionId,
            limit: 10,
            expand: ["data.discounts.coupon"]
        });
        for (const invoice of invoices.data ?? []) {
            // Draft: coupon non ancora consumato (sarebbe ancora su sub.discounts).
            // Void: fattura annullata, il periodo non è stato davvero scontato.
            if (!invoice || invoice.status === "draft" || invoice.status === "void") continue;
            const coversCurrentPeriod = invoice.lines?.data?.some(
                (line) => line?.period?.end === currentPeriodEndSec
            );
            if (!coversCurrentPeriod) continue;
            // Prima fattura del periodo con discount risolto e valorizzato —
            // al più una per periodo, l'ordine di scansione non conta.
            const discount = discountFromRaw(invoice.discounts?.[0]);
            if (discount) return { ...discount, invoiceTotal: invoice.total ?? 0 };
        }
        return null;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`stripe-change-subscription: consumed-discount lookup failed: ${message}`);
        return null;
    }
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
            sub = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id, {
                expand: ["discounts.coupon"]
            });
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
            const discount = extractDiscount(sub);
            // Chiamata extra a Stripe SOLO se non c'è uno sconto attivo (fallback
            // per coupon `once` già consumato — vedi extractConsumedDiscountThisPeriod).
            const consumedDiscountThisPeriod = discount
                ? null
                : await extractConsumedDiscountThisPeriod(
                      stripe,
                      tenant.stripe_subscription_id,
                      currentPeriodEndSec
                  );
            return {
                currentPeriodEnd: periodEndIso,
                cancelAtPeriodEnd: !!sub.cancel_at_period_end,
                pendingChange,
                discount,
                consumedDiscountThisPeriod
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
        // CANCEL-SCHEDULED-CHANGE — annulla un cambio programmato (downgrade /
        // riduzione futura) rilasciando lo schedule. NON disdice l'abbonamento:
        // la sub resta attiva e in rinnovo sulla fase corrente, sedi correnti
        // invariate. Tocca solo il tier futuro. Idempotente (no-op se non c'e'
        // uno schedule attivo: un doppio click non deve fallire).
        // =====================================================================
        if (action === "cancel-scheduled-change") {
            const scheduleId =
                typeof sub.schedule === "string" ? sub.schedule : (sub.schedule as { id?: string })?.id ?? null;

            // No-op idempotente: nessun cambio programmato da annullare. Stato
            // corrente invariato (cancel_at_period_end preservato, pending gia' nullo).
            if (!scheduleId) {
                return json(req, 200, {
                    currentPeriodEnd: periodEndIso,
                    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
                    pendingChange: null
                });
            }

            // Rilascia SOLO lo schedule. NON impostare cancel_at_period_end,
            // NON toccare la quantita' sedi.
            await releaseScheduleIfAny(stripe, scheduleId);

            // Verifica fail-closed: ri-leggi la subscription e conferma che lo
            // schedule sia ora assente. Se persiste, abort senza fingere successo
            // (stesso pattern del path combinato).
            let stillManaged = true;
            try {
                const fresh = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
                stillManaged = !!fresh.schedule;
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`stripe-change-subscription: cancel-scheduled-change re-read failed: ${message}`);
                stillManaged = true; // fail-closed
            }
            if (stillManaged) {
                console.error(
                    `stripe-change-subscription: cancel-scheduled-change still schedule-managed tenant=${tenantId}`
                );
                return json(req, 409, { error: "CANCEL_SCHEDULED_CHANGE_FAILED" });
            }

            console.log(
                `stripe-change-subscription: CANCEL_SCHEDULED_CHANGE released tenant=${tenantId} schedule=${scheduleId}`
            );
            // La riconciliazione di `tenants` (paid_seats/plan) avviene via webhook
            // dal customer.subscription.updated emesso dal release.
            return json(req, 200, {
                currentPeriodEnd: periodEndIso,
                cancelAtPeriodEnd: !!sub.cancel_at_period_end,
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

        // =====================================================================
        // PREVIEW-/UPDATE-SCHEDULED-CHANGE — B5: modifica IN-PLACE del bersaglio
        // futuro di un cambio programmato (piano e/o sedi diversi al rinnovo).
        // SEMPRE €0: tocca solo la fase futura. La fase corrente resta invariata.
        // Per `SEATS_BELOW_ACTIVITIES` vale lo stesso floor (gia' applicato sopra
        // alle sedi future). Gestito QUI, prima del NO_CHANGE guard, perche' il
        // "nuovo futuro == stato corrente" e' il caso DEGENERE (release), non un
        // errore.
        // =====================================================================
        if (action === "preview-scheduled-change" || action === "update-scheduled-change") {
            const scheduleId =
                typeof sub.schedule === "string" ? sub.schedule : (sub.schedule as { id?: string })?.id ?? null;
            if (!scheduleId) {
                return json(req, 422, { error: "NO_SCHEDULED_CHANGE" });
            }

            // Degenere: il nuovo futuro coincide con lo stato corrente live →
            // schedule no-op → release (equivale ad annullare il cambio).
            const futureEqualsCurrent = currentPlan === targetPlan && currentSeats === newSeats;

            // ---- PREVIEW ----
            if (action === "preview-scheduled-change") {
                let nextAmount = await graduatedTotalFromPrice(stripe, newPriceId, newSeats);
                if (nextAmount == null) {
                    try {
                        const nextPreview = await stripe.invoices.createPreview({
                            customer: tenant.stripe_customer_id,
                            subscription: tenant.stripe_subscription_id,
                            subscription_details: {
                                items: [{ id: itemId, price: newPriceId, quantity: newSeats }],
                                proration_behavior: "none"
                            }
                        });
                        nextAmount = nextPreview.total ?? 0;
                    } catch (err) {
                        const message = err instanceof Error ? err.message : String(err);
                        console.error(`stripe-change-subscription: scheduled-change preview failed: ${message}`);
                        return json(req, 502, { error: "preview_failed" });
                    }
                }
                return json(req, 200, {
                    classification: "scheduled",
                    plan: targetPlan,
                    seats: newSeats,
                    currency,
                    chargeToday: 0,
                    nextAmount,
                    nextDate: periodEndIso,
                    effective: periodEndIso
                });
            }

            // ---- COMMIT ----
            if (futureEqualsCurrent) {
                // Release: il futuro non cambia piu' nulla → niente schedule no-op.
                await releaseScheduleIfAny(stripe, scheduleId);
                let stillManaged = true;
                try {
                    const fresh = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
                    stillManaged = !!fresh.schedule;
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.error(`stripe-change-subscription: scheduled-change release re-read failed: ${message}`);
                    stillManaged = true; // fail-closed
                }
                if (stillManaged) {
                    console.error(
                        `stripe-change-subscription: scheduled-change release still managed tenant=${tenantId}`
                    );
                    return json(req, 409, { error: "CANCEL_SCHEDULED_CHANGE_FAILED" });
                }
                console.log(
                    `stripe-change-subscription: SCHEDULED_CHANGE released (future==current) tenant=${tenantId} schedule=${scheduleId}`
                );
                return json(req, 200, { ok: true, action: "released", classification: "scheduled" });
            }

            // Aggiorna SOLO la fase futura. Fase corrente VERBATIM (qty live
            // invariata) → €0, nessun addebito. proration 'none'.
            try {
                const existing = await stripe.subscriptionSchedules.retrieve(scheduleId);
                const currentPhase = existing.phases?.[0];
                if (!currentPhase) {
                    throw new Error("existing schedule has no current phase to preserve");
                }
                const currentPhaseItems = (currentPhase.items ?? []).map(it => ({
                    price: typeof it.price === "string" ? it.price : it.price?.id,
                    quantity: it.quantity ?? 1
                }));
                const scheduleUpdateKey = buildIdempotencyKey({
                    operation: "scheduled-update",
                    tenantId,
                    subscriptionId: tenant.stripe_subscription_id,
                    currentPlan,
                    currentSeats,
                    targetPlan,
                    targetSeats: newSeats
                });
                await updateSchedulePhases(stripe, scheduleId, {
                    currentPhaseItems,
                    currentPhaseStart: currentPhase.start_date,
                    currentPhaseEnd: currentPhase.end_date,
                    futurePhaseItems: [{ price: newPriceId, quantity: newSeats }],
                    futurePhasePlanCode: targetPlan,
                    prorationBehavior: "none",
                    idempotencyKey: scheduleUpdateKey
                });
                console.log(
                    `stripe-change-subscription: SCHEDULED_CHANGE updated tenant=${tenantId} plan=${targetPlan} seats=${newSeats} effective=${periodEndIso} schedule=${scheduleId}`
                );
                return json(req, 200, {
                    ok: true,
                    action: "updated",
                    classification: "scheduled",
                    plan: targetPlan,
                    seats: newSeats,
                    effective: periodEndIso,
                    scheduledChange: true,
                    scheduleId
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`stripe-change-subscription: scheduled-change update failed: ${message}`);
                return json(req, 502, { error: "stripe_schedule_failed" });
            }
        }

        // No-change guard.
        if (currentPlan === targetPlan && currentSeats === newSeats) {
            return json(req, 422, { error: "NO_CHANGE" });
        }

        // Classificazione per asse (tier + sedi indipendenti) → routing.
        // Stato corrente letto dalla subscription Stripe LIVE (currentPlan +
        // currentSeats da items.data[0]), non da tenants.paid_seats (webhook-lag),
        // per coerenza con ciò che le mutazioni toccano e col replay idempotente.
        const change = classifyChange({ currentPlan, currentSeats, targetPlan, targetSeats: newSeats });

        // Scalare legacy per il path PREVIEW esistente (rework preview = FASE 2c).
        // Mappatura byte-identica al comportamento pre-2b: solo le route che prima
        // erano "upgrade" restano "upgrade"; downgrade puro e combinato → "downgrade".
        const classification: "upgrade" | "downgrade" =
            change.route === "upgrade" ? "upgrade" : "downgrade";

        const newItems = [{ id: itemId, price: newPriceId, quantity: newSeats }];
        const effective = classification === "upgrade" ? "now" : periodEndIso;

        // ----------------------------- PREVIEW -----------------------------
        if (action === "preview") {
            const existingScheduleId =
                typeof sub.schedule === "string" ? sub.schedule : (sub.schedule as { id?: string })?.id ?? null;

            // 🆕 FASE 2.3 — B2 preview: upgrade (sedi su, tier uguale) MENTRE c'e'
            // un cambio programmato in volo. Le sedi si pagano subito (prorata a
            // tariffa corrente); il tier scende al rinnovo al target del pending
            // PRESERVATO (es. Base) con la nuova qty. Ritorna 'combined' per il box
            // UI esistente, senza scartare il pending.
            if (classification === "upgrade" && existingScheduleId) {
                let b2FuturePrice: string | undefined;
                let b2FuturePlanCode: string | null = null;
                try {
                    const sched = await stripe.subscriptionSchedules.retrieve(existingScheduleId);
                    const phs = sched.phases ?? [];
                    if (phs.length >= 2) {
                        const fItem = phs[phs.length - 1].items?.[0];
                        b2FuturePrice = typeof fItem?.price === "string" ? fItem.price : fItem?.price?.id;
                        if (b2FuturePrice) {
                            b2FuturePlanCode = await lookupPlanCodeByPriceId(admin, b2FuturePrice);
                        }
                    }
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.warn(`stripe-change-subscription: B2 preview schedule retrieve failed: ${message}`);
                }

                if (b2FuturePrice) {
                    // Oggi: delta sedi prorato a tariffa CORRENTE (Pro).
                    let chargeToday = 0;
                    try {
                        const seatPreview = await stripe.invoices.createPreview({
                            customer: tenant.stripe_customer_id,
                            subscription: tenant.stripe_subscription_id,
                            subscription_details: {
                                items: [{ id: itemId, price: currentPriceId, quantity: newSeats }],
                                proration_behavior: "always_invoice"
                            }
                        });
                        chargeToday = Math.max(0, seatPreview.amount_due ?? 0);
                    } catch (err) {
                        const message = err instanceof Error ? err.message : String(err);
                        console.error(`stripe-change-subscription: B2 preview seat charge failed: ${message}`);
                        return json(req, 502, { error: "preview_failed" });
                    }

                    // Al rinnovo: totale ricorrente del target pending (es. Base) a newSeats.
                    let nextAmountB2 = await graduatedTotalFromPrice(stripe, b2FuturePrice, newSeats);
                    if (nextAmountB2 == null) {
                        try {
                            const nextPreview = await stripe.invoices.createPreview({
                                customer: tenant.stripe_customer_id,
                                subscription: tenant.stripe_subscription_id,
                                subscription_details: {
                                    items: [{ id: itemId, price: b2FuturePrice, quantity: newSeats }],
                                    proration_behavior: "none"
                                }
                            });
                            nextAmountB2 = nextPreview.total ?? 0;
                        } catch (err) {
                            const message = err instanceof Error ? err.message : String(err);
                            console.error(`stripe-change-subscription: B2 preview next amount failed: ${message}`);
                            return json(req, 502, { error: "preview_failed" });
                        }
                    }

                    return json(req, 200, {
                        classification: "combined",
                        plan: b2FuturePlanCode ?? targetPlan,
                        seats: newSeats,
                        currency,
                        chargeToday,
                        nextAmount: nextAmountB2,
                        nextDate: periodEndIso,
                        effective: periodEndIso,
                        // B2 NON scarta il cambio programmato (lo preserva alla nuova qty).
                        willDiscardScheduledChange: false
                    });
                }
                // Nessun pending reale (schedule a 1 fase) → fall-through all'upgrade standard.
            }

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
            } else if (change.route === "combined-downgrade-seats-up") {
                // Combinato: l'addebito di oggi è SOLO il prorato del delta sedi a
                // tariffa CORRENTE (Pro) — identico allo step 2 del commit. Il tier
                // scende al rinnovo (nextAmount/effective già = fase target).
                try {
                    const seatPreview = await stripe.invoices.createPreview({
                        customer: tenant.stripe_customer_id,
                        subscription: tenant.stripe_subscription_id,
                        subscription_details: {
                            items: [{ id: itemId, price: currentPriceId, quantity: newSeats }],
                            proration_behavior: "always_invoice"
                        }
                    });
                    chargeToday = Math.max(0, seatPreview.amount_due ?? 0);
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.error(`stripe-change-subscription: combined seat preview failed: ${message}`);
                    return json(req, 502, { error: "preview_failed" });
                }
            }

            // Fonte unica del terzo stato per la UI: "combined" quando tier giù +
            // sedi su (coincide col `classification` ritornato dal commit combinato).
            const previewClassification =
                change.route === "combined-downgrade-seats-up" ? "combined" : classification;

            return json(req, 200, {
                classification: previewClassification,
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
        // 🆕 Caso combinato: tier giù + sedi su. Decomposizione per asse:
        //  - sedi su → addebito immediato prorato sul prezzo CORRENTE (valore
        //    consumato ora, fino al rinnovo);
        //  - tier giù → differito al rinnovo via subscription schedule.
        if (change.route === "combined-downgrade-seats-up") {
            const existingScheduleId =
                typeof sub.schedule === "string" ? sub.schedule : (sub.schedule as { id?: string })?.id ?? null;

            // Step 1 — release-first BLOCCANTE (opzione A). La sub non deve
            // restare schedule-managed prima di toccare le sedi (Stripe rifiuta
            // update su sub gestita da schedule). Se resta managed → abort PRIMA
            // di qualsiasi addebito, nessun effetto parziale.
            await releaseScheduleIfAny(stripe, existingScheduleId);
            if (existingScheduleId) {
                let stillManaged = true;
                try {
                    const fresh = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
                    stillManaged = !!fresh.schedule;
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.error(`stripe-change-subscription: combined re-read after release failed: ${message}`);
                    stillManaged = true; // fail-closed
                }
                if (stillManaged) {
                    console.error(
                        `stripe-change-subscription: combined abort, still schedule-managed tenant=${tenantId}`
                    );
                    return json(req, 409, { error: "SCHEDULE_RELEASE_FAILED" });
                }
            }

            // Step 2 — addebito sedi immediato sul prezzo CORRENTE (non il target).
            // Fallimento qui → abort, nessuno schedule, nessuna compensazione
            // (niente è stato addebitato con successo).
            const seatsKey = buildIdempotencyKey({
                operation: "seats",
                tenantId,
                subscriptionId: tenant.stripe_subscription_id,
                currentPlan,
                currentSeats,
                targetPlan,
                targetSeats: newSeats
            });
            try {
                await stripe.subscriptions.update(
                    tenant.stripe_subscription_id,
                    {
                        items: [{ id: itemId, price: currentPriceId, quantity: newSeats }],
                        proration_behavior: "always_invoice",
                        payment_behavior: "error_if_incomplete",
                        metadata: { ...(sub.metadata ?? {}), plan_code: currentPlan }
                    },
                    { idempotencyKey: seatsKey }
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
                    console.warn(`stripe-change-subscription: combined seat charge payment failed: ${message}`);
                    return json(req, 402, { error: "PAYMENT_FAILED" });
                }
                console.error(`stripe-change-subscription: combined seat update failed: ${message}`);
                return json(req, 502, { error: "stripe_update_failed" });
            }

            // Step 3 — schedule downgrade differito. Fase0 ora = piano corrente @
            // newSeats (snapshot live aggiornato dallo step 2). Le key usano
            // currentSeats=newSeats: identiche a quelle che il downgrade PURO
            // calcolerebbe al retry (sedi già applicate), così Stripe fa replay e
            // il sistema converge senza doppio effetto.
            let createdScheduleId: string | null = null;
            try {
                const scheduleCreateKey = buildIdempotencyKey({
                    operation: "downgrade-create",
                    tenantId,
                    subscriptionId: tenant.stripe_subscription_id,
                    currentPlan,
                    currentSeats: newSeats,
                    targetPlan,
                    targetSeats: newSeats
                });
                const scheduleUpdateKey = buildIdempotencyKey({
                    operation: "downgrade-update",
                    tenantId,
                    subscriptionId: tenant.stripe_subscription_id,
                    currentPlan,
                    currentSeats: newSeats,
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
                    `stripe-change-subscription: COMBINED applied tenant=${tenantId} seats=${newSeats} (charged now) downgrade=${targetPlan} effective=${periodEndIso} schedule=${schedule.id}`
                );
                // Email best-effort dedicata al combinato: sedi attive/addebitate
                // ora + downgrade programmato al rinnovo (copy che cita entrambi).
                try {
                    const to = await getRecipient();
                    if (to) {
                        await sendEmail({
                            to,
                            ...combinedChangeEmail({
                                seats: newSeats,
                                targetPlan,
                                effectiveDateIso: periodEndIso
                            })
                        });
                    }
                } catch (err) {
                    console.error("[stripe-change-subscription] combined email error:", err);
                }
                return json(req, 200, {
                    ok: true,
                    classification: "combined",
                    plan: targetPlan,
                    seats: newSeats,
                    seatsChargedNow: true,
                    effective: periodEndIso,
                    scheduledChange: true,
                    scheduleId: schedule.id
                });
            } catch (err) {
                // Compensazione: lo step 2 è riuscito (sedi pagate, restano attive)
                // ma lo step 3 è fallito. NON disfare l'addebito. Rilascia lo
                // schedule creato a metà (best-effort) per non bloccare la sub.
                const message = err instanceof Error ? err.message : String(err);
                if (createdScheduleId) {
                    await releaseScheduleIfAny(stripe, createdScheduleId);
                }
                console.error(`stripe-change-subscription: combined schedule failed (seats already charged): ${message}`);
                // Email best-effort: sedi attive e pagate, downgrade non programmato.
                try {
                    const to = await getRecipient();
                    if (to) {
                        await sendEmail({
                            to,
                            ...combinedChangePartialFailureEmail({ seats: newSeats, targetPlan })
                        });
                    }
                } catch (mailErr) {
                    console.error("[stripe-change-subscription] combined partial-failure email error:", mailErr);
                }
                return json(req, 502, { error: "SEATS_ADDED_DOWNGRADE_NOT_SCHEDULED" });
            }
        }

        if (classification === "upgrade") {
            const existingScheduleId =
                typeof sub.schedule === "string" ? sub.schedule : (sub.schedule as { id?: string })?.id ?? null;

            // 🆕 FASE 2.3 — B2: aggiunta sedi (tier uguale, seats su) MENTRE c'e' un
            // cambio programmato in volo. Le sedi nuove si pagano subito (one-off
            // prorata a tariffa CORRENTE), il pending del tier resta intatto (solo
            // la sua qty futura sale). CHARGE-FIRST esplicito: NESSUN release (la
            // one-off e' customer-level, lo schedule non viene distrutto). L'update
            // delle fasi avviene SOLO dopo il pagamento riuscito (proration 'none').
            if (existingScheduleId) {
                let b2Schedule: Stripe.SubscriptionSchedule | null = null;
                try {
                    b2Schedule = await stripe.subscriptionSchedules.retrieve(existingScheduleId);
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.error(`stripe-change-subscription: B2 schedule retrieve failed: ${message}`);
                    return json(req, 502, { error: "stripe_schedule_failed" });
                }
                const b2Phases = b2Schedule.phases ?? [];
                const b2CurrentPhase = b2Phases[0];
                const b2FuturePhase = b2Phases.length >= 2 ? b2Phases[b2Phases.length - 1] : null;
                const b2FutureItem = b2FuturePhase?.items?.[0];
                const b2FuturePrice =
                    typeof b2FutureItem?.price === "string" ? b2FutureItem.price : b2FutureItem?.price?.id;

                // Pending reale (>=2 fasi + price futuro) → flusso B2. Altrimenti
                // schedule a 1 fase senza pending → fall-through all'upgrade standard.
                if (b2CurrentPhase && b2FuturePhase && b2FuturePrice) {
                    // Target futuro PRESERVATO dal pending (es. Base), non da targetPlan (Pro).
                    const b2FuturePlanCode = (await lookupPlanCodeByPriceId(admin, b2FuturePrice)) ?? targetPlan;

                    // Step 1 — importo delta sedi, ricalcolato al commit (drift minimo).
                    let chargeAmount = 0;
                    try {
                        const seatPreview = await stripe.invoices.createPreview({
                            customer: tenant.stripe_customer_id,
                            subscription: tenant.stripe_subscription_id,
                            subscription_details: {
                                items: [{ id: itemId, price: currentPriceId, quantity: newSeats }],
                                proration_behavior: "always_invoice"
                            }
                        });
                        chargeAmount = Math.max(0, seatPreview.amount_due ?? 0);
                    } catch (err) {
                        const message = err instanceof Error ? err.message : String(err);
                        console.error(`stripe-change-subscription: B2 commit seat preview failed: ${message}`);
                        return json(req, 502, { error: "preview_failed" });
                    }

                    // Step 2-4 — one-off invoice CHARGE-FIRST (customer-level, NO release).
                    // auto_advance:false → controllo manuale, niente dunning automatico.
                    if (chargeAmount > 0) {
                        const oneOffItemKey = buildIdempotencyKey({
                            operation: "seats-oneoff-item",
                            tenantId,
                            subscriptionId: tenant.stripe_subscription_id,
                            currentPlan,
                            currentSeats,
                            targetPlan,
                            targetSeats: newSeats
                        });
                        const oneOffCreateKey = buildIdempotencyKey({
                            operation: "seats-oneoff-create",
                            tenantId,
                            subscriptionId: tenant.stripe_subscription_id,
                            currentPlan,
                            currentSeats,
                            targetPlan,
                            targetSeats: newSeats
                        });
                        const oneOffPayKey = buildIdempotencyKey({
                            operation: "seats-oneoff-pay",
                            tenantId,
                            subscriptionId: tenant.stripe_subscription_id,
                            currentPlan,
                            currentSeats,
                            targetPlan,
                            targetSeats: newSeats
                        });

                        let b2InvoiceId: string | null = null;
                        try {
                            await stripe.invoiceItems.create(
                                {
                                    customer: tenant.stripe_customer_id,
                                    amount: chargeAmount,
                                    currency,
                                    description: "Sedi aggiuntive (prorata fino al rinnovo)"
                                },
                                { idempotencyKey: oneOffItemKey }
                            );
                            const invoice = await stripe.invoices.create(
                                {
                                    customer: tenant.stripe_customer_id,
                                    auto_advance: false,
                                    collection_method: "charge_automatically"
                                },
                                { idempotencyKey: oneOffCreateKey }
                            );
                            b2InvoiceId = invoice.id;
                            await stripe.invoices.pay(invoice.id, { idempotencyKey: oneOffPayKey });
                        } catch (err) {
                            const message = err instanceof Error ? err.message : String(err);
                            const type = (err as { type?: string })?.type ?? "";
                            const code = (err as { code?: string })?.code ?? "";
                            // Void best-effort della one-off non pagata → niente dunning async.
                            if (b2InvoiceId) {
                                try {
                                    await stripe.invoices.voidInvoice(b2InvoiceId);
                                } catch (vErr) {
                                    const vMsg = vErr instanceof Error ? vErr.message : String(vErr);
                                    console.error(`stripe-change-subscription: B2 void invoice failed: ${vMsg}`);
                                }
                            }
                            if (
                                type === "StripeCardError" ||
                                code === "subscription_payment_intent_requires_action" ||
                                /incomplete|requires_action|card_declined|payment/i.test(message)
                            ) {
                                console.warn(`stripe-change-subscription: B2 seat charge payment failed: ${message}`);
                                return json(req, 402, { error: "PAYMENT_FAILED" });
                            }
                            console.error(`stripe-change-subscription: B2 one-off charge failed: ${message}`);
                            return json(req, 502, { error: "stripe_update_failed" });
                        }
                    }

                    // Step 5 — aggiorna le fasi SENZA release. Fase corrente qty→newSeats
                    // (emette subscription.updated → webhook paid_seats=newSeats), fase
                    // futura = target del pending PRESERVATO con la nuova qty. proration
                    // 'none' (gia' addebitato dalla one-off, niente doppio addebito).
                    try {
                        const scheduleUpdateKey = buildIdempotencyKey({
                            operation: "downgrade-update-phases",
                            tenantId,
                            subscriptionId: tenant.stripe_subscription_id,
                            currentPlan,
                            currentSeats,
                            targetPlan,
                            targetSeats: newSeats
                        });
                        const currentPhaseItems = (b2CurrentPhase.items ?? []).map(it => ({
                            price: typeof it.price === "string" ? it.price : it.price?.id,
                            quantity: newSeats
                        }));
                        await updateSchedulePhases(stripe, existingScheduleId, {
                            currentPhaseItems,
                            currentPhaseStart: b2CurrentPhase.start_date,
                            currentPhaseEnd: b2CurrentPhase.end_date,
                            futurePhaseItems: [{ price: b2FuturePrice, quantity: newSeats }],
                            futurePhasePlanCode: b2FuturePlanCode,
                            prorationBehavior: "none",
                            idempotencyKey: scheduleUpdateKey
                        });
                    } catch (err) {
                        // Partial-failure: sedi PAGATE, pending intatto, fasi non aggiornate.
                        // Retry idempotente converge (one-off replay, update completa).
                        const message = err instanceof Error ? err.message : String(err);
                        console.error(`stripe-change-subscription: B2 schedule update failed (seats already charged): ${message}`);
                        return json(req, 502, { error: "SEATS_ADDED_SCHEDULE_NOT_UPDATED" });
                    }

                    console.log(
                        `stripe-change-subscription: B2 COMBINED seats charged + schedule updated tenant=${tenantId} seats=${newSeats} future=${b2FuturePlanCode} schedule=${existingScheduleId}`
                    );
                    // Email best-effort: riusa la combinata (sedi attive ora + piano al rinnovo).
                    try {
                        const to = await getRecipient();
                        if (to) {
                            await sendEmail({
                                to,
                                ...combinedChangeEmail({
                                    seats: newSeats,
                                    targetPlan: b2FuturePlanCode,
                                    effectiveDateIso: periodEndIso
                                })
                            });
                        }
                    } catch (err) {
                        console.error("[stripe-change-subscription] B2 email error:", err);
                    }

                    return json(req, 200, {
                        ok: true,
                        classification: "combined",
                        plan: b2FuturePlanCode,
                        seats: newSeats,
                        seatsChargedNow: true,
                        effective: periodEndIso,
                        scheduledChange: true,
                        scheduleId: existingScheduleId
                    });
                }
                // Nessun pending reale → prosegue con l'upgrade standard sotto.
            }

            // Upgrade standard (nessun cambio programmato da preservare) → immediato.
            // Rilascia ogni schedule attivo PRIMA dell'update (Stripe rifiuta update
            // su sub schedule-managed); eventuale schedule a 1 fase viene scartato.
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
        const downgradeScheduleId =
            typeof sub.schedule === "string" ? sub.schedule : (sub.schedule as { id?: string })?.id ?? null;

        // 🆕 FASE 2.2 — Esiste GIA' un cambio programmato: AGGIORNA la sua fase
        // futura (nuovo target + qty) invece di release+ricrea. Chiude il flag 3
        // (il pending non viene piu' distrutto silenziosamente) e copre la
        // riduzione sedi su schedule pendente (B3). Operazione €0: fase corrente
        // invariata, nessun addebito (proration 'none').
        if (downgradeScheduleId) {
            try {
                const existing = await stripe.subscriptionSchedules.retrieve(downgradeScheduleId);
                const currentPhase = existing.phases?.[0];
                if (!currentPhase) {
                    throw new Error("existing schedule has no current phase to preserve");
                }
                const currentPhaseItems = (currentPhase.items ?? []).map(it => ({
                    price: typeof it.price === "string" ? it.price : it.price?.id,
                    quantity: it.quantity ?? 1
                }));

                const scheduleUpdateKey = buildIdempotencyKey({
                    operation: "downgrade-update-phases",
                    tenantId,
                    subscriptionId: tenant.stripe_subscription_id,
                    currentPlan,
                    currentSeats,
                    targetPlan,
                    targetSeats: newSeats
                });

                await updateSchedulePhases(stripe, downgradeScheduleId, {
                    currentPhaseItems,
                    currentPhaseStart: currentPhase.start_date,
                    currentPhaseEnd: currentPhase.end_date,
                    futurePhaseItems: [{ price: newPriceId, quantity: newSeats }],
                    futurePhasePlanCode: targetPlan,
                    prorationBehavior: "none",
                    idempotencyKey: scheduleUpdateKey
                });

                console.log(
                    `stripe-change-subscription: DOWNGRADE updated existing schedule tenant=${tenantId} plan=${targetPlan} seats=${newSeats} effective=${periodEndIso} schedule=${downgradeScheduleId}`
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
                    console.error("[stripe-change-subscription] downgrade (update) email error:", err);
                }
                return json(req, 200, {
                    ok: true,
                    classification: "downgrade",
                    plan: targetPlan,
                    seats: newSeats,
                    effective: periodEndIso,
                    scheduledChange: true,
                    scheduleId: downgradeScheduleId
                });
            } catch (err) {
                // Update fallito: NON distruggere lo schedule pendente esistente
                // (resta il cambio programmato precedente). Nessun addebito emesso.
                const message = err instanceof Error ? err.message : String(err);
                console.error(`stripe-change-subscription: downgrade schedule update failed: ${message}`);
                return json(req, 502, { error: "stripe_schedule_failed" });
            }
        }

        // Nessun cambio programmato esistente: crea lo schedule ex-novo (A3/A4,
        // invariato). `existingScheduleId` qui e' null → releaseScheduleIfAny no-op.
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
