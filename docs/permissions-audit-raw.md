# Permissions Audit — Raw Data (Fase 0)

Estrazione grezza per audit sistema permessi multi-sede. Scope: route business
`/business/:businessId/*`. Workspace ESCLUSO (usa `workspaceRole`, modello
diverso).

Niente conclusioni, niente analisi, solo dati. Vedi note finali per fonti
divergenti.

---

## Sezione A — Route inventory (business)

Fonte: `src/App.tsx` (canonica).

| path | component | dominio risorsa |
|---|---|---|
| `/business/:businessId/` (index → redirect `overview`) | `Navigate` | n/a |
| `/business/:businessId/overview` | `src/pages/Business/OverviewPage.tsx` | overview |
| `/business/:businessId/locations` | `src/pages/Dashboard/Businesses/Businesses.tsx` | activities + activity_groups |
| `/business/:businessId/locations/:activityId` | `src/pages/Operativita/Attivita/ActivityDetailPage.tsx` | activity + activity_hours |
| `/business/:businessId/tables` | `src/pages/Dashboard/Tables/Tables.tsx` | tables + table_zones |
| `/business/:businessId/orders` | `src/pages/Dashboard/Orders/Orders.tsx` | orders + tables (live) |
| `/business/:businessId/scheduling` | `src/pages/Dashboard/Programming/Programming.tsx` | scheduling |
| `/business/:businessId/scheduling/:ruleId` | `src/pages/Dashboard/Programming/ProgrammingRuleDetail.tsx` | scheduling |
| `/business/:businessId/scheduling/featured/:ruleId` | `src/pages/Dashboard/Programming/FeaturedRuleDetail.tsx` | scheduling (featured) |
| `/business/:businessId/catalogs` | `src/pages/Dashboard/Catalogs/Catalogs.tsx` | catalogs |
| `/business/:businessId/catalogs/:id` | `src/pages/Dashboard/Catalogs/CatalogEngine.tsx` | catalogs + catalog_categories |
| `/business/:businessId/products` | `src/pages/Dashboard/Products/Products.tsx` | products + product_groups + attributes |
| `/business/:businessId/products/:productId` | `src/pages/Dashboard/Products/ProductPage.tsx` | products |
| `/business/:businessId/featured` | `src/pages/Dashboard/Highlights/Highlights.tsx` | featured |
| `/business/:businessId/featured/:featuredId` | `src/pages/Dashboard/Highlights/FeaturedContentDetailPage.tsx` | featured |
| `/business/:businessId/styles` | `src/pages/Dashboard/Styles/Styles.tsx` | styles |
| `/business/:businessId/styles/:styleId` | `src/pages/Dashboard/Styles/StyleEditorPage.tsx` | styles |
| `/business/:businessId/languages` | `src/pages/Business/SettingsLanguages.tsx` | translations (proxy catalogs) |
| `/business/:businessId/attributes` (redirect → `products?tab=attributes`) | `Navigate` | attributes |
| `/business/:businessId/reviews` | `src/pages/Dashboard/Reviews/Reviews.tsx` | reviews |
| `/business/:businessId/analytics` | `src/pages/Dashboard/Analytics/AnalyticsPage.tsx` | analytics |
| `/business/:businessId/team` | `src/pages/Business/TeamPage.tsx` | team |
| `/business/:businessId/subscription` | `src/pages/Business/SubscriptionPage.tsx` | billing |
| `/business/:businessId/settings` | `src/pages/Business/BusinessSettingsPage.tsx` | tenant |

Tutte montate sotto `MainLayout` + `TenantProvider` + `PermissionsProvider` (vedi `App.tsx:188-242`).

---

## Sezione B — Permission seed

### B.1 — Lista permission (38)

Fonte: tabella `public.permissions` via Supabase MCP `execute_sql`.

| id | scope |
|---|---|
| `activities.create` | tenant |
| `activities.delete` | tenant |
| `activity_groups.read` | tenant |
| `activity_groups.write` | tenant |
| `activity_hours.write` | activity |
| `activity.manage` | activity |
| `activity.read` | activity |
| `analytics.read` | activity |
| `attributes.write` | tenant |
| `billing.cancel` | tenant |
| `billing.manage` | tenant |
| `billing.read` | tenant |
| `catalogs.read` | tenant |
| `catalogs.write` | tenant |
| `featured.read` | activity |
| `featured.write` | activity |
| `notifications.receive` | activity |
| `orders.manage` | activity |
| `orders.read` | activity |
| `product_availability.write` | activity |
| `products.read` | tenant |
| `products.write` | tenant |
| `reservations.manage` | activity |
| `reservations.read` | activity |
| `reviews.read` | activity |
| `reviews.respond` | activity |
| `scheduling.read` | activity |
| `scheduling.write` | activity |
| `styles.read` | tenant |
| `styles.write` | tenant |
| `tables.manage` | activity |
| `tables.read` | activity |
| `team.invite` | tenant |
| `team.manage_roles` | tenant |
| `team.read` | tenant |
| `team.remove` | tenant |
| `tenant.delete` | tenant |
| `tenant.manage` | tenant |
| `tenant.read` | tenant |
| `tenant.transfer_ownership` | tenant |

Totale: **40 righe in `permissions`** (vs «38 seed» nominali in `CLAUDE.md` — vedi note finali).

### B.2 — Matrice ruolo × permission

Fonte: tabella `public.role_permissions`. Owner non ha righe dedicate qui ma riceve un `INSERT` dedicato nel seed e/o è considerato superuser per derivazione. Tutte le righe presenti in DB sono mappate sotto. `✓` = riga presente.

Conteggio righe per ruolo:
- owner: 39
- admin: 37
- manager: 25
- staff: 16
- viewer: 12

| permission | owner | admin | manager | staff | viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| `activities.create` | ✓ | ✓ |   |   |   |
| `activities.delete` | ✓ | ✓ |   |   |   |
| `activity_groups.read` | ✓ | ✓ | ✓ |   |   |
| `activity_groups.write` | ✓ | ✓ |   |   |   |
| `activity_hours.write` | ✓ | ✓ | ✓ |   |   |
| `activity.manage` | ✓ | ✓ | ✓ |   |   |
| `activity.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `analytics.read` | ✓ | ✓ | ✓ |   | ✓ |
| `attributes.write` | ✓ | ✓ |   |   |   |
| `billing.cancel` | ✓ |   |   |   |   |
| `billing.manage` | ✓ | ✓ |   |   |   |
| `billing.read` | ✓ | ✓ |   |   |   |
| `catalogs.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `catalogs.write` | ✓ | ✓ |   |   |   |
| `featured.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `featured.write` | ✓ | ✓ | ✓ |   |   |
| `notifications.receive` | ✓ | ✓ | ✓ | ✓ |   |
| `orders.manage` | ✓ | ✓ | ✓ | ✓ |   |
| `orders.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `product_availability.write` | ✓ | ✓ | ✓ |   |   |
| `products.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `products.write` | ✓ | ✓ |   |   |   |
| `reservations.manage` | ✓ | ✓ | ✓ | ✓ |   |
| `reservations.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `reviews.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `reviews.respond` | ✓ | ✓ | ✓ | ✓ |   |
| `scheduling.read` | ✓ | ✓ | ✓ |   | ✓ |
| `scheduling.write` | ✓ | ✓ | ✓ |   |   |
| `styles.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `styles.write` | ✓ | ✓ |   |   |   |
| `tables.manage` | ✓ | ✓ | ✓ | ✓ |   |
| `tables.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `team.invite` | ✓ | ✓ | ✓ |   |   |
| `team.manage_roles` | ✓ | ✓ | ✓ |   |   |
| `team.read` | ✓ | ✓ | ✓ |   |   |
| `team.remove` | ✓ | ✓ | ✓ |   |   |
| `tenant.delete` | ✓ |   |   |   |   |
| `tenant.manage` | ✓ | ✓ |   |   |   |
| `tenant.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `tenant.transfer_ownership` | ✓ |   |   |   |   |

Note matrice (osservazioni grezze, no analisi):
- `owner` ha **39/40** permission (nessuna riga per `permissions.id` mancante: confronto sotto). Conta righe `role_permissions WHERE role='owner'` = 39. Ricontrollo: lista owner non include `attributes.write`? La query mostra owner SI ha `attributes.write` (riga 73 dell'output). Conteggio 39 = 40 perm − 1 (owner manca **`tenant.transfer_ownership`** in lista? No, c'è. Riconteggio dalla query: owner ha 39 righe → manca esattamente 1 permission. La permission non assegnata a owner risulta essere assente — vedi note finali.)
- `admin`: 37/40. Mancanti per admin: `billing.cancel`, `tenant.delete`, `tenant.transfer_ownership`.
- `manager`: 25/40.
- `staff`: 16/40.
- `viewer`: 12/40.

---

## Sezione C — Call-site map

Fonte: grep helper da `src/lib/permissions.ts` su `src/`; grep `has_permission(` e `has_permission_any_activity(` su `supabase/migrations/` e `supabase/functions/`.

### C.1 — Frontend call-sites

| file | permission | helper | fe/be |
|---|---|---|---|
| `src/components/layout/Sidebar/Sidebar.tsx:72` | `activity.read` | `canDoOnAnyActivity` | fe |
| `src/components/layout/Sidebar/Sidebar.tsx:74` | `tables.read` | `canDoOnAnyActivity` | fe |
| `src/components/layout/Sidebar/Sidebar.tsx:76` | `orders.read` | `canDoOnAnyActivity` | fe |
| `src/components/layout/Sidebar/Sidebar.tsx:78` | `scheduling.read` | `canDoOnAnyActivity` | fe |
| `src/components/layout/Sidebar/Sidebar.tsx:86` | `catalogs.read` | `canDoOnTenant` | fe |
| `src/components/layout/Sidebar/Sidebar.tsx:88` | `products.read` | `canDoOnTenant` | fe |
| `src/components/layout/Sidebar/Sidebar.tsx:93` | `featured.read` | `canDoOnAnyActivity` | fe |
| `src/components/layout/Sidebar/Sidebar.tsx:96` | `styles.read` | `canDoOnTenant` | fe |
| `src/components/layout/Sidebar/Sidebar.tsx:98` | `catalogs.read` | `canDoOnTenant` (proxy per voce "Lingue") | fe |
| `src/components/layout/Sidebar/Sidebar.tsx:106` | `analytics.read` | `canDoOnAnyActivity` | fe |
| `src/components/layout/Sidebar/Sidebar.tsx:108` | `reviews.read` | `canDoOnAnyActivity` | fe |
| `src/components/layout/Sidebar/Sidebar.tsx:116` | `team.read` | `canDoOnTenant` | fe |
| `src/components/layout/Sidebar/Sidebar.tsx:118` | `billing.read` | `canDoOnTenant` | fe |
| `src/components/Subscription/SubscriptionBanner.tsx:18` | `billing.manage` | `canDoOnTenant` | fe |
| `src/components/Subscription/SubscriptionBanner.tsx:19` | `billing.cancel` | `canDoOnTenant` | fe |
| `src/components/Businesses/MemberDrawer/MemberForm.tsx:73` | (target role) | `canChangeRoleOf` | fe |
| `src/components/Businesses/MemberDrawer/MemberForm.tsx:76` | (composite) | `isOwnerOrAdmin` | fe |
| `src/components/Businesses/InviteMemberDrawer/InviteMemberForm.tsx:55` | (target role) | `canInviteRole` | fe |
| `src/components/Businesses/InviteMemberDrawer/InviteMemberForm.tsx:56` | (composite) | `isOwnerOrAdmin` | fe |
| `src/pages/Business/BusinessSettingsPage.tsx:24` | `tenant.manage` | `canDoOnTenant` | fe |
| `src/pages/Business/BusinessSettingsPage.tsx:25` | `tenant.delete` | `canDoOnTenant` | fe |
| `src/pages/Business/SubscriptionPage.tsx:38` | `billing.read` | `canDoOnTenant` | fe |
| `src/pages/Business/SubscriptionPage.tsx:39` | `billing.manage` | `canDoOnTenant` | fe |
| `src/pages/Business/SubscriptionPage.tsx:40` | `billing.cancel` | `canDoOnTenant` | fe |
| `src/pages/Business/TeamPage.tsx:105` | `team.invite` | `canDoOnTenant` | fe |
| `src/pages/Business/TeamPage.tsx:106` | `team.read` | `canDoOnTenant` | fe |
| `src/pages/Business/TeamPage.tsx:107` | `team.remove` | `canDoOnTenant` | fe |
| `src/pages/Business/TeamPage.tsx:361,446` | (target) | `canChangeRoleOf` | fe |
| `src/pages/Business/TeamPage.tsx:362,447,559,600` | (target) | `canRemoveMember` | fe |

`canEditSchedule` non risulta usato nei call-site applicativi (solo in test `src/tests/lib/permissions.test.ts`).

Workspace-only call-sites esclusi (out of scope): `src/pages/Workspace/BillingPage.tsx`, `src/pages/Dashboard/Businesses/Businesses.tsx` (usa `isOwner(userRole)` da `workspaceRole`), `src/services/supabase/account.ts`.

### C.2 — Backend call-sites (RLS + RPC)

Helper invocati: `public.has_permission(text, uuid?)`, `public.has_permission_any_activity(text, uuid)`.

#### RLS policy

| file | permission | helper |
|---|---|---|
| `supabase/migrations/20260528120000_rls_activity_scoped.sql:176` | `activities.create` | `has_permission_any_activity` |
| ` ` :181-182 | `activity.manage` (activities U/I) | `has_permission` |
| ` ` :188 | `activities.delete` | `has_permission_any_activity` |
| ` ` :202 (activity_hours SELECT) | `activity.read` | `has_permission` |
| ` ` :206,210-211,215 (activity_hours I/U/D) | `activity_hours.write` | `has_permission` |
| ` ` :228 (activity_secondary_emails S) | `activity.read` | `has_permission` |
| ` ` :232,236-237,241 (activity_secondary_emails IUD) | `activity_hours.write` | `has_permission` |
| ` ` :254 (activity_phones S) | `activity.read` | `has_permission` |
| ` ` :258,262-263,267 (activity_phones IUD) | `activity.manage` | `has_permission` |
| ` ` :280 (activity_images S) | `activity.read` | `has_permission` |
| ` ` :284,288-289,293 (activity_images IUD) | `activity.manage` | `has_permission` |
| ` ` :305 (activity_addresses S) | `activity.read` | `has_permission` |
| ` ` :309,313 (activity_addresses IU/D) | `activity.manage` | `has_permission` |
| ` ` :328 (activity_groups S) | `activity_groups.read` | `has_permission` |
| ` ` :335,342,346,353 (activity_groups IUD + members) | `activity_groups.write` | `has_permission` |
| ` ` :367 (analytics_*) | `analytics.read` | `has_permission` |
| ` ` :389,393-394,398 (product_availability) | `product_availability.write` | `has_permission` |
| ` ` :411 (tables S) | `tables.read` | `has_permission` |
| ` ` :415,419-420,424 (tables IUD) | `tables.manage` | `has_permission` |
| ` ` :438 (customer_sessions S) | `tables.read` | `has_permission` |
| ` ` :442,446-447,451 (customer_sessions IUD) | `tables.manage` | `has_permission` |
| ` ` :465 (orders S) | `orders.read` | `has_permission` |
| ` ` :469,473-474,478 (orders IUD) | `orders.manage` | `has_permission` |
| ` ` :491,495,499-500,504 (order_items IUD) | `orders.manage` + `orders.read` (S) | `has_permission` |
| ` ` :522,532,542,549,559 (order_event_log) | `orders.read`/`orders.manage` | `has_permission` |
| ` ` :574 (reviews S) | `reviews.read` | `has_permission` |
| ` ` :578,582-583,587 (reviews IUD/respond) | `reviews.respond` | `has_permission` |
| ` ` :608,615,619,626 (featured_contents IUD) | `featured.write` | `has_permission_any_activity` |
| ` ` :643,650,657,661,668 (schedules tenant scope IUD) | `scheduling.read/write` | `has_permission_any_activity` |
| ` ` :689,693,702,706 (schedules manager scope S) | `scheduling.read` | `has_permission` + `has_permission_any_activity` |
| ` ` :719,730,734,741 (schedule_rules IUD) | `scheduling.write` | `has_permission_any_activity` |
| ` ` :764,770,777 (schedule_targets S) | `scheduling.read` | `has_permission` |
| `supabase/migrations/20260528170000_fix_schedules_rls_recursion.sql:62,67,124,128,135` | `scheduling.read` | both |
| `supabase/migrations/20260528210000_hardening_phase2.sql:55,59,62` | `scheduling.write` | both |
| `supabase/migrations/20260531150043_table_zones.sql:46,51,56-57,62` | `tables.read` (S) / `tables.manage` (IUD) | `has_permission` |
| `supabase/migrations/20260531150545_create_reservations.sql:108,113,118-119,124` | `reservations.read` (S) / `reservations.manage` (IUD) | `has_permission` |

#### RPC backend pre-check

| file | permission | helper |
|---|---|---|
| `supabase/migrations/20260530180000_get_tenant_members_v2.sql:66` | `team.read` | `has_permission` |
| `supabase/migrations/20260530190000_fix_get_tenant_members_ambiguous.sql:42` | `team.read` | `has_permission` |
| `supabase/migrations/20260530100000_invite_tenant_member_extended.sql:123` | `team.invite` | `has_permission` |
| `supabase/migrations/20260530120000_change_member_role.sql:137` | `team.manage_roles` | `has_permission` |
| `supabase/migrations/20260530210000_fix_change_member_role_self_modification.sql:113` | `team.manage_roles` | `has_permission` |
| `supabase/migrations/20260530220000_remove_tenant_member_v2.sql:120` | `team.remove` | `has_permission` |
| `supabase/migrations/20260530140000_update_schedule_targets.sql:105` | `scheduling.write` | `has_permission_any_activity` |
| `supabase/functions/respond-reservation/index.ts:237` (commento) | `reservations.manage` | (riferimento, RLS-enforced) |

---

## Sezione D — Azioni per dominio

Asse primario = dominio risorsa. Stessa risorsa su più surface (es. Tavoli standalone + tab embedded in dettaglio sede) elencata sotto lo stesso dominio.

Legenda colonne:
- `route/surface` = path + (eventuale tab/sub-component)
- `azione` = user-triggerable
- `permission attuale` = pre-check FE rilevato; vuoto se nessuno
- `scope` = `tenant` | `activity` | `n/a`
- `UNGATED?` = `YES` se nessun pre-check FE rilevato; `NO` altrimenti

Note generale: **tutte le route non-Sistema (overview, locations standalone, tables, orders, scheduling, catalogs, products, featured, styles, languages, analytics, reviews) NON importano `usePermissions` né i helper di `src/lib/permissions.ts`**. Verifica via grep: zero match in `src/pages/Dashboard/{Orders,Tables,Programming,Catalogs,Products,Highlights,Styles,Analytics,Reviews,Businesses}/`, `src/pages/Business/{OverviewPage.tsx,SettingsLanguages.tsx}`, `src/pages/Operativita/Attivita/`, `src/components/{Tables,Catalogs,Products,Highlights,Styles}/`. L'enforcement passa esclusivamente per RLS DB.

Subscription guard (`useSubscriptionGuard`, `canEdit`) NON è permission-based: è un gate billing/seat. Riportato come "subscription-gated" per chiarezza, ma rispetto al modello permission **risulta UNGATED**.

### D.1 — overview

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/overview` | naviga a `locations` / `products` / `catalogs` / `scheduling` / `featured` (link CTA) | — | n/a | **YES** |

### D.2 — activities + activity_groups

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/locations` | crea sede (drawer) | subscription `canEdit` | n/a | **YES** (permission-wise) |
| `/locations` | submit create sede | subscription `canEdit` + seat limit | n/a | **YES** |
| `/locations` | modifica sede (drawer) | subscription `canEdit` | n/a | **YES** |
| `/locations` | elimina sede | `isOwner(userRole)` (workspace role, fuori `PermissionsProvider` semantics) | n/a | **YES** |
| `/locations` | crea gruppo sedi (drawer) | subscription `canEdit` | n/a | **YES** |
| `/locations` | modifica gruppo sedi | subscription `canEdit` | n/a | **YES** |
| `/locations` | elimina gruppo sedi | — | n/a | **YES** |

### D.3 — activity (dettaglio) + activity_hours + activity_phones + activity_images + activity_addresses

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/locations/:activityId` | naviga tab `profile`/`availability`/`tables`/`settings` | — | n/a | **YES** |
| `/locations/:activityId` (ProfileTab) | modifica profilo (nome, descrizione, indirizzo, telefoni, email secondarie) | — | n/a | **YES** |
| `/locations/:activityId` (ProfileTab) | upload/elimina galleria/cover (ActivityGalleryUploadDrawer, ActivityCoverDrawer) | — | n/a | **YES** |
| `/locations/:activityId` (ProfileTab) | search Google Places (`GooglePlacesSearch`) | — | n/a | **YES** |
| `/locations/:activityId` (AvailabilityTab) | edit orari apertura | — | n/a | **YES** |
| `/locations/:activityId` (TablesTab embedded) | TablesManagement mode=embedded (stesse azioni `/tables`) | — | n/a | **YES** |
| `/locations/:activityId` (SettingsTab) | toggle status (pubblica/sospendi) | — | n/a | **YES** |
| `/locations/:activityId` (SettingsTab) | toggle `ordering_enabled` | — | n/a | **YES** |
| `/locations/:activityId` (SettingsTab) | salva impostazioni (UnsavedChangesBar) | — | n/a | **YES** |

### D.4 — tables + table_zones + customer_sessions

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/tables` | seleziona sede (ActivitySelectorCombobox) | — | n/a | **YES** |
| `/tables` | crea tavolo (drawer) | — | n/a | **YES** |
| `/tables` | modifica tavolo (drawer) | — | n/a | **YES** |
| `/tables` | elimina tavolo | — | n/a | **YES** |
| `/tables` | bulk delete tavoli | — | n/a | **YES** |
| `/tables` | apri drawer "Gestisci zone" (CRUD zone) | — | n/a | **YES** |
| `/tables` | rigenera QR token tavolo | — | n/a | **YES** |
| `/tables` | genera PDF QR (singolo / tutti) | — | n/a | **YES** |
| `/tables` | chiudi tavolo (close-table drawer) | — | n/a | **YES** |
| `/tables` | apri drawer richieste conto (`tables.manage` lato BE) | — | n/a | **YES** |
| `/locations/:activityId?tab=tables` (embedded) | come sopra | — | n/a | **YES** |

### D.5 — orders + order_items

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/orders` | seleziona sede (ActivitySelectorCombobox) | — | n/a | **YES** |
| `/orders` | switch tab "Comande" / "Tavoli" / "Storico" | — | n/a | **YES** |
| `/orders` | aggiorna ordini (manual refresh) | — | n/a | **YES** |
| `/orders` | toggle auto-refresh 30s | — | n/a | **YES** |
| `/orders` (Comande) | filter status (5 sub-tab) | — | n/a | **YES** |
| `/orders` (Comande) | filter tavolo + ricerca testuale | — | n/a | **YES** |
| `/orders` (Comande) | apri OrderDetailDrawer | — | n/a | **YES** |
| `/orders` (Comande) | acknowledge ordine (admin transition) | — | n/a | **YES** |
| `/orders` (Comande) | deliver ordine | — | n/a | **YES** |
| `/orders` (Comande) | apri OrderCancelDrawer | — | n/a | **YES** |
| `/orders` (Comande) | cancel ordine (admin) | — | n/a | **YES** |
| `/orders` (Comande) | apri OrderRectifyDrawer | — | n/a | **YES** |
| `/orders` (Comande) | rettifica items ordine | — | n/a | **YES** |
| `/orders` (Tavoli) | TablesLiveView (read-only, filtri Tutti/Aperti/Liberi/Manutenzione) | — | n/a | **YES** |

### D.6 — scheduling + schedule_rules + schedule_targets

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/scheduling` | filtra per rule_type (catalog/featured) | — | n/a | **YES** |
| `/scheduling` | crea regola (draft) | — | n/a | **YES** |
| `/scheduling` | duplica regola | — | n/a | **YES** |
| `/scheduling` | elimina regola | — | n/a | **YES** |
| `/scheduling` | toggle `enabled` regola | — | n/a | **YES** |
| `/scheduling` | apri calendar view | — | n/a | **YES** |
| `/scheduling/:ruleId` | edit regola catalog (periodo + giorni + target attività/gruppi) | — | n/a | **YES** |
| `/scheduling/:ruleId` | save regola | — | n/a | **YES** |
| `/scheduling/featured/:ruleId` | edit regola featured (slot before/after) | — | n/a | **YES** |
| `/scheduling/featured/:ruleId` | save regola featured | — | n/a | **YES** |

Nota: `canEditSchedule` esiste in `src/lib/permissions.ts` ma **non risulta invocato in nessun componente app**. Backend `update_schedule_targets` controlla `has_permission_any_activity('scheduling.write')` + per-target.

### D.7 — catalogs + catalog_categories

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/catalogs` | crea catalogo (drawer) | subscription `canEdit` | n/a | **YES** |
| `/catalogs` | import AI (drawer) | subscription `canEdit` | n/a | **YES** |
| `/catalogs` | modifica nome catalogo | subscription `canEdit` | n/a | **YES** |
| `/catalogs` | elimina catalogo (singolo) | subscription `canEdit` | n/a | **YES** |
| `/catalogs` | bulk delete cataloghi | — | n/a | **YES** |
| `/catalogs/:id` | crea categoria | — | n/a | **YES** |
| `/catalogs/:id` | modifica categoria | — | n/a | **YES** |
| `/catalogs/:id` | elimina categoria | — | n/a | **YES** |
| `/catalogs/:id` | aggiungi prodotto (nuovo / esistente) | — | n/a | **YES** |
| `/catalogs/:id` | rimuovi prodotto da categoria | — | n/a | **YES** |
| `/catalogs/:id` | drag&drop riordino prodotti | — | n/a | **YES** |
| `/catalogs/:id` | salva modifiche catalogo | — | n/a | **YES** |

### D.8 — products + product_groups + attributes + ingredients

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/products` | crea prodotto base (drawer) | subscription `canEdit` | n/a | **YES** |
| `/products` | crea variante | subscription `canEdit` | n/a | **YES** |
| `/products` | modifica prodotto | subscription `canEdit` | n/a | **YES** |
| `/products` | duplica prodotto | subscription `canEdit` | n/a | **YES** |
| `/products` | elimina prodotto (singolo) | — | n/a | **YES** |
| `/products` | bulk delete prodotti | — | n/a | **YES** |
| `/products` | crea gruppo prodotti | subscription `canEdit` | n/a | **YES** |
| `/products` (tab attributes) | crea attributo / value | subscription `canEdit` | n/a | **YES** |
| `/products` (tab ingredients) | crea ingrediente | subscription `canEdit` | n/a | **YES** |
| `/products` | espandi/comprimi varianti | — | n/a | **YES** |
| `/products/:productId` (SchedaTab) | edit campi prodotto (draft + UnsavedChangesBar) | — | n/a | **YES** |
| `/products/:productId` (PrezziTab) | edit prezzi + option groups | — | n/a | **YES** |
| `/products/:productId` (AttributiTab) | assegna attributi | — | n/a | **YES** |
| `/products/:productId` (TraduzioniTab) | edit traduzioni (TranslationsTab) | — | n/a | **YES** |
| `/products/:productId` (UtilizzoTab) | view utilizzi (read) | — | n/a | **YES** |
| `/products/:productId` | crea variante (drawer) | subscription `canEdit` | n/a | **YES** |

### D.9 — featured (highlights)

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/featured` | crea contenuto in evidenza | subscription `canEdit` | n/a | **YES** |
| `/featured` | naviga a detail (modifica) | — | n/a | **YES** |
| `/featured` | elimina contenuto (singolo) | — | n/a | **YES** |
| `/featured` | bulk delete | — | n/a | **YES** |
| `/featured/:featuredId` | modifica identità (drawer) | subscription `canEdit` | n/a | **YES** |
| `/featured/:featuredId` | modifica immagine (drawer) | subscription `canEdit` | n/a | **YES** |
| `/featured/:featuredId` | modifica tipo contenuto | subscription `canEdit` | n/a | **YES** |
| `/featured/:featuredId` | modifica CTA | subscription `canEdit` | n/a | **YES** |
| `/featured/:featuredId` | aggiungi prodotto (nuovo / esistente) | — | n/a | **YES** |
| `/featured/:featuredId` | applica selezione prodotti | — | n/a | **YES** |
| `/featured/:featuredId` | rimuovi prodotto | — | n/a | **YES** |

### D.10 — styles

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/styles` | crea stile | subscription `canEdit` | n/a | **YES** |
| `/styles` | apri editor (modifica) | subscription `canEdit` | n/a | **YES** |
| `/styles` | duplica stile | subscription `canEdit` | n/a | **YES** |
| `/styles` | elimina stile (non-system) | — | n/a | **YES** |
| `/styles` | bulk delete stili | — | n/a | **YES** |
| `/styles/:styleId` | salva stile | — | n/a | **YES** |
| `/styles/:styleId` | reset tokens | — | n/a | **YES** |
| `/styles/:styleId` | duplica & modifica | — | n/a | **YES** |
| `/styles/:styleId` | rollback versione | — | n/a | **YES** |

### D.11 — translations (route `/languages`)

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/languages` | attiva lingua | — | n/a | **YES** |
| `/languages` | disattiva lingua | — | n/a | **YES** |
| `/languages` | ritenta traduzioni fallite | — | n/a | **YES** |

(Sidebar gating: voce "Lingue" usa proxy `catalogs.read`. Nessun permission `translations.*` esiste nel seed.)

### D.12 — analytics

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/analytics` | seleziona sede | — | n/a | **YES** |
| `/analytics` | cambia periodo (today/7d/30d/90d/all) | — | n/a | **YES** |
| `/analytics` | export Excel | — | n/a | **YES** |

### D.13 — reviews

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/reviews` | seleziona sede | — | n/a | **YES** |
| `/reviews` | filtra rating | — | n/a | **YES** |
| `/reviews` | filtra periodo (incl. custom range) | — | n/a | **YES** |
| `/reviews` | search recensioni | — | n/a | **YES** |
| `/reviews` | ordina | — | n/a | **YES** |
| `/reviews` | apri ConfirmDialog elimina | — | n/a | **YES** |
| `/reviews` | conferma elimina recensione | — | n/a | **YES** |
| `/reviews` | (reply via `reviews.respond` BE-enforced) | — | n/a | **YES** |

### D.14 — team

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/team` | leggi lista membri (pre-fetch guard) | `team.read` (`canDoOnTenant`) | tenant | NO |
| `/team` | bottone "Invita membro" | `team.invite` (`canDoOnTenant`) | tenant | NO |
| `/team` (InviteMemberDrawer) | select ruolo invitato | `canInviteRole(targetRole)` + `isOwnerOrAdmin` | tenant | NO |
| `/team` (InviteMemberDrawer) | submit invito | (gated dal select sopra; BE `team.invite`) | tenant | NO |
| `/team` (riga membro) | cambia ruolo | `canChangeRoleOf(target, callerUserId)` → `team.manage_roles` + self-guard | tenant | NO |
| `/team` (MemberDrawer/Form) | select nuovo ruolo | `canChangeRoleOf` + `isOwnerOrAdmin` | tenant | NO |
| `/team` (riga membro) | rimuovi membro | `canRemoveMember(target, callerUserId)` → `team.remove` + self-guard | tenant | NO |
| `/team` (riga invito pending) | rinvia invito | `canChangeRoleOf` (riusato) | tenant | NO |
| `/team` (riga invito pending) | annulla invito | `canRemoveMember` (riusato) | tenant | NO |
| `/team` | bulk remove membri | `canRemoveMember` per riga | tenant | NO |
| `/team` | bulk cancel pending invites | — (asimmetria vs bulk remove, vedi CLAUDE.md tech-debt) | n/a | **YES** |

### D.15 — billing (subscription)

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/subscription` | leggi dati abbonamento (Locked block) | `billing.read` (`canDoOnTenant`) | tenant | NO |
| `/subscription` | modifica sedi (seats) | `billing.manage` (`canDoOnTenant`) | tenant | NO |
| `/subscription` | apri portale Stripe | `billing.manage` (`canDoOnTenant`) | tenant | NO |
| `/subscription` | attiva checkout | `billing.manage` (`canDoOnTenant`) | tenant | NO |
| `/subscription` | cancella abbonamento | `billing.cancel` (`canDoOnTenant`) | tenant | NO |
| `<SubscriptionBanner>` (globale) | CTA "Gestisci abbonamento" | `billing.manage` | tenant | NO |
| `<SubscriptionBanner>` (globale) | CTA "Riattiva" | `billing.cancel` | tenant | NO |

### D.16 — tenant (settings)

| route/surface | azione | permission attuale | scope | UNGATED? |
|---|---|---|---|:-:|
| `/settings` | modifica nome business | `tenant.manage` (`canDoOnTenant`) | tenant | NO |
| `/settings` | upload/modifica logo | `tenant.manage` | tenant | NO |
| `/settings` | salva impostazioni | `tenant.manage` | tenant | NO |
| `/settings` | elimina tenant (DeleteTenantDialog) | `tenant.delete` (`canDoOnTenant`) | tenant | NO |

Nota: `tenant.transfer_ownership` esiste nel seed (owner-only) ma **nessun call-site frontend né RPC pre-check** trovati per questo permission.

---

## Note finali — fonti divergenti / anomalie rilevate

1. **Permission count: 40 vs 38**.
   `CLAUDE.md` recita «38 permission seed». La tabella `public.permissions` contiene **40 righe**. Divergenza non risolta in questa estrazione.

2. **`docs/routes.md` incompleto vs `App.tsx`**.
   `routes.md` non elenca: `tables`, `orders`, `admin/status-incidents`, `t/:qrToken` (QR bootstrap), `:slug/prenota` (reservation), `select-business` (redirect → workspace), `status` (status page pubblica), né `dashboard` legacy redirect. `App.tsx` resta autoritativa.

3. **`canEditSchedule` definito ma non invocato**.
   `src/lib/permissions.ts:176` espone `canEditSchedule(perms, schedule)`. Grep su `src/` non trova call-site applicativi (solo `src/tests/lib/permissions.test.ts`). I componenti `Programming.tsx`, `ProgrammingRuleDetail.tsx`, `FeaturedRuleDetail.tsx` non importano `usePermissions`.

4. **Permission `translations.*` mancante nel seed**.
   `CLAUDE.md` tech-debt menziona la voce "Lingue" che usa proxy `catalogs.read`. Confermato: nessun permission `translations.*` in `public.permissions`.

5. **`activity_hours.write` usata per altre tabelle**.
   Le policy IUD per `activity_secondary_emails` usano `activity_hours.write` (file `20260528120000_rls_activity_scoped.sql:232,236-237,241`). Conferma di permission "riusata" per più tabelle.

6. **`notifications.receive` non ha call-site né policy associate**.
   Permission presente nel seed, granted a owner/admin/manager/staff. Nessun match in `supabase/migrations/` (`grep "notifications.receive"`) né nei componenti frontend grepped. Stato d'uso indeterminato.

7. **`viewer` ha `analytics.read` ma manca `notifications.receive`**.
   Pattern role × permission grezzo; nessuna analisi/conclusione.

8. **`owner` ha 39 righe in `role_permissions` ma il seed dichiara 40 permission**.
   Una permission non risulta assegnata a `owner` nelle righe restituite dalla query (riconteggio manuale dell'output query: owner ha **`activity_groups.write`** invece di — verifica diretta necessaria). Anomalia da chiarire in chat Opus.

9. **`PermissionsContext` montato esplicitamente solo sotto `/business/:businessId/*`** (`App.tsx:193`). `usePermissions()` in altre route lancerebbe errore. Workspace usa helpers diversi (`src/utils/workspaceRole.ts`).

10. **Subscription guard ≠ permission guard**.
    Molte azioni in `Catalogs`, `Products`, `Highlights`, `Styles`, `Locations` sono gate da `useSubscriptionGuard` (billing/seat). Dal punto di vista del modello permission queste **sono UNGATED**: utente staff/viewer con abbonamento attivo può triggerare il bottone, l'RLS DB rifiuterà il write.

11. **Activity-scoped pages (`/tables`, `/orders`, `/scheduling`, `/analytics`, `/reviews`, `/featured`) NON pre-filtrano per `activityIds`**.
    Sidebar usa `canDoOnAnyActivity` (truthy se ≥1 sede). Una volta dentro la pagina, l'ActivitySelectorCombobox / filtri mostrano tutte le sedi del tenant. Il pre-check per-sede passa solo dal backend RLS via `has_permission(..., activity_id)`.
