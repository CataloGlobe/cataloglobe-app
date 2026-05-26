# Audit — Header globale e Sidebar

Data: 2026-05-23

## 1. MainLayout — struttura attuale

- **Path**: `src/layouts/MainLayout/MainLayout.tsx`
- **Composizione DOM**:
  ```
  <div className={styles.appLayout}>          // height: 100dvh, flex column
    <DrawerProvider>
      <div className={styles.body}>           // flex: 1, flex row
        <Sidebar ... />
        <main className={styles.main}>        // flex column, min-height: 0
          {isMobile && <div className={styles.mobileHeader}>...}
          <div className={styles.content}>    // flex: 1, overflow-y: auto
            <SubscriptionBanner />
            <Outlet />
          </div>
        </main>
      </div>
    </DrawerProvider>
  </div>
  ```
- **Scroll container**: il `div.content` interno, NON il body. Questo abilita lo sticky di componenti figli (es. futuro PageHeader sticky) senza refactor di MainLayout.
- **Altezza**: `height: 100dvh` su `.appLayout`, flex column. `.body` è `flex: 1`. `.main` e `.content` usano `flex: 1` + `min-height: 0` per scroll interno.
- **Provider/wrappers applicati in MainLayout**: `DrawerProvider`. `TenantProvider` è esterno e wrappa MainLayout in `src/App.tsx:49-52`.
- **Punto di intervento per header full-width**: aggiungere `<header>` come primo figlio di `.appLayout`, prima di `.body`. `.body` continua a contenere sidebar + main come row. Il modulo SCSS ha già uno slot vuoto commentato `/* NAVBAR */` che suggerisce l'intenzione originale di un layout L-shape mai completato.

## 2. Sidebar — struttura attuale

- **Path**: `src/components/layout/Sidebar/Sidebar.tsx` (+ `Sidebar.module.scss`)
- **Larghezza**:
  - Espansa: `260px` (costante `SIDEBAR_EXPANDED`, `Sidebar.tsx:34`)
  - Collassata: `90px` (costante `SIDEBAR_COLLAPSED`, `Sidebar.tsx:35`)
  - Animazione via Framer Motion sulla prop `width` (line 147-150)
- **Dove vive il logo**: nel `.logoWrap` dentro `<motion.aside>`, sopra lo scroll area (`Sidebar.tsx:172-193`). Desktop only (`!isMobile`). Swap runtime tra `logoHorizontal` (espansa) e `logoMark` (collassata).
- **Dove vive il footer / tenant switcher**: dentro `.sidebarHeader` al fondo dell'aside (`Sidebar.tsx:256-281`). Componente: `<BusinessSwitcher collapsed={collapsed} />` (line 260). Accanto, bottone toggle collapse (`motion.button`, line 263-279) con icona `ChevronLeft`, posizionato `position: absolute; right: -12px; top: 50%`.
- **Collapse**:
  - Esiste: **Sì**
  - State: locale nel parent `MainLayout` (`const [sidebarCollapsed, setSidebarCollapsed] = useState(false)`, `MainLayout.tsx:47`), passato come prop alla Sidebar.
  - Trigger: il toggle button in fondo alla sidebar.
  - **Nessuna persistenza in `localStorage`** — reset a ogni refresh.
  - Su mobile è forzato a non-collapsed: `collapsed={!isMobile && sidebarCollapsed}` (`MainLayout.tsx:71`).
- **Sezioni / raggruppamenti**: array config tramite `buildGroups()` (`Sidebar.tsx:50-105`). 5 gruppi: **Overview** (senza titolo), **Operatività**, **Contenuti**, **Insight**, **Sistema**. Interface:
  ```ts
  interface NavGroup { title: string | null; items: NavItem[] }
  ```
  Render in loop a partire da `Sidebar.tsx:198`.
- **Indicatore item attivo**: `NavLink` con `className={({ isActive }) => ...}` (line 208-216). Classe `.active` applicata se `isActive`. CSS attuale: `background: rgba(99, 102, 241, 0.1); color: #6366f1`. **Non è un filo verticale a sinistra** — il nuovo design lo richiede.
- **Card wrappers**: SÌ. Ogni gruppo è wrappato in `.groupCard` (`Sidebar.tsx:199`) con `background: #fff; border: 1px solid #f1f5f9; border-radius: 12px; padding: 8px` + ombra leggera.
- **Punti di intervento**:
  - **Rimuovere**: logo dalla sidebar (passa nell'header), footer con BusinessSwitcher (passa nell'header come TenantSwitcher), `.groupCard` wrappers, label dei titoli di sezione.
  - **Aggiungere**: divisori sottili tra i gruppi, toggle collapse spostato in basso (già lì oggi ma andrà rivisto fuori dal `.sidebarHeader`).
  - **Modificare**: indicatore attivo da background pillato a **filo verticale a sinistra** dell'item.

## 3. TenantContext — API attuale

- **Path tipo**: `src/context/TenantContext.ts` (definizione interface, 22 righe)
- **Path implementazione**: `src/context/TenantProvider.tsx`
- **Hook**:
  - `useTenant()` → `src/context/useTenant.ts:5`
  - `useTenantId()` → `src/context/useTenantId.ts` (include guard che redirige a `/workspace` se nessun tenant è selezionato, line 22-26)
- **Firma del return type di `useTenant()`**:
  ```ts
  interface TenantContextType {
    tenants: V2Tenant[];
    selectedTenant: V2Tenant | null;
    selectedTenantId: string | null;
    userRole: "owner" | "admin" | "member" | null;
    loading: boolean;
    selectTenant: (id: string) => void;
    refreshTenants: () => Promise<void>;
  }
  ```
- **Switch tenant oggi**: router-driven. `businessId` proviene da `useParams<{ businessId: string }>` (`TenantProvider.tsx:21`); `selectedTenant` è derivato sincronicamente dalla lista (line 27). `selectTenant(id)` salva in `localStorage` e fa router push (`TenantProvider.tsx:99-103`).
- **Lista tenant per dropdown switcher**: **disponibile eagerly nel provider**. Caricata al mount con query diretta su `user_tenants_view` (`TenantProvider.tsx:43-46`). Pronta da consumare via `useTenant().tenants` senza service call aggiuntive.
- **Campi tenant corrente disponibili**: `id`, `name`, `vertical_type`, `business_subtype`, `logo_url`, `plan`, `subscription_status`, `trial_until`, `stripe_customer_id`, `paid_seats`, `user_role`.

## 4. Auth — API attuale

- **Path tipo**: `src/context/AuthContextBase.ts`
- **Path implementazione**: `src/context/AuthProvider.tsx`
- **Hook**: `useAuth()` → `src/context/useAuth.ts:5`
- **Firma del return type di `useAuth()`**:
  ```ts
  interface AuthContextType {
    user: User | null;            // Supabase User
    loading: boolean;
    otpVerified: boolean;
    otpLoading: boolean;
    otpRefreshing: boolean;
    otpCheckFailed: boolean;
    signOut: () => Promise<void>;
    refreshOtp: () => Promise<void>;
    forceOtpCheck: () => Promise<void>;
  }
  ```
- **Dati utente disponibili**: `user.id`, `user.email`, `user.user_metadata` (può contenere nome/avatar se popolato in Supabase). Avatar URL **non esposto come campo diretto** del context — va letto da `user.user_metadata` se presente.
- **Logout**: `signOut()` (`AuthProvider.tsx:155-171`). Elimina la verification OTP via RPC, chiama `supabase.auth.signOut()`, resetta i flag. **Il redirect non è gestito qui** — è `ProtectedRoute` esterna a redirigere dopo signOut.

## 5. PageHeader / Page actions — situazione attuale

- **Esiste come componente riutilizzabile**: **Sì**.
- **Path**: `src/components/ui/PageHeader/PageHeader.tsx`
- **API (props)**:
  ```ts
  type PageHeaderProps = {
    title: string;
    titleAddon?: React.ReactNode;
    subtitle?: string;
    businessName?: string;
    actions?: React.ReactNode;
  };
  ```
- **Layout SCSS**: mobile `flex-direction: column`, gap `1rem`; @768px+ `flex-direction: row; align-items: center; justify-content: space-between` (actions a destra).
- **Posizione nel DOM**: primo elemento del contenuto della pagina, dentro `.content` (scroll container di MainLayout). **Non sticky attualmente.**
- **Usato in**: pagina Sedi (`Attivita.tsx`), Prodotti (`Prodotti.tsx`), Programmazione (`Programmazione.tsx`), Overview, Billing, ecc. — pattern uniforme.
- **Giudizio refactor per sticky futuro**: **leggero**. Aggiungere `position: sticky; top: 0; z-index: 10` + background/shadow al `.header` e opzionale `className` condizionale. Lo scroll container è già un div interno (`.content`), quindi sticky funziona out-of-the-box senza toccare MainLayout. Nessun refactor di pagine necessario.

## 6. Componenti UI riutilizzabili rilevanti

| Componente | Esiste | Path |
|---|---|---|
| DropdownMenu / Menu | ✅ | `src/components/ui/DropdownMenu/` (`DropdownMenu.tsx` + `DropdownItem.tsx`) |
| Button / IconButton | ✅ | `src/components/ui/Button/` (`Button.tsx`, `IconButton.tsx`) |
| Badge | ✅ | `src/components/ui/Badge/` |
| StatusBadge | ✅ | `src/components/ui/StatusBadge/StatusBadge.tsx` |
| Tooltip | ✅ | `src/components/ui/Tooltip/` (utile per label item sidebar collapsata) |
| Drawer | ✅ | `src/components/ui/Drawer/` |
| SystemDrawer | ✅ | `src/components/layout/SystemDrawer/SystemDrawer.tsx` (adattivo: 100% width <768px, fixed 520px desktop) |
| Popover | ❌ | Non esiste come componente dedicato — usare DropdownMenu o Drawer |
| Avatar | ❌ | Non esiste come componente UI. Pattern inline in `Sidebar.module.scss:80-100` (`.avatar`, `.avatarImage`, `.avatarInitial`) — **da estrarre** in fase 2 |

## 7. Responsive — situazione attuale

- **Breakpoints presenti nel codice**:
  - `768px` — usato da `PageHeader` e `SystemDrawer` (è il candidato target per il nuovo layout).
  - `900px` — usato da typography (`_typography.scss:110`, `@media (min-width: 900px)`).
  - `1023px` — usato da MainLayout per il toggle desktop/mobile della sidebar (`MainLayout.tsx:74`).
- **Hook `useMediaQuery` centralizzato**: **non esiste in `src/hooks/`**. Implementazione inline nei due layout (`MainLayout.tsx:49-71`, `WorkspaceLayout.tsx`) usando `window.matchMedia` + listener su change.
- **Comportamento sidebar oggi sotto soglia mobile**: sotto **1023px** (non 768px), la sidebar passa a `position: fixed; inset: 0; z-index: 50` con menu icon trigger nell'header mobile (`.mobileHeader`). Il `DrawerProvider` gestisce l'apertura. Non è quindi un vero drawer off-canvas dedicato — riusa lo stesso markup della sidebar desktop con override di posizionamento.
- **Drawer mobile generico già pronto**: `SystemDrawer` (mobile-aware, 100% width sotto 768px). Pattern riusabile come riferimento per un nuovo drawer off-canvas dedicato alla sidebar mobile, ma probabilmente serve un componente dedicato per evitare di mescolare semantica CRUD-drawer e nav-drawer.

## 8. Decisioni prese (assunzioni allineate con Lorenzo)

1. **Logo icona mobile/header**: si riusa lo stesso `logoMark` della Sidebar collapsed. Asset: `src/assets/brand/logo-mark.png` (import via `@/assets/brand/logo-mark.png`, riferimenti `Sidebar.tsx:27` e `Sidebar.tsx:185`).
2. **Notifiche backend**: NON in scope. La fase 2 di implementazione fa **stub UI** con `notifications: []` hardcoded. Il modello DB sarà una fase 3 separata e non blocca le fasi 1-2.
3. **Breakpoint mobile target**: **768px** (allineato a `PageHeader` esistente). Il refactor di `MainLayout.tsx:74` da `1023` a `768` farà parte della fase 3 (responsive), NON della fase 1.
4. **Avatar utente**: creare un nuovo componente `src/components/ui/Avatar/Avatar.tsx` come parte della fase 2. API minima:
   ```ts
   type AvatarProps = {
     name?: string;
     imageUrl?: string;
     size?: "sm" | "md" | "lg";
     gradient?: string;
   };
   ```
   Estrarre il pattern esistente da `Sidebar.module.scss:80-100`.
5. **Hook `useMediaQuery`**: creare `src/hooks/useMediaQuery.ts` nella fase 3. **Non** refactorare MainLayout/WorkspaceLayout in fase 1 — solo aggiungere l'hook e usarlo nei nuovi componenti.
6. **`SiteLayout`** citato in `CLAUDE.md` ma **inesistente** in `src/layouts/`: cleanup separato per il futuro, non bloccante. Tracciare come task indipendente.

## 9. Rischi residui

- **TenantProvider esterno a MainLayout**: il nuovo header full-width vive **dentro** MainLayout, quindi avrà accesso a `useTenant()`. OK. Da verificare che le route che usano `WorkspaceLayout` (es. `/workspace`) **non abbiano** TenantProvider (confermato). Se mai si volesse riusare l'header anche fuori da MainLayout serve un componente "header in standalone" con guard.
- **`schedule_targets` RLS gap** e altri rischi di sicurezza citati in `CLAUDE.md` sono **fuori scope** di questo lavoro.
- **TenantProvider lazy on switch**: oggi `selectTenant` fa router push; assicurarsi che il nuovo TenantSwitcher invochi `selectTenant(id)` e NON manipoli direttamente l'URL.
- **Indicatore "filo verticale" su NavLink**: serve un wrapper o `::before` pseudo-element. Verificare che `NavLink.active` consenta lo styling — in CSS modules è standard, nessun blocco previsto.
- **Disallineamento breakpoint 1023 vs 768**: in fase 1 e 2 la sidebar continuerà a usare 1023 per il mobile switch. La fase 3 riallinea tutto a 768. Nel frattempo nuovi componenti header devono usare 768 per coerenza con `PageHeader`.

## 10. Fasi di implementazione proposte

- **Fase 1 — Shell**: rifare MainLayout + Sidebar.
  - Aggiungere `<header>` full-width in MainLayout (vuoto, solo struttura + altezza).
  - Sidebar nuova: no logo, no BusinessSwitcher footer, no `.groupCard` wrappers, no label di sezione. Divisori sottili tra gruppi. Toggle collapse in basso. Indicatore attivo come filo verticale a sinistra.
  - Nessuna nuova logica di business.
- **Fase 2 — Header content**: popolare l'header.
  - Logo (clickable, link a `/business/:businessId/overview`).
  - `TenantSwitcher` (DropdownMenu + `useTenant().tenants`).
  - `NotificationsBell` (stub `notifications: []`, badge nascosto se vuoto).
  - `UserMenu` (DropdownMenu con email + logout via `useAuth().signOut`).
  - Nuovo componente `Avatar` in `src/components/ui/Avatar/`.
- **Fase 3 — Responsive + persistenza**:
  - Hook `useMediaQuery` in `src/hooks/`.
  - Drawer mobile off-canvas (componente dedicato, riusa pattern SystemDrawer ma non SystemDrawer direttamente).
  - Persistenza collapse in `localStorage["cg:sidebar-collapsed"]`.
  - Allineamento del breakpoint sidebar a 768px (refactor `MainLayout.tsx:74` e `WorkspaceLayout.tsx`).
