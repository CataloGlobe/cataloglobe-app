# FASE 1 — Audit read-only: ridisegno tab "Traduzioni" prodotto/categoria

> Solo lettura. Nessun codice scritto. Mappa per FASE 2 (redesign righe compatte espandibili, switch Descrizione/Note, italiano editabile inline, badge auto/manuale/da-rivedere, rimando Scheda variante C).
> Data audit: 2026-06-24.

---

## 1. `TranslationsTab` — props + data flow (A1–A3)

**File**: `src/components/ui/TranslationsTab/TranslationsTab.tsx` (~400 righe) + `TranslationsTab.module.scss` (~145 righe). Nessun sub-file nella cartella.

### Props (già parametrico)

```ts
interface TranslationsTabProps {
  entityType: TranslationEntityType;   // "product" | "category" | "featured" ...
  entityId: string;
  tenantId: string;
  sourceText: string;                  // testo IT sorgente (passato dal parent)
  fieldKey: TranslationField;          // "description" | "name" | "title" ...
  sectionLabel: string;
  sectionDescription: string;
  placeholderItalian?: string;
  flush?: boolean;
}
```

### Caricamento righe per lingua

`loadData()` (≈righe 92-110) — `Promise.all`:
- `listAvailableLanguages()`
- `getActiveTenantLanguages(tenantId)`
- `getTenantBaseLanguage(tenantId)`
- **`listTranslationsForEntity(tenantId, entityType, entityId)`** → righe `translations`, filtrate client-side per `field === fieldKey && entity_type === entityType`
- `computeFieldHash(sourceText)` → `currentSourceHash`

Service `listTranslationsForEntity` (`src/services/supabase/translations.ts:29`) fa `.select("*")` su `translations` filtrando `entity_type + entity_id` e `tenant_id.eq.<t>` OR `tenant_id.is.null` (sistema). Ritorna `Translation[]`.

Tipo `Translation` (`src/types/translations.ts`) include: `status` (`auto|manual|overridden`), `source_hash`, `translated_text`, `language_code`, `field`, `entity_type`.

### Status per lingua (A2) — già disponibile

```ts
function getStatusKind(t?: Translation): StatusKind {
  if (!t) return "missing";
  if (t.status === "manual") return "manual";
  return "auto";
}
```

### Stale per lingua (A2) — GIÀ IMPLEMENTATO

```ts
const isStaleManual =
  kind === "manual" &&
  currentSourceHash !== null &&
  translation?.source_hash !== currentSourceHash;
```

Comparazione `translations.source_hash` (stored) vs `currentSourceHash` (hash del `sourceText` corrente, calcolato in-place). **Nessuna RPC necessaria**: lo stale a livello entità-campo-lingua è già derivabile dai dati caricati. Oggi mostrato solo come `InlineBanner` warning sul manuale stale; il redesign lo userà per il badge "da rivedere".

> Nota: oggi `isStaleManual` copre solo `kind==="manual"`. Per badge "da rivedere" sugli **auto** stale → estendere la stessa comparazione anche a `kind==="auto"` (dato già presente, solo logica UI).

### Save manuale (A3)

Service `upsertManualTranslation(input)` (`translations.ts:109`) → RPC `upsert_manual_translation` (SECURITY DEFINER), overwrite con `status='manual'`, `provider='manual'`. Poi `revalidatePublicCatalogForTenant`.

Call site `handleSaveManual(languageCode)` (≈154-196): valida non-vuoto → `upsertManualTranslation({...field: fieldKey, sourceHash: currentSourceHash...})` → **`await loadData()`** (badge flippa a Manuale perché `status==='manual'`) → toast.

Revert: `revertManualTranslation(input)` (`translations.ts:137`) → RPC `revert_manual_translation`. Post-fix migration `20260624120000`: la RPC rilegge il **source corrente dall'entità** e ri-enqueue job con hash fresco → la traduzione rinasce FRESH (esce subito da "da rivedere").

---

## 2. Note + parametricità (A4–A5)

### Note (A4)
- **Nessun editor note in `TranslationsTab`**. Zero ref a "note" nel componente. Il riquadro "non ancora disponibile" sta altrove / placeholder.
- Note prodotto: `products.notes` (JSONB array), separate dalla tabella `translations`. UI in `src/pages/Dashboard/Products/CharacteristicsAndNotesTab.tsx` + `ProductNotesSection`.
- Traduzioni note esistono nel sistema con `entity_type="product_notes"`, `field="note"` (hash `products.notes_hash`), ma **display read-only auto-translation note NON implementato** in UI.
- → Per lo switch Descrizione/Note del redesign: le auto-translation note sono leggibili via `listTranslationsForEntity(tenantId, "product_notes", productId)`, ma vanno renderizzate (oggi non c'è nulla).

### Parametricità (A5)
Componente **completamente generico**. Nessun ramo product/category. `entityType`/`entityId`/`fieldKey`/`sourceText`/label tutti via props. Due call site:
- ProductPage → `entityType="product" fieldKey="description"`
- CatalogEngine → `entityType="category" fieldKey="name"`

**Verdetto**: redesign resta **un solo componente parametrico**. Nessuno split. Lo switch Descrizione/Note è una variante product-only → gestibile via prop opzionale (es. `notesEntityType?`/`secondaryField?`) o rendering condizionale su `entityType==="product"`.

---

## 3. Source IT update + trigger ri-traduzione (B6–B7)

### Prodotto
`updateProduct(id, tenantId, data, parentId?)` (`src/services/supabase/products.ts:394`). Call site Scheda: `SchedaTab.tsx:206` — `updateProduct(productId, tenantId, { name, description })`. Salva su `products` + calcola `description_hash`.

Trigger ri-traduzione = **enqueue applicativo nel service** (NO trigger DB):
```ts
if (descriptionInData) {
  await enqueueWithSilentError({
    tenantId, entityType: "product", entityId: id,
    field: "description", newSourceText, newSourceHash: descriptionHash
  });
}
```
`enqueueTranslationJobsIfChanged` (`src/services/supabase/translationJobs.ts:51-126`): fetch lingue attive → confronta `newSourceHash` vs `source_hash` esistenti → INSERT/UPDATE `translation_jobs` `pending` per le lingue cambiate/mancanti. **Le lingue con `status='manual'` sono escluse** dal re-enqueue (`manualLangs` filter). Cron worker ogni ~2min processa i job.

### Categoria
`updateCategory(categoryId, tenantId, updates)` (`src/services/supabase/catalogs.ts`). Stesso pattern: enqueue `enqueueWithSilentError({entityType:"category", field:"name", newSourceHash: nameHash})`.

### Riuso da tab Traduzioni (B7)
`updateProduct`/`updateCategory` sono **importabili e richiamabili**. Entrambi chiamano lo **stesso** `enqueueWithSilentError`. → Editando l'italiano dalla tab Traduzioni si riusa lo stesso path: chiamare `updateProduct`/`updateCategory` con il nuovo source → enqueue automatico, **nessun doppione di logica**. Le manuali esistenti non vengono sovrascritte (escluse dall'enqueue), ma diventeranno stale (source_hash≠ nuovo hash) → coerente col badge "da rivedere".

---

## 4. Rimando Scheda "Tradotto in N lingue" (C8)

**Posizione**: `SchedaTab.tsx:558-575`, dentro card Informazioni, sotto il campo Descrizione. Renderizzato solo se `isBaseProduct && product.description`.

```tsx
<TranslationStatusBadge tenantId entityType="product" entityId={productId}
  field="description" refreshKey={productId} />
<button onClick={() => onNavigateToTab("translations")}>Gestisci traduzioni →</button>
```

**Componente badge**: `src/components/ui/TranslationStatusBadge/TranslationStatusBadge.tsx`. Chiama `getFieldTranslationStatus()` → `{ doneCount, pendingCount, errorCount, totalLanguages }` (conteggio job done/pending/error + lingue attive). Poll 5s se pending. i18n key `admin.translation_status.*`:
- ✅ `completed_other` "Tradotto in {{count}} lingue"
- 🟡 `in_progress` "Traduzione in corso ({{done}}/{{total}})"
- ⚠️ `error_other`

**Stale count per variante C**: il badge oggi conta job done/pending/error, **NON** lo stale ("da rivedere"). Lo stale per la singola entità NON è esposto qui. Va **derivato** (vedi §5). Per la variante C ("1 da rivedere" ambra) → calcolare client-side confrontando `source_hash` righe `translations` vs `description_hash` del prodotto.

**Tab routing**: `?tab=` query param. `ProductPage.tsx:84-92` `handleTabChange` → `setSearchParams(tab=next, {replace:true})`. `useFilteredProductTabs` mappa `?tab=translations` → tab Traduzioni, `?tab=scheda` → Scheda.

**CatalogEngine**: monta `<TranslationsTab>` per categorie (≈riga 1575) con `entityType="category" entityId={selectedCategory.id} sourceText={selectedCategory.name} fieldKey="name" sectionLabel="Traduzioni nome categoria"`. Update nome via `updateCategory`.

---

## 5. Stale per SINGOLA entità senza toccare le RPC (D9)

**RPC esistenti — NESSUNA è per-entità**:
| RPC | Granularità |
|---|---|
| `get_stale_translations(tenant, lang)` | per-tenant + per-lingua |
| `get_translation_coverage(tenant)` | per-tenant (tutte lingue) |
| `get_translation_progress(tenant)` | per-tenant (job-level) |

**Stale = `translations.source_hash` ≠ `<entità>.<field>_hash`.** Colonne hash entità: `products.description_hash`/`notes_hash`, `catalog_categories.name_hash`, ecc.

**Derivazione client-side (preferita, no modifiche RPC)**: i due dati sono **già caricati insieme** in `TranslationsTab`:
- `source_hash` dalle righe `listTranslationsForEntity`
- `currentSourceHash` = `computeFieldHash(sourceText)` (sourceText è prop = source corrente entità)

→ Per ogni lingua: `stale = (status manuale o auto) && row.source_hash !== currentSourceHash`. Conteggio "N da rivedere" = numero righe stale. **Già tutto in memoria nel componente.** Per il rimando Scheda (variante C) lo stesso calcolo va replicato: serve `description_hash` del prodotto + `source_hash` delle righe — oggi il badge Scheda non carica le righe `translations`, quindi o (a) `TranslationStatusBadge` aggiunge una fetch `listTranslationsForEntity` + confronto hash, oppure (b) si calcola `computeFieldHash(product.description)` e si confronta con le righe. Nessuna nuova RPC.

---

## 6. i18n + componenti UI riusabili (E10–E11)

### i18n (E10)
File: `src/i18n/locales/{it,en,de,es,fr}/admin.json`, namespace `admin`. Blocco esistente `translation_status` (it, righe ~83-90):
```json
"translation_status": {
  "completed_one": "Tradotto in 1 lingua",
  "completed_other": "Tradotto in {{count}} lingue",
  "in_progress": "Traduzione in corso ({{done}}/{{total}})",
  "error_one": "Errore in 1 lingua",
  "error_other": "Errore in {{count}} lingue",
  "retry": "Riprova"
}
```
**Stringhe hardcoded in `TranslationsTab.tsx`** (NON ancora i18n — da migrare in FASE 2): badge "Manuale"/"Automatica"/"Da tradurre"; bottoni "Salva traduzione manuale"/"Torna a traduzione automatica"; msg "Errore nel caricamento delle traduzioni"/"La traduzione non può essere vuota"/"Traduzione manuale salvata". Serviranno nuove key (es. namespace `translationsTab.*`) + label "Da rivedere", switch "Descrizione"/"Note".

### Componenti UI (E11)
| Componente | Path | Uso redesign |
|---|---|---|
| **SegmentedControl** | `ui/SegmentedControl/` | switch Descrizione/Note (generic 2-view toggle) ✅ |
| **StatusBadge** | `ui/StatusBadge/` | badge stato — variant `success\|neutral\|warning` + dot + label ✅ |
| **Badge** | `ui/Badge/` | usato OGGI per "Manuale/Automatica/Da tradurre" (variant primary/success/warning/danger) |
| **Tabs** | `ui/Tabs/` | compound (List/Tab/Panel), lazy panel — alternativa se serve |
| **TranslationStatusBadge** | `ui/TranslationStatusBadge/` | badge Scheda (poll 5s) — da estendere per stale count |
| **Drawer** | `ui/Drawer/` | side panel (NON inline-row) |

**GAP**: **nessun componente accordion/riga-espandibile-inline** in `ui/`. Le "righe compatte espandibili" del mockup vanno costruite (no componente esistente da riusare; eventuale pattern single-open accordion esiste in `ActivitySettingsTab` / draft-unsaved-bar doc ma non come componente `ui/` generico).

---

## 7. File che la FASE 2 toccherà (previsione)

| File | Modifica |
|---|---|
| `src/components/ui/TranslationsTab/TranslationsTab.tsx` | redesign core: righe espandibili, switch Desc/Note, italiano editabile inline (chiama `updateProduct`/`updateCategory`), badge auto/manuale/da-rivedere, estensione stale anche su `auto` |
| `src/components/ui/TranslationsTab/TranslationsTab.module.scss` | stile righe compatte/accordion |
| `src/pages/Dashboard/Products/SchedaTab.tsx` | rimando variante C (blocco "Tradotto in N lingue" + "X da rivedere" ambra) |
| `src/components/ui/TranslationStatusBadge/TranslationStatusBadge.tsx` | (eventuale) esporre stale count per variante C |
| `src/pages/Dashboard/Catalogs/CatalogEngine.tsx` | clone a campo singolo (category/name) — passa props nuove se introdotte |
| `src/i18n/locales/*/admin.json` | nuove key (badge, switch, "Da rivedere", azioni) + migrazione stringhe hardcoded |
| `src/components/ui/TranslationsTab/` (nuovo) | eventuale sub-componente RigaTraduzione + accordion (GAP: nessuno riusabile) |

**Service riusati senza modifica** (no doppione): `translations.ts` (`listTranslationsForEntity`, `upsertManualTranslation`, `revertManualTranslation`), `products.ts:updateProduct`, `catalogs.ts:updateCategory`, `translationJobs.ts:enqueueTranslationJobsIfChanged`. **RPC invariate** (stale derivato client-side).

### Decisioni aperte per FASE 2
1. Switch Descrizione/Note: prop opzionale su `TranslationsTab` vs render condizionale `entityType==="product"`.
2. Display read-only auto-translation **note** (`entity_type="product_notes"`) — oggi inesistente, da costruire.
3. Stale count nel rimando Scheda: estendere `TranslationStatusBadge` (fetch righe) vs nuovo calcolo locale.
4. Componente riga espandibile: costruire ex-novo (nessun `ui/` accordion generico).
