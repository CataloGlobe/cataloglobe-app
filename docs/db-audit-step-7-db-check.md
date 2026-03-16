# Legacy DB Dependency Report

**Data**: 2026-03-16
**Scope**: Verifica dipendenze DB per le 7 tabelle legacy candidate alla rimozione
**Metodo**: Grep esaustivo su `supabase/migrations/*.sql` e `supabase/functions/**/*.ts`

---

## Tabelle candidate

| Tabella | Definita in |
|---------|------------|
| `business_item_overrides` | `20260223132711_remote_schema.sql` |
| `business_collection_schedules` | `20260223132711_remote_schema.sql` |
| `item_categories` | `20260223132711_remote_schema.sql` |
| `collections` | `20260223132711_remote_schema.sql` |
| `collection_sections` | `20260223132711_remote_schema.sql` |
| `collection_items` | `20260223132711_remote_schema.sql` |
| `items` | `20260223132711_remote_schema.sql` |

---

## SQL functions che usano queste tabelle

### `public.delete_empty_collection_sections()` — trigger function

**File**: `20260223132711_remote_schema.sql:438`

```sql
delete from collection_sections cs
where cs.id = old.section_id
  and not exists (select 1 from collection_items ci where ci.section_id = cs.id);
```

Usa: `collection_sections`, `collection_items`.
Trigger attaccato: `trg_delete_empty_collection_sections` su `collection_items` (AFTER DELETE).
**Stato**: Funzione live nel DB. Il trigger verrebbe eliminato in automatico al DROP di `collection_items`.

---

### `public.duplicate_collection(uuid, text)` — SECURITY DEFINER

**File**: `20260223132711_remote_schema.sql:456`

Usa: `collections`, `collection_sections`, `collection_items`.
**Stato**: Funzione live nel DB. Nessuna migration successiva la elimina o sostituisce.

---

### `public.duplicate_collection(uuid, text, boolean)` — SECURITY DEFINER (overload)

**File**: `20260223132711_remote_schema.sql:545`

Usa: `collections`, `collection_sections`, `collection_items`.
**Stato**: Funzione live nel DB.

---

### `public.enforce_collection_item_section_category()` — trigger function

**File**: `20260223132711_remote_schema.sql:634`

```sql
select category_id into item_cat from public.items where id = new.item_id;
select base_category_id, collection_id into section_cat, section_collection
from public.collection_sections where id = new.section_id;
```

Usa: `items`, `collection_sections`.
Trigger attaccato: `trg_enforce_collection_item_section_category` su `collection_items` (BEFORE INSERT OR UPDATE).
**Stato**: Funzione live nel DB.

---

### `public.validate_days_of_week()` — trigger function

**File**: `20260223132711_remote_schema.sql:754`

Non fa SELECT su tabelle legacy; valida solo `new.days_of_week`.
Trigger attaccato: `trg_validate_days_of_week` su `business_collection_schedules` (BEFORE INSERT OR UPDATE).
**Stato**: Funzione live nel DB. Il trigger verrebbe eliminato al DROP di `business_collection_schedules`.

---

## Views che usano queste tabelle

### `public.businesses_with_capabilities`

**File**: `20260223132711_remote_schema.sql:776`

```sql
CREATE OR REPLACE VIEW public.businesses_with_capabilities AS
  WITH business_allowed_catalogs AS (SELECT ... FROM public.businesses)
  SELECT ...,
    (SELECT count(*) FROM public.collections c ...) AS compatible_collection_count,
    (SELECT count(DISTINCT s.collection_id)
       FROM public.business_collection_schedules s
       JOIN public.collections c ...) AS scheduled_compatible_collection_count,
    (SELECT c.name FROM public.business_collection_schedules s
       JOIN public.collections c ... WHERE ... public.is_schedule_active_now(...)) AS active_primary_collection_name,
    ...
  FROM business_allowed_catalogs;
```

**Tabelle usate**: `collections`, `business_collection_schedules`.

#### ⚠️ Questa view è ATTIVAMENTE usata dal frontend

`src/services/supabase/businesses.ts:42`:

```typescript
export async function getUserBusinesses(userId: string) {
    const { data, error } = await supabase
        .from("businesses_with_capabilities")
        .select("*")
        .eq("user_id", userId);
    ...
}
```

`getUserBusinesses` è chiamata da route **attive in `App.tsx`**:

| Componente | Route | Linea in App.tsx |
|-----------|-------|-----------------|
| `src/pages/Dashboard/Reviews/Reviews.tsx` | `reviews` | 198 |
| `src/pages/Dashboard/Analytics/Analytics.tsx` | `analytics` | 199 |

---

## RLS policies che usano queste tabelle

### Su `business_collection_schedules`

```sql
CREATE POLICY "business_collection_schedules_owner_only"
ON public.business_collection_schedules FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_collection_schedules.business_id ...)
  AND EXISTS (SELECT 1 FROM public.collections c WHERE c.id = business_collection_schedules.collection_id ...)
);
```

Usa: `businesses`, `collections`. Interna alla tabella candidata. Si elimina con la tabella.

---

### Su `business_item_overrides`

```sql
CREATE POLICY "business_item_overrides_owner_only"
ON public.business_item_overrides FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.businesses b ...) AND
  EXISTS (SELECT 1 FROM public.items i WHERE i.id = business_item_overrides.item_id ...)
);
```

Usa: `items`. Interna alla tabella candidata. Si elimina con la tabella.

---

### Su `item_categories`

4 policy (`delete_owner`, `insert_owner`, `select_owner`, `update_owner`). Basate su `user_id = auth.uid()`. **Nessun riferimento a tabelle esterne.** Si eliminano con la tabella.

---

### Su `collection_items`

Policy `collection_items_owner_only`. Usa `public.collections c WHERE c.id = collection_items.collection_id`. Interna alla catena. Si elimina con la tabella.

---

### Su `collection_sections`

Policy `collection_sections_owner_only`. Usa `public.collections c WHERE c.id = collection_sections.collection_id`. Interna alla catena. Si elimina con la tabella.

---

### Su `item_tags` — dipendenza esterna

```sql
CREATE POLICY "item_tags_owner_only"
ON public.item_tags FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_tags.item_id AND i.user_id = auth.uid())
);
```

**File**: `20260223132711_remote_schema.sql:1655`

`item_tags` **non è una tabella candidata** ma la sua RLS policy dipende da `items`.
Effetto del DROP di `items`: la policy diventerebbe invalida e le query su `item_tags` fallirebbero con un errore PostgreSQL.

---

## Riferimenti nei backfill migrations (non attivi)

Le seguenti migration usano le tabelle candidate in INSERT…SELECT **one-shot** per popolare le tabelle V2. Sono già state eseguite e non creano oggetti persistenti.

| Migration | Tabella legacy usata | Tabella V2 popolata |
|-----------|---------------------|---------------------|
| `20260223153000_v2_catalogs.sql` | `collections`, `collection_sections`, `collection_items` | `v2_catalogs`, `v2_catalog_sections`, `v2_catalog_items` |
| `20260223154000_v2_activity_product_overrides.sql` | `business_item_overrides` | `v2_activity_product_overrides` |
| `20260223155000_v2_activity_schedules.sql` | `business_collection_schedules` | `v2_activity_schedules` |
| `20260223152000_v2_products.sql` | `items` | `v2_products` |
| `20260302100000_v2_products_image_url.sql` | `items` | `v2_products` (update) |

Queste migration **non bloccano** il DROP delle tabelle.

---

## Edge functions che le referenziano

Grep su `supabase/functions/**/*.ts` per tutte e 7 le tabelle:

```
Nessun risultato.
```

Tutte le edge functions usano esclusivamente tabelle `v2_*` o `otp_*`.
Unica eccezione: `generate-menu-pdf` usa `.from("businesses")` — ma `businesses` non è una tabella candidata e non è nella lista.

---

## Conclusione

### Matrice riepilogativa

| Tabella | Funzione SQL live | View live | RLS esterna | Edge function | Frontend attivo | Verdetto |
|---------|------------------|-----------|-------------|---------------|-----------------|----------|
| `business_item_overrides` | No | No | No | No | No | ✅ **SAFE TO DROP** |
| `business_collection_schedules` | `validate_days_of_week` (trigger) | **`businesses_with_capabilities`** | No | No | **Sì (Reviews, Analytics)** | 🔴 **BLOCKED** |
| `item_categories` | No | No | No | No | No | ⚠️ **BLOCKED (FK RESTRICT)** |
| `collections` | `duplicate_collection` | **`businesses_with_capabilities`** | No | No | **Sì (Reviews, Analytics)** | 🔴 **BLOCKED** |
| `collection_sections` | `enforce_collection_item_section_category` (trigger) | No | No | No | No | ⚠️ **BLOCKED (dipende da `collections`)** |
| `collection_items` | `delete_empty_collection_sections` (trigger) `enforce_collection_item_section_category` (trigger) | No | No | No | No | ⚠️ **BLOCKED (dipende da `collections`)** |
| `items` | `enforce_collection_item_section_category` (trigger) | No | **`item_tags_owner_only`** su `item_tags` | No | No | ⚠️ **BLOCKED (RLS `item_tags`)** |

---

### Dettaglio per tabella

#### `business_item_overrides`
```
✅ SAFE TO DROP
```
Nessuna dipendenza attiva. L'unico importer TypeScript (`BusinessOverrides.tsx`) è stato eliminato nello step 5. Nessuna view, funzione SQL o edge function la usa. La RLS policy è interna e si elimina con la tabella.
**Prerequisito**: deve essere droppata prima di `items` (FK `item_id → items.id`).

---

#### `business_collection_schedules`
```
🔴 BLOCKED
```
La view `businesses_with_capabilities` esegue una JOIN su questa tabella. La view è interrogata da `businesses.ts::getUserBusinesses()`, chiamata da `Reviews.tsx` e `Analytics.tsx` — entrambe route attive in `App.tsx`.

**Prerequisito per sbloccare**: eliminare o riscrivere `businesses_with_capabilities` (rimuovendo il riferimento a `business_collection_schedules` e `collections`). Questo è fuori scope dello step 7A.

---

#### `item_categories`
```
⚠️ BLOCKED (transitivo — FK RESTRICT da collection_sections e items)
```
Nessuna dipendenza attiva diretta. Non usata da view, funzioni SQL attive, o edge functions.
Tuttavia: `collection_sections.base_category_id` e `items.category_id` la referenziano con FK ON DELETE RESTRICT. Non è possibile droppare `item_categories` finché esistono righe nelle tabelle figlie, né fare DROP TABLE senza prima droppare `collection_sections` e `items`. Entrambe sono a loro volta bloccate (catena da `collections`).

**Sblocco**: si sblocca automaticamente una volta risolto il blocco di `collections`.

---

#### `collections`
```
🔴 BLOCKED
```
La view `businesses_with_capabilities` esegue SELECT e JOIN su questa tabella in 6 punti. Stessa catena di Reviews/Analytics descritto sopra.

Inoltre: la funzione SECURITY DEFINER `duplicate_collection()` usa `collections` e rimarrebbe invalida dopo il DROP. Deve essere eliminata prima del DROP della tabella.

**Prerequisito per sbloccare**: eliminare `businesses_with_capabilities` e `duplicate_collection()`.

---

#### `collection_sections`
```
⚠️ BLOCKED (transitivo — catena da collections)
```
FK `collection_sections.collection_id → collections.id` ON DELETE CASCADE. Non è possibile droppare `collection_sections` indipendentemente finché `collections` è bloccata.
La funzione trigger `enforce_collection_item_section_category()` la legge: deve essere droppata prima del DROP.

---

#### `collection_items`
```
⚠️ BLOCKED (transitivo — catena da collections)
```
FK `collection_items.collection_id → collections.id` ON DELETE CASCADE. Stessa catena.
I trigger `trg_delete_empty_collection_sections` e `trg_enforce_collection_item_section_category` sono su questa tabella — verrebbero eliminati automaticamente col DROP della tabella.

---

#### `items`
```
⚠️ BLOCKED (RLS policy su item_tags)
```
La policy `item_tags_owner_only` sulla tabella **`item_tags`** (fuori dalla lista candidati) usa `items` in una subquery. Droppare `items` renderebbe invalida questa policy e provocherebbe errori runtime su qualsiasi query a `item_tags`.

**Prerequisito**: eliminare o riscrivere `item_tags_owner_only` su `item_tags`, oppure droppare `item_tags` stessa (tabella legacy, non nella lista attuale).

---

### Radice del blocco

Il blocco principale è un **unico oggetto**:

```
VIEW public.businesses_with_capabilities
```

Dipende da `collections` e `business_collection_schedules`. È usata da route attive in App.tsx.
Finché questa view esiste o viene interrogata, 6 delle 7 tabelle candidate non possono essere droppate.

**Blocco secondario** (indipendente):

```
POLICY item_tags_owner_only ON public.item_tags
```

Dipende da `items`. Deve essere gestita separatamente.

---

### Oggetti DB da eliminare nella migration (step 7B)

Per sbloccare il DROP di tutte e 7 le tabelle, la migration dovrà:

1. `DROP VIEW public.businesses_with_capabilities;`
2. `DROP FUNCTION public.duplicate_collection(uuid, text);`
3. `DROP FUNCTION public.duplicate_collection(uuid, text, boolean);`
4. `DROP FUNCTION public.delete_empty_collection_sections();` *(il trigger associato si elimina col DROP di `collection_items`)*
5. `DROP FUNCTION public.enforce_collection_item_section_category();` *(idem)*
6. `DROP FUNCTION public.validate_days_of_week();` *(il trigger si elimina col DROP di `business_collection_schedules`)*
7. Gestire `item_tags_owner_only` su `item_tags` (drop policy, o drop della tabella `item_tags`)
8. DROP tabelle nell'ordine corretto (figli prima dei genitori con RESTRICT)

La riscrittura di `businesses.ts::getUserBusinesses()` e delle pagine Reviews/Analytics sarà necessaria prima che la view possa essere eliminata.
