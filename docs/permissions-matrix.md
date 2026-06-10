# Permissions Matrix — CataloGlobe (v3)

Reference autoritativo del sistema permessi multi-tenant. Chiude Track A
(enforcement FE completo) e fa da base per Fase 1 (ruoli custom).
Storia: v1 (audit Fase 0) → v2 (findings Track 0) → v3 (Track A completo).

Scope: route business `/business/:businessId/*`. Workspace escluso (modello
`workspaceRole`, separato).

> **Stato.** Backend coerente (owner grant-based, risoluzione canonica su tutti
> i percorsi, tre assi ortogonali). **Enforcement FE completo**: ogni pagina
> business gata le sue azioni via PageGate + helper di permesso. Il catalogo
> (41 permessi) non è stato ridisegnato — solo cablato. Restano due permessi
> morti da pulire (§ 10).

---

## 1. I tre assi di accesso (ortogonali, AND-composti)

Un'azione passa se e solo se tutti e tre passano.

| Asse | Controlla | Meccanismo | Locked state |
|---|---|---|---|
| **Piano** | feature inclusa nel piano | FE: `usePlanFeatures` → `selectedTenant.plan` (TENANT-wide). BE: trigger `BEFORE INSERT` via `activity_has_feature` | "Passa a Pro" — CTA solo owner/admin |
| **Billing** | abbonamento attivo/trial | `useSubscriptionGuard.canEdit` (`status ∈ {active,trialing}`) | "Sistema l'abbonamento" |
| **Permesso** | il ruolo concede l'azione (+ scope) | `has_permission(perm, activity?)` BE / `canDoOnTenant`/`canDoOnActivity` FE | "Non hai accesso" |

Feature piano: `table_ordering` (ordini), `table_reservation` (prenotazioni). Base no, Pro sì.

**Nota piano FE vs BE (corregge v2 § 1).** Il FE gata sul piano del **tenant**;
il backend *potrebbe* fare per-sede via `activities.plan_override` + `activity_has_feature`,
ma `plan_override` è **inutilizzato** (0 righe, nessun setter nel codice). Quindi
oggi FE tenant-wide e BE per-sede coincidono. Si passerà PageGate a
`activity_has_feature(selectedActivityId)` **solo** quando i piani per-sede
diventeranno una feature reale. Deferral deliberato.

**Precedenza messaggi:** Piano → Permesso → Billing, ma la CTA "Passa a Pro"/
"Sistema abbonamento" si mostra solo a ruoli billing-capable; agli altri "non hai accesso".

---

## 2. Risoluzione canonica (regola governante) — VERIFICATA

Ogni percorso che risolve "utente U può P?" usa la risoluzione canonica (helper
che gestiscono owner via `owner_user_id`). Mai query inline su `tenant_memberships`
con service-role.

| Percorso | Owner | Stato |
|---|:-:|---|
| A — RLS + RPC (`has_permission*`) | ✓ | |
| B — Frontend (`get_my_permissions` → lib) | ✓ | |
| C — Edge fn (`get_my_tenant_ids` / `has_permission`) | ✓ | |
| D — `menu-ai-import` | ✓ | **FIXATO** → `has_permission('catalogs.write')` via user-JWT |
| E — `generate-menu-pdf` | ✓ | **FIXATO** → `has_permission('catalogs.read')` (no più owner-only) |

`translations.write` enforced anche lato BE (RLS `tenant_languages` + RPC
`retry_all_failed_translations`/`enqueue_tenant_language_backfill`, mig. 140000).
Hardening residuo: estrarre `_isMemberOfTenant` in `_shared/` (TODO FIX-3).
Bonifica sicurezza: error detail/stack rimossi dai 5xx in tutte le edge function.

> **Perché abilita i ruoli custom.** Ogni call-site chiede "ho il permesso?" a
> una risoluzione unica. Passare da ruolo fisso a ruolo custom non tocca i
> call-site — cambia solo la sorgente dei permessi.

---

## 3. Modello ruoli

5 built-in. `owner` **grant-based** (40/40 confermato, helper coerenti):
cortocircuito via `owner_user_id` → legge `role_permissions WHERE role='owner'`.

| Ruolo | Origine | Scope |
|---|---|---|
| `owner` | `tenants.owner_user_id` | tenant-wide |
| `admin` | `tenant_memberships.role='admin'` | tenant-wide |
| `manager`/`staff`/`viewer` | `tenant_membership_activities` | activity-scoped |

---

## 4. Convenzione naming (per permessi nuovi; nessun rename dell'esistente)

`.read`/`.write` default CRUD · `.manage` solo con azioni operative non-CRUD ·
verbi specifici per operazioni singolari/alto rischio · plurale+tenant
(`activities.*`) vs singolare+activity (`activity.*`) = scope intenzionale.

---

## 5. Catalogo: 41 permessi

40 esistenti + `translations.write` (mig. 120000). Scope/categoria invariati da v2 § 5. Modifiche:
- **`translations.write`** (tenant, content) — NUOVO. Azioni `/languages`. Read via proxy `catalogs.read`.
- **`activity_groups.write`** — esisteva già (mig. 130000 resa no-op con ON CONFLICT).
- **Morti** (cleanup, § 10): `notifications.receive`, `tenant.transfer_ownership`.
- `canEditSchedule`/`ScheduleShape` (helper FE orfani) — RIMOSSI in A3.

---

## 6. Matrice ruolo × permesso

`T` = tenant-wide · `A` = activity-scoped (sedi assegnate) · vuoto = negato.
**Fonte autoritativa = tabella `role_permissions`.** Validabile con:
`SELECT role, permission_id FROM public.role_permissions ORDER BY 1,2;`

| permesso | owner | admin | manager | staff | viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| activities.create | T | T | | | |
| activities.delete | T | T | | | |
| activity.read | T | T | A | A | A |
| activity.manage | T | T | A | | |
| activity_hours.write | T | T | A | | |
| activity_groups.read | T | T | T | | |
| activity_groups.write | T | T | | | |
| catalogs.read | T | T | T | T | T |
| catalogs.write | T | T | | | |
| products.read | T | T | T | T | T |
| products.write | T | T | | | |
| attributes.write | T | T | | | |
| product_availability.write | T | T | A | | |
| featured.read | T | T | A | A | A |
| featured.write | T | T | A | | |
| styles.read | T | T | T | T | T |
| styles.write | T | T | | | |
| translations.write | T | T | | | |
| scheduling.read | T | T | A | | A |
| scheduling.write | T | T | A | | |
| tables.read | T | T | A | A | A |
| tables.manage | T | T | A | A | |
| orders.read | T | T | A | A | A |
| orders.manage | T | T | A | A | |
| reservations.read | T | T | A | A | A |
| reservations.manage | T | T | A | A | |
| reviews.read | T | T | A | A | A |
| reviews.respond | T | T | A | A | |
| analytics.read | T | T | A | | A |
| notifications.receive | T | T | A | A | |
| team.read | T | T | T | | |
| team.invite | T | T | T | | |
| team.manage_roles | T | T | T | | |
| team.remove | T | T | T | | |
| billing.read | T | T | | | |
| billing.manage | T | T | | | |
| billing.cancel | T | | | | |
| tenant.read | T | T | T | T | T |
| tenant.manage | T | T | | | |
| tenant.delete | T | | | | |
| tenant.transfer_ownership | T | | | | |

---

## 7. Gating FE per pagina — TUTTE GATED (Track A completo)

Ogni pagina wrappata in `<PageGate>` (read-gate sui 3 assi) + controlli di
mutazione gatati con helper espliciti.

| dominio | route | read-gate | mutazioni |
|---|---|---|---|
| catalogs | /catalogs, /:id | catalogs.read | catalogs.write |
| products | /products, /:id | products.read | products.write, attributes.write |
| orders | /orders | orders.read + `table_ordering` | orders.manage (activity) |
| tables | /tables (+ tab) | tables.read | tables.manage (activity) |
| scheduling | /scheduling/* | scheduling.read | scheduling.write (any-activity*) |
| featured | /featured/* | featured.read | featured.write (any-activity*) |
| styles | /styles/* | styles.read | styles.write |
| analytics | /analytics | analytics.read | — (read-only) |
| reviews | /reviews | reviews.read | reviews.respond |
| locations | /locations, /:id | activity.read | activities.create/delete (tenant), activity.manage/activity_hours.write (per sede dall'URL), activity_groups.write |
| languages | /languages | catalogs.read (proxy) | translations.write (FE+BE) |
| reservations | /reservations | reservations.read + `table_reservation` | reservations.manage |
| team | /team | team.read | team.invite/manage_roles/remove |
| billing | /subscription | billing.read | billing.manage/cancel |
| settings | /settings | tenant.read | tenant.manage/delete |

\* gate any-activity perché l'entità non è per-sede (vedi § 9).

---

## 8. PageGate — primitivo FE di gating

`src/components/PageGate/PageGate.tsx`. Render-prop `{ canEdit }` dove
**canEdit = billing-only** (`useSubscriptionGuard`). Props: `feature?` (piano),
`readPermission`, `activityId?`. Ordine assi: piano → permesso → billing.

**Convenzione controlli:** permesso assente → **nascondi**; billing inattivo →
**disabilita** (`disabled={!canEdit}`). Gate FE allineato al confine RLS, mai più stretto.

---

## 9. Sfumature di scope (contano per Fase 1)

- **`featured.*`**: etichettati activity-scoped, ma `featured_contents` non ha
  `activity_id` → enforced tenant-wide (RLS `has_permission_any_activity`). Il
  gate FE usa `canDoOnAnyActivity`. Etichetta vs enforcement divergono: da
  chiarire quando i custom esporranno gli scope.
- **Regole scheduling**: multi-target (`activityIds[] + apply_to_all`), nessun
  singolo `activity_id` → gate any-activity, non per-sede.
- **`product_availability.write`**: nessuna UI ancora. Quando arriva →
  `canDoOnActivity(..., activityId)` (activity-scoped).
- **`activity.read`**: tutti i ruoli → la lista sedi è RLS-filtrata, il read-lock
  scatta solo per chi non ha sedi assegnate.
- **Piano**: tenant-wide nel FE (§ 1).

---

## 10. Cleanup residuo (non bloccante)

- `notifications.receive` — nel seed, zero call-site/policy. Wire o rimuovi.
- `tenant.transfer_ownership` — nel seed, zero call-site/RPC. Implementa o rimuovi.

---

## 11. Readiness Fase 1 (ruoli custom)

Cosa è ora vero e abilita i custom a costo basso:
1. Ogni azione business passa per `has_permission` (BE) + `canDoOnTenant`/`canDoOnActivity` (FE) + PageGate.
2. Risoluzione canonica su **tutti** i percorsi (edge function ribelli fixate, translations enforced BE).
3. `owner` è grant-based → uniforme col modello "ruolo = set di permessi".

Direzione architetturale (da discussione Track 0):
- Ruolo custom = **set esplicito di permessi**, tenant-scoped. UX "clona un built-in e modifica". **Niente ereditarietà** all'inizio.
- Activity-scope resta a livello di **assegnazione** (`tenant_membership_activities`), non dentro la definizione del ruolo.
- La risoluzione (`get_my_permissions`/`has_permission`) va estesa a leggere i permessi del ruolo custom; i call-site NON cambiano.

Decisioni di granularità aperte (da affrontare se/quando i custom devono esporle):
- Split deferred: `activity.publish` (da `activity.manage`), `orders.cancel`/`orders.rectify` (da `orders.manage`).
- Chiarire scope dichiarato vs enforced per `featured.*` (§ 9).
- Gruppi utenti: rimandabili (ottimizzazione di assegnazione, non necessari all'MVP custom).

---

*v3 — Track A completo. Prossimo: Fase 1, architettura ruoli custom (chat separata).*
