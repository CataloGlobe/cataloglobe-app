# Edge Functions — CataloGlobe

Tutte in `supabase/functions/<nome>/index.ts`. Shared code in `_shared/`. `verify_jwt: false` su tutte.

## Catalogo funzioni

| Funzione | Abilitata | Scopo |
| -------- | --------- | ----- |
| `resolve-public-catalog` | ✅ | Risolve catalogo pubblico per slug (pagina pubblica); fallback su `activity_slug_aliases` se slug non trovato → risponde con `canonical_slug` per redirect lato client |
| `send-otp` / `status-otp` / `verify-otp` | ✅ | OTP auth flow |
| `delete-account` / `recover-account` / `purge-accounts` | ✅ | Gestione account utente |
| `delete-tenant` / `purge-tenants` / `restore-tenant` / `purge-tenant-now` | ✅ | Lifecycle tenant |
| `delete-business` | ✅ | Elimina sede |
| `send-tenant-invite` | ✅ | Invito membro team (email via Resend) |
| `generate-menu-pdf` | ✅ | PDF menu (usa Puppeteer) |
| `stripe-checkout` / `stripe-webhook` / `stripe-portal` / `stripe-update-seats` | ✅ | Sottoscrizione Stripe |
| `update-billing-details` | ✅ | Salva i dati fiscali del tenant (RPC `update_tenant_billing_details` col JWT utente) e riallinea il customer Stripe |
| `submit-review` | ✅ | Invio recensione dalla pagina pubblica |
| `search-google-places` | ✅ | Ricerca luoghi Google Places. Branch `query`: searchText per review URL (tab contatti). Branch `place_id`: Place Details con `addressComponents` per autocompletamento indirizzo strutturato (`address`, `street_number`, `postal_code`, `city`, `province`). |
| `cleanup-draft-schedules` | ✅ | Elimina bozze schedules incomplete > 7 giorni (chiamata via pg_cron con PURGE_SECRET) |
| `menu-ai-import` | ✅ | Import AI da menu via Gemini (immagini JPEG/PNG + PDF, max 5 file/richiesta) |
| `submit-lead` | ✅ | Contatto dal form della landing campagna → tabella `leads` + mail interna (pubblica, rate limit per IP) |
| `purge-leads` | ✅ | Cancella i lead non `won` più vecchi di 12 mesi (pg_cron 03:45 UTC, `X-Job-Secret`, dry-run di default) |

## Contatti dalla landing — `submit-lead` e `purge-leads`

`submit-lead` è pubblica (form della landing campagna). Controlla honeypot `website`, validazione in `_shared/leadValidation.ts` ↔ `src/utils/leadValidation.ts` (test di sync) e rate limit 5/ora per `ip_hash` (SHA-256 con `LEADS_IP_SALT`, l'IP in chiaro non si salva). Poi insert con service role e mail best-effort a `LEADS_NOTIFY_EMAIL`: se la mail fallisce la riga resta. CORS: le anteprime Vercel passano solo su staging. La prova del consenso la scrive il server: `consent_at` = ora dell'insert, `consent_text` = `PRIVACY_PUBLISHED_AT` (`_shared/consentVersions.ts`, fonte unica anche per `/legal/privacy`, separata da `CURRENT_CONSENT_VERSIONS.privacy`: alzarla non chiede un nuovo consenso al sign-up). Il client non manda `consent_text`.

`purge-leads`: cancella i lead con `status ≠ 'won'` più vecchi di 12 mesi. Dry-run di default (`{"dry_run": false}` esplicito per cancellare), header `X-Job-Secret` = `LEADS_RETENTION_SECRET` confrontato a tempo costante (manca o è sbagliato → 401). Cron pg_cron `purge-leads` alle 03:45 UTC (mig `20260926130000`): URL e secret dal vault (`purge_leads_url`, `leads_retention_secret`, che deve essere uguale a `LEADS_RETENTION_SECRET`); se manca un valore nel vault il job salta. `_shared/sendEmail.ts` logga solo `name`/`message`/`statusCode` degli errori Resend (`safeErrorFields`): mai destinatario o corpo della mail.

## scheduleResolver — duplicazione critica

**`scheduleResolver.ts` esiste in DUE posti**: `src/services/supabase/` e `supabase/functions/_shared/`. Sincronizzarli ENTRAMBI ad ogni modifica.

## `purge-tenant-now` vs `purge-tenants`

- `purge-tenant-now`: endpoint on-demand chiamato dall'UI Workspace ("Elimina definitivamente"). Richiede JWT user owner del tenant + ownership check interno. **Bypassa il filtro 30gg** (immediate purge se `deleted_at IS NOT NULL`).
- `purge-tenants`: cron daily 03:00 UTC. Richiede `x-purge-secret` header (`vault.purge_tenants_secret`). Filtra `WHERE deleted_at < now() - interval '30 days'`. Batch 10 tenant.

Entrambi usano `purgeTenantData()` shared in `_shared/tenant-purge.ts`. Path identico.

## Trigger `prevent_deleted_at_client_update`

Trigger PostgreSQL che blocca UPDATE su `tenants.deleted_at` se non sei `service_role`. Significa che testi via Dashboard SQL Editor (role `postgres`) **non possono** forzare il backdate manualmente. Per backdate serve girare via Edge Function con service_role oppure via API admin. Per test rapidi, preferire `purge-tenant-now` che bypassa il filtro temporale.

## Bug history e gotchas operativi

### `purgeTenantData` — ordine DELETE (critico per FK)

`schedule_targets` + `schedule_layout` devono essere eliminate PRIMA di `catalogs` e `styles` (FK RESTRICT su `schedule_layout.catalog_id` e `schedule_layout.style_id`). Ordine corretto in `_shared/tenant-purge.ts`: junctions/product-children → `schedule_targets` (filtrato by `schedule_id`) → `schedule_layout` → `catalog_categories` → `catalogs` → `product_*` → `featured_contents` → `styles` (con `current_version_id=NULL` prima di `style_versions`) → `schedules` → `activities` → `products` → `tenant_memberships` → `tenants`. Bug fixato 11/05/2026 dopo test runtime: ordine sbagliato bloccava il purge con `23503` su tenant con regole Programmazione layout (= praticamente tutti i tenant attivi).

### `purgeActivityFolder` — ricorsivo e non-throwing

Il bucket `business-covers` ha sotto-path tipo `{tenantId}/{slug}__{activityId}/gallery/` (gallery delle sedi). La cancellazione storage deve scendere ricorsivamente nei subfolder, e gli errori `storage.remove()` devono essere `console.warn` (non `throw`) per evitare di bloccare il cleanup degli altri bucket. Pattern allineato a `purgeTenantFolder` (gli altri 4 bucket tenant-scoped: `product-images`, `featured-contents`, `tenant-assets`, `style-backgrounds`). Bug fixato 11/05/2026: senza ricorsione, gallery images sopravvivevano al purge → file orfani indefinitamente in storage → violazione GDPR.

### `supabase/config.toml` entry obbligatoria per ogni nuova Edge Function

Senza entry esplicita il gateway Supabase applica `verify_jwt = true` di default e respinge JWT non-Supabase (customer JWT custom firmato con `CUSTOMER_JWT_SECRET`, oppure anon key per endpoint public-facing) con `UNAUTHORIZED_LEGACY_JWT` o `UNAUTHORIZED_INVALID_JWT_FORMAT` PRIMA di entrare nel codice della function. Pattern obbligatorio: `[functions.<nome>]` + `enabled = true` + `verify_jwt = false` + `import_map = "./functions/import_map.json"` + `entrypoint = "./functions/<nome>/index.ts"`. Lezione appresa task 2.4 (`resolve-table`), 2.5b (`submit-order`), tutti gli admin endpoint Fase 2.

### `supabase functions deploy` impacchetta dal working tree, non dal commit
Il deploy prende i file **come sono su disco**, compreso tutto ciò che l'albero degli import si porta dietro (soprattutto `supabase/functions/_shared/`). Con più sessioni sullo stesso working tree, un deploy può portare in un ambiente codice di un'altra sessione non committato né rivisto: è già successo su staging (`publicSiteUrl.ts` con WIP del filone prenotazioni finito nel deploy di `notify-support`). Prima di deployare: `git status --short supabase/functions/` deve essere pulito, oppure si accetta consapevolmente cosa finisce nel bundle. Meglio ancora: deploy da un worktree pulito sul commit da rilasciare.

### Slash `/` nei commenti TypeScript Deno

Il parser TS del bundler Deno (deploy Edge Function) può interpretare `/` dentro `//` o `/* */` come inizio di regex literal in certi contesti, causando deploy fail con `Failed to bundle the function (reason: The module's source code could not be parsed: Unterminated regexp literal)`. Bug noto del lexer. Workaround: sostituire `/` con `vs`, `or`, `|` nei commenti. Esempio: `// pattern: cancel-order-admin / acknowledge-order` → `// pattern: cancel-order-admin vs acknowledge-order`. Lezione appresa task 2.12 (`close-table`).

### Customer Stripe dopo trasferimento di proprietà

`transfer_ownership()` cambia solo `tenants.owner_user_id`: il customer Stripe restava con email e `metadata.user_id` del vecchio owner (ricevute, solleciti e portale al destinatario sbagliato). L'email sul customer è quella auth dell'owner (non esiste un'email di fatturazione tenant; la PEC è l'indirizzo SDI). Due punti la riallineano, entrambi via Stripe `customers.update` e non-throwing:
- `delete-account` Step 2b, unico percorso di transfer (l'RPC non è eseguibile da `authenticated`): dopo il successo di `execute_account_deletion_tenant_ops` rilegge owner e `stripe_customer_id` dal DB (solo tenant del payload posseduti dal caller prima dell'RPC e non più dopo: l'RPC ritorna successo senza validare il payload quando il caller non possiede tenant attivi), email da `auth.admin.getUserById`, poi `syncStripeCustomerOwner` (`_shared/stripe-helpers.ts`). Un errore Stripe logga `stripe_customer_owner_sync_failed` (solo code, type, status) e non blocca l'eliminazione.
- `stripe-checkout`, ramo riuso customer: `email` + `metadata.user_id` seguono il caller (già verificato owner). Rete di sicurezza: un customer rimasto stale si riallinea al primo checkout del nuovo owner.
Bug fixato 24/09/2026.

### Customer Stripe dopo modifica dei dati fiscali

Prima del fix il customer Stripe si aggiornava solo al checkout, che per un abbonato attivo non si ripete: una modifica da Impostazioni (ragione sociale, indirizzo, P.IVA) non arrivava mai in fattura. Ora il FE (`updateTenantBillingDetails` in `tenants.ts`, usato da `BusinessSettingsPage` e dal ramo ripresa del wizard) chiama l'edge `update-billing-details`:
1. RPC `update_tenant_billing_details` col JWT dell'utente (permesso `tenant.manage` + gate P.IVA nel DB). Errori: `insufficient_permission` (403, code 42501) e `invalid_vat_number` (400, code 22023) con message e code della RPC; ogni altro errore di classe 22 o 23 → 400 `invalid_billing_details`, senza testo Postgres. Il service lo rilancia come `Error` con `name = message = error` del body e `code`.
2. Se il tenant ha `stripe_customer_id`, rilegge la riga salvata (service_role) e chiama `syncStripeCustomerProfile`: aggiorna name, address, description, `preferred_locales`, metadata fiscali (merge; un campo svuotato nel DB viene svuotato anche su Stripe con `""`) e tax id. **Mai** `email` né `metadata.user_id`: seguono l'owner, e i dati fiscali li può modificare anche un admin.
3. Risposta sempre 200 dopo il salvataggio: `stripe_sync` = `updated` | `skipped_no_customer` | `customer_missing` | `error`. Un errore Stripe non fa fallire il salvataggio; il prossimo salvataggio o checkout riallinea.

Costruzione del profilo condivisa con `stripe-checkout` in `_shared/stripeCustomerProfile.ts` (builder + clamp ai limiti Stripe). `syncCustomerTaxId` porta gli `eu_vat` del customer esattamente alla P.IVA corrente: crea il nuovo se manca, poi cancella ogni `eu_vat` diverso (Stripe copia in fattura TUTTI i tax id del customer, quindi una P.IVA vecchia finirebbe sul documento), P.IVA vuota → cancella tutti. Create prima del delete; altri tipi di tax id intatti. Il vecchio `ensureCustomerTaxId` di checkout aggiungeva soltanto. Log solo code/type/status, mai P.IVA né messaggi Stripe.
Bug fixato 24/09/2026.

## Epic Ordinazioni dal tavolo — 11 Edge Functions

`resolve-table`, `submit-order`, `get-orders-for-session`, `cancel-order`, `acknowledge-order`, `deliver-order`, `cancel-order-admin`, `rectify-order`, `close-table`, `toggle-product-availability`, `generate-table-qrs`. Dettaglio dual-auth e optimistic locking in `docs/orders-architecture.md` v1.2 e in `CLAUDE.md` sezione "Epic Ordinazioni dal tavolo".

## Stampa comande — Sunmi cloud printer

Funzioni: `sunmi-bind-printer`, `sunmi-unbind-printer`, `sunmi-printers-status`, `sunmi-device-callback`, `process-print-jobs` (sweeper pg_cron, ogni minuto), `sunmi-reprint-order`. Shared: `_shared/printJobs.ts` (enqueue + push inline + `tradeNoFor`), `_shared/buildComanda.ts`, `_shared/escpos.ts`.

Due tabelle con ruoli distinti:
- **`print_jobs`** — coda automatica, UNIQUE `(order_id, printer_id, kind)`, stati `pending | processing | done | failed`, retry via sweeper, cap 3 tentativi. **Unica fonte dello stato di stampa corrente** letta dal kanban Comande (`useActiveOrdersRealtime` → `comandaPrintStates`, card: `done` → "Ristampa", `failed` → "Comanda non stampata" + "Riprova"; `pending`/`processing` → nessun pulsante, nessuno stato "appeso" derivato lato client).
- **`print_reprints`** — storico delle ristampe manuali, una riga per click, stati `done | failed`, nessun retry, nessun UNIQUE. Il frontend NON la legge.

### `sunmi-reprint-order` — recupero del job `failed`

Contesto admin, `has_permission('orders.manage', activity_id)`, rate limit per sede (20/min). Per ogni stampante attiva: `pushContent` con `trade_no` casuale (mai deduplicato da Sunmi) → riga in `print_reprints`.

**Se il push su una stampante riesce**, la funzione porta a `done` (con `processed_at` + `last_error=NULL`) l'eventuale riga `print_jobs` con `kind='comanda'` e `status='failed'` di quella coppia `(order_id, printer_id)`. Motivo: senza questo il badge "Comanda non stampata" resterebbe sulla card dopo una ristampa riuscita e l'operatore ristamperebbe di nuovo → comande duplicate in cucina. Il binding realtime del kanban su `print_jobs` propaga l'UPDATE da solo. Push fallito → `failed` resta. Si toccano SOLO le righe `failed`: `pending`/`processing` appartengono allo sweeper. Match a 0 righe è normale (stampante collegata dopo l'ordine). Scrittura con service_role: `print_jobs` non ha policy UPDATE per design.
