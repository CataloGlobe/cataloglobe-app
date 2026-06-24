# FASE 1 — Audit read-only: revert deve accodare il source IT CORRENTE

> Read-only. Nessuna modifica al codice/DB/git. Output = questo report.
> Data: 2026-06-24.

## Il bug (riepilogo confermato)

`revert_manual_translation` (orig `20260509130000`, estesa in `20260623160000`) legge `source_text`/`source_hash` **dalla riga `translations` manuale/overridden che sta per cancellare**, e con quel source accoda il job di ri-traduzione. La riga manuale porta il source **com'era quando l'override fu creato** → se l'entità è cambiata dopo (caso "Da rivedere" = stale per definizione), il job parte con source **vecchio**. Il worker — fedele esecutore — ritraduce il testo vecchio e scrive una riga auto con hash vecchio → l'elemento **resta stale**, ora senza più il tasto revert. Scopo principale di "Torna ad automatica" rotto.

Il difetto è identico per la revert dalla scheda Traduzioni del singolo elemento; lì era solo nascosto (di norma il source non era cambiato).

---

## 1. Tabella `entity_type/field → colonna source + colonna hash` (A1)

Tipi che possono **realisticamente** arrivare alla revert (vedi §4):

| entity_type | field | colonna source | colonna hash |
|---|---|---|---|
| `product` | `description` | `products.description` | `products.description_hash` |
| `product` | `notes` | `products.notes` (cast `::text`) | `products.notes_hash` |
| `category` | `name` | `catalog_categories.name` | `catalog_categories.name_hash` |

Confermati esattamente i 3 pair attesi. Il sistema gestisce in totale ~11 unità (ingredient/option_group/option_value/featured/closure…) con lo stesso schema `<table>.<field>` + `<table>.<field>_hash`, ma **non sono revertabili** (vedi §4) → il lookup del fix deve coprire **solo** questi 3.

### Come sono mantenuti gli hash (A2)

- **Nessun trigger DB.** Nessun `BEFORE INSERT OR UPDATE` di hashing su `products`/`catalog_categories`.
- Gli `<field>_hash` sono calcolati **nel service layer al salvataggio**: `src/services/translation/hashUtils.ts:33-35` `computeFieldHash` = `sha256Hex(text.trim().toLowerCase())` (hex digest); `computeNotesHash` (riga 52) = sha256 del JSON canonico `{label,value}` trimmed. Le backfill SQL usano la stessa formula: `encode(sha256(lower(trim(...))::bytea), 'hex')`.
- **Autoritativi**: coverage (`20260623120000`) e stale (`20260623130000`) confrontano contro **questa stessa** colonna `<field>_hash` (es. `p.description_hash AS source_hash`, join `t.source_hash = <field>_hash`). Se coverage classifica correttamente lo stale, allora `<field>_hash` **è** la fonte corrente autoritativa → leggere `products.description_hash` dà esattamente il valore con cui stale/coverage confrontano. ✅

---

## 2. Helper riutilizzabile (entity_type, entity_id, field) → source corrente? (A3)

**NO — non esiste.**

- `enqueue_tenant_language_backfill` (`20260504105139`) NON usa CASE/UNION generico: ha **9 blocchi INSERT hardcoded**, uno per tabella, ciascuno legge `<table>.<col>` + `<table>.<col>_hash` inline.
- coverage/stale usano un `UNION ALL` di SELECT per-tabella (non una funzione callable).
- Lato service esiste `fetchEntitySourceHash` (`translationStatus.ts:29-42`) ma solo per `description`/`notes` e ritorna solo l'hash, non il testo.

**Conseguenza FASE 2**: il fix deve **inlinare un proprio lookup `CASE`** (3 rami: product/description, product/notes, category/name) dentro la revert.

---

## 3. Lato worker: source dal job o ricalcolo? (B4) → dove va il fix

**Il job ROW memorizza source_text + source_hash; il worker li usa as-is, NON ricalcola.**

- `translation_jobs` (`20260503190000`): `source_text TEXT NOT NULL, source_hash TEXT NOT NULL`.
- `claim_pending_translation_jobs` (`20260623100000`): `RETURNS TABLE(... source_text, source_hash)` con `RETURNING j.source_text, j.source_hash`. Nessun join all'entità.
- Edge `process-translation-jobs/index.ts`: `texts = group.jobs.map(j => j.source_text)` (riga 106); unica lettura tabella entità è `tenants.base_language_code` (lingua, non contenuto). Scrive `upsert_auto_translation` con `p_source_text: job.source_text`, `p_source_hash: job.source_hash` (righe 128-129). Nessun hashing nel worker.

**Conclusione**: worker = esecutore puro del job (design corretto: snapshot all'enqueue + `FOR UPDATE SKIP LOCKED`). Se la revert accoda source stale → worker scrive riga auto stale, **non si auto-corregge**.

➡️ **Il fix va all'enqueue (dentro la revert)**. Toccare il worker romperebbe il modello snapshot/concorrenza. (Nota: `upsert_auto_translation` salta righe `status='manual'` — guard sugli override, non sullo staleness; non mitiga il bug.)

---

## 4. Quali entity_type arrivano alla revert (C5)

**Conferma: solo `product` (description, notes) e `category` (name).**

Due soli call site (service wrapper `src/services/supabase/translations.ts → revertManualTranslation`):

- **ReviewDrawer** (`ReviewDrawer.tsx:83-89`): entity_type/field dinamici dall'item stale, MA gated da `REVERTABLE = new Set(["product","category"])` (riga 27) + `status IN ('manual','overridden')`. La lista "Da rivedere" (`get_stale_translations`) mostra 11 tipi, ma il bottone Revert compare solo per product/category → reachable: **product(description), product(notes), category(name)**.
- **TranslationsTab** (`TranslationsTab.tsx:123-129`): entityType/fieldKey sono props fisse del parent. Montata solo 2 volte:
  - `ProductPage.tsx:239` → `entityType="product"`, `fieldKey="description"`. (Le note prodotto hanno solo una card info "modifica manuale non ancora disponibile" — niente TranslationsTab, niente revert note qui.)
  - `CatalogEngine.tsx:1892` → `entityType="category"`, `fieldKey="name"`.

Note:
- Le righe `manual`/`overridden` revertabili nascono solo dove c'è editor: **product.description** e **category.name**. `product.notes` è revertabile via ReviewDrawer **solo se** esiste una riga manuale (oggi nessuna UI la crea, ma il fix deve coprire il ramo per sicurezza/legacy).
- I 5 tipi che appaiono in "Da rivedere" ma con revert soppresso (no editor): `ingredient`, `option_group`, `option_value`, `featured`, `closure`. Non serve coprirli.
- La RPC in sé è permissiva (accetta qualsiasi entity_type/field con riga manuale): il gating è solo frontend. Il `CASE` del fix copre i 3 reachable; per entity_type fuori dai 3 → comportamento da decidere (proposta: fallback al vecchio comportamento o errore esplicito; vedi §5-D6).

---

## 5. Edge da gestire nel fix (D6-D8)

### D6 — Source corrente NULL/vuoto (es. descrizione svuotata)
Se `products.description` (o l'hash) corrente è NULL/vuoto: **cancella la riga manuale e NON accodare**. L'elemento diventa legittimamente "senza traduzione". Verifica coverage/stale: il join `t.source_hash = <field>_hash` con hash NULL non produce match → l'elemento risulta "missing/non-traducibile", coerente con un source vuoto. Da confermare in FASE 2 con un check sui RPC, ma a livello logico non rompe (nessuna riga auto stale creata, niente job orfano).

### D7 — Rischio job pending duplicato
**Sì, rischio reale.** `translation_jobs` ha solo `translation_jobs_dedup_idx` = indice parziale **NON unique** `(entity_type, entity_id, field, target_language_code) WHERE status='pending'`. Il dedup è procedurale:
- `enqueue_tenant_language_backfill`: `WHERE NOT EXISTS (... pending ...)` + `ON CONFLICT DO NOTHING`.
- **`revert_manual_translation`: INSERT nudo, NESSUN `NOT EXISTS`, NESSUN `ON CONFLICT`** (`20260623160000:64-69`) → può creare un secondo job pending.

➡️ FASE 2: aggiungere guard `WHERE NOT EXISTS (pending)` o `ON CONFLICT DO NOTHING` all'INSERT della revert (allinearla a enqueue).

### D8 — P0002
`20260623160000:49-51`: sollevato quando `v_source_text IS NULL` dopo SELECT sulla riga manuale → "No manual translation found". **Da mantenere**, ma cambia ruolo: dopo il fix la riga manuale serve solo per **esistenza + DELETE** (P0002 = niente da revertare), NON più come fonte del source. Il source verrà letto dall'entità via CASE.

---

## 6. Raccomandazione

**Approccio**: fix all'**enqueue dentro la revert** — la revert legge il source **corrente dall'entità** (CASE su product/description, product/notes, category/name) invece che dalla riga cancellata. Worker invariato (design snapshot corretto). Confermato sufficiente da B4.

**Logica target della nuova `revert_manual_translation`**:
1. Verifica esistenza riga `manual`/`overridden` (solo per esistenza/DELETE) → se assente, P0002 (invariato).
2. DELETE della riga manuale.
3. Lookup `CASE` del source CORRENTE `(source_text, source_hash)` dall'entità:
   - `product`+`description` → `products.description`/`description_hash`
   - `product`+`notes` → `products.notes::text`/`notes_hash`
   - `category`+`name` → `catalog_categories.name`/`name_hash`
4. Se source corrente NULL/vuoto → **stop, niente INSERT** (D6).
5. Altrimenti INSERT job con `ON CONFLICT DO NOTHING` / `WHERE NOT EXISTS` pending (D7), usando source corrente.
6. Mantiene il widening `status IN ('manual','overridden')` già introdotto in `160000`.

**Oggetti che FASE 2 toccherà** (prevedibile):
- **Nuova migration** `supabase/migrations/<YYYYMMDDHHMMSS>_fix_revert_uses_current_source.sql` → `CREATE OR REPLACE FUNCTION public.revert_manual_translation(...)` con CASE source corrente + guard NULL + dedup INSERT + widening manual/overridden. (Una sola migration, sostituisce logicamente `160000`.)
- Nessuna modifica frontend necessaria (service `translations.ts` e i 2 call site invariati: stessa firma RPC).
- Nessuna modifica worker / edge.

**Non esiste helper riutilizzabile** (A3) → il CASE va inline nella funzione. Restringerlo ai 3 rami reachable; per entity_type fuori scope, decidere in FASE 2 (default sicuro: comportarsi come oggi o sollevare errore controllato, dato che il gating è solo FE).
