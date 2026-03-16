# Businesses Table Audit

**Data**: 2026-03-16
**Metodo**: Grep esaustivo su `src/`, `supabase/functions/`, `supabase/migrations/`

---

## Code references

| File | Tipo |
|------|------|
| `src/services/supabase/businesses.ts` | Service — CRUD completo sulla tabella |
| `src/services/supabase/reviews.ts` | Service — join e lookup via `businesses` |
| `src/utils/businessSlug.ts` | Utility — dedup degli slug |
| `src/pages/Dashboard/Businesses/Businesses.tsx` | Page — **route attiva in App.tsx** |
| `src/pages/Dashboard/Reviews/Reviews.tsx` | Page — **route attiva in App.tsx** |
| `src/pages/Dashboard/Analytics/Analytics.tsx` | Page — **route attiva in App.tsx** |
| `src/pages/Dashboard/Overview/Overview.tsx` | Page — non montata in App.tsx (dead code) |
| `src/types/Businesses.ts` | Type — `BusinessWithCapabilities` |
| `src/components/Businesses/BusinessList/BusinessList.tsx` | Component — render grid |
| `src/components/Businesses/LocationsGrid/LocationsGrid.tsx` | Component — render grid |
| `supabase/functions/generate-menu-pdf/index.ts` | Edge function — ownership check |

---

## Supabase queries

### `src/services/supabase/businesses.ts`

| Funzione | Query | Operazione |
|---------|-------|-----------|
| `getUserBusinesses()` | `.from("businesses_with_capabilities")` | SELECT (via view, non diretto) |
| `getBusinessBySlug()` | `.from("businesses").select("*").eq("slug", slug)` | SELECT |
| `addBusiness()` | `.from("businesses").insert([...])` | **INSERT** |
| `updateBusiness()` | `.from("businesses").update(updates).eq("id", id)` | **UPDATE** |
| `deleteBusiness()` | `.from("businesses").delete().eq("id", id)` | **DELETE** |
| `updateBusinessTheme()` | `.from("businesses").update({ theme }).eq("id", businessId)` | **UPDATE** |
| `uploadBusinessCover()` | `.from("businesses").update({ cover_image }).eq("id", id)` | **UPDATE** |

### `src/services/supabase/reviews.ts`

| Funzione | Query | Operazione |
|---------|-------|-----------|
| `getUserReviews()` | `.from("businesses").select("id").eq("user_id", userId)` | SELECT — recupera business IDs per filtrare le recensioni |
| `getReviewsByUser()` | `.from("reviews").select("*, businesses!inner(user_id)")` | SELECT con JOIN su `businesses` |
| `getAnalyticsReviews()` | `.from("reviews").select("..., businesses:business_id (name, user_id)")` | SELECT con JOIN su `businesses` |

### `src/utils/businessSlug.ts`

| Funzione | Query | Operazione |
|---------|-------|-----------|
| `ensureUniqueBusinessSlug()` | `.from("businesses").select("slug").ilike("slug", ...)` | SELECT — verifica unicità dello slug prima della creazione |

Chiamata da `Businesses.tsx` a ogni modifica del nome in fase di creazione (linea 187, 314).

### `supabase/functions/generate-menu-pdf/index.ts`

```typescript
// linea 568-572
const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, user_id")
    .eq("id", activityId)
    .single();
```

Usata come **ownership check** prima di generare il PDF. Se il record non esiste nella tabella `businesses`, la funzione ritorna `404`. Questo è un path attivo nell'edge function deployata.

---

## SQL dependencies

### Views

| View | Dipendenza | Stato |
|------|-----------|-------|
| `public.businesses_with_capabilities` | `FROM public.businesses` (CTE principale) | Schedulata per DROP in migration `20260316180000_prepare_legacy_drop.sql` |

---

### Functions / Triggers

| Funzione | Dipendenza su `businesses` | Stato |
|---------|--------------------------|-------|
| `public.duplicate_collection()` | Nessuna | (già schedulata per DROP per altri motivi) |
| `public.enforce_collection_item_section_category()` | Nessuna | (già schedulata per DROP) |
| Nessun'altra funzione attiva | — | — |

Nessuna funzione SQL live (oltre a `businesses_with_capabilities`) referenzia direttamente `businesses`.

---

### Foreign keys che puntano a `businesses`

| Tabella figlia | Colonna | Constraint | Azione |
|---------------|---------|-----------|--------|
| `business_collection_schedules` | `business_id` | FK → `businesses.id` ON DELETE CASCADE | Tabella legacy, in scope drop |
| `business_item_overrides` | `business_id` | FK → `businesses.id` ON DELETE CASCADE | Tabella legacy, in scope drop |
| `qr_scans` | `business_id` | FK → `businesses.id` ON DELETE CASCADE | Tabella legacy (non nella lista attuale) |
| **`reviews`** | `business_id` | FK → `businesses.id` ON DELETE CASCADE | ⚠️ **Tabella attiva** — Review page usa `reviews` |

La tabella `reviews` ha una FK HARD su `businesses.id`. Droppare `businesses` senza prima migrare `reviews.business_id` → `v2_activities.id` causerebbe la perdita del constraint o un errore di DROP.

---

### RLS policies

**Policies sulla tabella `businesses` stessa (5):**
- `businesses_delete_owner` — `USING (user_id = auth.uid())`
- `businesses_insert_owner` — `WITH CHECK (user_id = auth.uid())`
- `businesses_public_select` — nessuna condizione (pubblica)
- `businesses_select_owner` — `USING (user_id = auth.uid())`
- `businesses_update_owner` — `USING (user_id = auth.uid())`

Si eliminano con il DROP della tabella.

**Policies su altre tabelle che usano `businesses` come lookup:**

| Policy | Tabella | Query su `businesses` |
|--------|---------|----------------------|
| `qr_scans_select_owner` | `qr_scans` | `SELECT 1 FROM businesses b WHERE b.id = qr_scans.business_id AND b.user_id = auth.uid()` |
| `Users can read reviews of their restaurants` | `reviews` | `business_id IN (SELECT businesses.id FROM businesses WHERE user_id = auth.uid())` |
| `reviews_delete_business_owner` | `reviews` | `EXISTS (SELECT 1 FROM businesses b WHERE ...)` |

Le policies su `reviews` sono **attive**: la Reviews page è una route montata in App.tsx (linea 198). Queste policy governano chi può leggere e cancellare recensioni. Droppare `businesses` le renderebbe invalide.

---

## Runtime usage

### Path attivi in App.tsx che toccano `businesses`

#### 1. `/locations` — `Businesses.tsx`
- Chiama `ensureUniqueBusinessSlug()` → **SELECT** su `businesses`
- Chiama `addBusiness()` → **INSERT** su `businesses`
- Chiama `updateBusiness()` → **UPDATE** su `businesses`
- Chiama `getUserBusinesses()` → SELECT su `businesses_with_capabilities` (view su `businesses`)

Il processo di **creazione di una nuova sede** nel UI passa quindi per `businesses`.
Confermato dal codice: i dati inseriti nel form (nome, città, indirizzo, slug, tipo) vengono scritti in `businesses`, non in `v2_activities`.

#### 2. `/reviews` — `Reviews.tsx`
- Chiama `getUserReviews()` → **SELECT** su `businesses` per ottenere gli IDs
- `getAnalyticsReviews()` → JOIN su `businesses` per nome e owner

#### 3. `/analytics` — `Analytics.tsx`
- Chiama `getUserBusinesses()` → SELECT su `businesses_with_capabilities`

#### 4. Edge function `generate-menu-pdf`
- Verifica l'ownership dell'attività cercando il record in `businesses`
- Se la tabella è vuota o droppata, tutte le richieste di generazione PDF ritornano `404`

---

## Conclusione

```
REQUIRES MIGRATION
```

La tabella `businesses` è un nodo centrale dell'architettura legacy ancora completamente operativo a runtime. Tre path distinti la usano attivamente:

1. **Scrittura diretta**: `addBusiness()`, `updateBusiness()`, `deleteBusiness()` — la creazione e gestione delle sedi ancora scrive su `businesses`, non su `v2_activities`. Il drop causerebbe l'interruzione immediata della funzionalità di gestione sedi.

2. **Reviews attive**: `reviews.ts` fa lookup su `businesses` per tutti i flow di lettura recensioni; le policy RLS su `reviews` dipendono da `businesses` per l'access control. Il drop renderebbe inaccessibili le recensioni.

3. **Edge function deployata**: `generate-menu-pdf` verifica l'ownership tramite `businesses`. Con la tabella vuota o droppata, tutti i PDF falliscono con `404`.

### Prerequisiti per il drop

Per poter eliminare `businesses` sarà necessario:

| Azione | File coinvolto |
|--------|---------------|
| Migrare `addBusiness()` → scrivere su `v2_activities` | `businesses.ts` |
| Migrare `updateBusiness()`, `deleteBusiness()` → `v2_activities` | `businesses.ts` |
| Migrare `getBusinessBySlug()` → `v2_activities` | `businesses.ts` |
| Migrare `updateBusinessTheme()` → `v2_activities` o `v2_styles` | `businesses.ts` |
| Migrare `ensureUniqueBusinessSlug()` → cercare slug in `v2_activities` | `businessSlug.ts` |
| Migrare `getUserReviews()` e `getAnalyticsReviews()` → usare `v2_activities` | `reviews.ts` |
| Migrare FK `reviews.business_id` → `v2_activities.id` | migration SQL |
| Aggiornare RLS policies su `reviews` → usare `v2_activities` | migration SQL |
| Aggiornare `generate-menu-pdf` ownership check → `v2_activities` | edge function |
