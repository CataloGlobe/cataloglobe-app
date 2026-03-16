# BusinessCard Legacy Migration Analysis — Step 3

**Data**: 2026-03-16
**Scope**: Analisi architetturale dei componenti legacy `BusinessOverrides` e `BusinessCollectionSchedule`, mappatura verso il modello V2, strategia di migrazione
**Fonte**: Lettura diretta dei file sorgente, servizi legacy e servizi V2

---

## Scoperta critica: entrambi i componenti sono già funzionalmente morti

Prima di qualsiasi analisi di dettaglio, e necessario segnalare una scoperta fondamentale emersa dalla lettura di `BusinessCard/BusinessCard.tsx`:

```tsx
// overrideOpen → inizializzato a false
const [overrideOpen, setOverrideOpen] = useState(false);  // mai impostato a true

// showScheduleModal → inizializzato a false
const [showScheduleModal, setShowScheduleModal] = useState(false);

// Il commento nel codice è esplicito:
{/* TODO(phase10): BusinessCollectionSchedule receives businessType from activity_type,
    which is legacy and should not be the primary business vertical.
    The trigger (setShowScheduleModal) is currently dead — no button calls it. */}
```

**`setOverrideOpen(true)` non viene mai chiamato.** Nessun elemento nella UI apre BusinessOverrides.
**`setShowScheduleModal(true)` non viene mai chiamato.** Il commento nel codice lo conferma esplicitamente.

Entrambi i componenti sono montati nell'albero React ma sono **zombie**: non verranno mai aperti dall'utente. Questo cambia radicalmente la priorità della migrazione — non si tratta di migrare funzionalità attive, ma di rimuovere codice morto che porta dipendenze inutili verso tabelle legacy.

---

## BusinessOverrides

### Cosa fa

BusinessOverrides e una modale a layout complesso (sidebar + contenuto) che permette di gestire **override di prezzo e visibilita per prodotto, specifici per una sede**.

Flusso logico:
1. All'apertura, carica le **collection attive per la sede** interrogando `business_collection_schedules` (via `listBusinessSchedules`) e `resolveBusinessCollections` (gia V2)
2. Costruisce una lista di collection disponibili con il flag `isActiveNow` (se e quella attiva in questo momento)
3. Quando si seleziona una collection dalla sidebar, carica i suoi **prodotti strutturati per categoria** (`getCollectionItemsWithData`) piu gli **override esistenti** (`getBusinessOverridesForItems`)
4. Mostra ogni prodotto con: toggle visibilita, campo prezzo, indicatore override attivo
5. Al salvataggio, esegue `upsertBusinessItemOverride` per ogni riga modificata

### Tabelle legacy usate

| Tabella legacy | Funzione | Contesto |
|----------------|----------|---------|
| `business_collection_schedules` | `listBusinessSchedules(businessId)` | Determinare quali collection sono associate alla sede per mostrare la sidebar di selezione |
| `collections` | indirettamente via `listBusinessSchedules` (join) | Ottenere nome e ID della collection per ogni regola di scheduling |
| `collection_items` | `getCollectionItemsWithData(collectionId)` | Ottenere i prodotti presenti in una collection, con il loro ordine |
| `collection_sections` | `getCollectionItemsWithData(collectionId)` | Struttura gerarchica flat (sezioni) per raggruppare i prodotti |
| `items` | `getCollectionItemsWithData(collectionId)` | Dati del prodotto: nome, prezzo base, categoria |
| `item_categories` | join dentro `getCollectionItemsWithData` | Nome categoria del prodotto (usato per il raggruppamento nella UI) |
| `business_item_overrides` | `getBusinessOverridesForItems()` / `upsertBusinessItemOverride()` | Lettura e scrittura degli override per sede |

### Tabelle V2 equivalenti

| Tabella legacy | Tabella V2 | Note |
|----------------|-----------|------|
| `business_collection_schedules` | `v2_schedules` + `v2_schedule_targets` | In V2 le regole di scheduling sono `rule_type = 'layout'`, target su `v2_schedule_targets` |
| `collections` | `v2_catalogs` | Stessa semantica, modello multi-tenant |
| `collection_items` | `v2_catalog_category_products` | Pivot categoria → prodotto nel nuovo modello gerarchico |
| `collection_sections` | `v2_catalog_categories` | Gerarchico (max 3 livelli) vs flat |
| `items` | `v2_products` | ID preservati dal backfill |
| `item_categories` | `v2_catalog_categories` (nome) | La categoria in V2 e strutturata nella gerarchia del catalogo, non sull'item |
| `business_item_overrides` | `v2_activity_product_overrides` | ID preservati dal backfill, stessa semantica |

### Servizi V2 gia esistenti che coprono la funzionalita

**Per gli override prodotto per sede:**
```
src/services/supabase/v2/activeCatalog.ts
  - getActivityProductOverrides(activityId) → legge v2_activity_product_overrides
  - updateActivityProductVisibility(activityId, productId, targetVisible) → scrive v2_activity_product_overrides
  - getRenderableCatalogForActivity(activityId) → catalogo completo con prezzi risolti + override applicati
```

**Per il catalogo con prodotti e categorie:**
```
src/services/supabase/v2/resolveActivityCatalogsV2.ts
  - resolveActivityCatalogsV2(activityId, now) → catalogo attivo con categorie/prodotti/prezzi
  - loadCatalogById(catalogId) → catalogo specifico con struttura categoria/prodotto
```

**Per la lista dei cataloghi della sede (sostituisce listBusinessSchedules):**
```
src/services/supabase/v2/layoutScheduling.ts
  - getLayoutRules(tenantId) → tutte le regole, filtrabili per attivita target
  - Include: layout.catalog_id, days_of_week, time_from, time_to, activityIds, groupIds
```

**Per la lista dei cataloghi disponibili:**
```
src/services/supabase/v2/catalogs.ts
  - getCatalogs(tenantId) → v2_catalogs per tenant
```

### Differenza chiave legacy → V2 per gli override

**Legacy:** `getCollectionItemsWithData` ritorna una lista piatta di prodotti con `item.category.name` per raggruppamento.

**V2 disponibile:** `getRenderableCatalogForActivity` ritorna prodotti gia con `category_name` e prezzi finali risolti. Non richiede una seconda query per gli override — li applica internamente. Tuttavia per la UI di editing (che deve mostrare prezzo base vs override vs prezzo effettivo) servira `getActivityProductOverrides` separatamente.

**Mancanza:** Non esiste ancora una funzione V2 per aggiornare il price_override su `v2_activity_product_overrides`. `updateActivityProductVisibility` gestisce solo il visible_override. Servira aggiungere `updateActivityProductPrice` con la stessa logica.

### Strategia di migrazione

1. **Fonte dei cataloghi disponibili**: sostituire `listBusinessSchedules(businessId)` con `getLayoutRules(tenantId)` filtrato sulle regole che hanno `activityId` o group target che include la sede
2. **Fonte dei prodotti per catalogo**: sostituire `getCollectionItemsWithData(collectionId)` con `loadCatalogById(catalogId)` da `resolveActivityCatalogsV2.ts` — ritorna gia la struttura categorie/prodotti
3. **Lettura override**: sostituire `getBusinessOverridesForItems(businessId, itemIds)` con `getActivityProductOverrides(activityId)` da `activeCatalog.ts` — stessa semantica, tabella V2
4. **Scrittura override visibilita**: sostituire `upsertBusinessItemOverride` (visible_override) con `updateActivityProductVisibility` da `activeCatalog.ts`
5. **Scrittura override prezzo**: aggiungere funzione V2 analoga — `upsertActivityProductPriceOverride(activityId, productId, price)` su `v2_activity_product_overrides` (stessa logica UPSERT gia presente in `overrides.ts`, solo tabella diversa)
6. **Raggruppamento per categoria**: gia disponibile in V2 — `ResolvedCategory.name` in `resolveActivityCatalogsV2`

---

## BusinessCollectionSchedule

### Cosa fa

BusinessCollectionSchedule e una modale complessa per gestire le **regole di scheduling delle collection per una sede**. Permette di definire quando (giorni + orario) mostrare quale collection, con supporto a due slot separati: `primary` (catalogo principale) e `overlay` (catalogo in evidenza/speciale).

Flusso logico:
1. All'apertura, carica in parallelo: tutte le regole di scheduling della sede (`listBusinessSchedules`) + tutte le collection compatibili col tipo di business (query diretta su `collections`)
2. Divide le regole in `primaryRules` e `overlayRules`
3. Calcola quale regola e vincente ora (`getActiveWinner`) e mostra badge "In uso"
4. Risolve anche il catalogo attivo tramite `resolveBusinessCollections` (gia V2)
5. Permette aggiunta/modifica/eliminazione di regole via `ScheduleRuleDrawer`
6. `ScheduleRuleDrawer` filtra le collection per tipo (`kind = "standard"` per primary, `kind = "special"` per overlay)

**NOTA: Il modal e gia fisicamente inaccessibile** — `setShowScheduleModal(true)` non viene mai chiamato in BusinessCard (confermato da commento TODO nel codice).

### Tabelle legacy usate

| Tabella legacy | Funzione | Contesto |
|----------------|----------|---------|
| `business_collection_schedules` | `listBusinessSchedules()` / `createBusinessSchedule()` / `updateBusinessSchedule()` / `deleteBusinessSchedule()` | CRUD completo delle regole di scheduling per sede |
| `collections` | query diretta `.from("collections").select("id, name, kind, collection_type")` | Lista delle collection disponibili per la sede, filtrate per `collection_type` (compatibile col `businessType`) |

### Tabelle V2 equivalenti

| Tabella legacy | Tabella V2 | Note |
|----------------|-----------|------|
| `business_collection_schedules` | `v2_schedules` + `v2_schedule_targets` + `v2_schedule_layout` | In V2 le regole hanno `rule_type = 'layout'`; il target e in `v2_schedule_targets`; il catalogo associato e in `v2_schedule_layout.catalog_id` |
| `collections` | `v2_catalogs` | Stessa semantica. In V2 non c'e `kind` (primary/overlay) — la logica di priorita e nel sistema di schedule |

### Differenza chiave legacy → V2

**Legacy — modello semplice:**
```
business_collection_schedules:
  business_id, collection_id, slot (primary|overlay),
  days_of_week, start_time, end_time, priority, is_active
```

**V2 — modello piu ricco:**
```
v2_schedules: rule_type ('layout'), time_mode, days_of_week, time_from, time_to, priority, enabled
v2_schedule_targets: schedule_id, target_type ('activity'|'activity_group'), target_id
v2_schedule_layout: schedule_id, catalog_id, style_id
```

**Principali differenze:**
- Il concetto di `slot` (primary/overlay) non esiste in V2. In V2 c'e solo priorita numerica. Il componente dovra essere ridisegnato per questo
- In V2 una regola ha anche un `style_id` — il catalogo non puo essere assegnato senza uno stile. Serve gestire questo nella UI
- In V2 il target puo essere un gruppo di sedi (`activity_group`), non solo una singola sede
- `time_mode: "always"` sostituisce il concetto di "tutto il giorno" legacy

### Servizi V2 gia esistenti

```
src/services/supabase/v2/layoutScheduling.ts
  - getLayoutRules(tenantId) → legge v2_schedules con targets, layout, overrides
  - createLayoutRule(tenantId, rule) → crea regola in v2_schedules + targets + layout
  - updateLayoutRule(scheduleId, tenantId, patch) → aggiorna
  - deleteLayoutRule(scheduleId, tenantId) → elimina
  - getStyleOptions(tenantId) → lista stili disponibili
```

```
src/services/supabase/v2/catalogs.ts
  - getCatalogs(tenantId) → v2_catalogs, sostituisce la query diretta su collections
```

```
src/services/supabase/v2/resolveActivityCatalogsV2.ts
  - resolveActivityCatalogsV2(activityId, now) → catalogo attivo ora (gia usato come bridge)
```

### scheduleUtils.ts e il tipo BusinessScheduleRow

`scheduleUtils.ts` contiene la logica `isNowActive` e `getActiveWinner`. **Questa logica e riutilizzabile** — opera su struct generici e puo essere adattata al tipo V2 (`LayoutRule` da `layoutScheduling.ts`). In V2 il campo equivalente e `time_mode` / `days_of_week` / `time_from` / `time_to` + `enabled`.

### Strategia di migrazione

**Opzione A: Riscrivere il componente**
Dato che BusinessCollectionSchedule e gia inaccessibile nella UI (trigger morto), la migrazione piu pulita e costruire un nuovo componente `ActivityScheduleDrawer` che usa esclusivamente i servizi V2. Vantaggi:
- Nessun debito tecnico di conversione
- Il nuovo componente puo gestire correttamente style_id + catalog_id
- Si integra con il design attuale (drawer pattern, non modal)

**Opzione B: Adattare il componente esistente**
Troppo invasivo — il tipo `BusinessScheduleRow` e profondamente diverso da `LayoutRule` V2, i slot `primary/overlay` non esistono in V2.

**Raccomandazione: Opzione A**

---

## Conclusione

### Servizi legacy eliminabili dopo la migrazione

| File | Dipende da | Eliminabile dopo |
|------|-----------|-----------------|
| `src/services/supabase/overrides.ts` | `business_item_overrides` | Migrazione BusinessOverrides |
| `src/services/supabase/schedules.ts` | `business_collection_schedules`, `collections` | Migrazione BusinessCollectionSchedule |
| `src/services/supabase/categories.ts` | `item_categories` | Migrazione BusinessOverrides |
| `src/services/supabase/collections.ts` | 7 tabelle legacy | Migrazione BusinessOverrides (funzioni usate attivamente) + eliminazione codice morto (resto) |
| `src/domain/schedules/scheduleUtils.ts` | Tipo `BusinessScheduleRow` da schedules.ts | Migrazione BusinessCollectionSchedule (la logica `isNowActive`/`getActiveWinner` e adattabile al tipo V2) |

### Tabelle legacy che diventano eliminabili

Dopo la migrazione di BusinessOverrides e BusinessCollectionSchedule (e la rimozione del codice morto), queste tabelle non hanno piu consumatori attivi nel frontend:

| Tabella | Consumatori residui dopo migrazione |
|---------|-------------------------------------|
| `business_item_overrides` | Nessuno (overrides.ts rimosso) |
| `collection_items` | Nessuno |
| `collection_sections` | Nessuno |
| `item_categories` | Nessuno |
| `business_collection_schedules` | Nessuno (schedules.ts rimosso) |
| `collections` | Nessuno (ultima query diretta in BusinessCollectionSchedule rimossa) |
| `items` | Nessuno (usato solo via collections.ts) |

Resterebbero dipendenze da `businesses` solo in: Reviews, Analytics, Businesses page (slug), generate-menu-pdf edge function — da trattare separatamente.

### Componenti e file eliminabili dopo la migrazione

**Componenti:**
- `src/components/Businesses/BusinessCollectionSchedule/BusinessCollectionSchedule.tsx`
- `src/components/Businesses/BusinessCollectionSchedule/ScheduleRuleDrawer.tsx`
- `src/components/Businesses/BusinessOverrides/BusinessOverrides.tsx`

**Conseguenza sulla pagina Businesses:**
Il `BusinessCard/BusinessCard.tsx` perde entrambi i sotto-componenti legacy. Rimane la card con: nome, status, indirizzo, catalogo attivo (gia V2 via `activeCatalog.ts`), menu azioni. Il componente sara molto piu leggero.

### Sequenza di intervento raccomandata

**Step A — Rimozione codice morto senza migrazione** (a costo zero, zero rischi)
1. Rimuovere da `BusinessCard.tsx` il mount di `BusinessOverrides` (gia inaccessibile)
2. Rimuovere da `BusinessCard.tsx` il mount di `BusinessCollectionSchedule` (gia inaccessibile, con TODO esplicito)
3. Eliminare i file: `BusinessOverrides.tsx`, `BusinessCollectionSchedule.tsx`, `ScheduleRuleDrawer.tsx`
4. Eliminare: `overrides.ts`, `schedules.ts`, `scheduleUtils.ts`, `categories.ts`
5. Rimuovere da `collections.ts` le funzioni orfane (quelle usate solo da CollectionBuilder/CatalogManager morti)

**Step B — Aggiunta funzionalita V2** (se le feature servono ancora)
1. Costruire `ActivityOverridesDrawer` usando `getActivityProductOverrides` + `upsertActivityProductPriceOverride` (da aggiungere ad `activeCatalog.ts`) + `loadCatalogById`
2. Costruire `ActivityScheduleDrawer` usando `getLayoutRules` / `createLayoutRule` / `deleteLayoutRule` da `layoutScheduling.ts`
3. Collegare il trigger in `BusinessCard.tsx` al nuovo drawer

**Step C — Eliminazione tabelle legacy** (una volta confermato Step A)
DROP delle 7 tabelle elencate sopra, previa verifica che non esistano riferimenti nei parity-check script o edge functions.

---

## Appendice: Mappa delle dipendenze da eliminare

```
BusinessCard/BusinessCard.tsx  ← punto di intervento
│
├── [RIMUOVERE] BusinessOverrides.tsx
│   ├── collections.ts → [collections, collection_sections, collection_items, items, item_categories, business_collection_schedules]
│   ├── overrides.ts → [business_item_overrides]
│   ├── schedules.ts → [business_collection_schedules, collections]
│   └── resolveBusinessCollections.ts → V2 (SAFE, mantenere)
│
└── [RIMUOVERE] BusinessCollectionSchedule.tsx
    ├── schedules.ts → [business_collection_schedules, collections]
    ├── query diretta → [collections]
    ├── scheduleUtils.ts → (tipi da schedules.ts)
    └── resolveBusinessCollections.ts → V2 (SAFE, mantenere)
```

Dopo la rimozione, `BusinessCard/BusinessCard.tsx` dipende solo da:
- V2 types (`BusinessCardProps` tramite `V2Activity`)
- UI components (Dropdown, Badge, Button, Text)
- React Router
- `resolveBusinessCollections.ts` → V2 (se ancora necessario per visualizzare il catalogo attivo — ma `activeCatalog.ts` e gia piu appropriato)
