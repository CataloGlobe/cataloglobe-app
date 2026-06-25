# FASE 1 (read-only) — Badge Scheda resta neutro con manuale stale presente

> Sintomo: cambiato l'italiano della descrizione, la tab Traduzioni mostra Français (manuale) **"Da rivedere"**; il rimando in Scheda resta neutro **"Tradotto in 4 lingue"** invece dell'ambra "1 da rivedere". Solo lettura.
> Data: 2026-06-25.

---

## Risposte A–D

### A) `staleCount` vale 0 o >0? Perché?

**Vale 0** nello snapshot mostrato dal badge. Dimostrazione dal render (`TranslationStatusBadge.tsx:83-104`): il neutro "Tradotto in N lingue" è il ramo `allDone`, e
```ts
const allDone =
  status.doneCount === status.totalLanguages &&
  !hasPending && !hasError && !hasStale;   // hasStale = staleCount > 0
```
Perché si veda il neutro servono **insieme** `doneCount === totalLanguages (=4)` e `staleCount === 0`. Quindi tutte e 4 le righe `translations` risultano allineate al riferimento del badge e nessuna manuale risulta indietro.

Il riferimento del badge è **la colonna `products.description_hash`**, non l'hash del testo live:
```ts
// translationStatus.ts:93
const sourceHash = await fetchEntitySourceHash(entityType, entityId, field);
// fetchEntitySourceHash:32-39 → SELECT description_hash FROM products
...
// translationStatus.ts:134-138
const staleCount = translations.filter(
  tr => (tr.status === "manual" || tr.status === "overridden") &&
        tr.source_hash !== sourceHash        // sourceHash = description_hash COLONNA
).length;
```
`staleCount` = 0 perché, rispetto a quella colonna, la riga manuale Français **non** risulta disallineata: `FR.source_hash === description_hash`. La tab invece la vede stale perché confronta contro un riferimento diverso (hash del testo **live**).

Scope: `staleCount` considera solo `field === "description"` (il `field` passato), e solo righe `status ∈ {manual, overridden}` (le auto stale non contano — coerente: le auto indietro diventano `pending`).

### B) Quale ramo sopprime l'ambra?

**Nessuno.** Il blocco stale è **additivo**, non in `else`:
```tsx
{allDone && <neutral/>}
{hasStale && <ambra/>}     // mostrato in parallelo, non soppresso
{hasPending && <pending/>}
{hasError && <error/>}
```
e `allDone` esclude già `hasStale`. Quindi se `staleCount > 0` l'ambra **comparirebbe** e il neutro **sparirebbe**. Il problema **non** è il rendering né un ramo `pending` che intercetta: è a monte, nel **valore** di `staleCount` (=0).

### C) Stessa causa con auto pending e con auto finiti?

**Sì, è un problema di conteggio, non di soppressione pending.** La riga manuale Français **non genera mai un job pending** (le manuali sono escluse dall'enqueue), quindi il ramo `pending` non c'entra con essa. Che gli auto siano in corso o finiti, `staleCount` dipende solo dal confronto `FR.source_hash` vs `description_hash`. Il caso osservato ("auto finiti, FR ancora Da rivedere, badge neutro") conferma: è il **riferimento di confronto** a essere sbagliato/disallineato, non la fase dei job.

### D) Divergenza esatta vs la tab (una riga)

| | Riferimento del confronto stale |
|---|---|
| **Tab** (`TranslationsTab.tsx`) | `translation.source_hash !== currentSourceHash`, con `currentSourceHash = computeFieldHash(effectiveSource)` → **hash del testo italiano LIVE** |
| **Badge** (`translationStatus.ts:134-138`) | `tr.source_hash !== sourceHash`, con `sourceHash = products.description_hash` → **colonna persistita** |

La tab ricalcola l'hash dal testo mostrato ad ogni `loadData`; il badge si fida della colonna `description_hash`. Quando la colonna **non coincide** con `computeFieldHash(descrizione corrente)`, il badge confronta la riga manuale contro il riferimento sbagliato → `FR.source_hash === description_hash` → non conta come stale.

> Nota: la RPC ufficiale `get_stale_translations` (Lingue, validata) usa **lo stesso** riferimento-colonna (`20260623130000:139` fresh quando `t.source_hash = u.source_hash` con `u.source_hash = p.description_hash`). Quindi badge **e** Lingue condividono la fonte-colonna; **solo la tab** ricalcola da live ed è immune. È per questo che la divergenza si vede tra tab e Scheda.

---

## Causa radice (una frase)

Il badge Scheda misura lo stale confrontando `translations.source_hash` con la **colonna `products.description_hash`**, mentre la tab lo confronta con l'hash **ricalcolato dal testo italiano live** (`computeFieldHash`); quando `description_hash` non riflette la descrizione corrente, il manuale indietro non viene contato e `staleCount` resta 0 → badge neutro.

(Perché la colonna può non riflettere il live: `computeFieldHash` è deterministico — `sha256(lower(trim(text)))` — e `updateProduct` la riscrive ad ogni edit (`products.ts:447-451`). Quindi nei flussi normali colonna e live coincidono. La divergenza emerge se la descrizione è stata cambiata da un percorso che aggiorna `products.description` **senza** ricalcolare `description_hash` — es. import/bulk/edit non passato per `updateProduct` — lasciando la colonna indietro. La tab non se ne accorge perché non legge la colonna.)

---

## Fix minimale proposto (NON applicato)

**Allineare il riferimento del badge a quello della tab** — è la via meno invasiva e rende il badge coerente con ciò che l'utente vede:

- Far calcolare al chiamante l'hash dal testo live (come fa la tab: `computeFieldHash(product.description)`) e passarlo a `getFieldTranslationStatus` come **override del riferimento**, usato al posto di `fetchEntitySourceHash`/`description_hash` per i confronti `doneCount`/`staleCount`. In pratica: nuovo parametro opzionale `currentSourceHash?: string` su `getFieldTranslationStatus`; se presente, `sourceHash = currentSourceHash`. `TranslationStatusBadge` riceve già `entityId/field`; basta che `SchedaTab` gli passi la `description` live (ha già `product.description` nel `refreshKey`) e il badge la hashi una volta.

Effetto: il badge confronta contro l'hash del testo live → `FR.source_hash !== hash(live)` → `staleCount = 1` → ambra "1 da rivedere", identico alla tab.

**Alternativa più ampia (non consigliata ora)**: garantire che `description_hash` sia sempre sincronizzata in ogni percorso di scrittura (sistemerebbe anche Lingue/coverage che usano la colonna), ma è più invasiva e tocca più di un file/flow. Per il bug puntuale Scheda↔tab, l'allineamento del riferimento del badge è sufficiente.

Render e `staleCount` (per dati freschi) restano corretti: l'unico cambio necessario è la **fonte del riferimento di confronto**.
