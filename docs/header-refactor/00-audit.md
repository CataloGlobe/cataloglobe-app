# Header & Page Shell — Audit (Fase 0)

> Documento di sola analisi. Nessuna modifica al codice. Mappa lo stato attuale
> della "cornice" dell'area `/business/:businessId/`, lo confronta con il design
> target, propone l'API dei nuovi componenti e un piano di migrazione.

---

## A. Inventario navbar / breadcrumb attuale

| Pezzo | File | Note |
|---|---|---|
| MainLayout (host) | `src/layouts/MainLayout/MainLayout.tsx` | Rende `<AppHeader>` in alto + `<PageHeaderSlot>` subito sotto + sidebar a sinistra + content scrollable |
| AppHeader (barra superiore) | `src/components/layout/AppHeader/AppHeader.tsx` | Compone i 5 elementi sotto |
| Logo | `src/components/layout/HeaderLogo/HeaderLogo.tsx` | Statico, link a homepage tenant |
| Tenant switcher | `src/components/layout/HeaderTenantSwitcher/HeaderTenantSwitcher.tsx` | Switcher tra business; usa `useTenant()` |
| Breadcrumb (esistente) | `src/components/ui/Breadcrumb/Breadcrumb.tsx` | Componente generico; renderizzato condizionalmente da `AppHeader` se `useBreadcrumb().items.length > 0` |
| Notifications bell | `src/components/layout/HeaderNotifications/HeaderNotifications.tsx` | |
| Avatar / user menu | `src/components/layout/HeaderUserMenu/HeaderUserMenu.tsx` | |

**Composizione attuale `AppHeader.tsx` (semplificata):**
```jsx
<HeaderLogo />
<HeaderTenantSwitcher />
{breadcrumbItems.length > 0 && (
  <>
    <span className={styles.separator}>/</span>
    <Breadcrumb items={breadcrumbItems} />
  </>
)}
<HeaderNotifications />
<HeaderUserMenu />
```

Il `Breadcrumb` esiste **ma è poco adottato**: oggi compare quasi solo nelle sottopagine di dettaglio (es. ActivityDetailPage che lo gestisce con header bespoke). La pagina lista NON setta breadcrumb → la barra mostra solo `tenant`.

WorkspaceLayout usa un header diverso (`AppHeaderWorkspace`) — fuori scope refactor.

---

## B. Inventario PageHeader / FilterBar

### PageHeader (titolo di pagina sticky)

- **Context**: `src/context/PageHeaderContext.tsx` espone `usePageHeader(config | null)`.
- **Slot renderer**: `src/components/layout/PageHeaderSlot/PageHeaderSlot.tsx`, montato in `MainLayout.tsx:124` SOPRA il content scrollable.
- **API attuale (`PageHeaderConfig`):**

```ts
interface PageHeaderConfig {
  title: string;
  subtitle?: string;
  titleAddon?: ReactNode;
  actions?: ReactNode;
  sticky?: boolean;
}
```

- **Animazione**: lo slot fa shrink al scroll (legge `scrollContainerRef`).
- **Adozione**: 9/16 pagine business chiamano `usePageHeader`; 7 NO (per varia ragione: detail page custom, embed/dashboard, ecc.). Vedi §C.

### FilterBar

- File: `src/components/ui/FilterBar/FilterBar.tsx`.
- API:
```ts
<FilterBar
  search?: { value, onChange, placeholder, allowClear, onClear }
  view?: { value: "grid"|"list", onChange }
  advancedFilters?: ReactNode
  activeFilters?: { label, onRemove }[]
/>
```
- Usata da: Sedi (lista), Ordini, Cataloghi, Prodotti, Stili, Highlights, Programmazione, Team. NON usata da: Tavoli, Prenotazioni, Analitiche, Recensioni (Recensioni e Analitiche usano direttamente `SearchInput`/`Select`).

---

## C. Tabella per pagina — slot attuali vs design target

| # | Pagina | Route | `usePageHeader` | Tabs | Search | Filtri raffinamento | Azioni (CTA) | Sede-scoped | Componenti chiave | Bespoke header? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Panoramica | `overview` | sì (title only) | no | no | no | no | no | grid stats | no |
| 2 | Sedi (lista) | `locations` | no | no | sì (FilterBar) | no | no | no | FilterBar | no |
| 2b | Sede dettaglio | `locations/:activityId` | no | sì (4: Profilo/Disponibilità/Tavoli/Impostazioni) | no | no | no | sì (route param) | StatusBadge + breadcrumb manuale | **sì — bespoke** |
| 3 | Tavoli | `tables` | no | no | no | no | no | sì (`<select>` interno) | inline activity selector | no |
| 4 | Ordini | `orders` | no | sì (3: Comande/Consegne/Storico) | sì (FilterBar) | OrderStatusFilter (pills) + table dropdown + autorefresh | row drawer | sì (`ActivitySelectorCombobox` con localStorage) | FilterBar + Tabs + Combobox | no |
| 5 | Prenotazioni | `reservations` | sì | sì (2: Inbox/Agenda) — custom button styling | no | (no per ora) | drawer | sì (`<select>` scope con `__all__`) | custom tab buttons + select | no |
| 6 | Programmazione | `scheduling` | sì | sì (`<Tabs>` ruleType) + view-mode list/dependencies | sì (FilterBar) | filterRow | "Nuova regola" Menu | no | Tabs + FilterBar | no |
| 7 | Cataloghi | `catalogs` | sì | no | sì (FilterBar) | no | "+ Aggiungi" | no | FilterBar | no |
| 7b | Catalogo dettaglio | `catalogs/:id` | — | sì (Struttura/Dettagli) | — | — | — | — | Tabs | no |
| 8 | Prodotti | `products` | sì | sì (4: Prodotti/Gruppi/Attributi/Ingredienti) | sì (FilterBar) | no | "+ Aggiungi Prodotto" | no | Tabs + FilterBar | no |
| 8b | Prodotto dettaglio | `products/:id` | — | sì (Scheda/Prezzi-Opzioni/Disponibilità/Utilizzo) | — | — | — | — | Tabs | parzialmente |
| 9 | Contenuti in evidenza | `featured` | sì | no | sì (FilterBar) | no | "Crea contenuto" | no | FilterBar | no |
| 10 | Stili | `styles` | sì | no | sì (FilterBar con view toggle grid/list) | view toggle | "+ Crea Stile" | no | FilterBar | no |
| 11 | Lingue | `languages` | sì (title+subtitle) | no | no | no | no | no | nessuno | no |
| 12 | Analitiche | `analytics` | no | no (SegmentedControl periodo 7d/30d/90d/custom) | no | `AnalyticsFilters` + period segmented | export XLSX | sì (`Select` activity) | Select + SegmentedControl | parzialmente |
| 13 | Recensioni | `reviews` | no | no | sì (SearchInput) | DateInput + PillGroupSingle rating + status select | row trash | sì (`Select` activity) | SearchInput + Select + DateInput + PillGroupSingle | parzialmente |
| 14 | Team | `team` | sì | no | sì (FilterBar) | no | "+ Invita membro" | no | FilterBar | no |
| 15 | Abbonamento | `subscription` | sì | no | no | no | "+ Aggiungi Sedi" + portal link | no | nessuno | no |
| 16 | Impostazioni | `settings` | sì | no | no | no | salvataggio implicito + delete | no | nessuno | no |

### Discrepanze col design target

- **Pagine senza controlli ma con header verboso** (target: solo breadcrumb, niente toolbar): Panoramica, Lingue, Team, Abbonamento, Impostazioni. Oggi tutte chiamano `usePageHeader({ title, subtitle, ... })` con la fascia in pagina.
- **ActivityDetailPage** ha un header BESPOKE (breadcrumb manuale + StatusBadge inline + 4 tab) invece di usare PageHeader: contraddice "ogni pagina rende le tab tramite la toolbar contestuale".
- **Selettori sede inconsistenti**: Ordini (Combobox + localStorage), Tavoli (`<select>` inline senza persistenza), Prenotazioni (`<select>` scope con `__all__`, senza persistenza), Analitiche (`Select` "tutte" default, senza persistenza), Recensioni (`Select` con `""` = tutte, senza persistenza). Target: **uno solo**, in navbar accanto al tenant, condiviso/persistente sulle 4 pagine sede-scoped (Ordini, Programmazione, Analitiche, Recensioni). Le Prenotazioni hanno scope simile ma la spec target NON le ha incluse: **flag — chiarire**.
- **Tabs styling è eterogeneo**: `<Tabs>` generico (Programmazione, Prodotti dettaglio), PillGroupSingle (Recensioni rating), custom button styling (Prenotazioni, Ordini), bespoke (ActivityDetailPage). Target: pill viola (primary) + segmented grigia (secondary), API unica.

### ⚠️ Discrepanze contro le assunzioni del target da chiarire

1. **Sedi (lista)** ha `FilterBar` per cercare tra le sedi — è una pagina tenant-wide (non sede-scoped), ma il design target non specifica se "pagine senza controlli" includa anche la lista sedi. **Flag — chiarire** se la lista Sedi tiene la search o passa a "solo breadcrumb".
2. **Programmazione** in design target è classificata "sede-scoped" (mostra selettore sede in navbar) ma il codice attuale **non filtra per sede** (le regole sono tenant-wide). **Flag — chiarire**.
3. **Prenotazioni** ha scope per-sede ma NON è nelle 4 "sede-scoped" del design target. **Flag — chiarire** se deve avere il selettore in navbar o restare con scope locale `__all__|<id>`.
4. **Ordini** ha 3 tab principali + ha già un `ActivitySelectorCombobox` con persistenza localStorage. La doppia source of truth (lo scope condiviso navbar + il combobox interno) va riconciliata.
5. **Analitiche** + **Recensioni** hanno selettore sede con `"" = tutte`; target chiede "stato condiviso tra le 4 pagine sede-scoped" → quindi un unico stato `selectedActivityId | "__all__"`. OK in principio.

---

## D. Componenti riusabili — già presenti vs da creare

### Esistenti riusabili
- `Breadcrumb` (`src/components/ui/Breadcrumb/Breadcrumb.tsx`) — ✅ riusabile. Da estendere se manca un'API "link-to" per i segmenti intermedi.
- `Tabs` (`src/components/ui/Tabs/Tabs.tsx`) — compound API `<Tabs><Tabs.List><Tabs.Tab>`. Manca variante "primary pill viola" vs "secondary segmented grigia". Estendere con prop `variant: "primary" | "secondary"`.
- `SearchInput` (`src/components/ui/Input/SearchInput.tsx`) — ✅ riusabile.
- `Select` (`src/components/ui/Select/Select.tsx`) — ✅ riusabile come fallback per il nuovo `SedeScopeSelect`.
- `FilterBar` (`src/components/ui/FilterBar/FilterBar.tsx`) — esistente; il design target NON la elimina ma la ridefinisce come "riga 2 opzionale per raffinamento". Da decidere se rifattorizzarla in `PageToolbar.refinement` slot o tenerla com'è e wrapparla.
- `PillGroupSingle`, `SegmentedControl` — esistenti, usabili come building block delle nuove Tabs varianti.
- `ActivitySelectorCombobox` (usata in Ordini) — referenza per UX selettore sede in toolbar; **non riusabile in navbar** (è disegnato come combobox in pagina). Servirà componente nuovo per navbar.

### Da creare
- `<Breadcrumb>` con segmenti derivati automaticamente da route + override puntuale (titoli dinamici: nome prodotto, nome sede, ecc.).
- `<SedeScopeSelect>` (componente UI) + `useSedeScope()` (hook) — vedi §F.
- `<PageToolbar>` (nuovo) — slot-based per la riga "tabs sx · search/filtri/azioni dx".
- Variante `Tabs primary` (pill viola) vs `Tabs secondary` (segmented grigia).

Niente nuove librerie npm.

---

## E. Stato sede — opzioni per il refactor

### Stato di fatto oggi

| Pagina | Storage | Default | Persistenza tra navigazioni |
|---|---|---|---|
| Ordini | `localStorage` key `cataloglobe:orders:lastActivityId` | prima sede | sì (solo dentro Ordini) |
| Programmazione | `useState` locale | nessuno | no |
| Analitiche | `useState` locale (`"" = tutte`) | tutte | no |
| Recensioni | `useState` locale (`""`) | tutte | no |
| Prenotazioni | `useState` locale (`"__all__"`) | prima sede del set readable | no |
| Tavoli | `useState` locale | prima | no |

Quindi nessuna pagina condivide la sede con un'altra, e la persistenza esiste solo per Ordini.

### Opzioni

| Opzione | Pro | Contro |
|---|---|---|
| **URL query param** `?sede=<id>` (gestito a livello layout) | shareable; back/forward funzionano; SSR-safe; zero storage; visibile, debug-friendly | richiede touch su ogni `Link` interno per propagare il param (o pulizia automatica); collide se la pagina ha già filtri in URL |
| **React Context** dedicato (`SedeScopeProvider`) | nessun param URL "rumoroso"; type-safe; semplice da consumare via hook | vincolo prompt: "no nuovi provider se non necessario"; richiede 1 provider in MainLayout |
| **sessionStorage** dietro a un hook `useSedeScope()` | nessun param URL; nessun provider context; persiste in finestra/tab corrente; semplice | tab indipendenti perdono allineamento; refresh manuale dopo cambio tenant |

### Raccomandazione

**`useSedeScope()` hook che usa `sessionStorage` per la persistenza + un `<SedeScopeSelect>` montato in navbar**, attivato solo sulle pagine sede-scoped (vedi §F per il gating). Motivi:
- Rispetta il vincolo "no nuovi provider": l'hook legge/scrive `sessionStorage` con una chiave scoped al `tenantId` (es. `cataloglobe:sedeScope:<tenantId>`).
- Persiste tra navigazioni nella stessa tab (caso d'uso principale: admin che cambia tra Ordini/Programmazione/Analitiche/Recensioni).
- Niente coupling con react-router; niente noise nei param URL.
- Il default = `__all__` per tutte le pagine multi-sede; `single-site` users → forced single id.
- Listener `storage` event opzionale per sync cross-tab, se serve in futuro (zero impatto se omesso).

Vincolo da fissare nel codice: la chiave session DEVE essere namespaced per `tenantId`, altrimenti switching tenant porta dietro la sede sbagliata.

---

## F. Proposta API dei nuovi componenti

### `Breadcrumb` (riuso + estensione del Breadcrumb esistente)

```tsx
// Adapter che deriva i segmenti dalla route attiva + supporta override.
<NavbarBreadcrumb
  tenantName={tenantName}          // sempre primo segmento
  sedeName?={resolvedSede?.name}    // mostrato solo se route sede-scoped
  pageLabel={"Ordini"}             // derivato da route → label IT (map statica)
  detailLabel?={productName ?? null} // mostrato solo su detail routes
/>
```

Internamente itera segmenti separator `/`. Click su segmento intermedio → `navigate(parentPath)`.

### `<SedeScopeSelect>` + `useSedeScope()`

```ts
type SedeScopeValue = string | "__all__";

interface UseSedeScopeReturn {
  value: SedeScopeValue;
  setValue: (v: SedeScopeValue) => void;
  readableActivities: V2Activity[]; // gated by reservations/orders/analytics/reviews read perm
  isForcedSingleSite: boolean;       // true if only 1 sede accessibile → UI nasconde selettore
}

useSedeScope(): UseSedeScopeReturn
// Internamente: sessionStorage key `cataloglobe:sedeScope:<tenantId>`.
// Default: __all__ (multi-site) o l'unico id (single-site).
// `setValue` notifica listener interni (subscribers) — niente Provider Context.
```

```tsx
<SedeScopeSelect />  // legge useSedeScope() internamente
// Renderizzato in AppHeader, montato condizionatamente.
// AppHeader passa prop `showSedeScope` derivata dalla route attiva.
```

### `<PageToolbar>` (nuovo)

Slot-based, niente UI proprietaria oltre il layout flex:

```tsx
<PageToolbar
  tabs?={<Tabs variant="primary" ... />}
  search?={<SearchInput ... />}
  filters?={<>...</>}              // pills, view toggle, etc.
  actions?={<Button>+ Aggiungi</Button>}
  refinement?={<>...</>}            // riga 2 opzionale (es. status pills Ordini)
/>
```

Layout:
- Riga 1: `tabs (left, gap 8) ··· search (flex-grow) ··· filters · actions`.
- Riga 2 (opzionale): `refinement`.

Su mobile: tabs scrollabili orizzontalmente; actions ancorate a destra; refinement va su nuova riga.

### `Tabs` — estensione

```tsx
<Tabs variant="primary" value={tab} onChange={setTab}>
  <Tabs.List>
    <Tabs.Tab value="orders">Ordini</Tabs.Tab>
  </Tabs.List>
</Tabs>
// variant: "primary" (pill viola, attiva = bg --brand-primary, text on-violet)
// variant: "secondary" (default attuale: segmented grigia piccola)
```

Lo stile attivo `primary` mappa al token sidebar active (`#6366f1` oggi hardcoded → da introdurre nel theme).

---

## G. Mappa di migrazione — slot per pagina

> Legenda: **B** = breadcrumb (sempre, ovvio); **T** = tabs primary; **t** = tabs secondary; **S** = search; **F** = filtri/raffinamento; **A** = actions/CTA; **SS** = SedeScopeSelect in navbar.

| # | Pagina | Slot navbar extra | Slot toolbar |
|---|---|---|---|
| 1 | Panoramica | — | nessuno |
| 2 | Sedi (lista) | — | S A (CTA "+ Aggiungi sede") — **da chiarire se manteniamo search** |
| 2b | Sede dettaglio | breadcrumb con nome sede | t (Profilo/Disponibilità/Tavoli/Impostazioni) |
| 3 | Tavoli | SS | t? (se servono sotto-tab) + A |
| 4 | Ordini | SS | T (Comande/Consegne/Storico) · F (status pills + tavolo) · A (autorefresh toggle) |
| 5 | Prenotazioni | SS *o* scope locale (chiarire) | T (Da gestire/Agenda) · F (mostra annullate per Agenda) |
| 6 | Programmazione | SS (chiarire se sede-scoped) | T (Layout/Featured/...) · S · F · A (Nuova regola) |
| 7 | Cataloghi | — | S · A (+ Aggiungi) |
| 7b | Catalogo dettaglio | breadcrumb catalogo | t (Struttura/Dettagli) |
| 8 | Prodotti | — | T (Prodotti/Gruppi/Attributi/Ingredienti) · S · A |
| 8b | Prodotto dettaglio | breadcrumb prodotto | t (Scheda/Prezzi/Disponibilità/Utilizzo) |
| 9 | Contenuti in evidenza | — | S · A (Crea contenuto) |
| 10 | Stili | — | S · F (view grid/list) · A (+ Crea Stile) |
| 11 | Lingue | — | nessuno |
| 12 | Analitiche | SS | F (period segmented) · A (export XLSX) |
| 13 | Recensioni | SS | S · F (rating pills + date + status) · A (?) |
| 14 | Team | — | S · A (+ Invita) |
| 15 | Abbonamento | — | A (Aggiungi Sedi / Portal) |
| 16 | Impostazioni | — | A (Save / Delete) — A spesso ancorato a sezioni |

Tutte le pagine: titolo nel breadcrumb di navbar (`tenant / [sede] / pagina / [dettaglio]`), no più PageHeader.

---

## H. Rischi e ordine di rollout

### Rischi

1. **Blast radius layout condiviso**: ogni modifica a `MainLayout` / `AppHeader` impatta TUTTE le 16 pagine business + il WorkspaceLayout (anche se quest'ultimo usa un header separato — verificare che la rimozione di `PageHeaderSlot` non rompa pagine workspace).
2. **Ordini ha tab annidate + filtri pesanti**: la migrazione del suo header è la più rischiosa. Il SegmentedControl + Combobox + status pills + autorefresh sono tutti coupling fields. Probabile bisogno di mantenere `FilterBar` interno mentre la navbar prende solo il selettore sede.
3. **ActivityDetailPage ha header bespoke**: tab + breadcrumb manuale + StatusBadge inline. Migrare = sostituire il bespoke con `<PageToolbar tabs={t}>` + esporre lo `StatusBadge` come `titleAddon` nel breadcrumb (o nuovo slot `meta` su `PageToolbar`).
4. **Decisione `useSedeScope` storage** finalizzabile solo dopo aver chiarito: (a) Prenotazioni e Programmazione sono sede-scoped sì/no per il selettore navbar?
5. **`PageHeaderContext` rimosso**: oggi 9 pagine ci dipendono; serve un "kill switch" che durante il rollout permetta a entrambi i sistemi di coesistere — proposta: il vecchio context rimane fino a Fase N, le pagine migrate semplicemente non lo chiamano più.
6. **Token violet hardcoded**: oggi `#6366f1` è ripetuto in `Sidebar.module.scss`. Il theme `_theme.scss` espone `--brand-primary` (light: `#6366f1`, dark: `#2563eb`) → migrare le occorrenze hardcoded a `var(--brand-primary)` prima del refactor tabs.

### Ordine consigliato (proposta)

1. **Fase 1 — Foundation**:
   - Risolvere i 3 flag aperti (Prenotazioni, Programmazione, Sedi lista).
   - Aggiungere variante `primary` a `<Tabs>` + token spacing/radius mancanti in `_theme.scss`.
   - Eliminare `#6366f1` hardcoded.
   - Hook `useSedeScope()` + `<SedeScopeSelect>` montato in `AppHeader` (gated by route).
2. **Fase 2 — Breadcrumb dinamico**:
   - `NavbarBreadcrumb` derivato dalla route attiva.
   - Map statica `route → label IT` + 3 detail routes con override dinamico (`useBreadcrumbOverride(label)`).
   - `PageHeaderSlot` non rimosso ancora — le pagine continuano a usarlo.
3. **Fase 3 — `PageToolbar` + migrazione pagine senza controlli**:
   - Crea `<PageToolbar>`.
   - Migra le 5 pagine "senza controlli" (Panoramica, Lingue, Team, Abbonamento, Impostazioni) — rimuovono `usePageHeader` e non rendono nulla in pagina.
4. **Fase 4 — Migrazione pagine semplici** (Cataloghi, Highlights, Stili, Prodotti).
5. **Fase 5 — Migrazione pagine complesse** (Recensioni, Analitiche, Prenotazioni).
6. **Fase 6 — Ordini + Programmazione**: ultime per via dei multi-controllo (tab + sede + status + autorefresh).
7. **Fase 7 — ActivityDetailPage**: eliminare bespoke header.
8. **Fase 8 — Cleanup**: rimuovere `PageHeaderContext`, `PageHeaderSlot`, `usePageHeader`, le SCSS classes orfane.

### Domande aperte da chiudere prima di scrivere codice

1. Prenotazioni: navbar sede-scoped o scope locale?
2. Programmazione: navbar sede-scoped (e quindi togliere il fatto che oggi è tenant-wide nel modello dati)?
3. Sedi lista: search rimane in toolbar oppure no?
4. ActivityDetailPage: il selettore sede in navbar coesiste con la route `locations/:activityId`? Probabile sì (la navbar mostra la sede risolta dalla route, non il SedeScopeSelect).
5. Tavoli: oggi ha selettore sede locale ma il design target lo classifica come "non sede-scoped" (?) — confermare se va in navbar.
