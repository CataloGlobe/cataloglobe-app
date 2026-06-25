# FASE 1 (mini) — Audit read-only: stato "In traduzione" + auto-refresh nella tab Traduzioni

> Solo lettura. Bug: dopo edit IT tutte le lingue diventano "Da rivedere" e ci restano fino a reload. Per le lingue **auto** i job di ri-traduzione sono pending → badge corretto = "In traduzione", non "Da rivedere". La tab non ha il gradino `pending` né auto-refresh.
> Data: 2026-06-24.

---

## 1. Job pending per lingua di una singola entità/campo

**Nessun service esistente** ritorna i pending **per-lingua** di una entità. Le funzioni che toccano `translation_jobs`:

| Funzione | File | Cosa fa | Per-lingua? |
|---|---|---|---|
| `enqueueTranslationJobsIfChanged` | `translationJobs.ts:~51-345` | enqueue; dedup select per-lingua (`.eq("target_language_code", lang).eq("status","pending")`) in loop | sì ma interno all'enqueue |
| `deleteTranslationJobsForEntity` | `translationJobs.ts:239` | delete per (tenant,entity_type,entity_id,field) | no |
| `getFieldTranslationStatus` | `translationStatus.ts:~99-127` | conta job per (tenant,entity,field,**source_hash**) → totali | **NO — aggrega via `.filter`, perde la lingua** |

`getFieldTranslationStatus` fa la query giusta ma **butta via** `target_language_code`:
```js
.from("translation_jobs")
  .select("status, target_language_code, last_error")
  .eq("tenant_id").eq("entity_type").eq("entity_id").eq("field")
  .eq("source_hash", sourceHash)        // <-- solo job del source CORRENTE
// poi: pendingCount = jobs.filter(j => j.status === "pending").length  → totale
```

**Soluzione (no nuova RPC)**: una `select` diretta RLS-safe su `translation_jobs`, mantenendo `target_language_code`:
```js
.from("translation_jobs")
  .select("target_language_code, status")
  .eq("tenant_id", tenantId)
  .eq("entity_type", entityType)
  .eq("entity_id", entityId)
  .eq("field", field)
  .eq("source_hash", currentSourceHash)   // job legati al source attuale
  .in("status", ["pending", "processing"])
// → Set<language_code> dei pending
```

**RLS confermata safe** (migration `20260503190000_translations_core.sql`): policy SELECT `translation_jobs` `TO authenticated USING (tenant_id IS NOT NULL AND tenant_id IN (SELECT get_my_tenant_ids()))`. Una `select` autenticata è già tenant-scoped. Tipo `TranslationJob` (`src/types/translations.ts`) ha `target_language_code` + `status: pending|processing|done|failed`.

**Scelta filtro `source_hash`**: filtrare per `currentSourceHash` (come fa `getFieldTranslationStatus`) esclude job orfani di source superati → più preciso. L'enqueue è `await`-ato dentro `updateProduct`/`updateCategory`, quindi i job col nuovo hash esistono già quando la tab ricarica.

---

## 2. Come `TranslationStatusBadge` ottiene `pendingCount` — riusabile?

`TranslationStatusBadge.tsx` chiama `getFieldTranslationStatus(tenant, entityType, entityId, field)` → `{ totalLanguages, doneCount, pendingCount, errorCount, sourceHash }`. `pendingCount` è **per-campo ma aggregato su tutte le lingue** (solo totale).

**Riuso parziale**: la *fonte* (`translation_jobs` filtrata per entity+field+source_hash) è la stessa, ma `getFieldTranslationStatus` **non espone la lingua** → per i badge per-riga **non è riusabile così com'è**. Due strade:
- (a) aggiungere accanto una funzione `getPendingJobLanguages(...)` → `string[]`/`Set` (la select del §1). **Consigliata** (minima, non tocca la firma esistente usata dal badge).
- (b) estendere `getFieldTranslationStatus` per ritornare anche `pendingLanguages: string[]`. Più invasiva (cambia un contratto già consumato dal badge).

→ Preferire (a): nuova funzione in `translationJobs.ts` (o `translationStatus.ts`), nessuna RPC.

---

## 3. Pattern di polling consigliato

`TranslationsTab` **oggi non polla** (`loadData()` una volta in `useEffect`, più dopo save/revert). Tre implementazioni identiche già nel codice:

| Sorgente | Intervallo | Stop | Cleanup |
|---|---|---|---|
| `TranslationStatusBadge.tsx:55-61` | 5000ms | `pendingCount === 0` | `clearInterval` |
| `useTranslationCoverage.ts:85-89` | 5000ms | `sumPending === 0` | `clearInterval` + `isMountedRef` |
| `useTranslationProgress.ts:64-68` | 5000ms | `total_pending === 0` | idem |

Nessun hook generico (`useInterval`/`usePolling`) esiste in `src/hooks` o `src/utils`.

**Pattern (identico ovunque)**:
```js
useEffect(() => {
  if (!hasPending) return;
  const id = setInterval(() => { void loadData(); }, 5000);
  return () => clearInterval(id);
}, [hasPending, loadData]);
```
**Consiglio**: inline nel `TranslationsTab` (mirror di `TranslationStatusBadge`), stop quando `pendingLangs.size === 0`. Estrazione di un `usePollingEffect` generico è opzionale (nice-to-have, non necessaria per il fix). `loadData` già rifetcha le righe + ricalcola hash → riusare quello, ricomputando anche `pendingLangs` nello stesso giro.

> Nota: la tab ha già `pendingAutoLangs: Set<string>` (tracking post-revert). La nuova `pendingLangs` da DB è **autoritativa e più ampia** → può sostituire/assorbire `pendingAutoLangs` (oggi popolato a mano dopo revert).

---

## 4. Classificazione target per riga — conferma sui dati reali

Priorità **pending > fresh > stale**, per lingua:

| Caso | Job pending? | Hash | Badge |
|---|---|---|---|
| pending/processing per (entity,field,lang) | sì | qualunque | **In traduzione** |
| manual allineato | no | = | Manuale |
| auto allineato | no | = | Automatica |
| manual disallineato | **no** (escluso dall'enqueue) | ≠ | **Da rivedere** |
| auto disallineato | **sì** (enqueue lo crea) | ≠ | **In traduzione** |

**Caso "auto stale" → diventa pending → "In traduzione".** Confermato dal codice: `enqueueTranslationJobsIfChanged` **esclude le lingue `manual`** (`manualLangs` filter) e crea un job `pending` per ogni lingua **auto** cambiata/mancante. Quindi dopo un cambio IT:
- ogni lingua **auto** ha un job pending col nuovo `source_hash` → "In traduzione" (mai "Da rivedere").
- ogni lingua **manual** non ha job → hash ≠ → "Da rivedere" (corretto, è il vero "rivedi a mano").

→ Il bug attuale è esattamente questo: la tab marca anche le **auto** come "Da rivedere" perché guarda solo l'hash, ignorando i job pending.

**Edge**: `enqueueWithSilentError` ingoia gli errori → un'auto potrebbe restare stale **senza** job (enqueue fallito). Fallback: auto disallineato **senza** job → "Da rivedere" (la regola "pending? → In traduzione, altrimenti hash" lo copre naturalmente). Raro.

**Coerenza dati**: hash già in memoria (`currentSourceHash` + `translation.source_hash`); manca solo `pendingLangs` (Set da aggiungere via §1). Tutto il resto è già caricato.

---

## 5. File che la FASE 2-bis toccherà

| File | Modifica |
|---|---|
| `src/services/supabase/translationJobs.ts` (o `translationStatus.ts`) | **nuova** `getPendingJobLanguages(tenant, entityType, entityId, field, sourceHash)` → `Set<string>`/`string[]` (select §1, RLS-safe, no RPC) |
| `src/components/ui/TranslationsTab/TranslationsTab.tsx` | in `loadData` fetchare anche `pendingLangs`; logica badge a 4 stati (pending > manual/auto fresh > stale); polling 5s finché `pendingLangs.size>0`; eventualmente assorbire `pendingAutoLangs` |
| `src/components/ui/TranslationsTab/TranslationRow.tsx` | nessuna modifica strutturale (badge passato come node); solo se si vuole stile dedicato "In traduzione" |
| `src/i18n/locales/{it,en,es,fr,de}/admin.json` | chiave badge "In traduzione" — esiste già `translations_tab.badge_in_progress` ("In corso"); riusare o rinominare/affiancare `badge_translating` |
| *(opzionale)* `src/hooks/usePollingEffect.ts` | estrazione hook generico — **non necessario**, inline va bene |

**Service/RPC invariati** a parte la singola `select` aggiuntiva. Nessuna nuova RPC, nessun cambio worker/edge.
