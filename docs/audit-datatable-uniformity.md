# Audit uniformità DataTable — 2026-05-28

Audit read-only su tutte le 22 istanze del componente `DataTable` per identificare differenze residue di layout e comportamento dopo il refactor di unificazione. Particolare attenzione alla colonna azioni (kebab `TableRowActions`).

## 1. Componenti base

### DataTable (`src/components/ui/DataTable/DataTable.tsx` + `.module.scss`)

Default applicati alle righe e celle (dalle regole `.module.scss`):

- **`.table`**: `border: 1px solid var(--border)`, `border-radius: var(--radius-md, 12px)`, `overflow: hidden`, `background: var(--card-bg)`
- **`.header`**: `position: sticky; top: 0; z-index: 2`, `background: var(--hover-bg)`, `border-bottom: 1px solid var(--border)`
- **`.headerCell`**: `min-height: 44px`, `padding: 0 24px`, `font-size: 12px`, `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.04em`, `opacity: 0.72`
- **`.row`**: `display: grid`, `align-items: center`, `background: var(--card-bg)`, `border-bottom: 1px solid var(--border)`, `transition: background-color 0.18s ease`. Hover: `background: var(--hover-bg)` (uniforme, no lift)
- **`.rowClickable`**: aggiunge solo `cursor: pointer` (nessun cambio bg dedicato)
- **`.cell`**: `min-height: 56px`, `padding: 12px 24px`, `display: flex`, `align-items: center`. Allineamenti orizzontali via `.alignLeft|alignCenter|alignRight`
- **`.footer`**: `border-top: 1px solid var(--border)`, `background: var(--card-bg)`, footer adattivo (count + dropdown pageSize + frecce)

### TableRowActions (`src/components/ui/TableRowActions/TableRowActions.module.scss`)

- **`.trigger`**: `width: 32px; height: 32px`, `border-radius: var(--radius-md, 12px)`, `background: transparent`, `color: var(--color-gray-500)`, `transition: background-color 0.15s ease, color 0.15s ease`
- **`.trigger:hover`**: `background: color-mix(in srgb, var(--text) 10%, transparent)` (overlay scuro semi-trasparente), `color: var(--text)`

### Perché il background hover del kebab POTREBBE variare di dimensione

Il `.trigger` ha dimensioni **fisse 32×32 px** con `border-radius: 12px`. Nessuna variazione possibile sulla forma intrinseca del background hover.

Variazioni visive percepite possono derivare da:

1. **Wrapper `<div>` attorno a `<TableRowActions>`** con `display: flex` proprio: alcuni call site avvolgono il `<TableRowActions>` in un `<div className={styles.actionsCell}>` o `<div data-row-click-ignore="true">`. Il wrapper può:
   - imporre `align-items` o `justify-content` diversi dal default della `.cell`
   - introdurre `gap` (residuo di quando c'erano più icone affiancate)
   - alterare la posizione visiva del trigger 32×32 dentro la cella di larghezza 56px
2. **Padding cella** invariante (`12px 24px`) ma cella di larghezza 56px = content area effettiva = 8px. Il trigger 32px **straborda** rispetto al padding orizzontale: occupa 32px in un'area "ufficiale" di 8px. Il `display: flex; justify-content: flex-end` (dall'align `right`) lo spinge a destra → la bounding box del background hover sembra "uscire" rispetto al padding atteso.
3. **Card wrapper esterno** con `padding: 1.5rem` proprio: il DataTable è inset di 24px dentro la Card. Il trigger 32×32 finisce a 24+24=48px dal bordo Card. Visivamente identico tra istanze con Card ma **diverso** tra istanze con Card e senza Card.

## 2. Tabella comparativa completa (22 istanze in 20 file)

| # | Tabella (file) | Card / noHoverLift | maxHeight | Width azioni | Align azioni | Kebab wrapped? | Override SCSS | Note |
|---|---|---|---|---|---|---|---|---|
| 1 | ActivityGroupsSection | nessuna | default | 56px | right | nessuno | `.colName .description .createCta` (no cell/row) | DnD assente |
| 2 | ProductGroupsTab | nessuna | default | 56px | right | `<div data-row-click-ignore="true">` | nessuno | DataTable ha `pageSize` default 25 |
| 3 | ProductGroupCreateEditDrawer | nessuna (in drawer) | `calc(100dvh - 320px)` | (no col) | — | (picker, no kebab) | nessuno | Picker controllato |
| 4 | BusinessList | nessuna | default | 56px | right | **`<div className={styles.actionsCell} onClick={stopPropagation}>`** | `.actionsCell` con `display: flex; align-items: center; justify-content: flex-end; gap: 0.25rem` | **gap residuo di quando c'era IconButton+kebab** |
| 5 | ProductAttributesDrawer | nessuna (in drawer) | `calc(100dvh - 320px)` | (no col) | — | (picker, no kebab) | nessuno | Picker controllato |
| 6 | ProductGroupsEditDrawer | nessuna (in drawer) | `calc(100dvh - 320px)` | (no col) | — | (picker, no kebab) | nessuno | Picker controllato |
| 7 | Ingredients | nessuna | default | 56px | right | nessuno | nessuno | — |
| 8 | Styles | **`<Card className={tableCard} noHoverLift>`** | default | 56px | right | nessuno (via renderRowActions callback) | `.tableCard { background: transparent; box-shadow: none; border: none; padding: 0; }` | Card "trasparente" — di fatto annulla l'effetto Card. Pattern unico. |
| 9 | ActivityVisibilityContent | nessuna (in drawer) | default | (no col actions — Switch in colonna `visibility` width 100px) | right | (Switch inline, decisione UX) | `.tableWrapper { overflow: hidden; :global(.table-header){...} }` | `.tableWrapper :global(.table-header)` è **dead code** (DataTable usa `.header` non `.table-header`) |
| 10a | CatalogEngine (products) | nessuna (`<div className={tableCard}>`) | default | 56px | right | `<div data-row-click-ignore="true">` | `.tableCard` (div, non Card), `.rowNewlyAdded`, DnD via SortableDataTableRow | DnD + highlight |
| 10b | CatalogEngine (assignable picker) | nessuna | `calc(100dvh - 320px)` | 56px | right | `<div data-row-click-ignore="true">` | `.assignRowInheritedWrapper` (rowWrapper pattern) | Selezione esterna custom (eccezione documentata) |
| 11a | TeamPage (active members) | **`<Card noHoverLift>`** | default | 56px | right | **`<div className={styles.actionsCell} data-row-click-ignore="true">`** | `.actionsCell { display: flex; justify-content: flex-end }` | Wrapper ridondante (no-op funzionale) |
| 11b | TeamPage (pending invites) | **`<Card noHoverLift>`** | default | 56px | right | **`<div className={styles.actionsCell} data-row-click-ignore="true">`** | `.actionsCell` come sopra | Wrapper ridondante |
| 12 | Tables | nessuna | default | 56px | right | nessuno | nessuno | — |
| 13a | ProductsAttributesTab (platform read-only) | nessuna | default | (no col) | — | nessuno (no action col) | nessuno | Read-only |
| 13b | ProductsAttributesTab (tenant) | nessuna | default | 56px | right | nessuno | nessuno | — |
| 14 | Products | nessuna | default | 56px | right | nessuno | `.variantRowWrapper` (rowWrapper pattern semantico) | Eccezione documentata |
| 15a | PrezziOpzioniTab (variants) | nessuna | default | **80px** (non kebab) | right | (azione inline editing) | nessuno | Decisione UX: editing inline, NON kebab |
| 15b | PrezziOpzioniTab (option values) | nessuna | default | **80px** (non kebab) | right | (Button inline Save/Cancel/Edit/Delete) | `.cellStack` | Decisione UX: editing inline, NON kebab |
| 16 | AttributesTab (product detail) | nessuna | default | 56px | right | `<div data-row-click-ignore="true">` | nessuno | — |
| 17 | ProductsManagerCard | **`<Card noHoverLift>`** | default | 56px | right | nessuno | DnD via SortableDataTableRow, `.rowNewlyAdded` orfana (`see §5`) | DnD + highlight |
| 18 | ProductPickerList | nessuna (in drawer) | `calc(100dvh - 320px)` | (no col) | — | (picker, no kebab) | `<div className={tableWrap}>` wrapper esterno | Picker controllato |
| 19 | Catalogs | nessuna | default | 56px | right | nessuno | nessuno | — |
| 20 | Highlights | nessuna (`<div className={tableCard}>`) | default | 56px | right | nessuno | `<div className={tableCard}>` esterno | — |

## 3. Baseline de facto

La **maggioranza** (15 istanze su 22) ha questo pattern:

```
- Nessuna Card esterna (DataTable direttamente nel contenitore di pagina)
- maxHeight = default del componente ("calc(100dvh - 280px)")
- Action col: id "actions", header "", width "56px", align "right"
- Cella azioni: <TableRowActions> direttamente, senza wrapper <div>
- Nessun override SCSS locale che tocchi .row, .cell, .table o l'azione
```

Esempi di tabelle "pulite" (zero deviazioni): `Catalogs`, `Highlights`, `Tables`, `Ingredients`, `Products`, `ProductsAttributesTab tenant`, `ActivityGroupsSection`.

## 4. Deviazioni dalla baseline (raggruppate)

### 4.1 Wrapper attorno a `<TableRowActions>` — 6 istanze

Tipologie:

**A) `<div data-row-click-ignore="true">` (solo attributo, nessuna classe)** — 4 istanze:
- `ProductGroupsTab` (riga 229)
- `CatalogEngine` products + assignable (righe 1591, 1729 ca)
- `AttributesTab` (riga 383)

Effetto visivo: nessuno (`<div>` plain block che contiene il trigger inline). Il `data-row-click-ignore` previene click bubbling al `onRowClick` della riga.

**Necessità reale**: solo se la cella è interattiva (riga con `onRowClick`). Tra le 4, solo `CatalogEngine` ha onRowClick implicito? Verificato: nessuna delle 4 tabelle ha `onRowClick`. **Il wrapper è ridondante** (il `<TableRowActions>` interno usa già `<button>` che il DataTable salta nativamente).

**B) `<div className={styles.actionsCell} …>` con classe locale** — 2 istanze:

| Call site | CSS della classe | Effetto |
|-----------|-----------------|---------|
| `BusinessList.tsx:84` `.actionsCell` | `display: flex; align-items: center; justify-content: flex-end; gap: 0.25rem` | `gap: 0.25rem` residuo di quando c'erano IconButton + kebab affiancati; ora con solo kebab è no-op visivo |
| `TeamPage.tsx:306, 384` `.actionsCell` | `display: flex; justify-content: flex-end` | Ridondante: la cella ha già `align: right` (= `justify-content: flex-end` via `.alignRight`) |

**Effetto visivo**: il wrapper ha bounding box uguale al trigger 32×32, quindi background hover identico. Ma la **larghezza del wrapper** è `width: auto` = 32px (matches trigger), mentre la cella ha 56px width totale, padding 12 24 → content area 8px. Il `<div>` flex auto-size assorbe il trigger, anche se in pratica il visual netto non cambia.

### 4.2 Wrapper Card esterno — 4 istanze

| Call site | Card | noHoverLift | Effetto |
|-----------|------|-------------|---------|
| `Styles list` | `<Card className={tableCard} noHoverLift>` | sì | `.tableCard` rimuove background/border/shadow/padding della Card → Card "trasparente". DataTable appare come se non fosse in Card. **Pattern unico** |
| `TeamPage active` + `TeamPage invites` + `TeamPage selectedTenant placeholder` | `<Card noHoverLift>` (3×) | sì | Card normale con padding 1.5rem → DataTable inset 24px |
| `ProductsManagerCard` | `<Card noHoverLift>` | sì | Card normale con padding 1.5rem |

**Visual netto**: tabelle in TeamPage e ProductsManagerCard hanno **margine interno di 24px** rispetto al bordo Card. Le tabelle nude (Catalogs, Highlights, etc) non lo hanno. Il **trigger kebab in TeamPage/PMC è 24px più verso l'interno** rispetto al bordo del contenitore di pagina.

Styles è un caso ibrido: usa `<Card>` ma con `.tableCard` che annulla tutti gli effetti Card → visivamente è equivalente a "no Card".

### 4.3 maxHeight diverso — 5 istanze

Solo i picker drawer usano `maxHeight="calc(100dvh - 320px)"`:
- ProductGroupCreateEditDrawer
- ProductAttributesDrawer
- ProductGroupsEditDrawer
- CatalogEngine assignable
- ProductPickerList

Le altre usano il default `"calc(100dvh - 280px)"`. Differenza 40px in più di "ingombro fisso" assunto per il calcolo. Differenza voluta (drawer hanno header/footer aggiuntivi rispetto a pagine standard).

### 4.4 Wrapper div esterno alla DataTable

Alcune tabelle hanno wrapper `<div>` esterni che impattano layout/scroll:

- `ActivityVisibilityContent.tsx:252` → `<div className={tableWrapper}>` con `overflow: hidden` + `:global(.table-header)` sticky. **`:global(.table-header)` è dead code** (DataTable usa classe `.header`, non `.table-header`)
- `CatalogEngine.tsx:1857` → `<div className={tableCard}>` (NOT la classe `tableCard` di Styles; classe locale CatalogEngine)
- `Highlights.tsx:234` → `<div className={tableCard}>`
- `ProductPickerList.tsx:167` → `<div className={tableWrap}>` con `flex: 1 1 auto; min-height: 0` per flex parent

### 4.5 Pattern semantici `rowWrapper` (documentati come eccezioni)

- `Products` — `.variantRowWrapper` (variant background, display:contents)
- `CatalogEngine assignable` — `.assignRowInheritedWrapper` (inherited opacity, display:contents)
- `CatalogEngine products` + `ProductsManagerCard` — DnD via `SortableDataTableRow` condivisa

Già documentati in `docs/audit-datatable.md` sezione "Eccezioni note al pattern unificato". Non sono deviazioni da correggere.

### 4.6 Pattern inline preservati (documentati)

- `ActivityVisibilityContent` — Switch inline colonna `visibility` (width 100px)
- `PrezziOpzioniTab values` — Button inline Save/Cancel/Edit/Delete (width 80px)
- `PrezziOpzioniTab variants` — colonna actions width 80px con cell editing inline (`.cellStack`)

Già documentati. Non da correggere.

### 4.7 Classi SCSS orfane

Identificate via grep negativo (definite ma non più referenziate in TS):

| File | Classe orfana | Stato |
|------|--------------|-------|
| `CatalogEngine.module.scss:784` | `.rowNewlyAdded` | grep TS = 0 dopo migrazione a `highlightedRowIds`. Orfana confermata. |
| `Products.module.scss:91,95` | `.rowExpandable`, `.rowExpanded` | Pre-esistenti, mai riferite. Verificare se sono di un pattern futuro o veramente dead |
| `ProductGroupsTab.module.scss` | `.emptyIcon`, `.deleteIcon` | residue di pre-refactor empty state |
| `Styles.module.scss` | `.emptyState`, `.emptyIcon`, `.emptyButton` | DataTable empty ora gestita da EmptyState integrato — locali probabilmente orfane (le `.emptyState`/`.loadingState` di tableCard sono ancora referenziate dal `loadingState` JSX legacy lato Styles esterno alla DataTable) |
| `BusinessList.module.scss` | `.emptyState`, `.emptyIcon`, `.emptyButton`, `.nameCell` | Non più referenziate da BusinessList JSX (EmptyState integrato + cell render via colonne) |

### 4.8 Spaziatura / padding cell

Tutte le tabelle usano il default DataTable `.cell { padding: 12px 24px; min-height: 56px }`. Nessun override locale che modifichi padding cella o altezza riga in nessuno SCSS module dei 22 call site. **Uniforme.**

### 4.9 Allineamento verticale

Cella ha `display: flex; align-items: center` fisso. Nessun override. **Uniforme.**

### 4.10 Font cella

Nessun override font-family/font-size/font-weight a livello di `.row` o `.cell` in call site SCSS. **Uniforme** (lo styling testo è dentro le cell-callback delle colonne via `<Text variant="..." weight="...">`).

## 5. Causa del problema kebab (background dimensioni diverse)

Il trigger del kebab è **fisso a 32×32 px con border-radius 12px**. Il background hover **non può fisicamente avere dimensioni diverse** tra istanze.

**Probabili percezioni utente**:

1. **Card vs no-Card**: il trigger in TeamPage/ProductsManagerCard sta dentro una Card con padding 1.5rem. L'occhio percepisce il kebab "più stretto" perché è più distante dal bordo del contenitore di pagina rispetto a `Tables`/`Catalogs` (no Card). Il background hover stesso è 32×32 sempre, ma la sua **posizione relativa al bordo della pagina** varia. **Non è una variazione dimensionale, è una variazione posizionale.**

2. **Wrapper `<div>` con `display: flex; justify-content: flex-end`** (`BusinessList .actionsCell`, `TeamPage .actionsCell`): redundante (la cella ha già flex right via `.alignRight`), ma in alcuni browser potrebbe creare un layer di rendering aggiuntivo che modula leggermente la pixel-perfect alignment del background hover. Probabilità bassa, ma possibile.

3. **`gap: 0.25rem` in `BusinessList .actionsCell`**: residuo di quando c'erano 2 icone affiancate. Con 1 sola icona è no-op, ma se in futuro venisse aggiunta un'altra icona, comparirebbe spaziatura inattesa. Rumore di codice da rimuovere.

4. **Cell width 56px + padding 12 24 → content area 8px**: il trigger 32px straborda dal "content area ufficiale". Il `justify-content: flex-end` (`.alignRight`) lo spinge contro il bordo destro della cella inclusa di padding. Visivamente sembra che il background del trigger occupi più o meno spazio a seconda della relazione tra cell padding e width. Però l'effetto è **identico tra tutte le tabelle** (cell padding e width sono uniformi).

**Conclusione**: la variazione percepita NON è una variazione dimensionale del background, ma una variazione di **contesto visivo circostante** (presenza di Card padding, distanza dal bordo del viewport). Per uniformare DAVVERO, serve uniformare il context wrapper.

## 6. Proposta di uniformazione completa

Ordinate per priorità (prime quelle che risolvono il problema kebab percepito).

### Priorità 1 — Uniformare il context wrapper

**1.1 Decidere se DataTable va sempre o mai dentro `<Card>`**

Opzioni:
- **A) Mai Card**: rimuovere `<Card noHoverLift>` da `TeamPage` (3×), `ProductsManagerCard`, `Styles` (`tableCard` annulla già Card → coerente). Conseguenza: tabelle senza padding 1.5rem, trigger kebab più vicino al bordo pagina.
- **B) Sempre Card**: aggiungere `<Card noHoverLift>` ad `Ingredients`, `Catalogs`, `Highlights`, `Tables`, `BusinessList`, `ProductsAttributesTab`, `AttributesTab`, `ProductGroupsTab`, `Products`, `ActivityGroupsSection`, `CatalogEngine products`. Conseguenza: tutte le tabelle hanno padding 1.5rem.

Raccomandazione: **opzione A**. La Card aggiunge solo padding che potrebbe essere ottenuto altrettanto bene dal contenitore di pagina o lasciato a 0. Il pattern dominante (15/22) è già senza Card.

**Fix**: rimuovere `<Card noHoverLift>` da TeamPage + ProductsManagerCard + Styles (e relativi `.tableCard` orfani).

### Priorità 2 — Rimuovere wrapper inutili attorno a `<TableRowActions>`

I 6 wrapper attorno a `<TableRowActions>` sono ridondanti:

- 4× `<div data-row-click-ignore="true">` — il `<TableRowActions>` interno usa già `<button>` che il DataTable salta nativamente
- 2× `<div className={styles.actionsCell}>` con CSS no-op

**Fix**: rimuovere wrapper in:
- `ProductGroupsTab.tsx:229`
- `CatalogEngine.tsx:1591` (products)
- `CatalogEngine.tsx:1729` ca (assignable)
- `AttributesTab.tsx:383`
- `BusinessList.tsx:84` (+ rimuovere `styles.actionsCell` dal SCSS)
- `TeamPage.tsx:306, 384` (+ rimuovere `styles.actionsCell` dal SCSS)

Tutti dovrebbero diventare semplici `<TableRowActions actions={[...]}/>` diretto come fanno le 15 tabelle "pulite".

### Priorità 3 — Pulizia classi SCSS orfane

Rimuovere dai rispettivi `.module.scss`:

- `CatalogEngine.module.scss:784` `.rowNewlyAdded`
- `BusinessList.module.scss` `.actionsCell` (dopo aver rimosso il wrapper TSX)
- `TeamPage.module.scss:22` `.actionsCell` (dopo aver rimosso il wrapper TSX)
- `Products.module.scss` `.rowExpandable`, `.rowExpanded` (verificare prima)
- `BusinessList.module.scss` `.emptyState`, `.emptyIcon`, `.emptyButton`, `.nameCell` (verificare grep negativo)
- `ProductGroupsTab.module.scss` `.emptyIcon`, `.deleteIcon` (verificare grep)
- `Styles.module.scss` `.emptyState`, `.emptyIcon`, `.emptyButton`, `.loadingState` (verificare grep)
- `ActivityVisibilityContent.module.scss:83-89` `.tableWrapper :global(.table-header)` — dead code (la classe interna DataTable è `.header`, non `.table-header`)

### Priorità 4 — Allineare wrapper esterni DataTable

Wrapper `<div>` esterni di pagina (NOT Card) hanno semantiche diverse:
- `Styles tableCard` (Card trasparente)
- `CatalogEngine tableCard` (div locale)
- `Highlights tableCard` (div locale)
- `ProductPickerList tableWrap` (div locale flex)
- `ActivityVisibilityContent tableWrapper` (div locale con dead code)

Decidere se serve un wrapper standard o no. Probabilmente no, ma sono divergenze cosmetiche minori (non impattano la DataTable in sé).

### Priorità 5 — Documentazione

Aggiornare `docs/audit-datatable.md` con il pattern definitivo deciso: "Niente Card attorno al DataTable, niente wrapper attorno a `<TableRowActions>`. La DataTable è un atomo autosufficiente." E lista delle eccezioni residue.

### Cosa NON va toccato (decisioni già prese)

- Pattern `rowWrapper` semantici (Products variant, CatalogEngine inherited)
- Switch inline ActivityVisibility
- Button inline PrezziOpzioniTab values
- DnD via SortableDataTableRow (CatalogEngine, ProductsManagerCard)
- Selezione esterna custom CatalogEngine assignable

Tutti già documentati come eccezioni legittime.

---

## Stato finale post-fix (2026-05-28)

### Cella azioni
`<TableRowActions>` ora reso **diretto** in tutte le 16 colonne azioni del backoffice. Nessun `<div>` wrapper attorno al kebab. Il `data-row-click-ignore` non serve più perché `TableRowActions` usa internamente un `<button className={styles.trigger}>` che il DataTable salta nativamente.

Wrapper rimossi (6 + 1 in BusinessList = 7 totale):
- `BusinessList.tsx:83-126` — rimosso `<div className={styles.actionsCell} onClick={stopPropagation}>`
- `TeamPage.tsx:305-308` (active members) — rimosso `<div className={styles.actionsCell} data-row-click-ignore="true">`
- `TeamPage.tsx:379-383` (pending invites) — rimosso `<div className={styles.actionsCell} data-row-click-ignore="true">`
- `ProductGroupsTab.tsx:214-231` — rimosso `<div data-row-click-ignore="true">`
- `CatalogEngine.tsx:1588-1616` (products) — rimosso `<div data-row-click-ignore="true">`
- `CatalogEngine.tsx:1722-1752` (assignable) — rimosso `<div data-row-click-ignore="true">`
- `AttributesTab.tsx:382-393` — rimosso `<div data-row-click-ignore="true">`

### Classi SCSS rimosse (orfane confermate via grep TS = 0)

- `BusinessList.module.scss`: `.actionsCell`, `.emptyState`, `.emptyIcon`, `.emptyButton` (+ regola dark theme su `.emptyState`)
- `TeamPage.module.scss`: `.actionsCell`. `.emptyState` **NON rimossa** (ancora usata fuori DataTable per "Seleziona un'attività…" e "Nessun invito in attesa." fallback)
- `Products.module.scss`: `.rowExpandable`, `.rowExpanded`
- `Styles.module.scss`: `.emptyState`, `.emptyIcon`, `.emptyButton`. `.loadingState` **NON rimossa** (ancora usata in JSX `Styles.tsx:293`)
- `ProductGroupsTab.module.scss`: `.emptyState`, `.emptyIcon`. `.deleteIcon` **NON rimossa** (usata da `ProductGroupDeleteDrawer.tsx:83`)
- `ActivityVisibilityContent.module.scss`: rimosso dead code `:global(.table-header)` interno a `.tableWrapper`. `.tableWrapper` resta (referenziata)
- `CatalogEngine.module.scss`: `.rowNewlyAdded` **NON rimossa** — ancora usata in `CatalogEngine.tsx:1405` via `querySelector(`.${styles.rowNewlyAdded}`)` per scroll-to-row dopo aggiunta prodotto. Falso positivo nell'audit precedente.

### Note di scope
I **contenitori esterni** (`<Card>` o assenza di Card; wrapper di pagina `tableCard`/`tableWrap`/`tableWrapper`) NON sono uniformati: è una scelta per-pagina basata sul contesto (Card padding 24px aggiunge respiro visivo dove serve, viene omessa dove la tabella riempie già la viewport). Non è una deviazione da correggere.

Le **eccezioni documentate** (Switch ActivityVisibility, Button inline PrezziOpzioniTab values, `rowWrapper` semantici di Products variant e CatalogEngine inherited, selezione esterna CatalogEngine assignable) restano in-place — pattern intenzionali documentati in `docs/audit-datatable.md`.
