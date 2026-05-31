# SECURITY AUDIT — CataloGlobe staging

Data: 2026-05-28
Branch: `staging`
Modalita: read-only. Nessuna modifica al codice / DB / deploy.

---

## Area 1 — Database Advisors

**STATO: NON ESEGUITO**. `mcp__supabase-staging__get_advisors` ha risposto `Unauthorized. Please provide a valid access token`. Stessa cosa per `execute_sql` / `list_tables`.

Azione necessaria prima del turno 2:
```
export SUPABASE_ACCESS_TOKEN=<token>
```
(o re-auth dell'MCP `supabase-staging`).

Da rieseguire al prossimo turno:
- `get_advisors(type="security")`
- `get_advisors(type="performance")`
- Query RLS coverage (Area 2)
- Query SECURITY DEFINER grants (Area 3)

---

## Area 2 — RLS coverage

**STATO: NON ESEGUITO** (stesso blocco MCP). Da rieseguire:

```sql
SELECT relname, relrowsecurity,
       (SELECT count(*) FROM pg_policies p
        WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
FROM pg_class c
WHERE relnamespace='public'::regnamespace AND relkind='r'
ORDER BY relname;
```

Debt confermato in `CLAUDE.md`: `schedule_targets` senza `tenant_id`. RLS attuale puo essere sub-select su `schedules.tenant_id` ma resta verificato via query sopra.

---

## Area 3 — SECURITY DEFINER functions

**STATO: NON ESEGUITO**. Query da rieseguire:

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid),
       (SELECT array_agg(grantee::text ORDER BY grantee)
        FROM information_schema.routine_privileges
        WHERE routine_schema='public' AND routine_name=p.proname AND privilege_type='EXECUTE') AS grantees
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
WHERE n.nspname='public' AND p.prosecdef=true
ORDER BY p.proname;
```

Pattern atteso: per ogni SEC DEF NON destinata a `anon`/`authenticated`, vedere `service_role` solo. CLAUDE.md cita gia il rischio (Supabase pre-grant default).

---

## Area 4 — Edge Functions auth

39 edge functions totali su filesystem (la memoria progetto cita 26 → discrepanza, ordering epic ha aggiunto 13). `verify_jwt = false` su tutte (pattern progetto). Auth fatta manualmente nel corpo.

| Edge | Auth check | Note |
|---|---|---|
| delete-tenant | Bearer + `getUser` | OK |
| delete-account | Bearer + `getUser` | OK |
| delete-business | Bearer + `getUser` + membership (`owner`/`admin`) | OK |
| purge-tenant-now | Bearer + `getUser` + `owner_user_id` check | OK |
| purge-tenants | `x-purge-secret` header (PURGE_SECRET env) | OK cron |
| purge-accounts | `x-purge-secret` header | OK cron |
| cleanup-draft-schedules | `x-purge-secret` header | OK cron |
| process-translation-jobs | `X-Job-Secret` header (TRANSLATION_JOB_SECRET) | OK cron |
| send-otp | nessun JWT + rate-limit interno (otp_challenges send_count / window) | OK |
| verify-otp | nessun JWT + lockout via `attempts` / `consumed_at` | OK |
| status-otp | **non visto auth check ne rate-limit** | da verificare |
| recover-account | **NO JWT** (by design: utente bannato), `email` body | manca rate-limit per IP → enumerazione |
| restore-tenant | Bearer + `getUser` + owner check | OK |
| send-tenant-invite | `X-Internal-Secret` (INTERNAL_EDGE_SECRET) | OK (internal-only) |
| stripe-checkout | Bearer + `getUser` | OK |
| stripe-portal | Bearer + `getUser` | OK |
| stripe-update-seats | Bearer + `getUser` | OK |
| stripe-webhook | Stripe signature + idempotency `stripe_processed_events` | OK |
| resolve-table | nessun JWT + UUID validation `activity_id` | OK (entrypoint pubblico) |
| submit-order | `verifyCustomerJwt` + rate-limit per session | OK |
| cancel-order | `verifyCustomerJwt` + rate-limit | OK |
| request-bill | `verifyCustomerJwt` + rate-limit 1/min | OK |
| get-orders-for-session | `verifyCustomerJwt` | OK |
| acknowledge-order | shared `performAdminOrderTransition` (Bearer + `getUser` + membership + optimistic lock + rate-limit) | OK |
| deliver-order | idem | OK |
| cancel-order-admin | idem | OK |
| rectify-order | Bearer + `getUser` + membership + RPC atomic | OK |
| close-table | Bearer + `getUser` + membership | OK |
| toggle-product-availability | Bearer + `getUser` + membership | OK |
| generate-table-qrs | Bearer + `getUser` + rate-limit per (user, activity) | OK |
| search-google-places | Bearer + `getUser` | OK |
| menu-ai-import | Bearer + `getUser(token)` | OK |
| generate-menu-pdf | (auth pattern confermato dall'elenco `edge_role_checks`) | da rileggere file per dettaglio |
| submit-review | rate-limit per IP (10/24h) + per session+activity (1) | OK |
| **log-analytics-event** | **NO auth + NO rate-limit visibile** | spam / log poisoning |
| **join-waitlist** | **NO auth + NO rate-limit visibile** + invio email Resend | enumerazione + abuso Resend |
| resolve-public-catalog | pubblico (by design) | OK |

---

## Area 5 — Secret management

- Nessun secret hardcoded (`sk_live` / `sk_test` / `eyJ...` lunghi): grep vuoto.
- Pattern `Deno.env.get()` usato in 38 file edge.
- `service_role` referenziato in `src/services/supabase/tenants.ts` solo nei commenti (descrive una protezione trigger DB). Nessuna chiave service_role in frontend.
- `CUSTOMER_JWT_SECRET` correttamente usato (no prefisso `SUPABASE_` riservato): `_shared/customerJwt.ts`.
- Secret service-to-service: `PURGE_SECRET`, `TRANSLATION_JOB_SECRET`, `INTERNAL_EDGE_SECRET`, `STRIPE_WEBHOOK_SECRET`, `GOOGLE_PLACES_API_KEY`, `GEMINI_API_KEY`.

OK.

---

## Area 6 — Stripe webhook

- **Signature**: `stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET)` → 400 se mancante / invalido. OK.
- **Idempotency**: INSERT in `stripe_processed_events(event_id, event_type)` con unique constraint, su `23505` short-circuit 200. OK. (memoria diceva "non idempotent" → **fixato**, debt chiuso).
- **Logging**: payload completo dell'evento Stripe finisce in `webhook_errors.payload` (jsonb) sul path d'errore. **Contiene PII** (email customer, indirizzo billing, last4 card, ecc.). Retention non definita.
- Return sempre 200 anche su errori applicativi (per evitare retry storm) → corretto per Stripe.

---

## SINTESI FINALE — Priority Matrix

| # | Issue | Severita | Effort | Note |
|---|---|---|---|---|
| 1 | MCP `supabase-staging` non autenticato → Area 1/2/3 incomplete | CRITICAL | LOW | re-auth `SUPABASE_ACCESS_TOKEN` prima del prossimo turno; riesegui get_advisors + RLS/SECDEF query |
| 2 | `schedule_targets` debt RLS (no tenant_id) confermato in CLAUDE.md | HIGH | MEDIUM | da convalidare su DB live appena MCP riauth; aggiungere `tenant_id` denormalizzato o sostituire policy con join |
| 3 | `log-analytics-event` pubblico senza auth ne rate-limit | HIGH | LOW | tabella analytics avvelenabile da chiunque; min: rate-limit per IP + max payload size |
| 4 | `join-waitlist` pubblico senza rate-limit → abuso Resend + enumerazione email | HIGH | LOW | rate-limit per IP (es. 5/h) + risposta uniforme indipendentemente da email gia presente |
| 5 | `recover-account` no rate-limit per IP → enumerazione account | MEDIUM | LOW | rate-limit IP + risposta sempre 200 generica (non leakare se email esiste) |
| 6 | `webhook_errors.payload` salva evento Stripe completo (PII) | MEDIUM | LOW | strippare a `event.id + event.type + first-level metadata`; aggiungere TTL/cron per cancellazione |
| 7 | `status-otp` da verificare (rate-limit?) | MEDIUM | LOW | leggere file e confermare gating |
| 8 | Discrepanza count edge functions (memoria 26 vs filesystem 39) | LOW | LOW | aggiornare MEMORY.md count |
| 9 | `generate-menu-pdf` auth pattern non riletto in dettaglio | LOW | LOW | conferma getUser + tenant scope su prossimo audit |
| 10 | `stripe-webhook` rate-limit / size-limit assente (DoS amplification) | LOW | MEDIUM | Stripe firma → low risk, ma `webhook_errors` insert per ogni 500 → flood possibile se attaccante invia signature valida |

**Severita**:
- CRITICAL: bloccante go-live
- HIGH: pre-go-live mandatory
- MEDIUM: entro 1 mese post-launch
- LOW: nice-to-have

**Decisioni ad-hoc**:
1. Skipped DB advisor queries per blocco MCP auth — riesumare in turno 2.
2. Audit basato su filesystem read-only per le Edge Functions (verify_jwt config + auth check pattern).
3. Confermato che memoria "stripe-webhook NON idempotent" e ormai obsoleta (debt chiuso in migration `20260428100000_stripe_webhook_hardening.sql`).
4. customerJwt verify: `djwt v3.0.2` controlla signature + `exp`; il modulo aggiunge validazione semantica `role==="anon"` e presenza di `customer_session_id`. OK.
5. `verify_jwt = false` su 39/39 edge: corretto pattern progetto, auth fatta in-handler.

**Anomalie inattese**:
1. `webhook_errors.payload` salva l'evento Stripe per intero → potenziale GDPR issue (mai discusso nelle memorie).
2. `log-analytics-event` e `join-waitlist` completamente open (no auth + no RL): non emerge come debt nelle memorie ma e' un'esposizione concreta.
3. Discrepanza count Edge Functions memoria (26) vs realta (39).
4. Memoria progetto cita "stripe-webhook idempotency = debt pre-Live": realta = debt **gia chiuso** in 20260428.

---

**Prossimo turno**: re-auth MCP supabase-staging, rieseguire query Area 1/2/3, poi pianificare fix sulla matrix priorizzata.

---

# TURNO 2 — Aree 1/2/3 (MCP riautenticato)

Data esecuzione: 2026-05-28 (sessione 2)
Project ref: `lxeawrpjfphgdspueiag` (staging)

---

## Area 1 — Database Advisors (turno 2)

### Security advisors (62 totali)

| Count | Level | Rule | Note |
|---:|---|---|---|
| 32 | WARN | `authenticated_security_definer_function_executable` | quasi tutte by-design (auth-scope) |
| 21 | WARN | `anon_security_definer_function_executable` | **alcune critiche** — vedi Area 3 |
| 7 | INFO | `rls_enabled_no_policy` | service-role-only tabelle |
| 1 | WARN | `function_search_path_mutable` | `public.purge_user_data` |
| 1 | WARN | `extension_in_public` | `pg_net` in `public` schema |
| 1 | WARN | `auth_leaked_password_protection` | HIBP check disabilitato (Auth settings) |

**Issue critici**:
- `public.purge_user_data` ha `search_path` mutable → vulnerabile a SQL hijack via search_path manipulation. **Fix**: `ALTER FUNCTION ... SET search_path TO ''` + qualifiche `public.<table>` esplicite.
- `pg_net` in schema `public` → spostare in `extensions` (richiede `DROP EXTENSION ... CASCADE` + recreate, attenzione a cron pg_net).
- HIBP password protection off → flag in Auth dashboard.

### Performance advisors (106 totali)

| Count | Level | Rule | Note |
|---:|---|---|---|
| 35 | INFO | `unindexed_foreign_keys` | FK senza indice (28 tabelle) |
| 30 | INFO | `unused_index` | indici creati ma mai usati |
| 22 | WARN | `auth_rls_initplan` | `auth.uid()` non avvolto in `(select auth.uid())` → init-plan per ogni riga |
| 18 | WARN | `multiple_permissive_policies` | piu policy PERMISSIVE sullo stesso (cmd,role) → sommate ad ogni query |
| 1 | WARN | `duplicate_index` | `otp_challenges` ha `otp_challenges_user_id_idx` + `otp_challenges_user_idx` |

**Top FK unindexed (5 colonne piu hot)**:
- `catalog_items` ×3
- `audit_events` ×3
- `tenants` ×2
- `schedule_layout` ×2
- `product_availability_overrides` ×2

**`auth_rls_initplan` tabelle interessate** (8): `activity_slug_aliases`, `audit_logs`, `consent_records`, `notifications`, `otp_user_verifications`, `profiles`, `tenant_memberships`, `tenants`.

**`multiple_permissive_policies` tabelle** (15): `activities`, `activity_group_members`, `activity_groups`, `audit_logs`, `product_allergens`, `product_attribute_definitions`, `product_attribute_values`, `product_variant_assignment_values`, `product_variant_assignments`, `product_variant_dimension_values`, `product_variant_dimensions`, `products`, `schedule_visibility_overrides`, `tenant_membership_activities`, `tenant_memberships`.

---

## Area 2 — RLS coverage (turno 2)

73 tabelle in `public`, **TUTTE con RLS abilitato** (`relrowsecurity=true`). Nessuna `relforcerowsecurity` (default OK: bypass solo via service_role).

### Tabelle con RLS=true e 0 policy (7)

By design — service-role-only, RLS attivo blocca anon/authenticated:

| Tabella | Categoria | Note |
|---|---|---|
| `audit_events` | system-internal | scritta da trigger / Edge service_role |
| `otp_challenges` | system-internal | gestita da `send-otp` / `verify-otp` |
| `otp_send_audit` | system-internal | log invii OTP |
| `rate_limit_buckets` | system-internal | bucket per `increment_rate_limit` |
| `status_service_state` | system-internal | status page state |
| `stripe_processed_events` | system-internal | idempotency Stripe webhook |
| `webhook_errors` | system-internal | audit trail webhook |

**Pattern OK**. Issue residuo separato: `webhook_errors.payload` contiene PII (vedi Area 6 turno 1).

### Anomalie evidenziate

| Tabella | Anomalia | Severita |
|---|---|---|
| `waitlist` | policy `authenticated_select_waitlist` con `qual=true` → **ogni utente loggato puo leggere TUTTA la waitlist** (email visitatori) | HIGH (PII leak) |
| `tenant_memberships` | **5 policy SELECT** sovrapposte: `Active members can read memberships`, `Active members can read team memberships`, `Users can read own memberships or invites`, `Users can read pending invites for their email`, `Users can read their own membership`, `Users can read their own pending email invites` → trigger `multiple_permissive_policies` perf warn + complessita audit | MEDIUM (perf + audit clarity) |
| `consent_records` | `roles={public}` — corretto pattern (public = "qualsiasi role"), qual `user_id=auth.uid()` blocca anon. **OK** | nessuna |
| `permissions`, `plans`, `role_permissions`, `supported_languages` | 1 policy ciascuna, lookup pubbliche by-design | OK |

### Conferma `schedule_targets`

**Memoria CLAUDE.md SUPERATA**. La tabella ha **4 policy attive** (SELECT/INSERT/UPDATE/DELETE) con qual subselect su `schedules.tenant_id`:

```sql
qual: schedule_id IN (
  SELECT schedules.id FROM schedules
  WHERE schedules.tenant_id IN (SELECT get_my_tenant_ids())
)
```

Sicuro funzionalmente, ma:
- pattern subselect → `auth_rls_initplan` se policy contiene `auth.uid()` (qui no, usa `get_my_tenant_ids()`)
- costo per riga = subselect su `schedules`. Per dataset grandi → considerare denormalizzazione `tenant_id` direttamente in `schedule_targets`.

**Issue chiuso a livello RLS coverage**. Resta debt perf, non security.

---

## Area 3 — SECURITY DEFINER (turno 2)

54 funzioni `SECURITY DEFINER` in `public`. Grants letti da `pg_proc.proacl` (non `routine_privileges`, che è inaffidabile su funzioni overloaded).

### Anomalie evidenziate

#### A. PUBLIC grant esplicito (1)

| Funzione | acl | Severita |
|---|---|---|
| `get_schedule_featured_contents(uuid,uuid)` | `=X/postgres` (PUBLIC), anon, authenticated, service_role | HIGH — REVOKE FROM PUBLIC obbligatorio |

#### B. Anon grant su funzioni di SCRITTURA (8 → da verificare logica interna)

Queste funzioni sono callable da utenti `anon` (no login). Devono validare ownership/tenant internamente, altrimenti = data tampering aperto.

| Funzione | Rischio | Verifica logica interna richiesta |
|---|---|---|
| `replace_product_allergens(uuid, uuid, integer[])` | scrittura prodotti | controlla `p_tenant_id` contro auth context? |
| `replace_product_characteristics(uuid, uuid, uuid[])` | scrittura prodotti | idem |
| `replace_product_ingredients(uuid, uuid, uuid[])` | scrittura prodotti | idem |
| `enqueue_platform_languages_backfill()` | DoS spam queue | should be cron-only |
| `enqueue_tenant_language_backfill(uuid, text)` | DoS spam queue per tenant arbitrario | should be admin-only |
| `retry_all_failed_translations(uuid)` | DB load spam | should be admin-only |
| `revert_manual_translation(uuid, text, text, text, text)` | modifica traduzioni | tenant check? |
| `upsert_auto_translation(...)` / `upsert_manual_translation(...)` | scrittura traduzioni | service_role-only path attesa |

**Azione**: ispezionare body funzioni via `pg_get_functiondef`. Se manca check ownership → `REVOKE EXECUTE FROM anon, authenticated` + ridurre a service_role.

#### C. Anon grant su funzioni di LETTURA — by design (8)

| Funzione | Motivo |
|---|---|
| `accept_invite_by_token(uuid)` | invito email-only pre-login (UI `/invite/:token`) |
| `decline_invite_by_token(uuid)` | idem |
| `get_invite_info_by_token(uuid)` | idem |
| `get_public_tenant_ids()` | usata da `resolve-public-catalog` |
| `get_tenant_public_info(uuid)` | pagina pubblica |
| `resolve_table_by_token(uuid)` | QR table flow customer |
| `get_my_activity_ids()` / `get_user_tenants()` / `has_permission(...)` | usano `auth.uid()` → no-op da anon, safe |
| `delete_my_otp_verification()` | usa `auth.uid()` → no-op da anon |
| `get_translation_progress(uuid)` | info minore, by design |

OK by design. Resta noise advisor.

#### D. Authenticated SECDEF (32) — quasi tutte OK

Sono SECDEF callable da `authenticated`. Pattern legittimo: bypass RLS per RPC tipo `get_my_tenant_ids`, `invite_tenant_member`, `leave_tenant`, ecc. Nessuna anomalia oltre quelle gia citate in B/C (overlap con anon).

#### E. Funzioni interne service-role-only (corrette)

Esempi confermati con acl `postgres=X, service_role=X` (no anon/authenticated):
- `claim_pending_translation_jobs`, `clear_account_deleted`, `enforce_seat_limit`, `execute_account_deletion_tenant_ops`, `expire_old_invites`, `get_public_catalog`, `get_public_translations`, `get_user_id_by_email`, `handle_new_*`, `increment_otp_attempt`, `increment_rate_limit`, `mark_account_deleted`, `purge_locked_expired_tenants`, `rectify_order_atomic`, `submit_order_atomic`, `sync_profile_email`, `transfer_ownership`, `unlock_owned_tenants`.

OK.

---

## SINTESI AGGIORNATA — Priority Matrix v2

Integra issue turno 1 + scoperte turno 2. **Bold** = nuovo in turno 2. ~~strike~~ = chiuso/smentito.

| # | Issue | Severita | Effort | Note |
|---|---|---|---|---|
| 1 | ~~MCP auth blocking~~ | DONE | - | risolto in turno 2 |
| 2 | **`waitlist` SELECT policy con qual=true → email PII leak a qualunque authenticated** | **HIGH** | LOW | restringere a service_role o owner platform; oppure rimuovere policy SELECT da `authenticated` |
| 3 | **`replace_product_*` + `upsert_*_translation` + `enqueue_*_backfill` + `retry_all_failed_translations` + `revert_manual_translation` SECDEF callable da anon** | **CRITICAL** se logica interna non valida tenant; **HIGH** altrimenti | MEDIUM | `pg_get_functiondef` su ciascuna; aggiungere `REVOKE FROM anon, authenticated` se non public-by-design |
| 4 | **`get_schedule_featured_contents` ha PUBLIC grant esplicito** | HIGH | LOW | `REVOKE EXECUTE ON FUNCTION public.get_schedule_featured_contents(uuid,uuid) FROM PUBLIC` |
| 5 | **`purge_user_data` ha `search_path` mutable** | HIGH | LOW | `ALTER FUNCTION ... SET search_path TO ''` + qualifiche `public.*` |
| 6 | **`pg_net` extension in `public` schema** | MEDIUM | MEDIUM | spostare in `extensions`; coordinare con cron che usa `net.http_post` |
| 7 | ~~`schedule_targets` RLS gap~~ | CHIUSO | - | 4 policy attive (memoria CLAUDE.md superata, aggiornare) |
| 8 | `log-analytics-event` pubblico senza RL (turno 1) | HIGH | LOW | rate-limit IP + max payload |
| 9 | `join-waitlist` pubblico senza RL (turno 1) | HIGH | LOW | rate-limit IP + response uniforme |
| 10 | `recover-account` no IP RL (turno 1) | MEDIUM | LOW | rate-limit IP + risposta generica |
| 11 | `webhook_errors.payload` PII (turno 1) | MEDIUM | LOW | strip a `event.id+type+metadata`; TTL cron |
| 12 | **`tenant_memberships` 5 policy SELECT sovrapposte → perf + audit clarity** | MEDIUM | MEDIUM | consolidare in 1-2 policy con `USING (... OR ...)` |
| 13 | **`auth_rls_initplan` su 8 tabelle hot** | MEDIUM | LOW | sostituire `auth.uid()` con `(select auth.uid())` nei `USING/WITH CHECK` |
| 14 | **`multiple_permissive_policies` su 15 tabelle** | MEDIUM | MEDIUM | consolidare policy sullo stesso (cmd,role) o convertire alcune in RESTRICTIVE |
| 15 | **HIBP password protection disabilitato** | MEDIUM | LOW | toggle in Supabase Auth dashboard |
| 16 | `status-otp` da verificare RL (turno 1) | MEDIUM | LOW | leggere file |
| 17 | `generate-menu-pdf` auth pattern non riletto (turno 1) | LOW | LOW | conferma getUser + tenant scope |
| 18 | **35 `unindexed_foreign_keys`** | LOW | MEDIUM | aggiungere indici su FK hot (`catalog_items`×3, `audit_events`×3, `tenants`×2, ecc.) |
| 19 | **30 `unused_index`** | LOW | LOW | rivedere e droppare quelli mai hit (post-prod traffic) |
| 20 | **`otp_challenges` duplicate_index** | LOW | LOW | `DROP INDEX otp_challenges_user_idx` (o l'altro) |
| 21 | `stripe-webhook` DoS amplification (turno 1) | LOW | MEDIUM | low risk — firma blocca attacker no-secret |
| 22 | Discrepanza count edge functions memoria/realta (turno 1) | LOW | LOW | aggiornare MEMORY.md (39 non 26) |

### Decisioni ad-hoc (turno 2)

1. Letto `proacl` direttamente via `pg_proc` invece di `routine_privileges` per evitare null su funzioni overloaded.
2. Avvisi `authenticated_security_definer_function_executable` (32) classificati come noise advisor: Supabase Advisor flagga ogni SECDEF callable da PostgREST, ma in nostro caso quasi tutte usano `auth.uid()` internamente.
3. Non eseguito `pg_get_functiondef` sulle 8 funzioni SECDEF con anon-write per restare entro budget output; flag per turno 3.
4. Considerati indici/policy refactor come MEDIUM/LOW perche non bloccanti go-live; ordinabili dopo traffic prod reale.
5. `consent_records` con `roles={public}` confermato corretto (public = ANY role, predicato filtra anon via `auth.uid()`).

### Anomalie inattese

1. **`waitlist` policy `qual=true` per authenticated** → email visitatori esposte a qualunque utente loggato. Non emerso prima.
2. **`get_schedule_featured_contents` con PUBLIC grant esplicito** → unica funzione con PUBLIC nel ACL bitmap.
3. **`pg_net` installato in `public` schema** → contro best practice Supabase moderna.
4. **`schedule_targets` debt CLAUDE.md è OBSOLETO**: tabella ha gia 4 policy via subselect su `schedules`. Memoria progetto va aggiornata.

### Aggiornamenti necessari MEMORY/CLAUDE

- `CLAUDE.md` sezione "Database" e `MEMORY.md` "Critical Schema Facts" → rimuovere claim "`v2_schedule_targets` — NO tenant_id, NO RLS (security gap)". Realta: ha 4 policy via subselect.
- `MEMORY.md` count Edge: 26 → 39.

---

**Stato audit**: COMPLETO Aree 1-6. Pronto per turno 3 = pianificazione fix priorizzata + `pg_get_functiondef` su SECDEF anon-write per confermare/escalare severita issue #3.
