# CLAUDE.md — CataloGlobe

Regole vincolanti. In caso di dubbio: seguire il pattern esistente nel codice.

**Riferimenti**:
- Architettura completa: `docs/architecture.md`
- Regole estese: `docs/ai-operational-rules.md`
- Route: `docs/routes.md`
- Schema DB e fact critici: `docs/database-reference.md`
- Edge Functions: `docs/edge-functions.md`
- Security Advisor stato: `docs/security-advisor-status.md`
- Roadmap / aree in sviluppo: `docs/roadmap.md`

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
- **Layout**: `MainLayout` (business), `WorkspaceLayout` (workspace), `SiteLayout` (pubblico). Non crearne di nuovi. No top navbar.
- **Provider esistenti**: AuthProvider, TenantProvider, DrawerProvider, ToastProvider, ThemeProvider, TooltipProvider. Non crearne di nuovi senza necessita'.

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

## Delete drawer patterns

Le entità con delete drawer in CataloGlobe seguono UNO di 3 pattern, scelto in base alla **sostituibilità semantica** dell'entità. Non esiste un pattern univoco.

| Caratteristica entità | Esempio | FK su altre tabelle | Pattern delete |
|---|---|---|---|
| Unica, irripetibile (rifare la regola da zero ha senso) | Catalogo | NO ACTION/RESTRICT | **Blocco preventivo** |
| Editoriale, eliminabile senza perdita strutturale | Featured content, Prodotto | CASCADE | **Informativo + cleanup** |
| Sostituibile, intercambiabile (skin/preset) | Stile | NO ACTION/RESTRICT | **Swap-then-delete** |

### Pattern A: Blocco preventivo

- **Quando**: FK NO ACTION/RESTRICT verso scheduling, l'entità è semanticamente unica
- **Esempio file**: `src/pages/Dashboard/Catalogs/CatalogDeleteDrawer.tsx`
- **Contratto drawer**: carica all'apertura `listSchedulesUsing<Entità>()`, mostra banner `warning` se >0 regole attive/programmate (`info` se solo disabilitate/scadute), pillole stato derivate da `enabled + start_at + end_at` (`active|scheduled|expired|disabled`), link diretto a detail regola (`/business/:businessId/scheduling/:ruleId`), bottone "Elimina" disabled finché esiste QUALSIASI regola collegata (non solo attive — anche disabilitate o scadute bloccano)
- **Contratto service**: `deleteX(id, tenantId)` può fallire con `23503` se race condition tra fetch usage e delete; usare `isPostgrestFKError(err)` per gestire il caso e ricaricare l'usage
- **UX rationale**: l'utente DEVE risolvere le regole prima del delete. Non può "passare avanti".

### Pattern B: Informativo + cleanup automatico

- **Quando**: FK CASCADE complete, l'entità sparisce senza side-effect strutturali
- **Esempi file**: `src/pages/Dashboard/Highlights/FeaturedContentDeleteDrawer.tsx`, `src/pages/Dashboard/Products/ProductDeleteDrawer.tsx`
- **Contratto drawer**: carica all'apertura `count<Entità>DeleteImpact()`, mostra sezione condizionale "Questo X è utilizzato in: N catalogo, M contenuti..." (solo se almeno una count >0), bottone "Conferma Eliminazione" sempre attivo
- **Contratto service**: `deleteX(id, tenantId)` esegue snapshot pre-DELETE di entità polimorfiche/storage, DELETE (CASCADE pulisce le righe figlie automaticamente), poi cleanup esterni (storage best-effort, translations polimorfiche). Se la cancellazione lascia regole vuote (es. featured con 0 contenuti), `auto-disable` con `enabled=false`. Il return type varia per dominio: featured ritorna `{ schedules_disabled: number }` per toast informativo proporzionato, product ritorna `void` (no auto-disable applicato)
- **UX rationale**: l'utente è informato dell'impatto ma non è bloccato. Il sistema fa il cleanup giusto in autonomia.

### Pattern C: Swap-then-delete

- **Quando**: l'entità è semanticamente sostituibile (skin/preset), e cancellarla lasciando le regole "rotte" sarebbe peggio dell'attrito di chiedere un replacement
- **Esempio file**: `src/pages/Dashboard/Styles/StyleDeleteDrawer.tsx`
- **Contratto drawer**: carica all'apertura `listSchedulesUsing<Entità>()` (skip se `usage_count === 0`), mostra Select replacement obbligatorio se `isUsed`, lista regole impattate (informativa, non bloccante), bottone "Conferma Eliminazione" disabled finché replacement non scelto. Caso speciale: se entità è `is_system` (es. stile predefinito tenant) → blocco totale con messaggio dedicato, niente replacement
- **Contratto service**: `deleteX(id, tenantId, replacementId?)` esegue se necessario `UPDATE schedule_layout SET x_id=replacementId` prima del DELETE. CASCADE su tabelle figlie (es. `style_versions`). Race condition teorica accettata (insert tra SELECT e UPDATE/DELETE)
- **UX rationale**: l'utente non è bloccato e non perde regole. Sceglie come riassegnare in un colpo solo.

### Quando applicare quale pattern: regola pratica

1. **Esamina le FK inbound sull'entità** (via MCP `list_tables` o `information_schema`).
2. **Tutte CASCADE → Pattern B**.
3. **Almeno una NO ACTION/RESTRICT** + entità unica → **Pattern A**.
4. **Almeno una NO ACTION/RESTRICT** + entità sostituibile (puoi semanticamente swappare con un'altra istanza) → **Pattern C**.

Se hai dubbi: il default sicuro è **Pattern B** (cleanup automatico), perché informa senza bloccare. Solo se l'entità è SEMPRE strettamente unica e l'utente vorrebbe ripensare la regola, vale Pattern A.

### Anti-pattern noti

- **NON** usare Pattern A per entità sostituibili — è UX inferiore (es. usare blocco per Style sarebbe attrito artificiale).
- **NON** usare Pattern B se le FK sono NO ACTION (causerà `23503` silente in produzione, drawer informativo che mostra count ma non blocca → DELETE fallisce con errore generico).
- **NON** usare Pattern C per entità non sostituibili — è semanticamente sbagliato chiedere "scegli un altro Catalogo per le regole" perché ogni Catalogo è un set unico.

---

## Page Pattern

```tsx
const [items, setItems] = useState<T[]>([]);
const [isLoading, setIsLoading] = useState(true);
const loadData = useCallback(async () => {
  try {
    setIsLoading(true);
    setItems(await listEntities(tenantId));
  } catch {
    showToast({ message: "Errore nel caricamento", type: "error" });
  } finally {
    setIsLoading(false);
  }
}, [tenantId, showToast]);
useEffect(() => {
  loadData();
}, [loadData]);

// Drawer state: isDrawerOpen, mode ("create"|"edit"), selected
// handleSuccess: await loadData() → close → toast
```

JSX: `PageHeader` → `FilterBar` → `DataTable` → `CreateEditDrawer` → `DeleteDrawer`.

---

## Pagina dettaglio sede

**Percorso**: `/business/:businessId/locations/:activityId` → `ActivityDetailPage`.

Struttura a **3 tab** via `?tab=` query param:

- `profile` (default) — `ActivityProfileTab`
- `availability` — `ActivityAvailabilityTab`
- `settings` — `ActivitySettingsTab`

**Legacy redirects** (`LEGACY_TAB_MAP` in `ActivityDetailPage.tsx`):
`info → profile`, `media → profile`, `hours-services → settings`, `access-control → settings`. Vecchi link esterni continuano a funzionare.

**Header pagina**: titolo + `StatusBadge` inline ("Pubblicata"/"Sospesa") — visibile su tutte le tab.

**Tab Impostazioni** — card chiave:
- **Accesso pubblico**: URL pubblico, QR code (modale customizzazione via bottone "Personalizza" + click su thumbnail), Catalogo PDF (drawer export).
- **Configurazione sede**: accordion single-open con 3 sezioni — Pagamenti / Servizi / Tariffe. Pattern draft + `UnsavedChangesBar` (vedi sotto). Sezioni interne (`PaymentMethodsSection`, `ServicesSection`, `FeesSection`) sono **controlled**.
- **Stato pubblicazione**: bottoni dinamici — "Sospendi pubblicazione" se active, "Modifica motivo" + "Riprendi pubblicazione" se inactive. La modale `SuspendActivityDialog` supporta `mode: "suspend" | "edit-reason"` con `initialReason` per pre-fill.

---

## Pattern: draft inline con `UnsavedChangesBar`

Pattern per editing rapido senza salvataggio per cambio (sostituisce debounce manuale `useRef<setTimeout>` che era usato in passato — **tech debt chiuso**, NON reintrodurre). Esempi in produzione: `SchedaTab` (6 sezioni prodotto), `ActivitySettingsTab` (Pagamenti/Servizi/Tariffe).

- State diviso `draft` + `saved` nel parent. `isDirty` deriva dal diff (helper di confronto adatto al tipo: `arraysSameMembers` per `string[]`, `feesStateEqual` per `FeesState`).
- Componenti figli **controlled**: props `value: T` + `onChange: (next: T) => void` + `disabled?`. NO state interno, NO debounce.
- Re-sync con `activity` prop esterno via `useEffect` su `activity.<field>` + `lastSaved*Ref` per detect external change: se il draft equivale all'ultimo saved (= utente non dirty) follow nuovo saved, altrimenti preserva draft. Evita reset del draft quando un altro Save (es. toggle visibilità) triggera `onReload`.
- `<UnsavedChangesBar isSaving onCancel onSave>` appare in fondo SOLO quando `isDirty === true`. Annulla = `setDraft(saved)`. Salva = service call → `onReload()` (`saved` allinea via prop refresh).
- Toggle binari (`*_public`) restano save-immediato (non draft): una decisione binaria sola non beneficia di "raccolta modifiche". Solo le selezioni multi-pill / multi-field usano draft.

---

## Pattern: accordion single-open

Pattern in `ConfigAccordionSection` (`src/pages/Operativita/Attivita/tabs/components/`). Riusabile altrove se serve list di sezioni dirty-tracked.

- Stato `openAccordion: K | null` nel parent (controlled).
- Ogni `ConfigAccordionSection` riceve `isOpen` + `onToggle` (no state interno).
- Click su un altro accordion chiude quello corrente; click sullo stesso lo chiude.
- Dirty dot nell'header chiuso quando `draft?.isDirty === true` (la `UnsavedChangesBar` vive nel body, quindi quando chiuso il dot indica le modifiche parcheggiate).
- Preview badges (anteprima `string[]` dei valori SALVATI, non draft) visibili sull'header chiuso fino a 4 + "+N".

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

**Componenti chiave** (in `src/components/PublicCollectionView/`):

- `CollectionView` — contenitore principale. Il grid card usa `@container collection (...)`, MAI `@media` su viewport. `.container` ha `container-type: inline-size; container-name: collection`. Modifiche al responsive card → SEMPRE `@container collection`.
- `PublicCollectionHeader` — header hero-to-compact via scroll listener (NON IntersectionObserver). Props chiave: `scrollContainerEl`, `viewportWidthEl`, `headerRadius` (numerico in px). `readScroll` legge `body.style.top` come fonte autoritativa quando `body.style.position === "fixed"` (modale aperta) — senza questo, su iOS Safari `window.scrollY` vale 0 durante lock e header torna a hero.
- `PublicFooter` — orari, tariffe (via `PublicFees`), social.
- `PublicFees` / `PublicFeeRows` — tariffe nel footer (solo `fees`, non `payment_methods`/`services`). `PublicFeeRows` riusato in InfoSheet.
- **InfoSheet** (modale "Informazioni" inline in `CollectionView`) — orari, tariffe, metodi pagamento, servizi, contatti, indirizzo. `payment_methods` e `services` renderizzati QUI come chip, NON nel footer.
- `SearchOverlay`, `SelectionSheet`, `ItemDetail`, `ReviewsView`, `FeaturedBlock` (slot wrapper per `before_catalog`/`after_catalog`), `FeaturedCard` (card component con variant `card`/`highlight`), `FeaturedPreviewModal`, `PublicCatalogTree`, `CollectionSectionNav`, `LanguageSelector`, `PublicSheet`.

**Card prodotto** — 4 combinazioni:

| Combinazione    | Wrapper                 | Immagine    | Bottone |
| --------------- | ----------------------- | ----------- | ------- |
| Card · List     | bianco + ombra + radius | sinistra    | filled  |
| Card · Grid     | bianco + ombra + radius | sopra (4:3) | filled  |
| Compatto · List | nessuno (trasparente)   | nessuna     | outline |
| Compatto · Grid | nessuno (trasparente)   | nessuna     | outline |

- **Card** usa `--pub-surface-text`. **Compatto** usa `--pub-bg-text`.
- `ProductRow`/`ProductCompactRow` ricevono `cardLayout: "list" | "grid"`.
- Container padre ha `data-card-layout` + `data-product-style`; selettori CSS condizionali usano questi attributi.
- In Compatto·Grid `border-bottom` agisce come separatore: `row-gap: 0` + `:nth-last-child(-n+N)` rimuove border dall'ultima riga visiva (N = colonne correnti). NON usare `:last-child` per separatori in CSS Grid multi-colonna.

**Hub tabs** (`HubTab = "menu" | "events" | "reviews"`):
- `menu` — catalogo prodotti + featured blocks
- `events` — eventi/promo (da sviluppare)
- `reviews` — recensioni via `submit-review` edge function

**Slot FeaturedBlock** (solo 2, hero rimosso, migration `20260414190000`):
- `before_catalog` — tra header e catalogo, a livello `.frame` (fuori da `.container`)
- `after_catalog` — sotto catalogo, prop `featuredAfterCatalogSlot` su `CollectionView`, a livello `.frame`

**Stati pagina**: `loading | error | inactive | subscription_inactive | empty | ready`

---

## PublicSheet

Pattern per modali/sheet nella pagina pubblica. **Non usare** SystemDrawer/DrawerLayout nella pagina pubblica.

```
PublicSheet → bottom sheet su mobile (swipe-to-close) | dialog centrato su desktop
```

- Usa `position:fixed` sul body per lock scroll iOS Safari (ripristina esatta posizione al chiudi): salva `window.scrollY` e scrive `body.style.top = -${scrollY}px`. **Effetto collaterale**: su iOS Safari `window.scrollY` torna a 0 durante il lock. Qualsiasi scroll listener su `window` deve leggere il vero scrollY da `-parseInt(body.style.top)` quando `body.style.position === "fixed"`.
- Drag handle su mobile, Escape per chiudere.
- Import: `@components/PublicCollectionView/PublicSheet/PublicSheet`

---

## Style Editor / Preview

**Percorso**: `/business/:businessId/styles/:styleId` → `StyleEditorPage`.

```
StyleEditorPage
├── StylePropertiesPanel (editing) / StylePropertiesReadOnly (versioni pubblicate)
├── StyleVersionsPopover
└── StylePreview
     ├── PublicThemeScope
     └── CollectionView (mode="preview", MOCK_FEATURED + MOCK_SECTION_GROUPS inline)
```

- `StylePreview` passa al `CollectionView` sia `scrollContainerEl` sia `viewportWidthEl` (entrambi `screenEl` del device frame). Senza `viewportWidthEl`, `window.innerWidth` del browser editor farebbe collassare l'header in preview mobile.
- `headerRadius` passato come valore numerico dal campo `appearanceRadius` del `CollectionStyle` — NON letto via `getComputedStyle`. Helper `borderRadiusToPx("none"|"soft"|"rounded") -> 0|10|20` in `src/features/public/utils/mapStyleTokensToCssVars.ts`.
- `navigationStyle` valori correnti: `"filled" | "outline" | "tabs" | "dot" | "minimal"`. I valori deprecati `"pill"` e `"chip"` sono rimappati a `"filled"` in `parseTokens` — la label UI nel PropertiesPanel resta "Pill" per familiarità.
- Responsive grid card è basato su container queries: misura larghezza di `.container` (device frame in preview, body in runtime). Coerente preview/runtime by design.
- Runtime e preview devono restare sincronizzati: `parseTokens()` converte i token nel `collectionStyle` usato da CollectionView.

---

## Scheduling (Programmazione)

Due tipi di regola sullo stesso modello `schedules`:

| `rule_type`           | Route detail                                          | Service                 | Scopo                                                     |
| --------------------- | ----------------------------------------------------- | ----------------------- | --------------------------------------------------------- |
| `"catalog"` (default) | `/scheduling/:ruleId` → `ProgrammingRuleDetail`       | `layoutScheduling.ts`   | Assegna catalogo a sede in finestra temporale             |
| `"featured"`          | `/scheduling/featured/:ruleId` → `FeaturedRuleDetail` | `featuredScheduling.ts` | Assegna contenuti in evidenza (before/after) in finestra  |

**Risoluzione regole**: tutti e 4 i tipi (layout, featured, price, visibility) usano **competizione** (1 sola regola vince per sede per tipo). Ordine: specificità target (DESC) → specificità temporale (DESC) → priority (ASC) → created_at (ASC) → id (ASC).

**Sistema bozze**:
- Regole create con `enabled: false`. Salvate come bozza se campi obbligatori mancanti (target, catalogo/stile, prodotti, contenuti).
- `isDraft(rule)`: `!applyToAll && 0 activityIds && 0 groupIds` OPPURE campi tipo-specifici vuoti.
- Lista: 5 gruppi — In esecuzione, Programmate, **Bozze** (ambra), Disabilitate, Scadute. Badge "Bozza" sulla riga.
- Toggle: bloccato per bozze e regole scadute (toast error). Toggle OFF sempre permesso.
- Auto-attivazione: al salvataggio, se la regola era bozza e ora è completa → `enabled = true` automatico + toast.
- Validazione: nome vuoto/date invalide/orari invalidi → bloccanti. Campi incompleti → bozza (enabled=false + toast warning).

**Periodo + giorni**: combinabili nel form. Resolver supporta `start_at`/`end_at` + `days_of_week` combinati.

**Featured slot**: solo `before_catalog` e `after_catalog` (hero rimosso, migration `20260414190000`). Form featured: due SlotGroup separati con DnD indipendente, `sortOrder` per-gruppo.

**Simulatore regole**: drawer con 4 blocchi (Catalogo, In evidenza, Prezzi, Visibilità — 2x2). Usa `resolveRulesForActivity()` con data/ora simulata.

**"Escluse N sedi"**: regole con target "Tutte" mostrano tooltip con sedi sovrascritte da regole più specifiche. Funziona per tutti e 4 i tipi.

**Tabelle**: `schedules`, `schedule_targets` (no tenant_id, RLS via subselect — security gap noto), `schedule_featured_contents`. RPC `get_schedule_featured_contents(schedule_id)` (`20260409120000`).

---

## Database

- Schema changes: SEMPRE nuova migration (`supabase/migrations/YYYYMMDDHHMMSS_*.sql`). MAI modificare esistenti.
- **Query nei service**: nomi SENZA prefisso (`products`, mai `v2_products`). Tipi TS: prefisso `V2`.
- Nuove tabelle: `tenant_id UUID NOT NULL`, RLS abilitato, 4 policy (select/insert/update/delete).
- FK: `entita_id`. Self-ref: `parent_entita_id`. Colonne: `snake_case`. Tabelle: plurale.
- Schema attuale + fact critici (slug uniqueness, tabelle Stripe-on-tenants, schedule_targets RLS, ecc.) → `docs/database-reference.md`.
- Dati legali aziendali: `src/config/company.ts` ↔ `supabase/functions/_shared/company-config.ts` sono **duplicazione sincronizzata** (header `// ⚠️ SYNC`). Modifica sempre entrambi nello stesso commit. Stesso pattern di `scheduleResolver.ts`.

---

## Pattern obbligatori

### Storage policy `storage.objects`

- Naming: `<bucket-id> <operation>` (es. `avatars insert`, `product-images update`). Lowercase, hyphen-space.
- Roles: `TO authenticated` (no public listing). File pubblici via `getPublicUrl()` che bypassa RLS senza policy SELECT public.
- UPDATE policy: SEMPRE `USING (...) WITH CHECK (...)` con espressione identica. Senza WITH CHECK, l'SDK upsert fallisce silenziosamente.
- Sempre `DROP POLICY IF EXISTS` (idempotenza cross-env).

### Storage upsert (3 policy DB richieste)

`supabase.storage.upload(path, file, { upsert: true })` invoca internamente `INSERT ON CONFLICT DO UPDATE` su `storage.objects`. Per funzionare richiede:

1. INSERT policy con `WITH CHECK (...)`
2. UPDATE policy con `USING (...) WITH CHECK (...)` (entrambi populate)
3. SELECT policy `TO authenticated` (per leggere riga esistente nel ramo ON CONFLICT)

Senza una di queste 3, upsert fallisce con HTTP 400 + messaggio fuorviante `"new row violates row-level security policy"`. Il messaggio non distingue quale manca: indagare sempre TUTTE le policy del bucket.

### Funzioni SQL

- `SECURITY DEFINER` solo se necessario (lookup `auth.users`, `vault`, RLS bypass legittimo). Default: `SECURITY INVOKER`.
- `SET search_path TO ''` obbligatorio + qualifiche `public.<table>` esplicite nel body.
- `REVOKE EXECUTE ... FROM PUBLIC` dopo `CREATE FUNCTION` (Postgres concede grant PUBLIC di default).
- `GRANT EXECUTE` solo a ruoli specifici (`anon`/`authenticated`/`service_role`) in base al caso d'uso.

### Stripe lifecycle

Usare sempre `_shared/stripe-helpers.ts` per chiamate Stripe nelle Edge Functions.

Pattern: `scheduleStripeCancel()` al soft-delete (account/tenant) → `reactivateStripeSubIfScheduled()` al recovery → `cancelStripeSubImmediate()` + `deleteStripeCustomer()` al hard-delete (cron purge). Tutti idempotenti e non-throwing.

NON chiamare `stripe.subscriptions.cancel()` direttamente in soft-delete (perde all'utente i giorni pagati e disincentiva il recovery). Usato da: delete-tenant, delete-account, restore-tenant, recover-account, `_shared/tenant-purge.ts`.

---

## Edge Functions

Tutte in `supabase/functions/<nome>/index.ts`. Shared code in `_shared/`. `verify_jwt: false` su tutte.

**`scheduleResolver.ts` esiste in DUE posti**: `src/services/supabase/` e `supabase/functions/_shared/`. Sincronizzarli ENTRAMBI ad ogni modifica.

Catalogo completo + note operative (`purge-tenant-now` vs `purge-tenants`, trigger `prevent_deleted_at_client_update`) → `docs/edge-functions.md`.

- **`purgeTenantData` ordine DELETE (critico per FK)**: `schedule_targets` + `schedule_layout` devono essere eliminate PRIMA di `catalogs` e `styles` (FK RESTRICT su `schedule_layout.catalog_id` e `schedule_layout.style_id`). Ordine corretto in `_shared/tenant-purge.ts`: junctions/product-children → `schedule_targets` (filtrato by `schedule_id`) → `schedule_layout` → `catalog_categories` → `catalogs` → `product_*` → `featured_contents` → `styles` (con `current_version_id=NULL` prima di `style_versions`) → `schedules` → `activities` → `products` → `tenant_memberships` → `tenants`. Bug fixato 11/05/2026 dopo test runtime: ordine sbagliato bloccava il purge con `23503` su tenant con regole Programmazione layout (= praticamente tutti i tenant attivi).

- **`purgeActivityFolder` deve essere ricorsivo e non-throwing**: il bucket `business-covers` ha sotto-path tipo `{tenantId}/{slug}__{activityId}/gallery/` (gallery delle sedi). La cancellazione storage deve scendere ricorsivamente nei subfolder, e gli errori `storage.remove()` devono essere `console.warn` (non `throw`) per evitare di bloccare il cleanup degli altri bucket. Pattern allineato a `purgeTenantFolder` (gli altri 4 bucket tenant-scoped: `product-images`, `featured-contents`, `tenant-assets`, `style-backgrounds`). Bug fixato 11/05/2026: senza ricorsione, gallery images sopravvivevano al purge → file orfani indefinitamente in storage → violazione GDPR.

---

## Integrazioni

- **Supabase client**: solo `src/services/supabase/client.ts`. Mai `service_role` nel frontend.
- **Email**: solo via Edge Functions (Resend), mai dal frontend.
- **Upload**: `src/services/supabase/upload.ts` + `src/utils/compressImage.ts`. Per `upsert: true`, vedi Pattern obbligatori → Storage upsert.
- **Stripe**: sottoscrizione tenant, seat management, webhook. Service: `src/services/supabase/billing.ts`. Lifecycle, vedi Pattern obbligatori → Stripe lifecycle.
- **Google Places**: Edge Function `search-google-places` + `GooglePlacesSearch` component in `src/pages/Operativita/Attivita/tabs/contacts/`.

---

## UI

- Componenti in `src/components/ui/` — verificare PRIMA di crearne di nuovi.
- Lingua: **italiano** ovunque. Tenant→"Azienda", Activity→"Sede", `owner_user_id`→mai in UI.
- **Stato attività**: UI usa sempre "**Pubblicata**" / "**Sospesa**" (mai "Attiva"/"Inattiva"). DB values restano `status: "active" | "inactive"` (intoccabili senza migration). Motivi sospensione mappati centralmente in `src/utils/activityStatus.ts` (`formatInactiveReason` + `INACTIVE_REASON_LABEL`), riusato da `SuspendActivityDialog`, riga "Stato pubblicazione", overlay copertina `BusinessCard`.
- SCSS Modules (`.module.scss`). Tema: `src/styles/_theme.scss`.
- Import alias: `@components/`, `@services/`, `@context/`, `@types/`, `@utils/`, `@pages/`, `@layouts/`, `@styles/`. Mai `../../`.
- Toast: `useToast().showToast({ message, type })`.
- **Tooltip vs InfoTooltip**: regole d'uso in `memory/feedback_tooltip_guidelines.md`.
- **`AddressAutocomplete`** (`src/components/ui/AddressAutocomplete/`) — autocompletamento indirizzo via Google Places (due step: searchText → place_id → addressComponents). Props: `onSelect(result: AddressResult)`. Usato in `BusinessCreateCard` e `ActivityIdentityForm`. Dopo selezione mostra pill di conferma con X per reset.
- **`FeesSection`** (`src/pages/Operativita/Attivita/tabs/hours-services/FeesSection.tsx`) — sezione tariffe nella card "Configurazione sede" (tab Impostazioni). Usa `FEE_DEFINITIONS` da `src/constants/activityFees.ts` (enum fisso 5 voci). Componente **controlled** (props `value: FeesState` + `onChange`). Input numerico (`type="text"` + `inputMode="decimal"` + regex `^[0-9]*[.,]?[0-9]*$`) + badge unità non editabile. Save esplicito via `UnsavedChangesBar` del parent (vedi pattern draft inline più sotto). Helper esportati: `feesToState`, `buildFeesPayload`, `feesStateEqual`. `buildFeesPayload` filtra voci con value vuoto o `"0"`.
- **`StatusBadge`** (`src/components/ui/StatusBadge/StatusBadge.tsx`) — badge pill con dot + label, varianti `success` / `neutral`. Usato per stato attività nell'header pagina dettaglio sede ("Pubblicata" / "Sospesa") e nelle card lista sedi (`BusinessCard` + `BusinessList` — mostrato solo quando inactive per ridurre rumore).
- **`UnsavedChangesBar`** (`src/components/ui/UnsavedChangesBar/UnsavedChangesBar.tsx`) — barra "Modifiche non salvate" con dot arancione + label + Annulla/Salva. Riusata in `SchedaTab` (pagina dettaglio prodotto, 6 sezioni dirty-tracked) e in `ConfigAccordionSection`. Pattern draft inline (vedi sotto).
- **`EmptyState`** (`src/components/ui/EmptyState/EmptyState.tsx`) — empty state riusabile: icona Lucide + titolo + descrizione + action opzionale. Prop `compact?: boolean` riduce padding da 64px→40px e shrinka font: usato dentro card (tab Impostazioni: Orari/Chiusure vuote). Default = full-page empty state (DataTable, BusinessList).
- **`TranslationsTab`** (`src/components/ui/TranslationsTab/`) — componente generic **single-field** per editing manuale delle traduzioni (manual override + revert + badge stato auto/manual/missing + pending state post-revert). Props: `entityType: TranslationEntityType`, `entityId: string`, `tenantId: string`, `sourceText: string`, `fieldKey: TranslationField`, `sectionLabel: string`, `sectionDescription: string`, `placeholderItalian?: string`. Per entità con **più campi traducibili**: montare più istanze (es. `ProductPage` istanzia 1 istanza per `description`; la card statica "Note prodotto" che precede l'abilitazione editing su `notes` vive inline nella pagina, non dentro il componente). Backend RPC `upsert_manual_translation` / `revert_manual_translation` sono entity-type-agnostic — riusabili senza modifiche per qualsiasi `(entityType, fieldKey)` valido. Esempi montaggio: `ProductPage` (entityType="product", fieldKey="description"), `CatalogEngine` right pane categoria (entityType="category", fieldKey="name").

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

### Code review — mappa per scenario

- **Feature multi-file, refactor architetturale, area security-sensitive (RLS, edge functions, billing)** → workflow `superpowers` completo. Review integrata via `superpowers:requesting-code-review`. Non invocare `code-review` slash separatamente.
- **Task tattico singolo** (fix UI, piccolo bug, restyling) → niente `superpowers`. Se review necessaria a fine task, `code-review` slash standalone.
- **Quick scan PR pre-merge** → `caveman-review` per output one-liner per linea.

### Planning

- Default: `TodoWrite` inline.
- `superpowers:writing-plans` SOLO dentro un workflow `superpowers` già attivo.
- MAI invocare `feature-dev` agent: disabilitato.

### Workflow superpowers — quando attivarlo

Utile per task multi-step complessi, dannoso per task tattici (overhead di planning).

**Skip brainstorm/write-plan se il prompt utente è già strutturato.** Un prompt è strutturato se contiene almeno DUE marker:
- File espliciti da leggere con path completi
- Vincolo "NON leggere altro" o equivalente
- Obiettivo single-concern dichiarato esplicitamente
- Vincoli "non toccare X" già espressi

In quel caso, esecuzione diretta. Skill TDD e review-tra-task di `superpowers` rimangono attive.

### Commit

- Standard: `commit-commands` (`/commit`, `/commit-push-pr`).
- Format: Conventional Commits.
- `/clean_gone` — VIETATO senza conferma esplicita umana per ogni branch eliminato.

### Compressione output (caveman)

`caveman` full mode è attivo per default ad ogni session start (via SessionStart hook).

- Disattivare in sessione: "stop caveman" o `/caveman lite`.
- Riattivare: `/caveman full`.
- Per output user-facing destinati a documentazione (commit message lunghi, descrizioni PR, summary), DEVE scendere a prosa normale.

### MCP — Supabase

L'MCP `supabase-staging` espone `apply_migration` e `execute_sql`. Bypassano il filesystem migrations.

**Regola** per ogni schema change DDL (CREATE/ALTER/DROP su tabelle, colonne, policy, function):
1. Creare il file `supabase/migrations/YYYYMMDDHHMMSS_descrittivo.sql`
2. Conferma esplicita dell'utente prima di applicarlo via MCP
3. Solo dopo conferma, invocare `apply_migration` con il contenuto del file

Operazioni MCP in **lettura** (`list_tables`, `list_migrations`, `get_advisors`, `get_logs`, `generate_typescript_types`) non richiedono conferma.

### MCP — context7

Per query su librerie/SDK del progetto (React 19, Vite 7, Framer Motion v12, Supabase JS v2, Stripe SDK, recharts, @dnd-kit), preferire `context7` alla knowledge memorizzata. Le versioni cambiano e i breaking change non sono nella knowledge base.

### MCP — playwright

Match con regola "test UI in browser prima di dichiarare done". Obbligatorio per modifiche a:
- `src/components/PublicCollectionView/`
- `src/pages/Stili/StyleEditor/` (preview/runtime devono restare sincronizzati)
- Resolver `scheduleResolver.ts` / `schedulingNow.ts`

### Slash commands matched-with-rules

- `/security-review` — invocare prima del merge per modifiche RLS, edge functions, auth, billing.
- `/revise-claude-md` — invocare a fine sessione SOLO se l'utente lo richiede esplicitamente.

### File curati manualmente — protezione

NON modificare automaticamente:
- `CLAUDE.md` (root + `docs/`)
- `MEMORY.md` se presente
- File in `memory/`

`caveman:compress` su questi file è VIETATO senza conferma esplicita umana che includa: (a) l'utente ha letto cosa fa il compress, (b) l'utente conferma il backup `.original.md`, (c) l'utente conferma la sovrascrittura.

---

## PROIBITO

**Sicurezza**: modificare migration esistenti | rimuovere RLS | `service_role` nel frontend | bypassare tenant validation | referenziare `v2_activity_schedules` (ELIMINATA)

**Architettura**: Supabase diretto da componenti | `tenant_id` da `auth.user.id` | nuovi provider context | modali centrate per CRUD | router fuori da App.tsx | top navbar | `any` in TypeScript

**Database**: prefisso `v2_` nelle query service | tabelle senza `tenant_id` | `CASCADE` cross-dominio senza richiesta | modificare `get_my_tenant_ids()` | `DROP POLICY` senza `IF EXISTS` (rompe idempotenza cross-env, fallisce silenziosamente in caso di drift naming)

**Frontend**: CSS inline | testi in inglese | esporre `owner_user_id` | librerie npm non richieste | submit button dentro `<form>` nei drawer | SystemDrawer/DrawerLayout nella pagina pubblica (usare PublicSheet) | usare "Attiva"/"Inattiva" come label UI per stato sede (usa sempre "Pubblicata"/"Sospesa" via `StatusBadge`) | rimuovere `position: relative` su `.wrapper` o `top: 0; left: 0` su `.input` in `Switch.module.scss` (input absolute senza coordinate sforava `<html>.scrollHeight` di 241px — bug fixato bceb822) | bypassare `formatInactiveReason` definendo label inline per motivi di sospensione | reintrodurre debounce manuale (`useRef<setTimeout>`) per save di multi-select rapidi (usare draft + `UnsavedChangesBar`)

**Scheduling**: salvare `end_at` come mezzanotte UTC (usare `T23:59:59` locale) | disabilitare i giorni della settimana quando un periodo è attivo (sono combinabili) | slot `hero` nei featured (rimosso, solo `before_catalog`/`after_catalog`)

**Pattern**: `null` da `list*` | `useEffect` senza `useCallback` | omettere toast nei catch | no reload dopo CRUD success | form con logica drawer | modificare scheduleResolver in un solo posto

**Plugin & MCP**: invocare plugin disabilitati (vercel, playground, ralph-loop, feature-dev, caveman-commit, typescript-lsp) | applicare DDL via Supabase MCP senza file migration creato prima | `/clean_gone` senza conferma esplicita per ogni branch | `caveman:compress` su CLAUDE.md/MEMORY.md senza conferma esplicita | invocare `superpowers` brainstorm/write-plan quando il prompt utente è già strutturato | usare knowledge memorizzata su versioni libreria invece di `context7` per librerie nello stack
