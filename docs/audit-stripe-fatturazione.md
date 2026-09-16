# Audit Stripe — readiness fatturazione elettronica SdI

Data: 2026-09-12. Ricognizione **sola lettura** via Stripe MCP (spec `2026-08-26.preview`), Supabase MCP staging, Supabase Management API (query SELECT) per produzione, grep del codice edge functions. Nessuna scrittura eseguita su Stripe, DB o codice.

Account letti:
- **Sandbox**: `acct_1TL1tgDdckufFmL4` — "Sandbox di CataloGlobe" (`livemode=false`)
- **Live**: `acct_1TL1tUDs7VBKdqCU` — "CataloGlobe" (`livemode=true`)

Importi in centesimi di euro salvo indicazione. Timestamp Unix convertiti in UTC tra parentesi.

---

## FATTI

### 1. Account / business profile

**F1 — Sandbox account** (`GET /v1/accounts/acct_1TL1tgDdckufFmL4`)
- `business_profile.name`: `Sandbox di CataloGlobe`
- `business_type`: `individual`
- `country`: `IT`, `default_currency`: `eur`
- `charges_enabled`: `true`, `payouts_enabled`: `true`, `details_submitted`: `true`
- `company.name`: `Sandbox di CataloGlobe`, `company.tax_id_provided`: `true`, `company.id_number`: `000000000`, `company.registration_number`: `000000000`
- `company.address`: `address_full_match, San Francisco, CA 94103, IT` (dati fittizi di test)
- `individual`: `Steve Powell`, nazionalità IT, `verification.status = verified`
- `settings.invoices.default_account_tax_ids`: `null`
- `settings.invoices.hosted_payment_method_save`: `offer`
- `settings.dashboard.timezone`: `Etc/UTC`
- `settings.payments.statement_descriptor`: `SANDBOX DI CATALOGLOBE`; `card_payments.statement_descriptor_prefix`: `null`
- `settings.payouts.schedule`: `daily`, `delay_days=3`
- `external_accounts`: 1 bank account `ba_1TYBc2DdckufFmL4hwSierVO` (YETTEL BANK AD, IT, `status=verified`, last4 3456)
- `capabilities` attive: amazon_pay, bancontact, blik, card, eps, kakao_pay, klarna, link, mb_way, naver_pay, payco, pix, samsung_pay, transfers; `cartes_bancaires_payments=pending`
- `created`: 1775915308 (2026-04-11 13:48 UTC); `tos_acceptance.date`: 1779050881

**F2 — Live account** (`GET /v1/accounts/acct_1TL1tUDs7VBKdqCU`)
- `business_profile.name`: `CataloGlobe`
- `business_profile.support_phone`: `+393450699811`, `support_email`: `null`, `support_address`: `null`, `url`: `https://cataloglobe.com`
- `business_type`: `individual`
- `country`: `IT`, `default_currency`: `eur`
- `charges_enabled`: `true`, `payouts_enabled`: `true`, `details_submitted`: `true`
- `company.name`: **`null`**
- `company.tax_id_provided`: **`false`**
- `company.address`: `Via Giuseppe Verdi 30, Cinisello Balsamo, MI 20092, IT`
- `individual`: `Alessandro D'Elia`, `email admin@cataloglobe.com`, `relationship.representative=true`, `owner=false`, `percent_ownership=null`
- `individual.verification.status`: **`unverified`**, `details`: `"Provided identity information could not be verified"`, `details_code`: `failed_keyed_identity`
- `requirements.currently_due`: `[]`, `past_due`: `[]`, `disabled_reason`: `null`
- `settings.invoices.default_account_tax_ids`: **`null`**
- `settings.invoices.hosted_payment_method_save`: `offer`
- `settings.dashboard.timezone`: `Europe/Rome`
- `settings.payments.statement_descriptor`: `CATALOGLOBE`; `card_payments.statement_descriptor_prefix`: `CATALOGLB`
- `settings.payouts.schedule`: `weekly`, `weekly_anchor=monday`, `delay_days=3`
- `settings.branding`: icon/logo/colors tutti `null`
- `external_accounts`: 1 bank account `ba_1TYBQ7Ds7VBKdqCUAhybhLHx` (REVOLUT PAYMENTS UAB, country **`LT`**, routing `REVOLT21`, last4 9861, `status=new`, `account_holder_name=null`)
- `capabilities` attive: come sandbox + `revolut_pay_payments=active`; `cartes_bancaires_payments=pending`
- `created`: 1775915296 (2026-04-11 13:48 UTC)

**F3 — Product description** identica nei due account: "CataloGlobe è una piattaforma SaaS B2B in abbonamento ricorrente mensile … rivolto a piccole e medie imprese italiane con Partita IVA …". MCC `5734` in entrambi.

### 2. Products e Prices

**F4 — Products sandbox** (`GET /v1/products`, 4 risultati)

| id | name | active | default_price | tax_code |
|---|---|---|---|---|
| `prod_UegYbIDXXC9jAv` | CataloGlobe Pro | true | `price_1TfmT4DdckufFmL4wOm8TeVM` | `txcd_10103000` |
| `prod_UegRxTngkN8HJl` | CataloGlobe Base | true | `price_1TfmRsDdckufFmL4zpU8hGou` | `txcd_10103000` |
| `prod_UQ3Bgcz9EYEPQI` | myproduct ("created by Stripe CLI") | false | null | null |
| `prod_UJfMyNHKqAW81J` | CataloGlobe Pro (legacy, "Piano professionale CataloGlobe") | false | `price_1TLgKmDdckufFmL4zMLH9gLR` | null |

Più un product **non listato** da `GET /v1/products` ma recuperato per id: `prod_Umr7MQJ7uQhkpJ` "Sedi aggiuntive (prorata fino al rinnovo)", `active=false`, `tax_code=null`, creato 1782648100 (2026-06-28) — generato da invoice item one-off (vedi F27).

**F5 — Products live** (`GET /v1/products`, 2 risultati)

| id | name | active | default_price | tax_code |
|---|---|---|---|---|
| `prod_UegYbIDXXC9jAv` | CataloGlobe Pro | true | `price_1TfmHqDs7VBKdqCUkXAV5nIp` | `txcd_10103000` |
| `prod_UegRxTngkN8HJl` | CataloGlobe Base | true | `price_1TfmBGDs7VBKdqCUCV4DnNu9` | `txcd_10103000` |

Gli id product coincidono tra sandbox e live (stesso id `prod_Ueg…` in entrambi gli ambienti).

**F6 — Prices sandbox** (`GET /v1/prices?expand[]=data.tiers`, 7 risultati)

| id | nickname | lookup_key | active | currency | interval | billing_scheme | tiers_mode | tax_behavior | tiers (up_to / unit_amount / flat_amount) |
|---|---|---|---|---|---|---|---|---|---|
| `price_1TfmT4DdckufFmL4wOm8TeVM` | Pro mensile per sede — sconto 10% dalla 2ª · IVA inclusa (regime forfettario) | `pro_monthly_tax_inclusive` | true | eur | month ×1 | tiered | graduated | **inclusive** | [1 / 5900 / null], [∞ / 5310 / null] |
| `price_1TfmRsDdckufFmL4zpU8hGou` | Base mensile per sede — sconto 10% dalla 2ª · IVA inclusa (regime forfettario) | `base_monthly_tax_inclusive` | true | eur | month ×1 | tiered | graduated | **inclusive** | [1 / 3900 / null], [∞ / 3510 / null] |
| `price_1TfNBnDdckufFmL4kOtEROcx` | Pro mensile per sede, sconto 10% dalla seconda sede | `pro_monthly` | false | eur | month ×1 | tiered | graduated | exclusive | [1 / 5900], [∞ / 5310] |
| `price_1TfN55DdckufFmL4WrFi9XSv` | Base mensile per sede, sconto 10% dalla seconda sede | `base_monthly` | false | eur | month ×1 | tiered | graduated | exclusive | [1 / 3900], [∞ / 3510] |
| `price_1TRD4uDdckufFmL4cFkSXx8E` | null (product `myproduct`) | null | **true** | **usd** | month ×1 | per_unit | – | unspecified | unit_amount 1500 |
| `price_1TLgKmDdckufFmL4zMLH9gLR` | null (product legacy `prod_UJfM…`) | null | **true** | eur | month ×1 | tiered | **volume** | unspecified | [3 / 3900], [10 / 2900], [25 / 1900], [∞ / 1900] |
| `price_1TL21sDdckufFmL4k6tAbFiF` | null (product legacy `prod_UJfM…`) | null | false | eur | month ×1 | per_unit | – | unspecified | unit_amount 2900 |

Tutti: `recurring.usage_type=licensed`, `trial_period_days=null`, `transform_quantity=null`.

**F7 — Prices live** (`GET /v1/prices?expand[]=data.tiers`, 4 risultati)

| id | nickname | lookup_key | active | currency | interval | billing_scheme | tiers_mode | tax_behavior | tiers |
|---|---|---|---|---|---|---|---|---|---|
| `price_1TfmHqDs7VBKdqCUkXAV5nIp` | Pro mensile per sede — sconto 10% dalla 2ª · IVA inclusa (regime forfettario) | `pro_monthly_tax_inclusive` | true | eur | month ×1 | tiered | graduated | **inclusive** | [1 / 5900 / null], [∞ / 5310 / null] |
| `price_1TfmBGDs7VBKdqCUCV4DnNu9` | Base mensile per sede — sconto 10% dalla 2ª · IVA inclusa (regime forfettario) | `base_monthly_tax_inclusive` | true | eur | month ×1 | tiered | graduated | **inclusive** | [1 / 3900 / null], [∞ / 3510 / null] |
| `price_1Tfgt4Ds7VBKdqCUwmHvjSmf` | Pro mensile per sede, sconto 10% dalla seconda sede | `pro_monthly` | false | eur | month ×1 | tiered | graduated | exclusive | [1 / 5900], [∞ / 5310] |
| `price_1TfglsDs7VBKdqCU5sz1QS9Q` | Base mensile per sede, sconto 10% dalla seconda sede | `base_monthly` | false | eur | month ×1 | tiered | graduated | exclusive | [1 / 3900], [∞ / 3510] |

Nessun price legacy/USD in live.

### 3. Webhook endpoints

**F8 — Sandbox** (`GET /v1/webhook_endpoints`, 2 risultati)

| id | url | status | api_version | enabled_events |
|---|---|---|---|---|
| `we_1TL2XhDdckufFmL4aqzVXC2g` | `https://lxeawrpjfphgdspueiag.supabase.co/functions/v1/stripe-webhook` | **enabled** | `2026-03-25.dahlia` | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded` |
| `we_1TQkqtDdckufFmL4lNOvP6Om` | `https://qomnpzerhbtstbnwxnqc.supabase.co/functions/v1/stripe-webhook` | **disabled** | `2026-03-25.dahlia` | stessi 5 eventi |

Description del secondo: "Webhook dedicato all'ambiente di produzione. Sandbox condiviso con staging — ogni evento viene consegnato a entrambi gli ambienti, gli eventi cross-env vengono ignorati silenziosamente dalla Edge Function."

**F9 — Live** (`GET /v1/webhook_endpoints`, 1 risultato)

| id | url | status | api_version | enabled_events |
|---|---|---|---|---|
| `we_1TfhIbDs7VBKdqCUyDs4JDNJ` | `https://qomnpzerhbtstbnwxnqc.supabase.co/functions/v1/stripe-webhook` | enabled | `2026-03-25.dahlia` | stessi 5 eventi |

**F10 — Verifica esplicita dei 5 eventi richiesti**: tutti presenti su tutti e 3 gli endpoint. Nessun evento mancante fra i 5.

**F11 — Copertura codice** (`supabase/functions/stripe-webhook/index.ts`, `switch (event.type)` righe 325–501): gestisce esattamente `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`; `default` → log "Ignoring unhandled event type". Nessun evento abilitato è non gestito, nessun evento gestito è non abilitato.

**F12 — API version SDK vs endpoint**: il codice usa `apiVersion: "2025-04-30.basil"` (`_shared/stripe-helpers.ts:37`); gli endpoint webhook sono a `2026-03-25.dahlia`.

### 4. Impostazioni fattura a livello account

**F13 — Numerazione**: l'API non espone la configurazione di numerazione. Osservato sui campioni:
- Sandbox: `number` = `6UIOH59D-0098` … `6UIOH59D-0110`, stesso prefisso su customer diversi (`cus_VDxM…`, `cus_VBBJ…`, `cus_UoOg…`).
- Live: `number` = `TAOFUNBL-0003` … `TAOFUNBL-0012`, stesso prefisso su customer diversi (`cus_VEjD…`, `cus_V8z6…`, `cus_Ulgw…`).
- Prefisso 8 caratteri alfanumerici random, non impostato manualmente.

**F14 — days_until_due**: su tutte le subscription lette `days_until_due=null`, `collection_method=charge_automatically`. Su tutte le invoice lette `due_date=null`.

**F15 — Footer**: `invoice.footer=null` su tutte le 20 invoice lette; `subscription.invoice_settings.footer=null` su tutte le subscription; `custom_fields=null`; `description=null`.

**F16 — Dati aziendali sulle Invoice**: campo `account_name` = `Sandbox di CataloGlobe` / `CataloGlobe`; `account_tax_ids=null` su **tutte** le invoice di entrambi gli ambienti. `account_country=IT`. `issuer={type:self}`.

**F17 — Rendering**: `rendering=null` su tutte le invoice da subscription; sulla sola one-off sandbox (`in_1U8K0oDdckufFmL4cB8VuLPy`) `rendering.pdf.page_size=letter`, `amount_tax_display=null`.

### 5. Tax

**F18 — Tax settings sandbox** (`GET /v1/tax/settings`): `status=active`, `defaults.tax_behavior=null`, `defaults.tax_code=txcd_10000000`, `head_office.address.line1` = `"CataloGlobe di D'Elia Alessandro Sede legale: Via Verdi, 30, 20092 Cinisello Balsamo (MI), Italia Partita IVA: 14689790963 Codice REA: MI-2801544 Email privacy: privacy@cataloglobe.com PEC: alessandro.delia@pec.fiscozen.it"` (intero blocco legale in un solo campo), city `Cinisello Balsamo`, postal_code `20092`, state `MI`, country `IT`.

**F19 — Tax settings live**: `status=active`, `defaults.tax_behavior=inferred_by_currency`, `defaults.tax_code=txcd_10000000`, `head_office.address` = `Via Giuseppe Verdi 30, Cinisello Balsamo, MI 20092, IT`.

**F20 — Tax registrations**: sandbox 1 registrazione `taxreg_1Tfg0KDdckufFmL4r3Vb39C2` country IT, `type=standard`, `place_of_supply_scheme=small_seller`, `active_from` 1780836040 (2026-06-07), `expires_at` 1780911136 (2026-06-08), **`status=expired`**. Live: **0 registrazioni**.

**F21 — automatic_tax sulle subscription**: live 10 subscription → 8 con `automatic_tax.enabled=false`, 2 con `enabled=true, liability.type=self` (`sub_1TfiVcDs7VBKdqCUt4eSNVOZ`, `sub_1TfhnmDs7VBKdqCU3qfce6nn`, entrambe canceled, su price legacy `exclusive`). Sandbox 18 → 17 `false`, 1 `true` (`sub_1TfiIvDdckufFmL42Ob6wPbI`, canceled). Su tutte le invoice lette `automatic_tax.enabled=false`, `total_taxes=[]`, `default_tax_rates=[]`, `customer_tax_exempt=none`.

**F22 — Checkout code**: `stripe-checkout/index.ts:426` `automatic_tax: { enabled: false }`, `:432` `tax_id_collection: { enabled: false }`, `:431` `billing_address_collection: "auto"`. Tax id impostato lato server via `customers.createTaxId(customerId, {type:"eu_vat", value})` best-effort non bloccante (`ensureCustomerTaxId`, righe 135–150). Metadata customer: `tenant_id, legal_entity_type, legal_name, first_name, last_name, fiscal_code, vat_number, codice_destinatario, pec` (`buildCustomerMetadata`, riga 102).

**F23 — customer_tax_ids sulle invoice**: tutte le invoice lette hanno `customer_tax_ids=[{type:eu_vat, value:…}]`. Valori osservati: `IT12345678911` (16 invoice su 20, sia sandbox che live, su customer con nomi diversi: Mario Rossi, Beatrice Cricca, Ristorante Da Mario S.r.l., Studio Rossi, Lorenzo Calzi, DEMO SRL, La Prosciutteria - DEMO SRL, Ristorante Borsieri SRL, La Casa Iberica SRL, Alessandro D'Elia); `IT14689790963` (4 invoice live: customer `CataloGlobe Demo SRL` ×3, `CataloGlobe di D'Elia Alessandro` ×1).

### 6. Customer portal

**F24 — Sandbox** `bpc_1TL2wZDdckufFmL46szBllF3` (`is_default=true`, `active=true`, name `Default`, created 2026-04-11):
- `customer_update.enabled=true`, `allowed_updates=["name","email","address","phone"]` — **`tax_id` NON incluso**
- `invoice_history.enabled=true`
- `payment_method_update.enabled=true`
- `subscription_cancel.enabled=true`, `mode=at_period_end`, `proration_behavior=none`, `cancellation_reason.enabled=true`, options `too_expensive, switched_service, unused, other`
- `subscription_update.enabled=false`, `default_allowed_updates=[]`
- `subscription_pause.enabled=false`
- `login_page.enabled=false`, `default_return_url=null`, `business_profile.{headline,privacy_policy_url,terms_of_service_url}=null`

**F25 — Live** `bpc_1UBsrHDs7VBKdqCURnDMmXK5` (created 1788511947 = 2026-09-04): configurazione **identica** a F24 campo per campo.

**F26 — Portal code**: `stripe-portal/index.ts:88` crea la sessione con solo `customer` + `return_url` (nessun `configuration`, nessun `flow_data`) → usa la configurazione default.

### 7. Coupon e promotion code

**F27 — Sandbox coupons** (`GET /v1/coupons`):
| id | name | percent_off | duration | max_redemptions | times_redeemed | valid |
|---|---|---|---|---|---|---|
| `v9HZwcwQ` | Test sconto permanente 20% | 20 | forever | null | 1 | true |
| `lQDaLjdj` | Primo mese gratis | 100 | once | null | 3 | true |

Promotion codes sandbox: `promo_1Tgjv7DdckufFmL4NiTGpAVd` code `GLOBEFREE` → coupon `lQDaLjdj`, active, `first_time_transaction=true`, times_redeemed 3.

**F28 — Live coupons**:
| id | name | percent_off | duration | duration_in_months | max_redemptions | times_redeemed | valid |
|---|---|---|---|---|---|---|---|
| `XA3phuge` | FREE 100% (INTERNAL 2) | 100 | forever | – | 10 | 4 | true |
| `ugkm7tAw` | Tre mesi gratis | 100 | repeating | 3 | null | 0 | true |
| `GZJgU64K` | Primo mese gratis | 100 | once | – | null | 0 | true |
| `DXauu54k` | FREE 100% (INTERNAL) | 100 | forever | – | 5 | 5 | **false** (esaurito) |

Promotion codes live:
| id | code | coupon | active | max_redemptions | times_redeemed | first_time_transaction |
|---|---|---|---|---|---|---|
| `promo_1TlFmtDs7VBKdqCUusB1Qafm` | `INTERNAL_TEST_2` | `XA3phuge` | true | 10 | 4 | true |
| `promo_1TlA8QDs7VBKdqCUC89iUa5l` | `GLOBEFREE3` | `ugkm7tAw` | true | 20 | 0 | true |
| `promo_1Tgk3fDs7VBKdqCUQjrKlma4` | `GLOBEFREE` | `GZJgU64K` | true | null | 0 | true |
| `promo_1TfhW0Ds7VBKdqCUfvupqSqx` | `INTERNAL_TEST` | `DXauu54k` | false | 5 | 5 | false |

### 8. Subscription

**F29 — Live** (`GET /v1/subscriptions?status=all`, 10 risultati, `has_more=false`)

| id | status | quantity | price | trial_end | cancel_at_period_end | discount | tenant_id (metadata) |
|---|---|---|---|---|---|---|---|
| `sub_1UEFodDs7VBKdqCUqWxJw6ph` | **trialing** | 1 | Pro live | 1791668816 (2026-10-10) | **true** (`cancel_at`=trial_end, `canceled_at` 2026-09-10 21:50, 4 min dopo la creazione) | – | `a66185c1-…` |
| `sub_1U8h9pDs7VBKdqCUxC1iSNSh` | active | **4** | Pro live | null | false | `INTERNAL_TEST_2` | `1fb83b1f-…` |
| `sub_1Tm9ZZDs7VBKdqCUwtcelf4M` | active | **100** | Pro live | null | false | `INTERNAL_TEST_2` | `411e7ac7-…` |
| `sub_1TlG33Ds7VBKdqCUAeJ4ZwMD` | canceled | 1 | Pro live | null | true (ended 1784758222) | INTERNAL_TEST_2 | `bcd6640e-…` |
| `sub_1TlFrIDs7VBKdqCURxTL725s` | canceled | 1 | Pro live | null | true | INTERNAL_TEST_2 | `d70ea52a-…` |
| `sub_1TlFG6Ds7VBKdqCUjox4kqI9` | canceled | 1 | Pro live | null | true | INTERNAL_TEST | `b801574a-…` |
| `sub_1TlFELDs7VBKdqCUaO3KN6Z2` | canceled | 5 | Pro live | null | true | INTERNAL_TEST | `15ba1a4a-…` |
| `sub_1TfmdPDs7VBKdqCUj98R7Muj` | canceled | 1 | Base live | null | false | INTERNAL_TEST | `9eb09f0f-…` |
| `sub_1TfiVcDs7VBKdqCUt4eSNVOZ` | canceled | 1 | `price_1TfglsDs7VBKdqCU5sz1QS9Q` (Base legacy exclusive, inactive) | null | false | INTERNAL_TEST | `40e38a98-…` |
| `sub_1TfhnmDs7VBKdqCU3qfce6nn` | canceled | 1 | Base legacy exclusive | null | false | INTERNAL_TEST | `a32c0540-…` |

Conteggio live: active 2, trialing 1, canceled 7. **Nessuna subscription live senza coupon 100% tranne la trialing** (`discounts=[]`). Tutte `billing_mode.type=classic`, `trial_settings.end_behavior.missing_payment_method=create_invoice`.

**F30 — Sandbox** (18 risultati, `has_more=false`): active 12, canceled 4, incomplete_expired 1, trialing 1 (`sub_1UDVSKDdckufFmL4jkuh4y9c`, qty 2, trial_end 1791490643 = 2026-10-08). Quantity osservate: 1 (×10), 2 (×2), 3 (×3), 4 (×3), 5 (×1). 6 subscription con `cancel_at_period_end=true` ma ancora `active`. Un solo tenant (`b5cbb483-…`) ha 5 subscription (1 active, 1 incomplete_expired, 3 canceled) — 2 di queste con `metadata.plan_code` vuoto. 1 subscription attiva con coupon (`sub_1TkOZvDdckufFmL4UrsEvt6p`, `v9HZwcwQ` 20% forever).

**F31 — Trial in codice**: `stripe-checkout/index.ts:38` `TRIAL_PERIOD_DAYS = 30`, applicato solo se `isFirstSubscription` (riga 420). Nessun `trial_period_days` sui Price.

### 9. Invoice (10 più recenti per ambiente)

**F32 — Live** (`GET /v1/invoices?limit=10`, `has_more=true`)

| number | id | status | billing_reason | customer_name | subtotal | discount | total | lines (qty × desc · period) |
|---|---|---|---|---|---|---|---|---|
| TAOFUNBL-0012 | `in_1UEFo4Ds7VBKdqCUowdH2kiz` | paid | subscription_create | Mario Rossi | 0 | – | 0 | 1 × "Periodo di prova per CataloGlobe Pro" · 2026-09-10 → 2026-10-10 |
| TAOFUNBL-0011 | `in_1U8h8bDs7VBKdqCUmXvD1QHH` | paid | subscription_create | Alessandro D'Elia | 21830 | 21830 | 0 | 1 × Pro Tier 1 €59.00 (5900) + 3 × Pro Tier 2 €53.10 (15930) · 2026-08-26 → 2026-09-26 |
| TAOFUNBL-0010 | `in_1U8GebDs7VBKdqCUuhdSpHdo` | paid | **subscription_cycle** | CataloGlobe Demo SRL | 531590 | 531590 | 0 | 1 × Tier 1 (5900) + 99 × Tier 2 (525690) · 2026-08-25 → 2026-09-25 |
| TAOFUNBL-0009 | `in_1Tx1s0Ds7VBKdqCUUQkPjfLB` | paid | subscription_cycle | CataloGlobe Demo SRL | 531590 | 531590 | 0 | idem · 2026-07-25 → 2026-08-25 |
| TAOFUNBL-0008 | `in_1Tm9ZGDs7VBKdqCU00Xr6uki` | paid | subscription_create | CataloGlobe Demo SRL | 27140 | 27140 | 0 | 1 × Tier 1 (5900) + 4 × Tier 2 (21240) · 2026-06-25 → 2026-07-25 |
| TAOFUNBL-0007 | `in_1TlG2sDs7VBKdqCUfw2QJgrF` | paid | subscription_create | DEMO SRL | 5900 | 5900 | 0 | 1 × Tier 1 |
| TAOFUNBL-0006 | `in_1TlFr2Ds7VBKdqCUpRlTtNwL` | paid | subscription_create | La Prosciutteria - DEMO SRL | 5900 | 5900 | 0 | 1 × Tier 1 |
| TAOFUNBL-0005 | `in_1TlFFmDs7VBKdqCUzZdfrnFe` | paid | subscription_create | Ristorante Borsieri SRL | 5900 | 5900 | 0 | 1 × Tier 1 |
| TAOFUNBL-0004 | `in_1TlFDqDs7VBKdqCULxoXHp9P` | paid | subscription_create | La Casa Iberica SRL | 27140 | 27140 | 0 | 1 × Tier 1 + 4 × Tier 2 |
| TAOFUNBL-0003 | `in_1TfmdEDs7VBKdqCUp9UlaQ1g` | paid | subscription_create | CataloGlobe di D'Elia Alessandro | 3900 | 3900 | 0 | 1 × Base Tier 1 €39.00 |

**Tutte le 10 invoice live hanno `total=0` e `amount_paid=0`.** Nessuna con `proration=true`. Tutte `status=paid`, `attempt_count=0`. Nessuna in stato `open`, `void`, `uncollectible`, `draft`. Il numero massimo osservato (`0012`) indica 12 invoice live totali emesse (interpretazione: numerazione sequenziale account-level).

**F33 — Sandbox** (`GET /v1/invoices?limit=10`, `has_more=true`)

| number | id | status | billing_reason | customer_name | subtotal | total | lines · period |
|---|---|---|---|---|---|---|---|
| 6UIOH59D-0110 | `in_1UDVSJDdckufFmL42jeT7jeo` | paid | subscription_create | Beatrice Cricca | 0 | 0 | "Periodo di prova per CataloGlobe Pro" · 2026-09-08 → 2026-10-08 |
| 6UIOH59D-0106 | `in_1UAowsDdckufFmL4bkhgnCTF` | paid | subscription_create | Mario Rossi | 5900 | 5900 | 1 × Pro Tier 1 · 2026-09-01 → 2026-10-01 |
| 6UIOH59D-0105 | `in_1UAooZDdckufFmL4BIFNMgj9` | paid | subscription_create | Mario Rossi | 5900 | 5900 | 1 × Pro Tier 1 |
| 6UIOH59D-0104 | `in_1UAVVRDdckufFmL4ZwAJtW8j` | paid | subscription_create | Mario Rossi | 5900 | 5900 | 1 × Pro Tier 1 |
| 6UIOH59D-0103 | `in_1UAQsxDdckufFmL4wacY2LBs` | paid | subscription_create | Mario Rossi | 5900 | 5900 | 1 × Pro Tier 1 |
| 6UIOH59D-0102 | `in_1UABuuDdckufFmL4ha9PAZqV` | paid | subscription_create | Ristorante Da Mario S.r.l. | 5900 | 5900 | 1 × Pro Tier 1 |
| 6UIOH59D-0101 | `in_1U9kxwDdckufFmL4NnuiwF0l` | paid | subscription_create | Mario Rossi | 5900 | 5900 | 1 × Pro Tier 1 |
| 6UIOH59D-0100 | `in_1U9LVODdckufFmL4q6VWBBu7` | paid | subscription_create | Studio Rossi | 5900 | 5900 | 1 × Pro Tier 1 |
| 6UIOH59D-0099 | `in_1U96GnDdckufFmL4Dlkoav3G` | paid | subscription_create | Studio Rossi | 5900 | 5900 | 1 × Pro Tier 1 |
| 6UIOH59D-0098 | `in_1U8K0oDdckufFmL4cB8VuLPy` | paid | **manual** | Lorenzo Calzi | 5294 | 5294 | 1 × "Sedi aggiuntive (prorata fino al rinnovo)" · period start=end=1787663014; `invoice.period_start` 1787654803 → `period_end` 1790333203; `parent=null`; line `parent.type=invoice_item_details`, `proration=false`; `pricing.price=price_1U8JzfDdckufFmL4jLccpB0K`, product `prod_Umr7MQJ7uQhkpJ` |

Buchi di numerazione: 0107, 0108, 0109 assenti dai 10 più recenti (invoice `void`/`draft` non listate o creazione fuori ordine — non verificato).

**F34 — Tipi di documento osservati** (sui 20 campioni): `subscription_create` (17, di cui 2 trial a €0), `subscription_cycle` (2, solo live, entrambe €0 per coupon 100%), `manual` (1, sandbox, one-off "Sedi aggiuntive"). Nessuna `subscription_update`, nessuna riga con `proration=true`, nessuna `subscription_threshold`, nessun `from_invoice`/`latest_revision`.

**F35 — One-off in codice** (`_shared/stripe-helpers.ts:228 chargeOneOffSeatDelta`): `invoices.create({customer, auto_advance:false, collection_method:"charge_automatically"})` → `invoiceItems.create({customer, invoice, amount, currency, description})` (importo piatto, nessun `price`, nessun `tax_rates`, nessun `period`) → `invoices.pay()`; su fallimento `voidInvoice`. `stripe-change-subscription` usa `proration_behavior: "always_invoice"` in 7 punti e `"none"` in 10 punti; `invoices.createPreview` per i preview.

### 10. Credit note

**F36** — `GET /v1/credit_notes`: **0** in sandbox, **0** in live.

### 11. DB — `plans.stripe_price_id`

**F37 — Staging** (`lxeawrpjfphgdspueiag`, `select * from plans`):
| code | monthly_price_cents | stripe_price_id | updated_at |
|---|---|---|---|
| base | 3900 | `price_1TfmRsDdckufFmL4zpU8hGou` | 2026-07-28 18:51 |
| pro | 5900 | `price_1TfmT4DdckufFmL4wOm8TeVM` | 2026-07-28 18:51 |

Entrambi esistono nel **sandbox** e sono `active=true` (F6). Altre colonne: `volume_discount_threshold=2`, `volume_discount_percent=10`, `max_self_service_seats=5`, `is_public=true`. Nessuna colonna `stripe_product_id`.

**F38 — Produzione** (`qomnpzerhbtstbnwxnqc`, via Management API `POST /v1/projects/{ref}/database/query`, SELECT):
| code | monthly_price_cents | stripe_price_id | updated_at |
|---|---|---|---|
| base | 3900 | `price_1TfmBGDs7VBKdqCUCV4DnNu9` | 2026-08-26 09:37 |
| pro | 5900 | `price_1TfmHqDs7VBKdqCUkXAV5nIp` | 2026-08-26 09:37 |

Entrambi esistono nel **live** e sono `active=true` (F7). **Non NULL.**

**F39** — Tabella `addons`: 0 righe sia in staging che in produzione.

**F40** — `tenants.subscription_status` produzione: `active` 6, `trialing` 1 (7 tenant con status). Stripe live ha 2 active + 1 trialing (F29).

**F41** — Anon key produzione (`.env.production`) su `GET /rest/v1/plans` → `42501 permission denied for table plans`.

---

## DIVERGENZE

### Sandbox vs Live (Stripe)

**D1 — Identità fiscale account.** Sandbox `company.tax_id_provided=true` (placeholder `000000000`), live `company.tax_id_provided=false`, `company.name=null`. Il rappresentante live è `unverified` (`failed_keyed_identity`) ma `requirements` vuoti e `charges_enabled=true`.

**D2 — Tax settings.** Sandbox `head_office.address.line1` contiene l'intero blocco legale (ragione sociale, P.IVA 14689790963, REA, PEC) concatenato in un campo indirizzo; live ha solo `Via Giuseppe Verdi 30`. `defaults.tax_behavior`: sandbox `null`, live `inferred_by_currency`.

**D3 — Tax registrations.** Sandbox 1 (IT, `small_seller`, expired dopo ~21h); live 0.

**D4 — Timezone dashboard.** Sandbox `Etc/UTC`, live `Europe/Rome`. Impatta la data locale stampata sulle invoice e il boundary giornaliero.

**D5 — Payout schedule.** Sandbox daily, live weekly (monday). Bank account live è LT (Revolut) con `status=new` e `account_holder_name=null`; sandbox IT verified.

**D6 — Statement descriptor.** Live ha `card_payments.statement_descriptor_prefix=CATALOGLB`; sandbox `null`.

**D7 — Product/Price residui.** Sandbox ha 2 product inattivi (`myproduct` CLI, Pro legacy) con **2 price ancora `active=true`** (`price_1TRD4uDdckufFmL4cFkSXx8E` USD 15.00, `price_1TLgKmDdckufFmL4zMLH9gLR` tiered volume) + product ad-hoc `prod_Umr7MQJ7uQhkpJ`. Live pulito (2 product, 4 price).

**D8 — Webhook.** Sandbox ha un secondo endpoint `disabled` verso l'URL di produzione. Live 1 solo endpoint. `api_version` endpoint `2026-03-25.dahlia` vs SDK `2025-04-30.basil` (uguale in entrambi gli ambienti — divergenza codice↔Stripe, non sandbox↔live).

**D9 — Coupon.** Sandbox: 2 coupon (20% forever test, 100% once). Live: 4 coupon tutti 100%, 2 "INTERNAL" (uno esaurito). Il `GLOBEFREE` esiste in entrambi ma con coupon id diversi (`lQDaLjdj` vs `GZJgU64K`); live ha in più `GLOBEFREE3` (3 mesi).

**D10 — Portal config.** Identica campo per campo (F24/F25). Nessuna divergenza. Creata in live solo il 2026-09-04.

**D11 — Volume/invoice reali.** Sandbox ~110 invoice numerate, con importi > 0 pagati (test card). Live 12 invoice, **tutte a totale €0** (trial o coupon 100%). Live non ha ancora mai emesso una fattura con importo > 0.

**D12 — automatic_tax.** In entrambi gli ambienti le subscription su price legacy `exclusive` avevano `automatic_tax.enabled=true`; quelle su price `inclusive` correnti `false`. Coerente con il codice attuale (`automatic_tax: {enabled:false}`).

### Stripe vs DB

**D13 — `plans.stripe_price_id`**: staging → sandbox ✔, produzione → live ✔, tutti e 4 esistenti e attivi. Nessuna divergenza.

**D14 — Conteggio subscription attive.** DB produzione: 6 `active` + 1 `trialing`. Stripe live: 2 `active` + 1 `trialing` (+7 canceled). 4 tenant risultano `active` in DB senza subscription Stripe attiva corrispondente (non verificato per-tenant: query DB non ha incrociato `stripe_subscription_id`).

**D15 — Dati fiscali del cliente: DB vs Stripe Customer.** Il DB tenant è la fonte (`legal_name, vat_number, fiscal_code, codice_destinatario, pec, address…`, F22) e viene **pushato** a Stripe al checkout (name, address, metadata, tax id eu_vat). Il portal permette al cliente di modificare `name`, `email`, `address`, `phone` **su Stripe** senza che esista un webhook `customer.updated` abilitato né un handler (F8–F11) → dopo una modifica dal portal, Stripe Customer e DB tenant divergono silenziosamente. `tax_id` non è modificabile dal portal.

**D16 — P.IVA cliente.** 16 invoice su 20 (inclusi 8 su live) portano `customer_tax_ids = IT12345678911` su ragioni sociali diverse; 4 invoice live portano `IT14689790963` (P.IVA CataloGlobe stessa). Il tax id `eu_vat` viene creato senza validazione bloccante (F22 "never throws").

**D17 — Descrizione one-off.** Invoice `manual` sandbox: importo piatto senza `price`, senza `period` (start=end), `parent=null`, `rendering.pdf.page_size=letter`; l'invoice `period_start/period_end` copre invece il periodo di rinnovo. Nessun equivalente ancora in live.

---

## INTERPRETAZIONI (separate dai fatti)

- I1 — Le invoice Stripe attuali non riportano la P.IVA dell'emittente (`account_tax_ids=null`, `default_account_tax_ids=null`, `tax_id_provided=false` in live). Il PDF Stripe mostra solo `account_name=CataloGlobe` + l'indirizzo dell'account.
- I2 — I Price sono `tax_behavior=inclusive` con nickname "IVA inclusa (regime forfettario)": prezzo lordo = netto, nessuna riga IVA (`total_taxes=[]`). Coerente con forfettario, ma il regime non è dichiarato da nessuna parte su Stripe (no tax registration attiva, `automatic_tax=false`).
- I3 — La numerazione Stripe (prefisso random + progressivo, buchi 0107–0109 in sandbox) non è una numerazione fiscale italiana.
- I4 — Il webhook `dahlia` vs SDK `basil` implica che i payload ricevuti hanno shape più recente di quella per cui l'SDK è tipizzato (es. `invoice.parent`, `lines.pricing`), già visibile nei campioni.
- I5 — I 3 documenti "tipo" che un flusso SdI dovrebbe coprire e che Stripe già genera: (a) `subscription_create` con trial €0, (b) `subscription_cycle` rinnovo, (c) `manual` one-off prorata sedi. Non osservati ma previsti dal codice: righe con `proration=true` da `always_invoice`. Nessuna credit note mai emessa → nessun flusso di storno testato.

---

## DOMANDE APERTE

- Q1 — Configurazione **numerazione invoice** (account-level vs customer-level, prefisso custom) e **template PDF / rendering options** (A4 vs letter, memo, footer di default): non esposte dall'API Stripe letta; visibili solo da Dashboard → Settings → Invoice template. Da verificare a mano in entrambi gli ambienti.
- Q2 — **Email settings** delle invoice (invio automatico ricevute/fatture al customer): non leggibili via API.
- Q3 — **Totale invoice** e distribuzione `billing_reason` sull'intero storico (sandbox `has_more=true`, ~110): letti solo i 10 più recenti per ambiente, come richiesto. Non verificata la presenza di invoice `void`/`open`/`uncollectible` nei buchi di numerazione sandbox (0107–0109).
- Q4 — Perché il rappresentante live risulta `unverified` (`failed_keyed_identity`) senza `requirements` pendenti; se Stripe chiederà documenti prima di un payout reale (finora tutti i movimenti live sono €0).
- Q5 — Bank account live `status=new`, holder `null`, paese `LT`: mai verificato da un payout reale.
- Q6 — Corrispondenza per-tenant DB↔Stripe (D14): 4 tenant `active` in DB senza sub Stripe attiva — query incrociata `tenants.stripe_subscription_id` ↔ Stripe non eseguita in questa fase.
- Q7 — Se `IT12345678911` sia un placeholder di test o un dato inserito da tenant reali in live (8 invoice live lo portano).
- Q8 — Stato del regime fiscale reale (forfettario vs ordinario) e se è previsto un cambio: i price `inclusive` e le tax settings `small_seller` (expired) lo assumono ma nulla lo certifica.
- Q9 — Il product ad-hoc `prod_Umr7MQJ7uQhkpJ` viene ricreato ad ogni one-off o riusato? (Il codice in `chargeOneOffSeatDelta` non passa `price`/`price_data`: l'origine del product/price sull'invoice item non è chiara dal codice letto.)
