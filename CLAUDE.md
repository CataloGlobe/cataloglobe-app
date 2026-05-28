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
- Roadmap: `docs/roadmap.md`
- **Pattern dettagliati** (`docs/patterns/`): `delete-drawer.md`, `activity-detail.md`, `draft-unsaved-bar.md`, `public-page.md`, `style-editor.md`, `ui-components.md`, `storage-sql.md`, `epic-ordering.md`

---

## Quick start

```bash
npm install
npm run dev          # vite dev server
npm run build        # tsc -b && vite build
npm run lint         # eslint .
npm test             # vitest run
npm run test:watch   # vitest watch
```

---

## Stack tecnologico

- React 19 + TypeScript 5.9 (strict) + Vite 7
- React Router v7 — tutte le route in `src/App.tsx`
- Supabase JS v2 — client solo in `src/services/supabase/client.ts`
- Framer Motion v12 — animazioni
- SCSS Modules (`.module.scss`) — niente CSS inline
- Icons: Lucide React + `@tabler/icons-react`
- Charts: recharts | DnD: @dnd-kit | Testing: Vitest

---

## Architettura

- **Service layer obbligatorio**: `Componente → src/services/supabase/<dominio>.ts → Supabase Client → PostgreSQL`. MAI chiamare Supabase da componenti React.
- **Un file service per dominio**. Firma: `list*(tenantId)`, `get*(id, tenantId)`, `create*(tenantId, data)`, `update*(id, tenantId, data)`, `delete*(id, tenantId)`.
- `list*` ritorna `T[]` (mai null). `get*` lancia errore se non trova. `delete*` ritorna `void`.
- **Errori**: controllare `error.code` — `PGRST116` (not found), `23503` (FK violation), `23505` (duplicate). Poi `throw error`.
- **Route**: tutte in `src/App.tsx`. Business routes sotto `/business/:businessId/`. `businessId` = source of truth per tenant. Lista completa in `docs/routes.md`.
- **Layout**: `MainLayout` (business), `WorkspaceLayout` (workspace), `SiteLayout` (pubblico). Non crearne di nuovi. Entrambi i layout admin (business + workspace) hanno `AppHeader` globale fisso in alto + sidebar a sinistra; il workspace usa `AppHeaderWorkspace` (logo + greeting "Ciao {firstName}" + notifiche + avatar, niente tenant pill).
- **Provider esistenti**: AuthProvider, TenantProvider, DrawerProvider, ToastProvider, ThemeProvider, TooltipProvider. Non crearne di nuovi senza necessità.

---

## Tenant Isolation

- `tenant_id` SOLO da `useTenantId()` o `useTenant().selectedTenantId`. **MAI** da `auth.user.id`.
- OGNI write al DB include `tenant_id`. Nessun dato cross-tenant (eccezione: `allergens`).
- RLS obbligatorio su ogni tabella tenant-scoped: `tenant_id = ANY(get_my_tenant_ids())`.

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

---

## Pagine custom

- **Dettaglio sede** (`/business/:businessId/locations/:activityId`) — 3 tab via `?tab=` (profile/availability/settings). Dettaglio: `docs/patterns/activity-detail.md`.
- **Pagina pubblica** (`/:slug`) — flusso `resolve-public-catalog` → `CollectionView`. Container queries (`@container collection`, MAI `@media`). 4 combinazioni card prodotto (Card/Compatto × List/Grid). Slot featured: solo `before_catalog`/`after_catalog` (hero rimosso). Dettaglio: `docs/patterns/public-page.md`.
- **PublicSheet** — modali pagina pubblica. **Non usare** SystemDrawer/DrawerLayout nella pagina pubblica. iOS scroll-lock via `body.position:fixed` (scroll listener su window deve leggere `body.style.top` durante lock). Import: `@components/PublicCollectionView/PublicSheet/PublicSheet`. Dettaglio: `docs/patterns/public-page.md`.
- **Style Editor** (`/business/:businessId/styles/:styleId`) — preview/runtime devono restare sincronizzati via `parseTokens()`. Dettaglio: `docs/patterns/style-editor.md`.

---

## Scheduling (Programmazione)

Due `rule_type` su stesso modello `schedules`: `"catalog"` + `"featured"`. Resolver via **competizione** (1 sola regola vince per sede per tipo). Sistema bozze (`enabled=false` finché campi obbligatori mancanti). Periodo + giorni combinabili.

Dettaglio rule resolver, sistema bozze, simulatore, schema tabelle: `docs/scheduling.md`.

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

Service layer in `src/services/supabase/`: `tables.ts`, `customerSessions.ts`, `productAvailability.ts`, `orders.ts`. Tipi in `src/types/orders.ts`.

---

## Database

- Schema changes: SEMPRE nuova migration (`supabase/migrations/YYYYMMDDHHMMSS_*.sql`). MAI modificare esistenti.
- **Query nei service**: nomi SENZA prefisso (`products`, mai `v2_products`). Tipi TS: prefisso `V2`.
- Nuove tabelle: `tenant_id UUID NOT NULL`, RLS abilitato, 4 policy (select/insert/update/delete).
- FK: `entita_id`. Self-ref: `parent_entita_id`. Colonne: `snake_case`. Tabelle: plurale.
- Schema attuale + fact critici (slug uniqueness, Stripe-on-tenants, schedule_targets RLS, ecc.) → `docs/database-reference.md`.
- Dati legali aziendali: `src/config/company.ts` ↔ `supabase/functions/_shared/company-config.ts` sono **duplicazione sincronizzata** (header `// ⚠️ SYNC`). Modifica entrambi nello stesso commit. Stesso pattern di `scheduleResolver.ts`.
- **Migration con `CREATE FUNCTION` + REVOKE/GRANT**: `supabase db push` fallisce con `SQLSTATE 42601`. Workaround: applicare via Studio SQL Editor + registrare in `supabase_migrations.schema_migrations`, oppure splittare in 2 file consecutivi. Dettaglio: `docs/patterns/storage-sql.md`.

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

### Stripe lifecycle
Usare sempre `_shared/stripe-helpers.ts`. Pattern: `scheduleStripeCancel()` soft-delete → `reactivateStripeSubIfScheduled()` recovery → `cancelStripeSubImmediate()` + `deleteStripeCustomer()` hard-delete. Tutti idempotenti e non-throwing. NON chiamare `stripe.subscriptions.cancel()` direttamente in soft-delete.

---

## Edge Functions

Tutte in `supabase/functions/<nome>/index.ts`. Shared code in `_shared/`. `verify_jwt: false` su tutte.

**`scheduleResolver.ts` esiste in DUE posti**: `src/services/supabase/` e `supabase/functions/_shared/`. Sincronizzarli ENTRAMBI ad ogni modifica.

Catalogo completo, bug history (`purgeTenantData` ordine FK, `purgeActivityFolder` ricorsivo, `config.toml` entry obbligatoria, slash `/` nei commenti Deno) + 11 Edge Functions epic ordering → `docs/edge-functions.md`.

---

## Integrazioni

- **Supabase client**: solo `src/services/supabase/client.ts`. Mai `service_role` nel frontend.
- **Email**: solo via Edge Functions (Resend), mai dal frontend.
- **Upload**: `src/services/supabase/upload.ts` + `src/utils/compressImage.ts`. Per upsert vedi `docs/patterns/storage-sql.md`.
- **Stripe**: sottoscrizione tenant, seat management, webhook. Service: `src/services/supabase/billing.ts`.
- **Google Places**: Edge Function `search-google-places` + `GooglePlacesSearch` component in `src/pages/Operativita/Attivita/tabs/contacts/`.

---

## UI

- Componenti in `src/components/ui/` — verificare PRIMA di crearne di nuovi. Catalogo dettagliato: `docs/patterns/ui-components.md` (`AddressAutocomplete`, `FeesSection`, `StatusBadge`, `UnsavedChangesBar`, `EmptyState`, `TranslationsTab`).
- Lingua: **italiano** ovunque. Tenant→"Azienda", Activity→"Sede", `owner_user_id`→mai in UI.
- **Stato attività**: UI usa sempre "**Pubblicata**" / "**Sospesa**" (mai "Attiva"/"Inattiva"). DB values restano `status: "active" | "inactive"`. Motivi sospensione mappati centralmente in `src/utils/activityStatus.ts` (`formatInactiveReason` + `INACTIVE_REASON_LABEL`).
- SCSS Modules (`.module.scss`). Tema: `src/styles/_theme.scss`.
- Import alias: `@components/`, `@services/`, `@context/`, `@types/`, `@utils/`, `@pages/`, `@layouts/`, `@styles/`. Mai `../../`.
- Toast: `useToast().showToast({ message, type })`.
- **Tooltip vs InfoTooltip**: regole d'uso in `memory/feedback_tooltip_guidelines.md`.

---

## Aree in sviluppo / da completare

Tech-debt e refactor differiti. Non bloccanti per il task corrente; da valutare durante refactor mirati o cicli di consolidamento.

- **DropdownMenu custom vs TableRowActions** — coesistono due implementazioni di menu a tendina. `TableRowActions` (Radix-based) usato in 22 DataTable kebab. `DropdownMenu` custom (`src/components/ui/DropdownMenu/`, scritto a mano con framer-motion + useState/useRef/createPortal) usato in 4 call site non-tabella: `HeaderUserMenu`, `HeaderNotifications`, `ActivitySettingsTab`, `Programming.tsx` (bulk action). Refactor proposto: migrare i 4 call site a Radix DropdownMenu (stessa libreria di TableRowActions) ed eliminare `DropdownMenu` custom. Non urgente — funziona oggi. Vantaggio: una sola libreria menu, codice meno custom, manutenzione singola.

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

- Standard: `commit-commands` (`/commit`, `/commit-push-pr`). Format: Conventional Commits.
- `/clean_gone` — VIETATO senza conferma esplicita umana per ogni branch eliminato.

### Compressione output (caveman)

`caveman` full mode attivo per default ad ogni session start. Disattivare: "stop caveman" o `/caveman lite`. Riattivare: `/caveman full`. Per output user-facing (commit message lunghi, descrizioni PR, summary) → prosa normale.

### MCP — Supabase

L'MCP `supabase-staging` espone `apply_migration` e `execute_sql`. Bypassano filesystem migrations.

**Regola** per ogni schema change DDL: (1) creare file `supabase/migrations/YYYYMMDDHHMMSS_*.sql`, (2) conferma esplicita utente, (3) solo dopo invocare `apply_migration`. Letture MCP (`list_tables`, `list_migrations`, `get_advisors`, `get_logs`, `generate_typescript_types`) non richiedono conferma.

### MCP — context7

Per query su librerie/SDK del progetto (React 19, Vite 7, Framer Motion v12, Supabase JS v2, Stripe SDK, recharts, @dnd-kit), preferire `context7` alla knowledge memorizzata.

### MCP — playwright

Obbligatorio per modifiche a: `src/components/PublicCollectionView/`, `src/pages/Stili/StyleEditor/`, `scheduleResolver.ts` / `schedulingNow.ts`.

### Slash commands matched-with-rules

- `/security-review` — invocare prima del merge per modifiche RLS, edge functions, auth, billing.
- `/revise-claude-md` — invocare a fine sessione SOLO se l'utente lo richiede esplicitamente.

### File curati manualmente — protezione

NON modificare automaticamente: `CLAUDE.md` (root + `docs/`), `MEMORY.md`, file in `memory/`. `caveman:compress` su questi file VIETATO senza conferma esplicita umana (lettura del compress + backup `.original.md` + sovrascrittura).

---

## PROIBITO

**Sicurezza**: modificare migration esistenti | rimuovere RLS | `service_role` nel frontend | bypassare tenant validation | referenziare `v2_activity_schedules` (ELIMINATA)

**Architettura**: Supabase diretto da componenti | `tenant_id` da `auth.user.id` | nuovi provider context | modali centrate per CRUD | router fuori da App.tsx | top navbar | `any` in TypeScript | `customer_session_id` decodificato dal JWT lato frontend

**Database**: prefisso `v2_` nelle query service | tabelle senza `tenant_id` | `CASCADE` cross-dominio senza richiesta | modificare `get_my_tenant_ids()` | `DROP POLICY` senza `IF EXISTS` | bypassare optimistic locking nelle transition admin (`expected_version` sempre richiesto)

**Frontend**: CSS inline | testi in inglese | esporre `owner_user_id` | librerie npm non richieste | submit button dentro `<form>` nei drawer | SystemDrawer/DrawerLayout nella pagina pubblica (usare PublicSheet) | label "Attiva"/"Inattiva" per stato sede (usa "Pubblicata"/"Sospesa" via `StatusBadge`) | rimuovere `position: relative` su `.wrapper` o `top: 0; left: 0` su `.input` in `Switch.module.scss` (bug fix bceb822) | bypassare `formatInactiveReason` | reintrodurre debounce manuale (`useRef<setTimeout>`) per save multi-select (usare draft + `UnsavedChangesBar`) | chiamare Edge Functions customer-only da contesto admin

**Scheduling**: `end_at` come mezzanotte UTC (usare `T23:59:59` locale) | disabilitare giorni della settimana se periodo attivo (sono combinabili) | slot `hero` nei featured (rimosso)

**Pattern**: `null` da `list*` | `useEffect` senza `useCallback` | omettere toast nei catch | no reload dopo CRUD success | form con logica drawer | modificare scheduleResolver in un solo posto

**Plugin & MCP**: invocare plugin disabilitati | DDL via Supabase MCP senza file migration creato prima | `/clean_gone` senza conferma esplicita per branch | `caveman:compress` su CLAUDE.md/MEMORY.md senza conferma | `superpowers` brainstorm/write-plan quando il prompt è già strutturato | knowledge memorizzata su versioni libreria invece di `context7`
