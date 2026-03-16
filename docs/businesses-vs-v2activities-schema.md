# Schema Comparison: `businesses` vs `v2_activities`

**Data**: 2026-03-16
**Fonti**: `20260223132711_remote_schema.sql`, `20260223151000_v2_activities.sql`, `20260314100000_add_description_to_v2_activities.sql`

---

## Structure of `businesses`

**Defined in**: `20260223132711_remote_schema.sql:38`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | NULL | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `name` | `text` | NOT NULL | — | |
| `city` | `text` | NULL | — | |
| `slug` | `text` | NOT NULL | — | UNIQUE (global) |
| `created_at` | `timestamp with time zone` | NULL | `now()` | |
| `address` | `text` | NULL | — | |
| `type` | `text` | NULL | `'restaurant'` | CHECK: one of 7 values |
| `updated_at` | `timestamp without time zone` | NULL | `now()` | ⚠️ no timezone |
| `cover_image` | `text` | NULL | — | |
| `theme` | `jsonb` | NULL | — | Inline theme config |
| `timezone` | `text` | NOT NULL | `'Europe/Rome'` | Used for schedule evaluation |
| `is_public` | `boolean` | NOT NULL | `true` | Visibility flag |

**Constraints:**
- PRIMARY KEY on `id`
- UNIQUE on `slug` (global, across all businesses)
- CHECK `type IN ('restaurant','bar','hotel','hairdresser','beauty','shop','other')`
- FK `user_id → auth.users(id)` ON DELETE CASCADE

---

## Structure of `v2_activities`

**Defined in**: `20260223151000_v2_activities.sql` + `20260314100000_add_description_to_v2_activities.sql`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `uuid` | NOT NULL | — | PK |
| `tenant_id` | `uuid` | NOT NULL | — | FK → `v2_tenants(id)` ON DELETE RESTRICT |
| `name` | `text` | NOT NULL | — | |
| `slug` | `text` | NOT NULL | — | UNIQUE per `(tenant_id, slug)` |
| `activity_type` | `text` | NULL | — | No CHECK constraint |
| `address` | `text` | NULL | — | |
| `city` | `text` | NULL | — | |
| `cover_image` | `text` | NULL | — | |
| `status` | `text` | NOT NULL | `'active'` | `'active'` \| `'inactive'` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | ⚠️ different type than businesses |
| `description` | `text` | NULL | — | Added in `20260314100000` |

**Constraints:**
- PRIMARY KEY on `id`
- UNIQUE on `(tenant_id, slug)` — scoped per tenant, NOT global
- FK `tenant_id → v2_tenants(id)` ON DELETE RESTRICT (not CASCADE)

**TypeScript type** (`src/types/v2/activity.ts`): `V2Activity` — already reflects this schema exactly. `BusinessWithCapabilities` extends `V2Activity`, confirming the frontend type system is already V2-based.

---

## Column mapping

| `businesses` | `v2_activities` | Notes |
|-------------|-----------------|-------|
| `id` | `id` | Identical. Backfill preserved IDs |
| `user_id` | `tenant_id` | ⚠️ Different FK target: `auth.users` → `v2_tenants`. Since the multi-tenant migration, `v2_tenants.id ≠ auth.uid()` for new users. Code must use `TenantContext`, not `useAuth().user.id` |
| `name` | `name` | Identical |
| `city` | `city` | Identical |
| `slug` | `slug` | Same type, different uniqueness scope (see below) |
| `created_at` | `created_at` | Equivalent types (`timestamptz` vs `timestamp with time zone`) |
| `address` | `address` | Identical |
| `type` | `activity_type` | Renamed. `businesses` has CHECK constraint; `v2_activities` does not |
| `updated_at` | `updated_at` | ⚠️ Type mismatch: `timestamp without time zone` vs `timestamptz` |
| `cover_image` | `cover_image` | Identical |
| `theme` | ❌ **not present** | No `theme` column in `v2_activities`. Replaced by `v2_styles` |
| `timezone` | ❌ **not present** | No `timezone` column in `v2_activities`. Was used by legacy schedule evaluation (now dropped) |
| `is_public` | ❌ **not present** | No direct equivalent. `status = 'active'/'inactive'` is the closest analogue, but semantics differ |
| — | `status` | New in V2. No direct mapping from `businesses` |
| — | `description` | New in V2. No direct mapping from `businesses` |

---

## Columns in `businesses` with no equivalent in `v2_activities`

### 1. `theme` (jsonb)

**Usage**: `updateBusinessTheme()` in `businesses.ts:107` writes to this column.
Grep on callsites: the function is **defined** but has zero callsites in active components.
In V2, theme configuration lives in `v2_styles` + `v2_style_versions`.

**Impact**: The function `updateBusinessTheme()` would become dead code once migrated. No structural change to `v2_activities` needed — the functionality is already covered by the V2 styles system.

---

### 2. `timezone` (text, NOT NULL, default `'Europe/Rome'`)

**Usage**: Referenced in the `businesses_with_capabilities` view (via `is_schedule_active_now(...)`) — that view is scheduled for DROP in `20260316180000_prepare_legacy_drop.sql`.
Grep on `timezone` across all TypeScript: **no active frontend reference**.

**Impact**: Zero impact on migration. The column can be discarded.

---

### 3. `is_public` (boolean, NOT NULL, default `true`)

**Usage**: No TypeScript file reads or writes `is_public`. Not referenced in `V2Activity` type.
The equivalent concept in V2 is `v2_activities.status = 'active'/'inactive'`.

**Impact**: Functional gap only if public/private visibility per activity is needed in the future. Currently unused by any active code path.

---

## Structural differences that require code changes

### Slug uniqueness scope

| businesses | v2_activities |
|-----------|---------------|
| UNIQUE `slug` (global) | UNIQUE `(tenant_id, slug)` (per tenant) |

`ensureUniqueBusinessSlug()` in `src/utils/businessSlug.ts` queries `businesses.slug` to find collisions. After migration it must query `v2_activities.slug WHERE tenant_id = currentTenantId` instead. Two tenants can share the same slug in V2.

---

### `user_id` → `tenant_id` (non-trivial identity change)

In `businesses`, `user_id = auth.uid()` (one user = one business owner).
In `v2_activities`, `tenant_id = v2_tenants.id`, which is a distinct UUID **not equal to** `auth.uid()` for users created after the multi-tenant migration.

`addBusiness(userId, ...)` in `businesses.ts` passes `auth.uid()` directly. The V2 equivalent must pass the active tenant ID from `TenantContext.selectedTenantId`.

---

### FK on-delete behaviour

| businesses | v2_activities |
|-----------|---------------|
| `user_id → auth.users` ON DELETE **CASCADE** | `tenant_id → v2_tenants` ON DELETE **RESTRICT** |

`businesses` cascades when an auth user is deleted. `v2_activities` restricts — the tenant must be explicitly purged first. This is intentional V2 design (soft-delete flow via `deleted_at` on `v2_tenants`).

---

## Conclusion

```
REQUIRES STRUCTURAL CHANGES
```

The 1:1 column mapping covers all columns that are actively read or written by current code (`id`, `name`, `city`, `slug`, `address`, `activity_type`, `cover_image`, `created_at`, `updated_at`). The three orphan columns (`theme`, `timezone`, `is_public`) have no active code references and can be dropped without impact.

However, the migration is not a simple table rename because of three structural differences that require code changes:

1. **`user_id` → `tenant_id`**: `addBusiness()` and all mutations must be rewritten to use `TenantContext.selectedTenantId` instead of `useAuth().user.id`.
2. **Slug uniqueness scope**: `ensureUniqueBusinessSlug()` must scope its lookup to `tenant_id`, not globally.
3. **`reviews.business_id` FK**: The `reviews` table has `business_id → businesses.id`. This FK must be migrated to reference `v2_activities.id` (or a new `activity_id` column) and all RLS policies on `reviews` that query `businesses` must be rewritten.

The `v2_activities` schema is complete and structurally sound as a replacement. No new columns need to be added to `v2_activities` before proceeding.
