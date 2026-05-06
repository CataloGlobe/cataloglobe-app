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
