# Scheduling (Programmazione)

Quattro tipi di regola sullo stesso modello `schedules` (`RuleType` in `layoutScheduling.ts:23`; il valore `"catalog"` non esiste):

| `rule_type`           | Route detail                                          | Service                 | Scopo                                                     |
| --------------------- | ----------------------------------------------------- | ----------------------- | --------------------------------------------------------- |
| `"layout"`            | `/scheduling/:ruleId` → `RuleDetailPage`              | `layoutScheduling.ts`   | Assegna catalogo a sede in finestra temporale             |
| `"price"`             | idem                                                  | `layoutScheduling.ts`   | Override prezzi in finestra                               |
| `"visibility"`        | idem                                                  | `layoutScheduling.ts`   | Override visibilità prodotti in finestra                  |
| `"featured"`          | `/scheduling/featured/:ruleId` → `RuleDetailPage`     | `featuredScheduling.ts` | Assegna contenuti in evidenza (before/after) in finestra  |

Un solo dettaglio per i quattro tipi (`RuleDetailPage` + `useRuleDetail`), montato sulle due rotte; una regola `featured` aperta dalla rotta generica passa alla sua. Form, validazioni e campi mancanti (bozza) in `src/utils/ruleDetailForm.ts` (`buildRuleDetailForm`, `validateRuleForm`, `missingDraftFields`), coi test in `src/tests/ruleDetailForm.test.ts`.

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

**Banda del momento e matrice sedi × strati** (§20.3, decisioni §50.7), in cima alla vista Elenco:
- `MomentBand` — «Oggi alle HH:MM», quante sedi mostrano un menù (le sospese contano nel totale, non fra quelle che mostrano; con l'abbonamento non attivo nessuna), quante hanno modifiche a mano, cursore 00–24 a passi di 30 minuti (`RangeInput marks`). Agganciata in alto mentre la pagina scorre, compatta. Col filtro sede della navbar parla al singolare.
- `SeatMatrix` — «Cosa vede ogni sede»: una riga per sede, colonne Menù · Disponibilità · Prezzi · In evidenza · A mano, nell'ordine in cui si applicano; sotto 768 un blocco per sede. Cella vuota = diagnosi (bozza > fuori fascia > disabilitata > scaduta > nessuna regola). «A mano» = tutte le righe di `activity_product_overrides` della sede (`countManualOverridesByActivity`, una richiesta; se fallisce la colonna dice «non caricate»).
- Calcolo puro in `src/utils/scheduleMatrix.ts` (`buildScheduleMatrix`, `describeBand`): una `resolveCompetition` per sede sulle regole già caricate — la stessa di «Sovrascritta da» — a ogni scatto del cursore, niente giornata precalcolata. Istante del cursore da `romeInstantAt` (`src/utils/romeInstant.ts`, ora di Roma, giorni del cambio d'ora compresi).
- Il cursore muove banda e matrice, **non l'elenco**: «Adesso» e «Sovrascritta da» restano all'ora vera; «Torna ad adesso» rimette il cursore. Le tab del tipo filtrano solo l'elenco. La Settimana non ha la banda.
- Costo misurato (Node, Mac): 4 sedi × 27 regole 0,13 ms per scatto; 50 × 300 4,7 ms; 200 × 1000 113 ms. Oltre le 50 sedi servirà `useDeferredValue` sul cursore.

**Simulatore regole**: drawer con 4 blocchi (Catalogo, In evidenza, Prezzi, Visibilità — 2x2). Usa `resolveRulesForActivity()` con data/ora simulata.

**"Escluse N sedi"**: regole con target "Tutte" mostrano tooltip con sedi sovrascritte da regole più specifiche. Funziona per tutti e 4 i tipi.

**Tabelle**: `schedules`, `schedule_targets` (no tenant_id, RLS via subselect — security gap noto), `schedule_featured_contents`. RPC `get_schedule_featured_contents(schedule_id)` (`20260409120000`).
