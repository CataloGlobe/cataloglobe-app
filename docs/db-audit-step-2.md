# Database Audit Report — Step 2

**Data**: 2026-03-16
**Scope**: Verifica dipendenze reali — quali servizi legacy sono usati da path UI attive
**Metodo**: Analisi import graph, routing in App.tsx, lettura diretta dei file di servizio e componenti

---

## Obiettivo

Lo Step 1 ha classificato le tabelle. Lo Step 2 risponde a: **cosa è ancora vivo nel codice frontend?**

Per ogni servizio legacy, si verifica:
1. Quali componenti lo importano
2. Se quei componenti sono montati da route attive in App.tsx
3. Quale tabella/view effettivamente interrogano

---

## 1. Stato dei servizi legacy

### `src/services/supabase/businesses.ts`

| Funzione | Usata da | Route attiva? |
|----------|----------|---------------|
| `getUserBusinesses()` | `Reviews.tsx` | ✅ `/business/:id/reviews` |
| `getUserBusinesses()` | `Analytics.tsx` | ✅ `/business/:id/analytics` |
| `getUserBusinesses()` | `Collections.tsx` | ❌ Nessuna route |
| `getUserBusinesses()` | `Overview.tsx` (legacy) | ❌ Superseded da `OverviewPage` |

**Tabella interrogata**: `businesses_with_capabilities` (view legacy)

**Verdetto**: ⚠️ PARZIALMENTE ATTIVO — Reviews e Analytics dipendono ancora da questo servizio. Le altre importazioni sono dead code.

---

### `src/services/supabase/collections.ts`

**Importato da**: `CatalogManager.tsx`, `CollectionBuilder.tsx`, `CreateItemDrawer.tsx`, `PickItemDrawer.tsx`, `Collections.tsx`

Nessuno di questi componenti è montato da route attive in App.tsx.

**Tabelle interrogate**: `collections`, `collection_sections`, `collection_items`, `business_collection_schedules`, `items`, `item_categories`, `v2_schedule_price_overrides`

La funzione `getPublicBusinessCollection()` (che usa `v2_catalog_sections` e `v2_catalog_items`) non ha **zero chiamate** nell'intero codebase.

**Verdetto**: ❌ DEAD CODE — nessuna route attiva raggiunge questo servizio.

---

### `src/services/supabase/categories.ts`

**Importato da**: `CollectionBuilder/CreateItemDrawer.tsx` (componente orfano)

**Tabella interrogata**: `item_categories`

**Verdetto**: ❌ DEAD CODE

---

### `src/services/supabase/overrides.ts`

**Importato da**: `Businesses/BusinessOverrides/BusinessOverrides.tsx`

`BusinessOverrides` non è importato da nessuna pagina/route attiva.

**Tabelle interrogate**: `business_item_overrides`

**Verdetto**: ❌ DEAD CODE

---

### `src/services/supabase/schedules.ts`

**Importato da**: `Businesses/BusinessCollectionSchedule/BusinessCollectionSchedule.tsx`

`BusinessCollectionSchedule` non è montato da nessuna route attiva. Il servizio v2 equivalente è `src/services/supabase/v2/layoutScheduling.ts`.

**Tabelle interrogate**: `business_collection_schedules`

**Verdetto**: ❌ DEAD CODE

---

### `src/services/supabase/reviews.ts`

| Funzione | Usata da | Route attiva? |
|----------|----------|---------------|
| `getBusinessReviews()` | `Reviews.tsx` | ✅ `/business/:id/reviews` |
| `deleteReview()` | `Reviews.tsx` | ✅ `/business/:id/reviews` |
| `getAnalyticsReviews()` | `Analytics.tsx` | ✅ `/business/:id/analytics` |
| `getUserReviews()` | — | ❌ Non chiamata |

**Tabelle interrogate**: `reviews`, `businesses` (join)

**Verdetto**: ✅ ATTIVO — Due pagine attive dipendono da questo servizio. La tabella `reviews` non ha equivalente v2.

---

### `src/services/supabase/resolveBusinessCollections.ts`

Wrapper thin che delega a `resolveActivityCatalogsV2()`. Tecnicamente v2-safe.

Chiamato da `BusinessCollectionSchedule` e `BusinessOverrides` — entrambi componenti orfani.

**Verdetto**: ⚠️ SAFE MA ORFANO — il file può essere rimosso insieme ai componenti che lo usano.

---

## 2. Stato tabelle "dubbie"

### `reviews`

- Letta da `reviews.ts` → Reviews page (✅ route attiva) e Analytics page (✅ route attiva)
- Non ha equivalente v2
- Non è una tabella legacy da backfill: è una feature indipendente

**Verdetto**: ✅ TABELLA ATTIVA — non toccare senza prima pianificare una migrazione v2.

---

### `qr_scans`

- Letta da `src/services/supabase/qrScans.ts` → `Analytics.tsx` (✅ route attiva)
- Nessun frontend scrive su questa tabella
- Non è chiaro se sistemi esterni (edge function, trigger, scansioni QR) la popolino ancora

**Verdetto**: ⚠️ LETTA MA NON SCRITTA DAL FRONTEND — verificare se è ancora popolata a runtime prima di pianificarne la rimozione.

---

### `businesses_with_capabilities` (view)

- Interrogata da `getUserBusinesses()` in `businesses.ts`
- Usata da Reviews e Analytics (route attive)
- Probabilmente dipende dalla tabella `businesses` (legacy)

**Verdetto**: ⚠️ ATTIVA ma con dipendenze legacy. Rimuovibile solo dopo aver migrato Reviews e Analytics al modello v2.

---

### `v2_catalog_sections` e `v2_catalog_items`

- `v2_catalog_sections`: usata solo in `getPublicBusinessCollection()` → funzione mai chiamata (dead code)
- `v2_catalog_items`: usata in `getPublicBusinessCollection()` (dead) + in `src/services/supabase/v2/products.ts` per determinare l'associazione prodotto-catalogo

Il CatalogEngine.tsx usa il modello nuovo (`v2_catalog_categories` + `v2_catalog_category_products`) via `v2/catalogs.ts`.

**Verdetto**:
- `v2_catalog_sections`: ❌ non più interrogata da codice attivo → candidata a drop
- `v2_catalog_items`: ⚠️ ancora letta da `v2/products.ts` per metadata dei prodotti → verificare se rimovibile o da sostituire con query a `v2_catalog_category_products`

---

## 3. Stato funzioni SQL legacy

### `duplicate_collection()`

- Wrappata da `duplicateCollection()` in `collections.ts`
- `duplicateCollection()` non è mai chiamata da nessun componente attivo

**Verdetto**: ❌ DEAD — può essere droppata insieme alle tabelle legacy che opera su.

---

### `accept_tenant_invite_rpc()`

- Sostituita completamente da `accept_invite_by_token()`
- Non presente in nessun file frontend

**Verdetto**: ❌ SOSTITUITA — verificare se ancora presente nel DB e, in caso, droppare.

---

## 4. Mappa dipendenze legacy ancora vive

Queste sono le uniche dipendenze legacy che bloccano un cleanup diretto:

```
Reviews page (route attiva)
  └─ reviews.ts
       └─ tabelle: reviews, businesses (join)

Analytics page (route attiva)
  └─ businesses.ts → getUserBusinesses()
  │    └─ view: businesses_with_capabilities
  │         └─ dipende da: businesses (presumibilmente)
  └─ reviews.ts → getAnalyticsReviews()
  │    └─ tabelle: reviews, businesses (join)
  └─ qrScans.ts → getAnalyticsQrScans()
       └─ tabella: qr_scans
```

Tutto il resto (CollectionBuilder, BusinessOverrides, BusinessCollectionSchedule, Collections page, CatalogManager) è dead code.

---

## 5. Riepilogo operativo

### Eliminabili subito (nessuna route attiva dipende da loro)

| Oggetto | Tipo | Azione |
|---------|------|--------|
| `src/services/supabase/collections.ts` | File servizio | Eliminare |
| `src/services/supabase/categories.ts` | File servizio | Eliminare |
| `src/services/supabase/overrides.ts` | File servizio | Eliminare |
| `src/services/supabase/schedules.ts` | File servizio | Eliminare |
| `src/services/supabase/resolveBusinessCollections.ts` | File servizio | Eliminare |
| `src/components/CollectionBuilder/` | Componente | Eliminare |
| `src/components/CatalogManager/` | Componente | Eliminare |
| `src/components/Businesses/BusinessOverrides/` | Componente | Eliminare |
| `src/components/Businesses/BusinessCollectionSchedule/` | Componente | Eliminare |
| `src/pages/Dashboard/Collections/` | Pagina | Eliminare |
| `src/domain/schedules/scheduleUtils.ts` | Utility | Verificare e probabilmente eliminare |
| `duplicate_collection()` | Funzione SQL | Droppare |
| `accept_tenant_invite_rpc()` | Funzione SQL | Droppare (se presente in DB) |
| `businesses` | Tabella legacy | Droppare dopo aver risolto i blockers |
| `items` | Tabella legacy | Droppare dopo aver risolto i blockers |
| `collections` | Tabella legacy | Droppare dopo aver risolto i blockers |
| `collection_sections` | Tabella legacy | Droppare dopo aver risolto i blockers |
| `collection_items` | Tabella legacy | Droppare dopo aver risolto i blockers |
| `business_item_overrides` | Tabella legacy | Droppare dopo aver risolto i blockers |
| `business_collection_schedules` | Tabella legacy | Droppare dopo aver risolto i blockers |
| `item_categories` | Tabella legacy | Droppare dopo aver risolto i blockers |
| `businesses_with_capabilities` | View legacy | Droppare dopo migrazione Reviews/Analytics |
| `v2_catalog_sections` | Tabella v2 superseded | Droppare (non più interrogata) |

### Richiedono migrazione prima del cleanup

| Dipendenza attiva | Blocca | Piano |
|-------------------|--------|-------|
| `Reviews.tsx` → `reviews.ts` → `businesses` | Tabella `businesses`, tabella `reviews`, view `businesses_with_capabilities` | Migrare Reviews a v2 (creare `v2_reviews` o riconsiderare la feature) |
| `Analytics.tsx` → `businesses.ts` → `businesses_with_capabilities` | View e tabella `businesses` | Migrare Analytics a `useTenant()` + `v2_activities` |
| `Analytics.tsx` → `qrScans.ts` → `qr_scans` | Tabella `qr_scans` | Verificare se popolata; migrare o rimuovere la feature |
| `v2/products.ts` → `v2_catalog_items` | Tabella `v2_catalog_items` | Sostituire query con `v2_catalog_category_products` |

### Da verificare manualmente

| Elemento | Domanda aperta |
|----------|----------------|
| `qr_scans` | Ancora popolata da sistemi esterni? Edge functions o trigger attivi che ci scrivono? |
| `business-items` storage bucket | Contiene dati referenziati da URL salvati in DB? Prima di rimuovere verificare le colonne `image_url` nelle tabelle legacy |
| `v2_catalog_items` in `v2/products.ts` | La query può essere sostituita con `v2_catalog_category_products` senza perdita di dati? |

---

## 6. Prossimi step proposti

**Step 3 — Cleanup dead code frontend**: Eliminare tutti i file/componenti/servizi identificati come dead code (nessun rischio, non ci sono route attive).

**Step 4 — Migrazione Reviews e Analytics**: Riscrivere i due servizi per usare v2 (rimuove le ultime dipendenze su `businesses.ts`, `reviews.ts`, `businesses_with_capabilities`).

**Step 5 — Verifica qr_scans e v2_catalog_items**: Due verifiche puntuali per sbloccare il cleanup finale.

**Step 6 — Drop tabelle legacy**: Una volta rimossi tutti i riferimenti, creare migration per droppare le 8 tabelle legacy + oggetti SQL correlati.
