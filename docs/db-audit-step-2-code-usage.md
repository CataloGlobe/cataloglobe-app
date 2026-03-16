# Legacy Table Usage Report — Step 2

**Data**: 2026-03-16
**Scope**: Tracciamento completo delle dipendenze codice per ogni tabella legacy identificata nello Step 1
**Metodo**: Analisi di tutte le chiamate `.from("...")`, catene di import fino ai componenti UI, verifica route in App.tsx

---

## businesses

### File che la utilizzano

| File | Funzioni | Tabella usata |
|------|----------|---------------|
| `src/services/supabase/businesses.ts` | `getUserBusinesses()` | `businesses_with_capabilities` (view su businesses) |
| `src/services/supabase/businesses.ts` | `getBusinessBySlug()` | `businesses` |
| `src/services/supabase/businesses.ts` | `addBusiness()` | `businesses` |
| `src/services/supabase/businesses.ts` | `updateBusiness()` | `businesses` |
| `src/services/supabase/businesses.ts` | `deleteBusiness()` | `businesses` |
| `src/services/supabase/businesses.ts` | `updateBusinessTheme()` | `businesses` |
| `src/services/supabase/businesses.ts` | `uploadBusinessCover()` | `businesses` |
| `src/services/supabase/reviews.ts` | `getUserReviews()` | `businesses` (per ottenere ID ristoranti) |
| `src/utils/businessSlug.ts` | `ensureUniqueBusinessSlug()` | `businesses` (controlla slug esistenti) |
| `supabase/functions/generate-menu-pdf/index.ts` | handler | `businesses` |

### Componenti UI che dipendono da questi file

| Importatore | Funzione importata | Route | Stato |
|-------------|-------------------|-------|-------|
| `src/pages/Dashboard/Reviews/Reviews.tsx` | `getUserBusinesses` | `/business/:id/reviews` | **ATTIVO** |
| `src/pages/Dashboard/Analytics/Analytics.tsx` | `getUserBusinesses` | `/business/:id/analytics` | **ATTIVO** |
| `src/pages/Dashboard/Overview/Overview.tsx` | `getUserBusinesses` | **NON MONTATA** (App.tsx usa `Business/OverviewPage`) | **CODICE MORTO** |
| `src/pages/Dashboard/Collections/Collections.tsx` | `getUserBusinesses` | **NON MONTATA** (App.tsx usa `Dashboard/Catalogs/Catalogs`) | **CODICE MORTO** |
| `src/pages/Dashboard/Businesses/Businesses.tsx` | `ensureUniqueBusinessSlug` (da businessSlug.ts) | `/business/:id/locations` | **ATTIVO** |

### Stato utilizzo: ATTIVO

La tabella `businesses` e ancora referenziata da pagine attive (Reviews, Analytics, Businesses). L'edge function `generate-menu-pdf` la usa direttamente.

### Raccomandazione: MIGRARE A V2

- Reviews e Analytics usano `getUserBusinesses()` per ottenere la lista dei ristoranti → dovrebbe usare v2_activities
- `ensureUniqueBusinessSlug` controlla slug su businesses → dovrebbe controllare su v2_activities
- `generate-menu-pdf` edge function → da aggiornare per usare v2_activities
- `addBusiness`, `updateBusiness`, `deleteBusiness`, `updateBusinessTheme`, `uploadBusinessCover` → verificare se sono ancora chiamate da UI attive o solo da codice morto

---

## items

### File che la utilizzano

| File | Funzioni | Tabella usata |
|------|----------|---------------|
| `src/services/supabase/collections.ts` | `listItems()` | `items` |
| `src/services/supabase/collections.ts` | `getItem()` | `items` |
| `src/services/supabase/collections.ts` | `createItem()` | `items` |
| `src/services/supabase/collections.ts` | `deleteItem()` | `items` |
| `src/services/supabase/collections.ts` | `updateItem()` | `items` |
| `src/services/supabase/collections.ts` | `getCollectionItemsWithData()` | `items` (join con collection_items) |

### Componenti UI che dipendono da questi file

| Importatore | Funzione importata | Route | Stato |
|-------------|-------------------|-------|-------|
| `src/pages/Dashboard/Collections/Collections.tsx` | `listItems` + altre | **NON MONTATA** | **CODICE MORTO** |
| `src/components/CollectionBuilder/CollectionBuilder.tsx` | `getCollectionBuilderData` + altre | usato da Collections.tsx → **NON MONTATA** | **CODICE MORTO** |
| `src/components/CollectionBuilder/PickItemDrawer/PickItemDrawer.tsx` | `listItems` | usato da CollectionBuilder → **NON MONTATA** | **CODICE MORTO** |
| `src/components/CatalogManager/CatalogManager.tsx` | funzioni collections | usato da Collections.tsx → **NON MONTATA** | **CODICE MORTO** |
| `src/components/Businesses/BusinessOverrides/BusinessOverrides.tsx` | `getCollectionItemsWithData` | usato da BusinessCard → Businesses.tsx → `/business/:id/locations` | **ATTIVO** |

### Stato utilizzo: ATTIVO (parziale)

La tabella `items` e ancora usata **attivamente** dal componente BusinessOverrides (che mostra override prezzi/visibilita per sede). La maggior parte degli altri usi e codice morto (Collections page non montata).

### Raccomandazione: MIGRARE A V2

BusinessOverrides deve essere migrato per usare v2_products + v2_activity_product_overrides.

---

## collections

### File che la utilizzano

| File | Funzioni | Tabella usata |
|------|----------|---------------|
| `src/services/supabase/collections.ts` | `getCollections()` | `collections` |
| `src/services/supabase/collections.ts` | `getCollectionById()` | `collections` |
| `src/services/supabase/collections.ts` | `createCollection()` | `collections` |
| `src/services/supabase/collections.ts` | `deleteCollection()` | `collections` |
| `src/services/supabase/collections.ts` | `duplicate_collection` (RPC) | `collections` |
| `src/services/supabase/collections.ts` | `getCollectionBuilderData()` | `collections` + sections + items |
| `src/components/Businesses/BusinessCollectionSchedule/BusinessCollectionSchedule.tsx` | query diretta `.from("collections")` | `collections` |

### Componenti UI che dipendono da questi file

| Importatore | Funzione importata | Route | Stato |
|-------------|-------------------|-------|-------|
| `src/pages/Dashboard/Collections/Collections.tsx` | molte funzioni | **NON MONTATA** | **CODICE MORTO** |
| `src/components/CollectionBuilder/CollectionBuilder.tsx` | `getCollectionBuilderData` + altre | usato da Collections.tsx → **NON MONTATA** | **CODICE MORTO** |
| `src/components/Businesses/BusinessCollectionSchedule/BusinessCollectionSchedule.tsx` | query diretta + `resolveBusinessCollections` | usato da BusinessCard → Businesses.tsx → `/business/:id/locations` | **ATTIVO** |

### Stato utilizzo: ATTIVO (parziale)

Usata attivamente solo da BusinessCollectionSchedule (query diretta nel componente per risolvere il nome della collection attiva). Il resto e codice morto.

### Raccomandazione: MIGRARE A V2

BusinessCollectionSchedule deve essere riscritto per usare v2_schedules + v2_catalogs.

---

## collection_sections

### File che la utilizzano

| File | Funzioni | Tabella usata |
|------|----------|---------------|
| `src/services/supabase/collections.ts` | `createSection()`, `updateSection()`, `deleteSection()`, `getSectionItems()`, `getCollectionBuilderData()`, `getCollectionItemsWithData()` | `collection_sections` |

### Componenti UI che dipendono da questi file

| Importatore | Route | Stato |
|-------------|-------|-------|
| `src/pages/Dashboard/Collections/Collections.tsx` | **NON MONTATA** | **CODICE MORTO** |
| `src/components/CollectionBuilder/CollectionBuilder.tsx` | **NON MONTATA** | **CODICE MORTO** |
| `src/components/Businesses/BusinessOverrides/BusinessOverrides.tsx` | **ATTIVO** (via `getCollectionItemsWithData`) | **ATTIVO** |

### Stato utilizzo: ATTIVO (parziale)

Usata indirettamente da BusinessOverrides via `getCollectionItemsWithData` che fa join con collection_sections per recuperare i dati strutturati.

### Raccomandazione: MIGRARE A V2

Verra eliminata quando BusinessOverrides migra a v2_catalog_categories.

---

## collection_items

### File che la utilizzano

| File | Funzioni | Tabella usata |
|------|----------|---------------|
| `src/services/supabase/collections.ts` | `getSectionItems()`, `addItemToSection()`, `reorderSectionItems()`, `removeCollectionItem()`, `getCollectionBuilderData()`, `getCollectionItemsWithData()` | `collection_items` |

### Componenti UI che dipendono da questi file

Stesso pattern di `collection_sections` — usata indirettamente da BusinessOverrides.

### Stato utilizzo: ATTIVO (parziale)

### Raccomandazione: MIGRARE A V2

Verra eliminata quando BusinessOverrides migra a v2_catalog_category_products.

---

## business_item_overrides

### File che la utilizzano

| File | Funzioni | Tabella usata |
|------|----------|---------------|
| `src/services/supabase/overrides.ts` | `getBusinessOverridesForItems()` | `business_item_overrides` |
| `src/services/supabase/overrides.ts` | `upsertBusinessItemOverride()` | `business_item_overrides` |

### Componenti UI che dipendono da questi file

| Importatore | Route | Stato |
|-------------|-------|-------|
| `src/components/Businesses/BusinessOverrides/BusinessOverrides.tsx` | via BusinessCard → Businesses.tsx → `/business/:id/locations` | **ATTIVO** |

### Stato utilizzo: ATTIVO

BusinessOverrides e montato attivamente nella pagina Sedi. Legge e scrive override su questa tabella legacy.

### Raccomandazione: MIGRARE A V2

Migrare BusinessOverrides per usare `v2_activity_product_overrides` tramite i servizi in `src/services/supabase/v2/activities.ts`.

---

## business_collection_schedules

### File che la utilizzano

| File | Funzioni | Tabella usata |
|------|----------|---------------|
| `src/services/supabase/schedules.ts` | `listBusinessSchedules()` | `business_collection_schedules` (join con `collections`) |
| `src/services/supabase/schedules.ts` | `createBusinessSchedule()` | `business_collection_schedules` |
| `src/services/supabase/schedules.ts` | `updateBusinessSchedule()` | `business_collection_schedules` |
| `src/services/supabase/schedules.ts` | `deleteBusinessSchedule()` | `business_collection_schedules` |
| `src/services/supabase/collections.ts` | `getCollections()` | `business_collection_schedules` (join per conteggio) |

### Componenti UI che dipendono da questi file

| Importatore | Funzione importata | Route | Stato |
|-------------|-------------------|-------|-------|
| `src/components/Businesses/BusinessOverrides/BusinessOverrides.tsx` | `listBusinessSchedules` | `/business/:id/locations` | **ATTIVO** |
| `src/components/Businesses/BusinessCollectionSchedule/BusinessCollectionSchedule.tsx` | `listBusinessSchedules`, `createBusinessSchedule`, `updateBusinessSchedule`, `deleteBusinessSchedule` | `/business/:id/locations` | **ATTIVO** |
| `src/components/Businesses/BusinessCollectionSchedule/ScheduleRuleDrawer.tsx` | `BusinessScheduleRow` (tipo) | `/business/:id/locations` | **ATTIVO** |
| `src/domain/schedules/scheduleUtils.ts` | `BusinessScheduleRow` (tipo) | usato da BusinessCollectionSchedule | **ATTIVO** |

### Stato utilizzo: ATTIVO

Tutto il sistema di scheduling legacy e attivamente montato nella pagina Sedi tramite il componente BusinessCollectionSchedule dentro BusinessCard.

### Raccomandazione: MIGRARE A V2

Riscrivere BusinessCollectionSchedule per usare `v2_schedules` + `v2_schedule_targets` tramite `src/services/supabase/v2/layoutScheduling.ts`.

---

## item_categories

### File che la utilizzano

| File | Funzioni | Tabella usata |
|------|----------|---------------|
| `src/services/supabase/categories.ts` | `createItemCategory()` | `item_categories` |
| `src/services/supabase/collections.ts` | `listItemCategories()` | `item_categories` |
| `src/services/supabase/collections.ts` | `getCollectionItemsWithData()` | `item_categories` (join) |

### Componenti UI che dipendono da questi file

| Importatore | Funzione importata | Route | Stato |
|-------------|-------------------|-------|-------|
| `src/components/CollectionBuilder/CreateItemDrawer/CreateItemDrawer.tsx` | `createItemCategory` | usato da CollectionBuilder → Collections.tsx → **NON MONTATA** | **CODICE MORTO** |
| `src/components/Businesses/BusinessOverrides/BusinessOverrides.tsx` | `getCollectionItemsWithData` (indiretto) | `/business/:id/locations` | **ATTIVO** (indiretto) |

### Stato utilizzo: ATTIVO (indiretto)

`createItemCategory` e codice morto. Ma `item_categories` e ancora letta indirettamente da BusinessOverrides via `getCollectionItemsWithData` che fa join con questa tabella.

### Raccomandazione: MIGRARE A V2

Eliminare `categories.ts`. La dipendenza indiretta cadra quando BusinessOverrides viene migrato a v2.

---

## File legacy probabilmente eliminabili

### Servizi Supabase non-v2

| File | Stato | Motivo |
|------|-------|--------|
| `src/services/supabase/upload.ts` | **CODICE MORTO** | Non importato da nessun file. Contiene `uploadBusinessItemImage` (bucket `business-items`) e `uploadCatalogItemImage` (bucket `catalog-items`). Quest'ultima potrebbe essere utile ma non e importata |
| `src/services/supabase/categories.ts` | **QUASI MORTO** | Importata solo da CreateItemDrawer → CollectionBuilder → Collections.tsx che NON e montata. Dipendenza indiretta via collections.ts e l'unica strada attiva |
| `src/services/supabase/overrides.ts` | **ATTIVO** | Usato da BusinessOverrides (montato) |
| `src/services/supabase/schedules.ts` | **ATTIVO** | Usato da BusinessOverrides + BusinessCollectionSchedule (montati) |
| `src/services/supabase/collections.ts` | **PARZIALMENTE ATTIVO** | ~80% delle funzioni sono codice morto. Funzioni ancora attive: `getCollectionItemsWithData`, `getCollections` (usate da BusinessOverrides/BusinessCollectionSchedule) |
| `src/services/supabase/businesses.ts` | **PARZIALMENTE ATTIVO** | `getUserBusinesses` ancora usata da Reviews/Analytics attivi. `addBusiness`, `updateBusiness`, ecc. → da verificare se usati da Businesses.tsx (pagina montata) |
| `src/services/supabase/reviews.ts` | **ATTIVO** | Usato da Reviews.tsx e Analytics.tsx (entrambi montati) |
| `src/services/supabase/qrScans.ts` | **ATTIVO** | Usato da Analytics.tsx (montato) |
| `src/services/supabase/resolveBusinessCollections.ts` | **WRAPPER V2** | Delega interamente a `resolveActivityCatalogsV2`. Usato attivamente ma sicuro — non tocca tabelle legacy |
| `src/services/supabase/profile.ts` | **ATTIVO (non legacy)** | Tabella `profiles` e CORE, non legacy. Usato da useProfile, Profile, WorkspaceSettingsPage |
| `src/services/supabase/auth.ts` | **ATTIVO (non legacy)** | Servizio auth puro. Usato da Login, SignUp, ForgotPassword, WorkspaceSettingsPage |
| `src/services/supabase/client.ts` | **ATTIVO (infrastruttura)** | Client Supabase condiviso |

### Servizi non-v2 sicuramente eliminabili

| File | Motivo |
|------|--------|
| `src/services/supabase/upload.ts` | Non importato da nessuna parte |

### Servizi non-v2 eliminabili dopo migrazione BusinessOverrides/BusinessCollectionSchedule

| File | Motivo |
|------|--------|
| `src/services/supabase/overrides.ts` | Unico consumatore e BusinessOverrides |
| `src/services/supabase/schedules.ts` | Unici consumatori sono BusinessOverrides + BusinessCollectionSchedule |
| `src/services/supabase/categories.ts` | Unica via attiva e indiretta via collections.ts |

### Servizi non-v2 eliminabili dopo migrazione Reviews/Analytics

| File | Motivo |
|------|--------|
| `src/services/supabase/reviews.ts` | Unici consumatori sono Reviews.tsx e Analytics.tsx |
| `src/services/supabase/qrScans.ts` | Unico consumatore e Analytics.tsx |

---

## Codice morto individuato

### Pagine non montate in App.tsx

| File | Motivo |
|------|--------|
| `src/pages/Dashboard/Overview/Overview.tsx` | App.tsx importa `pages/Business/OverviewPage` al suo posto. Overview.tsx usa `getUserBusinesses` e query diretta su `reviews` — tutto legacy |
| `src/pages/Dashboard/Collections/Collections.tsx` | App.tsx importa `pages/Dashboard/Catalogs/Catalogs` al suo posto. Collections.tsx e l'intero sistema legacy di gestione cataloghi |
| `src/pages/Dashboard/Settings/Settings.tsx` | App.tsx importa `pages/Business/BusinessSettingsPage` al suo posto |

### Componenti orfani (usati solo da pagine morte)

| Componente | Usato da | Stato |
|-----------|----------|-------|
| `src/components/CollectionBuilder/CollectionBuilder.tsx` | Collections.tsx (morta) | **CODICE MORTO** |
| `src/components/CollectionBuilder/PickItemDrawer/PickItemDrawer.tsx` | CollectionBuilder (morto) | **CODICE MORTO** |
| `src/components/CollectionBuilder/CreateItemDrawer/CreateItemDrawer.tsx` | CollectionBuilder (morto) + CatalogManager (morto) | **CODICE MORTO** |
| `src/components/CollectionBuilder/EditItemDrawer/EditItemDrawer.tsx` | CatalogManager (morto) | **CODICE MORTO** |
| `src/components/CollectionBuilder/ItemRow/ItemRow.tsx` | CatalogManager (morto) | **CODICE MORTO** |
| `src/components/CatalogManager/CatalogManager.tsx` | Collections.tsx (morta) | **CODICE MORTO** |

### Utility orfane

| File | Motivo |
|------|--------|
| `src/domain/schedules/scheduleUtils.ts` | Importa tipi da `schedules.ts` (legacy). Usato da BusinessCollectionSchedule (attivo) — **NON e morto**, ma usa tipi legacy |

---

## Riepilogo dipendenze per priorita di migrazione

### Blocco 1: BusinessCard legacy (ALTA PRIORITA)

Il componente `BusinessCard/BusinessCard.tsx` (usato nella pagina Sedi `/business/:id/locations`) e il **nodo centrale** di quasi tutte le dipendenze legacy attive. Contiene:

- **BusinessOverrides** → legge da: `business_item_overrides`, `items`, `collection_sections`, `collection_items`, `item_categories`, `collections`, `business_collection_schedules`
- **BusinessCollectionSchedule** → legge/scrive da: `business_collection_schedules`, `collections`

Migrare questi due componenti eliminerebbe la dipendenza attiva da **7 delle 8 tabelle legacy**.

### Blocco 2: Reviews + Analytics (MEDIA PRIORITA)

- `Reviews.tsx` → `getUserBusinesses()` da businesses.ts, `getBusinessReviews()` + `deleteReview()` da reviews.ts
- `Analytics.tsx` → `getUserBusinesses()` da businesses.ts, `getAnalyticsReviews()` da reviews.ts, `getAnalyticsQrScans()` da qrScans.ts

Questi usano `businesses` e `reviews` (+ `qr_scans`). Sono le ultime dipendenze residue dopo il Blocco 1.

### Blocco 3: Utility e Edge Functions (BASSA PRIORITA)

- `ensureUniqueBusinessSlug` in `businessSlug.ts` → usa `businesses` per check unicita slug
- `generate-menu-pdf` edge function → usa `businesses`

---

## Mappa visuale delle dipendenze

```
App.tsx routes
│
├── /business/:id/locations → Businesses.tsx
│   ├── imports ensureUniqueBusinessSlug → businessSlug.ts → [businesses]
│   └── uses BusinessList → LocationsGrid → BusinessCard/BusinessCard.tsx
│       ├── BusinessOverrides
│       │   ├── overrides.ts → [business_item_overrides]
│       │   ├── schedules.ts → [business_collection_schedules, collections]
│       │   ├── collections.ts → [items, collection_sections, collection_items, item_categories]
│       │   └── resolveBusinessCollections.ts → v2 (SAFE)
│       └── BusinessCollectionSchedule
│           ├── schedules.ts → [business_collection_schedules, collections]
│           ├── direct query → [collections]
│           ├── scheduleUtils.ts → types from schedules.ts
│           └── resolveBusinessCollections.ts → v2 (SAFE)
│
├── /business/:id/reviews → Reviews.tsx
│   ├── businesses.ts → [businesses_with_capabilities, businesses]
│   └── reviews.ts → [reviews, businesses]
│
├── /business/:id/analytics → Analytics.tsx
│   ├── businesses.ts → [businesses_with_capabilities, businesses]
│   ├── reviews.ts → [reviews, businesses]
│   └── qrScans.ts → [qr_scans]
│
├── NOT MOUNTED → Dashboard/Overview/Overview.tsx [DEAD]
├── NOT MOUNTED → Dashboard/Collections/Collections.tsx [DEAD]
│   ├── CollectionBuilder [DEAD]
│   ├── CatalogManager [DEAD]
│   └── CreateItemDrawer, PickItemDrawer, EditItemDrawer [DEAD]
└── NOT MOUNTED → Dashboard/Settings/Settings.tsx [DEAD]
```
