# CLAUDE.md

Operational instructions for Claude Code on this repository.

Claude must always **prioritize existing patterns** over inventing new solutions.

---

# Project Overview

Cataloglobe is a **multi-tenant SaaS platform** for managing digital catalogs (restaurant menus and other verticals: hospitality, retail, etc.).

Core concepts:

- **Tenants** (`v2_tenants`) → companies or brands. Shown in UI as "Azienda" / "Brand".
- **Activities** (`v2_activities`) → physical locations/branches. Shown as "Sede" / "Attività".
- **Catalog entities** (products, catalogs, styles, featured contents) → tenant-scoped.
- **Schedules** → rule-based system controlling visibility and overrides.

---

# Tech Stack

Frontend: React 19, TypeScript, Vite, React Router v7, Framer Motion, SCSS Modules

Backend: Supabase, PostgreSQL, RLS, Edge Functions

---

# Development Rules

1. Never break existing architecture.
2. Always follow existing patterns before introducing new ones.
3. Prefer modifying existing components over creating duplicates.
4. Keep changes minimal and focused.
5. Do not refactor large areas unless explicitly requested.
6. TypeScript must remain strict — no `any` types.
7. Maintain compatibility with existing database schema.

Before implementing anything: search the repository for similar implementations.

---

# Directory Structure

```
src/
├─ App.tsx                    # All route definitions
├─ main.tsx                   # Provider nesting / app entry
├─ components/
│  ├─ ui/                     # Reusable UI primitives
│  ├─ layout/
│  │  ├─ Sidebar/             # Left navigation
│  │  └─ SystemDrawer/        # DrawerLayout, low-level drawer primitive
│  └─ Routes/                 # Route guard components
├─ context/
│  ├─ AuthProvider.tsx        # Supabase auth + OTP state
│  ├─ TenantProvider.tsx      # Tenant selection + list
│  └─ Drawer/                 # Global drawer context
├─ layouts/
│  ├─ MainLayout/             # Business area (sidebar + DrawerProvider + Outlet)
│  ├─ WorkspaceLayout/        # Workspace area
│  └─ SiteLayout/             # Minimal layout
├─ pages/                     # Page-level orchestration only
├─ services/supabase/v2/      # All database interaction
├─ types/v2/                  # TypeScript types
├─ styles/                    # Global + component SCSS modules
└─ utils/                     # Pure utility functions
```

Import aliases: `@/` → `src/`, `@components`, `@pages`, `@context`, `@services`, `@layouts`, `@styles`, `@utils`, `@types`.

---

# Routing Architecture

Routes are defined in `src/App.tsx`. Key segments:

| Pattern | Layout | Guard |
|---|---|---|
| `/login`, `/sign-up`, `/check-email` | none | `GuestRoute` |
| `/verify-otp` | none | `OtpRoute` (auth but not yet OTP-verified) |
| `/reset-password` | none | `RecoveryRoute` |
| `/workspace/*` | `WorkspaceLayout` | `ProtectedRoute` + `TenantProvider` |
| `/business/:businessId/*` | `MainLayout` | `ProtectedRoute` + `TenantProvider` |

Business-area routes under `/business/:businessId/`:
- `overview`, `locations`, `locations/:activityId`
- `scheduling`, `scheduling/:ruleId`
- `catalogs`, `catalogs/:id`
- `products`, `products/:productId`
- `featured`, `featured/:featuredId`
- `styles`, `styles/:styleId`
- `attributes`, `reviews`, `analytics`, `team`, `settings`

**Key rule**: `businessId` in the URL is the source of truth for tenant selection. `TenantProvider` automatically redirects to `/workspace` if the user does not own that tenant.

**Route guards** (`src/components/Routes/`):
- `ProtectedRoute` — requires `user` + `otpVerified`; shows loader during auth checks.
- `GuestRoute` — blocks authenticated users (except during password recovery).
- `OtpRoute` — requires `user` but OTP not yet verified.
- `RecoveryRoute` — permits the reset-password flow after `PASSWORD_RECOVERY` event.

---

# Authentication Flow

**`AuthProvider`** (`src/context/AuthProvider.tsx`) manages:
- Supabase session initialization (`getSession` + `getUser`)
- Session state via `onAuthStateChange`
- OTP verification state (checked against `otp_session_verifications` table)

```tsx
const { user, loading, otpVerified, otpLoading, signOut } = useAuth();
```

**OTP verification**: after Supabase auth succeeds, the app checks:
```sql
SELECT session_id FROM otp_session_verifications
WHERE session_id = ? AND user_id = ?
```
Session ID is extracted from the JWT payload (`payload.session_id`).

**Password recovery flow**: sets `sessionStorage.passwordRecoveryFlow = "true"` → `RecoveryRoute` unlocks `/reset-password` → cleared on success.

**Protection flow**:
```
AuthProvider initializes
  → loading? → show AppLoader
  → !user? → redirect /login
  → otpLoading? → show AppLoader
  → !otpVerified? → redirect /verify-otp
  → TenantProvider fetches tenants
  → MainLayout renders
```

---

# TenantContext

**Never derive `tenant_id` from `auth.user.id`.** Always use `TenantContext`.

```tsx
// Correct
const { selectedTenantId, selectedTenant, tenants, userRole } = useTenant();

// Shortcut
const tenantId = useTenantId(); // src/context/useTenantId.ts
```

`TenantProvider` (`src/context/TenantProvider.tsx`):
- Fetches tenant list from `v2_user_tenants_view` on user change.
- Derives `selectedTenant` synchronously from the `businessId` URL param.
- Persists selection to `localStorage` key `cg_v2_selected_tenant_id`.
- Redirects to `/workspace` if the tenant is not found in the user's list.

`V2Tenant` type (`src/types/v2/tenant.ts`):
```ts
interface V2Tenant {
  id: string;
  owner_user_id: string;
  name: string;
  vertical_type: string; // "generic" | "restaurant" | ...
  created_at: string;
  user_role?: "owner" | "admin" | "member";
}
```

---

# Supabase Service Patterns

All database operations go through **`src/services/supabase/v2/`**. React components must never call Supabase directly.

**Service files per domain:**
- `products.ts`, `activities.ts`, `catalogs.ts`, `styles.ts`
- `attributes.ts`, `allergens.ts`, `ingredients.ts`
- `productOptions.ts`, `productGroups.ts`
- `featuredContents.ts`, `tenants.ts`, `activity-groups.ts`, `layoutScheduling.ts`

**Naming convention:**
```ts
listBaseProductsWithVariants(tenantId: string): Promise<V2Product[]>
getProduct(id: string, tenantId: string): Promise<V2Product>
createProduct(tenantId: string, data: {...}): Promise<V2Product>
updateProduct(id: string, tenantId: string, data: {...}): Promise<V2Product>
deleteProduct(id: string, tenantId: string): Promise<void>
```

**Error handling pattern:**
```ts
const { data, error } = await supabase.from("v2_products").select("*").eq("tenant_id", tenantId);
if (error) {
  if (error.code === "PGRST116") throw new Error("Not found");
  if (error.code === "23503") throw new Error("Cannot delete — referenced by another record");
  throw error;
}
return data ?? [];
```

**Tenant validation**: always pass and verify `tenantId` in service functions. Cross-tenant writes must be rejected.

---

# Database Schema Rules

Migrations: `supabase/migrations/`. Never modify existing migration files.

**RLS policy pattern** (all tenant-scoped tables):
```sql
-- Uses get_my_tenant_ids() SECURITY INVOKER STABLE function
USING (tenant_id = ANY(get_my_tenant_ids()))
WITH CHECK (tenant_id = ANY(get_my_tenant_ids()))
```

**Core tables:**

| Table | Key fields | Notes |
|---|---|---|
| `v2_tenants` | `id`, `owner_user_id`, `name`, `vertical_type`, `deleted_at` | Soft-delete support |
| `v2_activities` | `id`, `tenant_id`, `name`, `activity_type` | Locations/branches |
| `v2_products` | `id`, `tenant_id`, `name`, `base_price`, `parent_product_id` | `parent_product_id` for variants |
| `v2_catalogs` | `id`, `tenant_id`, `name`, `active_style_version_id` | |
| `v2_product_option_groups` | `id`, `tenant_id`, `product_id`, `group_kind` | `"PRIMARY_PRICE"` or `"ADDON"` |
| `v2_product_option_values` | `id`, `tenant_id`, `option_group_id`, `absolute_price`, `price_modifier` | |
| `v2_catalog_categories` | `id`, `tenant_id`, `catalog_id`, `sort_order` | |
| `v2_schedules` | `id`, `tenant_id`, `name`, `visibility_mode`, `is_active` | |
| `v2_featured_contents` | `id`, `tenant_id`, `name` | |
| `v2_product_attribute_definitions` | `tenant_id` (nullable) | NULL = platform attribute |
| `v2_schedule_targets` | no `tenant_id`, no RLS | Known security gap |

**Important notes:**
- `v2_activity_schedules` — **DROPPED** (migration `20260302130000`). Do not reference.
- `vertical_type` lives on `v2_tenants` only. `activity_type` on `v2_activities` is an optional subtype.
- Soft-delete via `v2_tenants.deleted_at`. RPCs: `delete_tenant()`, `restore_tenant()`, `purge_tenant_now()`.

**Adding schema changes**: always create a new migration file. Never modify existing ones.

---

# Layout System

**No top navbar.** Primary navigation is the left sidebar only.

**`MainLayout`** (`src/layouts/MainLayout/`):
- Renders `Sidebar` + `DrawerProvider` + `<Outlet />`
- Sidebar: collapsible on desktop (260px → 90px), modal on mobile
- Mobile: hamburger header shown above content

**Sidebar navigation groups** (`src/components/layout/Sidebar/Sidebar.tsx`):
- _(no title)_ — Panoramica
- Operatività — Sedi, Programmazione
- Contenuti — Cataloghi, Prodotti, Highlights, Stili
- Insight — Analytics, Recensioni
- Sistema — Team, Impostazioni

**Page structure pattern:**
```tsx
<PageHeader title="Prodotti" breadcrumbs={[...]} actions={<Button>...</Button>} />
<Tabs activeTab={activeTab} onChange={setActiveTab}>
  <Tab name="list">
    <FilterBar ... />
    <DataTable rows={...} columns={...} />
  </Tab>
</Tabs>
<EntityCreateEditDrawer open={isOpen} onClose={...} />
<EntityDeleteDrawer open={isDeleteOpen} onClose={...} />
```

---

# Drawer-Based Editing Flows

All create/edit operations use **right-side drawers**. Do NOT use centered modals for editing entities.

**Drawer stack:**
1. `SystemDrawer` — low-level primitive (Framer Motion slide-in, portal, backdrop, ESC, focus trap, scroll lock). Default width: 520px.
2. `DrawerLayout` — structural wrapper with `header`, `children`, `footer` slots.
3. Domain-specific drawer component (e.g., `ProductCreateEditDrawer`).

**Standard drawer component pattern:**
```tsx
type EntityDrawerProps = {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  entityData: V2Entity | null;
  onSuccess: (saved?: V2Entity) => void;
  tenantId: string;
};

export function EntityDrawer({ open, onClose, mode, entityData, onSuccess, tenantId }: EntityDrawerProps) {
  const [isSaving, setIsSaving] = useState(false);
  return (
    <SystemDrawer open={open} onClose={onClose} width={500}>
      <DrawerLayout
        header={<Text variant="title-sm">{mode === "create" ? "Crea" : "Modifica"}</Text>}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Annulla</Button>
            <Button variant="primary" type="submit" form="entity-form" loading={isSaving}>Salva</Button>
          </>
        }
      >
        <EntityForm
          formId="entity-form"
          mode={mode}
          entityData={entityData}
          tenantId={tenantId}
          onSuccess={onSuccess}
          onSavingChange={setIsSaving}
        />
      </DrawerLayout>
    </SystemDrawer>
  );
}
```

**Form submits via `form` attribute** (not a submit button inside the form):
```tsx
<Button type="submit" form="entity-form" loading={isSaving}>Salva</Button>
// form is rendered as sibling, linked by id
<EntityForm formId="entity-form" ... />
```

**`onSavingChange` pattern** — form notifies drawer of save state:
```tsx
useEffect(() => { onSavingChange?.(isSaving); }, [isSaving, onSavingChange]);
```

**Post-success flow:**
1. `onSuccess(savedEntity)` is called from the form.
2. Parent page reloads list data.
3. Drawer closes.
4. Toast is shown.

**File structure per domain:**
```
Products/
├─ Products.tsx              # Page: state + list + open/close logic
├─ ProductCreateEditDrawer.tsx
├─ ProductDeleteDrawer.tsx
├─ ProductPage.tsx           # Detail page
└─ components/
   └─ ProductForm.tsx        # Reusable form (no drawer logic)
```

---

# Page-Level State Pattern

```tsx
// Data loading
const [items, setItems] = useState<V2Entity[]>([]);
const [isLoading, setIsLoading] = useState(true);

const loadData = useCallback(async () => {
  try {
    setIsLoading(true);
    const data = await listEntities(selectedTenantId!);
    setItems(data);
  } catch {
    showToast({ message: "Errore nel caricamento", type: "error" });
  } finally {
    setIsLoading(false);
  }
}, [selectedTenantId, showToast]);

useEffect(() => { loadData(); }, [loadData]);

// Drawer state
const [isDrawerOpen, setIsDrawerOpen] = useState(false);
const [mode, setMode] = useState<"create" | "edit">("create");
const [selected, setSelected] = useState<V2Entity | null>(null);

const handleCreate = () => { setMode("create"); setSelected(null); setIsDrawerOpen(true); };
const handleEdit = (item: V2Entity) => { setMode("edit"); setSelected(item); setIsDrawerOpen(true); };
const handleClose = () => { setIsDrawerOpen(false); setSelected(null); };
const handleSuccess = async () => { await loadData(); handleClose(); showToast({ message: "Salvato", type: "success" }); };
```

---

# UI Components

Available in `src/components/ui/`. **Always check before creating new primitives.**

| Component | Location | Notes |
|---|---|---|
| `Button` | `ui/Button/` | variants: `primary`, `secondary`, `outline`, `ghost`, `danger`; sizes: `sm`, `md`, `lg`; supports `loading`, `leftIcon`, `rightIcon`, `as="a"` |
| `Text` | `ui/Text/` | variants: `title-lg/md/sm`, `subtitle`, `body-lg/body/body-sm`, `caption`, `button` |
| `TextInput`, `Textarea`, `SearchInput` | `ui/` | |
| `Select`, `RadioGroup`, `SegmentedControl` | `ui/` | |
| `CheckboxInput`, `Switch` | `ui/` | |
| `DateInput`, `TimeInput`, `NumberInput`, `ColorInput` | `ui/` | |
| `Badge`, `Pill`, `PillGroup` | `ui/` | |
| `Card` | `ui/` | |
| `Tooltip` | `ui/` | |
| `Tabs`, `Tab` | `ui/` | |
| `DataTable` | `ui/` | |
| `PageHeader` | `ui/` | title + breadcrumbs + actions |
| `FilterBar` | `ui/` | search + filter controls |

**Toast notifications:**
```tsx
const { showToast } = useToast();
showToast({ message: "Prodotto creato", type: "success" }); // "success"|"error"|"info"|"warning"
```

---

# Multi-Tenant Rules

- All business data is tenant-scoped — always include `tenant_id` in writes.
- `tenant_id` must always come from `useTenant().selectedTenantId` or `useTenantId()`.
- Never derive `tenant_id` from `auth.user.id`.
- UI must never expose `owner_user_id`.
- UI terms: tenants → "Azienda"/"Brand", activities → "Sede"/"Attività".

---

# Dangerous Operations

Claude must never:

- Modify existing database migrations.
- Remove or weaken RLS policies.
- Expose `service_role` keys in frontend code.
- Bypass tenant validation logic.
- Introduce schema changes without a new migration file.
- Reference `v2_activity_schedules` (dropped).

---

# Before Writing Code

1. Search for existing similar implementations.
2. Follow the existing pattern for that domain.
3. Prefer consistency over innovation.

The goal is a consistent, predictable, and secure codebase.
