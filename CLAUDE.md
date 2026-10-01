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
- **Permissions Matrix** (v3, Track A completo): `docs/permissions-matrix.md` — 41 permessi, matrice ruolo×permesso, gating FE per pagina, readiness Fase 1
- Roadmap: `docs/roadmap.md`
- **Pattern dettagliati** (`docs/patterns/`): `delete-drawer.md`, `activity-detail.md`, `draft-unsaved-bar.md`, `public-page.md`, `style-editor.md`, `ui-components.md`, `storage-sql.md`, `epic-ordering.md`, `status-page.md`

---

## Architettura

- **Service layer obbligatorio**: `Componente → src/services/supabase/<dominio>.ts → Supabase Client → PostgreSQL`. MAI chiamare Supabase da componenti React.
- **Un file service per dominio**. Firma: `list*(tenantId)`, `get*(id, tenantId)`, `create*(tenantId, data)`, `update*(id, tenantId, data)`, `delete*(id, tenantId)`.
- `list*` ritorna `T[]` (mai null). `get*` lancia errore se non trova. `delete*` ritorna `void`.
- **Errori**: controllare `error.code` — `PGRST116` (not found), `23503` (FK violation), `23505` (duplicate). Poi `throw error`.
- **Route**: tutte in `src/App.tsx`. Business routes sotto `/business/:businessId/`. `businessId` = source of truth per tenant. Lista completa in `docs/routes.md`.
  - **Route a segmento singolo** (`/login`, `/status`, `/landing-dev`…): ogni nuova va registrata, nello stesso commit, in tre posti oltre ad `App.tsx`. (1) `vercel.json`: nella rewrite a `/index.html` che sta PRIMA della regola `/:slug`, altrimenti passa da `/api/ssr-render` e risponde 404; va aggiunta anche al lookahead delle due regole `headers` che rilassano X-Frame-Options. (2) `RESERVED_SEGMENTS` in `api/ssr-render/index.ts`. (3) `is_reserved_slug()` con una nuova migration (`CREATE OR REPLACE` partendo da `pg_get_functiondef` sul live), così nessuna sede può prendere quello slug.
- **Layout**: `MainLayout` (business), `WorkspaceLayout` (workspace), `SiteLayout` (pubblico). Non crearne di nuovi. Entrambi i layout admin (business + workspace) hanno `AppHeader` globale fisso in alto + sidebar a sinistra; il workspace usa `AppHeaderWorkspace` (logo + greeting "Ciao {firstName}" + notifiche + avatar, niente tenant pill).
- **Provider esistenti**: AuthProvider, TenantProvider, PermissionsProvider (solo dentro `/business/:businessId/*`), DrawerProvider, ToastProvider, ThemeProvider, TooltipProvider. Non crearne di nuovi senza necessità.

---

## Tenant Isolation

- `tenant_id` SOLO da `useTenantId()` o `useTenant().selectedTenantId`. **MAI** da `auth.user.id`.
- OGNI write al DB include `tenant_id`. Nessun dato cross-tenant (eccezione: `allergens`).
- RLS obbligatorio su ogni tabella tenant-scoped: `tenant_id IN (SELECT get_my_tenant_ids())` (NON `= ANY(...)` — funzione set-returning). Per scope activity-granulare usa `has_permission(permission_id, activity_id?)` — vedi `## Sistema permessi multi-sede`.

---

## Sistema permessi multi-sede

### Ruoli (5)

Modello post-Fase 2: scope tenant-wide vs activity-scoped.

- **owner**: `tenants.owner_user_id` (NESSUNA riga in `tenant_memberships`)
- **admin**: `tenant_memberships.role='admin'` (scope tenant-wide)
- **manager / staff / viewer**: `tenant_memberships.role=NULL` + righe in `tenant_membership_activities` con `role + activity_id` (scope activity)

### Backend permission system

- Tabella `role_permissions`: 41 permission seed, scope `tenant` o `activity`
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
- **`src/context/PermissionsContext.tsx`** — `usePermissions()` hook: `{ permissions, loading, refresh }`. Manual `refresh()` dopo cambio ruolo runtime (no realtime).

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

**Variante page-level (prodotto)**: `ProductPage.tsx` solleva il draft Scheda a livello pagina (hook `useSchedaDraft`: `isDirty`/`isSavingAll`/`handleSaveAll`/`handleDiscardAll`) → il draft sopravvive al cambio tab. Azione Salva/Annulla **unica** nell'header via `HeaderSaveAction` (`src/pages/Dashboard/Stories/components/HeaderSaveAction.tsx`, condiviso con Stories), NON una `UnsavedChangesBar` per-sezione. I toggle binari restano save-immediato. Le sezioni allergeni/ingredienti/caratteristiche editano in drawer dedicati che dicono «Applica» (portano in bozza, non sul DB). Nella stessa bozza stanno i valori degli attributi (`useAttributeValuesDraft`, §27: mai più `onBlur` che scrive): `ProductPage` somma i due `isDirty`, «Salva»/«Annulla» chiamano entrambi, guardia all'uscita `useUnsavedChangesGuard`. Restano immediate le azioni strutturali (assegna/togli un attributo, gruppi del prodotto in Utilizzo) e tutta la tab Prezzi & Opzioni, che lo dice in testa. Senza `products.write` la pagina mette le tab in un `fieldset disabled` con banner «Sola lettura» e toglie `HeaderSaveAction`.

---

## Pagine custom

- **Dettaglio sede** (`/business/:businessId/locations/:activityId`) — 7 tab via `?tab=`: `profile` (identità + cosa offre il locale) · `hours` (orari, caricati a livello pagina) · `sala` (tavoli + capienza/durata) · `availability` (visibilità prodotti, destinazione da decidere) · `ordering` · `reservations` · `settings` (URL/QR/PDF, stato, eliminazione). `tables` legacy → `sala`. Valori+label in `TAB_VALUES`/`TAB_LABELS`. Card condivise in `tabs/ActivityTabCards.module.scss`. Prerequisiti canale via `ui/PrerequisitesRow`. Dettaglio: `docs/patterns/activity-detail.md`.
- **Route pubbliche slug-based**: dichiarate UNA VOLTA in `src/routes/publicRoutes.tsx`, consumate da `App.tsx` e `src/entry-client.tsx`. Mai aggiungere una route pubblica direttamente in un entry. Il catch-all `*` resta invece per-entry: è il fallback terminale del set di route di quell'entry, non una route pubblica.
- **Pagina pubblica** (`/:slug`) — flusso `resolve-public-catalog` → `CollectionView`. Container queries (`@container collection`, MAI `@media`). 4 combinazioni card prodotto (Card/Compatto × List/Grid). Slot featured: solo `before_catalog`/`after_catalog` (hero rimosso). Dettaglio: `docs/patterns/public-page.md`.
- **PublicSheet** — modali pagina pubblica. **Non usare** SystemDrawer/DrawerLayout nella pagina pubblica. iOS scroll-lock via `body.position:fixed` (scroll listener su window deve leggere `body.style.top` durante lock). Import: `@components/PublicCollectionView/PublicSheet/PublicSheet`. Dettaglio: `docs/patterns/public-page.md`. Gotcha iOS/WAAPI/scroll-lock: `src/components/PublicCollectionView/CLAUDE.md`; demo in iframe e `LandingFallback`: `src/pages/CampaignLanding/CLAUDE.md`.
- **Style Editor** (`/business/:businessId/styles/:styleId`) — preview/runtime devono restare sincronizzati via `parseTokens()`. Salva in testata (`HeaderSaveAction`) + `useUnsavedChangesGuard`; una sola vista in sola lettura (pannello in `fieldset disabled` + banner) per chi non ha `styles.write`, per l'abbonamento fermo e per gli stili di sistema. L'avviso «Stile in uso» non si spegne: mai una chiave `localStorage` che nasconde un avviso (§34.5/3). Eliminare uno stile in uso = drawer `sm` col sostitutivo (Pattern C), non usato = `ConfirmDialog`. Elenco su `CardGrid` con `StyleSwatch` (SVG, colori negli attributi `fill`, niente `style={{}}`). Dettaglio: `docs/patterns/style-editor.md`.
- **Stories** (`/business/:businessId/stories/...`) — editor a blocchi (`StoryBlockEditor`, blocchi in `src/pages/Dashboard/Stories/components/blocks/`): tipi `heading`, `quote`, `list` (bullet/check), `image` (framing 3:2/4:5 via `StoryImageFramingDrawer` + stack framing condiviso), `text`, `video`. Metadati tipo in `blockTypeMeta.ts`; ogni nuovo blocco = type TS + component + entry meta + factory + voce menu. Body persistito come JSONB `stories.body_blocks[]`. Render pubblico via `resolve-public-story` (parallelo a `resolve-public-catalog`).
  - **Emphasis inline ristretta** (`src/components/PublicCollectionView/StoryView/blocks/parseInlineEmphasis.ts`): riconosce SOLO `**bold**` e `*italic*` — no nesting, marker spaiati restano literal, longest-match (`**` prima di `*`). Emette nodi TS (`text`/`strong`/`em`), **MAI HTML** → React escapa il testo, nessun vettore XSS. La regex di strip-excerpt in `resolve-public-story/index.ts` DEVE rispecchiare le stesse regole (header `⚠️ SYNC` in `parseInlineEmphasis.ts`).
  - **Il cappello** (`tenants.story_*`) non è una collezione sorella: `Card` in cima all'elenco + drawer `md` con «Salva» immediato (`useBrandStoryDraft`, RPC `update_tenant_story_settings`). Mai più una tab «Storia del brand» con una seconda bozza nella pagina.
  - Editor: bozza di pagina + `HeaderSaveAction` + `useUnsavedChangesGuard` (`useBeforeUnloadWarning` è uscito). Chi non ha `stories.write` legge in `fieldset disabled`, lo stato è un'etichetta.
  - **Per sede** (§34.7, §50.13): `stories.activity_id` null = tutta l'azienda, una sede = solo lei; si sceglie nella card «Dove appare» dell'editor (bozza di pagina). `ON DELETE CASCADE`: il dialogo di eliminazione della sede dice quante storie se ne vanno (`countStoriesForActivity`). Tenant garantito dal DB: FK composita (activity_id, tenant_id) + policy per scope (PR #147).
- **In evidenza** (`/business/:businessId/featured/:id`) — una pagina, un Salva (§28.3): `useFeaturedDraft` (tipo, testi, immagine, bottone) + `useFeaturedProductsDraft` (nota, ordine, togli, aggiungi esistenti), un `HeaderSaveAction`, guardia all'uscita. La modalità di prezzo si deriva dal tipo, mai un campo (`featuredContentTypes.ts`, provato in `src/tests/featured/`). La tab Prodotti segue il tipo della bozza. Subito solo «Nuovo {prodotto}»; il prodotto si apre nella sua pagina, non si modifica qui (§49.1/3).
- **Analitiche** (`/business/:businessId/analytics`) — ordine fisso per tipo di dato (§36): banda del campione (`SampleBand`, «Visite», definizione) · Cosa cercano · Cosa guardano · Recensioni · Ordini al tavolo · Prenotazioni; una sezione senza dati nel periodo scende in fondo (`CollapsedSections`, una riga col perché e un'uscita). Sotto 100 visite niente percentuali né confronti (`SAMPLE_THRESHOLD`), il confronto chiede una base minima (`MIN_DELTA_BASE`), tutto in `utils/periodComparison.ts` coi test. Periodo in `?period=` (default 30 giorni), «Oggi» dalla mezzanotte di Roma. Due serie mai su due assi y: due `TrendChart` sulla stessa x (`utils/analyticsSeries.ts`).
- **Disponibilità** (`/locations/:activityId/disponibilita`) — legge chi ha `activity.read`, scrive chi ha `activity.manage` (le RLS di `activity_product_overrides`); `product_availability.write` resta al gate degli ordini. Sola lettura: `fieldset disabled` sul solo tri-stato, ricerca e filtri restano. Tri-stato scritto, vista Prodotti/Ingredienti in `?vista=` (non `?tab=`: la scheda della sede reindirizza i vecchi `?tab=`). «Cosa vedono i clienti» (§19) è la milestone 7.
- **Lingue** resta pagina propria (L1, §50.14): salva subito, ha stato vivo e un gate suo; `translations.write` per scrivere, `catalogs.read` per leggere finché non esiste `translations.read`.
- **Recensioni** (`/reviews`): in cima la coda delle recensioni in attesa (Pubblica · Tieni nascosta, con `reviews.moderate`), poi il riepilogo sulle sole pubblicate, poi l'elenco con Elimina solo sulle nascoste (`reviews.delete`). `updateReviewStatus` scrive solo `status`: dalla #155 è l'unica colonna che i membri possono aggiornare. La pagina pubblica non mostra recensioni: il testo della coda non deve promettere il contrario.

---

## Scheduling (Programmazione)

Quattro `rule_type` su stesso modello `schedules`: `"layout"` (quale catalogo mostrare — è quello che la checklist di Panoramica conta come «regola attiva», `overviewStats.ts`) · `"price"` · `"visibility"` · `"featured"` (`scheduleResolver.ts:25`, `layoutScheduling.ts:23`). Non esiste `"catalog"`. Resolver via **competizione** (1 sola regola vince per sede per tipo). Sistema bozze (`enabled=false` finché campi obbligatori mancanti). Periodo + giorni combinabili.

Dettaglio rule resolver, sistema bozze, simulatore, schema tabelle: `docs/scheduling.md`.

**Dettaglio regola**: una sola pagina, `RuleDetailPage.tsx`, montata su `/scheduling/:ruleId` e `/scheduling/featured/:ruleId`, stato in `useRuleDetail.ts`. Forma del form, lettura dalla regola, validazione e campi mancanti della bozza stanno in `src/utils/ruleDetailForm.ts` (`buildRuleDetailForm`, `validateRuleForm`, `firstRuleFormError`, `missingDraftFields`): puro, provato in `src/tests/ruleDetailForm.test.ts`. Una validazione nuova si scrive lì, non nel componente. Salva/Annulla in `HeaderSaveAction`, uscita con modifiche via `useUnsavedChangesGuard`. Nell'elenco il filtro per tipo sta nella testata: `Tabs` col contatore, in compatto il selettore di sezione.
Prezzi e Disponibilità scelgono i prodotti dallo stesso drawer «Aggiungi prodotti» (`AssociatedContentSection`, `SystemDrawer size="md"`: ricerca, gruppo, tabella con selezione). I prezzi stanno in una `DataTable`: una riga per prezzo (il prodotto, o ogni suo formato), colonne Prezzo e Listino barrato. Non tornare al muro di pill.
**Settimana** (`CalendarView`): per ogni giorno una pila di schede, una per regola accesa, con la finestra intera della regola, non il pezzo che vince. La competizione vive per sede e qui le sedi sono tutte insieme. Chi vince lo dirà la matrice (§20, dopo l'estrazione della competizione); fino ad allora lo dicono il simulatore e «Sovrascritta da …» nella lista. Non reintrodurre la risoluzione per minuto sull'azienda intera.

**Banda del momento e matrice sedi × strati** (§50.7): in cima alla vista Elenco. Calcolo puro in `src/utils/scheduleMatrix.ts`, una `resolveCompetition` per sede sulle regole già caricate (la stessa di «Sovrascritta da»); istante del cursore da `romeInstantAt` (`src/utils/romeInstant.ts`), mai dalla mezzanotte del browser. Il cursore muove banda e matrice, **non l'elenco**. «A mano» = tutte le righe di `activity_product_overrides` (`countManualOverridesByActivity`). Negli e2e l'elenco si cerca in `region "Le regole"`: la matrice ripete i nomi delle regole.

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

Dettaglio UI (componenti tavoli, pagina Ordini, realtime admin/customer): `src/components/Tables/CLAUDE.md`, `src/pages/Dashboard/Orders/CLAUDE.md`. Edge (`resolve-table`, transizioni admin, `adminOrderTransition.ts`): `supabase/functions/CLAUDE.md`.

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

Service layer FE + UI (`src/pages/Dashboard/Reservations/`, rotta `/locations/:id/prenotazioni`): `src/pages/Dashboard/Reservations/CLAUDE.md`. Edge Functions e `_shared/reservation*.ts`: `supabase/functions/CLAUDE.md`.
---

## Database

- Schema changes: SEMPRE nuova migration (`supabase/migrations/YYYYMMDDHHMMSS_*.sql`). MAI modificare esistenti.
- **Query nei service**: nomi SENZA prefisso (`products`, mai `v2_products`). Tipi TS: prefisso `V2`.
- Nuove tabelle: `tenant_id UUID NOT NULL`, RLS abilitato, 4 policy (select/insert/update/delete).
  - **Eccezione: `leads`** (mig `20260926120000`), contatti dal form della landing di campagna. Tabella di piattaforma: niente `tenant_id`, RLS abilitato **senza policy** e privilegi revocati ad anon/authenticated. Scrive solo l'edge `submit-lead` con service role; nessun accesso dal client.
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

### Stripe lifecycle
Usare sempre `_shared/stripe-helpers.ts`. Pattern: `scheduleStripeCancel()` soft-delete → `reactivateStripeSubIfScheduled()` recovery → `cancelStripeSubImmediate()` + `deleteStripeCustomer()` hard-delete. Tutti idempotenti e non-throwing. NON chiamare `stripe.subscriptions.cancel()` direttamente in soft-delete.

---

## Edge Functions

Tutte in `supabase/functions/<nome>/index.ts`. Shared code in `_shared/`. `verify_jwt: false` su tutte.

Deploy sempre con --project-ref esplicito. Il deploy su prod lo fa solo Lorenzo (vedi `### CLI Supabase` in Plugin & MCP).

**`scheduleResolver.ts` esiste in DUE posti**: `src/services/supabase/` e `supabase/functions/_shared/`. Sincronizzarli ENTRAMBI ad ogni modifica.

**`priceSummary.ts` idem duplicato FE↔Edge** (header `⚠️ SYNC`): `src/utils/priceSummary.ts` ↔ `supabase/functions/_shared/priceSummary.ts`. `resolvePriceSummary` calcola solo i *fatti* sul prezzo sintetico di un gruppo → `{kind: none|single|multi, min, max, count}`. La *presentazione* ("da X" / range) vive SOLO lato FE in `src/utils/formatPriceSummary.ts` (l'edge Deno usa solo i fatti grezzi). Separazione voluta: la regola di sintesi cambia senza toccare il formatting.

**Contatti dalla landing** (`submit-lead`, `purge-leads`; dettaglio in `docs/edge-functions.md`). `leadValidation.ts` duplicato FE↔Edge (header `⚠️ SYNC`, `src/utils/` ↔ `_shared/`, provato da `src/tests/leadValidation.test.ts`).
- `consent_text` lo scrive solo il server, da `PRIVACY_PUBLISHED_AT` (`_shared/consentVersions.ts`), separata da `CURRENT_CONSENT_VERSIONS.privacy`: il testo privacy si aggiorna senza chiedere un nuovo consenso al sign-up.
- `purge-leads` è in dry-run di default; cron alle 03:45 UTC con URL e secret presi dal vault (`purge_leads_url`, `leads_retention_secret` = `LEADS_RETENTION_SECRET`). `sendEmail` non logga mai destinatario né corpo.

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
  2. **Edge** — `stripe-checkout` legge il profilo fiscale dal DB (`fiscalRow`, non dal request body) e rifiuta prima di creare il customer: `400 invalid_vat_number`, `400 missing_einvoice_recipient`, `503 fiscal_profile_unavailable`. Ownership check (`owner_user_id !== userId` → 403) prima del gate. È l'ultimo cancello sui soldi.
  3. **RPC** — `update_tenant_billing_details` (mig 20260920120000; dal 20260923120300 via `is_valid_partita_iva`) valida la P.IVA lato server (`RAISE invalid_vat_number` ERRCODE 22023) e, con P.IVA, richiede SDI o PEC (`RAISE missing_einvoice_recipient` ERRCODE 22023, mig 20260925120000): chiude anche la chiamata diretta alla RPC. Il create del wizard (INSERT via `createTenant`) non passa dalla RPC: lì valgono CHECK e trigger del punto 4.
  4. **Tabella** — `CHECK tenants_vat_number_valid` su `public.tenants` (mig 20260923120200) via `public.is_valid_partita_iva(text)` (IMMUTABLE, NULL/vuota → true): copre ogni percorso di scrittura, incluso l'insert client-side del wizard. Creato `NOT VALID`; `VALIDATE CONSTRAINT` eseguibile quando tutte le righe passano. + trigger `trg_enforce_tenant_einvoice_recipient` (mig 20260929120000/120100): con P.IVA serve SDI o PEC, 22023 `missing_einvoice_recipient`, solo su INSERT e UPDATE OF vat_number/pec/codice_destinatario (niente CHECK: bloccherebbe il webhook sui violatori esistenti). `createTenant()` (`src/services/supabase/tenants.ts`) traduce il 23514 (match sul nome del vincolo) in `invalid_vat_number` e il 22023 in `missing_einvoice_recipient`; il wizard li riporta al passo Fatturazione.
  Check-digit P.IVA duplicato in 3 punti (⚠️ SYNC): `src/utils/fiscalValidators.ts`, `supabase/functions/_shared/fiscalValidators.ts`, e la funzione SQL `public.is_valid_partita_iva` (mig 20260923120000), usata dal CHECK e dalla RPC.

- **Trigger protezione colonne abbonamento** (`trg_protect_tenant_subscription_columns`, BEFORE INSERT/UPDATE ON tenants, mig 150200/150300). Le colonne abbonamento sono verità di Stripe. Esenti: `service_role`, `postgres`, `supabase_admin`. Tre fasce:
  1. **Sempre protette**: `subscription_status`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_status_event_at`, `trial_until`, `current_period_start/end`, `plan_monthly_value_cents` (in INSERT devono restare al default). Chiude il PATCH diretto `subscription_status='active'`.
  2. **Protette dopo il link a Stripe** (`stripe_subscription_id NOT NULL`): `plan`, `paid_seats`, `billing_interval`. Prima del checkout le scrive il wizard dal client; dopo, seguono la subscription.
  3. **Libere**: dati di fatturazione, nome, logo (via RPC dedicate).

- **`subscription_status_event_at` — asimmetria voluta** (`subscriptionStatusSync.ts`): guard monotòno sull'ora dell'evento, mai `now()`. Il webhook passa `event.created`; il fallback confirm passa `subscription.created`, che precede ogni `event.created` di quella subscription. In una race inversa (confirm prima, webhook dopo) il webhook vince sul timestamp (event.created più recente) ma NON cambia lo status: `subscription_status_event_at` avanza di pochi secondi, il valore resta. Non è corruzione.

**`serviceDay.ts` ↔ `get_service_day_start()` duplicato TS↔SQL** (header `⚠️ SYNC`): `src/pages/Dashboard/Reservations/serviceDay.ts` (`SERVICE_DAY_START_HOUR`) ↔ migration `20260914155000`. Confine della giornata di servizio della sala (05:00 Europe/Rome, non la mezzanotte), letto dal segnale in sala («Aperta da un servizio precedente») e dal cron `close_stale_seatings` che chiude le tavolate dimenticate. Modificare insieme nello stesso commit; l'ora NON è configurabile per sede (decisione FASE 2.8, rinviata al primo locale reale che serve oltre le cinque).

**Comandi cron ↔ funzioni di claim duplicati SQL↔SQL** (header `⚠️ SYNC`): i job pg_cron `process-print-jobs` e `process-translation-jobs` (mig `20260930160000`/`160100`) chiamano l'edge solo se c'è lavoro in coda, con le stesse condizioni di `claim_pending_print_jobs` / `claim_pending_translation_jobs`: `pending` (traduzioni: solo su lingua attiva o job di sistema) + `processing` fermo da più di 5 min (default `p_reclaim_after_minutes`), anche al cap, così il claim li chiude a `failed`. Se cambia il claim, nuova migration che rifà il comando con `cron.alter_job(command := …)`, senza toccare lo schedule. Falso positivo = una chiamata a vuoto; falso negativo = coda ferma.

Catalogo completo, bug history (`purgeTenantData` ordine FK, `purgeActivityFolder` ricorsivo, `config.toml` entry obbligatoria, slash `/` nei commenti Deno) + 11 Edge Functions epic ordering → `docs/edge-functions.md`.

Dettaglio edge ordini (`resolve-table`, 5 transizioni admin, `adminOrderTransition.ts`, realtime su `orders`): `supabase/functions/CLAUDE.md` + `src/pages/Dashboard/Orders/CLAUDE.md`.
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
- **`usePageHeader` con una bozza**: le azioni di testata dipendono dai campi della bozza (`isDirty`, `save`, `discard`), mai dall'oggetto che l'hook della bozza restituisce: è nuovo a ogni render, rifà la testata a ogni render e richiude i menu Radix aperti nella pagina (due volte nel lotto Stili · Storie · In evidenza).
- **Design system M17** (lotti 1–3 su `refactor/design-system`, brief in `Claude outputs/cataloglobe-design-system.md`) — token in `src/styles/_theme.scss`: `--space-*`, `--radius-inner/control/surface/pill`, `--shadow-rest/float/overlay/drawer`, `--z-nav/sticky/float/overlay/toast/loader`, `--text-danger/warning`, `--on-brand-soft`, `--drawer-sm/md/lg`. Regole vincolanti in `ui/` e `layout/`: `DataTable` carica con righe Skeleton, colonna azioni sempre ultima e visibile al hover (`TableRowActions`), vuoto = `EmptyState inline` (`filtered` + `onClearFilters` quando `isFiltered`); `SystemDrawer` accetta solo `size="sm|md|lg"` (`width` numerica deprecata; un pannello da 900 px in su non è un drawer, è una route); `ConfirmDialog` standalone per le azioni irreversibili (`confirmText`, `isLoading`, `error`; `onConfirm` che ritorna `false`/`void` lascia aperto), `ModalLayout` solo per guide e anteprime; `EmptyState page` richiede `action`; una sola sidebar: `AppSidebar` rende, `TenantSidebar` costruisce le voci (`Sidebar.tsx` alias deprecato); voce 32 px desktop / 40 mobile, collassata di default tra 768 e 1023. Budget anti-regressione: `npm run ds:budget:check` dopo ogni commit (mai `node scripts/ds-budget.mjs` senza `--check`: sovrascrive la baseline). Galleria stati: `/dev/ui`. `ListRow dense` (48) solo per gli elenchi di servizio; `muted` è solo aspetto, con `onClick` la riga resta apribile. `DataTable mutedRowIds` = riga spenta ma cliccabile; `ariaLabel` = semantica di tabella. `RangeInput marks` = tacche a intervalli uguali. La prima tab di `Tabs` non ha padding sinistro: il suo testo sta sul filo del contenuto sotto; non ridare rientro per pagina. Testata (`PageHeaderSlot`): riga comoda → barra compatta, decisa misurando il contenuto (`useCompactToolbar`, scelta pura in `chooseToolbarLayout`), mai con un breakpoint. `PageHeaderConfig.condensed` (`{ actions?: ReactNode[]; stack?: boolean }`) aggiunge gradini prima della barra compatta: versioni più strette delle azioni, poi due righe (azioni sopra, tab sotto). Oggi lo usa solo Programmazione ed è un'apertura di lotto 6 (unificare con la barra compatta o togliere): non usarlo in altre pagine prima di quella decisione. `ToolbarSearch width="min"` (200 px) esiste solo per questi gradini. `DATA_TABLE_CLASSES.cellTwoLineWrap`, insieme a `cellTwoLine`: la seconda riga va a capo invece di troncarsi. Serve sul telefono, dove la colonna è una sola e la riga deve dire tutto. `ChipGroupSingle` per i filtri coi conteggi a vista: `ChipOption.count` (numero in grassetto nel chip), `disabled` (spento e saltato dalle frecce: a zero il filtro resta nella fila, mai nascosto), `tone="warning"` per un filtro che nomina un difetto (Prodotti: «Senza prezzo», «Fuori menù»). `ActivityMultiSelect` mostra una ricerca sopra le 8 sedi (`ACTIVITY_SEARCH_THRESHOLD`, filtro puro `filterActivityOptions`: nome, senza maiuscole né accenti). «Seleziona tutte» vale sempre per tutte le sedi. `PageGate scope="tenant"`: il gate legge il solo possesso del permesso (`canDoOnTenant`), per le pagine che fanno entrare chi non ha sedi (Assistenza: il manager senza sedi trova lì l'email). `StatCard delta.invert`: la freccia segue il segno, il colore dice se è una buona notizia (il tasso di annullamento che sale è rosso). In compatto la riga comoda della testata resta nel DOM per la misura, clippata (`overflow: hidden`): senza, a 375 allargava il `main`. `PageHeaderAction.emphasis: "secondary"` tiene secondaria la primaria della barra compatta (Analitiche: l'export non è l'azione della pagina). `BarList labelColumn="fit"`: colonna etichette a contenuto (fino al 40 %) per etichette corte e uguali, come le stelle del Riepilogo di Recensioni. `ListRow trailingWrap`: sotto 768 il trailing scende in una riga sua, a destra; serve quando il trailing ha due bottoni di testo (la coda di Recensioni). `NavItem.count`: numero di cose da fare sulla voce di sidebar, badge brand; lo calcola `MainLayout` una volta sola e lo passa a zero a chi non può agire (oggi: recensioni in attesa, solo con `reviews.moderate`).
- **`Logo`** (`src/components/ui/Logo/`) — unico entry per il brand mark (header, auth, landing, status). `color="auto"` sceglie mono-dark (tema light) / mono-white (tema dark). Sostituisce i markup logo sparsi; non reintrodurre `<img>` logo inline.
- **`StyleSwatch`** (`src/components/ui/StyleSwatch/`) — campione di uno stile (SVG, colori negli attributi `fill`), elenco Stili e card del menù; `label` per il nome accessibile. `StatusBadge` tronca la parola in una cella stretta (nome accessibile intero).
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

Tech-debt e refactor differiti: `docs/roadmap.md`, sezione «Aree in sviluppo / da completare (da CLAUDE.md)».
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

### CLI Supabase

Cartella principale e worktree sempre collegate a staging (`supabase/.temp/project-ref` = `lxeawrpjfphgdspueiag`). `supabase db push`, `supabase link` e `supabase functions deploy` su prod li lancia solo Lorenzo, mai una sessione Claude. Una sessione Claude che trova la CLI collegata a prod si ferma e lo dice. In `.claude/settings.json` questi comandi (più `migration repair`) sono in `permissions.ask`. Il 30/09 un `db push` partito dalla cartella principale ha applicato su staging migration non committate di un'altra sessione.

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
Il resolver non ha DOM: il browser è lo strumento
sbagliato, e il bug del menu weekend di Garbagnate l'ha trovato questo test.

### Test e2e (Playwright)
`npx playwright test`. Regola M17: il test e2e di una pagina si scrive PRIMA della sua riscrittura e resta verde dopo. Setup, OTP (scade ogni 30 giorni), stub, `workers: 2`, orologio fisso: `e2e/CLAUDE.md`.

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

**Database**: prefisso `v2_` nelle query service | tabelle senza `tenant_id` | `CASCADE` cross-dominio senza richiesta | modificare `get_my_tenant_ids()` | `DROP POLICY` senza `IF EXISTS` | bypassare optimistic locking nelle transition admin (`expected_version` sempre richiesto)

**Frontend**: CSS inline | testi in inglese | esporre `owner_user_id` | librerie npm non richieste | submit button dentro `<form>` nei drawer | SystemDrawer/DrawerLayout nella pagina pubblica (usare PublicSheet) | label "Attiva"/"Inattiva" per stato sede (usa "Pubblicata"/"Sospesa" via `StatusBadge`) | rimuovere `position: relative` su `.wrapper` o `top: 0; left: 0` su `.input` in `Switch.module.scss` (bug fix bceb822) | bypassare `formatInactiveReason` | reintrodurre debounce manuale (`useRef<setTimeout>`) per save multi-select (usare draft + `UnsavedChangesBar`) | chiamare Edge Functions customer-only da contesto admin | `backdrop-filter` su elemento che trasla in `PublicSheet` | tornare a spring Framer per l'uscita mobile di `PublicSheet` (regressione perf iOS) | `dragMomentum` diverso da `false` sul panel draggabile di `PublicSheet` | testare fix perf iOS su tab Safari non-incognito (cache bundle vecchio) | dichiarare una route pubblica slug-based direttamente in `App.tsx` o `entry-client.tsx` (usare `src/routes/publicRoutes.tsx`) | `width={n}` su `SystemDrawer` (usa `size`; ≥ 900 px = route) | conferme irreversibili su `ModalLayout` (usa `ConfirmDialog`) | importare `SectionCard`/`Sidebar` nei file nuovi (alias deprecati: `Card`, `TenantSidebar`) | `#hex`, `font-size` o `transition` non tokenizzati nei `.module.scss` di pagina (contatori `ds:budget:check`) | chiave `localStorage` che spegne un avviso (solo preferenze di vista) | seconda bozza nella stessa pagina per il cappello delle Storie (drawer con Salva immediato) | chiamate al database o alle Edge Functions senza timeout nella pagina pubblica (`withTimeout` da `fetchPublicCatalog.ts`, `timeout` di `functions.invoke`, `AbortSignal.timeout` in `api/`): scaduto il tempo, stato di errore o degrado, mai loader infinito

**Scheduling**: `end_at` come mezzanotte UTC (usare `T23:59:59` locale) | disabilitare giorni della settimana se periodo attivo (sono combinabili) | slot `hero` nei featured (rimosso)

**Pattern**: `null` da `list*` | `useEffect` senza `useCallback` | omettere toast nei catch | no reload dopo CRUD success | form con logica drawer | modificare scheduleResolver in un solo posto | modificare `priceSummary.ts` in un solo posto (sync FE↔Edge) | passare categorie NON mappate a `filterEmptyCategories` nel resolver visibilità (double-key → override inerti) | reintrodurre `<img>` logo inline invece del componente `Logo` | HTML/nesting nel parser emphasis Storie (solo `**`/`*`, nodi TS) | `text-transform: uppercase` sul titolo `Card` | modificare la regola orari prenotazioni in un solo dei 3 file (`ReservationPage/availability.ts` / `reservationSlots.ts` / `_shared/openingHours.ts`) | far cambiare status a `update-reservation` (solo dati, mai transizioni) | `ATTENDEE`/`METHOD:REQUEST` negli ICS prenotazioni (solo PUBLISH/CANCEL) | derivare lo stato di una regola da `enabled + start_at + end_at` o contare righe di `schedule_layout` come «uso» fuori da Programmazione (usare `ruleAppearance.ts` / `deriveScheduleStatus`, §34.3)

**Permessi**: usare `userRole` da `TenantContext` per gating (NULL per manager/staff/viewer) | usare API legacy (`Role` enum, `canManage`, `isOwner(string)`, `isAdmin`, `isMember` — eliminate Fase 5.C.C) | bypassare i gating frontend (`canChangeRoleOf`, `canRemoveMember`, `canInviteRole`) chiamando direttamente la RPC senza pre-check | montare `PermissionsProvider` fuori da `/business/:businessId/*` | usare `usePermissions()` in componenti workspace (`/workspace/*`, `/select-business`) — usa `workspaceRole` helpers | INSERT manuale `tenant_memberships.role='owner'` (constraint post-Fase 5.B.2 ammette solo NULL\|'admin')

**Plugin & MCP**: invocare plugin disabilitati | DDL via Supabase MCP senza file migration creato prima | `supabase db push`/`link`/`functions deploy` su prod da una sessione Claude | `/clean_gone` senza conferma esplicita per branch | `caveman:compress` su CLAUDE.md/MEMORY.md senza conferma | `superpowers` brainstorm/write-plan quando il prompt è già strutturato | knowledge memorizzata su versioni libreria invece di `context7`
