# Spec: Catalogs Card View

**Date:** 2026-04-10
**Status:** Approved by user
**Scope:** Add grid/card view to the Catalogs list page alongside the existing table view.

---

## Goal

When the user selects the grid toggle in the FilterBar on the Catalogs page (`/business/:businessId/catalogs`), the catalog list switches from a DataTable to a responsive grid of `CatalogCard` components. The toggle already exists; this spec wires it to a real visual mode.

---

## Constraints

- Use only fields available in `V2Catalog`: `id`, `tenant_id`, `name`, `created_at`.
- No `status`, no `updated_at` — these fields do not exist in the DB.
- Follow the `BusinessCard` component as the structural and stylistic reference.
- SCSS Modules only. No inline CSS.
- Italian labels throughout.
- Fetch category/product counts non-blocking, same pattern as `getActiveCatalogForActivities` in `Businesses.tsx`.

---

## Architecture

### New files

| File | Purpose |
|---|---|
| `src/components/Catalogs/CatalogCard/CatalogCard.tsx` | Card component for a single catalog |
| `src/components/Catalogs/CatalogCard/CatalogCard.module.scss` | Card styles |

### Modified files

| File | Change |
|---|---|
| `src/services/supabase/catalogs.ts` | Add `CatalogStats` type + `getCatalogStatsMap()` function |
| `src/pages/Dashboard/Catalogs/Catalogs.tsx` | Load stats, render card grid when `viewMode === "grid"` |
| `src/pages/Dashboard/Catalogs/Catalogs.module.scss` | Add `.catalogsGrid` layout class |

---

## Data: getCatalogStatsMap

```ts
export type CatalogStats = {
  categoryCount: number;
  productCount: number;
};

export async function getCatalogStatsMap(
  tenantId: string,
  catalogIds: string[]
): Promise<Record<string, CatalogStats>>
```

- Two parallel Supabase queries: `catalog_categories.select("catalog_id")` and `catalog_category_products.select("catalog_id")`, both filtered by `tenant_id` and `.in("catalog_id", catalogIds)`.
- Aggregation done client-side (count occurrences per `catalog_id`).
- Returns a map `catalogId → { categoryCount, productCount }`.
- Called non-blocking after `listCatalogs` resolves (same pattern as `getActiveCatalogForActivities`).
- **Scale note:** fetches all rows and counts client-side. Acceptable for typical tenant scale (tens to low hundreds of catalog entries). Not optimised for tenants with thousands of catalog_category_products rows — revisit with a DB-side count RPC if needed in future.

---

## CatalogCard Component

### Props

```ts
interface CatalogCardProps {
  catalog: V2Catalog;
  stats?: CatalogStats;
  statsLoading?: boolean;
  onEdit: (catalog: V2Catalog) => void;
  onDelete: (catalog: V2Catalog) => void;
  onClick: (catalog: V2Catalog) => void;
}
```

### Visual structure

```
┌─────────────────────────────┐
│  [preview — bg #eef0fb]     │
│   ┌───────────────────────┐ │
│   │▌ ━━━━━━━━━━           │ │  CSS-only decorative lines
│   │  ━━━━━━               │ │  accent bar (brand-primary)
│   │  ━━━━━━━━━━━━         │ │
│   │  ■ ■ ■                │ │  thumbnail placeholders
│   └───────────────────────┘ │
│                 [N prodotti] │  product count badge (pill)
├─────────────────────────────┤
│ Nome Catalogo          ⋮    │  title + Radix DropdownMenu
│ N categorie                 │  muted caption
│ Creato il GG/MM/AAAA        │  muted caption, it-IT locale
└─────────────────────────────┘
```

- **Preview area:** fixed-height div with background `#eef0fb` (lavender). Inside: a white "page" card with a left accent bar (brand-primary color) and stacked CSS bars of varying widths simulating content lines, plus three small square placeholders at the bottom.
- **Product count badge:** pill (white bg, border, brand-primary text) positioned absolute top-right of the preview area. Shows `—` while `statsLoading` is true.
- **Three-dots menu:** Radix `DropdownMenu` on the title row. Actions: "Modifica nome" (calls `onEdit`) and "Elimina catalogo" (calls `onDelete`, destructive variant).
- **Category count:** caption below name. Shows `—` while loading.
- **Created date:** `Intl.DateTimeFormat("it-IT", { day:"2-digit", month:"2-digit", year:"numeric" })`.
- **Card click:** entire card navigates to the catalog detail; clicks on interactive elements (buttons, menu) are stopped from bubbling. The `<article>` element must have `role="button"` and an `onKeyDown` handler (Enter/Space triggers click) for keyboard accessibility — matching the `BusinessCard` reference pattern.

### CSS line widths (SCSS classes, no inline style)

```
.line--full   { width: 100% }
.line--lg     { width: 75% }
.line--md     { width: 55% }
.line--sm     { width: 40% }
```

---

## Catalogs.tsx changes

### State additions

```ts
const [statsMap, setStatsMap] = useState<Record<string, CatalogStats>>({});
const [statsLoading, setStatsLoading] = useState(false);
const [viewMode, setViewMode] = useState<"list" | "grid">("list");
```

> **Migration note:** The existing code has a `density` state with the mapping `density === "compact" ? "list" : "grid"` wired to FilterBar's view toggle. This entire block must be **replaced** — remove `density`/`setDensity` and the mapping expression entirely. `DataTable` receives `density="compact"` as a constant (hardcoded prop, not from state).

### Non-blocking stats load (after listCatalogs resolves)

```ts
if (data.length > 0) {
  setStatsLoading(true);
  getCatalogStatsMap(currentTenantId, data.map(c => c.id))
    .then(map => setStatsMap(map))
    .catch(() => {})
    .finally(() => setStatsLoading(false));
}
```

### FilterBar view prop

```tsx
<FilterBar
  search={...}
  view={{ value: viewMode, onChange: v => setViewMode(v) }}
/>
```

### Conditional render

```tsx
{viewMode === "grid" ? (
  <div className={styles.catalogsGrid}>
    {filteredCatalogs.map(catalog => (
      <CatalogCard
        key={catalog.id}
        catalog={catalog}
        stats={statsMap[catalog.id]}
        statsLoading={statsLoading}
        onEdit={handleOpenEdit}
        onDelete={handleOpenDelete}
        onClick={c => navigate(`/business/${currentTenantId}/catalogs/${c.id}`)}
      />
    ))}
  </div>
) : (
  <DataTable ... />  // unchanged
)}
```

### Grid layout (Catalogs.module.scss)

```scss
.catalogsGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}
```

---

## Out of scope

- `status` field (Pubblicato/Bozza) — not in DB, not implemented.
- `updated_at` — not in DB, not implemented.
- Skeleton loading state for cards (shows `—` instead).
- Drag-to-reorder within the grid.
