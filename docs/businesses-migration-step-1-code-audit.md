# Businesses → v2_activities Migration Plan

**Data**: 2026-03-16
**Scope**: Audit di ogni path runtime attivo che dipende da `businesses`. Nessun file modificato.

---

## Sintesi

`Businesses.tsx` (la pagina di gestione sedi) è **già completamente migrata a V2**. Le funzioni CRUD di `businesses.ts` (`addBusiness`, `updateBusiness`, `deleteBusiness`, `updateBusinessTheme`, `uploadBusinessCover`, `getBusinessBySlug`) non hanno caller attivi.

I path attivi rimanenti si riducono a **4 punti**:

| # | File | Funzione | Dipendenza su `businesses` | Tipo |
|---|------|---------|--------------------------|------|
| 1 | `src/utils/businessSlug.ts` | `ensureUniqueBusinessSlug()` | SELECT su `businesses.slug` | Query DB diretta |
| 2 | `src/pages/Dashboard/Reviews/Reviews.tsx` | chiama `getUserBusinesses(user.id)` | Via `businesses_with_capabilities` | Dropdown di selezione sede |
| 3 | `src/pages/Dashboard/Analytics/Analytics.tsx` | chiama `getUserBusinesses(user.id)` + `getAnalyticsReviews()` | Via `businesses_with_capabilities` + JOIN `businesses:business_id` | Dropdown + dati analytics |
| 4 | `supabase/functions/generate-menu-pdf/index.ts` | ownership check a linea 568 | `.from("businesses").select("id, name, user_id")` | Edge function deployata |

---

## Dettaglio per file

### 1. `src/utils/businessSlug.ts`

**Funzione**: `ensureUniqueBusinessSlug(rawName: string)`

**Caller attivi**:
- `Businesses.tsx:187` — generazione slug live mentre l'utente digita il nome (onBlur / onChange)
- `Businesses.tsx:314` — validazione slug al submit del form

**Query attuale**:
```typescript
const { data } = await supabase
    .from("businesses")
    .select("slug")
    .ilike("slug", `${baseSlug}%`);
```
Cerca slug che iniziano con `baseSlug` su tutta la tabella (scope globale).

**Query target**:
```typescript
const { data } = await supabase
    .from("v2_activities")
    .select("slug")
    .eq("tenant_id", tenantId)
    .ilike("slug", `${baseSlug}%`);
```
Scope per `tenant_id` — coerente con il constraint UNIQUE `(tenant_id, slug)` di `v2_activities`.

**Cambiamento richiesto**: la funzione deve ricevere `tenantId` come parametro aggiuntivo. I due caller in `Businesses.tsx` devono passarlo (già disponibile via `useTenantId()`).

---

### 2. `src/services/supabase/businesses.ts` — `getUserBusinesses()`

**Funzione**: `getUserBusinesses(userId: string)`

**Query attuale**:
```typescript
const { data, error } = await supabase
    .from("businesses_with_capabilities")
    .select("*")
    .eq("user_id", userId);
```
Interroga la view legacy `businesses_with_capabilities` (schedulata per DROP).

**Caller attivi**:
- `Reviews.tsx:76` — popola il dropdown di selezione sede
- `Analytics.tsx:75` — popola il dropdown filtro business

**Query target**: sostituire con `getActivities(tenantId)` da `src/services/supabase/v2/activities.ts`, già implementata:
```typescript
export async function getActivities(tenantId: string): Promise<V2Activity[]>
```
Restituisce array di `V2Activity`. Il campo `name` è presente — sufficiente per popolare i dropdown.

**Cambiamento richiesto**:
- `Reviews.tsx`: sostituire `getUserBusinesses(user.id)` con `getActivities(tenantId)` (tenantId da `useTenantId()`)
- `Analytics.tsx`: idem

**Nota**: dopo questa sostituzione `getUserBusinesses()` in `businesses.ts` diventa dead code (zero caller).

---

### 3. `src/services/supabase/reviews.ts` — `getAnalyticsReviews()`

**Funzione**: `getAnalyticsReviews()`

**Caller attivi**: `Analytics.tsx` (linea non specificata; chiamata per popolare la tabella delle recensioni con dati di analytics)

**Query attuale**:
```typescript
const { data, error } = await supabase
    .from("reviews")
    .select("..., businesses:business_id (name, user_id)");
```
JOIN su `businesses` per ottenere `name` e `user_id` dell'attività.

**Query target**:
```typescript
const { data, error } = await supabase
    .from("reviews")
    .select("..., v2_activities:activity_id (name, tenant_id)");
```
Usa `activity_id` (il nuovo FK dopo la migration SQL) e `v2_activities` come tabella di join.

**Dipendenza bloccante**: questo cambio è possibile solo **dopo** la migration SQL che:
- Aggiunge `activity_id` (FK → `v2_activities.id`) a `reviews`
- Migra le RLS policy su `reviews` da lookup su `businesses` a `v2_activities`

Fino ad allora la query deve rimanere invariata.

**Funzioni senza caller attivi** (non bloccanti):
- `getUserReviews(userId)` — nessun caller in App.tsx routes attive
- `getReviewsByUser(userId)` — nessun caller in App.tsx routes attive

---

### 4. `src/pages/Dashboard/Reviews/Reviews.tsx`

**Route**: `/reviews` — attiva in `App.tsx:198`

**Dipendenza da `businesses`**: indiretta tramite `getUserBusinesses(user.id)` da `businesses.ts`

**Uso**: popola solo il `<select>` di filtro per sede (linea ~76). Le recensioni stesse vengono caricate con `getBusinessReviews(restaurantId)` da `reviews.ts` — che non tocca `businesses`.

**Cambiamento richiesto**: sostituire `getUserBusinesses(user.id)` con `getActivities(tenantId)`.

---

### 5. `src/pages/Dashboard/Analytics/Analytics.tsx`

**Route**: `/analytics` — attiva in `App.tsx:199`

**Dipendenze da `businesses`**:
1. `getUserBusinesses(user.id)` a linea 75 — popola dropdown filtro
2. `getAnalyticsReviews()` da `reviews.ts` — JOIN su `businesses` per nome attività

**Cambiamento richiesto**:
1. Sostituire `getUserBusinesses(user.id)` con `getActivities(tenantId)` — eseguibile ora
2. Aggiornare `getAnalyticsReviews()` — **bloccato** fino a migration SQL su `reviews.activity_id`

---

### 6. `supabase/functions/generate-menu-pdf/index.ts`

**Linee**: 568–572

**Codice attuale**:
```typescript
const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, user_id")
    .eq("id", activityId)
    .single();
```
Seguita da:
```typescript
if (business.user_id !== authData.user.id) {
    return new Response("Forbidden", { status: 403 });
}
```

**Scopo**: verifica che chi richiede il PDF sia il proprietario dell'attività.

**Problema V2**: in V2, `v2_activities.tenant_id` è un UUID di `v2_tenants`, **non** uguale ad `auth.uid()`. L'ownership check deve passare per `v2_tenants.owner_user_id`.

**Query target**:
```typescript
const { data: activity, error: activityError } = await supabase
    .from("v2_activities")
    .select("id, name, tenant_id, v2_tenants!inner(owner_user_id)")
    .eq("id", activityId)
    .single();

if (activity.v2_tenants.owner_user_id !== authData.user.id) {
    return new Response("Forbidden", { status: 403 });
}
```

**Impatto**: path attivo su edge function deployata. Un errore qui causa `404` su tutte le richieste PDF.

---

## Funzioni in `businesses.ts` già dead code

Nessun caller attivo trovato per le seguenti funzioni. Possono essere eliminate in un secondo momento senza impatto runtime:

| Funzione | Ultima query |
|---------|-------------|
| `addBusiness()` | `.from("businesses").insert(...)` |
| `updateBusiness()` | `.from("businesses").update(...)` |
| `deleteBusiness()` | `.from("businesses").delete(...)` |
| `updateBusinessTheme()` | `.from("businesses").update({ theme })` |
| `uploadBusinessCover()` | `.from("businesses").update({ cover_image })` |
| `getBusinessBySlug()` | `.from("businesses").select("*").eq("slug", slug)` |

---

## Ordine di refactor consigliato

L'ordine minimizza il rischio di regressioni e rispetta i blocchi di dipendenza SQL:

### Fase A — Frontend (eseguibile ora, senza migration SQL)

1. **`ensureUniqueBusinessSlug()`** in `businessSlug.ts`
   - Aggiungere `tenantId: string` come parametro
   - Cambiare query da `businesses` a `v2_activities` con `.eq("tenant_id", tenantId)`
   - Aggiornare i due caller in `Businesses.tsx` (linee 187 e 314) per passare `tenantId`

2. **`Reviews.tsx`**
   - Sostituire import `getUserBusinesses` con `getActivities` da `v2/activities.ts`
   - Passare `tenantId` da `useTenantId()` invece di `user.id`

3. **`Analytics.tsx`** (parziale)
   - Sostituire `getUserBusinesses(user.id)` con `getActivities(tenantId)`
   - La chiamata a `getAnalyticsReviews()` resta invariata fino alla fase B

### Fase B — Edge function (indipendente, eseguibile ora)

4. **`generate-menu-pdf/index.ts`** (linee 568–572)
   - Sostituire query su `businesses` con query su `v2_activities` + join `v2_tenants`
   - Aggiornare ownership check da `user_id` a `v2_tenants.owner_user_id`
   - Deploy dell'edge function aggiornata

### Fase C — SQL migration (prerequisito per fase D)

5. **Migration SQL su `reviews`**
   - Aggiungere colonna `activity_id` (FK → `v2_activities.id` ON DELETE CASCADE)
   - Backfill `activity_id` dai dati esistenti (reviews.business_id → v2_activities.id via ID preservato nel backfill)
   - Aggiornare RLS policies su `reviews` da lookup su `businesses` a `v2_activities`
   - Rilasciare FK `reviews.business_id → businesses.id` (o mantenerla in parallelo durante transitione)

### Fase D — Frontend (sbloccata dopo fase C)

6. **`getAnalyticsReviews()`** in `reviews.ts`
   - Aggiornare JOIN da `businesses:business_id` a `v2_activities:activity_id`

### Fase E — Pulizia finale

7. Eliminare le funzioni dead da `businesses.ts` (`addBusiness`, `updateBusiness`, ecc.)
8. Dopo che tutte le route e le edge functions sono migrate, eliminare `getUserBusinesses()` da `businesses.ts`
9. Procedere con DROP di `businesses` e relative policy RLS

---

## Prerequisiti per il DROP finale di `businesses`

| Prerequisito | Stato |
|-------------|-------|
| `Businesses.tsx` usa `v2_activities` | ✅ Già completato |
| `ensureUniqueBusinessSlug()` → `v2_activities` | ❌ Da fare (Fase A) |
| `Reviews.tsx` usa `getActivities()` | ❌ Da fare (Fase A) |
| `Analytics.tsx` usa `getActivities()` | ❌ Da fare (Fase A) |
| `generate-menu-pdf` usa `v2_activities` | ❌ Da fare (Fase B) |
| Migration SQL `reviews.activity_id` | ❌ Da fare (Fase C) |
| `getAnalyticsReviews()` usa `v2_activities` | ❌ Da fare (Fase D) |
| `getUserBusinesses()` rimosso | ❌ Da fare dopo D |
| `businesses.ts` dead code rimosso | ❌ Da fare dopo D |
| `businesses_with_capabilities` DROP | ✅ In migration `20260316180000` |
| RLS policies su `reviews` migrate | ❌ Da fare (Fase C) |
