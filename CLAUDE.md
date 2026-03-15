# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # tsc -b && vite build
npm run lint         # ESLint
npm run preview      # Local production preview
```

No unit test framework is set up. There are two utility scripts:
- `npm run parity:check` — validates V2 API responses for activities
- `npm run test:activity-overrides` — tests activity-specific configuration overrides

## Architecture

**Stack**: React 19 + TypeScript + Vite + Supabase (PostgreSQL + RLS + Edge Functions) + React Router v7 + Framer Motion + SCSS Modules

**Path aliases** (configured in `vite.config.ts`):
`@` → `src/`, `@context`, `@components`, `@pages`, `@layouts`, `@services`, `@styles`, `@utils`, `@types`

### Route Structure

Three layout zones defined in `src/App.tsx`:

| Zone | Path prefix | Guard | Layout |
|---|---|---|---|
| Public | `/:slug`, `/` | none | `SiteLayout` |
| Workspace | `/workspace/*`, `/onboarding/*` | `ProtectedRoute` | `WorkspaceLayout` |
| Business | `/business/:businessId/*` | `ProtectedRoute` | `MainLayout` (sidebar) |

Guest-only routes (`/login`, `/sign-up`, etc.) use `GuestRoute`. OTP verification uses `OtpRoute`. Password recovery uses `RecoveryRoute`.

### Auth Flow

Two-stage authentication:
1. Supabase email/password auth
2. Custom OTP layer: `AuthContext` checks `otp_session_verifications` table by matching `session_id` from the JWT. Until OTP is verified, users are redirected to `/verify-otp`.

`AuthContext` exposes: `user`, `loading`, `otpVerified`, `signOut()`, `refreshOtp()`

Storage: `localStorage` by default; `sessionStorage` if "Remember Me" is false (controlled by `authRememberMe` key).

### Tenant (Multi-Tenant) System

`TenantContext` (`src/context/TenantProvider.tsx`):
- Loads tenants from `v2_user_tenants_view` (includes user role)
- Syncs `selectedTenant` with the `:businessId` URL segment
- Persists selection in `localStorage` (`cg_v2_selected_tenant_id`)
- Exposes: `tenants`, `selectedTenant`, `selectedTenantId`, `userRole`, `selectTenant(id)`

**All business-scoped pages get `tenantId` from `TenantContext`, not from `useAuth().user?.id`** (this was the Phase 3 migration goal — it is the current standard).

### Database Services

All DB calls go through `src/services/supabase/v2/`. One file per domain:

```
v2/
├── activities.ts          # v2_activities (Sedi/locations)
├── catalogs.ts
├── products.ts
├── productOptions.ts
├── productGroups.ts
├── styles.ts
├── featuredContents.ts
├── attributes.ts
├── layoutScheduling.ts
├── activeCatalog.ts
└── resolveActivityCatalogsV2.ts
```

Consistent pattern per service:
```typescript
export async function getData(tenantId: string) { ... }
export async function createData(tenantId: string, params) { ... }
export async function updateData(id: string, tenantId: string, updates) { ... }
export async function deleteData(id: string, tenantId: string) { ... }
```

All writes include `tenant_id` for RLS. Errors are thrown, caught by components.

### Domain Model

```
auth.users → v2_tenants (Business/Brand) → v2_activities (Location/Branch)
                    ↓ (tenant-scoped)
  v2_products, v2_catalogs, v2_styles, v2_schedules, v2_featured_contents, ...
```

**UI terminology (Italian)**:
- `v2_tenants` → "Azienda" / "Brand" (never say "tenant" in UI)
- `v2_activities` → "Sede" / "Attività"
- `owner_user_id` is never shown in the UI

### Layouts

- **No top navbar** — left sidebar only (`src/components/layout/Sidebar/Sidebar.tsx`)
- `MainLayout` — business area; sidebar collapses on desktop, drawer on mobile
- `WorkspaceLayout` — workspace/account area
- `SiteLayout` — public-facing catalog pages

### Styling

SCSS Modules for component styles (`.module.scss`). Global variables/mixins in `src/styles/`. Theme switching via `ThemeProvider`. CSS custom properties (`--bg`, `--text`, etc.) used throughout.

## Critical Schema Facts

- `v2_activity_schedules` — **DROPPED** (migration `20260302130000`). Do not reference.
- `vertical_type` lives on `v2_tenants` only — source of truth for business category.
- `activity_type` on `v2_activities` is optional (location subtype only).
- `v2_product_attribute_definitions.tenant_id` is **nullable** (platform-level attrs use NULL).
- `v2_schedule_targets` has no `tenant_id` and no RLS.
- `v2_product_option_groups/values`, `v2_product_groups/items` — migration files are empty stubs (tables created via Supabase Studio).
