# Audit DataTable — 2026-05-26

## 1. Componente base

**Path**: `src/components/ui/DataTable/DataTable.tsx` (+ `DataTable.module.scss`)

### Firma TypeScript

```ts
export type ColumnDefinition<T> = {
    id: string;
    header: ReactNode;
    accessor?: (row: T) => any;
    cell?: (value: any, row: T, rowIndex: number, extra?: any) => ReactNode;
    width?: string;
    align?: "left" | "center" | "right";
    sortable?: boolean;
};

interface DataTableProps<T> {
    data: T[];
    columns: ColumnDefinition<T>[];
    isLoading?: boolean;
    emptyState?: ReactNode;
    pagination?: ReactNode;            // se passata, disabilita paginazione interna
    loadingState?: ReactNode;
    density?: "compact" | "extended";  // default: "compact"
    rowClassName?: (row: T, rowIndex: number) => string | undefined;
    onRowClick?: (row: T, rowIndex: number) => void;
    rowWrapper?: (row: ReactNode, rowData: T, rowIndex: number) => ReactNode;
    rowsPerPage?: number;              // default: 5
    selectable?: boolean;              // default: false
    onBulkDelete?: (selectedIds: string[]) => void;
    selectedRowIds?: string[];         // selezione controllata
    onSelectedRowsChange?: (selectedIds: string[]) => void;
    showSelectionBar?: boolean;        // default: true (mostra BulkBar fisso bottom)
}
```

### Comportamenti hardcoded

- `DEFAULT_ROWS_PER_PAGE = 5` — page size di default troppo basso per pagine business.
- `CHECKBOX_COLUMN_WIDTH = 48px` — fisso.
- Hover row: `background: var(--hover-bg)` con `transition: background-color 0.2s ease`.
- Header cell: `text-transform: uppercase`, `letter-spacing: 0.04em`, `opacity: 0.72`, `font-size: var(--text-caption, 12px)`.
- Cell padding: `24px` left/right fisso.
- Row height: `min-height: 56px` compact / `72px` extended.
- Footer/paginazione interna: chevron icon-only, no selettore page-size.
- `onRowClick` ignora automaticamente click su `button, a, input, select, textarea, [role="menuitem"], [data-row-click-ignore="true"]`.
- Selezione si **resetta automaticamente** al cambio di `data` e al cambio pagina (solo in modalità uncontrolled).
- Header sort: `sortable` aggiunge la classe `.sortable` ma **non implementa logica di ordinamento** (cursor default, nessun handler).
- `BulkBar` rendered fuori dal `<div className={styles.table}>` come sibling — animazione `bulkBarIn` 0.18s ease.

### Sub-componenti interni

- `DataTableRow<T>` — riga (definita inline nello stesso file, non esportata).

Nessun sub-componente esportato (no `DataTable.Header`, `DataTable.Row`, ecc.).

### Sub-componenti adiacenti usati dai call site

- `TableRowActions` (`src/components/ui/TableRowActions/TableRowActions.tsx`) — wrapper Radix DropdownMenu (kebab `MoreHorizontal`). API: `actions: TableRowAction[]` con `{ label, icon?, onClick?, variant?: "destructive", separator?, hidden? }`.
- `TablePagination` (`src/components/ui/TablePagination/TablePagination.tsx`) — paginazione esterna con selettore page size. `PAGE_SIZE_OPTIONS = [20, 50, 100]`. Usata via prop `pagination={<TablePagination …/>}`.
- `BulkBar` (`src/components/ui/BulkBar/BulkBar`) — usato internamente da `DataTable` quando `selectable && showSelectionBar`.

---

## 2. Tabella riassuntiva dei call site

22 istanze in 20 file (alcuni file contengono 2 DataTable).

| # | Pagina | Route | Click riga | Col. azioni | Paginazione | Anim. | Override SCSS | Bulk |
|---|--------|-------|------------|-------------|-------------|-------|---------------|------|
| 1 | ActivityGroupsSection | `/business/:businessId/locations` (embed) | no | kebab edit+delete | 5 default | no | sì (`.highlighted`) | sì |
| 2 | ProductGroupsTab | `/business/:businessId/products?tab=groups` | no | kebab | esterna `TablePagination` (20/50/100) | no | no | sì |
| 3 | ProductGroupCreateEditDrawer | drawer | no | no | 5 default | no | no | controllata (no bar) |
| 4 | BusinessList | `/business/:businessId/locations` | navigate | kebab (con `.actionsCell` wrap) | 5 default | no | sì (`.actionsCell`) | sì |
| 5 | ProductAttributesDrawer | drawer | no | inline `IconTrash` (custom, no kebab) | 5 default | no | (drawer custom) | controllata (no bar) |
| 6 | ProductGroupsEditDrawer | drawer | no | no | 100 fixed | no | no | controllata (no bar) |
| 7 | Ingredients | `/business/:businessId/products?tab=ingredients` | no | kebab edit+delete | 5 default | no | no | sì (controllata) |
| 8 | Styles | `/business/:businessId/styles` | name=button | kebab (renderRowActions) | 5 default | no | sì (`.rowLink .colName .styleNameRow .systemIcon`) | sì |
| 9 | ActivityVisibilityContent | drawer (in activity detail) | no | no (Switch inline) | 5 default | no | sì (`.rowSaving`) | no |
| 10a | CatalogEngine (products in category) | `/business/:businessId/catalogs/:id` | no | kebab via `DropdownMenu` custom | 20 fixed | DnD `@dnd-kit` (SortableProductRow) | sì (`.assignActionsBtn .rowNewlyAdded`) | sì |
| 10b | CatalogEngine (assignable picker) | stessa route | no | kebab via `DropdownMenu` custom | 8 fixed | no | sì (`.assignRowInherited`) | controllata (no bar) |
| 11a | TeamPage (active members) | `/business/:businessId/team` | no | kebab (condizionale `isAdmin`) | 5 default | no | sì (`.actionsCell .emptyState`) | no |
| 11b | TeamPage (pending invites) | stessa route | no | kebab (condizionale `isAdmin`) | 5 default | no | sì (`.actionsCell .emptyState`) | no |
| 12 | Tables | `/business/:businessId/tables` | no | kebab | 5 default | no | (nessuno) | no |
| 13a | ProductsAttributesTab (tenant) | `/business/:businessId/products?tab=attributes` | no | kebab edit+delete | 5 default | no | no | sì |
| 13b | ProductsAttributesTab (platform) | stessa route | no | no | 5 default | no | no | no |
| 14 | Products | `/business/:businessId/products` | no | kebab (4 azioni) | 5 default | no | sì (`.variantTableRow`) | sì |
| 15a | PrezziOpzioniTab (variants) | `/business/:businessId/products/:productId?tab=prezzi` | **navigate** | no | 5 default | no | no | no |
| 15b | PrezziOpzioniTab (option values) | stessa route | no | inline Buttons (Save/Cancel/Edit/Delete) | 5 default | no | sì (`.formatActions`) | no |
| 16 | AttributesTab | `/business/:businessId/products/:productId?tab=attributi` | no | kebab solo `Rimuovi` | 5 default | no | no | sì (controllata) |
| 17 | ProductsManagerCard | `/business/:businessId/featured/:featuredId` | no | kebab | 5 default | DnD `@dnd-kit` (SortableDataTableRow) | sì (`.rowNewlyAdded`) | no |
| 18 | ProductPickerList | dentro FeaturedContentDetailPage | no | no | 8 fixed | no | (modulo dedicato) | controllata (no bar) |
| 19 | Catalogs | `/business/:businessId/catalogs` | navigate | kebab edit+delete | 5 default | no | (loadingState) | sì |
| 20 | Highlights | `/business/:businessId/featured` | navigate | kebab edit+delete | 5 default | no | no | sì |

---

## 3. Dettaglio per call site

### 1. ActivityGroupsSection — `src/components/Businesses/ActivityGroupsSection/ActivityGroupsSection.tsx`
- Route: embed in `Businesses` page (`/business/:businessId/locations`, `src/pages/Dashboard/Businesses/Businesses.tsx:910`).
- Props: `data={filteredGroups}`, `columns`, `selectable`, `onBulkDelete`, `rowClassName`.
- Click riga: assente.
- Colonna azioni: kebab `TableRowActions` width `64px`, azioni `Modifica` / `Elimina` (destructive, `hidden: group.is_system`) — `ActivityGroupsSection.tsx:168-188`.
- Paginazione: default 5 interna.
- Animazioni: nessuna.
- Override SCSS: `rowClassName={group => highlightedGroupIds.includes(group.id) ? styles.highlighted : undefined}` — classe locale per highlight transitorio post-crea.
- Note: trigger `window.addEventListener("open-group-drawer", …)` per apertura drawer da fuori — pattern non standard.

### 2. ProductGroupsTab — `src/components/Products/ProductGroupsTab/ProductGroupsTab.tsx`
- Route: tab dentro `/business/:businessId/products`.
- Props: `data={paginatedRows}`, `columns`, `isLoading`, `selectable`, `onBulkDelete`, `emptyState`, `loadingState`, `pagination={<TablePagination …/>}`.
- Click riga: assente.
- Colonna azioni: kebab `TableRowActions` (riferimento `:224-230`).
- Paginazione: **esterna** via `TablePagination` con `DEFAULT_PAGE_SIZE = 20` e dropdown `[20, 50, 100]` (`:57, :79`). Unico call site con paginazione esterna configurabile.
- Animazioni: nessuna.
- Override SCSS: nessuno.

### 3. ProductGroupCreateEditDrawer — `src/components/Products/ProductGroupsTab/ProductGroupCreateEditDrawer.tsx`
- Route: drawer.
- Props: `data={filteredProducts}`, `columns={pickerColumns}`, `isLoading`, `selectable`, `selectedRowIds`, `onSelectedRowsChange` (controllata), `showSelectionBar={false}`, `density="compact"`, `emptyState`, `loadingState`.
- Click riga: assente.
- Colonna azioni: assente (picker).
- Paginazione: default 5.
- Animazioni: nessuna.
- Override SCSS: nessuno diretto sul DataTable; modulo ha sezione `// ── Product picker (DataTable in drawer) ───────────` con `.pickerSection`, `.pickerHeader`, `.pickerThumb` (wrap esterno).

### 4. BusinessList — `src/components/Businesses/BusinessList/BusinessList.tsx`
- Route: `/business/:businessId/locations`.
- Props: `data={businesses}`, `columns`, `selectable`, `onBulkDelete`, `onRowClick={business => navigate(\`/business/${businessId}/locations/${business.id}\`)}` (`:173`).
- Click riga: **navigate** al detail sede.
- Colonna azioni: kebab `TableRowActions` width `100px`, wrap `<div className={styles.actionsCell} onClick={e => e.stopPropagation()}>` (`:97`). Include link copy + view in altre colonne con `width="100px"`.
- Paginazione: default 5.
- Animazioni: nessuna.
- Override SCSS: `.actionsCell` wrap.

### 5. ProductAttributesDrawer — `src/pages/Dashboard/Products/ProductAttributesDrawer.tsx`
- Route: drawer.
- Props: `data={definitions}`, `columns`, `selectable`, `showSelectionBar={false}`, `selectedRowIds`, `onSelectedRowsChange`, `density="compact"`.
- Click riga: assente.
- Colonna azioni: presenta un **`IconTrash` inline custom** dentro un `<div>` con padding/style inline anziché `TableRowActions` (`:320-360` ca, `IconTrash size={16}`). Pattern fuori-standard rispetto al resto del codice.
- Paginazione: default 5.
- Animazioni: nessuna.
- Override SCSS: nessuno (style inline).
- Note: l'IconTrash non passa per il kebab — divergenza UX rispetto agli altri call site.

### 6. ProductGroupsEditDrawer — `src/pages/Dashboard/Products/ProductGroupsEditDrawer.tsx`
- Route: drawer.
- Props: `data={filteredGroups}`, `columns`, `selectable`, `showSelectionBar={false}`, `selectedRowIds`, `onSelectedRowsChange`, `density="compact"`, `emptyState`, `rowsPerPage={100}`.
- Click riga: assente.
- Colonna azioni: assente.
- Paginazione: `rowsPerPage=100` (di fatto disattivata se < 100 elementi).
- Animazioni: nessuna.
- Override SCSS: nessuno.

### 7. Ingredients — `src/pages/Dashboard/Products/Ingredients/Ingredients.tsx`
- Route: tab `/business/:businessId/products?tab=ingredients` (embed nel container Products).
- Props: `data={filteredIngredients}`, `columns`, `isLoading`, `selectable`, `selectedRowIds`, `onSelectedRowsChange` (controllata), `onBulkDelete`, `loadingState`, `emptyState`.
- Click riga: assente.
- Colonna azioni: kebab `TableRowActions` width `72px`, azioni `Modifica` / `Elimina` (destructive, separator).
- Paginazione: default 5.
- Animazioni: nessuna.
- Override SCSS: nessuno.

### 8. Styles — `src/pages/Dashboard/Styles/Styles.tsx`
- Route: `/business/:businessId/styles`.
- Props: `data={filteredStyles}`, `columns`, `selectable`, `onBulkDelete`, `emptyState`.
- Click riga: **non** tramite `onRowClick`; la cella `name` è un `<button className={styles.rowLink} onClick={() => handleEditClick(style)}>` (`:225 ca`). Pattern unico nel codebase.
- Colonna azioni: kebab via `renderRowActions(style)` callback (`:224-296`), width `72px`.
- Paginazione: default 5.
- Animazioni: nessuna.
- Override SCSS: `.rowLink`, `.colName`, `.styleNameRow`, `.systemIcon`, `.loadingState` (multipli — colonna name custom).
- Note: la riga non è visivamente cliccabile (no `rowClickable`), ma il `name` è interattivo via button — disallineato con BusinessList/Highlights/Catalogs che usano `onRowClick`.

### 9. ActivityVisibilityContent — `src/pages/Operativita/Attivita/components/ActivityVisibilityDrawer/ActivityVisibilityContent.tsx`
- Route: drawer in `/business/:businessId/locations/:activityId`.
- Props: `data={filtered}`, `columns`, `rowClassName`.
- Click riga: assente.
- Colonna azioni: nessuna colonna `id:"actions"`. Ultima colonna è uno `<Switch>` (visibility toggle) dentro `<div onClick={e => e.stopPropagation()}>`.
- Paginazione: default 5.
- Animazioni: nessuna.
- Override SCSS: `rowClassName={p => savingId === p.product_id ? styles.rowSaving : undefined}` — feedback save in corso.

### 10. CatalogEngine — `src/pages/Dashboard/Catalogs/CatalogEngine.tsx`
Due DataTable nello stesso file.

**10a (`:1911-1936`) — products in category**
- Route: `/business/:businessId/catalogs/:id`.
- Props: `data={visibleRows}`, `columns`, `rowsPerPage={20}`, `selectable`, `onBulkDelete`, `emptyState`, `rowClassName` (highlight newlyAdded), `rowWrapper` (DnD `SortableProductRow`).
- Click riga: assente.
- Colonna azioni: width `44px`, **non** usa `TableRowActions` ma `<DropdownMenu trigger={…IconDotsVertical…}>` custom (`:1619-1645`).
- Paginazione: `rowsPerPage=20` interna.
- Animazioni: **DnD via `@dnd-kit`** (SortableProductRow definita `:270-275`).
- Override SCSS: `.assignActionsBtn`, `.rowNewlyAdded`.

**10b (`:2304-2330`) — assignable products picker**
- Route: stessa.
- Props: `data={assignableProducts}`, `columns={assignColumns}`, `emptyState`, `rowsPerPage={8}`, `rowClassName` (inherited), `showSelectionBar={false}` (ma `selectable` non passato esplicitamente — selezione gestita via stato locale `assignSelectedIds` esterno, NON via prop `selectedRowIds`).
- Click riga: assente.
- Colonna azioni: width `44px`, `<DropdownMenu>` custom (stesso pattern di 10a).
- Paginazione: `rowsPerPage=8`.
- Animazioni: nessuna.
- Override SCSS: `.assignRowInherited`.
- Note: la selezione è gestita fuori dal componente (checkbox header custom `:1662-1689`) — non usa il `selectable` integrato. Divergenza.

### 11. TeamPage — `src/pages/Business/TeamPage.tsx`
Due DataTable.

**11a — Active members (`:386-394`)**
- Route: `/business/:businessId/team` (`App.tsx:235`).
- Props: `data={filteredActiveMembers}`, `columns={activeColumns}`, `isLoading`, `emptyState`, `loadingState`, `density="extended"`.
- Click riga: assente.
- Colonna azioni: kebab `TableRowActions` width `56px`, presente **solo se** `isAdmin`. Azioni: `Cambia ruolo` (`UserCog`), `Rimuovi membro` (`UserMinus`, destructive). Skippato per row owner.
- Paginazione: default 5.
- Animazioni: nessuna.
- Override SCSS: `.actionsCell` (`data-row-click-ignore="true"`), `.emptyState`.

**11b — Pending invites (`:409-423`)**
- Props: `data={filteredPendingInvites}`, `columns={pendingColumns}`, `isLoading`, `emptyState`, `loadingState`, `density="compact"`.
- Click riga: assente.
- Colonna azioni: kebab width `56px` solo se `isAdmin`. Azioni: `Rinvia invito` (`Send`), `Annulla invito` (`X`, destructive).
- Paginazione: default 5.
- Animazioni: nessuna.
- Override SCSS: `.actionsCell`, `.emptyState`.
- Note: **incoerenza density** sullo stesso file: una `extended`, l'altra `compact`.

### 12. Tables — `src/pages/Dashboard/Tables/Tables.tsx`
- Route: `/business/:businessId/tables`.
- Props: `data={filteredItems}`, `columns`, `density="compact"`, `isLoading`.
- Click riga: assente.
- Colonna azioni: kebab `TableRowActions` width `60px`, contiene almeno `Modifica`, `Genera QR` (con stato `Generazione…`).
- Paginazione: default 5.
- Animazioni: nessuna.
- Override SCSS: nessuno locale per DataTable.

### 13. ProductsAttributesTab — `src/pages/Dashboard/Products/ProductsAttributesTab.tsx`
Due DataTable.

**13a — tenant attributes**
- Route: `/business/:businessId/products?tab=attributes`.
- Props: `data={tenantAttrs}`, `columns={tenantColumns}`, `isLoading`, `selectable`, `onBulkDelete`, `loadingState`, `emptyState`.
- Click riga: assente.
- Colonna azioni: kebab `TableRowActions` width `72px`, azioni `Modifica` / `Elimina` (destructive separator).
- Paginazione: default 5.
- Animazioni: nessuna.
- Override SCSS: nessuno.

**13b — platform attributes (read-only)**
- Props: `data={platformAttrs}`, `columns={platformColumns}`, `isLoading`, `loadingState`, `emptyState={<></>}`.
- Click riga: assente.
- Colonna azioni: assente.
- Paginazione: default 5.
- Animazioni: nessuna.

### 14. Products — `src/pages/Dashboard/Products/Products.tsx`
- Route: `/business/:businessId/products`.
- Props: `data={tableRows}`, `columns`, `density="compact"`, `selectable`, `onBulkDelete`, `rowClassName`.
- Click riga: assente (anche se Products è la pagina lista più "naturale" per navigate — divergenza).
- Colonna azioni: kebab `TableRowActions` width `96px` con **4 azioni**: `Modifica Prodotto`/`Modifica Variante`, `Aggiungi Variante` (hidden se variant), `Duplica` (separator), `Elimina` (destructive).
- Paginazione: default 5.
- Animazioni: nessuna.
- Override SCSS: `rowClassName={row => row.kind === "variant" ? styles.variantTableRow : undefined}` — distingue righe variante.

### 15. PrezziOpzioniTab — `src/pages/Dashboard/Products/PrezziOpzioniTab.tsx`
Due DataTable.

**15a — Variants (`:638-660`)**
- Route: `/business/:businessId/products/:productId?tab=prezzi`.
- Props: `data={variants}`, `columns={variantColumns}`, `density="compact"`, `onRowClick={variant => navigate(\`/business/${businessId}/products/${variant.id}\`)}`.
- Click riga: **navigate** al detail variante.
- Colonna azioni: presente ma vuota/altro contenuto (id `actions`, width `80px` — è la cella editing inline?). Verifica `:653-680`.
- Paginazione: default 5.
- Animazioni: nessuna.
- Override SCSS: nessuno.

**15b — Option values (`:730-770`)**
- Props: `data={group.values}`, `columns={valueColumns}`, `density="compact"`, `emptyState`.
- Click riga: assente.
- Colonna azioni: width `80px` con **inline Buttons custom** (`Save`/`Cancel`/`Edit`/`Delete` come `<Button variant=… size="sm">`) — NO `TableRowActions`. Pattern unico nel codebase.
- Paginazione: default 5.
- Override SCSS: `.formatActions` wrap dei pulsanti inline.

### 16. AttributesTab (product detail) — `src/pages/Dashboard/Products/AttributesTab.tsx`
- Route: `/business/:businessId/products/:productId?tab=attributi`.
- Props: `data={linkedDefinitions}`, `columns`, `density="compact"`, `selectable`, `selectedRowIds`, `onSelectedRowsChange`, `onBulkDelete`. NO `showSelectionBar={false}` esplicito → BulkBar attivo.
- Click riga: assente.
- Colonna azioni: kebab `TableRowActions` width `64px`, **una sola azione** `Rimuovi attributo` (destructive). Wrap `<div data-row-click-ignore="true">`.
- Paginazione: default 5.
- Animazioni: nessuna.
- Override SCSS: nessuno.

### 17. ProductsManagerCard — `src/pages/Dashboard/Highlights/ProductsManagerCard.tsx`
- Route: `/business/:businessId/featured/:featuredId` (embed in `FeaturedContentDetailPage`).
- Props: `data={products}`, `columns`, `emptyState`, `rowWrapper={(row, rowData) => <SortableDataTableRow id={rowData.id}>{row}</SortableDataTableRow>}`.
- Click riga: assente.
- Colonna azioni: kebab `TableRowActions` width `72px` con almeno `Modifica` (`Pencil`).
- Paginazione: default 5.
- Animazioni: **DnD via `@dnd-kit`** (`SortableDataTableRow` `:51-58`).
- Override SCSS: `.rowNewlyAdded` (highlight transitorio).

### 18. ProductPickerList — `src/pages/Dashboard/Highlights/ProductPickerList.tsx`
- Route: usato in `FeaturedContentDetailPage.tsx:469` (drawer/picker).
- Props: `data={…}`, `columns`, `rowsPerPage={8}`, `selectable`, plus props della pagina.
- Click riga: assente.
- Colonna azioni: assente (picker).
- Paginazione: `rowsPerPage=8`.
- Animazioni: nessuna.
- Override SCSS: modulo dedicato `ProductPickerList.module.scss`.

### 19. Catalogs — `src/pages/Dashboard/Catalogs/Catalogs.tsx`
- Route: `/business/:businessId/catalogs`.
- Props: `data={filteredCatalogs}`, `columns`, `density="compact"`, `selectable`, `onBulkDelete`, `onRowClick={catalog => navigate(\`/business/${currentTenantId}/catalogs/${catalog.id}\`)}`.
- Click riga: **navigate** al detail.
- Colonna azioni: kebab `TableRowActions` width `60px` con `Modifica nome`, `Elimina ${catalogLower}` (destructive separator).
- Paginazione: default 5.
- Animazioni: nessuna.
- Override SCSS: `.loadingState`.

### 20. Highlights — `src/pages/Dashboard/Highlights/Highlights.tsx`
- Route: `/business/:businessId/featured`.
- Props: `data={filteredContents}`, `columns`, `density="compact"`, `selectable`, `onBulkDelete`, `onRowClick={item => navigate(\`/business/${tenantId}/featured/${item.id}\`)}`.
- Click riga: **navigate** al detail featured.
- Colonna azioni: kebab `TableRowActions` width `96px`, header `"Azioni"` (gli altri call site usano header `""`), azioni `Modifica` (`Pencil`) / `Elimina` (`Trash2`, destructive separator).
- Paginazione: default 5.
- Animazioni: nessuna.
- Override SCSS: nessuno.
- Note: unica con header colonna azioni testuale (`"Azioni"`).

---

## 4. Incoerenze emerse

### 4.1 Click sulla riga
- **Navigate al detail**: 4 call site (`BusinessList`, `Catalogs`, `Highlights`, `PrezziOpzioniTab` variants) usano `onRowClick → navigate(…)`.
- **Nessuna azione su riga**: 16 call site lasciano la riga non interattiva pur essendo lista di entità navigabili (es. `Products`, `Styles`, `Tables`, `ActivityGroupsSection`).
- **Click custom non standard**: `Styles` usa un `<button>` dentro la cella `name` per aprire l'edit drawer invece di `onRowClick`.

### 4.2 Colonna azioni
- **Kebab `TableRowActions`**: 13 call site (pattern dominante).
- **`DropdownMenu` custom** (non `TableRowActions`): CatalogEngine 10a + 10b.
- **Inline `IconTrash`** (no kebab, no dropdown): `ProductAttributesDrawer`.
- **Inline `<Button>` Save/Cancel/Edit/Delete**: `PrezziOpzioniTab` option values.
- **Switch inline (no col actions)**: `ActivityVisibilityContent`.
- **Nessuna colonna azioni**: `ProductGroupCreateEditDrawer`, `ProductGroupsEditDrawer`, `ProductPickerList`, `ProductsAttributesTab` platform read-only.
- **Width incoerente**: 44px (CatalogEngine), 56px (TeamPage), 60px (Catalogs, Tables), 64px (ActivityGroupsSection, AttributesTab), 72px (Ingredients, Styles, ProductsAttributesTab, ProductsManagerCard), 80px (PrezziOpzioniTab), 96px (Highlights, Products), 100px (BusinessList).
- **Header label**: `""` ovunque tranne `Highlights` (`"Azioni"`) e `Products` (`"Azioni"`).

### 4.3 Paginazione
- **Default 5 hardcoded**: 14 call site (la maggioranza usa il `DEFAULT_ROWS_PER_PAGE` del componente).
- **`rowsPerPage={8}`**: 2 call site (CatalogEngine assignable picker, ProductPickerList).
- **`rowsPerPage={20}`**: 1 call site (CatalogEngine products).
- **`rowsPerPage={100}`**: 1 call site (ProductGroupsEditDrawer — di fatto disattiva paginazione).
- **Paginazione esterna `TablePagination` con dropdown [20,50,100]**: solo `ProductGroupsTab`. Unico call site con page size configurabile dall'utente.

### 4.4 Animazioni
- **`@dnd-kit` SortableRow via `rowWrapper`**: 2 call site (`CatalogEngine` products, `ProductsManagerCard`). Implementazioni quasi identiche ma duplicate (`SortableProductRow` vs `SortableDataTableRow`).
- **Framer Motion su righe**: nessuno.
- **Hover transition CSS**: incluso nel componente base (`background-color 0.2s ease`).
- **BulkBar entry animation**: `bulkBarIn` keyframe nel modulo del DataTable.
- **`rowClassName` per highlight transitorio**: 3 call site (`ActivityGroupsSection.highlighted`, `CatalogEngine.rowNewlyAdded`, `ProductsManagerCard.rowNewlyAdded`, `ActivityVisibilityContent.rowSaving`, `Products.variantTableRow`).

### 4.5 Override SCSS più frequenti (top 5)
1. **`.actionsCell`** — wrap della cella azioni con `stopPropagation` e `data-row-click-ignore` (BusinessList, TeamPage). 2 call site.
2. **`.rowNewlyAdded` / `.highlighted` / `.rowSaving`** — pattern highlight transitorio via `rowClassName` (ActivityGroupsSection, CatalogEngine, ProductsManagerCard, ActivityVisibilityContent). 4 call site varianti.
3. **`.loadingState` / `.emptyState`** — wrap del contenuto degli state (Styles, Catalogs, TeamPage). 3 call site.
4. **Classi colonna `name` custom** (`.rowLink .colName .styleNameRow .systemIcon`) — Styles (unico).
5. **Classi `.assignActionsBtn .assignRowInherited`** — CatalogEngine assignable picker (uniche).

Nessun call site usa selettori `:global(.DataTable_…)` o `[class*="DataTable_"]` per overridare le classi interne del componente — gli override sono sempre via `rowClassName` o wrapper esterno.

### 4.6 Density
- `compact` (default o esplicito): 14+ call site.
- `extended`: solo TeamPage active members.
- **Incoerenza intra-file**: TeamPage usa `extended` per active members e `compact` per pending invites.

### 4.7 Selezione bulk
- **Bulk delete attivo (`onBulkDelete` + bar)**: 9 call site.
- **Selezione controllata senza bar (`showSelectionBar={false}`)**: 4 call site (drawer/picker: ProductGroupCreateEditDrawer, ProductAttributesDrawer, ProductGroupsEditDrawer, CatalogEngine assignable).
- **Nessuna selezione**: 7 call site.
- **Selezione gestita esternamente al componente** (non via prop `selectable`): CatalogEngine assignable picker — pattern divergente.

### 4.8 Altre incoerenze
- `sortable: true` accettato dalla colonna ma **non implementa logica di sort**: nessun call site ne fa uso, ma la prop è esposta.
- `width` colonne dichiarata in **modi misti**: pixel fissi (`"60px"`), `fr` (`"1.4fr"`), o omessa (default `minmax(0, 1fr)`).
- `IconDotsVertical` (CatalogEngine custom) vs `MoreHorizontal` (TableRowActions): icone kebab diverse per lo stesso pattern visivo.

---

## 5. Domande di decisione per il refactor

Decisioni da prendere prima di iniziare l'unificazione. NON proporre risposte.

### Comportamento riga
1. Il click sulla riga deve essere comportamento **di default** (sempre presente per liste navigabili) o **opt-in** via prop esplicita?
2. Il pattern `Styles` (button dentro cella name) va eliminato a favore di `onRowClick` standardizzato?
3. Se la riga è cliccabile, l'indicatore visivo (cursor pointer, hover stronger) deve cambiare in modo più riconoscibile?

### Paginazione
4. Page size **default**: 10, 20, 25, 50?
5. Il selettore page size dropdown (oggi solo in `TablePagination` di `ProductGroupsTab`) deve diventare default per tutte le tabelle di lista?
6. Per tabelle "picker" in drawer (`rowsPerPage=8` o `=100`), paginazione deve essere disattivata o conservata?
7. Mantenere due implementazioni di paginazione (interna `DataTable` vs esterna `TablePagination`) o consolidare in una sola?

### Colonna azioni
8. La colonna azioni deve essere sempre presente come kebab (`TableRowActions`) o configurabile?
9. Width della colonna azioni standardizzato (es. fisso 56px)?
10. Header colonna azioni: sempre vuoto o sempre `"Azioni"`?
11. `CatalogEngine` deve passare a `TableRowActions` o restare con `DropdownMenu` custom (IconDotsVertical)?
12. `ProductAttributesDrawer` (IconTrash inline) e `PrezziOpzioniTab` values (Buttons inline) vanno uniformati al kebab o sono pattern legittimi di editing inline?

### Selezione bulk
13. `selectable` deve restare opt-in o diventare default per le tabelle "lista"?
14. `BulkBar` deve restare un componente del DataTable o essere estratto come pattern globale (oggi rendered come sibling)?
15. Pattern "selezione gestita esternamente" (CatalogEngine assignable) va supportato come prop API o eliminato?

### Density
16. Conservare `compact` + `extended` o ridurre a una sola? Se due, in quali casi `extended` ha senso? La singola occorrenza (TeamPage) è motivata?

### Animazioni
17. Hover transition (oggi `0.2s`) corretta o da rimuovere per performance?
18. Fade-in su mount delle righe va aggiunto come default, opt-in, o mai?
19. Il pattern DnD (`@dnd-kit` + `rowWrapper`) va incapsulato in una prop `reorderable` del DataTable, restare a carico del caller, o estratto in un wrapper dedicato?
20. Le due implementazioni `SortableProductRow` / `SortableDataTableRow` (CatalogEngine + ProductsManagerCard) vanno consolidate in un unico componente esportato?

### Highlight transitorio
21. Il pattern `rowClassName` per highlight transitorio (newly-added/saving) va promosso a prop API dedicata (`highlightedIds?`, `savingIds?`) o resta a discrezione del caller?

### Sorting
22. La prop `sortable` su `ColumnDefinition` va implementata o rimossa (oggi accettata ma inerte)?

### State globale
23. `emptyState` e `loadingState` ricevono ReactNode arbitrario — va imposto un componente standard (`<EmptyState>`/`<LoadingState>`)?

### Reset selezione
24. Il reset automatico della selezione al cambio di `data` e al cambio pagina deve restare il default o diventare configurabile?

---

## Eccezioni note al pattern unificato (post-refactor)

### CatalogEngine — picker "assignable" (selezione inherited-aware)
Il picker di assegnazione prodotti in `src/pages/Dashboard/Catalogs/CatalogEngine.tsx` (DataTable `assignableProducts`) **non** usa il pattern di selezione standard del DataTable (`selectable` + `selectedRowIds` + `onSelectedRowsChange`). Mantiene una selezione custom esterna (`assignSelectedIds`) con checkbox header custom nelle column definitions, perché deve gestire prodotti "ereditati" (`inheritedProductIds`) che hanno comportamento di selezione differente: sono pre-selezionati per via dell'ereditarietà dal livello superiore della tassonomia, non sono deselezionabili dal picker corrente, e visivamente attenuati.

Questa è un'eccezione accettata e documentata: il pattern standard del DataTable non modella la selezione "locked/inherited", ed estenderlo per un singolo call site violerebbe YAGNI. Se in futuro emergessero altri picker con la stessa esigenza, valutare l'estensione del DataTable con prop dedicate tipo `lockedRowIds?: string[]` (righe pre-selezionate non deselezionabili).

### Pattern semantici permanenti via rowWrapper + display: contents
`Products.tsx` (righe varianti) e `CatalogEngine.tsx` assignable picker (righe ereditate) applicano styling permanente alle righe (non transitorio, non un disabled-state) usando il pattern:

```tsx
rowWrapper={(row, data) =>
  matchesCondition(data) ? (
    <div className={styles.semanticWrapper}>{row}</div>
  ) : row
}
```

```scss
.semanticWrapper {
  display: contents;

  > * {
    /* styling permanente che si applica alla DataTableRow figlia */
  }
}
```

Questo è il pattern corretto per styling di riga condizionale e permanente, distinto da:
- `highlightedRowIds` — animazione transitoria one-shot (~2s fade amber, per feedback "appena aggiunto/modificato")
- `disabledRowIds` — stato in elaborazione (opacity 0.5 + pointer-events: none, per "salvataggio in corso", "sola lettura temporanea")

### Pattern inline preservati nelle ultime colonne
Non tutte le ultime colonne del DataTable sono "colonna azioni kebab" da uniformare a `width: 56px` + `TableRowActions`. Casi preservati intenzionalmente:

- `ActivityVisibilityContent.tsx` (colonna `visibility`, width 100px): contiene un `<Switch>` per toggle visibilità rapido del prodotto nel catalogo. Pattern UX intenzionale (azione frequente, tap singolo). NON migrare a kebab.
- `PrezziOpzioniTab.tsx` valueColumns (colonna `actions`, width 80px): contiene `<Button>` inline (`Save`/`Cancel` o `Edit`/`Delete`) per editing inline dei valori opzione. Pattern UX intenzionale (editing inline di entità con pochi campi). NON migrare a kebab.

### CatalogEngine `productId` vs `row.id` per highlight
Nella DataTable `visibleRows` di CatalogEngine, il `newlyAddedProductId` è un `productId` ma `getRowId` di default usa `row.id`. Il mapping è esplicito:

```tsx
highlightedRowIds={
  newlyAddedProductId
    ? visibleRows.filter(r => r.productId === newlyAddedProductId).map(r => r.id)
    : []
}
```

Alternativa più pulita sarebbe passare `getRowId={r => r.productId}`, ma le tabelle CatalogEngine usano `row.id` (id della relazione `categoria-prodotto`) per `selectable` + `SortableContext` DnD — diverso dal productId. Mantenuto il mapping inline.
