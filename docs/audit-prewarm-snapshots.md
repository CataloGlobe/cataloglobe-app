# AUDIT FASE 1 (read-only) — Pre-warming snapshot Redis degli slug attivi (Gap #1)

**Data**: 2026-07-18 · **Scope**: solo diagnosi + proposta. Nessuna modifica/migration/deploy.
**Obiettivo**: cron periodico che tiene sempre caldo lo snapshot Redis (base-lang IT) degli slug attivi → resilienza incondizionata durante outage Supabase.
**Fuori scope**: multilingua (Gap #2), implementazione (FASE 2).

---

## 1. Query "slug attivo" — allineata al gate runtime

### Confine subscription (dal resolver, non inventato)
Il resolver usa una **allowlist fail-closed** (`supabase/functions/_shared/checkOrderingState.ts:45`):
```
VALID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"])
```
`resolve-public-catalog/index.ts:650-651`: se `subscription_status` non è nell'allowlist → ritorna `subscription_inactive: true` (menù NON mostrato). Quindi:
- **Attivi (menù visibile)**: `active`, `trialing`, `past_due` (grace incluso).
- **Esclusi (subscription_inactive)**: `suspended`, `canceled`. → coerente escluderli dal warming.
- **Trial**: il runtime **NON** controlla `trial_until > now()` — si fida solo della state machine `subscription_status` (webhook flippa `trialing`→`suspended`/`canceled` alla scadenza). Su staging i `trialing` hanno `trial_until = NULL` — conferma che `trial_until` non è il gate. → **NON filtrare su trial_until** (divergerebbe dal runtime).

CHECK constraint: `subscription_status IN ('trialing','active','past_due','suspended','canceled')` NOT NULL (`migrations/20260411100000_stripe_subscription_setup.sql:41-42`, colonna su `tenants`, Stripe-on-tenants).

### Confine activity pubblicata
- `activities.status ∈ {active, inactive}` NOT NULL (`migrations/20260223151000_v2_activities.sql:18`). Gate runtime: `resolve-public-catalog/index.ts:403-416` (`status !== "active"` → catalogo vuoto).
- `activities` **NON ha** `is_demo`/`is_test`/`archived_at`/`deleted_at` — l'unico flag è `status`. Nessun filtro demo/test possibile o necessario a quel livello.
- `activities.slug` NOT NULL + UNIQUE `(tenant_id, slug)` → slug sempre presente.
- Link: `activities.tenant_id → tenants.id`. `tenants.deleted_at` esiste (soft-delete): il resolver non lo controlla, ma escluderlo è defense-in-depth.

### Query finale (base-lang) — testata read-only su staging
```sql
SELECT a.slug, a.tenant_id, t.base_language_code AS base_lang
FROM activities a
JOIN tenants t ON t.id = a.tenant_id
WHERE a.status = 'active'
  AND t.subscription_status IN ('active','trialing','past_due')
  AND t.deleted_at IS NULL;
```
**Conteggio attuale (staging): N = 14** (15 activities → 14 active → tutte con slug → tutte passano il gate subscription). Ordine di grandezza: **decine** (prod probabilmente simile, crescita verso low-hundreds).

---

## 2. Endpoint revalidate — verdetto riuso

`api/public-catalog/revalidate.ts` (letto intero):
- **Opera per SLUG**, non per tenantId: body `{slug}` o `{slugs[]}` (`:79-103`). Nessun mapping tenantId→slug. → **Il pre-warming ragiona per slug: nessun mismatch, allineamento naturale.**
- Flusso per slug: **PURGE** pattern `cataloglobe:{env}:...:{slug}:*` (tutte le lingue, `deleteKeysByPattern` `:121-142`) → **RIPOPOLO base** (`warmBaseSnapshot` `:144-184`). Serie per slug, parallelo tra slug (`Promise.all` `:250-277`).
- Auth: `Authorization: Bearer <REVALIDATE_SECRET>` via `process.env.REVALIDATE_SECRET` (`:205`, `extractBearer` `:109-115`).
- **Ripopolo isolato ma NON riusabile as-is**: `warmBaseSnapshot(slug)` è locale a revalidate.ts, solo base-lang, non esportato. Le *primitive* invece sono già shared in `_lib/`: `callResolvePublicCatalog({slug,lang?})` + `isHealthyPayload` (`_lib/supabaseEdge.ts`), `redisSetSnapshot` + `makeSnapshotKey` (`_lib/redis.ts`).

**Verdetto**: **NON duplicare.** Estrarre `warmBaseSnapshot` in un helper condiviso `_lib/` — es. `snapshotPublicCatalog({slug, lang?}): Promise<"written"|"skipped"|"failed">` = `resolve → isHealthy → redisSetSnapshot`. Poi:
- `revalidate.ts` lo chiama (dopo il purge) — refactor behavior-preserving.
- Il nuovo pre-warm lo chiama **senza purge** (vedi sotto).

**Distinzione critica purge vs repopulate**: revalidate **purga** (serve alla pubblicazione per droppare le lingue stale). Il pre-warming **NON deve purgare** — solo (ri)scrivere lo snapshot base con TTL 30gg fresco. Un warm giornaliero che purgasse cancellerebbe inutilmente le lingue non-base già calde. → pre-warm = **repopulate-only**, riusa l'helper estratto, salta il purge.

---

## 3. Forma del cron — endpoint dedicato server-only

- **Nuovo endpoint** `api/cron/prewarm-snapshots.ts`, distinto dal warmup latenza.
- **Auth**: pattern `isAuthorized()` identico a `api/cron/warmup-public-catalog.ts:43-49` → `header === "Bearer " + process.env.CRON_SECRET`. **CRON_SECRET è server-only** (non-VITE). → usare CRON_SECRET, **MAI** `VITE_REVALIDATE_SECRET` (esposto nel bundle). (`REVALIDATE_SECRET` server-only sarebbe pure ok, ma CRON_SECRET è il pattern cron consolidato.)
- **Trigger**: `vercel.json` **non ha `crons`** → scheduler **esterno** (cron-job.org, convenzione Hobby già in uso per il warmup latenza; header file `warmup-public-catalog.ts:23-25` lo esplicita). Il pre-warm è un **secondo job** cron-job.org.
- **Cadenza**: **giornaliera** ampiamente sufficiente (TTL snapshot 30gg). Nessun bisogno di più frequente.

**NON unificare col warmup latenza** (scopi diversi, non si sovrappongono):
| | Warmup latenza (esistente) | Pre-warm snapshot (nuovo) |
|---|---|---|
| Scopo | cold-start lambda | resilienza dati (snapshot Redis) |
| Cosa fa | ping `?warmup=1` → early-return, **non tocca Redis/Postgres** (`public-catalog:134-176`) | resolve edge + write Redis (tocca Supabase+Redis) |
| Cadenza | ogni minuto (leggerissimo) | giornaliera (pesante) |
| Costo | ~zero | N × resolve catalogo |

Unirli inquinerebbe il warmup minuto-per-minuto con carico DB. Tenerli separati.

---

## 4. Batch e costi

- **N ~ 14** oggi (decine), crescita verso low-hundreds.
- **Vercel Hobby: `maxDuration` default 10s** (nessun override in `vercel.json`; solo `includeFiles` su ssr-render per il bundling). Ogni slug = 1 resolve edge (catalogo full-join, ~centinaia di ms; retry fino a 3×6s solo su failure) + 1 Redis write.
- **Sequenziale a N=14**: ~14 × 300–800ms ≈ 4–11s → **borderline/oltre i 10s Hobby** già ora.
- **Strategia**: concorrenza **limitata** (es. `p-limit` a 4–6 in parallelo) → N=14 rientra in ~2–3s, e non martella l'edge/Supabase (max 5 resolve paralleli). Per crescita a centinaia → **chunking**: cron-job.org invoca con `?offset/?limit`, oppure l'endpoint auto-pagina con continuation. Evitare `Promise.all` unbounded su tutti gli N.

---

## 5. Gap list — da decidere prima della FASE 2

1. **Come leggere la lista slug attivi dal lambda** (bloccante). Il lambda non ha un client Supabase per query dirette a `tenants`/`activities`. Due opzioni:
   - **RPC `list_active_public_slugs()` SECURITY DEFINER** (raccomandato): incapsula il gate in un punto solo, GRANT a `service_role`, chiamata con service key. Single source of truth, testabile, allineato al resolver.
   - Client service-role inline nel lambda con la WHERE duplicata in TS (duplica la logica del gate → sconsigliato).
2. **maxDuration Hobby 10s vs N** (bloccante alla crescita): decidere concorrenza (4–6) + se/come chunkare. A N=14 basta la concorrenza; a centinaia serve paginazione multi-invocazione.
3. **Repopulate-only vs purge**: confermare che il pre-warm NON purga (solo overwrite base). (Raccomandato: no purge — preserva lingue calde.)
4. **Estrazione helper `snapshotPublicCatalog`** da `warmBaseSnapshot`: farla nella stessa FASE 2 (refactor revalidate.ts behavior-preserving) o separata.
5. **Alias slug** (minore): lo snapshot key è per slug **richiesto** (`makeSnapshotKey(slug)`); scaldare lo slug canonico **non** scalda la key dell'alias. 1 alias su staging (`activity_slug_aliases`). Decidere se warmare anche `UNION activity_slug_aliases.slug` (correttezza per URL-alias durante outage).
6. **Secret**: usare `CRON_SECRET` (server-only). Confermato NON usare `VITE_REVALIDATE_SECRET`.
7. **Osservabilità**: log strutturato per giro (n_warmed / n_skipped(non-healthy) / n_failed) — riusare la forma JSON dei log esistenti (`warmup_public_catalog_cron`, `redis_timeout`).

---

## Nota
Diagnosi + proposta. Nessun file modificato. Implementazione → FASE 2 dopo review.
