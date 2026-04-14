# CLAUDE.md — CataloGlobe

Regole vincolanti. In caso di dubbio: seguire il pattern esistente nel codice.
Documentazione completa: `docs/architecture.md` | Regole estese: `docs/ai-operational-rules.md`

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
- **Route**: tutte in `src/App.tsx`. Business routes sotto `/business/:businessId/`. `businessId` = source of truth per tenant.
- **Layout**: `MainLayout` (business), `WorkspaceLayout` (workspace), `SiteLayout` (pubblico). Non crearne di nuovi. No top navbar.
- **Provider esistenti**: AuthProvider, TenantProvider, DrawerProvider, ToastProvider, ThemeProvider, TooltipProvider. Non crearne di nuovi senza necessita'.

---

## Route principali

```
/                          → Home (landing)
/login, /sign-up, /verify-otp, /check-email, /forgot-password, /reset-password → Auth
/workspace                 → WorkspaceLayout (no TenantProvider)
/onboarding/create-business, /onboarding/activate-trial → Onboarding (no TenantProvider)
/business/:businessId/     → MainLayout + TenantProvider
  overview | locations | locations/:activityId
  scheduling | scheduling/:ruleId | scheduling/featured/:ruleId
  catalogs | catalogs/:id
  products | products/:productId
  featured | featured/:featuredId
  styles | styles/:styleId
  attributes | reviews | analytics | team | subscription | settings
/invite/:token             → InvitePage
/legal/privacy | /legal/termini → pagine legali
/:slug                     → PublicCollectionPage (pagina pubblica)
```

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

---

## Page Pattern

```tsx
const [items, setItems] = useState<T[]>([]);
const [isLoading, setIsLoading] = useState(true);
const loadData = useCallback(async () => {
  try { setIsLoading(true); setItems(await listEntities(tenantId)); }
  catch { showToast({ message: "Errore nel caricamento", type: "error" }); }
  finally { setIsLoading(false); }
}, [tenantId, showToast]);
useEffect(() => { loadData(); }, [loadData]);

// Drawer state: isDrawerOpen, mode ("create"|"edit"), selected
// handleSuccess: await loadData() → close → toast
```

JSX: `PageHeader` → `FilterBar` → `DataTable` → `CreateEditDrawer` → `DeleteDrawer`.

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

## Pagina pubblica (`/:slug`)

**Flusso dati**:
```
/:slug → PublicCollectionPage
  → Edge Function resolve-public-catalog({ slug, simulate? })
  → { business, tenantLogoUrl, resolved: ResolvedCollections, subscription_inactive? }
  → mapCatalogToSectionGroups(resolved)
  → PublicThemeScope (applica CSS tokens dello stile)
    → CollectionView (componente condiviso con StylePreview)
```

**Simulazione**: `?simulate=<ISO_DATE>` — solo per utenti autenticati. Mostra banner giallo in cima.

**Componenti in `src/components/PublicCollectionView/`**:
- `CollectionView` — contenitore principale (gestisce scroll, nav, hub tabs, search)
- `PublicCollectionHeader` — header hero-to-compact con IntersectionObserver:
  - hero: full cover image + activity name + hub tabs + language selector + search
  - compact: sticky bar che appare dopo lo scroll, aggiorna `topOffset` di `CollectionSectionNav`
  - Props chiave: `onCompactVisibilityChange`, `onCompactHeightChange`, `scrollContainerEl` (per preview)
- `PublicFooter` — footer con social links
- `SearchOverlay` — overlay full-screen per ricerca prodotti
- `SelectionSheet` — sheet opzioni/varianti prodotto
- `ItemDetail` — dettaglio prodotto
- `ReviewsView` — tab recensioni (hub)
- `FeaturedBlock` — slot contenuti in evidenza (before_catalog / after_catalog)
- `FeaturedPreviewModal` — modal preview contenuto in evidenza
- `PublicCatalogTree` — navigazione categorie ad albero
- `CollectionSectionNav` — nav sezioni orizzontale (pills/tabs/minimal)
- `LanguageSelector` — selettore lingua (solo IT attivo; EN/FR/DE "presto")
- `PublicSheet` — sheet/dialog generico per la pagina pubblica (vedi sotto)

**Hub tabs** (`HubTab = "menu" | "events" | "reviews"`):
- `menu` — catalogo prodotti + featured blocks
- `events` — tab eventi/promo (da sviluppare)
- `reviews` — recensioni via `submit-review` edge function

**Slot FeaturedBlock**:
- `before_catalog` — tra header e catalogo
- `after_catalog` — sotto catalogo (visibile solo se activeTab === "menu")

**Stati pagina**: `loading | error | inactive | subscription_inactive | empty | ready`

---

## PublicSheet

Pattern per modali/sheet nella pagina pubblica. **Non usare** SystemDrawer/DrawerLayout nella pagina pubblica.

```
PublicSheet → bottom sheet su mobile (swipe-to-close) | dialog centrato su desktop
```

- Usa `position:fixed` sul body per lock scroll iOS Safari (ripristina esatta posizione al chiudi).
- Drag handle su mobile, Escape per chiudere.
- Import: `@components/PublicCollectionView/PublicSheet/PublicSheet`

---

## Style Editor / Preview

**Percorso**: `/business/:businessId/styles/:styleId` → `StyleEditorPage`

**Architettura**:
```
StyleEditorPage
├── StylePropertiesPanel (editing token) / StylePropertiesReadOnly (versioni pubblicate)
├── StyleVersionsPopover
└── StylePreview (preview live)
     ├── PublicThemeScope (stessi CSS tokens della pagina pubblica)
     └── CollectionView (stesso componente della pagina pubblica, mode="preview")
          └── FeaturedBlock (con MOCK_FEATURED inline in StylePreview.tsx)
```

- `StylePreview` usa mock data statici (`MOCK_FEATURED`, `MOCK_SECTION_GROUPS`) definiti inline nel file.
- Toggle mobile/desktop preview via `IconDeviceMobile` / `IconDeviceDesktop`.
- `StylePreview` passa `scrollContainerEl` al `CollectionView` per il comportamento hero-to-compact nella preview.
- Il comportamento runtime e preview devono restare sincronizzati: `parseTokens()` converte i token nel `collectionStyle` usato da CollectionView.

---

## Scheduling (Programmazione)

Due tipi di regola sullo stesso modello `schedules`:

| `rule_type` | Route detail | Service | Scopo |
|-------------|-------------|---------|-------|
| `"catalog"` (default) | `/scheduling/:ruleId` → `ProgrammingRuleDetail` | `layoutScheduling.ts` | Assegna catalogo a sede in una finestra temporale |
| `"featured"` | `/scheduling/featured/:ruleId` → `FeaturedRuleDetail` | `featuredScheduling.ts` | Assegna contenuti in evidenza (hero/before/after) in una finestra |

**Tabelle coinvolte**:
- `schedules` — riga principale (tenant_id, rule_type, time_mode, priority, ecc.)
- `schedule_targets` — relazione N:N con activity/activity_group (no tenant_id, no RLS — security gap noto)
- `schedule_featured_contents` — join featured rules ↔ featured_contents (slot, sort_order)
- RPC: `get_schedule_featured_contents(schedule_id)` — `20260409120000`

---

## Database

- Schema changes: SEMPRE nuova migration (`supabase/migrations/YYYYMMDDHHMMSS_*.sql`). MAI modificare esistenti.
- **Query nei service**: nomi SENZA prefisso (`products`, mai `v2_products`). Tipi TS: prefisso `V2`.
- Nuove tabelle: `tenant_id UUID NOT NULL`, RLS abilitato, 4 policy (select/insert/update/delete).
- FK: `entita_id`. Self-ref: `parent_entita_id`. Colonne: `snake_case`. Tabelle: plurale.

**Tabelle principali** (selezionate):
- `tenants` — aziende/brand
- `activities` — sedi (slug, status, inactive_reason, cover_image, contatti, social)
- `schedules` — regole scheduling (rule_type: "catalog" | "featured")
- `schedule_targets` — target N:N (no RLS — security gap noto)
- `schedule_featured_contents` — contenuti in evidenza per slot
- `featured_contents` — contenuti highlight (titolo, media, prodotti, pricing_mode)
- `catalogs`, `catalog_categories`, `catalog_category_products` — catalogo
- `products`, `product_variants`, `product_option_groups`, `product_option_values`
- `styles`, `style_versions` — stili con versioni immutabili
- `reviews` — recensioni (rebuild `20260413085957`)
- `notifications` — notifiche estese (`20260410140000`)
- `stripe_subscriptions`, `stripe_customers` — sottoscrizione Stripe (`20260411100000`)

**Schema facts critici**:
- `v2_activity_schedules` — ELIMINATA (migration `20260302130000`). Non referenziare mai.
- `schedule_targets` — NO `tenant_id`, NO RLS (gap noto, non correggere senza richiesta)
- `product_attribute_definitions.tenant_id` — NULLABLE (attributi piattaforma usano NULL)

---

## Edge Functions

Tutte in `supabase/functions/<nome>/index.ts`. Shared code in `_shared/`. `verify_jwt: false` su tutte.

| Funzione | Abilitata | Scopo |
|----------|-----------|-------|
| `resolve-public-catalog` | ✅ | Risolve catalogo pubblico per slug (pagina pubblica) |
| `send-otp` / `status-otp` / `verify-otp` | ✅ | OTP auth flow |
| `delete-account` / `recover-account` / `purge-accounts` | ✅ | Gestione account utente |
| `delete-tenant` / `purge-tenants` / `restore-tenant` / `purge-tenant-now` | ✅ | Lifecycle tenant |
| `delete-business` | ✅ | Elimina sede |
| `send-tenant-invite` | ✅ | Invito membro team (email via Resend) |
| `generate-menu-pdf` | ✅ | PDF menu (usa Puppeteer) |
| `stripe-checkout` / `stripe-webhook` / `stripe-portal` / `stripe-update-seats` | ✅ | Sottoscrizione Stripe |
| `submit-review` | ✅ | Invio recensione dalla pagina pubblica |
| `search-google-places` | ✅ | Ricerca luoghi Google Places (form contatti sede) |
| `menu-ai-import` | ❌ DISABLED | Import AI da menu (non deployare senza abilitare) |

**scheduleResolver.ts** esiste in DUE posti: `src/services/supabase/` e `supabase/functions/_shared/`. Sincronizzarli ENTRAMBI ad ogni modifica.

---

## Integrazioni

- **Supabase client**: solo `src/services/supabase/client.ts`. Mai `service_role` nel frontend.
- **Email**: solo via Edge Functions (Resend), mai dal frontend.
- **Upload**: `src/services/supabase/upload.ts` + `src/utils/compressImage.ts`.
- **Stripe**: sottoscrizione tenant, seat management, webhook. Service: `src/services/supabase/billing.ts`.
- **Google Places**: Edge Function `search-google-places` + `GooglePlacesSearch` component in `src/pages/Operativita/Attivita/tabs/contacts/`.

---

## UI

- Componenti in `src/components/ui/` — verificare PRIMA di crearne di nuovi.
- Lingua: **italiano** ovunque. Tenant→"Azienda", Activity→"Sede", `owner_user_id`→mai in UI.
- SCSS Modules (`.module.scss`). Tema: `src/styles/_theme.scss`.
- Import alias: `@components/`, `@services/`, `@context/`, `@types/`, `@utils/`, `@pages/`, `@layouts/`, `@styles/`. Mai `../../`.
- Toast: `useToast().showToast({ message, type })`.
- **Tooltip vs InfoTooltip**: regole d'uso in `memory/feedback_tooltip_guidelines.md`.

---

## Aree in sviluppo / da completare

- **Hub tab "eventi"** — placeholder visibile, contenuto non implementato
- **Traduzioni** — `LanguageSelector` UI presente, logica traduzioni non implementata (solo IT attivo)
- **Analytics** — pagina stub (`Analytics.tsx`)
- **Reviews** — rebuilt (aprile 2026), integrazione con Google Review URL presente
- **Sottocategorie** — catalogo supporta L1/L2/L3, gestione UI da verificare
- **`menu-ai-import`** — disabilitata, richiede abilitazione esplicita
- **Seat enforcement** — logica Stripe seats introdotta (`20260413100000`, `20260413110000`)
- **`schedule_targets` RLS** — gap noto, nessuna RLS sulla tabella

---

## PROIBITO

**Sicurezza**: modificare migration esistenti | rimuovere RLS | `service_role` nel frontend | bypassare tenant validation | referenziare `v2_activity_schedules` (ELIMINATA)

**Architettura**: Supabase diretto da componenti | `tenant_id` da `auth.user.id` | nuovi provider context | modali centrate per CRUD | router fuori da App.tsx | top navbar | `any` in TypeScript

**Database**: prefisso `v2_` nelle query service | tabelle senza `tenant_id` | `CASCADE` cross-dominio senza richiesta | modificare `get_my_tenant_ids()`

**Frontend**: CSS inline | testi in inglese | esporre `owner_user_id` | librerie npm non richieste | submit button dentro `<form>` nei drawer | SystemDrawer/DrawerLayout nella pagina pubblica (usare PublicSheet)

**Pattern**: `null` da `list*` | `useEffect` senza `useCallback` | omettere toast nei catch | no reload dopo CRUD success | form con logica drawer | modificare scheduleResolver in un solo posto
