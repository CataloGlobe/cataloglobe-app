# CLAUDE.md — CataloGlobe

Regole vincolanti. In caso di dubbio: seguire il pattern esistente nel codice.

**Riferimenti**:
- Architettura completa: `docs/architecture.md`
- Regole estese: `docs/ai-operational-rules.md`
- Route: `docs/routes.md`
- Schema DB e fact critici: `docs/database-reference.md`
- Edge Functions + bug history: `docs/edge-functions.md`
- Scheduling (Programmazione): `docs/scheduling.md`
- Epic "Ordinazioni dal tavolo": `docs/orders-architecture.md` (v1.2) — state machine, RPC, optimistic locking, error code, roadmap 6 fasi. Dettaglio pattern: `docs/patterns/epic-ordering.md`
- Security Advisor stato: `docs/security-advisor-status.md`
- **Permissions Matrix** (v3, Track A completo): `docs/permissions-matrix.md` — 50 permessi, matrice ruolo×permesso, gating FE per pagina, readiness Fase 1
- Roadmap: `docs/roadmap.md`
- **Pattern dettagliati** (`docs/patterns/`): `delete-drawer.md`, `activity-detail.md`, `draft-unsaved-bar.md`, `public-page.md`, `style-editor.md`, `ui-components.md`, `storage-sql.md`, `epic-ordering.md`, `status-page.md`

---

## Quick start

```bash
npm install
npm run dev          # vite dev server
npm run build        # tsc -b && vite build
npm run lint         # eslint .
npm test             # vitest run
npm run test:watch   # vitest watch
bash scripts/e2e.sh e2e/<pagina>.spec.ts  # e2e contro staging: solo spec singole — vedi ## Test e2e
```

---

## Stack tecnologico

- React 19 + TypeScript 5.9 (strict) + Vite 7
- React Router v7 — tutte le route in `src/App.tsx`
- Supabase JS v2 — client solo in `src/services/supabase/client.ts`
- Framer Motion v12 — animazioni
- SCSS Modules (`.module.scss`) — niente CSS inline
- Icons: Lucide React + `@tabler/icons-react`
- Charts: recharts | DnD: @dnd-kit | Testing: Vitest | Export Excel: xlsx-js-style

---

## Architettura

- **Service layer obbligatorio**: `Componente → src/services/supabase/<dominio>.ts → Supabase Client → PostgreSQL`. MAI chiamare Supabase da componenti React.
- **Un file service per dominio**. Firma: `list*(tenantId)`, `get*(id, tenantId)`, `create*(tenantId, data)`, `update*(id, tenantId, data)`, `delete*(id, tenantId)`.
- `list*` ritorna `T[]` (mai null). `get*` lancia errore se non trova. `delete*` ritorna `void`.
- **Errori**: controllare `error.code` — `PGRST116` (not found), `23503` (FK violation), `23505` (duplicate). Poi `throw error`.
- **Route**: tutte in `src/App.tsx`. Business routes sotto `/business/:businessId/`. `businessId` = source of truth per tenant. Lista completa in `docs/routes.md`.
  - **Route a segmento singolo** (`/login`, `/status`…): ogni nuova va registrata, nello stesso commit, in tre posti oltre ad `App.tsx`. (1) `vercel.json`: nella rewrite a `/app.html` (shell dell'app; `dist/index.html` è la landing) che sta PRIMA della regola `/:slug`, altrimenti passa da `/api/ssr-render` e risponde 404; va aggiunta anche al lookahead delle due regole `headers` che rilassano X-Frame-Options. (2) `RESERVED_SEGMENTS` in `api/ssr-render/index.ts`. (3) `is_reserved_slug()` con una nuova migration (`CREATE OR REPLACE` partendo da `pg_get_functiondef` sul live), così nessuna sede può prendere quello slug. Landing di campagna su `/` (variante form) e `/b` (signup, canonical su `/` + `noindex` a runtime); `/landing-dev` e `/landing-dev/b` fanno 301 nei `redirects` di `vercel.json` e restano riservati (lookahead, `RESERVED_SEGMENTS`, `is_reserved_slug()`).
- **Layout**: `MainLayout` (business), `WorkspaceLayout` (workspace), `SiteLayout` (pubblico). Non crearne di nuovi. Entrambi i layout admin (business + workspace) hanno `AppHeader` globale fisso in alto + sidebar a sinistra; il workspace usa `AppHeaderWorkspace` (logo + greeting "Ciao {firstName}" + notifiche + avatar, niente tenant pill). Header business a cartelle (§51.8): logo / azienda ▾ / sede ▾ / pagina; sotto 768 solo azienda e sede: la sede tiene la sua misura, l'azienda prende lo spazio che avanza (`flex: 1 1 0`, `max-width: max-content`) fino al cerchio con le iniziali, che apre ancora il menu; se la sede da sola non ci sta, si accorcia anche lei. Non con un fattore di `flex-shrink`: la sede cede comunque una frazione di pixel e i puntini compaiono. Il selettore di sede (`HeaderSedeSwitcher`) c'è in ogni contesto: una sede (nome + «Aggiungi una sede»), più sedi fuori («Tutte le sedi», scegliere entra), dentro una sede (cambiare resta sulla stessa pagina, `switchSedePath`); accanto alla sede solo «Sospesa». «Aggiungi una sede» = `AddActivityDrawer` + `useAddActivityGate`, lo stesso flusso di Sedi. Dopo creare/eliminare/rinominare/sospendere una sede: `refreshActivitiesCache(tenantId)`, che avvisa sidebar e header.
- **Navigazione e atterraggio** (§51): si conta sulle sedi **leggibili** (`useSedeScope().readableActivities`). Una → sidebar unica (`TenantSidebar context="unica"`), niente pagina Sedi (`/locations`, `/analytics`, `/reviews` → rotte della sede, `SingleSedeRoute`). Più → azienda (Panoramica · Sedi | Catalogo | Pagina pubblica | Andamento) e sede (`SedeSidebar`: «← Tutte le sedi» | Il locale | Operatività | Andamento). Piede: Impostazioni · Assistenza · apri/chiudi; nella sede solo Assistenza (Impostazioni è dell'azienda). Voci, gruppi, ordine, gate e segnali dei tre contesti **solo** in `src/utils/navModel.ts` (`NAV_MODELS`), letti da sidebar (`navSidebarGroups`), header e atterraggio; `navLanding.ts` tiene solo i vecchi `?tab=`. Gli ingressi nell'azienda puntano a `/business/:businessId` (`BusinessHomeRedirect` → `businessHomePath`): chi configura (owner, admin, `activity.manage`) la Panoramica; staff/viewer con una sede la prima voce di Operatività usabile, con più sedi Sedi. L'indice della sede (`SedeHomeRedirect` → `sedeLandingSegment`): Scheda per chi la gestisce, prima voce di Operatività usabile per gli altri; i vecchi `?tab=` vincono. Sidebar (§51.15): aperta 232 / chiusa 64, righe 36 e slot titolo 36 (testo in basso, lo spazio sta sopra) identici nei due stati (e2e lo misura), si anima solo la larghezza. Fra i gruppi solo titoli (aperta) e trattini (chiusa), nessun divisore. Titoli muted come le voci: nessun token più chiaro tiene 4,5:1 su `--surface` in chiaro.
- **Provider esistenti**: AuthProvider, TenantProvider, PermissionsProvider (solo dentro `/business/:businessId/*`), DrawerProvider, ToastProvider, ThemeProvider, TooltipProvider. Non crearne di nuovi senza necessità.
- Un contesto sta in tre file: l'oggetto `createContext` in un `.ts`, l'hook in `use*.ts`, il provider nel `.tsx` (regola `react-refresh/only-export-components`: un file di componenti esporta solo componenti).

---

## Tenant Isolation

- `tenant_id` SOLO da `useTenantId()` o `useTenant().selectedTenantId`. **MAI** da `auth.user.id`.
- OGNI write al DB include `tenant_id`. Nessun dato cross-tenant (eccezione: `allergens`).
- RLS obbligatorio su ogni tabella tenant-scoped: `tenant_id IN (SELECT get_my_tenant_ids())` (NON `= ANY(...)` — funzione set-returning). Per scope activity-granulare usa `has_permission(permission_id, activity_id?)` — vedi `## Sistema permessi multi-sede`.
- **Parent dello stesso tenant (CG-01, mig `20260930150000`)**: sulle tabelle figlie/ponte (categorie, collegamenti catalogo, opzioni, allergeni, attributi, in evidenza…, e `stories.product_id`, mig `20261005200000`) due policy RESTRICTIVE `Parent same tenant on insert/update`: ogni FK verso un'entità tenant-scoped deve puntare a una riga dello stesso tenant (ammessi i parent di piattaforma con `tenant_id` NULL). Nuova tabella figlia = stessa coppia di policy.
- **Tabelle di sede (CG-09, mig `20260930150400`/`150500`)**: trigger `enforce_activity_tenant_match()` sulle tabelle con `activity_id` + `tenant_id`: `tenant_id` diverso da quello della sede → 42501 `activity_tenant_mismatch`. Nuova tabella di sede = aggiungere il trigger. `orders` e `customer_sessions` agganciano solo un `order_group` della stessa sede (`order_group_activity_mismatch`).
- **`activities.tenant_id` e `activities.id` immutabili (CG-07)**: trigger `prevent_activity_reparent()`. Spostare una sede in un'altra azienda non è un'operazione supportata.

---

## Sistema permessi multi-sede

### Ruoli (5)

Modello post-Fase 2: scope tenant-wide vs activity-scoped.

- **owner**: `tenants.owner_user_id` (NESSUNA riga in `tenant_memberships`)
- **admin**: `tenant_memberships.role='admin'` (scope tenant-wide)
- **manager / staff / viewer**: `tenant_memberships.role=NULL` + righe in `tenant_membership_activities` con `role + activity_id` (scope activity)

### Backend permission system

- Tabella `permissions`: 50 permessi (25 `tenant`, 25 `activity`, staging 01/10/2026); `role_permissions` = matrice ruolo×permesso. Fonte autoritativa la tabella, non il conteggio scritto qui
- Helper SECURITY DEFINER:
  - `has_permission(p_permission_id text, p_activity_id uuid DEFAULT NULL) → boolean`
  - `has_permission_any_activity(p_permission_id text, p_tenant_id uuid) → boolean`
  - `get_my_activity_ids() → setof uuid`
  - `get_my_tenant_ids() → setof uuid`
- Pattern RLS: `USING (has_permission('<perm>.read', activity_id))` per tabelle activity-scoped
- **Self-mod guard server-side**: `change_member_role` e `remove_tenant_member` rifiutano con `42501` se `target_user_id = auth.uid()`
- **Owner synthetic row** in `get_tenant_members`: `membership_id` sentinel `'00000000-0000-0000-0000-000000000000'` (owner non ha tm post-Fase 5.B.2 cleanup)

### RPC pubbliche (frontend)

| RPC | Scope | Note |
|---|---|---|
| `get_my_permissions(uuid)` | tenant | 42501 se non membro. Returns role + activity_ids + permissions[] |
| `get_tenant_members(uuid)` | tenant | Requires `team.read`. Owner synthetic first |
| `invite_tenant_member` | tenant | Sig 4 args (tenant_id, email, role, activity_ids[]) |
| `change_member_role` | tenant | Sig 3 args (membership_id, new_role, activity_ids[]) + self-guard |
| `remove_tenant_member(uuid)` | tenant | Sig single arg + manager scope + tma cleanup |
| `get_invite_info_by_token(uuid)` | pre-auth | anon + authenticated |
| `get_my_pending_invites()` | user | Per InviteModal workspace |
| `has_permission(text, uuid?)` | inline | Usato in policy RLS |

### Frontend libraries

- **`src/lib/permissions.ts`** — `UserPermissions, UserRole, isOwner(perms), canDoOnTenant, canDoOnActivity, canDoOnAnyActivity, isOwnerOrAdmin, isTenantWide, canChangeRoleOf, canRemoveMember, canInviteRole, canEditSchedule`. **SOLO dentro `/business/:businessId/*`** (richiede `PermissionsProvider`).
- **`src/utils/workspaceRole.ts`** — `workspaceRoleIsOwner, workspaceRoleIsAdmin, workspaceRoleIsScoped`. **SOLO per workspace** (`/workspace/*`, `/select-business`). Literal compare su `tenant.user_role` da `get_user_tenants` view (no PermissionsProvider in scope).
- **`src/context/usePermissions.ts`** — `usePermissions()` hook: `{ permissions, loading, refresh }` (provider in `PermissionsContext.tsx`, contesto in `permissionsContextBase.ts`). Manual `refresh()` dopo cambio ruolo runtime (no realtime).

### Pattern UI

- **Locked state**: `EmptyState` + `Lock` icon (size 40, strokeWidth 1.5) usato in TeamPage / SubscriptionPage / BusinessSettingsPage per `!canDoOnTenant(perms, '<read>')`. Pre-check permission → if locked, return Locked block early.
- **Sidebar gating**: `NavItem.permission?: (perms) => boolean` filter per voce. Loading-optimistic: `permissions===null` mostra tutte le voci (transitorio). Gruppi vuoti nascosti.
- **Skip fetch pre-check**: se `!canRead<resource>` NON chiamare RPC (evita `42501` inutile). Esempio: `TeamPage` useEffect guard.
- **Self-modification frontend guard**: `canChangeRoleOf` / `canRemoveMember` accettano opzionale `callerUserId` → ritorna `false` se `target.userId === callerUserId`. Backend ha guard hardcoded (defense in depth).

---

## Drawer Pattern

TUTTE le operazioni CRUD usano drawer laterali destri. MAI modali centrate.

```
SystemDrawer → DrawerLayout (header/children/footer) → DomainForm (collegato via form="id")
```

- Submit button nel footer del DrawerLayout, collegato al form via attributo `form`.
- Form separato dal drawer. Props form: `formId`, `mode`, `entityData`, `tenantId`, `onSuccess`, `onSavingChange`.
- Post-success: `onSuccess()` → reload dati → chiudi drawer → toast.
- Dimensioni: sm=420px, md=520px (default), lg=720px.

**Eliminazione multipla**: mai subito dalla `BulkBar`. `ConfirmDialog` col conteggio, selezione controllata (annulla la rimette), esito per numero con i rifiuti per vincolo (23503) a parte. Hook condiviso `useBulkDelete` (`src/hooks/`), usato da Prodotti e In evidenza; Menù e Programmazione hanno la stessa forma scritta in pagina. Il guard dell'abbonamento è uno solo: `useEnsureActive` (`src/hooks/`), mai la stringa «Abbonamento non attivo…» copiata in pagina.

**Delete drawer**: 3 pattern (A blocco preventivo / B informativo+cleanup / C swap-then-delete) scelti via FK inbound. Default sicuro = B. Dettaglio + anti-pattern: `docs/patterns/delete-drawer.md`.

---

## Page Pattern

State `items[] + isLoading`, `loadData` via `useCallback` + `useEffect`, drawer state (`isDrawerOpen + mode + selected`). `handleSuccess`: `await loadData() → close → toast`.

JSX: chiama `usePageHeader({ title, subtitle, actions? })` PRIMA di qualsiasi early return → contenuto pagina (`FilterBar` → `DataTable`) → `CreateEditDrawer` → `DeleteDrawer`. Il `PageHeader` è renderizzato dal `PageHeaderSlot` centralizzato in `MainLayout`/`WorkspaceLayout` via `PageHeaderContext`. Pattern valido per business + workspace.

---

## File Structure per Dominio

```
Dominio/
├── Dominio.tsx                 # Lista (state + drawer open/close)
├── DominioPage.tsx             # Dettaglio (se serve)
├── DominioCreateEditDrawer.tsx
├── DominioDeleteDrawer.tsx
└── components/
    └── DominioForm.tsx         # Form puro, nessuna logica drawer
```

---

## Pattern: draft inline + UnsavedChangesBar

Pattern per editing rapido. Sostituisce debounce manuale (`useRef<setTimeout>`) — **tech debt chiuso**, NON reintrodurre.

- State diviso `draft` + `saved` nel parent. `isDirty` deriva dal diff.
- Componenti figli **controlled** (`value` + `onChange`, no state interno).
- `<UnsavedChangesBar>` appare solo se `isDirty`. Annulla = `setDraft(saved)`. Salva = service call → reload.
- Toggle binari (`*_public`) restano save-immediato.

Esempi in produzione: `SchedaTab` (6 sezioni prodotto), `ActivitySettingsTab`. Dettaglio + accordion single-open: `docs/patterns/draft-unsaved-bar.md`.

**Variante page-level (prodotto)**: `ProductPage.tsx` solleva il draft Scheda a livello pagina (hook `useSchedaDraft`: `isDirty`/`isSavingAll`/`handleSaveAll`/`handleDiscardAll`) → il draft sopravvive al cambio tab. Azione Salva/Annulla **unica** nell'header via `HeaderSaveAction` (`src/components/ui/HeaderSaveAction/`, con `buildSaveActionCompactConfig` per la barra compatta), NON una `UnsavedChangesBar` per-sezione. I toggle binari restano save-immediato. Le sezioni allergeni/ingredienti/caratteristiche editano in drawer dedicati che dicono «Applica» (portano in bozza, non sul DB). Nella stessa bozza stanno i valori degli attributi (`useAttributeValuesDraft`, §27: mai più `onBlur` che scrive): `ProductPage` somma i due `isDirty`, «Salva»/«Annulla» chiamano entrambi, guardia all'uscita `useUnsavedChangesGuard`. Restano immediate le azioni strutturali (assegna/togli un attributo, gruppi del prodotto in Utilizzo) e tutta la tab Prezzi & Opzioni, che lo dice in testa. Senza `products.write` la pagina mette le tab in un `fieldset disabled` con banner «Sola lettura» e toglie `HeaderSaveAction`.
`ProductForm` crea soltanto (`create_base`, `create_variant`; Prodotti, Menù, In evidenza): un prodotto si modifica nella sua pagina. Creato il prodotto, un passo che fallisce dopo non lo ricrea: finisce in un toast `warning` («Non salvati: …») e il form va avanti. La variante entra nei gruppi del padre e il form lo dice. Regole di scelta in `components/choiceRules.ts`: `max_selectable` null = senza limite, valido e mai riscritto aprendo un gruppo; N = 1, 0, non intero o non numerico (badInput) è un errore.

---

## Pagine custom

- **Sede** (`/business/:businessId/locations/:activityId/…`) — otto voci in tre gruppi (§51.5): **Il locale** (Scheda · `cosa-vedono`) · **Operatività** (`servizio` · `prenotazioni` · `comande` · `storico`) · **Andamento** (`analitiche` · `recensioni`). Scheda = `anagrafica` · `orari` · `ordini-prenotazioni` · `pubblicazione`, tab in testata, parent `ActivityDetailPage` con draft unico. Le altre voci stanno fuori dal parent; `analitiche` e `recensioni` montano `AnalyticsPage` e `Reviews` con la sede dal path. I vecchi `?tab=` passano da `legacyTabTarget`. Dettaglio: `docs/patterns/activity-detail.md`.
- **Servizio** (`/locations/:activityId/servizio`, §50.22, §50.23): tre modi in `?modo=` da `src/utils/servizioModes.ts` — **Elenco** (predefinito, `ServizioElenco`: In sala adesso · In arrivo · Concluse, walk-in, drawer della tavolata; `reservations.read` + `seatings.read`, piano `table_reservation`), Mappa (`TablesLiveView` + pannello del conto, `tables.read` + `orders.read` + `table_ordering`), Gestisci la sala (`TablesManagement`, `tables.read`). La voce si vede con `tables.read` o `seatings.read`; si atterra solo su un modo usabile (`NavEntry.usable`): col piano Pro l'Elenco, col base Gestisci la sala; un `?modo=` col lucchetto passa al primo usabile. `/sala`, `?tab=sala|tables`, `comande?tab=tavoli` e `prenotazioni?tab=service` reindirizzano. **Storico** (`/storico`) è una voce, non una tab (`comande?tab=storico` reindirizza). Comande è la sola board, senza tab. Capienza e durata stanno nella Scheda «ordini-prenotazioni» (`#capienza`), sotto `activity.manage`.
- **Route pubbliche slug-based**: dichiarate UNA VOLTA in `src/routes/publicRoutes.tsx`, consumate da `App.tsx` e `src/entry-client.tsx`. Mai aggiungere una route pubblica direttamente in un entry. Il catch-all `*` resta invece per-entry: è il fallback terminale del set di route di quell'entry, non una route pubblica.
- **Pagina pubblica** (`/:slug`) — flusso `resolve-public-catalog` → `CollectionView`. Container queries (`@container collection`, MAI `@media`). 4 combinazioni card prodotto (Card/Compatto × List/Grid). Slot featured: solo `before_catalog`/`after_catalog` (hero rimosso). Dettaglio: `docs/patterns/public-page.md`.
- **Pacchetto di `api/ssr-render`**: `dist-server/entry-server.js` si carica con un `import()` su un percorso calcolato. Vercel ne traccia i `node_modules`, ma per i pacchetti con `exports` condizionali (`module-sync` / `import` / `default`) include un solo ramo. Dal 06/10/2026 (cambio di piattaforma Vercel, deploy costruiti da ~14:00) il runtime risolve senza `module-sync`, e le sedi rispondevano `fallback:render_error` (`Cannot find module …/react-router-dom/dist/index.js`). Ogni dipendenza esterna di `entry-server` risolta via `exports` condizionali va inclusa esplicitamente negli `includeFiles` di `ssr-render` in `vercel.json` (oggi `node_modules/react-router-dom/dist/**` e `node_modules/react-router/dist/**`). Verifica in locale: `vercel build`, poi pacchetto ricostruito (`.func` + i file di `filePathMap` in `.vc-config.json`), poi `node --no-experimental-require-module -e 'import("./dist-server/entry-server.js")'` dentro il pacchetto. Dopo il deploy: header `X-Cataloglobe-Ssr: ready:live` su una sede.
- **PublicSheet** — modali pagina pubblica. **Non usare** SystemDrawer/DrawerLayout nella pagina pubblica. iOS scroll-lock via `body.position:fixed` (scroll listener su window deve leggere `body.style.top` durante lock). Import: `@components/PublicCollectionView/PublicSheet/PublicSheet`. Dettaglio: `docs/patterns/public-page.md`.
  - **Uscita mobile su WAAPI (`element.animate()`), non spring Framer**: il rilascio del body-lock a inizio uscita è un reflow full-page sincrono che stalla una spring JS (rAF, main thread) su iOS Safari/WebKit — la WAAPI gira sul compositor ed è immune. Il body-lock **deve** restare rilasciato a inizio uscita (rilasciarlo a fine animazione = ~300ms di input bloccato). Drag resta su motion value Framer (deve seguire il dito); solo release/uscita passa a WAAPI. Fallback spring Framer se `element.animate` assente — `y.set(targetY)` va eseguito solo sul path WAAPI.
  - **`dragMomentum={false}` obbligatorio** sul panel draggabile: con momentum attivo, Framer continua a scrivere l'inline `transform` sotto la WAAPI e al `cancel()` il panel ricade sulla posizione stale del momentum (glitch). Un solo owner del `transform` per volta durante l'uscita.
  - **Mai `backdrop-filter` su elemento che trasla** (impedisce compositing layer, forza ri-rasterizzazione ad ogni frame su WebKit): il glass card treatment resta solo sul dialog desktop, mai sul bottom sheet mobile.
  - **Immagini**: prefetch immediato (`new Image().src` all'apertura) + `width`/`height`/`decoding="async"` espliciti. Non differire il render di un'immagine già prefetchata (pop-in senza motivo) e non differire il fetch (pop-in visibile).
  - **Testing performance iOS**: solo su iPhone reale, sessione **incognito** — iOS Safari serve il bundle vecchio dalla cache con grande persistenza; un test post-deploy su tab normale misura quasi certamente codice stale. Playwright su Chrome desktop verifica assenza di regressioni, non presenza di un fix WebKit.
  - Listener di scroll su `window` (header lerp, section-tracking, nascondi/mostra della bottom bar) vanno congelati a sheet aperto: `hasOpenSheet()` (`hooks/openSheets.ts`) + prop `frozen` su `PublicCollectionHeader` e `useBottomBarAutoHide` — il lock/unlock del body genera scroll event spuri (`position:fixed` azzera `scrollY`, il `scrollTo` al rilascio ne genera un altro) proprio nei frame critici dell'animazione.
  - **Niente `scroll-behavior: smooth` sul documento** nelle pagine che montano PublicSheet: il body-lock ripristina la posizione con `scrollTo` al rilascio, e col CSS globale diventa uno scorrimento visibile alla chiusura. Ancore interne gestite in JS (delega del clic + `scrollIntoView`, vedi `src/pages/CampaignLanding/components/Frame/Frame.tsx`).
  - **Demo della landing in iframe** (`CampaignLanding/components/sections/Demos/Demos.tsx`, `DemoFrame`): riconosce una pagina pubblica fallita da `#not-found-title` (`NotFound.tsx`) e da `#root > [role=alert]` (stato `error` di `PublicCollectionPage`), poi sostituisce l'iframe con un messaggio. Rinominare quell'id o cambiare il ruolo/la posizione del blocco errore = lo sheet torna a mostrare il 404 con «Torna alla home» che naviga dentro l'iframe. Aggiornare `DemoFrame` nello stesso commit.
  - **`LandingFallback` = stesso CSS del pannello hero** (`CampaignLanding/LandingFallback.module.scss` ↔ `.panel` in `sections/Hero/Hero.module.scss`): stessa `min-height` in `svh` (mobile `calc(100svh - 20px)`, desktop `min(calc(100svh - 32px), 1000px)`), padding esterno, raggio e sfondo. Altezza solo CSS, mai calcolata in JS: se divergono, l'hero cambia misura all'arrivo del chunk lazy (CLS). Modificarli nello stesso commit.
- **Style Editor** (`/business/:businessId/styles/:styleId`) — preview/runtime devono restare sincronizzati via `parseTokens()`. Salva in testata (`HeaderSaveAction`) + `useUnsavedChangesGuard`; una sola vista in sola lettura (pannello in `fieldset disabled` + banner) per chi non ha `styles.write`, per l'abbonamento fermo e per gli stili di sistema. L'avviso «Stile in uso» non si spegne: mai una chiave `localStorage` che nasconde un avviso (§34.5/3). Eliminare uno stile in uso = drawer `sm` col sostitutivo (Pattern C), non usato = `ConfirmDialog`. Il solo nome non crea una versione né chiede l'avviso; il ripristino di una versione passa dallo stesso avviso ed è spento con la bozza sporca. L'anteprima usa `DeviceFrame fit="contain"` (solo host ad altezza vincolata). Elenco su `CardGrid` con `StyleSwatch` (SVG, colori negli attributi `fill`, niente `style={{}}`). Dettaglio: `docs/patterns/style-editor.md`.
- **Stories** (`/business/:businessId/stories/...`) — editor a blocchi (`StoryBlockEditor`, blocchi in `src/pages/Dashboard/Stories/components/blocks/`): tipi `heading`, `quote`, `list` (bullet/check), `image` (framing 3:2/4:5 via `StoryImageFramingDrawer` + stack framing condiviso), `text`, `video`. Metadati tipo in `blockTypeMeta.ts`; ogni nuovo blocco = type TS + component + entry meta + factory + voce menu. Body persistito come JSONB `stories.body_blocks[]`. Render pubblico via `resolve-public-story` (parallelo a `resolve-public-catalog`).
  - **Emphasis inline ristretta** (`src/components/PublicCollectionView/StoryView/blocks/parseInlineEmphasis.ts`): riconosce SOLO `**bold**` e `*italic*` — no nesting, marker spaiati restano literal, longest-match (`**` prima di `*`). Emette nodi TS (`text`/`strong`/`em`), **MAI HTML** → React escapa il testo, nessun vettore XSS. La regex di strip-excerpt in `resolve-public-story/index.ts` DEVE rispecchiare le stesse regole (header `⚠️ SYNC` in `parseInlineEmphasis.ts`).
  - **Il cappello** (`tenants.story_*`) non è una collezione sorella: `Card` in cima all'elenco + drawer `md` con «Salva» immediato (`useBrandStoryDraft`, RPC `update_tenant_story_settings`). Mai più una tab «Storia del brand» con una seconda bozza nella pagina.
  - Editor: bozza di pagina + `HeaderSaveAction` + `useUnsavedChangesGuard` (`useBeforeUnloadWarning` è uscito).
  - Immagini (copertina, blocchi, cappello) su un percorso nuovo a ogni upload, mai `upsert`: il file vecchio si toglie dopo la scrittura riuscita, quello nuovo dopo una fallita. Una lettura sola dei prodotti base per pagina (`StoryProductOptions`). Chi non ha `stories.write` legge in `fieldset disabled`, lo stato è un'etichetta.
  - **Per sede** (§34.7, §50.13): `stories.activity_id` null = tutta l'azienda, una sede = solo lei; si sceglie nella card «Dove appare» dell'editor (bozza di pagina). `ON DELETE CASCADE`: il dialogo di eliminazione della sede dice quante storie se ne vanno (`countStoriesForActivity`). Tenant garantito dal DB: FK composita (activity_id, tenant_id) + policy per scope (PR #147).
- **In evidenza** (`/business/:businessId/featured/:id`) — una pagina, un Salva (§28.3): `useFeaturedDraft` (tipo, testi, immagine, bottone) + `useFeaturedProductsDraft` (nota, ordine, togli, aggiungi esistenti), un `HeaderSaveAction`, guardia all'uscita. La modalità di prezzo si deriva dal tipo, mai un campo (`featuredContentTypes.ts`, provato in `src/tests/featured/`). La tab Prodotti segue il tipo della bozza. Subito solo «Nuovo {prodotto}»; il prodotto si apre nella sua pagina, non si modifica qui (§49.1/3).
- **Analitiche** (`/business/:businessId/analytics` = totale delle sedi leggibili, `/locations/:activityId/analitiche` = la sede; nessun selettore, §51.10) — ordine fisso per tipo di dato (§36): banda del campione (`SampleBand`, «Visite», definizione) · Cosa cercano · Cosa guardano · Recensioni · Ordini al tavolo · Prenotazioni; una sezione senza dati nel periodo scende in fondo (`CollapsedSections`, una riga col perché e un'uscita). Sotto 100 visite niente percentuali né confronti (`SAMPLE_THRESHOLD`), il confronto chiede una base minima (`MIN_DELTA_BASE`), tutto in `utils/periodComparison.ts` coi test. Periodo in `?period=` (default 30 giorni), «Oggi» dalla mezzanotte di Roma. Due serie mai su due assi y: due `TrendChart` sulla stessa x (`utils/analyticsSeries.ts`).
- **Cosa vedono i clienti** (`/locations/:activityId/cosa-vedono`; `/disponibilita` rimanda, con `?vista=`) — banda dell'esito (menù e regola che vince, conteggi, «Cosa manca»), provenienza e prezzo per riga da `explainCatalog` (`src/utils/catalogExplanation.ts`, contract test `catalogExplanation.contract.test.ts`). Banda, provenienza, prezzo dalla regola e menù attivo solo con `canExplainActivityCatalog` (`scheduling.read` sulla sede + `activity_groups.read`): il resolver del pannello legge con le RLS, l'Edge con `service_role`. Senza, la riga «Per vedere perché, serve l'accesso a Programmazione.» e, se il menù non risulta, «non è visibile con il tuo accesso», mai «Nessun catalogo attivo». Legge chi ha `activity.read`, scrive chi ha `activity.manage`; tri-stato scritto («Come dice la regola» con la spiegazione, «Regola» a vista sotto 768, nome intero nel nome accessibile), vista in `?vista=`. Fuori dal parent della Scheda: legge la sede da sé. «Vai a Programmazione» passa `?sede=<id>`, che è il filtro sede della pagina di Programmazione (§51.11): si esce dal contesto sede.
- **Sedi** — `ActiveCatalogMeta.hiddenCount`/`unavailableCount` valgono `null` quando il conteggio non si carica: la card dice «Modifiche a mano non caricate», mai «nessuna».
- **Lingue** resta pagina propria (L1, §50.14): salva subito, ha stato vivo e un gate suo; `translations.write` per scrivere, `catalogs.read` per leggere finché non esiste `translations.read`.
- **Recensioni** (`/reviews` = totale con la sede su ogni riga, `/locations/:activityId/recensioni` = la sede, §51.10): feedback privato del locale (R1). Niente moderazione: riepilogo su tutti i voti del periodo, poi un elenco unico (stelle, ricerca, periodo, ordine) con Elimina solo per `reviews.delete`. `status` resta nello schema ma non si legge né si scrive: dalla mig `20261005210000` nessun membro aggiorna una recensione e anon non ha privilegi; `submit-review` inserisce col service role. La pagina pubblica non mostra recensioni (né media né conteggio, nemmeno nel payload): dopo il voto, con 4–5 stelle e `google_review_url`, il rinvio a Google.

---

## Scheduling (Programmazione)

Quattro `rule_type` su stesso modello `schedules`: `"layout"` (quale catalogo mostrare — è quello che la checklist di Panoramica conta come «regola attiva», `overviewStats.ts`) · `"price"` · `"visibility"` · `"featured"` (`scheduleResolver.ts:25`, `layoutScheduling.ts:23`). Non esiste `"catalog"`. Resolver via **competizione** (1 sola regola vince per sede per tipo). Sistema bozze (`enabled=false` finché campi obbligatori mancanti). Periodo + giorni combinabili.

Dettaglio rule resolver, sistema bozze, simulatore, schema tabelle: `docs/scheduling.md`.

**Dettaglio regola**: una sola pagina, `RuleDetailPage.tsx`, montata su `/scheduling/:ruleId` e `/scheduling/featured/:ruleId`, stato in `useRuleDetail.ts`. Forma del form, lettura dalla regola, validazione e campi mancanti della bozza stanno in `src/utils/ruleDetailForm.ts` (`buildRuleDetailForm`, `validateRuleForm`, `firstRuleFormError`, `missingDraftFields`): puro, provato in `src/tests/ruleDetailForm.test.ts`. Una validazione nuova si scrive lì, non nel componente. Salva/Annulla in `HeaderSaveAction`, uscita con modifiche via `useUnsavedChangesGuard`. Le date del form sono giorni di Roma: `todayInRome()` e `ruleDateToIso()` in `ruleDetailForm.ts` (dalle 00:00 alle 23:59:59 di Roma), mai `new Date("…T00:00:00")`; anche il simulatore legge il suo `datetime-local` come ora di Roma (`parseRomeDateTimeLocal`, `src/utils/romeInstant.ts`). Senza `scheduling.write`, o con l'abbonamento fermo, il form è in un `fieldset disabled` col banner «Sola lettura» e la guardia d'uscita è spenta. Nell'elenco il filtro per tipo sta nella testata: `Tabs` col contatore, in compatto il selettore di sezione.
Prezzi e Disponibilità scelgono i prodotti dallo stesso drawer «Aggiungi prodotti» (`AssociatedContentSection`, `SystemDrawer size="md"`: ricerca, gruppo, tabella con selezione). I prezzi stanno in una `DataTable`: una riga per prezzo (il prodotto, o ogni suo formato), colonne Prezzo e Listino barrato. Non tornare al muro di pill.
**Settimana** (`CalendarView`): per ogni giorno una pila di schede, una per regola accesa, con la finestra intera della regola, non il pezzo che vince. La competizione vive per sede e qui le sedi sono tutte insieme. Chi vince lo dirà la matrice (§20, dopo l'estrazione della competizione); fino ad allora lo dicono il simulatore e «Sovrascritta da …» nella lista. Non reintrodurre la risoluzione per minuto sull'azienda intera. Sceglie fra sette colonne e un giorno alla volta misurando il proprio spazio (`WEEK_MIN_WIDTH` 840 in `CalendarView.tsx`), non la finestra; segue il filtro sede della pagina (`?sede=`), non la ricerca dell'Elenco.

**Banda del momento e matrice sedi × strati** (§50.7): in cima alla vista Elenco. Calcolo puro in `src/utils/scheduleMatrix.ts`, una `resolveCompetition` per sede sulle regole già caricate (la stessa di «Sovrascritta da»); istante del cursore da `romeInstantAt` (`src/utils/romeInstant.ts`), mai dalla mezzanotte del browser. Il cursore muove banda e matrice, **non l'elenco**. «A mano» = tutte le righe di `activity_product_overrides` (`countManualOverridesByActivity`). Negli e2e l'elenco si cerca in `region "Le regole"`: la matrice ripete i nomi delle regole. La matrice sceglie tabella o un blocco per sede misurando il proprio spazio (`MATRIX_TABLE_MIN_WIDTH` 880 in `SeatMatrix.tsx`), non la finestra.

**Visibilità prodotti tri-state** (per sede, realtime): un prodotto/variante è `visible` / `hidden` / `unavailable`. Gli override sono applicati dal resolver cataloghi (`applyActivityVisibilityOverridesToCatalog` in `resolveActivityCatalogs.ts`, mirror FE + Edge `_shared/`). **Gotcha double-key** (bug fix `3349d7f6`): `filterEmptyCategories` DEVE ricevere le categorie **MAPPATE** (con override applicati), non `catalog.categories` originali — una seconda chiave `categories: catalog.categories` scarterebbe il mapping → override inerti. Presente in 2 punti del resolver.

**Dove e quando appare una cosa** (§50.13): Menù, Stili, In evidenza e Storie lo dicono nelle loro pagine da `src/utils/ruleAppearance.ts` — `buildAppearance` gioca una `resolveCompetition` per sede (la stessa di matrice e «Sovrascritta da»), `appearanceOf` dà per sede il motivo (in onda · vince un'altra · fuori finestra · sede sospesa · abbonamento · bozza · spenta · scaduta). Dati da `listAppearanceSources` (3 richieste) via `useRuleAppearance`; le conferme irreversibili rileggono. Lo stile è in onda solo dove vince la regola layout che lo nomina; un contenuto in evidenza anche senza menù (`derivePageState` resta `ready`). Le storie non hanno regole: `storyAppearance`, coi cancelli di `resolve-public-story`. Stato di una regola fuori da Programmazione: sempre `deriveScheduleStatus` → `SCHEDULE_STATUS_META`.

---

## Epic Ordinazioni dal tavolo

QR-table-ordering integrato nei cataloghi. Cliente scansiona QR → ordina → admin dashboard live.

Spec autoritativa: `docs/orders-architecture.md` v1.2. Dettaglio pattern (dual-auth, optimistic locking, error code, schema facts, service layer): `docs/patterns/epic-ordering.md`.

**Regole vincolanti**:
- **Dual-auth**: customer JWT custom firmato con `CUSTOMER_JWT_SECRET` (NON `SUPABASE_JWT_SECRET`) generato da `resolve-table`. Admin = Supabase auth user standard.
- **`customer_session_id` MAI decodificato dal JWT lato frontend**. Solo da response Edge Function `resolve-table` o re-read via `getCurrentCustomerSession`.
- **Optimistic locking obbligatorio** sulle transition admin (`acknowledge` / `deliver` / `cancel-admin`). `expected_version` sempre richiesto, 409 `OPTIMISTIC_LOCK_CONFLICT` da rispettare.
- **Edge Functions customer-only** (`submit-order`, `cancel-order`, `get-orders-for-session`) NON callable da contesto admin (richiedono customer JWT custom).
- `orders.version` increment **applicativo** (no trigger DB).
- `_shared/validateOrderItems.ts` (submit-order, submit-order-admin) filtra per `tenant_id` ogni nodo letto via embed (collegamenti catalogo, gruppi/valori opzione, override prezzo): un id di un altro tenant fa rifiutare l'ordine (`INVALID_OPTIONS`). Il prezzo inviato dal client è sempre ignorato.

Service layer in `src/services/supabase/`: `tables.ts`, `tableZones.ts` (4 funzioni + `getZoneTableCounts` per drawer "Gestisci zone"), `customerSessions.ts`, `productAvailability.ts`, `orders.ts`. Tipi in `src/types/orders.ts`.

UI shared CRUD tavoli in `src/components/Tables/`:
- `TablesManagement/` — componente shared per CRUD tavoli + stato live. Usato dal modo Gestisci la sala di Servizio (unico call site). Header con bottoni "Gestisci zone" + "Nuovo tavolo" renderizzato inline, sempre. `TablesEmptyState` sub-componente per prerequisito `ordering_enabled=false`.
- `ZoneSelectField/` — dropdown zone nel form Crea/Modifica tavolo con expand inline "+ Crea nuova zona" (mini-form). Niente modali nested.
- `TableZoneManagementDrawer/` — drawer dedicato per CRUD zone (md=520px). Rename inline, delete con conferma + count tavoli orfanati, callback `onZonesChanged` notifica parent.
- `TablesLiveView/` — vista operativa live tavoli (card per zona, read-only), modo Mappa di Servizio. Realtime via hook `useTablesLiveRealtime` (Step 4c): 1 canale con 3 binding `postgres_changes` su `orders + order_groups + customer_sessions` filter `activity_id=eq.<id>`, refetch debounced 250ms di `listTablesWithState`, reconnect-resilience via refetch su `SUBSCRIBED`. Niente polling. `CardGrid` per zona (3 · 2 · 1 colonne), tessere `CardGridItem` senza media. Filtri Tutti/Aperti/Liberi/Fuori servizio, raggruppamento per `zone_name` (no-zone fallback ultimo).
- `TableDetailDrawer/` — drawer admin per dettaglio tavolo (`SystemDrawer md` + `DrawerLayout`, sezioni `Card flush` di `ListRow`). Piede: «Chiudi tavolo» o «Fatto»; azioni in riga: Conferma, Storna, conto/cameriere gestiti, «Fuori servizio». Mostra: stato (Libero/Aperto/Fuori servizio + seats), sessioni attive (customer_name + tempo trascorso `now - first_seen_at` calcolato all'apertura — snapshot statico, no ticking timer), open `order_group`, ordini attivi (submitted/acknowledged/ready) + ordini serviti del tavolo. Service helper `getOpenOrderGroupForTable(tenantId, tableId)` in `customerSessions.ts` (filtro tenant+table esplicito oltre RLS).

Pagina Ordini (`src/pages/Dashboard/Orders/`):
- Comande senza tab: board a 3 colonne Nuove/In lavorazione/Pronte + filtro per tavolo. Lo Storico (delivered + cancelled della giornata operativa, Ripristina sui delivered — Step 5b) è la voce di sede `/storico` (`OrdersHistory.tsx`); i tavoli stanno nella Mappa di Servizio.
- Rotta di sede `/locations/:activityId/comande` (sede dal path, §46.1); `/orders` reindirizza all'ultima sede usata, cioè l'ultima in cui si è entrati (`rememberLastSede` in `MainLayout`, §51.9). Nessun selettore di sede in pagina.
- Niente auto-refresh: aggiornamento via realtime (`useActiveOrdersRealtime`) + bottone «Aggiorna» manuale.
- Service helper `orders.ts:listOrdersHistoryToday` — boundary "giornata operativa" calcolata server-side via RPC `get_operative_day_start()` (migration `20260601150000`). Formula `date_trunc('day', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome'` — DST-aware, no off-by-1h ai cambi stagionali (29/3 + 25/10). Funzione `SECURITY INVOKER`, `SET search_path TO ''`, GRANT solo `authenticated`. `listOrdersHistoryToday` (Step 5b): `.eq('tenant_id') + .eq('activity_id')` esplicito (defense in depth oltre RLS) + `.or(and(status.eq.delivered,delivered_at.gte.X),and(status.eq.cancelled,cancelled_at.gte.X))` per la disgiunzione del filtro temporale; sort `updated_at DESC` (coincide con `delivered_at`/`cancelled_at` come exit-timestamp; rectify-order non muta il parent). TODO multi-region: parametrizzare il timezone via `activities.iana_timezone` quando arriveranno tenant non-IT.

---

## Epic Prenotazioni

Prenotazioni online (pubblico, via slug sede) + gestione admin (conferma/rifiuto/no-show) + turni sala (seating) + rubrica clienti + reminder email/ICS.

**Tabelle chiave**:
- `reservations` — `status` CHECK 7 valori `pending|confirmed|declined|cancelled|seated|no_show|completed` (NON un vero enum Postgres, transizioni validate in app). `reservation_date`/`reservation_time` wall-clock locale (no timezone). `ics_sequence` per calendar invite (v. sotto). RLS activity-scoped via `has_permission('reservations.read|manage', activity_id)`.
- `reservation_tables` — ponte N:N reservation↔tables, `assignment_source` (system/manual).
- `reservation_guests` — rubrica clienti, scope **tenant** (non sede), chiave identità `phone_e164`. Aggregati (visite/no-show/ultima visita) SOLO in view `v_reservation_guest_*`, MAI colonne materializzate (evita drift quando un `no_show` viene revocato). Nessuna policy DELETE (vincolo di prodotto: niente bulk/marketing).
- `reservation_reminder_runs` — diagnostica cron reminder.
- Seating (turni sala, tabelle `seating`/`seating_tables`, guidate da `reservation_id`): RPC `open_seating_for_reservation`, `open_walkin_seating`, `set_seating_tables`, `close_seating`/`close_seating_unchecked`, `undo_seating`. View `v_seatings_with_state_pending_orders` (chiudere un servizio con ordini aperti chiede conferma invece di rifiutare).

**Regole vincolanti**:
- **Optimistic locking via compare-and-set sullo status**, NON colonna `version`: `_shared/reservationTransitions.ts` definisce `ACTION_EXPECTS` (stati sorgente ammessi per azione). L'UPDATE è `.eq("id", id).in("status", expectedFrom)` — 0 righe toccate = un altro admin ha già transizionato → 409 `INVALID_TRANSITION`. Stesso pattern per claim idempotenti (`reminder_sent_at IS NULL`, `guest_confirmed_at IS NULL`).
- **Capacità/pacing su `place_online_reservation`** (RPC SECURITY DEFINER): `pg_advisory_xact_lock` per sede tenuto fino al commit — serializza submit simultanei sulla stessa sede (non check-then-insert).
- **Validazione orari lato server obbligatoria**: `isReservationTimeBookable` (`_shared/openingHours.ts`) chiamata da `submit-reservation` PRIMA della RPC — mai fidarsi del solo form pubblico. **Regola duplicata in 3 file** (`ReservationPage/availability.ts`, `ReservationPage/utils/reservationSlots.ts`, `_shared/openingHours.ts`), header `⚠️ SYNC` — modificare tutti e 3 nello stesso commit.
- **ICS**: `METHOD:PUBLISH`/`CANCEL`, MAI `ATTENDEE`/`METHOD:REQUEST` (altrimenti Gmail/Outlook mostrano Accetta/Rifiuta RSVP indesiderato). `ics_sequence` incrementato da trigger DB (`reservations_bump_ics_sequence`, BEFORE UPDATE con clausola `WHEN`) SOLO su cambio data/ora o transizione a `cancelled`/`declined` — non su note/tavoli/reminder.
- `update-reservation` modifica SOLO i dati (data/ora/coperti/contatti/note), MAI lo status — le transizioni di stato passano solo da `respond-reservation`.
- Link pubblici (cancellazione, conferma presenza) sono **no-oracle**: stesso errore/status per token invalido e prenotazione inesistente.

**Edge Functions** (`supabase/functions/`): `submit-reservation` (pubblica, rate-limit doppio slug+IP, gate subscription/piano attivi, validazione orari, poi RPC atomica) · `respond-reservation` (admin: confirm/decline/cancel/mark_no_show/undo_no_show) · `update-reservation` (admin, solo dati) · `cancel-reservation-public` (link firmato email) · `confirm-reservation-attendance` (link "confermo che vengo" nel reminder) · `reservation-availability` (lettura, solo slot già proposti dal client — no conteggi/motivi commerciali) · `resolve-reservation-privacy` · `send-reservation-reminders` (cron, 3 passate 18/19/20 IT) · `purge-reservation-data` (cron retention 36 mesi, dry-run default, auth fail-closed).

**`_shared/reservation*.ts`**: `reservationEmailCopy.ts` (copy cliente 5 lingue, dizionario TS — chiave mancante = errore di compilazione, non stringa vuota runtime) · `reservationEmails.ts` (builder puri, no I/O) · `reservationIcs.ts` (generatore .ics puro, `now` iniettato) · `reservationUpdate.ts` (`decideMoveNotification` — mail di spostamento SOLO se cambia data/ora) · `reservationTransitions.ts` (state machine, condivisa da `respond-reservation` e cancellazione pubblica) · `reservationToken.ts` / `reservationAlertRecipients.ts` / `reservationRetention.ts` / `reservationCancellation.ts`.

Service layer FE: `src/services/supabase/reservations.ts`, `reservationGuests.ts`, `seatings.ts`, `seatingRpcMessages.ts`. UI in `src/pages/Dashboard/Reservations/`, rotta di sede `/locations/:id/prenotazioni` (`/reservations` reindirizza, §48.1): `Reservations.tsx` (host) + `ReservationsInbox/Agenda/Service.tsx` + drawer create/edit/detail + `SeatingCloseQuestion.tsx`. Prenotazioni è l'Agenda, senza schede (lotto B-b); `?tab=service` porta all'Elenco di Servizio. Dati, realtime, gesti e drawer della prenotazione stanno in `hooks/useReservationDesk.ts` + `ReservationDrawers.tsx`, condivisi con l'Elenco di Servizio; la banda «Oggi» è `ReservationsTodayStrip`. Un gesto nuovo della prenotazione si scrive nel banco, non nella pagina. «Da gestire» è una `Card` in cima all'Agenda, la ricerca è una `DataTable`. Righe su `ListRow` (coda a 56, Agenda ed Elenco `dense` a 48). Il segnale d'azienda è «N da gestire» sulla card in Sedi (`countPendingReservationsByActivity`). `serviceDay.ts` — boundary giorno servizio, v. `## Edge Functions` sopra.

---

## CRM (piattaforma)

CRM interno in `/admin` (lead, agenti, costi). Non appartiene a nessuna azienda.

- **Tabelle `crm_*` senza `tenant_id`**: sono di piattaforma. RLS `TO authenticated` su `public.is_platform_admin()`, revoca ad `anon`. Il diario `crm_agent_decisions` e `crm_ai_usage` dal client si leggono e basta: le scrivono i trigger di log `SECURITY DEFINER` e le edge col service role. `crm_events` accetta solo select e insert.
- **Telefoni in chiaro solo nei contatti**: `crm_suppressions` tiene l'impronta `crm_phone_fingerprint` (sha256 dell'E.164) dei numeri in stop, e sopravvive alla cancellazione del locale. `crm_imported_refs` tiene (source, source_ref) dei lead già entrati, senza telefono. Nessuna delle due si scrive dal client.
- **Blocco invii unico**: ogni invio del sistema verso un lead, su qualunque canale, passa da `crm_lead_send_gate(contact, channel, sender)` subito prima di partire. Ferma pausa agenti, stop, lista stop e recapito mancante; tutto ciò che non è un sì esplicito è un no (`_shared/crmLeadSendGate.ts`). Gea non scrive mai ai lead. Fuori dal blocco solo il link wa.me che una persona apre da `crm-wa`.
- **Pausa agenti** (`crm_settings.brake_on`, parte attiva): la mettono `/admin`, Telegram, i tetti di spesa AI e la salute del canale WhatsApp; la toglie solo una persona (trigger `crm_settings_agent_guard`, `crm_set_brake`). `crm_ai_gate` prima di ogni chiamata a Claude, `crm_record_ai_usage` dopo.
- **Edge**: `crm-notify`, `crm-telegram-webhook`, `crm-wa`, `crm-sync-accounts`, `crm-purge`, `crm-agent-check` (nel repo, non ancora rilasciata); `crm-meta-webhook` resta spenta (mai rilasciata). Auth fail-closed con `X-Job-Secret` = `CRM_JOB_SECRET` per i job.
- **Cron** (pg_cron): `crm-sync-landing-leads` (ogni minuto, solo SQL: legge `public.leads` senza modificarla), `crm-notify` (ogni minuto, solo se c'è lavoro), `crm-sync-accounts` (15 min), `crm-purge` (04:15 UTC, 12 mesi, dry-run di default), `crm-expense-reminders` (9 di Roma). Vault: `crm_job_secret`, `crm_notify_url`, `crm_sync_accounts_url`, `crm_purge_url`.
- **Ordine di rilascio**: migration prima del deploy delle edge che la usano (una edge attiva che chiama una RPC che manca va in 500). Applicazione su staging come tutte le altre: CLI dalla cartella principale subito dopo il merge (`### CLI Supabase`). Dopo, verificare sul live: oggetti, `has_function_privilege`, registrazione.

## Database

- Schema changes: SEMPRE nuova migration (`supabase/migrations/YYYYMMDDHHMMSS_*.sql`). MAI modificare esistenti.
- **Query nei service**: nomi SENZA prefisso (`products`, mai `v2_products`). Tipi TS: prefisso `V2`.
- Nuove tabelle: `tenant_id UUID NOT NULL`, RLS abilitato, 4 policy (select/insert/update/delete).
  - **Eccezione: `leads`** (mig `20260926120000`), contatti dal form della landing di campagna. Tabella di piattaforma: niente `tenant_id`, RLS abilitato **senza policy** e privilegi revocati ad anon/authenticated. Scrive solo l'edge `submit-lead` con service role; nessun accesso dal client.
  - **Eccezione: tabelle `crm_*`** (mig `20261001120000`), CRM interno in /admin: tabelle di piattaforma senza `tenant_id`, regole in `## CRM (piattaforma)`.
- FK: `entita_id`. Self-ref: `parent_entita_id`. Colonne: `snake_case`. Tabelle: plurale.
- Schema attuale + fact critici (slug uniqueness, Stripe-on-tenants, schedule_targets RLS, ecc.) → `docs/database-reference.md`.
- **`table_zones`** (migration `20260531150043`): entita' zone tavoli, UNIQUE `(activity_id, name)`. FK `tables.zone_id ON DELETE SET NULL`. RLS via `has_permission('tables.read'|'tables.manage', activity_id)`. View `v_tables_with_state` espone `zone_name` via LEFT JOIN. Campo `tables.zone` text DROPPED nella stessa migration. Frontend admin legge `zone_name` dal JOIN; payload Edge customer mantiene alias `zone: string | null` per backward-compat localStorage.
- **`orders.status` + `orders.ready_at`** (migration `20260531180000`): constraint `orders_status_check` accetta 5 valori — `'submitted','acknowledged','ready','delivered','cancelled'`. Colonna `ready_at timestamptz NULL` write-once popolata al transition `acknowledged → ready` (Edge `mark-order-ready`, Step 4a). Index partial `idx_orders_active` esteso a `('submitted','acknowledged','ready')` con migration `20260601100000`.
- **Sistema permessi multi-sede** (vedi `## Sistema permessi multi-sede` sopra): tabelle `tenant_memberships` (role NULL|'admin' post Fase 5.B.2), `tenant_membership_activities (tenant_membership_id, activity_id, tenant_id, role IN manager|staff|viewer)`, `permissions (id, scope)`, `role_permissions (role, permission_id)`. Helper SECURITY DEFINER: `has_permission`, `has_permission_any_activity`, `get_my_activity_ids`, `get_my_tenant_ids`.
- Dati legali aziendali: `src/config/company.ts` ↔ `supabase/functions/_shared/company-config.ts` sono **duplicazione sincronizzata** (header `// ⚠️ SYNC`). Modifica entrambi nello stesso commit. Stesso pattern di `scheduleResolver.ts`.
- **Migration con `CREATE FUNCTION` + REVOKE/GRANT**: `supabase db push` fallisce con `SQLSTATE 42601`. Workaround: applicare via Studio SQL Editor + registrare in `supabase_migrations.schema_migrations`, oppure splittare in 2 file consecutivi. Dettaglio: `docs/patterns/storage-sql.md`.
- **`CREATE OR REPLACE` di una funzione esistente**: partire SEMPRE da `pg_get_functiondef` sul live, MAI da una migration precedente. Due incidenti: `20260413120000` perde l'audit `ownership_transferred`; `20260920140000` perde lo Step D e riapre un GRANT revocato da `20260429150000`.

---

## Pattern obbligatori — storage, SQL, Stripe

Dettaglio completo + esempi SQL: `docs/patterns/storage-sql.md`.

### Storage policy `storage.objects`
- Naming: `<bucket-id> <operation>` lowercase. `TO authenticated` (no public listing).
- UPDATE policy: SEMPRE `USING (...) WITH CHECK (...)` con espressione identica.
- Sempre `DROP POLICY IF EXISTS` (idempotenza cross-env).
- Upsert (`{ upsert: true }`) richiede 3 policy: INSERT + UPDATE (with CHECK) + SELECT `TO authenticated`. Senza tutte e 3 → HTTP 400 messaggio fuorviante.

### Funzioni SQL
- `SECURITY DEFINER` solo se necessario. Default: `SECURITY INVOKER`.
- `SET search_path TO ''` obbligatorio + qualifiche `public.<table>` esplicite.
- `REVOKE EXECUTE ... FROM PUBLIC` dopo `CREATE FUNCTION`.
- `SECURITY DEFINER` non destinata a `anon`/`authenticated`: `REVOKE FROM PUBLIC` NON basta — Supabase pre-configura grant default a `anon, authenticated, service_role`. Pattern: REVOKE espliciti da `PUBLIC + anon + authenticated`, GRANT solo a `service_role`. Verifica post-deploy con query `pg_proc + has_function_privilege`.
- **`RETURNS TABLE` alias collision**: le colonne OUT della `RETURNS TABLE` sono in scope nel body plpgsql come variabili. `SELECT/EXISTS` su tabella con colonna stesso nome senza qualificazione → `column reference "X" is ambiguous`. Pattern: qualifica SEMPRE le colonne con alias tabella (`tm.role`, `t.id`); per CTE con alias output identici alle cols `RETURNS TABLE`, prefisso `r_*` (vedi `20260530190000_fix_get_tenant_members_ambiguous.sql`). Incappato 2 volte (Fase 4 + Fase 5.B.2).
- **Policy che interroga la propria tabella → 42P17** (`infinite recursion detected in policy`): la sottoquery riapplica l'RLS della tabella stessa, e ogni INSERT/UPDATE fallisce, anche quelli legittimi. Vale anche per cicli tra due tabelle le cui policy si interrogano a vicenda. Pattern: helper SQL `STABLE SECURITY DEFINER`, `search_path ''` (owner postgres: niente RLS dentro, una funzione SQL DEFINER non viene inlined), che risponde solo per i tenant del chiamante, es. `catalog_category_in_tenant(category_id, tenant_id)` (mig `20260930150900`/`150910`); REVOKE da `PUBLIC, anon`, GRANT ad `authenticated`. Una policy nuova con sottoquery: provarla con un INSERT reale da `authenticated` su staging, non solo leggere `pg_policies`.

### Stripe lifecycle
Usare sempre `_shared/stripe-helpers.ts`. Pattern: `scheduleStripeCancel()` soft-delete → `reactivateStripeSubIfScheduled()` recovery → `cancelStripeSubImmediate()` + `deleteStripeCustomer()` hard-delete. Tutti idempotenti e non-throwing. NON chiamare `stripe.subscriptions.cancel()` direttamente in soft-delete.

---

## Edge Functions

Tutte in `supabase/functions/<nome>/index.ts`. Shared code in `_shared/`. `verify_jwt: false` su tutte.

Deploy sempre con --project-ref esplicito. La CLI locale è collegata a **staging** (`lxeawrpjfphgdspueiag`); produzione è `qomnpzerhbtstbnwxnqc`. Il deploy su prod lo fa solo Lorenzo (vedi `### CLI Supabase` in Plugin & MCP).

**`scheduleResolver.ts` esiste in DUE posti**: `src/services/supabase/` e `supabase/functions/_shared/`. Sincronizzarli ENTRAMBI ad ogni modifica.

**`priceSummary.ts` idem duplicato FE↔Edge** (header `⚠️ SYNC`): `src/utils/priceSummary.ts` ↔ `supabase/functions/_shared/priceSummary.ts`. `resolvePriceSummary` calcola solo i *fatti* sul prezzo sintetico di un gruppo → `{kind: none|single|multi, min, max, count}`. La *presentazione* ("da X" / range) vive SOLO lato FE in `src/utils/formatPriceSummary.ts` (l'edge Deno usa solo i fatti grezzi). Separazione voluta: la regola di sintesi cambia senza toccare il formatting.

**Contatti dalla landing** (`submit-lead`, `purge-leads`; dettaglio in `docs/edge-functions.md`). `leadValidation.ts` duplicato FE↔Edge (header `⚠️ SYNC`, `src/utils/` ↔ `_shared/`, provato da `src/tests/leadValidation.test.ts`).
- `consent_text` lo scrive solo il server, da `PRIVACY_PUBLISHED_AT` (`_shared/consentVersions.ts`), separata da `CURRENT_CONSENT_VERSIONS.privacy`: il testo privacy si aggiorna senza chiedere un nuovo consenso al sign-up.
- `purge-leads` è in dry-run di default; cron alle 03:45 UTC con URL e secret presi dal vault (`purge_leads_url`, `leads_retention_secret` = `LEADS_RETENTION_SECRET`). `sendEmail` non logga mai destinatario né corpo.

**Connettore WhatsApp Web del CRM** (`crm-wa-worker`, mig `20261002220000`-`220300`, F1-2). Il Mac con WhatsApp Web parla solo con l'edge, mai col database: header `X-Worker-Secret` = `CRM_WA_WORKER_SECRET`; il watchdog arriva da pg_cron con `X-Job-Secret`. Le regole d'invio (fasce orarie, tetto giornaliero, pausa tra invii, 3 di fila senza risposta, mezz'ora dopo un messaggio a mano, pausa agenti) stanno tutte in `crm_wa_claim_next` (SQL), mai nel Mac. Parte pura in `_shared/crmWaWorker.ts`, usata dall'edge e da `scripts/crm-wa/crm-wa.mjs`. Gli avvisi Telegram al team passano solo da `_shared/crmTeamAlert.ts` (`sendToTeam`).

**Codice puro condiviso FE↔Edge senza coppia SYNC**: alias `@shared/` → `supabase/functions/_shared/`. Vale solo per moduli con zero import (niente Deno, niente `.ts` negli import). Primo caso: `scheduleCompetition.ts` (`resolveCompetition`, `isTimeRuleActiveNow`, `compareCandidates`), unica fonte di «chi vince». La usano resolver (entrambe le copie), lista di Programmazione (`src/utils/ruleInsights.ts`), drawer di eliminazione stile e andamento del simulatore. `days_of_week = []` vuol dire «mai»: si scrive solo via `daysOfWeekForDb`.

### Attivazione abbonamento (paywall)

- **Tenant nasce sospeso**: `tenants.subscription_status` DEFAULT `'suspended'` (mig 20260918150000). Un tenant senza checkout completato NON ha menu pubblico: `resolve-public-catalog` risponde `subscription_inactive`.
- **`stripe-checkout-confirm`**: attiva senza attendere il webhook. Legge il `session_id` dal `success_url` (`checkout.sessions.retrieve` expand subscription), collega tenant↔subscription. Idempotente e safe rispetto al webhook (race in entrambi i versi). Le 3 mismatch (subscription/session/subscription-tenant) loggate `console.error("… ANOMALY …")`.
- **Schermata di ritorno** (`useCheckoutReturnSync` + `CheckoutConfirmScreen`, 3 stati ramificati sul codice errore, non sullo status):
  - `syncing` — loader "Stiamo confermando il tuo pagamento…"; auto-retry 2× (2s, 5s) sui retriable, poi `failed`.
  - `failed` — "Completa l'attivazione" (retry) / [Ricarica]. Tiene il param.
  - `mismatch` (codici `*_mismatch`) — "Non riusciamo a collegare questo pagamento", schermata separata SENZA retry, mostra riferimento sessione da citare. Il loader DEVE chiudersi sempre (fix hang: status terminale incondizionato, deps `[sessionId, tenantId, retryKey]`).

- **Gate fiscale a quattro livelli** (P.IVA valida + recapito e-fattura obbligatorio con P.IVA):
  1. **FE** — wizard (`StepBilling`/`CreateBusinessWizard`) + `BusinessSettingsPage`: "Continua"/"Salva" bloccati.
  2. **Edge** — `stripe-checkout` legge il profilo fiscale dal DB (`fiscalRow`, non dal request body) e rifiuta prima di creare il customer: `400 invalid_vat_number`, `400 missing_einvoice_recipient`, `503 fiscal_profile_unavailable`. Ownership check (`owner_user_id !== userId` → 403) prima del gate. È l'ultimo cancello sui soldi. Posti contro sedi (CG-03): conta le sedi con service role, fail-closed (`503 activity_count_unavailable`); sopra `MAX_SELF_SERVICE_SEATS` → `409 seats_over_self_service`, `quantity` sotto le sedi → `409 seats_below_activities` (entrambi con `min_seats`). Sessione di checkout a 31 minuti (`expires_at`), non 24 h: il conteggio vale al momento della creazione. Al collegamento (webhook e `stripe-checkout-confirm`, via `buildSubscriptionLinkUpdates` con `tenantId`) le sedi si ricontano (`_shared/seatRealign.ts`): più sedi della quantity e al massimo 5 → `subscriptions.update` con `create_prorations` (differenza nella prossima fattura), mai in giù; oltre 5 → log `SEATS_OVER_CAP` per l'assistenza. Mai bloccante.
  3. **RPC** — `update_tenant_billing_details` (mig 20260920120000; dal 20260923120300 via `is_valid_partita_iva`) valida la P.IVA lato server (`RAISE invalid_vat_number` ERRCODE 22023) e, con P.IVA, richiede SDI o PEC (`RAISE missing_einvoice_recipient` ERRCODE 22023, mig 20260925120000): chiude anche la chiamata diretta alla RPC. Il create del wizard (INSERT via `createTenant`) non passa dalla RPC: lì valgono CHECK e trigger del punto 4.
  4. **Tabella** — `CHECK tenants_vat_number_valid` su `public.tenants` (mig 20260923120200) via `public.is_valid_partita_iva(text)` (IMMUTABLE, NULL/vuota → true): copre ogni percorso di scrittura, incluso l'insert client-side del wizard. Creato `NOT VALID`; `VALIDATE CONSTRAINT` eseguibile quando tutte le righe passano. + trigger `trg_enforce_tenant_einvoice_recipient` (mig 20260929120000/120100): con P.IVA serve SDI o PEC, 22023 `missing_einvoice_recipient`, solo su INSERT e UPDATE OF vat_number/pec/codice_destinatario (niente CHECK: bloccherebbe il webhook sui violatori esistenti). `createTenant()` (`src/services/supabase/tenants.ts`) traduce il 23514 (match sul nome del vincolo) in `invalid_vat_number` e il 22023 in `missing_einvoice_recipient`; il wizard li riporta al passo Fatturazione.
  Check-digit P.IVA duplicato in 3 punti (⚠️ SYNC): `src/utils/fiscalValidators.ts`, `supabase/functions/_shared/fiscalValidators.ts`, e la funzione SQL `public.is_valid_partita_iva` (mig 20260923120000), usata dal CHECK e dalla RPC.

- **Trigger protezione colonne abbonamento** (`trg_protect_tenant_subscription_columns`, BEFORE INSERT/UPDATE ON tenants, mig 150200/150300). Le colonne abbonamento sono verità di Stripe. Esenti: `service_role`, `postgres`, `supabase_admin`. Tre fasce:
  1. **Sempre protette**: `subscription_status`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_status_event_at`, `trial_until`, `current_period_start/end`, `plan_monthly_value_cents` (in INSERT devono restare al default). Chiude il PATCH diretto `subscription_status='active'`.
  2. **Protette dopo il link a Stripe** (`stripe_subscription_id NOT NULL`): `plan`, `paid_seats`, `billing_interval`. Prima del checkout le scrive il wizard dal client, con `paid_seats` entro `plans.max_self_service_seats` del piano (mig 20261003160200, `seats_over_self_service`; piano senza tetto = 1; il controllo scatta solo se `plan`/`paid_seats` cambiano, un tenant legacy sopra il tetto aggiorna ancora nome e fatturazione); dopo, seguono la subscription.
  3. **Libere**: dati di fatturazione, nome, logo (via RPC dedicate).

- **`activities.plan_override` solo dalla piattaforma** (CG-02, `trg_protect_activity_plan_override`, BEFORE INSERT OR UPDATE OF plan_override, mig 20261003160000/160100): `activity_has_feature` risolve `COALESCE(plan_override, tenants.plan)`, quindi un owner o manager che lo scrive accende le funzioni Pro senza pagare. Esenti `service_role`, `postgres`, `supabase_admin`; nessun percorso client lo scrive. Il REVOKE di colonna non basta (authenticated ha UPDATE di tabella).
- **`enforce_seat_limit` serializzato** (mig 20261003160300): legge `paid_seats` con `FOR UPDATE` sul tenant prima di contare le sedi, così due INSERT concorrenti non superano il limite.

- **`subscription_status_event_at` — asimmetria voluta** (`subscriptionStatusSync.ts`): guard monotòno sull'ora dell'evento, mai `now()`. Il webhook passa `event.created`; il fallback confirm passa `subscription.created`, che precede ogni `event.created` di quella subscription. In una race inversa (confirm prima, webhook dopo) il webhook vince sul timestamp (event.created più recente) ma NON cambia lo status: `subscription_status_event_at` avanza di pochi secondi, il valore resta. Non è corruzione.

**`serviceDay.ts` ↔ `get_service_day_start()` duplicato TS↔SQL** (header `⚠️ SYNC`): `src/pages/Dashboard/Reservations/serviceDay.ts` (`SERVICE_DAY_START_HOUR`) ↔ migration `20260914155000`. Confine della giornata di servizio della sala (05:00 Europe/Rome, non la mezzanotte), letto dal segnale in sala («Aperta da un servizio precedente») e dal cron `close_stale_seatings` che chiude le tavolate dimenticate. Modificare insieme nello stesso commit; l'ora NON è configurabile per sede (decisione FASE 2.8, rinviata al primo locale reale che serve oltre le cinque).

**Comandi cron ↔ funzioni di claim duplicati SQL↔SQL** (header `⚠️ SYNC`): i job pg_cron `process-print-jobs` e `process-translation-jobs` (mig `20260930160000`/`160100`) chiamano l'edge solo se c'è lavoro in coda, con le stesse condizioni di `claim_pending_print_jobs` / `claim_pending_translation_jobs`: `pending` (traduzioni: solo su lingua attiva o job di sistema) + `processing` fermo da più di 5 min (default `p_reclaim_after_minutes`), anche al cap, così il claim li chiude a `failed`. Se cambia il claim, nuova migration che rifà il comando con `cron.alter_job(command := …)`, senza toccare lo schedule. Falso positivo = una chiamata a vuoto; falso negativo = coda ferma.

Catalogo completo, bug history (`purgeTenantData` ordine FK, `purgeActivityFolder` ricorsivo, `config.toml` entry obbligatoria, slash `/` nei commenti Deno) + 11 Edge Functions epic ordering → `docs/edge-functions.md`.

**`resolve-table` + `get-orders-for-session`**: post-migration `table_zones` (γ-lite), entrambe fanno JOIN `tables → table_zones` e mappano `zone_data.name → zone` (alias backward-compat) nel payload customer. Customer storage (`localStorage tableZone`) + `ResolveTableResult.table.zone` invariati. Refactor effettuato nella stessa migration di `table_zones` per evitare runtime errors (SELECT su colonna droppata).

**Admin order transitions** (5 endpoint, tutti wrapper di `_shared/adminOrderTransition.ts`):
- `acknowledge-order`: `submitted → acknowledged` (popola `acknowledged_at`)
- `mark-order-ready`: `acknowledged → ready` (popola `ready_at`) — Step 4a
- `deliver-order`: `acknowledged|ready → delivered` (popola `delivered_at`) — Step 4a estende il source set: ora accetta entrambi cosi i workflow che saltano lo step "ready" continuano a funzionare
- `cancel-order-admin`: `submitted|acknowledged → cancelled` (popola `cancelled_at`, `cancelled_by='admin'`, `cancellation_reason`)
- `restore-order`: `delivered → acknowledged` (azzera `delivered_at` + `ready_at` via `clear_fields`, nessun timestamp dedicato di ripristino) — Step 5a, usato dallo Storico per recuperare i "Servito" accidentali. NB: ordini `cancelled` NON sono ripristinabili (terminale per design).
Tutte: optimistic locking via `expected_version`, error mapping unificato (409 `OPTIMISTIC_LOCK_CONFLICT` vs wrong-state via `details.reason`), rate limit 30/min per `(user, order)` con namespace per `function_name`. Service mirror in `src/services/supabase/orders.ts`: `acknowledgeOrder`, `markOrderReady`, `deliverOrder`, `cancelOrderAdmin`, `restoreOrder` — tutte ritornano `throwMappedTransitionError(parseInvokeError(err))` sui 4xx/5xx.

**Helper `_shared/adminOrderTransition.ts` — estensione Step 5a**: `TransitionConfig.timestamp_field` ora `?: string | null` (opzionale: passare `null` quando la transition non ha colonna timestamp dedicata, come `restore-order`). Nuovo `TransitionConfig.clear_fields?: string[]` — colonne SET = NULL al success (es. `restore-order` clears `delivered_at` + `ready_at`). `updated_at` settato SEMPRE indipendentemente da `timestamp_field`. Backward-compat: i 4 wrapper esistenti passano una stringa → invariati.

**Realtime su `orders`** (Step 4b): tabella `orders` in publication `supabase_realtime` (insieme a `customer_sessions`, `order_groups`, `notifications`). RLS SELECT su `orders` filtra automaticamente i `postgres_changes` per il subscriber autenticato:
- Customer JWT custom: policy `customer_session_id = get_jwt_customer_session_id()`
- Admin user JWT: policy `has_permission('orders.read', activity_id)`

Nessun leak cross-tenant: il server realtime non emette eventi per righe non visibili via RLS SELECT del subscriber.

Hook admin: `src/pages/Dashboard/Orders/hooks/useActiveOrdersRealtime.ts`. Subscribe con filter `activity_id=eq.<id>` (volume reduction; RLS è la security boundary). Pattern: initial fetch via REST (`listOrdersForActivity` con status `['submitted','acknowledged','ready']`) + subscribe `postgres_changes` event=`*`. UPDATE applica patch con **version-max gate** (`new.version > local.version`) — scarta echi della propria azione e update stale. Se nuovo status non-attivo (`delivered`/`cancelled`) → drop dalla board + callback `onOrderLeftBoard` (parent refresha KPI). INSERT triggera silent refetch (postgres_changes NON delivera `items[]`). Re-SUBSCRIBED → refetch (colma eventi persi durante disconnect, wifi sala flaky). Cleanup canale on unmount/activityId-change. Nome canale sempre da `realtimeTopic(prefix)` (`src/utils/realtimeTopic.ts`, suffisso per montaggio), mai `Date.now()`: `removeChannel` è asincrono e due montaggi nello stesso millisecondo (StrictMode) riprendono il canale ancora registrato.

Hook customer: `subscribeToSessionOrders` (in `orders.ts`), già pre-Step 4b. RLS via JWT custom `customer_session_id`. Pattern singleton `supabase.realtime.setAuth(jwt)` (no riconnessione WS, swap auth contesto).

Kanban admin "Comande" (`src/pages/Dashboard/Orders/OrdersKanban.tsx`): 3 colonne (Nuove / In lavorazione / Pronte) basate su status. Card actions per colonna:
- submitted: primary "Conferma" + secondary "Cancella"
- acknowledged: primary "Pronto" + secondary "Servito direttamente" (skip-ready workflow) + "Cancella"
- ready: primary "Servito" + secondary "Cancella"

Transition: bottone loading durante invoke (NO optimistic-move). Post-success: `applyLocalPatch(response)` con `(status, version, timestamp)` — realtime echo deduplicato dal version-max. Errori discriminati: `OPTIMISTIC_LOCK_CONFLICT` → toast warning + refetch silenzioso. `INVALID_STATE_TRANSITION` → toast error con `details.current_status` + refetch.

Customer stepper (`OrderStatusStepper.tsx`): 4 step (Inviato → In cucina → Pronto → Consegnato). Stato `ready` mostra step "Pronto" come `active` (icona `BellRing`).

---

## Integrazioni

- **Supabase client**: solo `src/services/supabase/client.ts`. Mai `service_role` nel frontend.
- **Email**: solo via Edge Functions (Resend), mai dal frontend.
- **Upload**: `src/services/supabase/upload.ts` + `src/utils/compressImage.ts`. Per upsert vedi `docs/patterns/storage-sql.md`.
- **Stripe**: sottoscrizione tenant, seat management, webhook. Service: `src/services/supabase/billing.ts`.
  - **Prova senza carta**: un promotion code con metadata `trial_no_card="true"` è solo una chiave (il coupon non viene applicato). In `stripe-checkout` concede i 30 giorni anche con codice, solo sulla prima subscription (altrimenti `promo_code_invalid`), con `payment_method_collection: if_required` e `trial_settings.end_behavior.missing_payment_method: cancel` → a fine prova senza carta `customer.subscription.deleted` → `canceled`. Stripe non conta gli utilizzi (`max_redemptions` inerte): controllo operativo, scadenza breve + disattivazione manuale. `hasPaymentMethod` dall'action `state` di `stripe-change-subscription` guida la CTA «Aggiungi carta» (portale).
- **Google Places**: Edge Function `search-google-places` + `GooglePlacesSearch` component in `src/pages/Operativita/Attivita/tabs/contacts/`.
- **Export Excel Analitiche**: `src/pages/Dashboard/Analytics/utils/exportXlsx.ts` costruisce il workbook via `xlsx-js-style` (fork di SheetJS con cell styling; `xlsx` resta come dep separata, NON rimossa). Engine "un foglio = più tabelle impilate": 4 fogli (Copertina · Pagina pubblica · Ordini · Prenotazioni), stile per-cella; la copertina dice il campione («N visite»), i fogli restano dati grezzi, con le parole della pagina («visite», mai «sessioni»). Header letto a runtime da `--brand-primary` (`_theme.scss`) → **theme-aware**: violetto in light, blu in dark (scelta voluta — l'xlsx segue il tema attivo). Dati presi dallo state della pagina (no re-fetch). Valuta/percentuali/durate scritte come **numeri + numFmt** (mai stringhe pre-formattate come valore di cella).

---

## UI

- Componenti in `src/components/ui/` — verificare PRIMA di crearne di nuovi. Catalogo dettagliato: `docs/patterns/ui-components.md` (`AddressAutocomplete`, `FeesSection`, `StatusBadge`, `UnsavedChangesBar`, `EmptyState`, `TranslationsTab`).
- **`Card`** (`src/components/ui/Card/`) — container sezione unificato (ex `SectionCard`, oggi alias deprecato con avviso in dev: non importarlo nei file nuovi). Anatomia: titolo (mai `text-transform: uppercase`) + badge/subtitle opzionali + 0–2 action `sm` nell'header (mai 2 primary) + body. Variante `flush` toglie il padding orizzontale (righe tabella, collapsible); le `ListRow` dentro rientrano a 24 come il titolo (lo fa la Card: niente padding per pagina; nude in un drawer restano a 16); `variant="danger"` per la zona pericolosa. Mai lift al hover. Layout demandato alla pagina; non annidare card section-like.
- **`usePlanFeatures().hasFeature`** è stabile finché il piano non cambia (`useCallback` nell'hook): si può mettere nelle deps della config di `usePageHeader`.
- **`usePageHeader` con una bozza**: le azioni di testata dipendono dai campi della bozza (`isDirty`, `save`, `discard`), mai dall'oggetto che l'hook della bozza restituisce: è nuovo a ogni render, rifà la testata a ogni render e richiude i menu Radix aperti nella pagina (due volte nel lotto Stili · Storie · In evidenza).
- **Design system M17** (lotti 1–3 su `refactor/design-system`, brief in `Claude outputs/cataloglobe-design-system.md`) — token in `src/styles/_theme.scss`: `--space-*`, `--radius-inner/control/surface/pill`, `--shadow-rest/float/overlay/drawer`, `--z-nav/sticky/float/overlay/toast/loader`, `--text-danger/warning`, `--on-brand-soft`, `--drawer-sm/md/lg`. Regole vincolanti in `ui/` e `layout/`: `DataTable` carica con righe Skeleton, colonna azioni sempre ultima e visibile al hover (`TableRowActions`), vuoto = `EmptyState inline` (`filtered` + `onClearFilters` quando `isFiltered`); `SystemDrawer` accetta solo `size="sm|md|lg"` (`width` numerica deprecata; un pannello da 900 px in su non è un drawer, è una route); `ConfirmDialog` standalone per le azioni irreversibili (`confirmText`, `isLoading`, `error`; `onConfirm` che ritorna `false`/`void` lascia aperto), `ModalLayout` solo per guide e anteprime; `EmptyState page` richiede `action`; una sola sidebar: `AppSidebar` rende, `TenantSidebar` (unica, azienda) e `SedeSidebar` (sede) costruiscono le voci da `navModel` (`Sidebar.tsx` alias deprecato); voce 36 px desktop / 40 mobile, larghezza 232 / chiusa 64, collassata di default tra 768 e 1023; chiusa il nome passa al `Tooltip` sulla riga intera (trigger avvolto in uno `span`: lo `Slot` di Radix rompe il `className` a funzione di `NavLink`). Budget anti-regressione: `npm run ds:budget:check` dopo ogni commit (mai `node scripts/ds-budget.mjs` senza `--check`: sovrascrive la baseline). Galleria stati: `/dev/ui`. `ListRow dense` (48) solo per gli elenchi di servizio; `muted` è solo aspetto, con `onClick` la riga resta apribile. `DataTable mutedRowIds` = riga spenta ma cliccabile; `ariaLabel` obbligatorio: nome e semantica di tabella (righe, intestazioni, celle). `RangeInput marks` = tacche a intervalli uguali. La prima tab di `Tabs` non ha padding sinistro: il suo testo sta sul filo del contenuto sotto; non ridare rientro per pagina. Testata (`PageHeaderSlot`), una scala sola per ogni pagina con tab: riga comoda → versioni più strette delle azioni (`PageHeaderConfig.narrowerActions`, facoltative; oggi Programmazione) → due righe (azioni sopra, tab sotto) → barra compatta. Le due righe valgono solo da 768 in su: sotto 768 la testata è sempre la barra compatta (`stack` da `(min-width: 768px)`, unica soglia in px della testata). Per il resto decisa misurando il contenuto (`useCompactToolbar`, scelta pura in `chooseToolbarLayout`), mai con un breakpoint. `ToolbarSearch width="min"` (200 px) serve a `narrowerActions`. `SegmentedControl iconsOnly` e le `persistentIcons` della barra compatta dicono il nome con `Tooltip` (Radix, `asChild`), mai con `title`. `usePageHeader({ subtitle })` si vede: una riga muta sopra la banda (da sola, col bordo, se la pagina non ha tab né azioni); non ripetere la frase nel corpo. `DATA_TABLE_CLASSES.cellTwoLineWrap`, insieme a `cellTwoLine`: la seconda riga va a capo invece di troncarsi. Serve sul telefono, dove la colonna è una sola e la riga deve dire tutto. `ChipGroupSingle` per i filtri coi conteggi a vista: `ChipOption.count` (numero in grassetto nel chip), `disabled` (spento e saltato dalle frecce: a zero il filtro resta nella fila, mai nascosto), `tone="warning"` per un filtro che nomina un difetto (Prodotti: «Senza prezzo», «Fuori menù»). `ActivityMultiSelect` mostra una ricerca sopra le 8 sedi (`ACTIVITY_SEARCH_THRESHOLD`, filtro puro `filterActivityOptions`: nome, senza maiuscole né accenti). «Seleziona tutte» vale sempre per tutte le sedi. `useFilteredProductTabs` espone `ready`: finché l'azienda non c'è non tocca `?tab`, e la pagina riprende `initialTab` quando arriva (un `?tab` sotto gate a freddo non cade più sulla prima tab). `PageGate scope="tenant"`: il gate legge il solo possesso del permesso (`canDoOnTenant`), per le pagine che fanno entrare chi non ha sedi (Assistenza: il manager senza sedi trova lì l'email). `StatCard delta.invert`: la freccia segue il segno, il colore dice se è una buona notizia (il tasso di annullamento che sale è rosso). In compatto la riga comoda della testata resta nel DOM per la misura, clippata (`overflow: hidden`): senza, a 375 allargava il `main`. `PageHeaderAction.emphasis: "secondary"` tiene secondaria la primaria della barra compatta (Analitiche: l'export non è l'azione della pagina). `BarList labelColumn="fit"`: colonna etichette a contenuto (fino al 40 %) per etichette corte e uguali, come le stelle del Riepilogo di Recensioni. `ListRow trailingWrap`: sotto 768 il trailing scende in una riga sua, a destra; serve quando il trailing ha due bottoni di testo (oggi la scheda account del CRM). `NavItem.count`: numero di cose da fare sulla voce di sidebar, badge brand; lo calcola `MainLayout` una volta sola e lo passa a zero a chi non può agire (oggi nessuna voce lo usa: il badge delle recensioni è uscito con R1).
- **`Logo`** (`src/components/ui/Logo/`) — unico entry per il brand mark (header, auth, landing, status). `color="auto"` sceglie mono-dark (tema light) / mono-white (tema dark). Sostituisce i markup logo sparsi; non reintrodurre `<img>` logo inline.
- **`StyleSwatch`** (`src/components/ui/StyleSwatch/`) — campione di uno stile (SVG, colori negli attributi `fill`), elenco Stili e card del menù; `label` per il nome accessibile. `StatusBadge` tronca la parola in una cella stretta (nome accessibile intero).
- **`qrcode.react`** (`QRCodeSVG`) disegna l'SVG con `role="img"` e nessun nome: passare sempre un `aria-label` che dice dove porta il codice (es. `DEMOS.qrLabel` in `CampaignLanding/content/landing.ts`); la prop arriva fino all'`<svg>`.
- **Framing immagini — stack condiviso** (maturo, usato da Featured + Storie + Prodotto): `ImageReframeEditor` (`src/components/ui/ImageReframeEditor/`) editor pan/zoom/fit/background, parametrico via prop `aspectRatio` (default 16/9); `reframeGeometry.ts` motore geometrico **puro** (no DOM, no canvas); `FramedMedia` (`src/components/ui/FramedMedia/`) renderer pubblico CSS-only SSR-safe che riapplica il framing salvato (path legacy cover a zoom≈1, path parametrico a zoom≠1 — richiede il ratio naturale); tipo `MediaFraming` (`{focalX, focalY, zoom, fillMode, fillColor}`) in `ImageReframeEditor/types.ts`; compressione centralizzata `src/utils/compressImage.ts` (`COMPRESS_PROFILES`: cover/product/logo/avatar/featured/story). L'editor è agnostico rispetto allo storage del framing (Featured usa colonne DB dedicate, Storie JSONB, Prodotto `products.image_framing jsonb`) e ritorna `MediaFraming` al caller. Audit completo dei 7 punti di upload: `docs/audit-image-upload.md`.
- **Framing immagine prodotto** (`FASE 8b`, committato `29ef5b46`): `ImageUploadEditor` (`src/components/ui/ImageUploadEditor/`) compone dropzone + `compressImage` + `ImageReframeEditor`; approccio **metadata NON-baked** (l'immagine prodotto rende a 1:1/4:3/16:9 dallo stesso file). Colonne `products.image_framing jsonb` + `image_aspect_ratio real`; default `PRODUCT_IMAGE_DEFAULT_FRAMING` (center/cover/blur) quando NULL. `FramedMedia` in uso nella griglia admin di Prodotti (`CardGridItem media`), `ItemDetail` e `CollectionView` (pagina pubblica). Audit: `docs/audit-image-upload-prodotto.md`.
- Lingua: **italiano** ovunque. Tenant→"Azienda", Activity→"Sede", `owner_user_id`→mai in UI.
- **Stato attività**: UI usa sempre "**Pubblicata**" / "**Sospesa**" (mai "Attiva"/"Inattiva"). DB values restano `status: "active" | "inactive"`. Motivi sospensione mappati centralmente in `src/utils/activityStatus.ts` (`formatInactiveReason` + `INACTIVE_REASON_LABEL`).
- SCSS Modules (`.module.scss`). Tema: `src/styles/_theme.scss`.
- Import alias: `@components/`, `@services/`, `@context/`, `@types/`, `@utils/`, `@pages/`, `@layouts/`, `@styles/`. Mai `../../`.
- Toast: `useToast().showToast({ message, type })`.
- **Tooltip vs InfoTooltip**: regole d'uso in `memory/feedback_tooltip_guidelines.md`.
- **Gating permission**: scope business → `usePermissions()` + helper `src/lib/permissions.ts` (canDoOnTenant, canDoOnActivity, ecc.). Scope workspace → `src/utils/workspaceRole.ts` (literal compare). Pattern Locked state via `EmptyState + Lock` icon per pagine intere (TeamPage / SubscriptionPage / BusinessSettingsPage). Sidebar gating per voce via `NavItem.permission`. Vedi `## Sistema permessi multi-sede`.

---

## Aree in sviluppo / da completare

Tech-debt e refactor differiti. Non bloccanti per il task corrente; da valutare durante refactor mirati o cicli di consolidamento.

- **`leave_tenant` RPC rewrite** — vecchia firma `(p_tenant_id)`, no manager scope, no allineamento a `remove_tenant_member` v2. Low priority.
- **Realtime sync su `tenant_memberships`** — cambio ruolo runtime richiede refresh manuale (`usePermissions().refresh()`). Eventuale switch a Supabase Realtime channel per propagation automatica.
- **Sidebar loading-optimistic** — oggi `permissions===null` mostra tutte le voci (transitorio). Visivo flash su utenti scoped. Alternativa: skeleton durante load.
- **Permission `translations.read` dedicato** — mancante. Sidebar voce "Lingue" usa `catalogs.read` proxy. Creare permission dedicato se gating più fine.
- **Storico admin — ripristino ordini annullati (caso A)** — Step 5b ha consegnato lo Storico (delivered + cancelled del giorno operativo) con azione "Ripristina" SOLO sui delivered (`restore-order`). Gli ordini `cancelled` restano terminali per design (no UI restore). Caso A futuro: recupero annullati richiederebbe una nuova edge function `restore-cancelled-order` (transition `cancelled → submitted` o `cancelled → acknowledged` con reset di `cancelled_at`/`cancelled_by`/`cancellation_reason` via `clear_fields`), source policy da concordare (es. solo entro N minuti dalla cancellazione).
- **RLS delete `translations` e scritture `translation_jobs` aperte a ogni membro**: serve RPC di accodamento con permesso dell'entità sorgente + `enqueueWithSilentError` da rivedere (PR a parte, dopo la moderazione).

---

## Plugin & MCP — regole d'uso

Le regole prevalgono sui descriptor dei plugin in caso di conflitto.

### Plugin disabilitati (non invocare)

- `vercel` — stack è Vite, non Next.js.
- `playground` — nessun caso d'uso.
- `ralph-loop` — nessun task ricorrente.
- `feature-dev` (agent suite + slash) — sostituito da `superpowers` per task complessi e da `TodoWrite` per task semplici.
- `feature-dev:code-reviewer` — sostituito dal flusso review descritto sotto.
- `caveman-commit` — sostituito da `commit-commands`.
- `typescript-lsp` — sostituito da `mcp__ide__getDiagnostics`.
- `github` plugin — già disabilitato. Per operazioni GitHub usare `gh` CLI via Bash.

### Code review

- **Feature multi-file, refactor architetturale, area security-sensitive (RLS, edge functions, billing)** → workflow `superpowers` completo. Review integrata via `superpowers:requesting-code-review`.
- **Task tattico singolo** → niente `superpowers`. Se review necessaria, `code-review` slash standalone.
- **Quick scan PR pre-merge** → `caveman-review`.

### Planning

- Default: `TodoWrite` inline.
- `superpowers:writing-plans` SOLO dentro un workflow `superpowers` già attivo.
- MAI invocare `feature-dev` agent: disabilitato.

### Workflow superpowers — quando attivarlo

Utile per task multi-step complessi, dannoso per task tattici (overhead di planning).

**Skip brainstorm/write-plan se il prompt utente è già strutturato** (≥2 marker: file espliciti con path, vincolo "NON leggere altro", obiettivo single-concern dichiarato, vincoli "non toccare X"). In quel caso esecuzione diretta. TDD e review-tra-task restano attive.

### Rami e cartelle

Flusso unico per Alex, Lorenzo e ogni sessione (deciso da Lorenzo il 2026-10-08; nel brain `wiki/decisioni/flusso-git-e-rilasci.md`).
- `main` = produzione, `staging` = collaudo: solo via PR.
- Un lavoro = un ramo corto da `origin/staging` (`fix/…`, `feat/…`, `docs/…`) = una PR piccola verso `staging`. La descrizione dice se ci sono migration o edge. Alex lavora su `officina`, PR `officina` → `staging` a pezzi.
- Due cartelle: `CataloGlobe/` (principale, sempre su `staging` pulito e allineato: prove, `db push`, deploy) e `../cg-lavoro` (cartella di lavoro, cambia ramo col lavoro). Una seconda cartella di lavoro solo per due sessioni davvero in parallelo, tolta a PR unita.
- PR unita: ramo cancellato da GitHub in automatico, poi `git branch -d` in locale e cartella in più tolta.
- Push del ramo a fine sessione.
- Rilasci in produzione piccoli e frequenti (3-5 PR provate, circa una volta a settimana): PR `staging` → `main` con runbook corto. Se staging ha lavoro non pronto: ramo di rilascio da `main` con le sole modifiche pronte, poi riportate su `staging`.

### Commit

- Standard: `commit-commands` (`/commit`, `/commit-push-pr`).
- Format: Conventional Commits.
- `/clean_gone` — VIETATO senza conferma esplicita umana per ogni branch eliminato.

#### Anti-drift WIP (obbligatorio prima di ogni commit)

Prima di ogni `git add` Claude Code DEVE eseguire e mostrare all'utente l'output di:

```bash
git diff --stat
git status --short
```

E identificare esplicitamente:
- File modified appartenenti al task corrente (vanno staged)
- File modified appartenenti ad altre chat parallele (NON vanno staged)
- File untracked nuovi: nostri (vanno staged) vs altri (lasciati)

Pattern di drift ricorrente: file modificati durante una task (es. `src/types/orders.ts`, `customerSessions.ts`) ma dimenticati nel `git add` perche il focus era su altri file. Risultato: build CI fallisce su file che importano export che il repo Git non ha ancora, recovery commit a cascata.

REGOLE:
1. `git add` SEMPRE esplicito file-by-file. MAI `git add -A`, MAI `git add .`.
2. Per file con modifiche interleavate (nostre + altre chat nello stesso file), valutare `git add -p` per stage selettivo. Se non separabili (es. nuovo blocco di codice nostro che dipende da modifiche dell'altra chat), committare l'intero blocco coerente con messaggio descrittivo.
3. Dopo OGNI commit di feature epic ricca di file, eseguire verifica: `git ls-files | grep <feature_keyword>` per confermare che tutti i file referenziati dal commit siano nel repo.
4. Pre-go-live di un epic: eseguire `npm run build` LOCALE su working tree pulito (solo file dell'epic stessa) per simulare ambiente CI. Se fallisce localmente → fallira su Vercel.

### Compressione output (caveman)

`caveman` full mode attivo per default ad ogni session start. Disattivare: "stop caveman" o `/caveman lite`. Riattivare: `/caveman full`. Per output user-facing (commit message lunghi, descrizioni PR, summary) → prosa normale.

### MCP — Supabase

L'MCP `supabase-staging` espone `apply_migration` e `execute_sql`. Bypassano filesystem migrations.

**Regola** per ogni schema change DDL: (1) creare file `supabase/migrations/YYYYMMDDHHMMSS_*.sql`, (2) conferma esplicita utente, (3) solo dopo invocare `apply_migration`. Letture MCP (`list_tables`, `list_migrations`, `get_advisors`, `get_logs`, `generate_typescript_types`) non richiedono conferma.

Nessuna query al DB di produzione da una sessione Claude, nemmeno in lettura. Per la documentazione e le verifiche fa fede staging.

### CLI Supabase

Progetti: **staging** `lxeawrpjfphgdspueiag`, **produzione** `qomnpzerhbtstbnwxnqc`. Cartella principale e worktree sono collegati a staging (`supabase/.temp/project-ref`); una sessione che la trova collegata a produzione si ferma e lo dice. `supabase db push`, `supabase link` e `supabase functions deploy` su produzione li lancia solo Lorenzo, mai una sessione Claude. In `.claude/settings.json` questi comandi (più `migration repair`) sono in `permissions.ask`. Il 30/09 un `db push` partito dalla cartella principale ha applicato su staging migration non committate di un'altra sessione.

**`supabase db push` (staging) dalla cartella principale** (`CataloGlobe/`, su `staging` allineato a `origin/staging`; deciso da Lorenzo il 2026-10-08, dopo la pulizia che ha tolto il worktree `cataloglobe-ds`). Il push applica tutte le migration presenti nella cartella, anche quelle non committate di un'altra sessione: per questo si parte solo da cartella pulita.
1. `git pull` su `staging`, la migration committata (e unita) è lì; `git status --short supabase/migrations` deve essere vuoto. Il lavoro sui rami si fa nella cartella di lavoro (`### Rami e cartelle`), non qui.
2. `supabase db push --dry-run --include-all`: leggere l'elenco, deve contenere solo le migration attese.
3. `supabase db push --include-all`. `--include-all` sempre: senza, una migration con timestamp anteriore all'ultima applicata viene saltata.
4. Subito dopo, le sole edge function toccate dalla PR: `supabase functions deploy <nome> --project-ref lxeawrpjfphgdspueiag`.

Metodo unico (deciso da Lorenzo il 2026-10-08): niente migration applicate a mano via MCP `execute_sql` o Studio, salvo emergenza o il caso `42601` (`## Database`, `docs/patterns/storage-sql.md`). In produzione stesso metodo, solo al rilascio e solo Lorenzo; edge solo quelle cambiate dall'ultimo rilascio (`git diff --name-only origin/main...origin/staging -- supabase/functions`), non tutte.

**Timestamp delle migration**: sessioni parallele scelgono lo stesso numero e `db push` non avvisa. `ls supabase/migrations` prima di nominare, `list_migrations` su staging dopo. Caso noto: `20260929170000` è `account_deletion_functions_empty_search_path` perché un'altra sessione l'aveva già applicata su staging con quel numero; la guardia di `upsert_manual_translation` è stata rinumerata a `20260929170200` (commit `3b2989c5`). Le due migration non hanno legami.

**Test SQL** (`supabase/tests/*.test.sql`): dipendono dai dati di staging (utenti, tenant, sedi), si eseguono solo su staging, **mai in produzione**. In Studio l'intero script gira in una sola transazione: per isolare un caso usare `SAVEPOINT` / `ROLLBACK TO SAVEPOINT`, non `BEGIN` / `ROLLBACK`.

### MCP — context7

Per query su librerie/SDK del progetto (React 19, Vite 7, Framer Motion v12, Supabase JS v2, Stripe SDK, recharts, @dnd-kit), preferire `context7` alla knowledge memorizzata.

### Controllo a vista col browser (MCP playwright)

Obbligatorio per modifiche a: `src/components/PublicCollectionView/`,
`src/pages/Dashboard/Styles/Editor/`. Non è la suite e2e (`## Test e2e`): sono
scenari guidati a mano via MCP. Richiede `npm run dev:api` (vercel dev sulla 3001).

**SOSPESO dal 18/09/2026**: l'ambiente locale non serve `/api`, quindi il
controllo non è eseguibile. Da ripristinare appena il flusso `vercel dev`
torna disponibile.

### Resolver — controllo obbligatorio

Per `scheduleResolver.ts`, `schedulingNow.ts`, `resolveActivityCatalogs.ts`:
`src/tests/scheduling/scheduleResolver.contract.test.ts` verde, coi casi nuovi
aggiunti nello stesso commit. Per `ruleAppearance.ts` lo stesso, con
`src/tests/scheduling/ruleAppearance.contract.test.ts` (parità con la matrice).
Per `catalogExplanation.ts` lo stesso, con `catalogExplanation.contract.test.ts`
(parità con `resolveActivityCatalogs`).
Il resolver non ha DOM: il browser è lo strumento
sbagliato, e il bug del menu weekend di Garbagnate l'ha trovato questo test.

### Test e2e (Playwright)

`bash scripts/e2e.sh e2e/<file>.spec.ts[:riga] …` — config `playwright.config.ts`, test in `e2e/*.spec.ts`, Vite su
5174 avviato (o riusato) da Playwright; niente `vercel dev` finché nessuna pagina coperta
chiama `/api`. Login una volta sola in `e2e/global-setup.ts` con `E2E_EMAIL`/`E2E_PASSWORD`
da `.env.e2e.local` (ignorato da git; `E2E_BUSINESS_ID` opzionale, altrimenti prima card
del workspace), sessione in `e2e/.auth/user.json` (ignorato).
**OTP non automatizzabile**: l'utente e2e va verificato a mano (`/verify-otp`) una volta
ogni 30 giorni (`otp_user_verifications`); scaduta, il global-setup fallisce con messaggio
esplicito. Regola M17: il test e2e di una pagina si scrive PRIMA della sua riscrittura e
resta verde dopo. Locator: nomi accessibili (`getByRole`), non testo label (`required`
aggiunge ` *` aria-hidden); la sidebar è `navigation "Menu principale"`.
`npm run typecheck:e2e` (`tsconfig.e2e.json`) tipa `e2e/`; sta fuori da `tsc -b` e gira nel job CI del budget.
Pagine con scritture: stub dei dati via `page.route`. La macchina è in `e2e/restStub.ts` (filtri PostgREST, rete delle scritture a 500, `onWrite`, `revoke`), i dati per pagina in `e2e/menuStub.ts` e `e2e/programmazioneStub.ts`.
Ogni write non registrata risponde 500, così un gesto non previsto fa fallire il test;
i test di sola lettura aspettano `stub.revoked` prima di controllare un'assenza.
**Contro staging solo via `scripts/e2e.sh`**: una run alla volta su tutta la macchina (lock in
`~/.cache/cataloglobe-e2e.lock`), solo spec singole passate come argomento, sempre `--workers=1`.
Mai la suite completa, mai `--repeat-each`, mai cicli `for` di run. Motivo: il 30/09–01/10 le
suite ripetute di più sessioni hanno esaurito il Disk IO di staging.
`workers: 2` in `playwright.config.ts` vale per la CI; in locale `scripts/e2e.sh` forza `--workers=1`. Con 4 worker compaiono pagine bianche sotto carico: non alzarlo.
Orologio fisso (`page.clock`, Programmazione: mer 23/09/2026 12:00 Roma): ferma anche le animazioni Framer, quindi negli screenshot gli elementi in entrata restano a opacity 0; per le prove visive, pagina senza orologio fisso.

### Slash commands matched-with-rules

- `/security-review` — invocare prima del merge per modifiche RLS, edge functions, auth, billing.
- `/revise-claude-md` — SOLO su richiesta esplicita (workflow guidato, riscrive sezioni).

### Fine task — self-check CLAUDE.md (obbligatorio)

Prima di dichiarare un task finito, chiediti: ho introdotto epic/pattern/tabella/RPC/edge function/gotcha NON già documentato in CLAUDE.md o `docs/`? Se sì: proponi il diff (sezione + testo) in chat, PRIMA di chiudere il task. Scrittura SOLO dopo conferma esplicita dell'utente (resta valida `## File curati manualmente — protezione` sotto: niente auto-write silenzioso). Se il task è puramente tattico (bugfix isolato, nessun pattern nuovo) → skip, nessun rumore.

### File curati manualmente — protezione

NON modificare automaticamente: `CLAUDE.md` (root + `docs/`), `MEMORY.md`, file in `memory/`. `caveman:compress` su questi file VIETATO senza conferma esplicita umana (lettura del compress + backup `.original.md` + sovrascrittura).

---

## PROIBITO

**Sicurezza**: modificare migration esistenti | rimuovere RLS | `service_role` nel frontend | bypassare tenant validation | referenziare `v2_activity_schedules` (ELIMINATA)

**Architettura**: Supabase diretto da componenti | `tenant_id` da `auth.user.id` | nuovi provider context | modali centrate per CRUD | router fuori da App.tsx | top navbar | `any` in TypeScript | `customer_session_id` decodificato dal JWT lato frontend

**Database**: prefisso `v2_` nelle query service | tabelle senza `tenant_id` (eccezioni di piattaforma: `leads`, `crm_*`) | `CASCADE` cross-dominio senza richiesta | modificare `get_my_tenant_ids()` | `DROP POLICY` senza `IF EXISTS` | bypassare optimistic locking nelle transition admin (`expected_version` sempre richiesto)

**Frontend**: CSS inline | testi in inglese | esporre `owner_user_id` | librerie npm non richieste | submit button dentro `<form>` nei drawer | SystemDrawer/DrawerLayout nella pagina pubblica (usare PublicSheet) | label "Attiva"/"Inattiva" per stato sede (usa "Pubblicata"/"Sospesa" via `StatusBadge`) | rimuovere `position: relative` su `.wrapper` o `top: 0; left: 0` su `.input` in `Switch.module.scss` (bug fix bceb822) | bypassare `formatInactiveReason` | reintrodurre debounce manuale (`useRef<setTimeout>`) per save multi-select (usare draft + `UnsavedChangesBar`) | chiamare Edge Functions customer-only da contesto admin | `backdrop-filter` su elemento che trasla in `PublicSheet` | tornare a spring Framer per l'uscita mobile di `PublicSheet` (regressione perf iOS) | `dragMomentum` diverso da `false` sul panel draggabile di `PublicSheet` | testare fix perf iOS su tab Safari non-incognito (cache bundle vecchio) | dichiarare una route pubblica slug-based direttamente in `App.tsx` o `entry-client.tsx` (usare `src/routes/publicRoutes.tsx`) | `width={n}` su `SystemDrawer` (usa `size`; ≥ 900 px = route) | spiegazione del catalogo di una sede (banda, provenienza, prezzo dalla regola, menù attivo) senza `canExplainActivityCatalog` | conferme irreversibili su `ModalLayout` (usa `ConfirmDialog`) | importare `SectionCard`/`Sidebar` nei file nuovi (alias deprecati: `Card`, `TenantSidebar`) | `#hex`, `font-size` o `transition` non tokenizzati nei `.module.scss` di pagina (contatori `ds:budget:check`) | chiave `localStorage` che spegne un avviso (solo preferenze di vista) | seconda bozza nella stessa pagina per il cappello delle Storie (drawer con Salva immediato) | chiamate al database o alle Edge Functions senza timeout nella pagina pubblica (`withTimeout` da `fetchPublicCatalog.ts`, `timeout` di `functions.invoke`, `AbortSignal.timeout` in `api/`): scaduto il tempo, stato di errore o degrado, mai loader infinito

**Scheduling**: `end_at` come mezzanotte UTC (usare 23:59:59 di Roma via `ruleDateToIso`) | disabilitare giorni della settimana se periodo attivo (sono combinabili) | slot `hero` nei featured (rimosso)

**Pattern**: `null` da `list*` | `useEffect` senza `useCallback` | omettere toast nei catch | no reload dopo CRUD success | form con logica drawer | modificare scheduleResolver in un solo posto | modificare `priceSummary.ts` in un solo posto (sync FE↔Edge) | passare categorie NON mappate a `filterEmptyCategories` nel resolver visibilità (double-key → override inerti) | reintrodurre `<img>` logo inline invece del componente `Logo` | HTML/nesting nel parser emphasis Storie (solo `**`/`*`, nodi TS) | `text-transform: uppercase` sul titolo `Card` | modificare la regola orari prenotazioni in un solo dei 3 file (`ReservationPage/availability.ts` / `reservationSlots.ts` / `_shared/openingHours.ts`) | far cambiare status a `update-reservation` (solo dati, mai transizioni) | `ATTENDEE`/`METHOD:REQUEST` negli ICS prenotazioni (solo PUBLISH/CANCEL) | derivare lo stato di una regola da `enabled + start_at + end_at` o contare righe di `schedule_layout` come «uso» fuori da Programmazione (usare `ruleAppearance.ts` / `deriveScheduleStatus`, §34.3)

**Permessi**: usare `userRole` da `TenantContext` per gating (NULL per manager/staff/viewer) | usare API legacy (`Role` enum, `canManage`, `isOwner(string)`, `isAdmin`, `isMember` — eliminate Fase 5.C.C) | bypassare i gating frontend (`canChangeRoleOf`, `canRemoveMember`, `canInviteRole`) chiamando direttamente la RPC senza pre-check | montare `PermissionsProvider` fuori da `/business/:businessId/*` | usare `usePermissions()` in componenti workspace (`/workspace/*`, `/select-business`) — usa `workspaceRole` helpers | INSERT manuale `tenant_memberships.role='owner'` (constraint post-Fase 5.B.2 ammette solo NULL\|'admin')

**Plugin & MCP**: invocare plugin disabilitati | DDL via Supabase MCP senza file migration creato prima | `supabase db push` fuori dalla cartella principale pulita su `staging` o senza `--dry-run` prima e `--include-all` | `supabase db push`/`link`/`functions deploy` su prod da una sessione Claude | query (anche lettura) sul DB di produzione | test di `supabase/tests/` in produzione | `/clean_gone` senza conferma esplicita per branch | `caveman:compress` su CLAUDE.md/MEMORY.md senza conferma | `superpowers` brainstorm/write-plan quando il prompt è già strutturato | knowledge memorizzata su versioni libreria invece di `context7`

**Test e2e**: `npx playwright test` diretto (solo `scripts/e2e.sh`) | suite e2e completa contro staging | `--repeat-each`, `--workers` > 1 o cicli `for` di run e2e
