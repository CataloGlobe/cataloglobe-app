# Dead Component Safety Check — Step 4

**Data**: 2026-03-16
**Scope**: Verifica che `BusinessOverrides`, `BusinessCollectionSchedule` e `ScheduleRuleDrawer` non abbiano utilizzi reali prima dell'eliminazione
**Metodo**: Grep sull'intero repository (src/ + supabase/), escludendo node_modules

---

## BusinessOverrides

### File che lo importano

```
src/components/Businesses/BusinessCard/BusinessCard.tsx:2
  import BusinessOverrides from "../BusinessOverrides/BusinessOverrides";
```

Unico importatore: `BusinessCard.tsx`. Nessun altro file nel repository.

### Il componente viene mai montato con trigger reale?

**No.** La variabile di stato che controlla `isOpen` è:

```tsx
// BusinessCard.tsx:22
const [overrideOpen, setOverrideOpen] = useState(false);

// Mount:
<BusinessOverrides isOpen={overrideOpen} ... />
```

Grep su `setOverrideOpen` nell'intero progetto:

```
src/components/Businesses/BusinessCard/BusinessCard.tsx:22  → useState(false)   [inizializzazione]
src/components/Businesses/BusinessCard/BusinessCard.tsx:196 → setOverrideOpen(false)  [solo chiusura]
```

`setOverrideOpen(true)` **non esiste in nessun file del repository.** La modale non può essere aperta da nessun percorso utente.

### Import dinamici o lazy loading

Nessuno. Grep per `import(.*BusinessOverrides` e `lazy(.*BusinessOverrides`: **nessun risultato.**

### useEffect o callback che possono aprirlo

Grep per `overrideOpen` restituisce solo le due righe sopra. Nessun `useEffect`, nessun event listener esterno, nessuna callback che imposta `overrideOpen` a `true`.

### Riferimenti nei test

**Nessun test nel progetto** (i file `.test.ts` e `.spec.ts` trovati appartengono tutti a `node_modules/@reduxjs/toolkit`).

---

## BusinessCollectionSchedule

### File che lo importano

```
src/components/Businesses/BusinessCard/BusinessCard.tsx:8
  import BusinessCollectionSchedule from "../BusinessCollectionSchedule/BusinessCollectionSchedule";
```

Unico importatore: `BusinessCard.tsx`. Nessun altro file nel repository.

### Il componente viene mai montato con trigger reale?

**No.** La variabile di stato che controlla `isOpen` è:

```tsx
// BusinessCard.tsx:23
const [showScheduleModal, setShowScheduleModal] = useState(false);

// Mount:
<BusinessCollectionSchedule isOpen={showScheduleModal} ... />
```

Grep su `setShowScheduleModal` nell'intero progetto:

```
src/components/Businesses/BusinessCard/BusinessCard.tsx:23  → useState(false)          [inizializzazione]
src/components/Businesses/BusinessCard/BusinessCard.tsx:209 → setShowScheduleModal(false)  [solo chiusura]
```

`setShowScheduleModal(true)` **non esiste in nessun file del repository.**

Il codice stesso lo documenta esplicitamente con un commento:

```tsx
{/* TODO(phase10): BusinessCollectionSchedule receives businessType from activity_type,
    which is legacy and should not be the primary business vertical.
    The trigger (setShowScheduleModal) is currently dead — no button calls it.
    When revived, replace businessType with selectedTenant.vertical_type from useTenant(). */}
```

### Import dinamici o lazy loading

Nessuno. Grep per `import(.*BusinessCollectionSchedule` e `lazy(.*BusinessCollectionSchedule`: **nessun risultato.**

### useEffect o callback che possono aprirlo

Grep per `showScheduleModal` restituisce solo le due righe sopra. Nessun percorso che imposta lo stato a `true`.

### Riferimenti nei test

Nessun test di progetto.

---

## ScheduleRuleDrawer

### File che lo importano

```
src/components/Businesses/BusinessCollectionSchedule/BusinessCollectionSchedule.tsx:30
  import ScheduleRuleDrawer, { DraftRule, ScheduleRuleDrawerRef } from "./ScheduleRuleDrawer";
```

Unico importatore: `BusinessCollectionSchedule.tsx`. Che è a sua volta importato solo da `BusinessCard.tsx` con trigger permanentemente morto (vedi sopra).

### Il componente viene mai montato con trigger reale?

**No.** `ScheduleRuleDrawer` è renderizzato all'interno di `BusinessCollectionSchedule`, che non viene mai aperto. La catena di inaccessibilità è:

```
setShowScheduleModal(true) → mai chiamato
  → BusinessCollectionSchedule (isOpen=false, sempre chiuso)
    → ScheduleRuleDrawer (mai renderizzato in DOM visibile)
```

Anche internamente a `BusinessCollectionSchedule`, `ScheduleRuleDrawer` è condizionato a `drawer.type !== "closed"`, che dipende dalle azioni dell'utente sulla modale padre — modale che non può essere aperta.

### Import dinamici o lazy loading

Nessuno. Grep per `import(.*ScheduleRuleDrawer` e `lazy(.*ScheduleRuleDrawer`: **nessun risultato.**

### Riferimenti nei test

Nessun test di progetto.

---

## Verifica finale

### Matrice riepilogativa

| Componente | Importatori esterni | `setOpen(true)` chiamato | Import dinamici | Lazy loading | Test | Edge functions |
|------------|--------------------|--------------------------|-----------------|--------------|----|----------------|
| `BusinessOverrides` | Solo `BusinessCard.tsx` | **Mai** | No | No | No | No |
| `BusinessCollectionSchedule` | Solo `BusinessCard.tsx` | **Mai** | No | No | No | No |
| `ScheduleRuleDrawer` | Solo `BusinessCollectionSchedule` | N/A (dipende da parent morto) | No | No | No | No |

### Risultato

```
✅ SAFE TO DELETE
```

**Tutti e tre i componenti.**

**Motivazione:**

1. Ogni componente ha un unico importatore diretto, e quella catena è verificabile e completa.
2. I trigger React (`setOverrideOpen(true)` e `setShowScheduleModal(true)`) non esistono **in nessun punto del repository** — confermato da grep esaustivo.
3. Non esistono import dinamici, lazy loading, o riferimenti da edge functions o script.
4. Il progetto non ha test di componente che possano dipendere da questi file.
5. Il commento `TODO(phase10)` nel codice sorgente conferma esplicitamente e intenzionalmente che il trigger è morto.

**File eliminabili con sicurezza:**

```
src/components/Businesses/BusinessOverrides/BusinessOverrides.tsx
src/components/Businesses/BusinessOverrides/BusinessOverrides.module.scss
src/components/Businesses/BusinessCollectionSchedule/BusinessCollectionSchedule.tsx
src/components/Businesses/BusinessCollectionSchedule/ScheduleRuleDrawer.tsx
src/components/Businesses/BusinessCollectionSchedule/BusinessCollectionSchedule.module.scss
```

**Modifiche richieste in `BusinessCard.tsx` prima dell'eliminazione:**
- Rimuovere `import BusinessOverrides from ...`
- Rimuovere `import BusinessCollectionSchedule from ...`
- Rimuovere `const [overrideOpen, setOverrideOpen] = useState(false)`
- Rimuovere `const [showScheduleModal, setShowScheduleModal] = useState(false)`
- Rimuovere il mount `<BusinessOverrides ... />`
- Rimuovere il mount `<BusinessCollectionSchedule ... />` con il relativo blocco di commento
