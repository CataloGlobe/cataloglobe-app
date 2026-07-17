# Audit dedicato — Immagine Prodotto (FASE 8a, read-only)

> Documento di sola lettura. Mappa tutti i punti di RENDER dell'immagine prodotto per progettare la migrazione a `ImageUploadEditor` con approccio **framing metadata + `FramedMedia`** (NON baked).
>
> Motivazione approccio non-baked: la stessa immagine prodotto appare in **aspect ratio diversi** a seconda del contesto (List 1:1, Grid 4:3, dettaglio 16:9). Un file baked a un solo ratio non può servirli tutti bene; un **focal point** (+ zoom) salvato come metadata sì, perché `FramedMedia` lo riapplica per-contenitore.
>
> Nessuna modifica al codice. Nessuna migration applicata. Solo raccomandazione di schema. Audit eseguito il 2026-07-16.

---

## 0. Sintesi esecutiva

- L'immagine prodotto è renderizzata in **4 aspect ratio diversi** dallo stesso `image_url`: **1:1** (Card·List), **4:3** (Card·Grid), **16:9** (ItemDetail pubblico + admin ProductCard). Compatto (List/Grid) non ha immagine.
- Oggi tutti i render pubblici usano `<img>` grezzo + `object-fit: cover`. Solo l'admin `ProductCard` usa già `FramedMedia`, ma con `aspectRatio={null}` + `PRODUCT_IMAGE_DEFAULT_FRAMING` hardcoded (nessun framing reale salvato).
- **Nessuna colonna di framing esiste** su `products`. Verificato sul DB live: colonne = `id, tenant_id, name, description, base_price, parent_product_id, created_at, updated_at, image_url, product_type, variant_strategy, notes(jsonb), description_hash, notes_hash`. Nessun `metadata` JSONB riutilizzabile (il `notes` JSONB è semantico, default `[]` — non adatto).
- **Varianti** = righe prodotto self-ref (`parent_product_id`), ognuna con proprio `image_url`. Framing sulla tabella `products` copre padre **e** varianti automaticamente. Dati live: **0 varianti con immagine**.
- **Dati esistenti**: **24 prodotti su 723** hanno `image_url`. Con `image_framing` NULL → serve fallback esplicito a `PRODUCT_IMAGE_DEFAULT_FRAMING` (center/cover/blur) nel read path.
- **Payload pubblico NON è auto-magico**: il resolver live è l'edge function `resolve-public-catalog` → `_shared/resolveActivityCatalogs.ts` con **`CATALOG_SELECT` esplicito** (non `to_jsonb(p)`). Aggiungere il framing richiede editare il SELECT + i tipi `ResolvedProduct/Variant` in **due** file gemelli (server `_shared/` + mirror client `src/services/`).

**Complessità stimata migrazione reale: MEDIA-ALTA** (dettaglio §6).

---

## 1. Punti di RENDER dell'immagine prodotto

Aspect ratio misurati da CSS/container (non presunti).

| # | Render point | Componente | aspect-ratio | object-fit | Usa FramedMedia? | Campo immagine |
|---|---|---|---|---|---|---|
| 1 | **Card·List** (mobile/list) | `src/components/PublicCollectionView/CollectionView/CollectionView.tsx` (`ProductRow`, img ~L1220) · scss L696-704 | **1:1** (96×96px fisso; 80×80 <640px) | cover (L700) | ❌ raw `<img>` | `product.image` |
| 2 | **Card·Grid** (grid ≥1024) | stessa `ProductRow`, container query · scss L658-665 | **4:3** (L662) | cover | ❌ raw `<img>` | `product.image` |
| 3 | **Compatto·List** | `ProductCompactRow` | — nessuna immagine | — | ❌ | — |
| 4 | **Compatto·Grid** | `ProductCompactRow` | — nessuna immagine | — | ❌ | — |
| 5 | **ItemDetail** (modale pubblica) | `src/components/PublicCollectionView/ItemDetail/ItemDetail.tsx` (img L264-272) · scss L100-108 | **16:9** (L103; `width=1600 height=900`) | cover (L107) | ❌ raw `<img>` | `displayItem.image` |
| 6 | **Admin ProductCard** | `src/pages/Dashboard/Products/components/ProductCard.tsx` (L44-50) · scss L25-43 | **16:9** (L29) | cover (via FramedMedia) | ✅ (aspectRatio=`null` → legacy cover) | `product.image_url` + `PRODUCT_IMAGE_DEFAULT_FRAMING` |
| 7 | **Admin ProductCardVariant** | `src/pages/Dashboard/Products/components/ProductCardVariant.tsx` (L62-64) | (16:9, mirror di ProductCard) | cover | verificare (probab. FramedMedia/img) | `product.image_url` |
| 8 | **StylePreview** (mock) | `src/pages/Dashboard/Styles/Editor/StylePreview.tsx` | — `image: null` in tutti i mock | — | ❌ | mock `image_url: null` |

**Thumbnail read-only** (liste/picker, non necessitano framing — mostrano miniature piccole quadrate/generiche): `ProductGroupCreateEditDrawer`, `StoryProductPicker(+Drawer)`, `PairingProductPicker`, `FeaturedContentDetail`, `PublicCatalogReady`. Usano `image_url` in sola lettura.

> **Osservazione chiave**: 3 ratio diversi (1:1 / 4:3 / 16:9) dallo stesso file. Il **focal point** (`object-position` in cover) è ratio-agnostico → funziona identico in tutti e 3 a `zoom=1`. Lo `zoom>1` (crop più stretto) richiede che `FramedMedia` ricalcoli il layout per-contenitore usando il `frameRatio` del render point + l'**aspect ratio naturale** dell'immagine (come fa oggi per Featured/Storie). Quindi va salvato anche il ratio naturale.

---

## 2. Varianti — immagine propria o ereditata?

**Propria.** Le varianti sono righe della stessa tabella `products` con `parent_product_id` valorizzato (self-ref) + junction `product_variant_assignments (parent_product_id, variant_product_id, combination_key)`. Ogni variante ha la propria colonna `image_url` → può avere un'immagine indipendente. Tipo TS `V2Product` (`src/services/supabase/products.ts`): `image_url: string | null`, `variants?: V2Product[]` (join).

**Conseguenza schema**: il framing va su **`products`** (non su una tabella varianti dedicata). Copre padre e varianti con un'unica colonna. Dati live: 0 varianti hanno immagine oggi.

---

## 3. Proposta di schema per il framing

### Raccomandazione
Aggiungere a **`products`** (via nuova migration — da scrivere in FASE 8b dopo conferma):

```
image_framing     jsonb  null      -- shape MediaFraming: { focalX, focalY, zoom, fillMode, fillColor }
image_aspect_ratio real   null     -- ratio naturale (w/h) dell'immagine caricata
```

- **`image_framing`** (JSONB): stessa shape `MediaFraming` di Featured/Storie (`src/components/ui/ImageReframeEditor/types.ts`). JSONB (non colonne discrete come `featured_contents`) perché più compatto e la shape è già un oggetto coeso lato TS; nessun vincolo di query su singoli campi.
- **`image_aspect_ratio`** (real): mirror di `featured_contents.media_aspect_ratio`. **Necessario** perché il render avviene a ratio diversi dal ratio di authoring: `FramedMedia` (path parametrico, zoom≠1) ha bisogno del ratio naturale per ricalcolare il layout per ogni `frameRatio` di contenitore. A `zoom=1` (cover) basta il focal point, ma salvare il ratio abilita lo zoom cross-contesto senza regressioni.
- **Default read**: quando `image_framing` è NULL (24 prodotti esistenti + tutti i futuri pre-editor), il read path applica `PRODUCT_IMAGE_DEFAULT_FRAMING` (già esistente: center 0.5/0.5, zoom 1, fill blur). `image_aspect_ratio` NULL → `FramedMedia` usa il path legacy cover (object-position), che è esattamente il comportamento odierno → **nessuna regressione visiva** sui 24 esistenti.

### Perché JSONB e non colonne discrete
`featured_contents` usa colonne discrete (`media_focal_x/_y/_zoom/...`) per ragioni storiche. Per i prodotti, un singolo `image_framing jsonb` riduce la superficie di migrazione e mappa 1:1 su `MediaFraming`. Entrambe le scelte sono valide; JSONB è più snello.

### ⚠️ Payload pubblico — NON automatico
Il resolver live NON è la RPC `get_public_catalog` con `to_jsonb(p)` (quelle migration sono versioni superate). Il path attivo è:
- **`supabase/functions/resolve-public-catalog/index.ts`** → **`supabase/functions/_shared/resolveActivityCatalogs.ts`** (`CATALOG_SELECT` esplicito, ~L776/797 spread di `image_url`).
- **Mirror client**: `src/services/supabase/resolveActivityCatalogs.ts` (stessi tipi/logica — pattern "sincronizzato", come `scheduleResolver.ts`).

Per esporre il framing nel pubblico servirà, in FASE 8b:
1. Aggiungere `image_framing, image_aspect_ratio` al `CATALOG_SELECT` (server).
2. Aggiungere i campi ai tipi `ResolvedProduct`/`ResolvedVariant` in **entrambi** i file gemelli.
3. Mapparli nell'oggetto item passato al renderer.

---

## 4. Componenti di RENDER da aggiornare (img/CSS → FramedMedia)

Path esatti da migrare per consumare il framing:

| Componente | Modifica |
|---|---|
| `src/components/PublicCollectionView/CollectionView/CollectionView.tsx` (`ProductRow`) | Sostituire il raw `<img>` (List **e** Grid) con `FramedMedia`, passando `framing` + `aspectRatio` (naturale) + `frameRatio` per-contesto (1 per List, 4/3 per Grid). Il contenitore mantiene il suo `aspect-ratio` CSS. |
| `src/components/PublicCollectionView/ItemDetail/ItemDetail.tsx` (L264-272) | Raw `<img>` 16:9 → `FramedMedia` con `frameRatio={16/9}`. |
| `src/pages/Dashboard/Products/components/ProductCard.tsx` (L44-50) | Già `FramedMedia`. Passare il **framing reale** (non più `PRODUCT_IMAGE_DEFAULT_FRAMING` hardcoded) + `aspectRatio={image_aspect_ratio}` + `frameRatio={16/9}` (oggi `aspectRatio={null}`). |
| `src/pages/Dashboard/Products/components/ProductCardVariant.tsx` (L62-64) | Idem ProductCard (verificare se usa FramedMedia o img). |

**Fonte dati per il renderer**: `product.image` (pubblico) / `product.image_url` (admin) affiancati da `product.image_framing` + `product.image_aspect_ratio`. Richiede propagare i 2 campi nei tipi `CollectionViewSectionItem` / `ResolvedProduct` e nei mapping.

**Non toccare** (read-only thumbnail, nessun framing utile): i picker/liste elencati in §1.

---

## 5. Rischi — dati esistenti

- **24 prodotti** hanno `image_url` (su 723). Con `image_framing`/`image_aspect_ratio` NULL:
  - Read path DEVE applicare default esplicito `PRODUCT_IMAGE_DEFAULT_FRAMING` (center/cover/blur) + `aspectRatio=null` → `FramedMedia` legacy cover path = **identico all'odierno object-fit:cover**. Nessuna regressione.
  - Il default va garantito sia lato admin (già fa così) sia lato resolver pubblico (mapping: `image_framing ?? PRODUCT_IMAGE_DEFAULT_FRAMING`).
- **0 varianti con immagine** → nessun rischio varianti oggi; lo schema le copre comunque.
- **Nessun re-upload necessario**: le 24 immagini restano valide; il framing è additivo. L'editor prodotto (FASE 8b) permetterà di rinquadrarle opzionalmente (nuovo upload + framing, coerente con Featured/Storie che salvano metadata; NB: per il Prodotto l'approccio è metadata, quindi si può anche solo rinquadrare l'esistente senza ricaricare — a differenza dei punti baked).
- **AI import**: `menu-ai-import` NON crea immagini prodotto (solo dati testuali) → nessun impatto framing.
- **PDF export** (`generate-menu-pdf`): NON seleziona `image_url` → nessun impatto.

---

## 6. Stima complessità: **MEDIA-ALTA**

Motivazione:
- **Media** per lo schema (1 migration additiva, 2 colonne nullable, nessun backfill obbligatorio) e per l'editor upload (riuso di `ImageUploadEditor` **senza** `bake`, che ritorna già `framing` + `aspectRatio` naturale — è il modo d'uso "default" del wrapper, mai ancora esercitato in queste fasi).
- **Alta** per la **propagazione dati end-to-end**: a differenza dei punti baked (dove bastava cambiare l'upload), qui il framing deve viaggiare **dal DB fino a ogni renderer**:
  - 2 colonne nuove → tipi `V2Product` (service) + write path (`ProductForm`, `useSchedaDraft`, `products.ts` create/update).
  - `CATALOG_SELECT` + tipi `ResolvedProduct/Variant` in **2 file gemelli** (server `_shared/` + client mirror) da tenere sincronizzati.
  - `CollectionViewSectionItem` + mapping → propagare `image_framing`/`image_aspect_ratio` fino a `ProductRow`/`ItemDetail`.
  - 3-4 componenti di render da convertire a `FramedMedia` con `frameRatio` corretto per contesto.
  - Default fallback esplicito in ogni read path.
- **Rischio regressione visiva pubblica** → obbligo test Playwright (CLAUDE.md: modifiche a `PublicCollectionView/` richiedono Playwright) su tutte e 4 le combinazioni card + ItemDetail, verificando che i 24 esistenti (framing NULL) restino identici.

### Sequenza consigliata per FASE 8b (non eseguita ora)
1. Migration additiva `image_framing jsonb + image_aspect_ratio real` su `products` (con conferma esplicita).
2. Tipi + write path (service, ProductForm draft) — salvataggio framing dall'editor.
3. Editor upload: `ImageUploadEditor` **senza bake** (ritorna framing+ratio) nel tab Scheda, con `aspectRatio` di authoring 16:9.
4. Resolver: `CATALOG_SELECT` + tipi gemelli + mapping (default fallback).
5. Render: `ProductRow` (List+Grid), `ItemDetail`, `ProductCard(+Variant)` → `FramedMedia` con `frameRatio` per contesto.
6. Test Playwright sulle 4 combinazioni + ItemDetail + regressione sui 24 esistenti.

---

*Fine audit FASE 8a. Nessun file di produzione modificato, nessuna migration applicata.*
