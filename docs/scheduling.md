# Scheduling (Programmazione)

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
