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
| `submit-review` | ✅ | Invio recensione dalla pagina pubblica |
| `search-google-places` | ✅ | Ricerca luoghi Google Places. Branch `query`: searchText per review URL (tab contatti). Branch `place_id`: Place Details con `addressComponents` per autocompletamento indirizzo strutturato (`address`, `street_number`, `postal_code`, `city`, `province`). |
| `cleanup-draft-schedules` | ✅ | Elimina bozze schedules incomplete > 7 giorni (chiamata via pg_cron con PURGE_SECRET) |
| `menu-ai-import` | ✅ | Import AI da menu via Gemini (immagini JPEG/PNG + PDF, max 5 file/richiesta) |

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

### Slash `/` nei commenti TypeScript Deno

Il parser TS del bundler Deno (deploy Edge Function) può interpretare `/` dentro `//` o `/* */` come inizio di regex literal in certi contesti, causando deploy fail con `Failed to bundle the function (reason: The module's source code could not be parsed: Unterminated regexp literal)`. Bug noto del lexer. Workaround: sostituire `/` con `vs`, `or`, `|` nei commenti. Esempio: `// pattern: cancel-order-admin / acknowledge-order` → `// pattern: cancel-order-admin vs acknowledge-order`. Lezione appresa task 2.12 (`close-table`).

## Epic Ordinazioni dal tavolo — 11 Edge Functions

`resolve-table`, `submit-order`, `get-orders-for-session`, `cancel-order`, `acknowledge-order`, `deliver-order`, `cancel-order-admin`, `rectify-order`, `close-table`, `toggle-product-availability`, `generate-table-qrs`. Dettaglio dual-auth e optimistic locking in `docs/orders-architecture.md` v1.2 e in `CLAUDE.md` sezione "Epic Ordinazioni dal tavolo".
