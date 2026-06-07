# Subscription Refactor — Piano di Migration

> Stato: **DRAFT, in attesa di validazione utente**. Non implementare prima dell'OK.
> Data: 2026-06-06
> Obiettivo: passare da single-tier (`pro` €39.90/sede) a two-tier (`base` €39 + `pro` €59), con add-on schema predisposto, founder pricing, promo code via Stripe nativo.

---

## 1. Stato attuale del codebase

### 1.1 Schema `tenants` (post-migration `20260411100000_stripe_subscription_setup.sql`)

| Colonna | Tipo | Nullable | Default | Note |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `owner_user_id` | uuid | NO | — | FK auth.users, ON DELETE CASCADE |
| `name` | text | NO | — | — |
| `vertical_type` | text | NO | `'food_beverage'` | — |
| `business_subtype` | text | YES | — | — |
| `logo_url` | text | YES | — | — |
| `deleted_at` | timestamptz | YES | — | soft-delete |
| `created_at` / `updated_at` | timestamptz | NO | `now()` | — |
| **`plan`** | text | NO | `'pro'` | **FK → `plans(code)`**, CHECK `plan IN ('pro')` |
| `subscription_status` | text | NO | `'trialing'` | CHECK `IN ('trialing','active','past_due','suspended','canceled')` |
| `trial_until` | timestamptz | YES | — | cron scala a `past_due` |
| `stripe_customer_id` | text | YES | — | UNIQUE WHERE NOT NULL |
| `stripe_subscription_id` | text | YES | — | UNIQUE WHERE NOT NULL |

**Mancano**: `is_founder`, `applied_promo_code`, `legacy_price_id`.

⚠️ **Naming**: colonna esistente è `plan` (text), non `plan_id`. La user spec usa `plan_id`. → vedi **Open Question Q1**.

### 1.2 Schema `activities`

Tabella `activities` (migration `20260223151000_v2_activities.sql`). Manca `plan_override_id` (o equivalente). FK verso `tenants` è ON DELETE **RESTRICT**.

### 1.3 Schema `plans` (lookup-only oggi)

Da `20260316050000_v2_plans_table.sql`:

| Colonna | Tipo | Note |
|---|---|---|
| `code` | text PK | `'free' / 'pro' / 'enterprise'` |
| `max_activities` | int | NULL = unlimited |
| `max_products` | int | NULL = unlimited |
| `max_catalogs` | int | NULL = unlimited |

Post-setup `20260411100000`, su `tenants` solo `'pro'` è ammesso (CHECK constraint). Le righe `'free' / 'enterprise'` restano come lookup ma non usate.

**Mancano**: `name`, `description`, `monthly_price_cents`, `stripe_price_id`, `features_json`, `sort_order`, `is_public`, `volume_discount_threshold`, `volume_discount_percent`, `max_self_service_seats`.

### 1.4 Tabelle `addons` / `activity_addons`

**Non esistono.** Da creare ex novo (predisposizione, vuote).

### 1.5 Integrazione Stripe attuale

Service: `src/services/supabase/billing.ts`:
- `createCheckoutSession(tenantId, successUrl?, cancelUrl?, quantity)` → Edge `stripe-checkout`
- `updateSeats(tenantId, quantity)` → Edge `stripe-update-seats`
- `createPortalSession(tenantId, returnUrl?)` → Edge `stripe-portal`

Edge Functions: `stripe-checkout`, `stripe-update-seats`, `stripe-portal`, `stripe-webhook`. Helpers idempotenti in `_shared/stripe-helpers.ts` (scheduleStripeCancel, reactivateStripeSubIfScheduled, cancelStripeSubImmediate, deleteStripeCustomer).

**Pricing**: hardcoded via env var `STRIPE_PRICE_ID` in `stripe-checkout`. Single price line item, quantity = numero sedi. Non c'è mapping `plan → stripe_price_id` su DB.

### 1.6 Wizard creazione tenant

`src/components/Businesses/CreateBusinessDrawer.tsx`. Raccoglie `name`, `business_subtype`, `logoFile`, `seats`. INSERT tenant → uppload logo → `createCheckoutSession(tenantId, seats)` → redirect Stripe.

### 1.7 Feature gating helper

**Non esiste** `tenantHasFeature` / `locationHasFeature` / `getEffectivePlan`. Da creare.

### 1.8 Convention migration

- File: `supabase/migrations/YYYYMMDDHHMMSS_*.sql`
- Idempotenti (`IF NOT EXISTS`, `IF EXISTS`, conditional DO blocks)
- RLS: 4 policy standard (SELECT/INSERT/UPDATE/DELETE) `TO authenticated`
- No enum types — solo CHECK constraint su text
- snake_case, plurale, inglese

---

## 2. Gap analysis

| Obiettivo | Stato attuale | Gap |
|---|---|---|
| 2 piani `base` + `pro` | solo `pro` ammesso | espandere CHECK + seed `base` |
| `plans` con prezzo, features, stripe_price_id | tabella minimal (limits only) | aggiungere ~10 colonne |
| `tenants.is_founder` | assente | nuova colonna |
| `tenants.applied_promo_code` | assente | nuova colonna |
| `tenants.legacy_price_id` | assente | nuova colonna |
| `activities.plan_override` | assente | nuova colonna nullable |
| `addons` + `activity_addons` | assenti | nuove tabelle + RLS |
| Feature gating helper | assente | nuovo SQL helper o TS util |
| Stripe checkout multi-price | env var single price | refactor Edge `stripe-checkout` |
| Volume discount 10% dalla 2° sede | non implementato | Stripe Coupon dinamico o tier pricing |
| Promo code tracking | assente | colonna `applied_promo_code` + optional `promo_code_usages` |

---

## 3. Strategia migration

Ordine logico (idempotenti, ognuna safe stand-alone):

1. **`<ts>_expand_plans_table.sql`** — aggiunge colonne mancanti a `plans` (name, description, monthly_price_cents, stripe_price_id, features_json jsonb DEFAULT `'{}'`, sort_order, is_public bool DEFAULT true, volume_discount_threshold int DEFAULT 2, volume_discount_percent int DEFAULT 10, max_self_service_seats int DEFAULT 5).
2. **`<ts>_seed_plans_base_pro.sql`** — UPSERT righe `base` (€39, features `{}`) + `pro` (€59, features `{ "table_reservation": true, "table_ordering": true }`). `stripe_price_id` lasciato NULL — popolato in step manuale post-creazione su Stripe Dashboard.
3. **`<ts>_relax_tenants_plan_check.sql`** — DROP CHECK `plan IN ('pro')`, ADD CHECK `plan IN ('base','pro')`. **Default** rimane `'pro'` per non rompere wizard esistente (vedi **Q3**).
4. **`<ts>_tenants_add_subscription_columns.sql`** — `is_founder bool NOT NULL DEFAULT false`, `applied_promo_code text NULL`, `legacy_price_id text NULL`. Backfill esistenti: tutti `is_founder=false`.
5. **`<ts>_activities_add_plan_override.sql`** — `plan_override text NULL REFERENCES plans(code)`. Index `(plan_override) WHERE plan_override IS NOT NULL`.
6. **`<ts>_create_addons_table.sql`** — schema completo + RLS (read public, write admin-only via service_role). Tabella vuota.
7. **`<ts>_create_activity_addons_table.sql`** — schema + 4 policy RLS (`tenant_id IN get_my_tenant_ids()`).
8. **`<ts>_create_promo_code_usages.sql`** — *OPZIONALE*, vedi **Q5**. Schema minimo: `(id uuid PK, tenant_id, stripe_promo_code text, applied_at, stripe_discount_amount_cents, notes)`.
9. **`<ts>_create_feature_gating_function.sql`** — SQL function `activity_has_feature(p_activity_id uuid, p_feature_id text) → bool`. SECURITY INVOKER (rispetta RLS chiamante). Logica:
   ```
   SELECT COALESCE(a.plan_override, t.plan) AS effective_plan
   FROM activities a JOIN tenants t ON t.id = a.tenant_id
   WHERE a.id = p_activity_id
   → look up plans.features_json[p_feature_id] = true
   ```
   `SET search_path TO ''`. REVOKE FROM PUBLIC, GRANT TO authenticated.

**Backfill strategia su tenants esistenti**: tutti restano su `plan='pro'`. Rationale: hanno sottoscritto al tier unico che corrispondeva al Pro target (incluso table_ordering, table_reservation). Downgrade a `base` sarebbe regressione di feature.

---

## 4. Open questions (richiedono decisione utente)

### Q1 — Naming colonna `plan` vs `plan_id`
La user spec dice `plan_id` (FK su `plans`). Codebase ha già `plan` (text, FK su `plans.code`). Opzioni:
- **A (consigliata)**: tenere `plan` (text), espandere CHECK. Zero refactor su codice esistente (`get_user_tenants` view, frontend tenant.plan reads).
- **B**: rinominare `plan` → `plan_code`. Più espressivo, ma richiede update di view, RPC, frontend, billing.ts.
- **C**: aggiungere `plan_id` uuid FK su un nuovo `plans.id` uuid + deprecare `plan`. Più "rigoroso" ma 2x complessità.

**Default proposto**: A.

### Q2 — `addons.id` text vs uuid
User spec dice `id string PK`. Codebase usa uuid per la maggior parte delle tabelle. `plans.code` è text (lookup human-readable). Add-ons saranno human-named (`sms_notifications`, `custom_integration`) o anonimi?
- Se human-named → text PK come `plans` (consistenza).
- Se uuid → meglio per stabilità future renaming.

**Default proposto**: text PK (consistenza con `plans`).

### Q3 — Default `tenants.plan` al wizard
Oggi il wizard non chiede il piano (single-tier). Dopo il refactor:
- Wizard mostra scelta `Base/Pro` → default `tenants.plan` rimane DB-side `'pro'` ma il wizard sovrascrive sempre.
- Wizard NON mostra scelta → default `'base'` con upgrade via portal.

**Default proposto**: wizard sceglie esplicitamente, DB default a `'base'` (conservative + free-default-mindset). Però: backfill esistenti a `'pro'`.

### Q4 — Stripe Price ID per piano: env var vs DB
Oggi env var `STRIPE_PRICE_ID` single. Refactor:
- Spostare su `plans.stripe_price_id` (DB-driven, multi-piano).
- Mantenere fallback su env var per backward-compat durante rollout.

**Default proposto**: DB-driven con env var solo come fallback per `plan='pro'` (vecchi tenant).

### Q5 — Tabella `promo_code_usages` serve davvero?
Stripe traccia già `customer.discount`, `subscription.discounts`, `coupon.applied_to`. Pro:
- Tracking veloce senza chiamare Stripe API (analytics interne).
Con:
- Duplicazione fonte di verità.

**Default proposto**: **skip ora**. `applied_promo_code text` su `tenants` basta per tracking minimale (last applied). Se serve analytics multi-utilizzo, aggiungere dopo.

### Q6 — Volume discount: come Stripe lo applica
10% dalla 2° sede in poi. Tre approcci:
- **Tier pricing su Stripe Price**: 1 unit = €39, 2+ units = €35.10. Stripe gestisce auto.
- **Stripe Coupon dinamico**: ogni subscription update calcola e applica coupon `seats - 1` × 10%.
- **Computed app-side**: subscription rimane a quantity, ma usiamo `unit_amount` custom via `tax_behavior` (complex, sconsigliato).

**Default proposto**: tier pricing su Stripe Price (più pulito, dichiarativo). Richiede 2 Stripe Price ID per piano: `base_tiered`, `pro_tiered`. Configurati a mano in dashboard, salvati in `plans.stripe_price_id`.

### Q7 — Founder pricing: come operare lo sconto 10% sulla 1° sede
Volume discount standard è "dalla 2° sede in poi". Per founder vogliamo 10% ANCHE sulla 1° sede.
- Coupon Stripe dedicato `founder_10` applicato a sub.
- Oppure tier pricing custom per founder (Price ID alternativo).

**Default proposto**: coupon Stripe `founder_10` (forever) + flag `is_founder` su tenant per UI/analytics. Webhook valida che il coupon è applicato.

### Q8 — Add-on UI / Edge function
Spec dice "schema predisposto ma vuoto, no UI oggi". Confermi che Edge function `stripe-update-seats` NON va modificata in questa fase, e che `subscription_items` multi-line resta fuori scope?

**Default proposto**: sì, scope = solo schema. Modifiche flusso Stripe = sessione separata.

### Q9 — RLS su `addons`
Tabella lookup pubblica (come `plans`)? O scoped (ma scoped a cosa, non hanno tenant_id)?

**Default proposto**: SELECT open `TO authenticated`, INSERT/UPDATE/DELETE solo via service_role (admin-only via Edge function). Stesso pattern di `plans`.

---

## 5. Rischi

| Rischio | Impatto | Mitigation |
|---|---|---|
| CHECK constraint rename su `plan` mentre tenants attivi | basso (idempotente, atomic DDL) | DROP poi ADD in transazione |
| Frontend legge `tenant.plan` come string letterale 'pro' | medio | grep su codebase prima di seed: nessun confronto literal == 'pro' assunto |
| `get_user_tenants` view espone `plan` text | bassa | view continua a funzionare, no change |
| Edge function `stripe-checkout` env var hardcoded | medio | refactor in step dedicato, non in DDL migration |
| Backfill `is_founder=false` per founder esistenti | alto se ci sono | enumerare manualmente i 20 founder tenant + UPDATE one-off |
| Rollout in 2 step (DDL + Stripe config) → inconsistency window | medio | seed `plans.stripe_price_id` NULL inizialmente, popolare via SQL one-off DOPO setup Stripe |

---

## 6. Helper function `activity_has_feature` (rinomino da `locationHasFeature`)

**Naming**: `location` non esiste nel codebase, usiamo `activity`. Quindi: `activity_has_feature(p_activity_id uuid, p_feature_id text) → bool`.

**Posizionamento**:
- **SQL function** in migration `<ts>_create_feature_gating_function.sql`. SECURITY INVOKER, SET search_path TO ''.
- **TS wrapper** in `src/lib/featureGating.ts`: `activityHasFeature(activityId, featureId): Promise<boolean>` chiama l'RPC.
- **Hook React** opzionale: `useActivityFeature(activityId, featureId)` con cache (TanStack Query? altrimenti ad hoc).

**Firma SQL**:
```sql
CREATE OR REPLACE FUNCTION public.activity_has_feature(
  p_activity_id uuid,
  p_feature_id text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_effective_plan text;
  v_features jsonb;
BEGIN
  SELECT COALESCE(a.plan_override, t.plan)
    INTO v_effective_plan
  FROM public.activities a
  JOIN public.tenants t ON t.id = a.tenant_id
  WHERE a.id = p_activity_id;

  IF v_effective_plan IS NULL THEN
    RETURN false;
  END IF;

  SELECT features_json INTO v_features
  FROM public.plans WHERE code = v_effective_plan;

  RETURN COALESCE((v_features ->> p_feature_id)::boolean, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.activity_has_feature(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activity_has_feature(uuid, text) TO authenticated;
```

**Test**:
- Vitest unit test su wrapper TS con mock supabase.invoke.
- SQL test diretto: tenant base + no override → feature `table_ordering` ritorna false. tenant pro → true. tenant base + override='pro' → true.

---

## 7. Out of scope (esplicitamente NON in questa migration)

- Refactor Edge function `stripe-checkout` per leggere price da DB.
- Refactor Edge function `stripe-update-seats` per multi-line items (add-on).
- UI wizard scelta piano.
- UI marketplace add-on.
- Implementazione volume discount come Stripe tier pricing.
- Setup founder coupon `founder_10` su Stripe.

Tutto sopra → sessione/migration successive.

---

## 8. Prossimo step

Attendo OK utente su:
1. Risposte alle 9 open question (anche solo "default proposto OK su tutte" va bene).
2. Conferma ordine migration 1→9.
3. Conferma scope (DDL + helper SQL only, no Edge / no UI).

Solo dopo procedo con creazione file migration veri.
