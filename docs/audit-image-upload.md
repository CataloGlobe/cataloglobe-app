# Audit — Sistema upload/crop immagini (FASE 1, read-only)

> Documento di sola lettura. Mappa tutti i punti dell'app dove l'utente carica un'immagine, per progettare un componente unico di upload + framing (pan/zoom/centra/background) parametrizzato per aspect ratio e feature set.
>
> Stato codice: audit eseguito il 2026-07-16. Nessun file modificato.

---

## 0. Sintesi esecutiva

L'app ha **7 punti di upload immagine** (5 noti + 2 emersi durante l'audit: **User Avatar** e **Activity Gallery**).

Scoperta chiave: **esiste già uno stack di framing condiviso e maturo**, non solo il "pattern Contenuto in evidenza". I componenti riutilizzabili sono:

- **`ImageReframeEditor`** (`src/components/ui/ImageReframeEditor/`) — editor pan/zoom/centra + background fill, **già parametrizzato via prop `aspectRatio`** (default 16:9). Usato da Featured **e** Stories.
- **`reframeGeometry.ts`** — motore geometrico puro (nessun DOM, nessun canvas), testabile, che calcola cover/contain/pan/zoom per qualsiasi aspect ratio.
- **`FramedMedia`** (`src/components/ui/FramedMedia/`) — renderer pubblico CSS-only SSR-safe che riapplica il framing salvato.
- **`ImageUploadField`** (`src/components/ui/ImageUploadField/`) — dropzone + file input controllato, con `thumbShape: "wide" | "square"`.
- **`FileInput`** (`src/components/ui/Input/FileInput.tsx`) — file picker low-level.
- **`compressImage.ts`** — compressione canvas condivisa, con 6 profili predefiniti (`COMPRESS_PROFILES`).

**Conseguenza per il design del componente unico:** non si parte da zero. Il lavoro NON è "costruire un editor", ma **generalizzare e adottare lo stack esistente** (`ImageReframeEditor` + `FramedMedia`) nei 3 punti che oggi fanno solo dumb-upload (Cover sede, Logo, Prodotto). Il vincolo 16:9 è già un default di prop, non un hardcode profondo.

Divario principale: **Featured e Stories** hanno editor completo con metadati di framing persistiti in DB; **Cover, Logo, Prodotto, Avatar** hanno solo upload + crop CSS automatico senza controllo utente (rischio content-loss, evidente su Logo con immagini larghe/strette).

---

## 1. Contenuto in evidenza (Featured) — pattern di riferimento maturo

| Voce | Dettaglio |
|---|---|
| **Aspect ratio** | 16:9 fisso — `DEFAULT_RATIO = 16/9` in `ImageReframeEditor.tsx:27`, passato via prop `aspectRatio` |
| **UX** | Editor completo: drag-pan, slider zoom (fine step 0.001, marker "riempie" a zoom 1), 3 bottoni fit **Riempi/Intera/Centra**, 4 modalità background **Sfocato/Foto(dominante)/Colore/No** con swatch preset + color picker |
| **Tecnica crop** | **Nessun canvas**. CSS transform + geometria pura (`reframeGeometry.ts`: `cover()`, `containZoom()`, `dims()`, `offset()`, `applyDrag()`, `framePercent()`) |
| **Storage** | bucket `featured-contents`, path `{tenantId}/{contentId}.{ext}`, upsert. **No cache-buster** (diverge da product/story) |
| **Compressione** | `compressImageWithMeta(file, COMPRESS_PROFILES.featured)` → WEBP 1200×800 @0.85; ritorna `naturalWidth/Height` per i bound zoom |
| **Formati/limiti** | PNG/JPG/WEBP; UI dice "max 5 MB" ma `compressImage` applica **10 MB** reali (incoerenza cosmetica) |
| **Persistenza framing** | Colonne DB dedicate (migration `20260701152807_add_featured_media_framing.sql`) |

**File coinvolti**

- Drawer admin: `src/pages/Dashboard/Highlights/components/FeaturedMediaDrawer.tsx`
- Editor: `src/components/ui/ImageReframeEditor/{ImageReframeEditor.tsx, types.ts, reframeGeometry.ts, extractDominantColor.ts}`
- Renderer pubblico: `src/components/ui/FramedMedia/FramedMedia.tsx` + `src/components/PublicCollectionView/FeaturedBlock/FeaturedBlock.tsx`
- Service: `src/services/supabase/featuredContents.ts` (`framingToColumns` / `columnsToFraming`) + `src/services/supabase/upload.ts:79`

**Colonne DB framing** (`featured_contents`): `media_id` (text), `media_focal_x/_y` (real, 0..1, default 0.5), `media_zoom` (real, default 1), `media_fill_mode` (text ∈ blur/dominant/color/none, default 'blur'), `media_fill_color` (`^#[0-9a-fA-F]{6}$` o NULL), `media_aspect_ratio` (real).

**Props editor**

```
interface MediaFraming { focalX; focalY; zoom; fillMode; fillColor }        // focalX/Y 0..1, zoom containZoom..maxZoom
interface ImageReframeEditorProps {
  source: string;                 // objectURL (nuovo) o URL remoto (edit)
  value: MediaFraming;
  onChange: (next: MediaFraming) => void;
  aspectRatio?: number;           // default 16/9  ← già parametrico
  className?: string;
  showActions?: boolean;          // bottoni Riempi/Intera/Centra (default true)
  showFillPanel?: boolean;        // pannello background (default true)
}
```

**Render pubblico** (`FramedMedia`): due path — *legacy* (zoom≈1 → CSS `object-fit: cover` + `object-position: fx% fy%`) e *parametrico* (zoom≠1 → width/height/left/top in % via `framePercent()`), più eventuale layer di riempimento band (blur o colore). Richiede wrapper `position: relative; overflow: hidden`.

---

## 2. Storie (Stories) — secondo consumatore dello stack condiviso

Le Storie hanno **due sotto-punti**: copertina storia e immagini interne ai blocchi.

### 2a. Copertina storia
- Aspect ratio 16:9 fisso, **nessun editor** (solo upload + rimuovi).
- Bucket `stories`, path `{tenantId}/{storyId}.{ext}`. Compressione `COMPRESS_PROFILES.cover` (1280×720).

### 2b. Immagini nei blocchi (`StoryImageBlock`) — editor completo
| Voce | Dettaglio |
|---|---|
| **Aspect ratio** | **Scelta utente**: SegmentedControl `3:2` (orizzontale, default) o `4:5` (verticale). Salvato in `frame` |
| **UX** | Riusa **lo stesso `ImageReframeEditor`**: drag-pan, wheel-zoom, focal marker (Crosshair), fill mode Sfocato/Foto/Colore/No. Replace file dal footer drawer |
| **Tecnica crop** | Identica a Featured: `reframeGeometry.ts` + `FramedMedia` |
| **Storage** | bucket `stories`, path blocco `{tenantId}/{storyId}/{blockId}.{ext}`. Max 8 immagini/storia |
| **Compressione** | `COMPRESS_PROFILES.story` (1200×**1500**, taller per supportare 4:5) |
| **Formati/limiti** | image/*, max 5 MB (`ImageBlock.tsx:37`) |
| **Persistenza framing** | In JSONB `stories.body_blocks[]`: `frame`, `framing {focalX, focalY, zoom, fillMode, fillColor}`, `mediaAspectRatio` (w/h naturale) |

**File coinvolti**

- `src/pages/Dashboard/Stories/components/blocks/ImageBlock.tsx`
- `src/pages/Dashboard/Stories/components/blocks/StoryImageFramingDrawer.tsx` (format picker + editor + fill)
- `src/pages/Dashboard/Stories/StoryDetailPage.tsx` (upload cover riga ~190, blocchi ~203-208)
- `src/services/supabase/stories.ts` (tipo `StoryImageBlock`, `MAX_STORY_IMAGES=8`)
- Editor + renderer condivisi (§1)

> **Nota importante:** Stories dimostra già che `ImageReframeEditor` funziona con aspect ratio **diversi da 16:9** (3:2 e 4:5) e persino con aspect ratio **selezionabile dall'utente**. È la prova che il componente è di fatto generalizzabile.

---

## 3. Copertina sede (Activity cover)

| Voce | Dettaglio |
|---|---|
| **Aspect ratio** | 16:9 consigliato (hint "Formato consigliato: 16:9"). **Non è un editor** — enforcement solo via `compressImage` max 1280×720 + CSS `object-fit: cover` in preview |
| **UX** | Solo upload/replace. Nessun pan/zoom, nessun controllo framing. Il crop del preview è automatico (CSS cover) → possibile content-loss ai bordi |
| **Tecnica crop** | Canvas downscale (`compressImage`) + CSS `object-fit: cover` |
| **Storage** | bucket `business-covers`, path `{tenantId}/{slug}__{activityId}/cover.{ext}`, upsert, cache-control 3600, `?v=timestamp`. Pre-cleanup di tutte le estensioni. **Side-effect DB**: aggiorna `activities.cover_image` |
| **Compressione** | `COMPRESS_PROFILES.cover` (1280×720 @0.82 WEBP) |
| **Formati/limiti** | image/* accettato; PNG/JPG/WEBP validati; max **5 MB** (`MAX_FILE_SIZE`) |

**File coinvolti**

- Drawer: `src/pages/Operativita/Attivita/tabs/ActivityCoverDrawer.tsx`
- Service: `src/services/supabase/activities.ts` (`uploadActivityCover`)
- Altri call site: `src/pages/Dashboard/Businesses/Businesses.tsx:554,855`

**Props**

```
interface ActivityCoverDrawerProps {
  open: boolean; onClose: () => void;
  activity: V2Activity;                 // id, tenant_id, slug, cover_image
  onSuccess: (newUrl: string | null) => void;
}
```

---

## 4. Immagine prodotto (Product)

| Voce | Dettaglio |
|---|---|
| **Aspect ratio** | **Nessuno a monte**. Una sola immagine serve più contesti: Card **16:9** (admin) / **4:3** e List **quadrata** (pubblico) / Compatto **nessuna immagine** |
| **UX** | Solo upload/replace/rimuovi via `FileInput` drag&drop. Nessun editor visibile |
| **Tecnica crop** | Canvas compress + CSS `object-fit: cover` con `object-position` al focal point (`FramedMedia`, path legacy `aspectRatio=null`) |
| **Storage** | bucket `product-images`, path `{tenantId}/products/{productId}.{ext}`, upsert, `?v=timestamp` |
| **Compressione** | `COMPRESS_PROFILES.product` (800×800 @0.82 WEBP) |
| **Formati/limiti** | image/*, max 5 MB |
| **Framing metadata** | **Non persistito** — `productImageFraming.ts` ha default hardcoded (focal 0.5/0.5, zoom 1, fill blur) con commento "Products non hanno ancora colonne di framing" |

**File coinvolti**

- `src/pages/Dashboard/Products/SchedaTab.tsx` (sezione Immagine)
- `src/pages/Dashboard/Products/components/ProductForm.tsx` (upload create/edit, compress ~857)
- `src/pages/Dashboard/Products/components/productImageFraming.ts` (default hardcoded)
- `src/pages/Dashboard/Products/components/ProductCard.tsx` + `src/components/ui/FramedMedia/FramedMedia.tsx`
- `src/services/supabase/upload.ts` (`uploadProductImage`)

> Il renderer prodotto usa **già `FramedMedia`**, ma sempre con framing di default (nessuna UI per editarlo, nessuna colonna DB dove salvarlo). L'infrastruttura di render è pronta; mancano UI editor + persistenza.

---

## 5. Logo tenant

| Voce | Dettaglio |
|---|---|
| **Aspect ratio** | Atteso 1:1 ma **NON enforced**. Il profilo compress è **512×256 (2:1!)**, non quadrato; preview CSS `object-fit: contain` (letterbox, nessun lock) |
| **UX** | Solo upload/replace via `FileInput`. Nessun controllo utente |
| **Tecnica crop** | Canvas downscale + CSS `object-fit: contain` — **nessun crop, solo letterbox** |
| **Storage** | bucket `tenant-assets`, path `{tenantId}/logo.{ext}`, upsert, `?v=timestamp`. Helper `getTenantLogoPublicUrl` |
| **Compressione** | `COMPRESS_PROFILES.logo` (512×256 @0.90 WEBP) |
| **Formati/limiti** | PNG/JPEG/WEBP, max 5 MB |

**File coinvolti**

- `src/pages/Business/BusinessSettingsPage.tsx` (sezione logo ~72-97)
- `src/components/ui/Input/FileInput.tsx`
- `src/services/supabase/tenants.ts` (`uploadTenantLogo`)
- Altri call site: `CreateBusinessWizard.tsx:452`, `CreateBusinessDrawer.tsx:74`

> **Problema confermato:** profilo `logo` a 512×256 (2:1) contraddice l'intento 1:1. Immagini larghe o strette vengono letterboxate in modo imprevedibile, senza alcun controllo dell'utente. Candidato n.1 a beneficiare di un editor di framing 1:1.

---

## 6. Punti emersi durante l'audit (non nell'elenco iniziale)

### 6a. User Avatar
- Service `uploadAvatar(userId, file)` in `src/services/supabase/profile.ts`. Bucket `avatars`, path `{userId}/avatar.{ext}`, upsert.
- Compressione **interna** `COMPRESS_PROFILES.avatar` (512×512 @0.90 WEBP).
- UX: solo upload, nessun editor. Call site: `src/components/Profile/Profile.tsx:55`, `src/pages/Workspace/WorkspaceSettingsPage.tsx:187`.
- **Bug latente:** `uploadAvatar` valida rifiutando WEBP (accetta solo PNG/JPEG) **ma** `compressImage(avatar)` produce WEBP → incoerenza formato da verificare.

### 6b. Activity Gallery (media galleria sede)
- Service `uploadAndInsertActivityMedia(activity, file)` in `src/services/supabase/activity-media.ts`. Bucket `business-covers` (condiviso con cover), path `{tenantId}/{slug}__{activityId}/gallery/{uuid}.{ext}`, **upsert=false** (path unico per upload).
- Compressione interna `COMPRESS_PROFILES.cover`. **Side-effect DB**: inserisce riga in `activity_media` (type="image").
- UX: solo upload. Call site: `src/pages/Operativita/Attivita/tabs/ActivityGalleryUploadDrawer.tsx`.

### 6c. AI Menu Import
- `src/pages/Dashboard/Catalogs/AiMenuImport/steps/UploadStep.tsx` usa `compressImage` per le immagini menu (flusso di import, non un punto di framing utente — citato per completezza).

---

## 7. Analisi comparativa

### 7.1 Tabella comparativa

| Punto | Aspect ratio | UX (upload/crop/editor) | Libreria crop | File principali |
|---|---|---|---|---|
| **Featured** | 16:9 fisso | **Editor completo** (pan/zoom/fit/background) | CSS + `reframeGeometry` (no canvas) | `FeaturedMediaDrawer.tsx`, `ImageReframeEditor/`, `FramedMedia.tsx` |
| **Story blocco** | 3:2 / 4:5 (scelta utente) | **Editor completo** | CSS + `reframeGeometry` | `StoryImageFramingDrawer.tsx`, `ImageBlock.tsx`, editor condiviso |
| **Story cover** | 16:9 fisso | Solo upload | CSS cover | `StoryDetailPage.tsx` |
| **Cover sede** | 16:9 consigliato | Upload + crop CSS automatico | Canvas compress + `object-fit: cover` | `ActivityCoverDrawer.tsx`, `activities.ts` |
| **Prodotto** | Nessuno (multi-contesto) | Solo upload/replace | Canvas compress + `FramedMedia` (default) | `SchedaTab.tsx`, `ProductForm.tsx`, `productImageFraming.ts` |
| **Logo** | 1:1 atteso / **non enforced** | Solo upload | Canvas compress + `object-fit: contain` | `BusinessSettingsPage.tsx`, `tenants.ts` |
| **Avatar** | 1:1 (512×512) | Solo upload | Canvas compress interno | `Profile.tsx`, `profile.ts` |
| **Activity Gallery** | Nessuno (cover profile) | Solo upload | Canvas compress interno | `ActivityGalleryUploadDrawer.tsx`, `activity-media.ts` |

### 7.2 Logica duplicata

Sorprendentemente **poca duplicazione a livello di infrastruttura** — la compressione e il render framing sono già centralizzati. Duplicazione residua:

1. **Sequenza upload nei service** (`uploadX`): pattern quasi identico (build path → `storage.upload({upsert})` → `getPublicUrl` → cache-buster) ripetuto in `upload.ts` (3 funzioni), `tenants.ts`, `activities.ts`, `activity-media.ts`, `profile.ts`. Divergono solo bucket/path/cache-buster/side-effect DB.
2. **Validazione formato/size incoerente**: le 3 funzioni in `upload.ts` **non validano** (delegano al caller); `uploadAvatar`/`uploadTenantLogo` validano ma con set formati diversi (avatar rifiuta WEBP, logo lo accetta). Nessuna guardia unica.
3. **Limite "5 MB"** ripetuto come costante locale in ogni drawer (`ActivityCoverDrawer`, `SchedaTab`, `ImageBlock`, `FeaturedMediaDrawer`, `FileInput maxSizeMb`) invece di una costante condivisa; e diverge dal limite reale 10 MB di `compressImage`.
4. **Cache-buster** applicato in modo incoerente: presente in product/story/cover/logo, **assente** in featured.

### 7.3 Il pattern Featured è generalizzabile ad aspect ratio diversi?

**Sì, ed è già dimostrato in produzione.** `ImageReframeEditor` accetta `aspectRatio?: number` (default 16/9) e `reframeGeometry` calcola tutto in funzione del `frameRatio`. Le Storie lo usano con 3:2 e 4:5. Non ci sono assunzioni hardcoded profonde sul 16:9: l'unico hardcode è il **valore di default** della prop, non una dipendenza strutturale. Per il logo basterebbe passare `aspectRatio={1}`; per il prodotto un ratio a scelta.

Unica cura: la persistenza. Featured salva su **colonne DB dedicate**; Stories su **JSONB**. Un componente unico dovrebbe restare agnostico rispetto allo storage del framing e restituire l'oggetto `MediaFraming` al caller, che decide dove salvarlo.

### 7.4 Caso Logo

Applicare `ImageReframeEditor` con `aspectRatio={1}` (e `showFillPanel` opzionale, utile per loghi non quadrati → banda colore/trasparente invece di crop distruttivo) **risolverebbe** il problema attuale delle immagini larghe/strette tagliate male. Va corretto in parallelo il profilo compress `logo` da 512×256 a **512×512** (o export quadrato). Complessità: bassa — infrastruttura pronta, serve solo aggiungere colonne/JSON per il framing del logo o accettare un crop quadrato guidato dall'utente.

### 7.5 Caso Prodotto

L'immagine prodotto serve contesti a ratio diversi (Card 4:3 / List quadrata / Compatto nessuna). Due strade:

- **A — Un solo storage + framing manuale (consigliata):** salvare una sorgente ad alta risoluzione + un oggetto `MediaFraming` (focal + zoom) editato con `ImageReframeEditor`. Il render pubblico (`FramedMedia`, già usato dal prodotto) applica il focal point per **tutti** i ratio via CSS. Un solo upload, un solo file, framing coerente. Serve aggiungere colonne framing al prodotto (oggi assenti — `productImageFraming.ts` è hardcoded).
- **B — Export multipli per ratio:** genera varianti 4:3 / 1:1 dallo stesso sorgente. Più complesso (canvas multi-export, storage multiplo, invalidazione), giustificato solo se il focal-point CSS non basta qualitativamente. **Sconsigliato** come primo step.

Raccomandazione: A. Il focal point risolve la maggior parte dei casi; B resta un'ottimizzazione futura se emergono problemi di qualità.

### 7.6 Collocazione del componente unico — 3 opzioni

| Opzione | Pro | Contro |
|---|---|---|
| **A. Estendere `src/components/ui/ImageReframeEditor/` + wrapper `ImageUploadEditor` accanto** (consigliata) | Riusa lo stack esistente dove già vive; zero migrazione dei 2 consumatori attuali (Featured/Stories); scoperta naturale in `ui/` | `ui/` cresce; il wrapper deve orchestrare upload+compress+editor+persistenza |
| **B. Nuova cartella dedicata `src/components/media/`** | Separazione semantica netta (upload/framing/render insieme: `ImageReframeEditor` + `FramedMedia` + `ImageUploadField`) | Richiede spostare componenti esistenti → churn su import in Featured/Stories/Prodotto; più rischio |
| **C. Solo un hook `useImageUpload` senza componente wrapper** | Massima flessibilità UI per-caller | Non risolve la duplicazione della UI upload; ogni drawer resta custom |

**Raccomandazione: A.** Costruire un wrapper `ImageUploadEditor` in `src/components/ui/ImageUploadEditor/` che compone `ImageUploadField` (dropzone) + `compressImage` + `ImageReframeEditor` (con `aspectRatio` e feature-flags `showFillPanel`/`showActions`) e ritorna `{ file, framing }` al caller. Storage e persistenza restano nel service del dominio. Nessuna migrazione forzata di Featured/Stories: possono adottarlo in un secondo momento.

### 7.7 Rischi / complessità di migrazione per punto d'uso

| Punto | Complessità | Motivazione |
|---|---|---|
| **Featured** | Bassa | Già usa lo stack; sarebbe solo refactor a wrapper comune (opzionale) |
| **Story blocco** | Bassa | Idem; già editor completo + aspect ratio variabile |
| **Story cover** | Bassa | Aggiungere editor 16:9 dove oggi c'è dumb-upload; persistenza JSON già presente nel dominio |
| **Logo** | Bassa/Media | `aspectRatio={1}` + fix profilo compress 512×512 + aggiungere persistenza framing (nuove colonne o crop quadrato guidato). Poco codice, ma tocca DB/migration |
| **Cover sede** | Media | Aggiungere editor 16:9 + colonne framing su `activities` (migration) + adeguare `FramedMedia` nel render pubblico della cover |
| **Prodotto** | Media/Alta | Serve decidere strategia (§7.5), aggiungere colonne framing prodotto (oggi hardcoded), verificare i 3 contesti di render (Card/List/Compatto) e la coerenza focal-point cross-ratio |
| **Avatar** | Bassa | `aspectRatio={1}`; risolvere prima l'incoerenza validazione WEBP in `uploadAvatar` |
| **Activity Gallery** | Media | Path non-deterministico + insert DB; se si vuole framing per-immagine servono colonne su `activity_media` |

---

## 8. Inventario tecnico di supporto

### 8.1 `compressImage.ts` — profili
```
cover    : 1280×720  @0.82 webp
product  : 800×800   @0.82 webp
logo     : 512×256   @0.90 webp   ← 2:1, incoerente con intento 1:1
avatar   : 512×512   @0.90 webp
featured : 1200×800  @0.85 webp
story    : 1200×1500 @0.82 webp   ← taller per 4:5
```
Comportamento: input max 10 MB, rifiuta HEIC/HEIF, downscale aspect-preserving, skip-if-smaller, timeout 15s, ritorna `File` o `{...naturalWidth, naturalHeight}`.

### 8.2 Componenti UI riutilizzabili esistenti
- `ImageReframeEditor` — editor framing parametrico (pan/zoom/fit/background).
- `FramedMedia` — renderer pubblico CSS-only SSR-safe.
- `ImageUploadField` — dropzone controllata (`thumbShape: "wide"|"square"`, `accept`, `maxSizeMb`).
- `FileInput` — file input low-level (`preview: "auto"|"none"|"custom"`).

### 8.3 Buckets Supabase Storage
`featured-contents` · `stories` · `product-images` · `business-covers` (cover + gallery) · `tenant-assets` (logo) · `avatars`.

### 8.4 Incoerenze da attenzionare (non azioni di questa fase)
1. Limite size UI (5 MB) ≠ limite reale `compressImage` (10 MB).
2. `uploadAvatar` rifiuta WEBP ma il compress produce WEBP.
3. Profilo `logo` 512×256 (2:1) vs intento 1:1.
4. Cache-buster presente ovunque tranne Featured.
5. Validazione formato/size delegata al caller nelle 3 funzioni di `upload.ts`, centralizzata altrove.

---

*Fine audit FASE 1. Nessun file di produzione modificato.*
