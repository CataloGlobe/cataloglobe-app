// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { deleteStripeCustomer, stripeClientOptions } from "../_shared/stripe-helpers.ts";
import {
    buildReuseCustomerUpdate,
    buildStripeCustomerProfile,
    syncCustomerTaxId,
    TENANT_FISCAL_COLUMNS,
    type TenantFiscal
} from "../_shared/stripeCustomerProfile.ts";
import { lookupStripePriceId, type BillingInterval } from "../_shared/planPrices.ts";
import { isValidPartitaIva } from "../_shared/fiscalValidators.ts";
import { claimStripeCustomer } from "../_shared/stripeCustomerClaim.ts";
import {
    checkPromoCodeLimits,
    DEFAULT_TRIAL_PERIOD_DAYS,
    resolvePromoTrialDays,
    resolveReturnUrl,
    TRIAL_DAYS_METADATA_KEY
} from "../_shared/checkoutPolicy.ts";

const ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://staging.cataloglobe.com",
    "https://cataloglobe.com",
    "https://www.cataloglobe.com",
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
const DEFAULT_PLAN_CODE = "pro";
const MAX_SELF_SERVICE_SEATS = 5;
// Free trial length. Lives here (not on `plans`) because it is a checkout-time
// policy — "how long is the first subscription free" — not a per-plan price
// attribute; every plan gets the same trial. A card-free code may set its own
// length with the `trial_days` metadata (capped, see _shared/checkoutPolicy).
const TRIAL_PERIOD_DAYS = DEFAULT_TRIAL_PERIOD_DAYS;
// Checkout Session lifetime. Stripe accepts 30 min to 24 h from the moment it
// creates the session; the extra minute absorbs the gap between our clock and
// Stripe's creation time, which would otherwise make exactly 30 min a 400.
const CHECKOUT_SESSION_TTL_SECONDS = 30 * 60 + 60;
// Promotion code metadata key that unlocks the card-free trial. Codes are
// handed out one by one by us; see the trial-no-card branch below.
const TRIAL_NO_CARD_METADATA_KEY = "trial_no_card";
// Billing intervals a customer can pick at checkout. Same domain as Stripe
// `recurring.interval`; the Price for (plan, interval) comes from `plan_prices`.
const ALLOWED_BILLING_INTERVALS = new Set<BillingInterval>(["month", "year"]);
// Applied only when the field is absent (older frontend), never when invalid.
const DEFAULT_BILLING_INTERVAL: BillingInterval = "month";

function json(req: Request, status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

/**
 * Subscriptions created with a promotion code, whatever their status: a code
 * handed out once stays used even if that subscription was later cancelled.
 * Stripe Search is eventually consistent (about a minute), which is fine for
 * codes handed out one by one.
 */
async function countSubscriptionsWithPromotion(stripe: Stripe, promotionId: string): Promise<number> {
    let count = 0;
    let page: string | undefined;
    do {
        const result = await stripe.subscriptions.search({
            query: `metadata['promotion_code_id']:'${promotionId}'`,
            limit: 100,
            ...(page ? { page } : {})
        });
        count += result.data.length;
        page = result.has_more ? result.next_page ?? undefined : undefined;
    } while (page);
    return count;
}

// Query param read by the frontend on the return from Checkout.
const CHECKOUT_SESSION_PARAM = "checkout_session";

/**
 * Adds `checkout_session={CHECKOUT_SESSION_ID}` to a return URL. The braces
 * must stay literal (Stripe replaces the placeholder verbatim), so this is
 * string work, not URLSearchParams. Idempotent on URLs that already carry it.
 */
function appendCheckoutSessionPlaceholder(url: string): string {
    if (url.includes(`${CHECKOUT_SESSION_PARAM}=`)) return url;
    const [base, hash] = url.split("#", 2);
    const separator = base.includes("?") ? "&" : "?";
    const withParam = `${base}${separator}${CHECKOUT_SESSION_PARAM}={CHECKOUT_SESSION_ID}`;
    return hash !== undefined ? `${withParam}#${hash}` : withParam;
}

// Campi di un errore Stripe letti nei log (mai `message`, vedi i catch).
type StripeErrorLike = {
    code?: string;
    type?: string;
    statusCode?: number;
    raw?: { param?: string };
    requestId?: string;
};

type CheckoutBody = {
    tenantId?: string;
    successUrl?: string;
    cancelUrl?: string;
    quantity?: number;
    planCode?: string;
    billingInterval?: string;
    promotionCode?: string;
};

serve(async req => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
            console.error("stripe-checkout: Missing env vars");
            return json(req, 500, { error: "server_misconfigured" });
        }

        // --- Auth ---
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return json(req, 401, { error: "unauthorized" });
        }

        const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: authData, error: authError } = await supabaseUser.auth.getUser();
        const userId = authData?.user?.id;
        const userEmail = authData?.user?.email;

        if (authError || !userId) {
            console.error(`stripe-checkout: Auth failed: ${authError?.message || "no user"}`);
            return json(req, 401, { error: "unauthorized" });
        }

        // --- Parse body ---
        let payload: CheckoutBody | null = null;
        try {
            payload = await req.json();
        } catch {
            return json(req, 400, { error: "invalid_json" });
        }

        const tenantId = payload?.tenantId?.trim();
        if (!tenantId) return json(req, 400, { error: "missing_tenant_id" });

        const quantity = Math.max(
            1,
            Math.min(MAX_SELF_SERVICE_SEATS, Math.floor(Number(payload?.quantity) || 1))
        );

        const rawPlanCode = (payload?.planCode ?? "").trim().toLowerCase();
        const planCode = rawPlanCode === "" ? DEFAULT_PLAN_CODE : rawPlanCode;
        if (!ALLOWED_PLAN_CODES.has(planCode)) {
            return json(req, 400, { error: "invalid_plan_code" });
        }

        // Optional, allowlisted when present. An ABSENT interval means a caller
        // that predates the field, and for those only monthly ever existed: the
        // default betrays no choice and lets FE and edge ship in either order.
        // An INVALID value is a client bug and is rejected.
        const rawInterval = (payload?.billingInterval ?? "").trim().toLowerCase();
        const billingInterval: BillingInterval = rawInterval === "" ? DEFAULT_BILLING_INTERVAL : (rawInterval as BillingInterval);
        if (!ALLOWED_BILLING_INTERVALS.has(billingInterval)) {
            return json(req, 400, { error: "invalid_billing_interval" });
        }

        const promotionCodeInput = payload?.promotionCode?.trim() ?? "";

        // Stripe substitutes `{CHECKOUT_SESSION_ID}` on redirect: the return
        // page hands it to stripe-checkout-confirm, which links the tenant to
        // the subscription without waiting for the webhook. Appended here, not
        // by the callers, so every return URL carries it.
        //
        // Both URLs must sit on one of our app origins: Stripe redirects there
        // after payment, so a URL from the body would otherwise be an open
        // redirect behind a trusted checkout page. Missing or foreign → 400.
        const allowedSuccessUrl = resolveReturnUrl(payload?.successUrl, ALLOWED_ORIGINS);
        const cancelUrl = resolveReturnUrl(payload?.cancelUrl, ALLOWED_ORIGINS);
        if (!allowedSuccessUrl || !cancelUrl) {
            console.warn("stripe-checkout: refused, successUrl/cancelUrl missing or not on an app origin");
            return json(req, 400, { error: "invalid_return_url" });
        }
        const successUrl = appendCheckoutSessionPlaceholder(allowedSuccessUrl);

        // --- Ownership check ---
        const { data: tenantData, error: tenantError } = await supabaseUser
            .from("tenants")
            .select("id, owner_user_id, stripe_customer_id, stripe_subscription_id")
            .eq("id", tenantId)
            .maybeSingle();

        if (tenantError || !tenantData) {
            console.error("stripe-checkout: Tenant not found or not accessible");
            return json(req, 403, { error: "forbidden" });
        }

        if (tenantData.owner_user_id !== userId) {
            console.warn(`stripe-checkout: User ${userId} is not owner of tenant ${tenantId}`);
            return json(req, 403, { error: "forbidden" });
        }

        // --- Stripe ---
        const stripe = new Stripe(STRIPE_SECRET_KEY, stripeClientOptions());
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // --- Seats vs existing activities (CG-03) ---
        // The subscription must cover every activity the tenant already has:
        // webhook and confirm write paid_seats = quantity, and the seat trigger
        // only guards new inserts. Counted with service_role so the number does
        // not depend on RLS, and fail-closed: no count, no checkout.
        const { count: activityCount, error: activityCountError } = await supabaseAdmin
            .from("activities")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId);

        if (activityCountError || activityCount === null) {
            console.error(
                `stripe-checkout: activity count failed for tenant ${tenantId}: ${activityCountError?.message ?? "null count"}`
            );
            return json(req, 503, { error: "activity_count_unavailable" });
        }

        if (activityCount > MAX_SELF_SERVICE_SEATS) {
            console.warn(
                `stripe-checkout: tenant ${tenantId} has ${activityCount} activities, over the self-service cap ${MAX_SELF_SERVICE_SEATS}`
            );
            return json(req, 409, { error: "seats_over_self_service", min_seats: activityCount });
        }

        if (quantity < activityCount) {
            console.warn(
                `stripe-checkout: quantity ${quantity} below ${activityCount} activities for tenant ${tenantId}`
            );
            return json(req, 409, { error: "seats_below_activities", min_seats: activityCount });
        }

        // --- Resolve price_id from plan_prices (DB-driven, single source of truth) ---
        // No row for (plan, interval) → clean error, never a fallback to another
        // interval: a customer who picked yearly must not be sold a monthly Price.
        const resolvedPriceId = await lookupStripePriceId(supabaseAdmin, planCode, billingInterval);
        if (!resolvedPriceId) {
            console.error(
                `stripe-checkout: plan_prices has no row for ${planCode}/${billingInterval} — interval not purchasable`
            );
            return json(req, 500, { error: "plan_not_configured" });
        }

        // --- Resolve promotion code (auto-detect: promo_ id vs human code) ---
        let resolvedPromotionId: string | null = null;
        // Set when the resolved code carries `metadata.trial_no_card = "true"`:
        // the code is only a key to the card-free trial, its coupon is never applied.
        let isTrialNoCardCode = false;
        let promoMetadata: Record<string, string> | null = null;
        let promo: Stripe.PromotionCode | null = null;
        if (promotionCodeInput !== "") {
            try {
                if (promotionCodeInput.startsWith("promo_")) {
                    promo = await stripe.promotionCodes.retrieve(promotionCodeInput);
                } else {
                    const list = await stripe.promotionCodes.list({
                        code: promotionCodeInput,
                        active: true,
                        limit: 1
                    });
                    promo = list.data?.[0] ?? null;
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.warn(`stripe-checkout: promo code lookup failed: ${message}`);
                return json(req, 400, { error: "promo_code_invalid" });
            }
            if (!promo || !promo.active) {
                return json(req, 400, { error: "promo_code_invalid" });
            }
            resolvedPromotionId = promo.id;
            promoMetadata = promo.metadata ?? null;
            isTrialNoCardCode = promo.metadata?.[TRIAL_NO_CARD_METADATA_KEY] === "true";

            // A card-free trial code is only good for a tenant's first subscription
            // (one trial per tenant, see `isFirstSubscription` below). Rejected like
            // an unknown code: no silent fallback to the card-required checkout.
            // Checked before the use count, so a returning tenant gets this
            // answer (not `promo_code_used_up`) and no Stripe Search is spent.
            if (isTrialNoCardCode && tenantData.stripe_subscription_id) {
                console.warn(
                    `stripe-checkout: trial_no_card code ${resolvedPromotionId} refused for tenant ${tenantId} (not first subscription)`
                );
                return json(req, 400, { error: "promo_code_invalid" });
            }

            // Expiry and use limit, checked here and not left to Stripe: a
            // card-free code never has its coupon applied, so Stripe never
            // counts it nor refuses it once expired. We count the
            // subscriptions created with it (`promotion_code_id` metadata, set
            // below). If the count cannot be read the code is refused: better a
            // retry than a code handed out once being used twice.
            let trialRedemptions = 0;
            if (isTrialNoCardCode) {
                try {
                    trialRedemptions = await countSubscriptionsWithPromotion(stripe, promo.id);
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.error(`stripe-checkout: cannot count uses of promo ${promo.id}: ${message}`);
                    return json(req, 503, { error: "promo_code_check_unavailable" });
                }
            }
            const refusal = checkPromoCodeLimits(promo, Math.floor(Date.now() / 1000), trialRedemptions);
            if (refusal) {
                console.warn(
                    `stripe-checkout: promo ${promo.id} refused for tenant ${tenantId} (${refusal}, trial uses ${trialRedemptions})`
                );
                return json(req, 400, { error: refusal });
            }
        }

        // --- Fiscal profile for Stripe pre-fill (service_role, explicit tenant guard) ---
        const { data: fiscalRow, error: fiscalError } = await supabaseAdmin
            .from("tenants")
            .select(TENANT_FISCAL_COLUMNS)
            .eq("id", tenantId)
            .maybeSingle();

        if (fiscalError) {
            // Un tempo non fatale (degradava solo il pre-fill). Ora la riga
            // serve anche al gate fiscale bloccante sotto: senza, non possiamo
            // provare che la P.IVA sia valida, quindi si rifiuta (503 retryabile)
            // invece di vendere l'abbonamento al buio.
            console.warn("stripe-checkout: fiscal profile fetch failed:", fiscalError.message);
        }

        const fiscal: TenantFiscal = fiscalRow ?? {};

        // --- Server-side fiscal gate (bloccante) ---------------------------------
        // La validazione FE è aggirabile (chiamata diretta all'edge). Qui è
        // l'ultimo cancello prima di creare il customer Stripe e vendere
        // l'abbonamento: una P.IVA presente DEVE avere il check digit corretto, e
        // con una P.IVA serve un recapito e-fattura (SDI o PEC), altrimenti la
        // fattura elettronica non è recapitabile. Il gate ha bisogno della riga
        // fiscale: se la lettura è fallita non possiamo validare, quindi si
        // rifiuta (503 retryabile) invece di procedere al buio.
        if (fiscalError) {
            return json(req, 503, { error: "fiscal_profile_unavailable" });
        }
        const vatValue = (fiscal.vat_number ?? "").trim();
        if (vatValue.length > 0) {
            if (!isValidPartitaIva(vatValue)) {
                return json(req, 400, { error: "invalid_vat_number" });
            }
            const hasRecipient =
                (fiscal.codice_destinatario ?? "").trim().length > 0 ||
                (fiscal.pec ?? "").trim().length > 0;
            if (!hasRecipient) {
                return json(req, 400, { error: "missing_einvoice_recipient" });
            }
        }

        // Profilo customer (name, address, description, metadata, tax id) dal modulo
        // condiviso con update-billing-details, gia' tagliato ai limiti Stripe:
        // un campo troppo lungo farebbe fallire create o update con 400 e
        // bloccherebbe il pagamento. Il DB resta la fonte di verita'.
        const {
            name: stripeCustomerName,
            address: customerAddress,
            description: stripeCustomerDescription,
            metadata: stripeCustomerMetadata,
            euVatValue
        } = buildStripeCustomerProfile(tenantId, fiscal);

        // Create or reuse Stripe Customer, pre-filling name + address from the tenant.
        let stripeCustomerId = tenantData.stripe_customer_id;

        if (!stripeCustomerId) {
            let customer: Stripe.Customer;
            try {
                customer = await stripe.customers.create({
                    email: userEmail,
                    name: stripeCustomerName,
                    address: customerAddress,
                    description: stripeCustomerDescription,
                    preferred_locales: ["it"],
                    metadata: { ...stripeCustomerMetadata, user_id: userId }
                });
            } catch (err) {
                // Log only the error class + il parametro rifiutato — mai `message`,
                // che echeggia il valore inviato (P.IVA, indirizzo, ragione sociale).
                console.error(
                    `stripe-checkout: customer create failed: code=${(err as StripeErrorLike | null)?.code} type=${(err as StripeErrorLike | null)?.type} status=${(err as StripeErrorLike | null)?.statusCode} param=${(err as StripeErrorLike | null)?.raw?.param} request_id=${(err as StripeErrorLike | null)?.requestId}`
                );
                return json(req, 502, { error: "stripe_customer_create_failed" });
            }
            // Salvataggio condizionato: con due checkout in parallelo lo
            // scrive solo il primo, l'altro usa quel customer e cancella il
            // suo (vedi _shared/stripeCustomerClaim.ts).
            const claim = await claimStripeCustomer(customer.id, {
                saveIfEmpty: async id => {
                    const { data, error } = await supabaseAdmin
                        .from("tenants")
                        .update({ stripe_customer_id: id })
                        .eq("id", tenantId)
                        .is("stripe_customer_id", null)
                        .select("id");
                    return { saved: (data ?? []).length > 0, error: error ? error.message : null };
                },
                readCurrent: async () => {
                    const { data, error } = await supabaseAdmin
                        .from("tenants")
                        .select("stripe_customer_id")
                        .eq("id", tenantId)
                        .maybeSingle();
                    return {
                        customerId: (data?.stripe_customer_id as string | null | undefined) ?? null,
                        error: error ? error.message : null
                    };
                },
                deleteCustomer: async id => {
                    // Helper idempotente con log; un errore non blocca il checkout.
                    await deleteStripeCustomer(stripe, id, {
                        tenant_id: tenantId,
                        reason: "parallel_checkout_duplicate"
                    });
                }
            });

            if (claim.kind === "db_error") {
                console.error("stripe-checkout: Failed to save stripe_customer_id:", claim.message);
                return json(req, 500, { error: "db_update_failed" });
            }
            if (claim.lostRace) {
                console.warn(
                    `stripe-checkout: parallel checkout for tenant ${tenantId}, reusing the customer saved first`
                );
            }
            stripeCustomerId = claim.customerId;
        } else {
            // Reuse path: refresh profile on the existing customer. Best-effort —
            // a failed update must not block checkout (we still have the data our side).
            // email + user_id follow the caller, who is the owner (checked above):
            // realigns a customer left on a previous owner by an ownership transfer.
            // With the fiscal row in hand, align like update-billing-details: a
            // field emptied in the DB is emptied on Stripe too ("" = unset,
            // metadata keys included). Without the row (maybeSingle → null) the
            // empty profile would wipe the customer, so keep the pre-fill update:
            // only filled fields, Stripe merges metadata.
            const reuseUpdate = fiscalRow
                ? buildReuseCustomerUpdate(tenantId, fiscal, userEmail, userId)
                : {
                    email: userEmail,
                    name: stripeCustomerName,
                    address: customerAddress,
                    description: stripeCustomerDescription,
                    preferred_locales: ["it"],
                    metadata: { ...stripeCustomerMetadata, user_id: userId }
                };
            try {
                await stripe.customers.update(stripeCustomerId, reuseUpdate);
            } catch (err) {
                // Log only the error class — Stripe messages can echo the submitted value.
                console.warn(
                    `stripe-checkout: customer update skipped (non-fatal): code=${(err as StripeErrorLike | null)?.code} type=${(err as StripeErrorLike | null)?.type} status=${(err as StripeErrorLike | null)?.statusCode}`
                );
            }
        }

        // Align the eu_vat tax id to the current P.IVA (best-effort, idempotent,
        // never throws). On a reused customer this also removes a stale P.IVA
        // left by an earlier checkout — Stripe copies every tax id onto the
        // invoice. A brand-new customer has none: skip when there is no P.IVA.
        if (euVatValue || tenantData.stripe_customer_id) {
            await syncCustomerTaxId(stripe, stripeCustomerId, euVatValue, { fn: "stripe-checkout", tenant_id: tenantId });
        }

        // --- Anti double-checkout guard ---
        // `tenantData.stripe_subscription_id` is written only by the
        // checkout.session.completed webhook: in the seconds between payment and
        // webhook delivery (or if delivery fails) it is still NULL, MainLayout
        // bounces the owner to the resume wizard, and a second checkout would
        // create a second subscription. Ask Stripe directly instead of trusting
        // our own row. `incomplete` is deliberately NOT blocking: it is a failed
        // first payment and the customer must be able to retry without risk of
        // a double charge. `canceled` is the legitimate reactivation path.
        try {
            const existing = await stripe.subscriptions.list({
                customer: stripeCustomerId,
                status: "all",
                limit: 10
            });
            const blocking = existing.data.find(
                s =>
                    s.status === "active" ||
                    s.status === "trialing" ||
                    s.status === "past_due" ||
                    s.status === "unpaid"
            );
            if (blocking) {
                console.warn(
                    `stripe-checkout: tenant ${tenantId} already has subscription ${blocking.id} (${blocking.status}); refusing new session`
                );
                return json(req, 409, { error: "subscription_already_active" });
            }
        } catch (err) {
            // Fail-closed: if we cannot verify, do not risk a duplicate charge.
            console.error(
                `stripe-checkout: subscriptions.list failed: code=${(err as StripeErrorLike | null)?.code} type=${(err as StripeErrorLike | null)?.type} status=${(err as StripeErrorLike | null)?.statusCode}`
            );
            return json(req, 502, { error: "subscription_check_failed" });
        }

        // --- Build Checkout Session params ---
        const sessionMetadata: Record<string, string> = {
            tenant_id: tenantId,
            plan_code: planCode
        };
        const subscriptionMetadata: Record<string, string> = {
            tenant_id: tenantId,
            plan_code: planCode
        };
        if (resolvedPromotionId) {
            sessionMetadata.promotion_code_id = resolvedPromotionId;
            subscriptionMetadata.promotion_code_id = resolvedPromotionId;
        }

        // One trial per tenant: `stripe_subscription_id` is set only once, at the
        // FIRST checkout.session.completed (stripe-webhook/index.ts), and is never
        // cleared afterwards — not even on customer.subscription.deleted, which
        // only flips subscription_status. So a NULL here reliably means "this
        // tenant has never had a Stripe subscription"; a re-subscribe after
        // cancellation must not grant a second free month.
        const isFirstSubscription = !tenantData.stripe_subscription_id;

        // Trial and promotion code are mutually exclusive. A `repeating` coupon's
        // window starts when it is applied (subscription creation), so it keeps
        // consuming its months during a free trial: 30-day trial + "3 months free"
        // silently becomes ~3 months total instead of the 4 we would be promising.
        // A `once` coupon is ambiguous for the same reason (which "first invoice"
        // counts). When a code was resolved, the coupon alone defines the offer.
        //
        // Exception: a `trial_no_card` code. Its coupon is never passed to the
        // session (no `discounts` below), so no coupon window can run during the
        // trial and the reason above does not apply — the code only unlocks the
        // trial, and the trial is still first-subscription-only (checked above).
        const grantTrial = isFirstSubscription && (!resolvedPromotionId || isTrialNoCardCode);

        // A card-free code may carry its own trial length (`trial_days`, e.g.
        // 180 for a six-month offer). Invalid or over the cap → the code is
        // refused, never silently downgraded to the default.
        let trialPeriodDays = TRIAL_PERIOD_DAYS;
        if (isTrialNoCardCode && grantTrial) {
            const promoTrialDays = resolvePromoTrialDays(promoMetadata);
            if (promoTrialDays === null) {
                console.warn(`stripe-checkout: promo ${resolvedPromotionId} has an invalid ${TRIAL_DAYS_METADATA_KEY}`);
                return json(req, 400, { error: "promo_code_invalid" });
            }
            trialPeriodDays = promoTrialDays;
            subscriptionMetadata[TRIAL_DAYS_METADATA_KEY] = String(trialPeriodDays);
        }
        if (isTrialNoCardCode) {
            subscriptionMetadata[TRIAL_NO_CARD_METADATA_KEY] = "true";
        }

        const sessionParams: Stripe.Checkout.SessionCreateParams = {
            mode: "subscription",
            customer: stripeCustomerId,
            line_items: [{ price: resolvedPriceId, quantity }],
            subscription_data: {
                metadata: subscriptionMetadata,
                ...(grantTrial ? { trial_period_days: trialPeriodDays } : {})
            },
            metadata: sessionMetadata,
            success_url: successUrl,
            cancel_url: cancelUrl,
            // Short-lived session (default 24h): the seat check above counts the
            // activities when the session is created, so a long-open session
            // leaves room to add activities before paying (CG-03 residual).
            expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_TTL_SECONDS,
            // Disabled: forfettario regime, no VAT applied. See LICENSE/README
            automatic_tax: { enabled: false },
            // Address + P.IVA are pre-filled on the customer above, so Stripe no
            // longer collects them. "auto" avoids prompting when not required;
            // tax_id_collection is off (we set the tax id ourselves). customer_update
            // is omitted — there is nothing collected to write back.
            billing_address_collection: "auto",
            tax_id_collection: { enabled: false }
        };

        if (isTrialNoCardCode) {
            // Nothing is due today (trial, no discount), so Checkout skips
            // the card. Without a card at trial end Stripe cancels the
            // subscription → customer.subscription.deleted → tenant `canceled`.
            sessionParams.payment_method_collection = "if_required";
            sessionParams.subscription_data!.trial_settings = {
                end_behavior: { missing_payment_method: "cancel" }
            };
        } else if (resolvedPromotionId) {
            sessionParams.discounts = [{ promotion_code: resolvedPromotionId }];
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        console.log(
            `stripe-checkout: Session ${session.id} created for tenant ${tenantId} (plan=${planCode}, interval=${billingInterval}, qty=${quantity}, promo=${resolvedPromotionId ?? "none"}, trial_no_card=${isTrialNoCardCode}, trial_days=${grantTrial ? trialPeriodDays : 0})`
        );

        return json(req, 200, { checkout_url: session.url });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Logged only server-side — the raw message (Stripe errors can echo
        // submitted values like P.IVA/address) must never reach the client.
        console.error("stripe-checkout: Unhandled error:", message);
        return json(req, 500, { error: "checkout_failed" });
    }
});
