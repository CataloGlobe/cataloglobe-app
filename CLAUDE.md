# CLAUDE.md — CataloGlobe

Regole vincolanti. In caso di dubbio: seguire il pattern esistente nel codice.
Documentazione completa: `docs/architecture.md` | Regole estese: `docs/ai-operational-rules.md`

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

## Database

- Schema changes: SEMPRE nuova migration (`supabase/migrations/YYYYMMDDHHMMSS_*.sql`). MAI modificare esistenti.
- **Query nei service**: nomi SENZA prefisso (`products`, mai `v2_products`). Tipi TS: prefisso `V2`.
- Nuove tabelle: `tenant_id UUID NOT NULL`, RLS abilitato, 4 policy (select/insert/update/delete).
- FK: `entita_id`. Self-ref: `parent_entita_id`. Colonne: `snake_case`. Tabelle: plurale.

---

## Integrazioni

- **Supabase client**: solo `src/services/supabase/client.ts`. Mai `service_role` nel frontend.
- **Edge Functions**: `supabase/functions/<nome>/index.ts`. Codice condiviso in `_shared/`.
- **Email**: solo via Edge Functions (Resend), mai dal frontend.
- **Upload**: `src/services/supabase/upload.ts` + `src/utils/compressImage.ts`.
- **scheduleResolver.ts**: esiste in DUE posti (`src/services/supabase/` e `supabase/functions/_shared/`). Sincronizzare ENTRAMBI.

---

## UI

- Componenti in `src/components/ui/` — verificare PRIMA di crearne di nuovi.
- Lingua: **italiano** ovunque. Tenant→"Azienda", Activity→"Sede", `owner_user_id`→mai in UI.
- SCSS Modules (`.module.scss`). Tema: `src/styles/_theme.scss`.
- Import alias: `@components/`, `@services/`, `@context/`, `@types/`, `@utils/`, `@pages/`, `@layouts/`, `@styles/`. Mai `../../`.
- Toast: `useToast().showToast({ message, type })`.

---

## PROIBITO

**Sicurezza**: modificare migration esistenti | rimuovere RLS | `service_role` nel frontend | bypassare tenant validation | referenziare `v2_activity_schedules` (ELIMINATA)

**Architettura**: Supabase diretto da componenti | `tenant_id` da `auth.user.id` | nuovi provider context | modali centrate per CRUD | router fuori da App.tsx | top navbar | `any` in TypeScript

**Database**: prefisso `v2_` nelle query service | tabelle senza `tenant_id` | `CASCADE` cross-dominio senza richiesta | modificare `get_my_tenant_ids()`

**Frontend**: CSS inline | testi in inglese | esporre `owner_user_id` | librerie npm non richieste | submit button dentro `<form>` nei drawer

**Pattern**: `null` da `list*` | `useEffect` senza `useCallback` | omettere toast nei catch | no reload dopo CRUD success | form con logica drawer | modificare scheduleResolver in un solo posto
