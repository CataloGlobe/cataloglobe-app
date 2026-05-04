# Translations Audit — Addendum: Caratteristiche & Note

**Data**: 2026-05-03
**Scope**: addendum a `docs/translations-audit.md`. Mappa fattuale di una modifica al modello prodotto introdotta nelle ultime due settimane (migrations `20260430150000` → `20260430200000`, doc di sessione `DESIGN_product_characteristics.md`, `FASE_*_PLAN.md`). La modifica sostituisce — per i tenant `vertical_type = food_beverage` — la sezione "Attributi" con una nuova sezione **"Caratteristiche e Note"**, e impatta direttamente lo scope delle traduzioni.
**Vincoli**: ricognitivo, zero codice scritto, zero migration applicata. Citato file path per ogni claim.

---

## 1. Schema DB nuovo / modificato

### 1.1 `product_characteristics` (lookup cross-tenant)

File: `supabase/migrations/20260430150000_product_characteristics.sql`.

Tabella system-managed (mirror del pattern `allergens`).

```sql
CREATE TABLE public.product_characteristics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN
        ('diet', 'spicy', 'origin', 'preparation', 'warning', 'status')),
    vertical TEXT NOT NULL CHECK (vertical IN
        ('food_beverage', 'retail', 'hotel', 'generic')),
    label_it TEXT NOT NULL,
    label_en TEXT NOT NULL,
    icon TEXT NOT NULL,                 -- '<prefix>:<name>' — lucide|custom|badge
    sort_order INT NOT NULL DEFAULT 0,
    -- show_in_card: rimossa via 20260430200000 (vedi 1.5)
    mutex_group TEXT,                    -- es. "spicy" per radio-like categories
    dietary_claim BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (code, vertical)
);
CREATE INDEX idx_product_characteristics_vertical ON public.product_characteristics(vertical);
```

**RLS**: 2 policy.
- `Public can read product_characteristics` (SELECT, USING true) — cross-anon + authenticated lookup.
- `Service role has full access` (FOR ALL TO service_role).
- **Niente policy INSERT/UPDATE/DELETE per anon/authenticated**: tabella è platform dictionary, scrittura solo via migration o backoffice futuro.

### 1.2 `product_characteristic_assignments` (join tenant-scoped)

Stessa migration `20260430150000`.

```sql
CREATE TABLE public.product_characteristic_assignments (
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    characteristic_id UUID NOT NULL REFERENCES public.product_characteristics(id)
        ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (product_id, characteristic_id)
);
CREATE INDEX idx_pca_tenant_product
    ON public.product_characteristic_assignments(tenant_id, product_id);
```

**RLS** (6 policy):
- 4 tenant policy via `get_my_tenant_ids()`: SELECT/INSERT/UPDATE/DELETE TO authenticated.
- 1 public read TO anon (per pagina pubblica via service_role o query diretta).
- 1 service role full.

> Nota: `product_id, characteristic_id` come PK composite. Niente colonna `id` surrogate (allinea al pattern `product_allergens`).

### 1.3 Seed `product_characteristics` — food_beverage v1.0

File: `supabase/migrations/20260430150100_product_characteristics_seed_food_beverage.sql`.

**31 voci** sul `vertical = 'food_beverage'`, distribuite su 6 categorie:
- `diet` (8): vegetarian, vegan, gluten_free, lactose_free, halal, kosher, organic, raw — tutte `dietary_claim=true`.
- `spicy` (3, mutex_group='spicy'): spicy_mild, spicy_medium, spicy_hot.
- `origin` (5): km_zero, slow_food, fivi, coravin, sustainable_fishing.
- `preparation` (4): frozen_ingredients, blast_chilled, homemade, seasonal.
- `warning` (6): contains_garlic, contains_onion, contains_pork, contains_alcohol, … (lista parziale visibile).
- `status` (5): chef_recommended, new, signature_dish, popular, out_of_stock.

`label_it` + `label_en` popolati per ogni voce. **Non c'è `label_fr` / `label_de` / altre lingue** (vedi sezione 6.3).

`icon` è formato `<prefix>:<name>` con 3 prefissi:
- `lucide:*` → import da `lucide-react`.
- `custom:*` → SVG locale in `src/components/icons/characteristics/` (deferred — oggi rendering via fallback Lucide).
- `badge:*` → React badge testuale per marchi/sigle culturali (Halal, Kosher, FIVI, Slow Food, 18+).

`ON CONFLICT (code, vertical) DO NOTHING` → seed idempotente.

### 1.4 `products.notes` (campo JSONB array)

File: `supabase/migrations/20260430190000_extend_products_with_notes.sql`.

```sql
ALTER TABLE public.products
    ADD COLUMN notes JSONB NOT NULL DEFAULT '[]'::jsonb;
```

**Niente CHECK constraint a DB**. Validation single source of truth in `validateProductNotes()` (sezione 3.2):
- max 10 entries
- `label`: non vuoto, ≤ 100 char
- `value`: ≤ 500 char (può essere vuoto)

Shape per entry: `{ label: string, value: string }`. Esempi seed plausibili:
- `{ label: "Provenienza", value: "Carne italiana 100%" }`
- `{ label: "Presidio", value: "Slow Food" }`

**Chiavi NON enumerate**: a differenza di `activities.fees` (enum chiuso 5 voci), le notes hanno `label` testo libero — il tenant nomina la sua etichetta.

### 1.5 Cleanup `show_in_card`

File: `supabase/migrations/20260430200000_drop_show_in_card_from_product_characteristics.sql`.

`ALTER TABLE product_characteristics DROP COLUMN IF EXISTS show_in_card`. La policy di rendering pubblico è cambiata in Fase 5: tutte le caratteristiche assegnate al prodotto vanno in card capped da `MAX_CHARACTERISTIC_EMOJIS = 6` con overflow `+N`. Niente filtro per-platform-flag.

### 1.6 Stato `product_attribute_definitions` / `product_attribute_values` (legacy)

**Non droppate, non modificate**. Le tabelle attributi legacy esistono ancora a DB (migration `20260224173200_v2_product_attributes.sql`, governance `20260306000000`, public read `20260329200000`, default show_in_public `20260401120000`). Rimangono **invariate** post-modifica F&B.

L'esposizione UI è ora gated per `vertical_type` (sezione 2.4). Per `food_beverage` la tab Attributi non viene renderizzata; per `retail` continua a esserlo. Per `hotel`/`generic` la tab non è gated come "attributes" ma `customAttributes: false` → idem nascosta.

---

## 2. Components / forms UI coinvolti

### 2.1 Nuovo tab: `CharacteristicsAndNotesTab`

- Path: `src/pages/Dashboard/Products/CharacteristicsAndNotesTab.tsx` (+ `.module.scss`).
- Wrapper della tab "Caratteristiche e Note". Composizione:
  - `CharacteristicsSection` (renderizzata se `productSections.characteristics`).
  - `ProductNotesSection` (renderizzata se `productSections.notes`).
- Stato locale: `characteristicIds: string[]`, `characteristicsSnapshot: string[]`, `notes: ProductNote[]`, `isDirty`, `isSaving`.
- Save: `Promise.allSettled([setProductCharacteristics(...), updateProduct(... notes ...)])` con resync della porzione fulfilled e toast per la rejected.
- Action bar sticky-bottom (slide-in via `isDirty`) con bottoni Annulla/Salva.

### 2.2 `CharacteristicsSection`

- Path: `src/pages/Dashboard/Products/components/CharacteristicsSection/CharacteristicsSection.tsx` (+ `.module.scss`).
- Props: `{ vertical?: string; value: string[]; onChange(next: string[]); disabled?: boolean }`.
- Mount: `listCharacteristics(vertical)` → state `available`. Stati: `loading | ready | empty | error`.
- 6 sezioni in ordine fisso `CATEGORY_ORDER = [diet, spicy, origin, preparation, warning, status]`.
- Categorie con `mutex_group` (oggi solo `spicy`): chip in `<role="radiogroup">`, click sostituisce sibling attivo nello stesso gruppo.
- Categorie senza mutex: chip in `<role="group">`, multi-select toggle.
- Render chip = `<button>` + `<CharacteristicIcon variant="bare">` + `<span>{label_it}</span>`.

### 2.3 `ProductNotesSection`

- Path: `src/pages/Dashboard/Products/components/ProductNotesSection/ProductNotesSection.tsx` (+ `.module.scss`).
- Props: `{ value: ProductNote[]; onChange(next: ProductNote[]); disabled?: boolean }`.
- Pattern controlled, no internal state.
- Costanti UI: `MAX_NOTES = 10`, `MAX_LABEL_LENGTH = 100`, `MAX_VALUE_LENGTH = 500`.
- Riga = 2 `TextInput` (label "Etichetta", placeholder "es. Provenienza"; value "Valore", placeholder "es. Carne italiana 100%") + bottone X di rimozione.
- Validazione UI permissiva (label vuoto mostra error inline ma non blocca Salva). Authoritative validation server-side via `validateProductNotes`.

### 2.4 Tab gating in `ProductPage`

File: `src/pages/Dashboard/Products/ProductPage.tsx`.

Tabs definite in `allTabs` con flag `gated`:

| value | label | gated |
|---|---|---|
| `general` | "Generale" | sempre |
| `characteristics` | `verticalConfig.copy.productSections.characteristics` | `(productSections.characteristics ‖ productSections.notes) && !isVariant` |
| `pricing` | "Prezzi" o "Prezzi & Varianti" | sempre |
| `config` | "Opzioni" | sempre |
| `attributes` | `verticalConfig.copy.productSections.customAttributes` | `productSections.customAttributes` |
| `usage` | "Utilizzo" | sempre |

Tab characteristics **persistente solo su parent product** (`product.parent_product_id === null`) — variant inherit visualmente in pubblico ma non hanno editor.

### 2.5 `CharacteristicIcon` (UI shared)

Path: `src/components/ui/CharacteristicIcon/CharacteristicIcon.tsx`.

- Wrapper `<span>` con tooltip CSS-only (`label?` → tooltip + `aria-label`).
- 3 prefissi gestiti via `parseIcon(icon)`:
  - `lucide:*` → `LUCIDE_ICON_MAP[name]` (16 icone tree-shakeable).
  - `custom:*` → `CUSTOM_FALLBACK_MAP[name]` (oggi è solo Lucide approximation con optional color override; SVG reali deferred).
  - `badge:*` → `<CharacteristicBadge>` con `BADGE_LABEL_MAP[name]` (HALAL, KOSHER, SLOW FOOD, FIVI, 18+). Visible text **derivato dal key dell'icona**, NON da `label`.
- Variants: `default` (chip-look) e `bare` (no bg, riusato in card e nei chip ItemDetail).

### 2.6 Pubblico — render del payload

- `src/components/PublicCollectionView/CollectionView/CollectionView.tsx`:
  - `ProductRow` (Card) → blocco `.characteristicEmojis` flex-wrap, `MAX_CHARACTERISTIC_EMOJIS = 6`, overflow `+N`. Icone size 20.
  - `ProductCompactRow` (Compatto) → idem, size 16.
  - `CollectionViewSectionItem.characteristics?: ResolvedCharacteristic[]` + `notes?: ResolvedProductNote[]`.
- `src/components/PublicCollectionView/ItemDetail/ItemDetail.tsx`:
  - Sezione **Caratteristiche** (`.characteristicSection`): chip pillola con `<CharacteristicIcon variant="bare">` + `label_it`.
  - Sezione **Informazioni** (`.notesSection`): `<dl>` con `<dt>{note.label}</dt><dd>{note.value}</dd>` per ogni nota.
- `src/components/PublicCollectionView/PublicFooter/PublicFooter.tsx`:
  - Bottone "Caratteristiche" (icona Lucide-style, label fissa) condizionato a `hasCharacteristics` (almeno 1 prodotto del catalogo le usa) → apre `CharacteristicsSheet`.
- `src/components/PublicCollectionView/CharacteristicsSheet/CharacteristicsSheet.tsx`:
  - Bottom-sheet legenda. Lista verticale icona + `label_it` + opzionale category caption (>= 3 categorie distinte).
  - Disclaimer hardcoded IT: *"Le caratteristiche indicate sono dichiarate dal ristoratore. Per certificazioni specifiche (Halal, Kosher, Bio) o esigenze particolari, chiedi al personale di sala."*

### 2.7 `verticalTypes.ts` — switch UI

File: `src/constants/verticalTypes.ts`.

`VerticalConfig.productSections` ha 5 flag indipendenti:
- `allergens`, `ingredients`, `characteristics`, `customAttributes`, `notes`.

Mapping per i 6 vertical_type:

| vertical_type | allergens | ingredients | characteristics | customAttributes | notes |
|---|:---:|:---:|:---:|:---:|:---:|
| `food_beverage` | ✅ | ✅ | ✅ | ❌ | ✅ |
| `restaurant` (legacy → eredita) | ✅ | ✅ | ✅ | ❌ | ✅ |
| `bar` (legacy → eredita) | ✅ | ✅ | ✅ | ❌ | ✅ |
| `retail` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `hotel` | (TBD, non visibile in selezione) | … | … | … | … |
| `generic` | … | … | … | … | … |

> Solo `food_beverage` è offerto in `ACTIVE_MACROS`. Altri vertical sono "Coming Soon" in UI ma il config esiste già.

`copy.productSections.characteristics` = "Caratteristiche e Note" (label tab).

---

## 3. Service layer modificato

### 3.1 `productCharacteristics.ts` (nuovo)

Path: `src/services/supabase/productCharacteristics.ts`. 4 funzioni:

```ts
listCharacteristics(vertical?: string): Promise<ProductCharacteristic[]>
// query select * from product_characteristics [where vertical = ?]
// order by sort_order ASC, label_it ASC

getProductCharacteristics(productId, tenantId): Promise<string[]>
// → solo characteristic_id

getProductsCharacteristics(productIds[], tenantId): Promise<Record<string, ResolvedProductCharacteristic[]>>
// batch via select product_id, characteristic_id, characteristic:product_characteristics(code, label_it, icon, category)
// shape ResolvedProductCharacteristic = { characteristic_id, code, label_it, icon, category }

setProductCharacteristics(tenantId, productId, ids[]): Promise<void>
// pattern delete-all + insert (mirror setProductAllergens)
```

**Importante**: validation che la characteristic appartenga al `vertical` del tenant è **delegata al caller (UI)**. DB non enforce match — la UI restringe il pool via `listCharacteristics(vertical)`. Vedi `DESIGN_product_characteristics.md` sez. 7.3.

### 3.2 `products.ts` — estensione `notes`

File: `src/services/supabase/products.ts`.

- Type `V2Product` ha `notes: ProductNote[]` (non nullable per DB DEFAULT `'[]'`).
- Nuovo type esportato: `ProductNote = { label: string; value: string }`.
- Nuova funzione esportata: `validateProductNotes(notes: unknown): ProductNote[]` — normalizza (trim, drop entries con label+value vuoti, reject array > 10, label > 100, value > 500). Throw `Error` con messaggi italiani.
- `createProduct(tenantId, data: { ..., notes? })`: chiama `validateProductNotes` e include nel payload INSERT.
- `updateProduct(id, tenantId, data: { ..., notes? })`: idem su UPDATE.

### 3.3 `attributes.ts` — invariato

Service `src/services/supabase/attributes.ts` esiste invariato. Non è stato deprecato. È ancora consumato da `AttributesTab.tsx` quando `productSections.customAttributes === true`.

### 3.4 `resolveActivityCatalogs.ts` (FE + edge — entrambe le copie)

Path FE: `src/services/supabase/resolveActivityCatalogs.ts`.
Path edge: `supabase/functions/_shared/resolveActivityCatalogs.ts`.

Entrambe sincronizzate. Modifiche confermate via `grep`:
- `CATALOG_SELECT` esteso con campo `notes` su parent + variant block.
- `CATALOG_SELECT` esteso con sub-select PostgREST: `characteristics:product_characteristic_assignments(characteristic:product_characteristics(...))` su parent + variant.
- Type `ResolvedCharacteristic` esportato (id, code, category, label_it, label_en, icon, sort_order, mutex_group, dietary_claim).
- Type `ResolvedProductNote` esportato (mirror di `ProductNote` — duplicato per evitare service import dal tree dei tipi pubblici).
- Mapper inline `mapCharacteristics` aggiunto. Spread conditional: `...(pCharacteristics.length > 0 ? { characteristics: pCharacteristics } : {})`.

Le coppie type pubbliche sono in `src/types/resolvedCollections.ts`. Le coppie service-side in `src/types/productCharacteristic.ts` (`ProductCharacteristic`, `ResolvedProductCharacteristic`).

---

## 4. Edge function impattate

### 4.1 `resolve-public-catalog` ✅ aggiornata

- Estesa per servire `characteristics` + `notes` nel payload pubblico (sezione 3.4).
- **Necessita redeploy** se il DB ha la migration ma l'edge function gira con CATALOG_SELECT vecchio. Verificare in staging via tab Network del browser sulla pagina pubblica (presenza del campo `characteristics`/`notes` nel JSON di resolve-public-catalog).

### 4.2 `menu-ai-import` ❌ NON aggiornata

File: `supabase/functions/menu-ai-import/index.ts`.

**Stato attuale**: il prompt Gemini estrae solo:
- `name`, `description`, `base_price`, `product_type` (`simple` | `formats`), `formats[]`, `confidence`, `menu_language`.

**Non genera**:
- caratteristiche (es. "vegetariano" / "piccante" inferiti dal nome del piatto o dalla descrizione)
- notes (es. "Provenienza" / "Stagionale" inferite da diciture in menu cartaceo come "carni italiane" o "solo in stagione")

L'AI import **continua a creare prodotti vuoti di caratteristiche e note**. Conseguenze pratiche:
- Il tenant deve assegnare manualmente le caratteristiche a ogni prodotto importato.
- Le diciture come "carni provenienti da allevamenti certificati" sono esplicitamente in `What to Ignore` del prompt (commento "Certifications and origin claims (e.g., 'carni provenienti da allevamenti certificati')") → vengono scartate.

Implicazione translations: P13 dell'audit originale (post-import enqueue traduzioni) si conferma valido. Aggiunta: anche le caratteristiche post-import sono assenti, quindi non ci sono dati da tradurre lato characteristics fino a che l'utente non li assegna manualmente.

### 4.3 Altre edge function

`generate-menu-pdf` (PDF menu): potenziale consumer di notes/caratteristiche se il PDF deve riflettere il menu pubblico. **Non verificato** in questa ricognizione (out of scope dell'audit translations a meno che non si voglia tradurre il PDF, oggi solo IT).

---

## 5. Rendering pagina pubblica

### 5.1 Card prodotto (`CollectionView`)

Sotto `description` + customizable hint, sopra add-to-selection. Due cluster orizzontali:
1. Allergeni (chip rotondi, bg `pub-primary-soft`).
2. Caratteristiche (icone "nude", no bg — pattern intenzionalmente asimmetrico vs allergeni; vedi `CSS_REFINEMENTS_AUDIT.md`).

`MAX_CHARACTERISTIC_EMOJIS = 6` con overflow `+N`. Icon size 20 (Card list/grid), 16 (Compatto).

Tooltip CSS-only su `:hover` con `label_it`.

### 5.2 ItemDetail (sheet dettaglio prodotto)

Tre sezioni dedicate (chip-style, identico look):
1. **Caratteristiche** — `.characteristicBadges` flex-wrap di `.characteristicBadge` (icon variant=bare + label_it).
2. **Allergeni** — invariato.
3. **Informazioni** — `<dl>` con coppie `<dt>{note.label}</dt><dd>{note.value}</dd>`.

L'**ordine** delle 3 sezioni va verificato runtime (non documentato esplicitamente nei plan).

### 5.3 PublicFooter — legenda

Bottone "Caratteristiche" condizionato a `hasCharacteristics` (almeno 1 prodotto del catalogo ne ha). Click → `CharacteristicsSheet` bottom-sheet con lista verticale icona + `label_it` (+ optional category caption se ≥ 3 categorie distinte) + disclaimer testuale fisso IT.

### 5.4 ItemDetail — sezione "Attributi" (legacy)

Il blocco `attributes` esiste ancora in `ItemDetail.tsx` e nella query edge function. **In F&B viene servito ma è quasi sempre array vuoto** perché l'utente non lo popola da UI (tab nascosta). Il blocco renderizza solo se `attributes.length > 0` → in pratica invisibile per F&B. Cleanup futuro previsto, **non bloccante**.

---

## 6. Implicazioni dirette sullo scope traduzioni

### 6.1 Entrate nello scope (nuove entità da gestire)

#### `products.notes` — **PER-TENANT, da tradurre**

- Shape: `JSONB array of { label: string, value: string }`.
- Sia `label` che `value` sono testo libero scritto dal tenant in italiano.
- Visibili pubblicamente in `ItemDetail` come `<dt>label</dt><dd>value</dd>`.
- **Pattern di traduzione**: identico a `products.description` o `product_attribute_values.value_text` (campi testuali per-tenant). Va in coda traduzione automatica al save.
- **Hash key suggerita**: `products.notes#{product_id}` con hash del JSON serializzato. Invalidazione: ricalcolo hash su `notes` change.
- **Edge case**: max 10 entries, label ≤ 100 char, value ≤ 500 char → traduzione tipicamente sotto i 6000 char per prodotto. Tier MT economici sufficienti.
- **Nuovo problema**: `label` ha cardinalità potenzialmente alta cross-tenant ma probabilmente bassa di fatto ("Provenienza", "Allevamento", "Certificazione", "Lavorazione" ecc.). Candidato dictionary cross-tenant futuro (analogo all'opzione B per ingredients in audit originale, sez. 9.2). **Decisione architettura v3**: per ora trattare label come stringa per-tenant (più semplice). Valutare dictionary platform in v4 se si osserva alta duplicazione.

### 6.2 In scope ma NON necessitano traduzione runtime

#### `product_characteristics` (lookup cross-tenant)

- **Già bilingue al seed**: ogni row ha `label_it` + `label_en`.
- **NON ci sono `label_fr` / `label_de` / `label_es`** o tabella `product_characteristic_translations` separata.
- Pattern allergens-style (cfr. `audit translations` sez. 4.3): traduzione "one-shot system", da fare via migration che aggiunge colonne `label_<lang>` o tabella translations dedicata, popolata dalla piattaforma (NON dal tenant).
- **Costo**: 31 voci × 1 lingua aggiuntiva = 31 stringhe per lingua. Banale.
- **Implicazione architettura v3**: aggiungere alla roadmap un mini-task "expand product_characteristics platform translations" parallelo all'analogo per allergens.

### 6.3 Escono dallo scope (per F&B)

#### `product_attribute_definitions.label` + `options`

- Tab Attributi nascosta per `food_beverage` → tenant F&B non popola attributi → `product_attribute_values` per F&B = vuoto.
- L'edge function continua a servire `attributes` ma in pratica è sempre `[]` per F&B.
- **Decisione translations**: `label` (definitions) + `options` (JSON di label) + `value_text` (values) **escono dallo scope per F&B**. Restano in scope per `retail` (`customAttributes: true` nel config).

> **Attenzione**: lo scope traduzioni dipende dal `vertical_type` del tenant. v3 dovrà introdurre un filtro "vertical-aware" sulla pipeline traduzioni, altrimenti si traducono testi che il pubblico non vede mai.

#### `product_attribute_values.value_text`

- Stesso ragionamento: vuoto in F&B, popolato in retail.
- **Decisione translations**: idem (out per F&B, in per retail).

### 6.4 Cambiamenti di natura — non scope

- **Sezione "Attributi" → "Caratteristiche e Note"**: cambia il *modello concettuale* (da chiavi-libere a chiavi-curate-platform + chiavi-libere-tenant). Ma il modello traduzioni rimane analogo:
  - "Caratteristiche" = pattern allergens (system, label cross-tenant).
  - "Note" = pattern attributes legacy (per-tenant, libero, da tradurre).
- **Niente cambi sui `products.description`, `products.name`, `catalogs.name`, `catalog_categories.name`**: invariati. Sezione 1 dell'audit originale resta valida.

---

## 7. Questioni aperte da decidere prima di aggiornare l'architettura v2 → v3

### Q-CN1 — Dictionary platform per `notes.label`?

`notes.label` è testo libero per-tenant. Se in pratica i tenant scrivono pochi label ricorrenti ("Provenienza", "Lavorazione", "Allevamento", "Certificazione") c'è duplicazione cross-tenant tipo P8 dell'audit originale (ingredients).

**Opzioni**:
- **A**: lasciare label come stringa per-tenant. Semplicità. Costo: traduzione ridondante.
- **B**: introdurre `note_label_dictionary` platform table con auto-suggest in UI (simile a IngredientCombobox). Tenant può scegliere da dictionary o scrivere custom. La traduzione del dictionary entry è platform-side (one-shot); del custom è per-tenant.
- **C**: rinviare la decisione. Misurare cardinalità label dopo 3 mesi di uso reale.

**Recommend per v3**: **C**. Misurare. Se >70% dei label rientra in 10 valori, passare a B in v4.

### Q-CN2 — Vertical-aware translation pipeline?

Lo scope cambia per `vertical_type`. F&B esclude attributes; retail li include. Una pipeline single-config tradurrebbe testi inutili.

**Opzioni**:
- **A**: filtro hard-coded per vertical: pre-enqueue, ispezionare il `tenant_id → vertical_type` e skippare entità out-of-scope.
- **B**: sempre tradurre tutto, ma il rendering pubblico filtra. Costo OPEX più alto, ma semplicità della pipeline.
- **C**: configurazione esplicita per-tenant (col `enabled_translations: text[]`) — flessibile ma onere admin.

**Recommend per v3**: **A** con `vertical → translatable_entities[]` mapping in `verticalTypes.ts`. Pulito, controllato.

### Q-CN3 — `product_characteristics` traduzioni multi-lingua: schema?

Oggi solo `label_it` + `label_en`. Per estendere a 6+ lingue:

**Opzioni**:
- **A**: aggiungere colonne `label_<lang>` per ogni lingua nuova. Pattern attuale, semplice. Scarsa scalabilità (DDL per ogni lingua).
- **B**: tabella `product_characteristic_translations(characteristic_id, lang, label)` con UNIQUE(characteristic_id, lang). Idiomatic. Richiede join.
- **C**: colonna `labels JSONB` con shape `{ it: "...", en: "...", fr: "..." }`. Pratico ma tipi TS più deboli.

**Recommend per v3**: **B**. Scalabile, allineata al pattern translations per le entità per-tenant. Il payload pubblico fa join + flatten.

> Decisione interlock: anche `allergens` ha solo `label_it` + `label_en` oggi. Allinearsi sullo schema scelto: **stesso pattern per allergens e characteristics**.

### Q-CN4 — `notes.value` vuoto è valido?

`validateProductNotes` oggi accetta `value === ""` (drop solo se label e value entrambi vuoti). Quindi un tenant può salvare `{ label: "Stagionale", value: "" }` come nota informativa.

**Implicazione translations**: traduciamo solo `label` quando `value` è vuoto? O salviamo come placeholder vuoto?

**Recommend per v3**: traduce comunque entrambi (anche `value: ""` → `value: ""`). Pipeline robusta a stringhe vuote.

### Q-CN5 — `CharacteristicsSheet` disclaimer hardcoded

Stringa fissa IT in `CharacteristicsSheet.tsx`:
> "Le caratteristiche indicate sono dichiarate dal ristoratore. Per certificazioni specifiche (Halal, Kosher, Bio) o esigenze particolari, chiedi al personale di sala."

**Decisione**: trattare come UI string, NON come content tradotto. Va in i18n catalogo statico (sezione 5 audit originale, "UI strings hardcoded"). Aggiungere alla v3 nella lista UI strings.

### Q-CN6 — Ordine sezioni in ItemDetail

Le 3 sezioni "Caratteristiche", "Allergeni", "Informazioni" coesistono. L'ordine attuale renderizzato non è esplicitamente documentato. Verificare in browser:
- Caratteristiche prima o dopo Allergeni?
- Informazioni (notes) prima o dopo Allergeni?

**Implicazione translations**: irrilevante per la pipeline. Solo UX, ma da chiarire in v3 sez. 5 ("rendering pagina pubblica").

### Q-CN7 — `menu-ai-import` post-hook caratteristiche?

P13 dell'audit originale chiedeva enqueue traduzioni dopo import. Domanda nuova: **l'AI può inferire caratteristiche** dal nome/descrizione (es. detect "Vegetariano" → assegnare `vegetarian`)?

**Opzioni**:
- **A**: out-of-scope translations v3, è feature di import indipendente.
- **B**: in-scope se v3 vuole un payload "completo" subito dopo import (caratteristiche → traduzione → render multi-lingua).

**Recommend per v3**: **A**. È una feature import-AI separata, non una feature traduzioni. Documentare come "future enhancement: AI-inferred characteristics post-import".

### Q-CN8 — Variants e caratteristiche/note

UI tab "Caratteristiche e Note" è gated **solo per parent product** (`parent_product_id IS NULL`). Variants non hanno editor. Tuttavia il payload pubblico le serve sia per parent che per variant (CATALOG_SELECT le include su entrambi).

**Implicazione**: oggi le variant **non hanno mai caratteristiche/note proprie** (DB le ammette ma UI non le scrive). Il payload edge function le serve a `0` per variant.

**Decisione translations**: tradurre solo per parent. Variants sono un fork del modello UI ma non del modello traduzioni. Nessun overhead.

### Q-CN9 — Vertical legacy `restaurant`/`bar`/`hotel`/`generic` traduzioni

`product_characteristics.vertical CHECK` accetta solo 4 valori canonici. Tenant con `vertical_type = 'restaurant'` (legacy) → `listCharacteristics('restaurant')` ritorna **vuoto** (nessuna row con `vertical = 'restaurant'`).

Mitigazione richiesta in `verticalTypes.ts`: TODO già documentato per "canonicalVerticalType() mapper o tighten DB CHECKs". Senza questo mapper i tenant legacy non vedono caratteristiche.

**Implicazione translations**: marginale, ma se v3 considera `restaurant`/`bar` come "in scope characteristics" via mapping, allora il pool tradotto deve coprirli implicitamente attraverso `food_beverage`.

**Recommend v3**: dichiarare nel doc che il vertical canonico per characteristics è `food_beverage`; i legacy mappano logicamente. Non serve duplicare seed.

### Q-CN10 — Hash invalidation per `notes`

L'audit originale (sez. 6) lista hash strategy per ogni entità. `products.notes` è nuovo. Proposta:
- Hash key: `products.notes#{product_id}`
- Hash value: SHA256 del JSON serializzato (`JSON.stringify(notes)`).
- Invalidate al `updateProduct({ notes })`.

**Recommend v3**: aggiungere alla sezione 6 dell'architecture v2 una riga per `products.notes` con questo schema.

---

## Riassunto operativo

**Stato dell'implementazione caratteristiche/note** (verificato sul filesystem):
- ✅ Schema DB: 3 migration apply (15000, 15100 seed, 19000 notes, 20000 cleanup show_in_card).
- ✅ Service layer: `productCharacteristics.ts` + estensione `products.ts` con `validateProductNotes`.
- ✅ UI editor: tab "Caratteristiche e Note" + sezioni dedicate.
- ✅ UI pubblica: card icons + ItemDetail sezioni + PublicFooter sheet.
- ✅ Edge function: CATALOG_SELECT esteso (sync FE + edge entrambi).
- ❌ AI import: `menu-ai-import` non genera caratteristiche/note. Out-of-scope per v3.
- ❌ Cleanup attributi legacy: lasciato in place per retail (non F&B).

**Top impatti sullo scope v3** (in ordine di importanza):
1. **`products.notes` entra nello scope** (per-tenant, traduzione standard).
2. **`product_characteristics.label_*` resta out-of-scope per il tenant** ma serve task one-shot platform (multi-lingua come allergens).
3. **`product_attribute_definitions/values` esce dallo scope per F&B**, resta in scope per retail. Pipeline deve essere vertical-aware (Q-CN2).
4. **Disclaimer + UI strings nuovi** vanno aggiunti al catalogo i18n statico (Q-CN5).
5. **Coordinazione con allergens**: schema multi-lingua deve essere lo stesso per allergens + characteristics (Q-CN3).

**Output atteso**: aggiornare `translations-architecture-v2.md` → `v3` integrando le decisioni Q-CN1…Q-CN10. Non procedere prima della validazione di questo documento.
