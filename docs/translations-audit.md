# Translations Audit — Pagina pubblica CataloGlobe

> Documento di discovery preparatorio alla feature multi-lingua per la pagina pubblica `/:slug`.
> NON è un piano di implementazione: è una mappa fattuale di cosa esiste oggi e dove andranno toccati i file.
> Tutte le citazioni sono ai path assoluti del repo `CataloGlobe/`.
> Data: 2026-04-29 — branch `staging`.

---

## Sommario sezioni

1. Inventario entità da tradurre
2. Mappa rendering pagina pubblica (stringhe customer-facing)
3. Audit `resolve-public-catalog`
4. Audit hash invalidation (write paths che richiederebbero re-traduzione)
5. UI strings hardcoded
6. LanguageSelector — stato attuale
7. Dashboard — dove mettere indicatori traduzioni
8. Audit RLS e sicurezza
9. Allergeni e ingredienti — trattamento speciale
10. Schema entità relazione visiva
11. Problemi scoperti e raccomandazioni
12. Aperti da decidere

---

## Sezione 1 — Inventario entità da tradurre

Principio guida applicato:
- **TRADURRE** = il cliente legge per CAPIRE (descrizioni, sottotitoli, label allergene, CTA, etichette generiche)
- **NON TRADURRE** = il cliente lo usa per COMUNICARE con lo staff (nome prodotto/sede/variante) o è identificatore (slug, indirizzo, telefono)
- **AMBIGUO** = dipende dal contenuto/contesto (titoli featured, nomi categorie custom, nomi opzioni custom)

### 1.1 `products`

- **DB**: `public.products`. Migration: `supabase/migrations/20260223152000_v2_products.sql` (rinominata via `20260317120000_rename_v2_tables.sql`). Colonna `image_url` aggiunta in `20260302100000_v2_products_image_url.sql`.
- **TS type**: `V2Product` in `src/services/supabase/products.ts:10-24`.
- **Service**: `src/services/supabase/products.ts` (CRUD: `listBaseProductsWithVariants`, `getProduct`, `createProduct`, `updateProduct`, `deleteProduct`, `duplicateProduct`).
- **Campi testuali**:
  - `name TEXT NOT NULL` — nome prodotto
  - `description TEXT NULL` — descrizione prodotto
- **Visibilità pubblica**:
  - `name`: shown su card list, card grid, ItemDetail header, SearchOverlay results, FeaturedPreviewModal product list, SelectionSheet line items.
  - `description`: ItemDetail body, SearchOverlay match.
- **Visibilità dashboard**: ProductForm, products list, FeaturedPreviewModal preview.
- **Classificazione**:
  - `name` → **NON TRADURRE**. Usato per ordinare con lo staff ("una Margherita"). Deve restare identico tra lingue.
  - `description` → **TRADURRE**. È esposizione/marketing.
- **Relazioni**: tramite `parent_product_id` un prodotto è "variante" di un altro (vedi 1.10). I campi `name`/`description` esistono anche sulle varianti.
- **Edge cases**: `description` può essere `NULL`. I `parent_product_id` sono nullable; quando NULL = base product, altrimenti = variante.

### 1.2 `featured_contents`

- **DB**: `public.featured_contents`. Migration creazione: `supabase/migrations/20260224140000_v2_featured_contents.sql`. Update: `20260226105800_v2_featured_contents_update.sql`. `content_type` aggiunto in `20260419130000_featured_contents_add_content_type.sql`.
- **TS type**: `FeaturedContent` in `src/services/supabase/featuredContents.ts:7-25`.
- **Service**: `src/services/supabase/featuredContents.ts`.
- **Campi testuali**:
  - `internal_name TEXT NOT NULL` — etichetta amministrativa (mai mostrata in pubblico)
  - `title TEXT NOT NULL` — titolo principale
  - `subtitle TEXT NULL`
  - `description TEXT NULL`
  - `cta_text TEXT NULL` — testo del bottone CTA
  - `cta_url TEXT NULL` — URL del bottone (NOT translatable, è un link)
- **Visibilità pubblica**:
  - `title`, `subtitle`, `description`, `cta_text`: FeaturedBlock (carousel) + FeaturedPreviewModal + EventsView/FeaturedCard.
  - `internal_name`: mai pubblico.
  - `cta_url`: mai mostrato come testo, usato come `href`.
- **Visibilità dashboard**: `FeaturedIdentityForm` (`src/pages/Dashboard/Highlights/components/FeaturedIdentityForm.tsx`), `FeaturedCtaForm`.
- **Classificazione**:
  - `internal_name` → **NON TRADURRE** (interno admin).
  - `title`, `subtitle`, `description`, `cta_text` → **TRADURRE**.
  - `cta_url` → **NON TRADURRE** (è URL).
- **Relazioni**: figli `featured_content_products` (vedi 1.11).
- **Edge cases**: `subtitle`, `description`, `cta_text`, `cta_url` nullable. Lo stato `status="draft"` esclude dal pubblico.

### 1.3 `featured_content_products`

- **DB**: `public.featured_content_products`. Stessa migration di `featured_contents`.
- **TS type**: `FeaturedContentProduct` in `src/services/supabase/featuredContents.ts:27-35`.
- **Campi testuali**:
  - `note TEXT NULL` — nota inline associata al singolo prodotto dentro un featured (es. "novità", "consigliato dallo chef")
- **Visibilità pubblica**: shown in FeaturedPreviewModal accanto a ogni prodotto del bundle/promo.
- **Visibilità dashboard**: campo editabile in FeaturedContentDetailPage.
- **Classificazione**: `note` → **TRADURRE** (è marketing customer-facing).
- **Relazioni**: M:N tra `featured_contents` e `products`.

### 1.4 `catalog_categories`

- **DB**: `public.catalog_categories`. Migration: `supabase/migrations/20260225121000_v2_catalog_engine.sql` (rinominata).
- **TS type**: `V2CatalogCategory` in `src/services/supabase/catalogs.ts:13-22`.
- **Service**: `src/services/supabase/catalogs.ts`.
- **Campi testuali**:
  - `name TEXT NOT NULL`
- **Visibilità pubblica**: nav sezioni (CollectionSectionNav, hub `menu`), header sezione catalogo, PublicCatalogTree.
- **Visibilità dashboard**: CatalogEngine page.
- **Classificazione**: `name` → **AMBIGUO**. Categorie come "Antipasti", "Primi", "Vini bianchi" hanno traducibili universali (Starters, First courses, White wines); categorie creative come "I piatti della Nonna" sono brand-specific. Decisione UX necessaria — vedi sezione 12.
- **Relazioni**: self-ref `parent_category_id` (max 3 livelli, CHECK level IN (1,2,3)).
- **Edge cases**: nessuna; sempre NOT NULL.

### 1.5 `allergens` (sistema, cross-tenant)

- **DB**: `public.allergens`. Migration: `supabase/migrations/20260225115200_v2_allergens.sql`. **NON ha `tenant_id`**: è tabella di sistema con i 14 allergeni UE seedati alla migration.
- **TS type**: `V2SystemAllergen` in `src/services/supabase/allergens.ts:3-9`.
- **Service**: `src/services/supabase/allergens.ts`.
- **Campi testuali**:
  - `code TEXT NOT NULL UNIQUE` — slug identificativo (`gluten`, `crustaceans`, ...)
  - `label_it TEXT NOT NULL` — già IT seedato in migration
  - `label_en TEXT NOT NULL` — già EN seedato in migration
- **Visibilità pubblica**: badge allergeni in ItemDetail. Solo `label_it` viene attualmente passata al frontend (`ResolvedProductAllergen` in `src/services/supabase/allergens.ts:42-46`, e mappato in `resolveActivityCatalogs.ts`).
- **Visibilità dashboard**: ProductForm tab "Allergeni".
- **Classificazione**:
  - `code` → **NON TRADURRE** (identificatore tecnico).
  - `label_it`/`label_en` → **TRADURRE**, ma sono **già presenti**: il dato esiste a DB, è solo da esporre/usare.
- **Edge cases**: tabella read-only via RLS `USING (true)` per chiunque (anche anonimi). Non esiste `label_fr`/`label_de` → manca per espansione futura.

### 1.6 `ingredients` (per-tenant)

- **DB**: `public.ingredients`. Migration: `supabase/migrations/20260225214842_v2_ingredients.sql`. Indice unique su `(tenant_id, lower(name))`.
- **TS type**: `V2Ingredient` in `src/services/supabase/ingredients.ts:3-8`.
- **Service**: `src/services/supabase/ingredients.ts`.
- **Campi testuali**:
  - `name TEXT NOT NULL` — es. "Mozzarella", "Pomodoro San Marzano"
- **Visibilità pubblica**: ItemDetail sezione Ingredienti (lista comma-separated).
- **Visibilità dashboard**: ProductForm tab "Ingredienti", `Dashboard/Products/Ingredients/`.
- **Classificazione**: `name` → **AMBIGUO**. Un ingrediente generico ("zucchero" → "sugar") va tradotto; un ingrediente di brand ("Stracciatella di Andria DOP") no.
- **Relazioni**: M:N via `product_ingredients`.

### 1.7 `product_option_groups`

- **DB**: `public.product_option_groups`. Migration: `supabase/migrations/20260225220320_v2_product_options.sql`.
- **TS type**: `V2ProductOptionGroup` in `src/services/supabase/productOptions.ts:7-17`.
- **Service**: `src/services/supabase/productOptions.ts`.
- **Campi testuali**:
  - `name TEXT NOT NULL` — es. "Formati", "Topping", "Cottura"
- **Visibilità pubblica**: ItemDetail (raggruppa addon/format), SelectionSheet.
- **Visibilità dashboard**: ProductForm sezione opzioni.
- **Classificazione**: `name` → **TRADURRE**. È etichetta generica ("Topping" → "Topping", "Cottura" → "Cooking") customer-facing.
- **Edge cases**: `group_kind` IN (`PRIMARY_PRICE`, `ADDON`). Default name "Formati" hardcoded in italiano se group viene auto-creato (`src/services/supabase/productOptions.ts:` createPrimaryPriceFormat — letterale `"Formati"`).

### 1.8 `product_option_values`

- **DB**: `public.product_option_values`. Stessa migration di 1.7.
- **TS type**: `V2ProductOptionValue` in `src/services/supabase/productOptions.ts:19-27`.
- **Campi testuali**:
  - `name TEXT NOT NULL` — es. "30cm", "Doppia mozzarella", "Bene cotto"
- **Visibilità pubblica**: ItemDetail (formati / addon), SelectionSheet riepilogo.
- **Visibilità dashboard**: ProductForm.
- **Classificazione**: `name` → **AMBIGUO**. Misure ("30cm", "Piccolo/Medio/Grande") quasi sempre traducibili; nomi proprietari ("Speciale Mario", "Tartufo del Bosco") spesso non.

### 1.9 `product_attribute_definitions` + `product_attribute_values`

- **DB**: `public.product_attribute_definitions`. Migration: `supabase/migrations/20260224173200_v2_product_attributes.sql`. Governance: `20260306000000_attribute_governance.sql`. **Importante**: `tenant_id UUID` è **NULLABLE** (attributi piattaforma usano NULL — vedi CLAUDE.md).
- **TS type**: `V2ProductAttributeDefinition`, `V2ProductAttributeValue` in `src/services/supabase/attributes.ts:5-29`.
- **Service**: `src/services/supabase/attributes.ts`.
- **Campi testuali (definitions)**:
  - `code TEXT NOT NULL` — slug interno (`vegetariano`, `piccante`)
  - `label TEXT NOT NULL` — etichetta UI (es. "Vegetariano")
  - `options JSON NULL` — per type `select`/`multi_select`: array di opzioni con label
- **Campi testuali (values)**:
  - `value_text TEXT NULL`
  - `value_json JSONB NULL` — può contenere stringhe per multi_select
- **Visibilità pubblica**: ItemDetail sezione attributi (loop `displayItem.attributes` mostra `<strong>{a.label}:</strong> {a.value}`). Solo per attributi con `show_in_public_channels = true`.
- **Visibilità dashboard**: ProductForm (per ogni attribute dispone di edit), pagina Attributes.
- **Classificazione**:
  - `code` → **NON TRADURRE**.
  - `label` → **TRADURRE**.
  - `options` (json) → **TRADURRE** (le option label, non i value-id).
  - `value_text` → **TRADURRE** (è testo libero che descrive il prodotto).
  - `value_json` (multi_select) → **TRADURRE** (le label scelte) — ma potrebbe essere un riferimento by code.
- **Relazioni**: definitions condivise tra tenant (NULL tenant) o per-tenant. Values legate al singolo product+definition.
- **Edge cases**: i platform attributes (tenant_id IS NULL) hanno `vertical` e potrebbero esserci 1 sola riga condivisa tra tutti i tenant — la traduzione di un platform attribute impatta tutti.

### 1.10 `product_variants` — _NOTA_

Nel database **NON esiste** una tabella `product_variants` separata. Le varianti sono prodotti con `parent_product_id IS NOT NULL` (riusano la stessa tabella `products`, vedi 1.1). Il file `src/services/supabase/productVariants.ts` esiste ma gestisce dimensioni varianti (`product_variant_dimensions`, `product_variant_dimension_values`, `product_variant_assignments`), che sono separate.

- **DB**: `public.product_variant_dimensions`, `public.product_variant_dimension_values`, `public.product_variant_assignments`. Migration: `supabase/migrations/20260328100000_product_variant_matrix.sql` + `20260328200000_public_read_variant_dimensions.sql`.
- **Campi testuali (dimensions)**: `name TEXT` (es. "Taglia", "Colore").
- **Campi testuali (dimension_values)**: `label TEXT` (es. "S/M/L/XL", "Rosso").
- **Visibilità pubblica**: nei dropdown selezione variante in ItemDetail, esposti via `ResolvedVariantDimValue` (`src/types/resolvedCollections.ts:1-9`).
- **Classificazione**:
  - dimension `name` → **TRADURRE** ("Taglia" → "Size", "Colore" → "Color").
  - dimension_value `label` → **AMBIGUO** ("Rosso" → "Red" sì; nomi creativi tipo "Vermiglio Pompei" no).

### 1.11 `activities` (sede)

- **DB**: `public.activities`. Multi-migration. Address strutturato in `20260416130000_activities_address_structured.sql`. Fees in `20260428110000_activities_fees.sql`. Province in `20260417130000_activities_add_province.sql`.
- **TS type**: `V2Activity` in `src/types/activity.ts:1-30`.
- **Service**: `src/services/supabase/activities.ts`.
- **Campi testuali (esposti pubblicamente)**:
  - `name TEXT NOT NULL` — nome sede
  - `slug TEXT UNIQUE` — URL-safe identifier
  - `address`, `street_number`, `postal_code`, `city`, `province` TEXT NULL — indirizzo strutturato
  - `description TEXT NULL` — descrizione lunga
  - `phone`, `email_public`, `website`, `instagram`, `facebook`, `whatsapp` TEXT NULL — handle/contatti
  - `payment_methods TEXT[]` (array di codici tipo `cash`, `card`)
  - `services TEXT[]` (array di codici tipo `wifi`, `outdoor`)
  - `fees JSONB NULL` — array `{key, value}` con keys enum (vedi `src/constants/activityFees.ts`)
- **Visibilità pubblica**:
  - `name`, `address` (composto): PublicCollectionHeader, PublicFooter, InfoSheet.
  - `description`: PublicCollectionHeader (sotto-titolo).
  - `phone`/etc: PublicFooter social row, InfoSheet contatti.
  - `payment_methods`/`services`/`fees`: InfoSheet (PublicSheet "Informazioni").
- **Visibilità dashboard**: `ActivityIdentityForm`, `ContactsMainForm`, tabs varie.
- **Classificazione**:
  - `name` → **NON TRADURRE**.
  - `slug` → **NON TRADURRE** (identifier).
  - `address`, `street_number`, `postal_code`, `city`, `province` → **NON TRADURRE** (es. città italiane non si traducono — "Milano" resta "Milano" anche in EN; eccezione: "Florence/Firenze", caso minore. Indirizzo è dato fisico).
  - `description` → **TRADURRE**.
  - `phone`/`email_public`/`website`/social → **NON TRADURRE** (identificatori).
  - `payment_methods`/`services` → **TRADURRE le label che mostriamo** ma le label NON vivono nel DB: sono mappate da codice → label IT in qualche dizionario lato client (DA VERIFICARE — vedi sezione 12).
  - `fees` JSONB: la `key` è un enum hardcoded (`coperto`, `servizio`, ...) → label fisse in `src/constants/activityFees.ts`. **TRADURRE le label**. Il `value` è numero/stringa scritta dal cliente → da analizzare.

### 1.12 `tenants` (logo/branding)

- **DB**: `public.tenants`. Multi-migration cumulativa. Logo: `20260324120000_tenant_logo_url.sql`.
- **TS type**: `V2Tenant` in `src/types/tenant.ts:5-18`.
- **Service**: `src/services/supabase/tenants.ts`. RPC pubblica `get_tenant_public_info(p_tenant_id)` definita in `20260413120000_subscription_transfer_and_public_info.sql`.
- **Campi testuali pubblici**:
  - `name TEXT NOT NULL` — nome azienda/brand
  - `logo_url TEXT NULL` — path storage (NOT translatable)
  - `vertical_type` enum
- **Visibilità pubblica**: PublicCollectionHeader (logo, eventualmente nome catalogo).
- **Classificazione**:
  - `name` → **NON TRADURRE** (brand).
  - `logo_url` → **NON TRADURRE**.
  - `vertical_type` → **TRADURRE le label**, ma le label vivono in `src/constants/verticalTypes.ts` (DA VERIFICARE).

---

## Sezione 2 — Mappa rendering pagina pubblica

Tabella delle stringhe customer-facing. Source: lettura dei file dei componenti `src/components/PublicCollectionView/*` e `src/pages/PublicCollectionPage/PublicCollectionPage.tsx`.

| Componente | Stringa | Source | Field | Visibile quando | Note |
|---|---|---|---|---|---|
| `PublicCollectionHeader` | "Menu" | hardcoded TS | `HUB_TABS[0].label` | sempre | tab hub menu (`src/components/PublicCollectionView/PublicCollectionHeader/PublicCollectionHeader.tsx:8`) |
| `PublicCollectionHeader` | "Eventi & Promo" | hardcoded TS | `HUB_TABS[1].label` | sempre | tab hub events |
| `PublicCollectionHeader` | "Dicci la tua" | hardcoded TS | `HUB_TABS[2].label` | sempre | tab hub reviews |
| `PublicCollectionHeader` | "Informazioni sede" | hardcoded TS | `aria-label` | sempre | accessibility label info button (linea 256) |
| `PublicCollectionHeader` | "Cerca nel catalogo" | hardcoded TS | `aria-label` | sempre | accessibility label search button (linea 267) |
| `PublicCollectionHeader` | activity name | DB | `activities.name` | sempre | NON TRADURRE |
| `PublicCollectionHeader` | activity address | DB | composti `address+street_number+postal_code+city+province` | conditional `showActivityAddress` | NON TRADURRE |
| `PublicCollectionHeader` | catalog name | DB | `catalogs.name` | conditional `showCatalogName` | AMBIGUO |
| `LanguageSelector` | "Italiano" / "English" / "Français" / "Deutsch" | hardcoded TS | LANGUAGES array | sempre | endonimi (mostra ogni lingua nel suo nome) — `src/components/PublicCollectionView/LanguageSelector/LanguageSelector.tsx:14-19` |
| `LanguageSelector` | "Lingue disponibili" | hardcoded TS | aria-label dropdown | sempre | da i18n |
| `LanguageSelector` | "Presto" o flag disabled | DA VERIFICARE | — | per lingue `enabled: false` | placeholder per EN/FR/DE |
| `CollectionView` | "Aggiungi alla selezione" | hardcoded TS | `aria-label` x3 | always (cards) | linee 255, 336, 406 |
| `CollectionView` | "Promo" | hardcoded TS | badge | quando `effective_price < price` | `<span className={styles.promoBadge}>Promo</span>` linea 270 |
| `CollectionView` | "Aggiorna selezione" | hardcoded TS | `submitLabel` ItemDetail | edit mode | linea 1677 |
| `CollectionView` | "Com'è andata?" | hardcoded TS | aria-label + label | FAB review (mode public + tab menu) | linee 1785, 1787 |
| `CollectionView` | "Salta al contenuto" | hardcoded TS | skip link | mode public | inizio render |
| `CollectionView InfoSheet` | "Informazioni" | hardcoded TS | `<h2>` titolo modale | quando hasAnyInfo | |
| `CollectionView InfoSheet` | "Informazioni sede" | hardcoded TS | aria-label PublicSheet | | |
| `CollectionView InfoSheet` | "Orari di apertura" | hardcoded TS | `<h3>` section header | quando hasHours | |
| `CollectionView InfoSheet` | "Tariffe" | hardcoded TS | `<h3>` section header | quando hasFees | |
| `CollectionView InfoSheet` | "Metodi di pagamento", "Servizi", "Contatti", "Indirizzo" | hardcoded TS | sezioni varie | conditional | DA VERIFICARE etichette esatte (campionato — non lette tutte) |
| `CollectionView` empty | "Nessun prodotto disponibile al momento" | hardcoded TS | `emptyState.title` | quando sectionGroups vuoto | `PublicCollectionPage.tsx` |
| `ProductCard` (in CollectionView) | product `name` | DB | `products.name` | sempre | NON TRADURRE |
| `ProductCard` | product `description` | DB | `products.description` | conditional | TRADURRE |
| `ProductCard` | "da €X.XX" | hardcoded prefix | format | quando `from_price != null` | `da` italiano hardcoded — vedi `SearchOverlay.tsx:1` (uso dell'helper) |
| `ItemDetail` | product name, description | DB | `products.name`, `description` | sempre | name=NON; desc=TRADURRE |
| `ItemDetail` | "Allergeni" | hardcoded TS | section header | quando allergens.length > 0 | `src/components/PublicCollectionView/ItemDetail/ItemDetail.tsx:` (linee allergeni) |
| `ItemDetail` | allergen labels | DB | `allergens.label_it` | sempre se presenti | TRADURRE — già esiste `label_en` |
| `ItemDetail` | "Ingredienti" | hardcoded TS | section header | quando ingredients.length > 0 | |
| `ItemDetail` | ingredient names | DB | `ingredients.name` | sempre se presenti | AMBIGUO |
| `ItemDetail` | attribute label/value | DB | `product_attribute_definitions.label`, `product_attribute_values.value_text` | quando show_in_public_channels | TRADURRE |
| `ItemDetail` | option group name (`Formati`, `Topping`) | DB | `product_option_groups.name` | quando hasOptions | TRADURRE |
| `ItemDetail` | option value name (`30cm`, etc) | DB | `product_option_values.name` | sempre se presenti | AMBIGUO |
| `ItemDetail` | "Aggiungi alla selezione" | hardcoded TS | `submitLabel` default | mode public | TRADURRE |
| `ItemDetail` | "Aggiorna selezione" | hardcoded TS | `submitLabel` edit | edit mode | TRADURRE |
| `SelectionSheet` | "Nessun elemento" | hardcoded TS | empty state | quando lista vuota | |
| `SelectionSheet` | "Aggiungi prodotti dal menu" | hardcoded TS | empty state subtitle | | |
| `SelectionSheet` | "Totale stimato" | hardcoded TS | footer label | quando non vuoto | |
| `SearchOverlay` | "da €X.XX" | hardcoded TS | format function | sempre (price formatter) | TRADURRE prefix `da` |
| `SearchOverlay` | placeholder input, no-results | DA VERIFICARE | — | conditional | non letti tutti i sub-strings |
| `FeaturedBlock` (carousel cards) | featured.title | DB | `featured_contents.title` | sempre | TRADURRE |
| `FeaturedBlock` | featured.cta_text | DB | `featured_contents.cta_text` | quando entrambi cta_text + cta_url | TRADURRE |
| `FeaturedPreviewModal` | featured.title, .subtitle, .description, .cta_text | DB | featured_contents.* | quando aperto | TRADURRE |
| `FeaturedPreviewModal` | featured_content_products.note | DB | `featured_content_products.note` | per product item nella lista | TRADURRE |
| `EventsView` | "Nessun evento o promozione attiva al momento." | hardcoded TS | empty state | quando featuredContents vuoto | `src/components/PublicCollectionView/EventsView/EventsView.tsx` |
| `EventsView` | aria-label "Eventi e promozioni" | hardcoded TS | role list | | |
| `ReviewsView` | "Pessima", "Scarsa", "Nella media", "Buona", "Eccellente!" | hardcoded TS | RATING_CONFIG | rating tap/hover | `src/components/PublicCollectionView/ReviewsView/ReviewsView.tsx` |
| `ReviewsView` | "Hai già lasciato una recensione di recente. Riprova più tardi." | hardcoded edge function | submit-review error | quando duplicate session | `submit-review/index.ts` |
| `ReviewsView` | submit error texts vari | hardcoded TS | various | submit failures | DA VERIFICARE — sample minimo letto |
| `PublicFooter` | "Telefono", "Email", "Sito web", "Instagram", "Facebook", "WhatsApp" | hardcoded TS | aria-label social row | conditional pubblici | linee in `PublicFooter.tsx` |
| `PublicOpeningHours` | "Lunedì"..."Domenica" | hardcoded TS | DAY_NAMES | sempre | locale-dependent |
| `PublicOpeningHours` | "Prossime chiusure" | hardcoded TS | section heading | quando upcomingClosures > 0 | |
| `PublicOpeningHours` | "Chiuso" | hardcoded TS | status flag | quando is_closed | |
| `PublicOpeningHours` | label closure (es. "Pasqua") | DB | `activity_closures.label` | conditional | TRADURRE? |
| `PublicFees` (footer) + `PublicFeeRows` (info sheet) | fee key labels ("Coperto", "Servizio", ...) | hardcoded TS | `FEE_DEFINITIONS` | sempre se hasFees | `src/constants/activityFees.ts` |
| `PublicFees` | fee value | DB | `activities.fees[].value` | sempre | numero/testo libero — DA VERIFICARE se contiene unità |
| Page state `loading` | "Stiamo caricando il catalogo" | hardcoded TS | AppLoader message | mentre carica | `PublicCollectionPage.tsx` (variant 1) — anche `<AppLoader intent="public" />` (variant 2) |
| Page state `error` | "Link non valido." | hardcoded TS | error message | slug missing | |
| Page state `inactive` (NotFound) | testi vari | NotFound component | `NotFound variant="business-inactive"` | status=inactive | DA VERIFICARE i testi dentro NotFound |
| Page state `subscription_inactive` (NotFound) | testi | `NotFound variant="subscription-inactive"` | quando tenant suspended/canceled | DA VERIFICARE |
| Page state `empty` (NotFound) | testi | `NotFound variant="business-empty"` | quando no catalog & no featured | DA VERIFICARE |

**Componenti dichiarati nello scope ma NON ispezionati riga-per-riga** (campionati): `PublicCatalogTree`, `CollectionSectionNav`, `FeaturedCard`, `PublicProductCard` (segnalato come dead code in CLAUDE.md), `PublicBrandHeader`, `CollectionHero` (rimossi/sostituiti da PublicCollectionHeader). Per completezza, andranno ispezionati nel grep finale di sezione 5.

---

## Sezione 3 — Audit `resolve-public-catalog`

### 3.1 Input/Output JSON shape

Source: `supabase/functions/resolve-public-catalog/index.ts`.

**Input (POST body)**:
```ts
{ slug: string, simulate?: string /* ISO date */ }
```

**Output success**:
```ts
{
  business: {
    id, tenant_id, name, slug, cover_image, status, inactive_reason,
    address, street_number, postal_code, city, province,
    instagram, instagram_public, facebook, facebook_public,
    whatsapp, whatsapp_public, website, website_public,
    phone, phone_public, email_public, email_public_visible,
    google_review_url, hours_public,
    payment_methods, payment_methods_public,
    services, services_public,
    fees, fees_public
  },
  tenantLogoUrl: string | null,
  resolved: ResolvedCollections,        // vedi src/types/resolvedCollections.ts
  canonical_slug: string | null,        // se isAliasMatch
  opening_hours?: OpeningHoursEntry[],  // solo se hours_public
  upcoming_closures?: UpcomingClosure[] // solo se hours_public
}
```

**Output `subscription_inactive`**:
```ts
{
  business: {...},
  subscription_inactive: true,
  tenantLogoUrl: null,
  resolved: { featured: { hero: [], before_catalog: [], after_catalog: [] } },
  canonical_slug: ...
}
```

> Nota: il payload include ancora `featured.hero: []` per compat anche se la migration `20260414190000_remove_hero_slot.sql` ha rimosso il valore dal CHECK constraint.

### 3.2 Entità ritornate + campi

`ACTIVITY_SELECT` (linea ~58) include 32 colonne; **NON include** `description` di `activities` né `name`/`logo_url` del tenant (questi vengono via `get_tenant_public_info`).

**DA VERIFICARE**: `activities.description` non è in `ACTIVITY_SELECT` → la pagina pubblica oggi NON mostra la description della sede? Verificare se è un bug noto o un design choice.

`resolved` viene composto da `resolveActivityCatalogs(supabase, activity.id, simulatedAt, activity.tenant_id)` (`supabase/functions/_shared/resolveActivityCatalogs.ts`). Lo shape è quello tipato in `src/types/resolvedCollections.ts`.

`featured_contents` arrivano via RPC `get_schedule_featured_contents(p_schedule_id, p_tenant_id)` (definita in `20260417120000_get_schedule_featured_contents_tenant_guard.sql`) e portano: `slot`, `sort_order`, `featured_content` (oggetto completo) + `products` con `note`.

### 3.3 Filtering logic

- **Status**: filtra `status = 'active'`. `subscription_status IN ('canceled', 'suspended')` → ritorna `subscription_inactive: true`.
- **Scheduling**: tutto risolto via `resolveRulesForActivity` (`supabase/functions/_shared/scheduleResolver.ts` — sincronizzato con `src/services/supabase/scheduleResolver.ts`). Tipi: catalog (1 vincente), featured (1 vincente), price overrides, visibility overrides.
- **Visibility**: prodotti con visibility override "hide" sono esclusi; "disable" li mantiene ma con `is_disabled=true`.

### 3.4 Performance

- 1 query primaria su `activities` (con possibile fallback su `activity_slug_aliases`).
- 4 query parallele (Promise.all): `resolveActivityCatalogs` + `get_tenant_public_info` RPC + `activity_hours` + `activity_closures`.
- Dentro `resolveActivityCatalogs`:
  - 1 RPC scheduling (multipla)
  - 1 query `catalogs` con select gigante (catalog_categories → catalog_category_products → products → option_groups → option_values → variants...) — **single query JOIN nesting profondo**
  - N query per allergeni/ingredienti/attributes (lookup batch per productIds)
  - N query per visibility/price overrides
  - 1 RPC `get_schedule_featured_contents` se featured rule presente
- **Cache HTTP**: `Cache-Control: public, max-age=0, s-maxage=30, stale-while-revalidate=300` (no-store per simulate).

### 3.5 Insertion points per traduzioni

Posizioni naturali dove iniettare un JOIN/RPC per traduzioni:

1. **Sub-select su products** dentro `CATALOG_SELECT` di `resolveActivityCatalogs.ts` — ma Supabase JS REST non supporta JOIN condizionali. Soluzione realistica: una RPC SECURITY DEFINER `get_translations_for_entities(entity_type, entity_ids, lang)` invocata in parallelo.
2. **Lookup batch dopo costruzione catalogo**: dopo che ho l'array di productIds/categoryIds/featuredIds, faccio una sola query `translations WHERE entity_type IN (...) AND entity_id IN (...) AND lang = ?`.
3. **Mapping in `normalizeCatalog`**: applicare i text override dopo il normalize.
4. **Allergens**: gia' separato — aggiungere fetch della label per la lingua richiesta dal lookup `allergens` (label_en esiste già; label_fr/de no).
5. **Tenant info**: aggiungere optional `description_translations` JSONB su `tenants` o usare la tabella unificata.

### 3.6 Rischi

- **Shape rigida**: il client si aspetta `business.description` *non* presente, e tutta la struttura ResolvedCollections è tipata strict in `src/types/resolvedCollections.ts`. Aggiungere campi è safe (additive); cambiarli rompe.
- **Client-side parsing**: `mapCatalogToSectionGroups` (richiamato in `PublicCollectionPage.tsx`) parsa una struttura specifica. Iniettare `name_translated` deve essere sempre un campo opzionale.
- **Edge function shared**: `resolveActivityCatalogs.ts` esiste in 2 copie (note CLAUDE.md). Ogni cambio va sincronizzato in `src/services/supabase/resolveActivityCatalogs.ts` E in `supabase/functions/_shared/resolveActivityCatalogs.ts`.
- **Cache HTTP per lingua**: l'attuale `s-maxage=30` non è lang-aware. Se aggiungi `?lang=en` come query string serve includere `Vary: Accept-Language` o trasformare lang in path component. Altrimenti CDN servirebbe IT a tutti.
- **simulate**: deve continuare a essere `no-store` indipendentemente dalla lingua.

---

## Sezione 4 — Audit hash invalidation

> Per "hash invalidation" intendo: in una feature di traduzione async (es. job che traduce description e salva), un `hash` di campo sorgente serve per invalidare le cache di traduzione quando il source cambia.

### 4.1 `products`

- **Write paths esistenti** (`src/services/supabase/products.ts`):
  - `createProduct(tenantId, data, parentId?)` → INSERT esplicito di tutti i campi.
  - `updateProduct(id, tenantId, data, parentId?)` → costruisce `updatePayload` solo con i campi `!== undefined`. **Pattern partial update**.
  - `deleteProduct(id, tenantId)` → CASCADE.
  - `duplicateProduct(productId, tenantId)` → cascade delle write su attributes/allergens/options/ingredients.
- **Update pattern**: partial. La detection di "description changed" deve confrontare value vecchio e nuovo (lato edge) o creare un trigger DB.
- **Bulk operations**: nessuna, ma `menu-ai-import` (Edge Function) può creare N prodotti in serie. Una migrazione massiccia dovrebbe non scatenare N job di traduzione: serve coalescing o flag "skip translations".
- **DB triggers esistenti rilevanti**: `recomputeProductType` in `products.ts:186` (solo lato application, non DB). Nessun trigger DB sul testo.
- **Edge case nullable**: `description: null → text → null` può accadere. Se l'hash è `sha256(description ?? '')` due update da null a null darebbero stesso hash → no re-fetch (corretto).

### 4.2 `featured_contents`

- **Write paths** (`featuredContents.ts`):
  - `createFeaturedContent(tenantId, contentData, productsData)` → INSERT spread + INSERT N products.
  - `updateFeaturedContent(id, tenantId, contentData, productsData?)` → UPDATE spread (TUTTI i campi passati). **Se `productsData !== undefined`** fa **delete+reinsert** dei children → ogni save fa fan-out completo. ⚠️ **Problema**: ogni update di un featured può invalidare TUTTI i `note` dei products anche se non cambiati.
  - `syncFeaturedContentProducts(featuredId, tenantId, toRemoveIds, toAddItems)` → delta-based, più sicuro.
- **Update pattern**: spread completo (`update(contentData)` passa il contentData intero) → ogni save tocca tutte le colonne anche non modificate, anche se valori invariati. ⚠️ **Hash su update value-equality** raccomandato, non timestamp.
- **Bulk**: nessuna.
- **Triggers**: nessuno noto.

### 4.3 `catalog_categories`

- `updateCategory(categoryId, tenantId, updates)` → UPDATE partial.
- `reparentCategory()` → solo metadata.
- `updateDescendantLevels()` → bulk update per `level` (no name change).
- Pattern OK per hash su `name`.

### 4.4 `ingredients`

- `updateIngredient(id, tenantId, {name})` → solo `name`. Trim. Unique on `(tenant_id, lower(name))` → caso "update solo capitalizzazione" non triggera unique error ma cambia il displayed text.
- Edge: `name.trim()` viene chiamato → un cambio di whitespace solo cambia il valore ma è semanticamente uguale. Hash deve normalizzare (lowercase + trim).

### 4.5 `product_option_groups` / `product_option_values`

- `updateProductOptionGroup(id, {name?})` → UPDATE partial.
- `updateOptionValue(id, {name?})` → UPDATE partial.
- Niente trigger.

### 4.6 `activities`

- DA VERIFICARE: `updateActivity()` esiste ma non l'ho letto integralmente. Se è `UPDATE { ...partial }` come da pattern, ok.
- Auto-trigger per `slug_aliases` quando slug cambia (`activitySlugAliases.ts`) — ma slug non è da tradurre.

### 4.7 `tenants`

- `updateTenantName(tenantId, name)` → UPDATE name only.

### 4.8 Considerazioni generali sul hashing

- **Su DB vs application**: un hash calcolato lato DB (trigger BEFORE UPDATE) è più robusto contro perdite (es. update via Supabase Studio bypassa il service layer). Application-side hashing rischia desync.
- **Coalescing per AI batch**: `menu-ai-import` può creare 50 prodotti in 1 sessione. Spawn 50 traduzioni × N lingue scatena un thundering herd. Necessario un meccanismo di queue (es. `pg_cron` job che processa in batch da una coda) o flag "deferred".
- **Update audit**: nessun "audit_events" per campo (esiste `audit_events` per altri scopi → `20260429130000_rename_v2_audit_events_and_v2_notifications.sql`).

---

## Sezione 5 — UI strings hardcoded da migrare a i18n

Tabella ordinata per componente, IT-only (oggi). Aggregata da grep + lettura. Lista campionata sui file più importanti — non esaustiva al 100%.

| Componente | File:linea (approx) | Stringa | Categoria | Note |
|---|---|---|---|---|
| `PublicCollectionHeader` | `PublicCollectionHeader/PublicCollectionHeader.tsx:8` | "Menu" | navigation | tab label |
| `PublicCollectionHeader` | `:9` | "Eventi & Promo" | navigation | |
| `PublicCollectionHeader` | `:10` | "Dicci la tua" | navigation | reviews tab |
| `PublicCollectionHeader` | `:256` | "Informazioni sede" | a11y | aria-label |
| `PublicCollectionHeader` | `:267` | "Cerca nel catalogo" | a11y | aria-label |
| `LanguageSelector` | `LanguageSelector/LanguageSelector.tsx:14-19` | "Italiano", "English", "Français", "Deutsch" | navigation | endonimi (rimangono nel proprio idioma) |
| `LanguageSelector` | `:` | "Lingue disponibili" | a11y | aria-label dropdown |
| `CollectionView` | `CollectionView/CollectionView.tsx:255` | "Aggiungi alla selezione" | product | a11y card add |
| `CollectionView` | `:270` | "Promo" | product | badge |
| `CollectionView` | `:336`, `:406` | "Aggiungi alla selezione" | product | a11y duplicate |
| `CollectionView` | `:1414` | "Informazioni sede" | a11y | aria duplicate |
| `CollectionView` | `:1677` | "Aggiorna selezione" | product | submit edit mode |
| `CollectionView` | `:1785, 1787` | "Com'è andata?" | reviews | FAB |
| `CollectionView` skipLink | inizio | "Salta al contenuto" | a11y | |
| `CollectionView` InfoSheet | `:` | "Informazioni" | navigation | h2 modal |
| `CollectionView` InfoSheet | `:` | "Orari di apertura", "Tariffe", "Metodi di pagamento", "Servizi", "Contatti", "Indirizzo" | navigation | section headers (campionato — DA VERIFICARE testi esatti) |
| `CollectionView` empty | passato come prop a sub | "Nessun prodotto disponibile al momento" | errors | da `PublicCollectionPage.tsx` |
| `ItemDetail` | `ItemDetail/ItemDetail.tsx:` | "Aggiungi alla selezione" | product | submitLabel default |
| `ItemDetail` | `:` | "Allergeni" | product | header |
| `ItemDetail` | `:` | "Ingredienti" | product | header |
| `SelectionSheet` | `SelectionSheet/SelectionSheet.tsx:` | "Nessun elemento" | product | empty |
| `SelectionSheet` | `:` | "Aggiungi prodotti dal menu" | product | empty subtitle |
| `SelectionSheet` | `:` | "Totale stimato" | product | footer |
| `SearchOverlay` | `SearchOverlay/SearchOverlay.tsx:` | "da €X.XX" | product | price formatter prefix |
| `SearchOverlay` | DA VERIFICARE | placeholder, "Nessun risultato", section headers | search | non letti tutti |
| `EventsView` | `EventsView/EventsView.tsx` | "Nessun evento o promozione attiva al momento." | errors | empty state |
| `EventsView` | `:` | "Eventi e promozioni" | a11y | aria-label |
| `ReviewsView` | `ReviewsView/ReviewsView.tsx` | "Pessima", "Scarsa", "Nella media", "Buona", "Eccellente!" | reviews | RATING_CONFIG (5 livelli) |
| `ReviewsView` | DA VERIFICARE | testi error, header "Lascia una recensione", "Inviata", "Grazie", placeholder, ecc. | reviews | sample minimo letto |
| `submit-review` (Edge Function) | `supabase/functions/submit-review/index.ts` | "Metodo non consentito" | errors | 405 |
| `submit-review` | `:` | "Troppe richieste. Riprova più tardi." | errors | rate-limit IP 429 |
| `submit-review` | `:` | "Hai già lasciato una recensione di recente. Riprova più tardi." | errors | rate-limit session 429 |
| `submit-review` | `:` | "Attività non trovata" | errors | 404 |
| `submit-review` | `:` | "Errore durante il salvataggio della recensione" | errors | 500 |
| `PublicFooter` | `PublicFooter/PublicFooter.tsx:` | "Telefono", "Email", "Sito web", "Instagram", "Facebook", "WhatsApp" | navigation | aria-label social |
| `PublicOpeningHours` | `PublicOpeningHours/PublicOpeningHours.tsx:` | "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica" | navigation | DAY_NAMES |
| `PublicOpeningHours` | `:` | "Prossime chiusure" | navigation | section header |
| `PublicOpeningHours` | `:` | "Chiuso" | navigation | status |
| `PublicCollectionPage` | `PublicCollectionPage.tsx:` | "Stiamo caricando il catalogo" | errors | AppLoader message |
| `PublicCollectionPage` | `:` | "Link non valido." | errors | error state |
| `PublicCollectionPage` empty | `:` | "Nessun prodotto disponibile al momento" | errors | empty title (passato a CollectionView) |
| `NotFound` | (DA VERIFICARE — fuori scope diretto ma usato) | testi per variant `business`, `business-inactive`, `subscription-inactive`, `business-empty` | errors | da leggere file `src/pages/NotFound/` |
| `FEE_DEFINITIONS` | `src/constants/activityFees.ts` | "Coperto", "Servizio", "Prenotazione minima", "Spesa minima", "Età minima" | navigation | + unità tipo "€", "€/coperto", "anni" |
| `FeaturedBlock` | `FeaturedBlock/FeaturedBlock.tsx` | (commenti italiani solo, niente UI strings — verificato) | — | |

**Stringhe interpolate / formattate**:
- `da €${item.from_price.toFixed(2)}` (SearchOverlay): `da` è hardcoded prefix italiano.
- Currency `€` hardcoded ovunque (`formatPrice`). Se la lingua cambia la currency dovrebbe? **Probabilmente no** — il prezzo in EUR resta in EUR, ma il symbol `€` può cambiare position (post-fix in IT, pre-fix in EN). Decisione UX necessaria.
- Plurals italiani: "1 prodotto" / "N prodotti". Cercato — DA VERIFICARE; è probabile che esistano in pagine non ispezionate.

---

## Sezione 6 — LanguageSelector — stato attuale

Source: `src/components/PublicCollectionView/LanguageSelector/LanguageSelector.tsx`.

### 6.1 Posizione attuale

Renderizzato dentro `PublicCollectionHeader` (vedi import `import LanguageSelector from "@components/PublicCollectionView/LanguageSelector/LanguageSelector"`). Posizionato sia in modalità hero sia in modalità compact.

### 6.2 Lingue mostrate oggi

```ts
const LANGUAGES = [
  { code: "it", label: "Italiano", flag: "🇮🇹", enabled: true  },
  { code: "en", label: "English",  flag: "🇬🇧", enabled: false },
  { code: "fr", label: "Français", flag: "🇫🇷", enabled: false },
  { code: "de", label: "Deutsch",  flag: "🇩🇪", enabled: false },
];
```

Solo `it` è enabled. Le altre sono visibili ma disabilitate (mostrano un visual hint "presto" — DA VERIFICARE come è renderizzato il flag disabled, non lettura completa).

### 6.3 Switch logic

- `selectedLang` arriva via prop `selectedLangProp` o defaulta a `"it"` interno.
- `onSelectLang(code)` opzionale invocato al click; `handleSelect(code, enabled)` ignora se `enabled === false`.
- **Non c'è propagazione a CollectionView/contesto globale**: il valore selezionato torna al parent via callback, ma `PublicCollectionHeader` non passa nulla giù; `selectedLangProp` non è impostato dal chiamante in `PublicCollectionPage.tsx`. Quindi la selezione **non ha effetti reali** oggi.

### 6.4 Persistenza scelta utente

**Nessuna**. Niente cookie, localStorage, query param. Reload = ritorno a IT.

### 6.5 Cosa serve cambiare

1. Sollevare lo state in `PublicCollectionPage` (state + URL param `?lang=`).
2. Passare `lang` come prop a `PublicCollectionHeader` e propagarla in giu' (CollectionView, ItemDetail, FeaturedBlock).
3. Persistenza: scegliere tra (a) URL param (best per SEO), (b) localStorage `cataloglobe_lang`, (c) cookie (richiede decisione GDPR).
4. Passare `lang` all'Edge Function `resolve-public-catalog` come query param o body.
5. Cambiare `enabled` per le lingue supportate quando i dati di traduzione sono disponibili.
6. Dropdown portal: il portal eredita CSS vars via `getComputedStyle` (linee finali del file). Aggiungendo lingue, attenzione al bound del dropdown.

### 6.6 Rischi

- `PublicCollectionHeader` è **complesso**: usa scroll listener su body con lock-fix iOS Safari, lerp animation, `viewportWidthEl` per device frame in preview. Aggiungere render condizionale lang-aware (es. RTL layout) richiede attenzione al layout — i valori di `MARGIN`, `RADIUS`, animation lerp sono accordati a un layout LTR fisso.
- LanguageSelector usa `createPortal` e legge CSS vars dal trigger via `getComputedStyle`: il portal non eredita il container query → cambi al token di lingua devono essere fatti via prop, non via CSS.

---

## Sezione 7 — Dashboard: dove mettere indicatori traduzioni

### 7.1 Form/Drawer per `products`

- **File**: `src/pages/Dashboard/Products/components/ProductForm.tsx` + `src/pages/Dashboard/Products/ProductCreateEditDrawer.tsx`.
- **Pattern attuale**: drawer + form separato (form usa `formId`, submit collegato via attributo `form` da DrawerLayout footer — pattern documentato in CLAUDE.md).
- **Spazio per indicatori**: il form ha sezioni multiple (identity, pricing, options, attributes, allergens, ingredients). Pattern esistente da riusare: i tab "Allergeni"/"Ingredienti" sono già tab interni → un nuovo tab "Traduzioni" è path naturale.
- **Pattern simili**: nessuno specifico. Però le tab di `ActivityDetailPage` (Identity / Contacts / Hours / Media / Access) sono buon precedente per multi-tab editing.

### 7.2 Form/Drawer per `featured_contents`

- **File**: `FeaturedContentDetailPage.tsx` (page intera, non drawer) + sub-drawers `FeaturedIdentityDrawer/Form`, `FeaturedCtaDrawer/Form`, `FeaturedMediaDrawer`, `FeaturedPricingModeDrawer/Form`.
- **Pattern**: page-card layout con N drawer per editing parziale. Ogni drawer apre un form per un cluster di campi (identity = title/subtitle/description; cta = cta_text/cta_url).
- **Spazio per indicatori**: badge sulla card "identity" o "cta" che indichi traduzioni mancanti per lingua attiva. Esiste già `FeaturedContentCard` per la lista — possibile aggiungere micro-badge.

### 7.3 Form/Drawer per `activities` (sede)

- **File**: `src/pages/Operativita/Attivita/ActivityDetailPage.tsx` + tabs dentro `tabs/`. Identity drawer: `tabs/info/ActivityIdentityDrawer.tsx` + `ActivityIdentityForm.tsx`. Description vive nell'IdentityForm.
- **Pattern**: tab page con N drawer per cluster.
- **Spazio per indicatori**: l'IdentityForm gestisce solo `name`/`address`/`city`/`description`. Un sub-drawer "Description traduzioni" o un tab "Traduzioni" sull'ActivityDetailPage è coerente.

### 7.4 Form per categories, ingredients, options

- **catalog_categories**: editing inline o drawer dentro `Dashboard/Catalogs/CatalogEngine.tsx` (campionato). Pattern: drag-drop tree con edit inline name. Spazio per traduzioni: probabile tooltip o drawer dedicato per category.
- **ingredients**: pagina standalone `Dashboard/Products/Ingredients/`. Lista con editor (DA VERIFICARE pattern preciso).
- **options/values**: dentro ProductForm. Tab "Traduzioni" potrebbe coprire anche queste.

### 7.5 Pattern condiviso da progettare

Componente riusabile suggerito: `<TranslationStatusBadge entityType="product" entityId={id} fields={["description"]} />` che mostra:
- Indicatore "Tradotto in IT/EN/FR/DE" come pallini verdi.
- Pallino arancione se source aggiornato dopo traduzione (hash mismatch).
- Click → drawer "Gestisci traduzioni".

---

## Sezione 8 — Audit RLS e sicurezza

### 8.1 Tabelle pubblicamente accessibili

Source: migrations.

- `allergens` — RLS `USING (true)` → SELECT pubblica per tutti.
- `featured_contents`, `featured_content_products`, `products`, `product_allergens`, `product_ingredients`, `product_attribute_definitions`, `product_attribute_values`, `product_option_groups`, `product_option_values`, `catalog_categories`, `catalog_category_products`, `catalogs`, `styles`, `activities` (subset via Edge), `activity_hours`, `activity_closures`, `product_variant_dimensions`, `product_variant_dimension_values`, `product_variant_assignments` — accessibili indirettamente via `service_role` dell'Edge Function `resolve-public-catalog`.
- `tenants` — RPC pubblica `get_tenant_public_info(p_tenant_id)` ritorna solo `name` + `logo_url` + `subscription_status`.
- `activity_slug_aliases` — letta via service_role nell'Edge Function (lookup pubblico).

### 8.2 Pattern per esporre traduzioni senza rompere RLS

Tre opzioni:

1. **Tabella `translations` con RLS aperta in lettura** (pattern allergens): `tenant_id NOT NULL` + policy SELECT pubblica `USING (true)` ma WHERE filtrato a livello di applicazione/edge function. Rischio: chiunque legge tutte le traduzioni di tutti i tenant.
2. **RPC SECURITY DEFINER** `get_translations_for_entity(entity_type, entity_id, lang)` (pattern get_tenant_public_info). Filtra internamente. Frontend chiama solo via supabase.rpc.
3. **Esposizione solo via Edge Function `resolve-public-catalog`**: lookup batch dentro l'edge function (service_role). RLS della tabella resta strict (`tenant_id = ANY(get_my_tenant_ids())`). Frontend non legge MAI direttamente. **Pattern raccomandato** — coerente con come oggi vengono risolti tutti i contenuti pubblici.

### 8.3 Cross-tenant risk su futura `translations`

Se la tabella unica include translations per `allergens` (cross-tenant) e per `products` (per-tenant), `tenant_id` deve essere nullable:
- `tenant_id NULL` per system entities (allergens platform attributes).
- `tenant_id NOT NULL` per per-tenant entities (products, ingredients, ecc.).

Già esiste un precedente: `product_attribute_definitions.tenant_id` nullable per platform attrs (`20260306000000_attribute_governance.sql`).

Policy RLS proposta:
```sql
USING (tenant_id IS NULL OR tenant_id = ANY(get_my_tenant_ids()))
```
Per write, vietare update di righe con `tenant_id IS NULL` ai non-superadmin.

### 8.4 service_role usage

Edge Functions che già usano `service_role`:
- `resolve-public-catalog` — public catalog resolution.
- `submit-review` — INSERT review pending.
- `delete-tenant`, `delete-account`, `purge-*`, `restore-tenant` — lifecycle.
- `stripe-*` — billing.
- `menu-ai-import` — AI import.

Pattern per `process-translation-jobs`: come `purge-*` (cron + service_role + idempotenza). Coerente.

---

## Sezione 9 — Allergeni e ingredienti — trattamento speciale

### 9.1 `allergens` (cross-tenant, sistema)

- Tabella seedata con 14 righe (`gluten`...`molluscs`).
- Già contiene `label_it` + `label_en`.
- **Implicazioni traduzioni**: la traduzione delle 14 righe è "universale", non per-tenant. È piattaforma.
- **Decisione**: aggiungere colonne `label_fr`, `label_de` direttamente sulla tabella (semplice, immediato), oppure migrare a una tabella `allergen_translations(allergen_id, lang, label)` per estensibilità futura.
- Il dato deve essere caricato da admin centralmente (non dai clienti).
- Costo traduzione: 14 stringhe × N lingue = banale (one-shot manuale).

### 9.2 `ingredients` (per-tenant)

- Tabella per-tenant. Non c'è `is_system` o equivalente.
- Quantità righe stimata: n.d. — varia per tenant. DA VERIFICARE su staging via `count(*) from ingredients` (operazione di lettura accettabile).
- **Implicazioni traduzioni**: la traduzione di "Mozzarella" è per-tenant ma duplicata (tutti i tenant condividono lo stesso ingrediente).
- **Open architectural question** (vedi sezione 12):
  - Opzione A: ingredients restano per-tenant; ogni tenant ha le sue traduzioni.
  - Opzione B: introdurre un dictionary platform di ingredienti comuni con traduzioni cross-tenant; mantenere ingredients per-tenant per quelli custom.
  - Opzione C: ingredient diventa cross-tenant come allergens (rinominato `is_system`); ogni tenant linka tramite `product_ingredients` ma il nome+traduzioni vivono centralmente.

### 9.3 Conseguenze sulla tabella `translations`

Se cross-tenant:
- entity_type = `allergen`, tenant_id IS NULL, allergen_id valido.
- entity_type = `ingredient_platform`, tenant_id IS NULL.

Se per-tenant:
- entity_type = `ingredient`, tenant_id NOT NULL.

Decision marker: se andiamo verso schema unico `translations`, mettere `tenant_id` nullable e usare il valore NULL come marker "system".

---

## Sezione 10 — Schema entità relazione visiva

```
tenants (id, name, logo_url)
  └─ activities (id, tenant_id, name, slug, description, address*, fees JSONB, ...)
        └─ activity_slug_aliases (slug → activity_id)
        └─ activity_hours (day, slot_index, opens_at, closes_at)
        └─ activity_closures (closure_date, label, slots JSONB)

  ├─ products (id, tenant_id, name, description, base_price, parent_product_id, image_url, product_type)
  │     ├─ products (variants — same table, parent_product_id NOT NULL)
  │     ├─ product_attribute_values (value_text, value_number, ...)
  │     │     └─ product_attribute_definitions (code, label, options JSON, vertical, tenant_id NULLABLE)
  │     ├─ product_option_groups (name, group_kind PRIMARY_PRICE|ADDON, pricing_mode)
  │     │     └─ product_option_values (name, absolute_price, price_modifier)
  │     ├─ product_allergens (M:N → allergens [SYSTEM, label_it, label_en])
  │     ├─ product_ingredients (M:N → ingredients [tenant_id, name])
  │     └─ product_variant_assignments
  │           └─ product_variant_dimensions (name)
  │                 └─ product_variant_dimension_values (label)

  ├─ catalogs (id, name)
  │     └─ catalog_categories (id, name, level 1-3, parent_category_id)
  │           └─ catalog_category_products (catalog_id, category_id, product_id, variant_product_id, sort_order)

  ├─ featured_contents (id, internal_name, title, subtitle, description, cta_text, cta_url, content_type, pricing_mode)
  │     └─ featured_content_products (featured_content_id, product_id, sort_order, note)

  ├─ schedules (rule_type "catalog"|"featured", time_mode, ...)
  │     ├─ schedule_targets (M:N — NO tenant_id, vedi gap)
  │     ├─ schedule_featured_contents (slot before_catalog|after_catalog)
  │     ├─ schedule_price_overrides
  │     └─ schedule_visibility_overrides

  └─ styles (id, name) ─ style_versions
```

### Fan-out di traduzione

Per **un singolo prodotto** (configurabile) tradotto in 4 lingue:
- 1 product (description) × 4 = **4 INSERT**
- 5 varianti × (description) × 4 = **20 INSERT**
- 3 option_groups × (name) × 4 = **12 INSERT**
- 8 option_values × (name) × 4 = **32 INSERT**
- 4 attribute_values × (value_text) × 4 = **16 INSERT**
- 4 attribute_definitions × (label, plus N option labels) × 4 = **16 INSERT** (riusabili cross-product se platform)
- 5 ingredients × (name) × 4 = **20 INSERT**
- 0 allergens (già seedati platform)

**Subtotale per un prodotto medio**: ~120 righe in `translations`. Per un menu di 100 prodotti: ~12k righe. Per 4 lingue × 100 prodotti × 1000 tenant: ~12M righe (worst case multi-tenant). Significativo ma gestibile con index `(entity_type, entity_id, lang)`.

---

## Sezione 11 — Problemi scoperti e raccomandazioni

### P1 — `submit-review` Edge Function: messaggi italiani hardcoded
- **Descrizione**: gli error messages 400/404/429/500 sono in italiano dentro l'edge function, mostrati al cliente nella ReviewsView.
- **Impatto sulla feature**: serio. Un utente in EN vedrebbe errori in IT.
- **Raccomandazione**: l'edge function dovrebbe ritornare `error_code` (string) invece di `error` (testo). Il frontend mappa il code → label tradotta.
- **Costo**: 0.5 giorni.

### P2 — `LanguageSelector` non collegato allo stato globale
- **Descrizione**: oggi il selettore esiste ma il suo `selectedLang` non si propaga al payload Edge Function né alle stringhe UI.
- **Impatto**: bloccante. Senza propagazione, la feature è puramente visiva.
- **Raccomandazione**: introdurre `LanguageProvider` (context) o sollevare lo state in `PublicCollectionPage`. Ho il forte vincolo CLAUDE.md "Non creare nuovi provider senza necessità" — qui la necessità c'è. Documentare in CLAUDE.md.
- **Costo**: 1.5 giorni (provider + URL sync + persistenza + propagazione a header/CollectionView/edge call).

### P3 — `resolveActivityCatalogs.ts` esiste in 2 copie da sincronizzare
- **Descrizione**: copy duplicata in `src/services/supabase/` e `supabase/functions/_shared/`. Già nota in CLAUDE.md.
- **Impatto**: serio. Ogni cambio per traduzioni va replicato. Rischio drift.
- **Raccomandazione**: estrarre la logica a fattore comune in un package condiviso oppure forzare un build step che copia un file canonico in entrambi. Per ora: aggiungere un test che fa il diff dei due file in CI.
- **Costo**: 1 giorno (test CI) o 3 giorni (refactor build).

### P4 — `featured_contents` update fa delete+reinsert su tutti i `note`
- **Descrizione**: `updateFeaturedContent(...)` con `productsData !== undefined` cancella TUTTI i `featured_content_products` e li reinserisce. Questo invalida ogni hash di traduzione su `note` anche se non cambiato. Inoltre perde le translations associate.
- **Impatto**: serio per la feature traduzioni. Bloccante se le traduzioni sono linkate per `featured_content_product.id` (l'id cambia).
- **Raccomandazione**: usare `syncFeaturedContentProducts` (pattern già presente nel file con delta). Se le traduzioni sono linkate per `(featured_content_id, product_id)` invece che per `featured_content_product.id`, il problema scompare. Oppure mantenere `id` stabili nel sync.
- **Costo**: 0.5 giorni (refactor) — dipende dalla scelta del primary key per translations.

### P5 — `activities.description` non incluso in `ACTIVITY_SELECT` dell'Edge Function
- **Descrizione**: la description della sede non viene oggi mostrata nella pagina pubblica (campo non selezionato in `resolve-public-catalog/index.ts`).
- **Impatto**: minore per la feature traduzioni (campo non in scope), ma è un side-finding rilevante. Potrebbe essere intenzionale o un bug.
- **Raccomandazione**: chiedere conferma al PO. Se è bug, va fixato in parallelo.
- **Costo**: 0.25 giorni (fix), oppure 0 se choice deliberata.

### P6 — Allergens hanno solo `label_it` e `label_en`, non altre lingue
- **Descrizione**: la tabella allergens non scala oltre IT/EN. Per FR/DE serve ALTER TABLE + UPDATE seed.
- **Impatto**: bloccante per FR/DE.
- **Raccomandazione**: migrare a una tabella `allergen_translations(allergen_id, lang, label)` (più scalable) oppure aggiungere colonne `label_fr`, `label_de` (più semplice ma rigido). Preferire schema relazionale.
- **Costo**: 0.5 giorni.

### P7 — `allergens.label_it` esposto direttamente in `ResolvedAllergen`
- **Descrizione**: `ResolvedProductAllergen.label_it` è IT-only nel tipo TS. La RPC e i resolver passano la stringa IT direttamente.
- **Impatto**: serio. Cambiare `label_it` → `label` (lang-aware) richiede update tipi TS, mappers, frontend (`ItemDetail.tsx`).
- **Raccomandazione**: introdurre `label` polymorphic risolto lato backend; deprecare `label_it`.
- **Costo**: 0.5 giorni.

### P8 — Ingredient duplication cross-tenant
- **Descrizione**: ogni tenant duplica "Mozzarella". Tradurre 1000 volte la stessa stringa è spreco. Vedi sezione 9.
- **Impatto**: serio (costo OPEX traduzione, qualità inconsistente).
- **Raccomandazione**: introdurre dictionary platform per ingredienti più comuni. Decisione architetturale.
- **Costo**: 5 giorni (schema + UI per pickere ingredient da dictionary platform vs custom).

### P9 — Currency / formatting / RTL non isolati
- **Descrizione**: prezzi formattati con `€${price.toFixed(2)}` ovunque. Il symbol e la locale di formatting (separator decimale `.` vs `,`) sono italiane hardcoded.
- **Impatto**: minore per ora (clienti italiani), serio se internazionalizziamo davvero.
- **Raccomandazione**: helper `formatPrice(price, lang)` centralizzato che usa `Intl.NumberFormat`.
- **Costo**: 1 giorno.

### P10 — Recente migration ha rinominato tabelle senza aggiornare CLAUDE.md
- **Descrizione**: `20260429130000_rename_v2_audit_events_and_v2_notifications.sql` (committato in working tree) è una rinomina recente. CLAUDE.md menziona `notifications` (`20260410140000_notifications`) che è ora la tabella rinominata. Coerente, ma verificare.
- **Impatto**: minore.
- **Raccomandazione**: verifica.

### P11 — Hub tab "events" / "reviews" condividono FAB review con tab menu
- **Descrizione**: il FAB "Com'è andata?" appare solo in tab `menu`. Il tab `reviews` esiste ma il flusso di review ha entry-point doppio. Non blocca ma è UX-relevant per l'i18n.
- **Impatto**: minore.
- **Raccomandazione**: durante l'i18n, consolidare label e flow.
- **Costo**: 0.25 giorni.

### P12 — Cache HTTP non lang-aware
- **Descrizione**: `s-maxage=30` dell'Edge Function non distingue tra lingue. Se metti `?lang=en`, la CDN potrebbe servire la cache di `it` se la query string non è inclusa nel cache key.
- **Impatto**: bloccante per la correttezza.
- **Raccomandazione**: aggiungere `Vary: Accept-Language` o spostare lang in path param `/:slug/:lang`. Verificare comportamento Supabase Edge cache.
- **Costo**: 0.25 giorni (header) + verifica QA.

### P13 — `menu-ai-import` non considera traduzioni
- **Descrizione**: l'AI import importa solo IT (è il principio di funzionamento del prompt). Dopo l'import, i prodotti dovrebbero finire in coda traduzione.
- **Impatto**: serio per workflow user.
- **Raccomandazione**: hook post-import che enqueue traduzioni in batch.
- **Costo**: 1 giorno.

### P14 — `payment_methods` / `services` vivono come `string[]` di codici
- **Descrizione**: i codici (`cash`, `wifi`, ecc.) sono mappati a label IT in costanti hardcoded (DA VERIFICARE in `src/constants/`). Questa mappatura è già application-side, lato UI.
- **Impatto**: minore per traduzioni (mapping client-side è il pattern naturale per i18n: codice → traduzione locale).
- **Raccomandazione**: includere queste costanti nel file i18n e basta.
- **Costo**: 0.25 giorni.

### P15 — `activity_closures.label` (testo libero del cliente) sul DB
- **Descrizione**: l'etichetta della chiusura ("Pasqua", "Ferie estive") è scritta dal cliente. Mostrata pubblicamente.
- **Impatto**: TRADURRE candidato.
- **Raccomandazione**: include in scope traduzioni.

### P16 — Performance impatto JOIN `translations`
- **Descrizione**: aggiungere lookup translations per ogni entità nella resolveActivityCatalogs aggiunge query. Già oggi la query è grossa.
- **Impatto**: minore se lookup batch (1 query per N entità).
- **Raccomandazione**: 1 query batch dopo aver collezionato gli `entity_id` da risolvere.

---

## Sezione 12 — Aperti da decidere

Domande architetturali emerse, da girare al product owner.

1. **Categoria nomi**: tradurre `catalog_categories.name` automaticamente o lasciare al brand? Brand-specific vs universale (vedi 1.4).
2. **Ingredient share dictionary**: vale la pena introdurre un dictionary platform di ingredienti (vedi P8 e sezione 9)?
3. **Variant heritage**: oggi `products.description` esiste sia per parent sia per varianti. Quando manca, l'UI "eredita" dal parent? Se sì, traduciamo solo il parent? (DA VERIFICARE comportamento di `ItemDetail` con description nulla sulla variante).
4. **Currency multi-locale**: il symbol `€` resta sempre, oppure ci si prepara a tenant che vogliono USD/CHF? (Caso italiano puro: `€` ok ovunque, ma il position e separator differiscono per lingua).
5. **URL strategy per lingua**: `?lang=en` query, o subpath `/:slug/en`, o subdomain `en.cataloglobe.it`? Ha implicazioni SEO grosse.
6. **Persistenza scelta utente**: cookie GDPR-consensoso oppure URL-only oppure localStorage? Influenza la UX e il consent banner.
7. **Auto-traduzione vs manuale**: per ogni nuova entità si fa auto-translate AI con flag "human-reviewed: false", oppure si richiede sempre input manuale del brand?
8. **Translation primary key per `featured_content_products.note`**: per `(featured_content_id, product_id)` oppure per `featured_content_product.id`? Influenza P4.
9. **`internal_name` e `slug` di entità: traducibili?** Per `activities.slug` la risposta è no (è URL). Per `featured_contents.internal_name` è no (admin-only). Per categorie con slug? — DA VERIFICARE se categories hanno uno slug.
10. **Allergeni `label_en`**: già presenti nel DB. Vengono usati oggi? La risposta è no (frontend usa solo `label_it`). Vanno eliminati o sfruttati come prima lingua secondary?
11. **`fees[].value` (testo libero)**: il cliente scrive "10%" o "5,00 €" — DA VERIFICARE; se è puramente numerico non c'è da tradurre, se è frase libera tipo "10% solo nei festivi" sì.
12. **Visibility per tenant non multi-lingua**: tenant che non vogliono pagare/configurare traduzioni vedono il LanguageSelector nascosto? — UX/business decision.
13. **Plurals e gender**: l'italiano ha "1 prodotto"/"N prodotti", l'inglese "1 product"/"N products", il francese "1 produit"/"N produits". Tutte le lingue richiedono ICU MessageFormat. Scegliere libreria (`i18next`, `formatjs`, `lingui`).
14. **Reviews**: i commenti scritti dai clienti finali (`reviews.comment`) sono testo nella loro lingua. NON tradurre, ma mostrare la lingua originale? Aggiungere `lang` colonna a reviews?
15. **Search behavior**: il `SearchOverlay` filtra su `name` + `description`. Quando l'utente è in EN e digita "tomato", deve trovare anche prodotti il cui name IT è "Pomodoro"? Decisione: search lang-aware o cross-language.
16. **`description` di `activities`**: confermare che il campo NON viene attualmente esposto pubblicamente (P5). Se non lo è, escludere dallo scope iniziale.

---

## Note di metodologia

- **File letti integralmente** (via Read o ctx_execute_file): `products.ts`, `featuredContents.ts`, `catalogs.ts`, `allergens.ts`, `ingredients.ts`, `productOptions.ts`, `attributes.ts`, `tenants.ts` (parziale), `activities.ts` (head), `activity.ts`, `tenant.ts`, `resolvedCollections.ts`, `collectionPublic.ts`, `catalog.ts`, `reviews.ts`, `database.ts` (head), `App.tsx` (parziale), `resolve-public-catalog/index.ts`, `_shared/resolveActivityCatalogs.ts`, `submit-review/index.ts`, `PublicCollectionPage.tsx`, `CollectionView.tsx`, `PublicCollectionHeader.tsx`, `ItemDetail.tsx`, `SearchOverlay.tsx`, `SelectionSheet.tsx`, `ReviewsView.tsx`, `FeaturedBlock.tsx`, `FeaturedPreviewModal.tsx`, `PublicFooter.tsx`, `PublicFees.tsx`, `LanguageSelector.tsx`, `EventsView.tsx`, `PublicOpeningHours.tsx`, `FeaturedIdentityForm.tsx`, `FeaturedCtaForm.tsx`, `ActivityIdentityForm.tsx`, `ProductForm.tsx` (parziale), migrations: `v2_allergens`, `v2_ingredients`, `v2_featured_contents`, `v2_products`, `featured_contents_add_content_type`, `activities_address_structured`, `v2_products_image_url`.
- **File NON letti** (campionati o saltati): file in `src/pages/Dashboard/Highlights/components/Featured*.tsx` non Identity/Cta, `Dashboard/Catalogs/CatalogEngine.tsx`, `Dashboard/Products/Ingredients/`, `NotFound.tsx`, `Dashboard/Reviews/Reviews.tsx`, `mapCatalogToSectionGroups` helper, `parseTokens` helper.
- **Ricerche grep**: per stringhe italiane, usate sui componenti chiave del PublicCollectionView. Coverage stimato ~80% delle stringhe customer-facing pagina pubblica.
- **MCP Supabase**: non usato (solo letture concesse, non necessarie ai fini del documento).
