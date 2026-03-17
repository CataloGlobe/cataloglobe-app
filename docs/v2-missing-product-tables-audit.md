# Missing V2 Product Tables Audit

**Date:** 2026-03-17
**Migration produced:** `supabase/migrations/20260225220321_add_missing_v2_product_tables.sql`

---

## Background

Four tables exist in the live Supabase database but have no `CREATE TABLE` statement in any migration file.  Their creation stubs are empty:

| stub file | content |
|---|---|
| `20260225203003_v2_product_groups.sql` | empty (1 line) |
| `20260225220320_v2_product_options.sql` | empty (1 line) |

Both tables were likely created interactively via Supabase Studio, which is why the migration files were left empty.

Subsequent migrations reference these tables and depend on their existence:

| migration | operation |
|---|---|
| `20260227203000_v2_rls_tighten_public_reads.sql` | `DROP POLICY IF EXISTS` on all 4 tables |
| `20260228174000_v2_product_options_multiprice.sql` | `ALTER TABLE … ADD COLUMN IF NOT EXISTS` on option groups and values |
| `20260228175000_public_get_public_catalog_with_options.sql` | queries all 4 tables inside SECURITY DEFINER function |
| `20260309000000_v2_phase1_multi_tenant.sql` | `ALTER COLUMN tenant_id DROP DEFAULT` (conditional, checks `information_schema`) |
| `20260309100000_v2_phase2_rls_multi_tenant.sql` | dynamic RLS policy creation (discovers tables via `information_schema`) |

---

## Table Definitions Recovered

### 1. `v2_product_option_groups`

**Confidence: HIGH**

| column | type | nullable | default | notes |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `tenant_id` | `uuid` | NOT NULL | — | FK → `v2_tenants(id)` ON DELETE CASCADE |
| `product_id` | `uuid` | NOT NULL | — | FK → `v2_products(id)` ON DELETE CASCADE |
| `name` | `text` | NOT NULL | — | display name |
| `is_required` | `boolean` | NOT NULL | `false` | whether selection is mandatory |
| `max_selectable` | `integer` | NULL | — | NULL = unlimited |
| `group_kind` | `text` | NOT NULL | `'ADDON'` | `CHECK IN ('PRIMARY_PRICE', 'ADDON')` — **added by 20260228174000** |
| `pricing_mode` | `text` | NOT NULL | `'DELTA'` | `CHECK IN ('ABSOLUTE', 'DELTA')` — **added by 20260228174000** |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |

**Constraints:**
- `PRIMARY KEY (id)`
- `FOREIGN KEY (tenant_id) REFERENCES v2_tenants(id) ON DELETE CASCADE`
- `FOREIGN KEY (product_id) REFERENCES v2_products(id) ON DELETE CASCADE`
- `CHECK (group_kind IN ('PRIMARY_PRICE', 'ADDON'))`
- `CHECK (pricing_mode IN ('ABSOLUTE', 'DELTA'))`

**Indexes** (created by `20260228174000`, not duplicated in the new migration):
- `idx_v2_option_groups_tenant_product_kind` ON `(tenant_id, product_id, group_kind)`

**RLS:** enabled. Policies: standard 4-policy set (`get_my_tenant_ids()`) installed by `20260309100000`.

**Evidence sources:**
- TypeScript type `V2ProductOptionGroup` in `src/services/supabase/v2/productOptions.ts`
- `createProductOptionGroup()` insert payload (lines 110–118)
- `ALTER TABLE` statements in `20260228174000_v2_product_options_multiprice.sql`
- `DROP POLICY IF EXISTS` names in `20260227203000_v2_rls_tighten_public_reads.sql`

---

### 2. `v2_product_option_values`

**Confidence: HIGH**

| column | type | nullable | default | notes |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `tenant_id` | `uuid` | NOT NULL | — | FK → `v2_tenants(id)` ON DELETE CASCADE |
| `option_group_id` | `uuid` | NOT NULL | — | FK → `v2_product_option_groups(id)` ON DELETE CASCADE |
| `name` | `text` | NOT NULL | — | display name |
| `price_modifier` | `numeric(10,2)` | NULL | — | relative delta; used when parent `pricing_mode = 'DELTA'` |
| `absolute_price` | `numeric(10,2)` | NULL | — | standalone price; **added by 20260228174000** |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |

**Constraints:**
- `PRIMARY KEY (id)`
- `FOREIGN KEY (tenant_id) REFERENCES v2_tenants(id) ON DELETE CASCADE`
- `FOREIGN KEY (option_group_id) REFERENCES v2_product_option_groups(id) ON DELETE CASCADE`

**Indexes** (created by `20260228174000`):
- `idx_v2_option_values_tenant_group` ON `(tenant_id, option_group_id)`

**RLS:** enabled. Policies: standard 4-policy set installed by `20260309100000`.

**Note on `price_modifier` type:** inferred as `numeric(10,2)` to match `absolute_price` (confirmed `numeric(10,2)` by the ALTER TABLE in 20260228174000) and consistent with monetary values used elsewhere in the schema. The TypeScript type is `number | null` which is consistent with any numeric type.

**Evidence sources:**
- TypeScript type `V2ProductOptionValue` in `src/services/supabase/v2/productOptions.ts`
- `createOptionValue()` insert payload (lines 189–196)
- `ALTER TABLE … ADD COLUMN IF NOT EXISTS absolute_price numeric(10,2) NULL` in `20260228174000`

---

### 3. `v2_product_groups`

**Confidence: HIGH** (columns), **MEDIUM** (trigger)

| column | type | nullable | default | notes |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `tenant_id` | `uuid` | NOT NULL | — | FK → `v2_tenants(id)` ON DELETE CASCADE |
| `name` | `text` | NOT NULL | — | display name |
| `parent_group_id` | `uuid` | NULL | — | FK → `v2_product_groups(id)` ON DELETE SET NULL; enables one level of nesting |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | see trigger note below |

**Constraints:**
- `PRIMARY KEY (id)`
- `FOREIGN KEY (tenant_id) REFERENCES v2_tenants(id) ON DELETE CASCADE`
- `FOREIGN KEY (parent_group_id) REFERENCES v2_product_groups(id) ON DELETE SET NULL`

**RLS:** enabled. Policies: standard 4-policy set installed by `20260309100000`.

**Trigger (assumed):**
The TypeScript `updateProductGroup()` function does not set `updated_at` explicitly in the update payload.  This implies a `BEFORE UPDATE` trigger using `update_updated_at_column()` maintains the column.  The migration includes:

```sql
CREATE OR REPLACE TRIGGER v2_product_groups_set_updated_at
    BEFORE UPDATE ON public.v2_product_groups
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

This is created with `CREATE OR REPLACE` (idempotent on the live database).

**Evidence sources:**
- TypeScript type `ProductGroup` in `src/services/supabase/v2/productGroups.ts` (lines 3–10)
- `createProductGroup()` insert payload (lines 48–52)
- `updateProductGroup()` update payload (lines 64–67) — `updated_at` absent from payload
- Analogous trigger pattern on `v2_tenant_memberships` (`20260312120000`)

---

### 4. `v2_product_group_items`

**Confidence: HIGH**

| column | type | nullable | default | notes |
|---|---|---|---|---|
| `tenant_id` | `uuid` | NOT NULL | — | PK part 1; FK → `v2_tenants(id)` ON DELETE CASCADE |
| `product_id` | `uuid` | NOT NULL | — | PK part 2; FK → `v2_products(id)` ON DELETE CASCADE |
| `group_id` | `uuid` | NOT NULL | — | PK part 3; FK → `v2_product_groups(id)` ON DELETE CASCADE |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |

**Constraints:**
- `PRIMARY KEY (tenant_id, product_id, group_id)`
- `FOREIGN KEY (tenant_id) REFERENCES v2_tenants(id) ON DELETE CASCADE`
- `FOREIGN KEY (product_id) REFERENCES v2_products(id) ON DELETE CASCADE`
- `FOREIGN KEY (group_id) REFERENCES v2_product_groups(id) ON DELETE CASCADE`

**No surrogate `id` column.** The TypeScript type `ProductGroupItem` confirms this: it has exactly `tenant_id`, `product_id`, `group_id`, `created_at` and nothing else.

**RLS:** enabled. Policies: standard 4-policy set installed by `20260309100000`.

**Evidence sources:**
- TypeScript type `ProductGroupItem` in `src/services/supabase/v2/productGroups.ts` (lines 23–28)
- `assignProductToGroup()` insert payload (lines 106–110)
- `getProductGroupAssignments()` select (no `.eq("tenant_id", ...)` filter — relies on RLS)
- Cascade deletion order in `supabase/functions/_shared/tenant-purge.ts` (lines 144, step 5)

---

## Assumptions Made

1. **`is_required` default is `false`.**
   The TypeScript `createProductOptionGroup()` always receives `is_required` explicitly.  `false` is used as the default to match the logical semantics (not required unless stated).  The actual Studio default is unknown.

2. **`price_modifier` type is `numeric(10,2)`.**
   The `absolute_price` column (confirmed `numeric(10,2)` by the ALTER TABLE) is the counterpart of `price_modifier`.  The same precision is assumed for consistency.  The TypeScript `number` type is compatible with any PostgreSQL numeric type.

3. **`v2_product_groups.updated_at` is maintained by a trigger.**
   The service layer does not set it explicitly on update.  A trigger using `update_updated_at_column()` is included in the migration.  If the live database has no such trigger (i.e., the value is stale after updates), the `CREATE OR REPLACE TRIGGER` adds it safely.

4. **ON DELETE behaviour for option groups → products is CASCADE.**
   Deleting a product should remove its option groups.  This is consistent with the behaviour of every other product-child table in the schema (e.g., `v2_product_allergens`, `v2_product_attribute_values` all use `ON DELETE CASCADE`).

5. **ON DELETE behaviour for product groups → tenants is CASCADE.**
   Consistent with every other tenant-owned resource.

6. **ON DELETE for `v2_product_groups.parent_group_id` is SET NULL.**
   Deleting a parent group should not cascade-delete its children; orphaning them (setting `parent_group_id = NULL`) is the safer behaviour matching the single-level nesting design.

7. **No indexes beyond what `20260228174000` already creates.**
   The multiprice migration adds the two most important composite indexes on option tables.  No additional indexes are needed for the group tables based on observed query patterns (always filtered by `tenant_id` which is enforced by RLS).

---

## Risks

### Must verify before applying

| # | risk | severity | action |
|---|---|---|---|
| 1 | **`update_updated_at_column()` function may not exist** on a fresh database at the point this migration runs (it is first used in `20260312120000`).  If the function is missing, the `CREATE OR REPLACE TRIGGER` statement will fail. | HIGH | Check that `update_updated_at_column()` is defined before this migration runs, or move the trigger to a later migration file. |
| 2 | **`price_modifier` actual precision on live DB** may differ from assumed `numeric(10,2)`. | MEDIUM | Run `SELECT column_name, data_type, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_name = 'v2_product_option_values' AND column_name = 'price_modifier';` against the live DB before applying. |
| 3 | **`is_required` actual default** on live DB may differ from `false`. | LOW | Run `SELECT column_default FROM information_schema.columns WHERE table_name = 'v2_product_option_groups' AND column_name = 'is_required';` against the live DB. |
| 4 | **`v2_product_groups` may have additional columns** not exposed in the TypeScript type (e.g., `description`, `sort_order`). | MEDIUM | Run `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'v2_product_groups' ORDER BY ordinal_position;` against the live DB. |
| 5 | **`v2_product_option_groups` and `v2_product_option_values` may have additional columns** (e.g., `sort_order`, `description`). | LOW | Run the same column query for both tables. |
| 6 | **The trigger on `v2_product_groups` may already exist with a different name** on the live database (created via Studio).  `CREATE OR REPLACE TRIGGER` handles this only if the name matches.  A duplicate trigger with a different name would fire twice. | LOW | Run `SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'v2_product_groups';` against the live DB. |
| 7 | **Migration replay ordering.**  This file uses timestamp `20260225220321` (one second after the empty options stub) to ensure the tables exist before `20260228174000` attempts `ALTER TABLE`.  If Supabase's migration runner applies files strictly in filename order, this is safe.  Confirm no migration tooling skips files based on a recorded "last applied" watermark that would bypass this file. | MEDIUM | Verify migration state with `SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;` on the live DB. |

### Already known non-issues

- The `ADD COLUMN IF NOT EXISTS` statements in `20260228174000` are safe regardless of whether this migration has been applied first — they are idempotent.
- `ALTER TABLE … ENABLE ROW LEVEL SECURITY` is idempotent in PostgreSQL.
- The dynamic RLS loop in `20260309100000` discovers tables at runtime via `information_schema` — it will correctly pick up these tables regardless of when they were created.
