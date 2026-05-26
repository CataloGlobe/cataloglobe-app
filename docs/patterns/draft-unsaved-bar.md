# Pattern: draft inline con `UnsavedChangesBar` + accordion single-open

## Draft inline + UnsavedChangesBar

Pattern per editing rapido senza salvataggio per cambio (sostituisce debounce manuale `useRef<setTimeout>` che era usato in passato — **tech debt chiuso**, NON reintrodurre). Esempi in produzione: `SchedaTab` (6 sezioni prodotto), `ActivitySettingsTab` (Pagamenti/Servizi/Tariffe).

- State diviso `draft` + `saved` nel parent. `isDirty` deriva dal diff (helper di confronto adatto al tipo: `arraysSameMembers` per `string[]`, `feesStateEqual` per `FeesState`).
- Componenti figli **controlled**: props `value: T` + `onChange: (next: T) => void` + `disabled?`. NO state interno, NO debounce.
- Re-sync con `activity` prop esterno via `useEffect` su `activity.<field>` + `lastSaved*Ref` per detect external change: se il draft equivale all'ultimo saved (= utente non dirty) follow nuovo saved, altrimenti preserva draft. Evita reset del draft quando un altro Save (es. toggle visibilità) triggera `onReload`.
- `<UnsavedChangesBar isSaving onCancel onSave>` appare in fondo SOLO quando `isDirty === true`. Annulla = `setDraft(saved)`. Salva = service call → `onReload()` (`saved` allinea via prop refresh).
- Toggle binari (`*_public`) restano save-immediato (non draft): una decisione binaria sola non beneficia di "raccolta modifiche". Solo le selezioni multi-pill / multi-field usano draft.

## Accordion single-open

Pattern in `ConfigAccordionSection` (`src/pages/Operativita/Attivita/tabs/components/`). Riusabile altrove se serve list di sezioni dirty-tracked.

- Stato `openAccordion: K | null` nel parent (controlled).
- Ogni `ConfigAccordionSection` riceve `isOpen` + `onToggle` (no state interno).
- Click su un altro accordion chiude quello corrente; click sullo stesso lo chiude.
- Dirty dot nell'header chiuso quando `draft?.isDirty === true` (la `UnsavedChangesBar` vive nel body, quindi quando chiuso il dot indica le modifiche parcheggiate).
- Preview badges (anteprima `string[]` dei valori SALVATI, non draft) visibili sull'header chiuso fino a 4 + "+N".
