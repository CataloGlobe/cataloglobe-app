# Cleanup Report — Step 5

**Data**: 2026-03-16
**Scope**: Rimozione componenti legacy `BusinessOverrides`, `BusinessCollectionSchedule`, `ScheduleRuleDrawer`

---

## File modificati

### `src/components/Businesses/BusinessCard/BusinessCard.tsx`

Rimosse le seguenti righe:

| Tipo | Contenuto rimosso |
|------|-------------------|
| import | `import BusinessOverrides from "../BusinessOverrides/BusinessOverrides"` |
| import | `import BusinessCollectionSchedule from "../BusinessCollectionSchedule/BusinessCollectionSchedule"` |
| import | `{ useState }` da `"react"` (non più usato) |
| stato | `const [overrideOpen, setOverrideOpen] = useState(false)` |
| stato | `const [showScheduleModal, setShowScheduleModal] = useState(false)` |
| JSX | `<BusinessOverrides isOpen={overrideOpen} ... />` (4 righe) |
| JSX | Commento `TODO(phase10)` + `<BusinessCollectionSchedule ... />` (10 righe) |
| JSX | Fragment wrapper `<>...</>` (non più necessario con un solo elemento radice) |

---

## File eliminati

| File | Dimensione approssimativa |
|------|--------------------------|
| `src/components/Businesses/BusinessOverrides/BusinessOverrides.tsx` | ~610 righe |
| `src/components/Businesses/BusinessOverrides/BusinessOverrides.module.scss` | stili |
| `src/components/Businesses/BusinessCollectionSchedule/BusinessCollectionSchedule.tsx` | ~588 righe |
| `src/components/Businesses/BusinessCollectionSchedule/ScheduleRuleDrawer.tsx` | ~194 righe |
| `src/components/Businesses/BusinessCollectionSchedule/BusinessCollectionSchedule.module.scss` | stili |

Le directory `BusinessOverrides/` e `BusinessCollectionSchedule/` contengono ora solo `.DS_Store` (file di sistema macOS, irrilevanti).

---

## Import rimasti

Grep post-cleanup per `BusinessOverrides|BusinessCollectionSchedule|ScheduleRuleDrawer` nel src/:

```
src/services/supabase/overrides.ts:8:export async function getBusinessOverridesForItems(
```

Questo è il nome di una **funzione** nel servizio legacy `overrides.ts` — non un import di componente. Non è un residuo del cleanup, è fuori scope per questo step (i servizi legacy verranno trattati nello step successivo).

**Nessun import rotto.**

---

## Verifica TypeScript

```
npx tsc --noEmit
```

**Output: nessun errore.** La compilazione è pulita.

---

## Stato post-step 5

| Componente | Stato |
|-----------|-------|
| `BusinessOverrides` | ✅ Eliminato |
| `BusinessCollectionSchedule` | ✅ Eliminato |
| `ScheduleRuleDrawer` | ✅ Eliminato |
| `BusinessCard.tsx` | ✅ Aggiornato, compila |
| TypeScript | ✅ Nessun errore |

---

## Note per lo step successivo

I seguenti servizi legacy restano ancora in place (fuori scope per questo step):

- `src/services/supabase/overrides.ts`
- `src/services/supabase/schedules.ts`
- `src/services/supabase/categories.ts`
- `src/domain/schedules/scheduleUtils.ts`

Parte delle funzioni in `src/services/supabase/collections.ts` che erano usate solo da `BusinessOverrides` sono ora anch'esse orfane.

Questi verranno analizzati e rimossi nello step 6.
