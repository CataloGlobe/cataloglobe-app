# Audit: Workspace Page & Sidebars

## 1. Workspace Sidebar (livello account)

**File:** `src/layouts/WorkspaceLayout/WorkspaceSidebar.tsx`
**Stile:** `src/layouts/WorkspaceLayout/WorkspaceSidebar.module.scss`

### Struttura

- Sidebar statica, larghezza fissa **220px**, no collapse, no responsive
- Header: logo "CataloGlobe" + badge "Workspace"
- 2 sezioni con label uppercase:
  - **Attività** → link a `/workspace`
  - **Account** → "Abbonamento", "Impostazioni"

### JSX

```
<aside .sidebar>
  <div .header>
    <a .appName> CataloGlobe
    <span .badge> Workspace
  <nav .nav>
    {SECTIONS.map(section =>
      <div .section>
        <span .sectionLabel> {section.label}
        {section.items.map(item =>
          <NavLink .link/.active> {icon} {label}
```

### Classi CSS (module.scss)

| Classe | Descrizione |
|--------|-------------|
| `.sidebar` | 220px fisso, bg white, border-right |
| `.header` | padding-top 20px, border-bottom |
| `.nav` | flex column, gap 20px |
| `.section` | gap 2px tra item |
| `.sectionLabel` | uppercase, font 10px, colore indigo (#6366f1) |
| `.link` | flex, font 14px, colore #64748b, padding 8px |
| `.active` | bg rgba(99,102,241,0.1), colore #6366f1 |

### Stato attivo

NavLink `isActive` → applica `.active` class.

---

## 2. Sidebar Interna (livello tenant/azienda)

**File:** `src/components/layout/Sidebar/Sidebar.tsx`
**Stile:** `src/components/layout/Sidebar/Sidebar.module.scss`

### Struttura

- **Larghezza dinamica**: expanded 260px, collapsed 90px (Framer Motion)
- Desktop: sticky, Mobile: overlay fisso
- 5 gruppi nav con card bordate:
  1. **Panoramica** (senza label, solo overview)
  2. **Operatività** (Sedi, Programmazione)
  3. **Contenuti** (Cataloghi, Prodotti, Contenuti in evidenza, Stili)
  4. **Insight** (Analitiche, Recensioni)
  5. **Sistema** (Team, Impostazioni)
- **Bottom**: Divider + BusinessSwitcher + collapse toggle

### JSX

```
<motion.aside .sidebar/.desktop/.mobile [data-collapsed]>
  {isMobile && <div .mobileHeader>}
  {!isMobile && <div .logo>}
  <div .sidebarScroll>
    <nav .nav>
      {groups.map(group =>
        <div .groupCard>
          {group.title && <div .groupTitle>}
          <ul .list>
            {group.items.map(link =>
              <li>
                <NavLink .link/.active>
                  <span .icon>
                  <motion.span .label>
  <div .divider>
  <BusinessSwitcher collapsed={collapsed}>
  {!isMobile && <motion.button .collapseToggle>}
```

### Classi CSS (module.scss)

| Classe | Descrizione |
|--------|-------------|
| `.sidebar` | flex column, bg #f8fafc, border-right |
| `.desktop` | sticky, height 100vh |
| `.mobile` | fixed, inset 0, z-50 |
| `.groupCard` | bg white, border #f1f5f9, border-radius 12px, padding 8px, shadow sottile |
| `.list` | gap 2px, grid layout |
| `.link` | flex, height 35px, padding 12px, border-radius 8px, colore #64748b |
| `.active` | bg rgba(99,102,241,0.1), colore #6366f1 |
| `.icon` | inline-flex, min-width 20px |
| `.label` | margin-left 10px, white-space nowrap |
| `.groupTitle` | label del gruppo |
| Collapsed | `[data-collapsed="true"]` nasconde label, centra icone |

### Stato attivo

NavLink `isActive` + Tooltip su item in modalità collapsed.

---

## 3. BusinessSwitcher (bottom sidebar interna)

**File:** `src/components/Businesses/BusinessSwitcher/BusinessSwitcher.tsx`
**Stile:** `src/components/Businesses/BusinessSwitcher/BusinessSwitcher.module.scss`

### Struttura

- Trigger button con logo/iniziale + nome + chevron
- Dropdown menu con lista tenant + link "Workspace"
- Context: `useTenant()` → tenants list, selectTenant
- Position: sopra il trigger (expanded), a destra (collapsed)

### Classi CSS

| Classe | Descrizione |
|--------|-------------|
| `.wrapper` | flex 1, position relative, padding 4px 20px 8px 12px |
| `.trigger` | width 100%, flex, gap 8px, padding 8px, bg white, border #e2e8f0 |
| `.triggerCollapsed` | 42x42px, centrato |
| `.dropdown` | position absolute, bottom calc(100% + 2px), border-radius 10px, shadow 0 8px 24px |
| `.dropdownCollapsed` | top 4px, left calc(100% + 4px), width 200px (appare a destra) |
| `.dropdownItem` | flex, padding 8px, border-radius 6px, hover bg #f8fafc |
| `.checkIcon` | 16px, colore indigo #6366f1 |

---

## 4. Layout Wrapper

### MainLayout (pagine tenant)

**File:** `src/layouts/MainLayout/MainLayout.tsx`

- Wrappa `/business/:businessId/*`
- Gestisce responsive breakpoint (1024px)
- State: `mobileSidebarOpen`, `sidebarCollapsed`
- Fornisce `<DrawerProvider>`

```
<div .appLayout>
  <DrawerProvider>
    <Sidebar isMobile collapsed onRequestClose onToggleCollapse>
    <main .main>
      <Outlet>
```

### WorkspaceLayout (pagine account)

**File:** `src/layouts/WorkspaceLayout/WorkspaceLayout.tsx`

- Wrappa `/workspace/*` (no TenantProvider)
- Layout semplice 2 colonne

```
<div .layout>
  <WorkspaceSidebar>
  <main .main>
    <Outlet>
```

---

## 5. Workspace Page

**File:** `src/pages/Workspace/WorkspacePage.tsx`
**Stile:** `src/pages/Workspace/WorkspacePage.module.scss`

### Sezioni

1. **Header** — titolo + descrizione
2. **Inviti pendenti** — card con "Visualizza invito"
3. **Griglia aziende** — `grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))`, gap 20px
   - **BusinessCard**: logo/iniziale colorata, nome + badge ruolo, tipo verticale, 3 azioni (settings, copy, leave/delete), footer con stats (sedi, prodotti, cataloghi)
   - **CreateCard**: border 2px dashed #e5e7eb, icona Plus, "Crea azienda", hover: border indigo
4. **Aziende in eliminazione** — sezione collassabile con DataTable (nome, data purge, countdown, azioni restore/purge)

### Classi CSS

| Classe | Descrizione |
|--------|-------------|
| `.page` | min-height 100vh, bg #f8fafc, padding 48px top/bottom, 24px left/right |
| `.grid` | grid, auto-fill minmax(260px), gap 20px |
| `.createCard` | border 2px dashed #e5e7eb, border-radius 14px, padding 20px, hover: border indigo, bg indigo/0.04 |
| `.createIconWrapper` | 40px cerchio, bg #f1f5f9, place-items center |

---

## 6. Differenze tra le due sidebar

| Aspetto | Workspace Sidebar | Sidebar Interna |
|---------|-------------------|-----------------|
| **File** | `WorkspaceSidebar.tsx` | `Sidebar.tsx` |
| **Larghezza** | 220px fisso | 260px expanded / 90px collapsed |
| **Background** | white | #f8fafc (grigio chiaro) |
| **Collapsible** | No | Sì (Framer Motion, spring) |
| **Responsive** | No | Sì (breakpoint 1024px, overlay mobile) |
| **Raggruppamento** | Sezioni con label uppercase | Card con bordo, border-radius 12px, shadow |
| **Label sezione** | `.sectionLabel`: uppercase, 10px, indigo | `.groupTitle`: con icona |
| **Item height** | Padding 8px (variabile) | 35px fisso |
| **Item padding** | 8px | 12px |
| **Item border-radius** | Nessuno specificato | 8px |
| **Logo/Wordmark** | "CataloGlobe" testo + badge "Workspace" | Logo immagine o testo animato |
| **BusinessSwitcher** | Assente | Presente in basso |
| **Collapse toggle** | Assente | Presente in basso |
| **Mobile overlay** | Assente | Presente (fixed, inset 0, z-50) |
| **Tooltip collapsed** | N/A | Sì, su ogni item |
| **Animazioni** | Nessuna | Framer Motion (layout, spring) |
| **Stato attivo** | Stessa logica NavLink | Stessa logica NavLink |
| **Colore attivo** | Identico: bg indigo/0.1, text #6366f1 | Identico |
| **Colore item inattivo** | Identico: #64748b | Identico |

---

## 7. Componenti condivisi

**Nessun sub-componente condiviso.** Le due sidebar sono completamente indipendenti:

- Entrambe usano `NavLink` di React Router
- Entrambe usano icone Lucide React
- Entrambe usano SCSS Modules
- Ma nessun componente tipo `SidebarItem`, `SidebarSection`, `SidebarLabel` è condiviso

---

## 8. File da toccare per allineare le sidebar

Per portare la Workspace Sidebar allo stesso livello di qualità della sidebar interna:

| File | Intervento |
|------|-----------|
| `src/layouts/WorkspaceLayout/WorkspaceSidebar.tsx` | Refactor struttura: aggiungere groupCard, responsive, collapse |
| `src/layouts/WorkspaceLayout/WorkspaceSidebar.module.scss` | Allineare stili: bg, groupCard, border-radius, padding, shadow |
| `src/layouts/WorkspaceLayout/WorkspaceLayout.tsx` | Aggiungere gestione responsive (breakpoint, mobile state) |
| `src/layouts/WorkspaceLayout/WorkspaceLayout.module.scss` | Aggiornare layout per supportare sidebar collassabile |
| `src/components/layout/Sidebar/Sidebar.tsx` | Eventuale estrazione componenti condivisi (SidebarItem, etc.) |

### Componenti potenzialmente estraibili

Se si vuole unificare:
- `SidebarNavItem` — link con icona, label, stato attivo, tooltip collapsed
- `SidebarGroup` — card contenitore con titolo opzionale
- `SidebarLayout` — wrapper con scroll, divider, bottom section
