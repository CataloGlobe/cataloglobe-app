# Featured Contents UX Refactor — Design Spec

## Goal

Semplificare l'interfaccia della sezione Contenuti in Evidenza: rimuovere stato pubblicato/bozza, rimuovere etichette tipo, adottare il pattern read-only + drawer per il tab Informazioni, e convertire il tab Prodotti a salvataggio immediato.

## Architecture

Il refactor è puramente frontend e non richiede nuove migration. I dati esistenti non cambiano: `status` rimane nella tabella ma viene sempre scritto come `'published'` alla creazione; il campo non viene più esposto in UI. Il pattern adottato è quello già in uso in `ActivityInfoTab`: card read-only con bottoni Modifica che aprono `SystemDrawer → DrawerLayout → Form`.

## Tech Stack

- React 19 + TypeScript 5.9 strict
- Supabase (via service layer `featuredContents.ts`)
- SCSS Modules
- Lucide React (icona `Pencil` per i bottoni Modifica)
- DnD Kit (già presente in `ProductsManagerCard`)

---

## 1. Rimozione stato pubblicato/bozza

### `FeaturedContentDrawer.tsx`
- Rimuovi stato `status` e `setStatus`
- Rimuovi import `FeaturedContentStatus`
- Rimuovi `CheckboxInput` con label "Stato editoriale"
- In `contentData`, hardcoda `status: 'published'`

### `FeaturedContentDetailPage.tsx`
- Rimuovi Blocco 5 "Stato" (switch Pubblicato/Bozza) dal `renderInfoCard`
- Rimuovi badge `[Pubblicato|Bozza]` dall'header `PageHeader.actions`
- L'header mostra solo: `title` come titolo, `internal_name` come subtitle, nessuna targhetta

### `Highlights.tsx`
- Rimuovi colonna `status` dalla `columns` array
- Rimuovi stili `.statusPublished`, `.statusDraft` dal `.module.scss` (se non usati altrove)

### `featuredContents.ts`
- In `createFeaturedContent`: nessun cambiamento alla firma, ma il valore di default di `status` nel DB è già `'draft'`. Il chiamante (drawer) passa sempre `'published'` — questo è sufficiente. Non serve toccare la funzione service.

---

## 2. Rimozione etichette tipo

### `Highlights.tsx`
- Rimuovi stato `typeFilter` e `setTypeFilter`
- Rimuovi logica di filtering per tipo in `filteredContents` (mantieni solo il filtro per `searchQuery`)
- Rimuovi colonna `type` dalla `columns` array
- Rimuovi il `Select` tipo dal `advancedFilters` — se non rimane nulla in `advancedFilters`, rimuovi la prop `advancedFilters` da `FilterBar`
- Rimuovi stile `.typeBadge` dal `.module.scss` (se non usato altrove)
- Colonne finali: `TITOLO` (titolo + sottotitolo), `PRODOTTI` (#), `AZIONI`

### `FeaturedContentDetailPage.tsx`
- Rimuovi badge `[Editoriale|Con prodotti|Prezzo fisso]` dall'header `PageHeader.actions`
- Dopo rimozione di status E tipo: `PageHeader.actions` diventa `undefined` (rimuovi la prop)

---

## 3. Pattern read-only + drawer per Tab Informazioni

### Nuova struttura file

```
src/pages/Dashboard/Highlights/components/
├── FeaturedIdentityDrawer.tsx
├── FeaturedIdentityForm.tsx
├── FeaturedMediaDrawer.tsx          # nessun Form separato — logica upload interna al drawer
├── FeaturedPricingModeDrawer.tsx
├── FeaturedPricingModeForm.tsx
├── FeaturedCtaDrawer.tsx
└── FeaturedCtaForm.tsx
```

### `FeaturedContentDetailPage.tsx` — tab Informazioni

**Stato rimosso** (tutto lo stato di editing inline):
- `editTitle`, `editInternalName`, `editSubtitle`, `editDescription`
- `editPricingMode`, `editBundlePrice`, `editShowOriginalTotal`
- `editCtaText`, `editCtaUrl`, `editStatus`
- `isSavingInfo`
- `resolvedDraft`, `hasInfoChanges`, `ctaUrlError`
- `showModeChangeWarning`
- `linkedProductsCount` e `setLinkedProductsCount` (non più necessari: il warning è rimosso)
- `syncForm`
- `handleSaveInfo`

**Nota**: `editPricingMode` guidava la logica di empty-state del tab Prodotti (`editPricingMode === "none"`). Dopo il refactor, usare `content?.pricing_mode` (dato caricato dal server) come guardia: se `content?.pricing_mode === "none"` → mostra il messaggio informativo, altrimenti → mostra `ProductsManagerCard`.

**Stato aggiunto** (apertura drawer):
```typescript
const [isIdentityDrawerOpen, setIsIdentityDrawerOpen] = useState(false);
const [isMediaDrawerOpen, setIsMediaDrawerOpen] = useState(false);
const [isPricingDrawerOpen, setIsPricingDrawerOpen] = useState(false);
const [isCtaDrawerOpen, setIsCtaDrawerOpen] = useState(false);
```

**`mediaUrl`** rimane nello stato della pagina (usato anche per la preview read-only).
**`isUploadingMedia`**, `isDraggingMedia`, `mediaInputRef` si spostano dentro `FeaturedMediaDrawer`.

**`loadContent`** viene passato come `onSuccess` a tutti i drawer. Dopo ogni salvataggio: il form chiama `onSuccess()` → `loadContent()` → pagina ricarica `content` → drawer si chiude.

**Layout read-only** di `renderInfoCard()`:

```
Card
├── sezione Identità
│   ├── blockTitle "Identità"  +  Button ghost "Modifica" (Pencil icon) → setIsIdentityDrawerOpen(true)
│   ├── field: Titolo → content.title
│   ├── field: Nome interno → content.internal_name
│   ├── field: Sottotitolo → content.subtitle || "—"
│   └── field: Descrizione → content.description || "—"
│
├── sezione Immagine
│   ├── blockTitle "Immagine"  +  Button ghost "Modifica" → setIsMediaDrawerOpen(true)
│   └── preview img (se content.media_id) o placeholder "Nessuna immagine"
│
├── sezione Modalità contenuto
│   ├── blockTitle "Modalità contenuto"  +  Button ghost "Modifica" → setIsPricingDrawerOpen(true)
│   ├── label modalità (es. "Con prodotti — mostra prezzi singoli")
│   ├── se bundle: "Prezzo: €X.XX"
│   └── se bundle && show_original_total: "Mostra totale originale: Sì"
│
└── sezione Call to Action
    ├── blockTitle "Call to Action"  +  Button ghost "Modifica" → setIsCtaDrawerOpen(true)
    ├── se cta_text o cta_url: mostra i valori
    └── altrimenti: "Nessuna CTA configurata"
```

Rimuovi il `blockSaveBar` (pulsanti Annulla / Salva informazioni) dalla card.

### `FeaturedIdentityForm.tsx`

```typescript
type Props = {
    formId: string;
    entityData: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
    onSavingChange: (saving: boolean) => void;
};
```

Campi: `title` (required), `internal_name`, `subtitle`, `description`.
Al submit: chiama `updateFeaturedContent(entityData.id, tenantId, { title, internal_name, subtitle, description })`.
Toast success/error nel form. Chiama `onSuccess()` dopo il save.

### `FeaturedIdentityDrawer.tsx`

```typescript
type Props = {
    open: boolean;
    onClose: () => void;
    content: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
};
```

Struttura: `SystemDrawer (width=520) → DrawerLayout`.
Header: "Modifica identità".
Footer: Button "Annulla" (secondary, disabled se isSaving) + Button "Salva" (primary, type="submit", form=FORM_ID, loading=isSaving).
Body: `<FeaturedIdentityForm formId={FORM_ID} ... />`.

### `FeaturedPricingModeForm.tsx`

Campi: 3 card pricing_mode selezionabili + `bundle_price` (se bundle) + `show_original_total` switch (se bundle).
Validazione: se bundle e bundle_price ≤ 0 → toast error, no submit.
Al submit: `updateFeaturedContent(entityData.id, tenantId, { pricing_mode, bundle_price, show_original_total })`.

### `FeaturedPricingModeDrawer.tsx`

`SystemDrawer (width=560) → DrawerLayout`.
Header: "Modifica modalità contenuto".
Footer: Annulla + Salva.

### `FeaturedCtaForm.tsx`

Campi: `cta_text`, `cta_url`.
Validazione URL: se `cta_url` non vuoto e non inizia con `https://` → errore inline sul campo + no submit.
Al submit: `updateFeaturedContent(entityData.id, tenantId, { cta_text, cta_url })`.

### `FeaturedCtaDrawer.tsx`

`SystemDrawer (width=480) → DrawerLayout`.
Header: "Modifica call to action".
Footer: Annulla + Salva.

### `FeaturedMediaDrawer.tsx`

No form separato. Contiene direttamente la logica di upload (come l'attuale `handleMediaFile`).
Props: `{ open, onClose, content: FeaturedContent, tenantId, onSuccess }`.
Struttura interna:
- Se `content.media_id`: mostra preview + bottone "Rimuovi" (chiama `updateFeaturedContent({media_id: null})` → `onSuccess()`)
- Se no immagine: area drag-drop + input file nascosto
- Upload: `compressImage` → `uploadFeaturedContentImage` → `updateFeaturedContent({media_id: url})` → `onSuccess()` → chiudi drawer
- Footer: solo Button "Chiudi" (secondary)
- Stato locale: `isUploading`, `isDragging`

---

## 4. Pulizia tab Prodotti inclusi

### `ProductsManagerCard.tsx`

**Architettura**: da `initialProducts + draftProducts` a stato singolo `products`.

**Rimuovi**:
- `initialProducts`, `setInitialProducts`
- `draftProducts`, `setDraftProducts` → rinominare in `products`, `setProducts`
- `hasUnsavedChanges`, `areRowsEqual`
- `handleCancelChanges`
- `isSavingChanges` → rinominare in `isSaving`
- Pulsanti "Annulla" e "Salva" dall'header
- `cloneRows` (non più necessario)

**Mantieni**:
- `reindexRows`
- `normalizeNote`
- `isSaving` per disabilitare interazioni durante operazioni async

**Nuovi comportamenti**:

`handleDelete(dbId)`:
```
setIsSaving(true)
supabase.delete().eq('id', dbId)
await loadProducts()
setIsSaving(false)
toast success/error
```

`handleDragEnd(event)`:
```
calcola newOrder con arrayMove
setProducts(reindexed) // ottimistico
aggiorna sort_orders su DB (batch update)
// no reload (già aggiornato localmente)
```

`handleAddFromPicker(selectedProductIds)` (dopo "Applica" nel picker):
```
calcola toInsert (nuovi prodotti non ancora presenti)
calcola toRemove (prodotti presenti ma non nella nuova selezione)
esegui delete + insert in parallelo
await loadProducts()
toast success/error
```

`handleNoteBlur(dbId, note)`:
```
supabase.update({note: normalizeNote(note)}).eq('id', dbId)
// nessun reload — stato locale già corretto
toast success/error (solo in caso di errore)
```

**Header card**:
```
<Text>Prodotti inclusi</Text>
<Button variant="primary" onClick={handleOpenAddModal} disabled={isSaving}>
    + Aggiungi prodotto
</Button>
```

**Note column**: `TextInput` con `onBlur={e => handleNoteBlur(row.id, e.target.value)}` invece di `onChange` che aggiorna draft.

**Prop `onLinkedProductsCountChange`**: rimuovi dalla firma di `ProductsManagerCardProps` — era usata solo per aggiornare `linkedProductsCount` nella pagina padre, che ora non esiste più.

**Empty state**: invariato (messaggio + bottone "Aggiungi il primo prodotto" se pricing_mode ≠ 'none').

**Meccanismo product picker (inalterato)**:
Il product picker rimane controllato dal parent (`FeaturedContentDetailPage`). Il flusso è:
1. `ProductsManagerCard` chiama `onOpenProductPicker(currentLinkedIds, onApplyCallback)` → il parent apre il drawer del picker
2. L'utente seleziona e clicca "Applica" → il parent chiama `onApplyCallback(selectedIds)`
3. `onApplyCallback` è la funzione che ora esegue immediatamente il DB save (delete rimossi + insert aggiunti) e poi chiama `loadProducts()`

Questo è esattamente il pattern attuale: la differenza è che `onApply` ora scrive su DB immediatamente invece di aggiornare `draftProducts`. Il parent non cambia il suo meccanismo di apertura/chiusura del picker.

**Nota CLAUDE.md**: `ProductsManagerCard` chiama Supabase direttamente (violazione pre-esistente del service layer). Questa violazione non viene corretta in questo refactor — la spec si limita a non peggiorarla. Il refactor mantiene le chiamate dirette già presenti.

---

## 5. Highlights.module.scss

Rimuovi le classi non più usate dopo i cambiamenti sopra:
- `.typeBadge`
- `.statusPublished`
- `.statusDraft`

---

## Vincoli trasversali

- Tutti i testi in italiano
- SCSS Modules, no inline CSS (eccetto casi legacy in `ProductsManagerCard` e `FeaturedContentDrawer` — non peggiorare)
- Import alias `@/...`, no path relativi
- TypeScript strict, zero `any` (nei file nuovi)
- `useTenantId()` come source of truth per `tenantId`
- Toast nei catch di ogni operazione asincrona
- Reload dopo CRUD success (tramite `onSuccess` → `loadContent`)
- Submit button nei drawer footer collegato via `form={FORM_ID}`, mai dentro `<form>`

## Out of scope

- Migrazione inline styles legacy in `FeaturedContentDrawer` e `ProductsManagerCard` a SCSS Modules (pre-esistenti, da trattare in refactor separato)
- Spostamento chiamate Supabase dirette di `ProductsManagerCard` al service layer (pre-esistente, da trattare in refactor separato)
