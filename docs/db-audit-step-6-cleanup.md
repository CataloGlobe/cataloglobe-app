# Cleanup Report — Step 6

**Data**: 2026-03-16
**Scope**: Eliminazione servizi legacy `overrides.ts`, `schedules.ts`, `categories.ts`, `collections.ts`, `scheduleUtils.ts` e dei relativi componenti morti che ne impedivano la rimozione pulita

---

## Contesto

Dopo lo step 5 (eliminazione di `BusinessOverrides`, `BusinessCollectionSchedule`, `ScheduleRuleDrawer`), i seguenti file erano rimasti in place perché fuori scope:

- `src/services/supabase/overrides.ts`
- `src/services/supabase/schedules.ts`
- `src/services/supabase/categories.ts`
- `src/services/supabase/collections.ts`
- `src/domain/schedules/scheduleUtils.ts`

Analisi degli importatori di questi file ha rilevato una catena di componenti morti (mai montati in `App.tsx`) che li referenziava, causando un problema TypeScript: eliminare i servizi avrebbe rotto la compilazione. La soluzione era eliminare anche i componenti morti.

---

## Verifica pre-eliminazione

### Importatori dei file di servizio

| File servizio | Importatori |
|--------------|-------------|
| `overrides.ts` | Nessuno (importer `BusinessOverrides.tsx` era stato eliminato nello step 5) |
| `schedules.ts` | Solo `scheduleUtils.ts` (nessun importer esterno) |
| `categories.ts` | Solo `CreateItemDrawer.tsx` (componente morto, non in `App.tsx`) |
| `collections.ts` | `PickItemDrawer.tsx`, `CreateItemDrawer.tsx`, `CatalogManager.tsx`, `CollectionBuilder.tsx` (tutti morti, non in `App.tsx`) |
| `scheduleUtils.ts` | Nessuno (importer `BusinessCollectionSchedule.tsx` eliminato nello step 5) |

### Verifica presenza in `App.tsx`

Grep per `Collections`, `CollectionBuilder`, `CatalogManager` in `src/App.tsx`: **nessun risultato.**

Il percorso `src/pages/Dashboard/Collections/Collections.tsx` non è registrato in nessuna route attiva.

### Cascata di dipendenze morte

```
Collections.tsx (pagina, non in App.tsx)
  ├── CollectionBuilder.tsx  ← importa da collections.ts
  │     ├── AddItemDrawer.tsx
  │     │     ├── CreateItemDrawer.tsx  ← importa da collections.ts + categories.ts
  │     │     └── PickItemDrawer.tsx    ← importa da collections.ts
  │     └── EditItemDrawer.tsx  (no import legacy — rimasto)
  └── CatalogManager.tsx     ← importa da collections.ts
        └── CreateItemDrawer.tsx  (già sopra)
```

Tutta la catena è auto-contenuta: nessun componente esterno attivo la referenzia.

---

## File eliminati

### Servizi e dominio

| File | Funzioni contenute | Tabelle legacy usate |
|------|--------------------|---------------------|
| `src/services/supabase/overrides.ts` | `getBusinessOverridesForItems`, `upsertBusinessItemOverride` | `business_item_overrides` |
| `src/services/supabase/schedules.ts` | `listBusinessSchedules`, `createBusinessSchedule`, `updateBusinessSchedule`, `deleteBusinessSchedule` | `business_collection_schedules` |
| `src/services/supabase/categories.ts` | `createItemCategory` | `item_categories` |
| `src/services/supabase/collections.ts` | ~20 funzioni legacy + `getPublicBusinessCollection` (V2, mai importata) | `collections`, `collection_sections`, `collection_items`, `items`, `item_categories`, `business_collection_schedules` |
| `src/domain/schedules/scheduleUtils.ts` | `isNowActive`, `getActiveWinner` | N/A (logica pura su `BusinessScheduleRow`) |

### Componenti morti (cascata necessaria per TypeScript)

| File | Motivo eliminazione |
|------|---------------------|
| `src/components/CollectionBuilder/PickItemDrawer/PickItemDrawer.tsx` | Importava `listItems` da `collections.ts` |
| `src/components/CollectionBuilder/PickItemDrawer/PickItemDrawer.module.scss` | Stili del componente eliminato |
| `src/components/CollectionBuilder/CreateItemDrawer/CreateItemDrawer.tsx` | Importava da `collections.ts` + `categories.ts` |
| `src/components/CollectionBuilder/CreateItemDrawer/CreateItemDrawer.module.scss` | Stili del componente eliminato |
| `src/components/CollectionBuilder/AddItemDrawer/AddItemDrawer.tsx` | Importava `CreateItemDrawer` + `PickItemDrawer` eliminati |
| `src/components/CollectionBuilder/AddItemDrawer/AddItemDrawer.module.scss` | Stili del componente eliminato |
| `src/components/CollectionBuilder/CollectionBuilder.tsx` | Importava da `collections.ts` + `AddItemDrawer` eliminato |
| `src/components/CollectionBuilder/CollectionBuilder.module.scss` | Stili del componente eliminato |
| `src/components/CatalogManager/CatalogManager.tsx` | Importava da `collections.ts` + `CreateItemDrawer` eliminato |
| `src/components/CatalogManager/CatalogManager.module.scss` | Stili del componente eliminato |
| `src/pages/Dashboard/Collections/Collections.tsx` | Importava `CollectionBuilder` + `CatalogManager` eliminati |
| `src/pages/Dashboard/Collections/Collections.module.scss` | Stili del componente eliminato |

---

## File rimasti (non toccati)

I sub-componenti di `CollectionBuilder` che non importavano direttamente da servizi legacy sono stati lasciati in place perché non causavano errori TypeScript e la loro eliminazione era fuori scope:

- `src/components/CollectionBuilder/EditItemDrawer/`
- `src/components/CollectionBuilder/CollectionStylePanel/`
- `src/components/CollectionBuilder/CollectionSectionsPanel/`
- `src/components/CollectionBuilder/SectionItemsPanel/`
- `src/components/CollectionBuilder/CollectionPreviewFrame/`
- `src/components/CollectionBuilder/ItemRow/`

Questi componenti non hanno importatori attivi e potrebbero essere rimossi in uno step successivo dedicato.

---

## Verifica TypeScript

```
npx tsc --noEmit
```

**Output: nessun errore.** La compilazione è pulita.

---

## Stato post-step 6

| Categoria | Stato |
|-----------|-------|
| `overrides.ts` | ✅ Eliminato |
| `schedules.ts` | ✅ Eliminato |
| `categories.ts` | ✅ Eliminato |
| `collections.ts` | ✅ Eliminato |
| `scheduleUtils.ts` | ✅ Eliminato |
| Componenti dead (CollectionBuilder tree) | ✅ Eliminati |
| Pagina Collections | ✅ Eliminata |
| TypeScript | ✅ Nessun errore |

---

## Tabelle legacy ora prive di accesso dal frontend

Con questo step, le seguenti tabelle legacy non sono più referenziate da nessun file TypeScript nel `src/`:

- `business_item_overrides`
- `business_collection_schedules`
- `item_categories`
- `collections`
- `collection_sections`
- `collection_items`
- `items`

---

## Note per lo step successivo

Rimangono sub-componenti del CollectionBuilder tree senza importatori attivi (elencati sopra) — candidati per un step di cleanup visivo opzionale.

Il frontend usa ora esclusivamente tabelle `v2_*` per la logica di catalogo.
