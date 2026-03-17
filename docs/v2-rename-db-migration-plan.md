# V2 Rename DB Migration Plan

**Migration file:** `supabase/migrations/20260317120000_rename_v2_tables.sql`
**Date:** 2026-03-17
**Scope:** Database only — src/ and supabase/functions/ are unchanged by this migration.

---

## Tables to Rename

34 active tables. `v2_activity_schedules` is excluded (permanently dropped in `20260302130000`).

| current name | new name | notes |
|---|---|---|
| `v2_tenants` | `tenants` | root — renamed last |
| `v2_activities` | `activities` | |
| `v2_products` | `products` | |
| `v2_catalogs` | `catalogs` | |
| `v2_catalog_categories` | `catalog_categories` | |
| `v2_catalog_category_products` | `catalog_category_products` | |
| `v2_catalog_sections` | `catalog_sections` | ⚠️ LEGACY — see note below |
| `v2_catalog_items` | `catalog_items` | ⚠️ LEGACY — see note below |
| `v2_activity_product_overrides` | `activity_product_overrides` | |
| `v2_styles` | `styles` | |
| `v2_style_versions` | `style_versions` | |
| `v2_schedules` | `schedules` | |
| `v2_schedule_layout` | `schedule_layout` | |
| `v2_schedule_price_overrides` | `schedule_price_overrides` | |
| `v2_schedule_visibility_overrides` | `schedule_visibility_overrides` | |
| `v2_schedule_featured_contents` | `schedule_featured_contents` | |
| `v2_schedule_targets` | `schedule_targets` | ⚠️ no RLS tenant_id |
| `v2_activity_groups` | `activity_groups` | |
| `v2_activity_group_members` | `activity_group_members` | |
| `v2_featured_contents` | `featured_contents` | |
| `v2_featured_content_products` | `featured_content_products` | |
| `v2_allergens` | `allergens` | |
| `v2_product_allergens` | `product_allergens` | |
| `v2_ingredients` | `ingredients` | |
| `v2_product_ingredients` | `product_ingredients` | |
| `v2_product_attribute_definitions` | `product_attribute_definitions` | nullable tenant_id |
| `v2_product_attribute_values` | `product_attribute_values` | |
| `v2_product_option_groups` | `product_option_groups` | |
| `v2_product_option_values` | `product_option_values` | |
| `v2_product_groups` | `product_groups` | |
| `v2_product_group_items` | `product_group_items` | |
| `v2_tenant_memberships` | `tenant_memberships` | |
| `v2_audit_logs` | `audit_logs` | |
| `v2_plans` | `plans` | |

> **⚠️ LEGACY tables** (`catalog_sections`, `catalog_items`): these were superseded by
> `catalog_categories`/`catalog_category_products` in migration `20260225121000`.
> No active code queries them today.  They are renamed here for completeness.
> A follow-up migration should evaluate dropping them after confirming they hold no
> live data that needs to be migrated.

---

## Views to Rename

Both views are dropped in Step 2 and recreated with clean body text in Step 8.

| current name | new name | body changes |
|---|---|---|
| `v2_tenant_members_view` | `tenant_members_view` | `v2_tenant_memberships` → `tenant_memberships` |
| `v2_user_tenants_view` | `user_tenants_view` | `v2_tenants`, `v2_tenant_memberships` → `tenants`, `tenant_memberships` |

---

## Functions to Drop / Recreate

### Functions requiring immediate action (drop before rename)

| function | signature | reason |
|---|---|---|
| `is_schedule_active` | `(s public.v2_schedules)` | Parameter type uses the table name; this is resolved to a type OID at creation time.  The old OID remains valid after rename but the function would be undiscoverable by new callers using the new type.  Dropped in Step 1, recreated in Step 6 as `is_schedule_active(s public.schedules)`. |

### Functions recreated with updated body text (CREATE OR REPLACE)

`CREATE OR REPLACE` is used throughout so the function **OID is preserved**.  This means every caller — trigger definitions, RLS policy expressions, other functions — continues to work without any modification.

| function | signature | v2_ tables in body | why recreated |
|---|---|---|---|
| `get_my_tenant_ids` | `()` | `v2_tenants`, `v2_tenant_memberships` | Called by every RLS policy; must be correct when plan cache is invalidated |
| `get_my_deleted_tenants` | `()` | `v2_tenants` | Same rationale |
| `handle_new_tenant_membership` | `()` trigger | `v2_tenant_memberships` | Trigger function; body text correctness required |
| `handle_new_tenant_system_group` | `()` trigger | `v2_activity_groups` | Same |
| `invite_tenant_member` | `(uuid, text, text)` | `v2_tenant_memberships` | Current active overload |
| `get_invite_info_by_token` | `(uuid)` | `v2_tenant_memberships`, `v2_tenants` | |
| `accept_invite_by_token` | `(uuid)` | `v2_tenant_memberships` | |
| `accept_tenant_invite` | `(uuid)` | `v2_tenant_memberships` | Older flow; kept for safety |
| `remove_tenant_member` | `(uuid, uuid)` | `v2_tenants`, `v2_tenant_memberships` | |
| `revoke_invite` | `(uuid)` | `v2_tenant_memberships` | |
| `decline_invite_by_token` | `(uuid)` | `v2_tenant_memberships` | |
| `change_member_role` | `(uuid, uuid, text)` | `v2_tenant_memberships` | |
| `resend_invite` | `(uuid)` | `v2_tenant_memberships`, `v2_tenants` | |
| `delete_invite` | `(uuid)` | `v2_tenant_memberships` | |
| `leave_tenant` | `(uuid)` | `v2_tenants`, `v2_tenant_memberships` | |
| `get_public_catalog` | `(uuid)` | 12 tables | The most complex function; also calls `is_schedule_active(s)` so must come after that function is recreated |

### Function dropped and NOT recreated

| function | reason |
|---|---|
| `invite_tenant_member(uuid, uuid, text)` | Legacy overload (takes `user_id` instead of `email`).  Superseded by the `(uuid, text, text)` version in migration `20260313020000`.  Dropped here to eliminate the stale reference to `v2_tenants` and `v2_tenant_memberships` and to prevent confusion. |

### Functions NOT requiring changes

| function | reason |
|---|---|
| `get_user_id_by_email(text)` | Only queries `auth.users` — no v2_ tables |
| `prevent_deleted_at_client_update()` | No table references in body |

---

## Objects NOT updated by this migration (and why they are safe)

| object type | explanation |
|---|---|
| **RLS policy expressions** | PostgreSQL compiles `USING` / `WITH CHECK` clauses to expression trees that reference tables and functions by OID.  After a rename the OID is unchanged; policies continue to evaluate correctly.  The human-readable text in `pg_policies.qual` will still show old v2_ names — this can be fixed cosmetically in a follow-up migration. |
| **FK constraints** | Resolved by OID; survive any rename automatically. |
| **Triggers (associations)** | Trigger bindings reference the table by OID; they survive the rename and are transferred to the new name.  Trigger *names* containing `v2_` are renamed in Step 5. |
| **Unnamed CHECK / UNIQUE constraints** | Auto-generated names such as `v2_product_option_groups_group_kind_check` are not visible to application code and do not affect functionality.  Can be renamed in a follow-up migration. |
| **Primary-key indexes** (auto-named, e.g. `v2_products_pkey`) | Renamed automatically by PostgreSQL when the table is renamed — no action needed. |

---

## Operations Order

```
BEGIN;

  Step 1 — DROP FUNCTION is_schedule_active(public.v2_schedules)
             ↑ Must precede the v2_schedules rename

  Step 2 — DROP VIEW v2_tenant_members_view
           DROP VIEW v2_user_tenants_view
             ↑ Dropped now so they can be recreated with clean body text

  Step 3 — Rename 34 tables
             Leaf tables first, root tables (tenants) last — for clarity;
             FK integrity is maintained by OID so the order is not strictly
             required.

  Step 4 — Rename 6 named indexes (cosmetic)
             idx_v2_option_groups_tenant_product_kind
             idx_v2_option_values_tenant_group
             v2_tenant_memberships_invite_token_idx
             v2_audit_logs_tenant_idx
             v2_audit_logs_user_idx
             v2_audit_logs_created_idx

  Step 5 — Rename 5 triggers (cosmetic)
             on_v2_tenant_created                    → on_tenant_created
             on_v2_tenant_created_system_group       → on_tenant_created_system_group
             v2_tenants_protect_deleted_at           → tenants_protect_deleted_at
             v2_tenant_memberships_set_updated_at    → tenant_memberships_set_updated_at
             v2_product_groups_set_updated_at        → product_groups_set_updated_at

  Step 6 — CREATE OR REPLACE FUNCTION is_schedule_active(s public.schedules)
             ↑ Must follow the v2_schedules rename (Step 3) so that
               public.schedules is resolvable as a row type

  Step 7 — CREATE OR REPLACE for 16 functions (body text updated)
             + DROP FUNCTION invite_tenant_member(uuid, uuid, text)
             Order within Step 7:
               7-A  get_my_tenant_ids           (core helper)
               7-B  get_my_deleted_tenants
               7-C  handle_new_tenant_membership  (trigger fn)
               7-D  handle_new_tenant_system_group (trigger fn)
               7-E  invite_tenant_member          (drop old overload + recreate current)
               7-F  get_invite_info_by_token
               7-G  accept_invite_by_token
               7-H  accept_tenant_invite
               7-I  remove_tenant_member
               7-J  revoke_invite
               7-K  decline_invite_by_token
               7-L  change_member_role
               7-M  resend_invite
               7-N  delete_invite
               7-O  leave_tenant
               7-P  get_public_catalog            ← must be last (depends on
                                                     is_schedule_active being
                                                     recreated in Step 6)

  Step 8 — CREATE VIEW tenant_members_view
           CREATE VIEW user_tenants_view

COMMIT;
```

---

## Risks

### Must be verified before applying

| # | risk | severity | verification query |
|---|---|---|---|
| 1 | **Trigger names may differ on the live DB.** The trigger rename in Step 5 uses `ALTER TRIGGER … RENAME TO`. If a trigger was renamed manually in Studio or if the name differs from what migrations show, the step will fail with `trigger … for relation … does not exist`. | HIGH | `SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public' AND trigger_name LIKE '%v2_%' ORDER BY event_object_table;` |
| 2 | **`v2_product_groups_set_updated_at` trigger may not exist.** This trigger was added in our reconstruction migration `20260225220321`. If that migration hasn't been applied yet, Step 5 will fail on the rename. | HIGH | `SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'v2_product_groups_set_updated_at';` |
| 3 | **Named indexes may differ.** Indexes created via Supabase Studio may have auto-generated names that differ from what migration files show. `ALTER INDEX IF EXISTS` is used so a missing index does NOT cause failure, but the rename would silently be skipped. | MEDIUM | `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%v2_%' ORDER BY indexname;` |
| 4 | **`invite_tenant_member(uuid, uuid, text)` overload may already be gone.** The `DROP FUNCTION IF EXISTS` makes this safe, but verify which overloads exist to avoid surprises. | LOW | `SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname = 'invite_tenant_member' AND pronamespace = 'public'::regnamespace;` |
| 5 | **Edge functions and frontend code will break immediately after this migration is applied** until they are also updated to use the new table names. Plan to deploy both in a coordinated window. The database migration is the first step; frontend and edge function updates must follow before any traffic is served. | CRITICAL | Schedule a low-traffic deployment window. Confirm both code updates are ready before running the migration. |
| 6 | **RLS policy text will still reference v2_ names** (e.g. the `v2_schedule_targets` policies reference `v2_schedules` by name in their stored text). The policies continue to work via OID but `pg_policies.qual` shows stale names. This is cosmetic but can cause confusion during future audits. | LOW | `SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname = 'public' AND (qual LIKE '%v2_%' OR with_check LIKE '%v2_%');` |
| 7 | **Any other function not found in migration files** (e.g. created via Studio) that references v2_ table names will break on plan re-compilation. Run the query below before applying. | MEDIUM | `SELECT proname, prosrc FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosrc LIKE '%v2_%';` |
| 8 | **`catalog_sections` and `catalog_items` legacy tables** may hold data on the live DB that was never migrated to `catalog_categories` / `catalog_category_products`. The rename is safe, but the data situation should be understood before any future DROP. | LOW | `SELECT COUNT(*) FROM public.v2_catalog_sections; SELECT COUNT(*) FROM public.v2_catalog_items;` |

### Recommended pre-apply checklist

```sql
-- 1. Verify all v2_ trigger names
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public' AND trigger_name LIKE '%v2_%'
ORDER BY event_object_table;

-- 2. Verify all v2_ index names
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public' AND indexname LIKE '%v2_%'
ORDER BY indexname;

-- 3. Check for any undocumented functions with v2_ references
SELECT proname, left(prosrc, 200) AS body_preview
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND prosrc LIKE '%v2_%';

-- 4. Check invite_tenant_member overloads
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'invite_tenant_member'
  AND pronamespace = 'public'::regnamespace;

-- 5. Confirm legacy table row counts
SELECT 'catalog_sections' AS tbl, COUNT(*) FROM public.v2_catalog_sections
UNION ALL
SELECT 'catalog_items',           COUNT(*) FROM public.v2_catalog_items;
```

### Post-apply verification

```sql
-- 1. No v2_ tables should remain
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'v2_%';
-- Expected: 0 rows

-- 2. No v2_ views should remain
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public' AND table_name LIKE 'v2_%';
-- Expected: 0 rows

-- 3. No v2_ functions should remain (except get_my_tenant_ids which is fine)
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname LIKE 'v2_%';
-- Expected: 0 rows

-- 4. New views are queryable
SELECT COUNT(*) FROM public.tenant_members_view;
SELECT COUNT(*) FROM public.user_tenants_view;

-- 5. get_public_catalog still works (smoke test with a real catalog_id)
-- SELECT public.get_public_catalog('<a known catalog uuid>');
```
