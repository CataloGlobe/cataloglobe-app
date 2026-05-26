# Delete drawer patterns

Le entità con delete drawer in CataloGlobe seguono UNO di 3 pattern, scelto in base alla **sostituibilità semantica** dell'entità. Non esiste un pattern univoco.

| Caratteristica entità | Esempio | FK su altre tabelle | Pattern delete |
|---|---|---|---|
| Unica, irripetibile (rifare la regola da zero ha senso) | Catalogo | NO ACTION/RESTRICT | **Blocco preventivo** |
| Editoriale, eliminabile senza perdita strutturale | Featured content, Prodotto | CASCADE | **Informativo + cleanup** |
| Sostituibile, intercambiabile (skin/preset) | Stile | NO ACTION/RESTRICT | **Swap-then-delete** |

## Pattern A: Blocco preventivo

- **Quando**: FK NO ACTION/RESTRICT verso scheduling, l'entità è semanticamente unica
- **Esempio file**: `src/pages/Dashboard/Catalogs/CatalogDeleteDrawer.tsx`
- **Contratto drawer**: carica all'apertura `listSchedulesUsing<Entità>()`, mostra banner `warning` se >0 regole attive/programmate (`info` se solo disabilitate/scadute), pillole stato derivate da `enabled + start_at + end_at` (`active|scheduled|expired|disabled`), link diretto a detail regola (`/business/:businessId/scheduling/:ruleId`), bottone "Elimina" disabled finché esiste QUALSIASI regola collegata (non solo attive — anche disabilitate o scadute bloccano)
- **Contratto service**: `deleteX(id, tenantId)` può fallire con `23503` se race condition tra fetch usage e delete; usare `isPostgrestFKError(err)` per gestire il caso e ricaricare l'usage
- **UX rationale**: l'utente DEVE risolvere le regole prima del delete. Non può "passare avanti".

## Pattern B: Informativo + cleanup automatico

- **Quando**: FK CASCADE complete, l'entità sparisce senza side-effect strutturali
- **Esempi file**: `src/pages/Dashboard/Highlights/FeaturedContentDeleteDrawer.tsx`, `src/pages/Dashboard/Products/ProductDeleteDrawer.tsx`
- **Contratto drawer**: carica all'apertura `count<Entità>DeleteImpact()`, mostra sezione condizionale "Questo X è utilizzato in: N catalogo, M contenuti..." (solo se almeno una count >0), bottone "Conferma Eliminazione" sempre attivo
- **Contratto service**: `deleteX(id, tenantId)` esegue snapshot pre-DELETE di entità polimorfiche/storage, DELETE (CASCADE pulisce le righe figlie automaticamente), poi cleanup esterni (storage best-effort, translations polimorfiche). Se la cancellazione lascia regole vuote (es. featured con 0 contenuti), `auto-disable` con `enabled=false`. Il return type varia per dominio: featured ritorna `{ schedules_disabled: number }` per toast informativo proporzionato, product ritorna `void` (no auto-disable applicato)
- **UX rationale**: l'utente è informato dell'impatto ma non è bloccato. Il sistema fa il cleanup giusto in autonomia.

## Pattern C: Swap-then-delete

- **Quando**: l'entità è semanticamente sostituibile (skin/preset), e cancellarla lasciando le regole "rotte" sarebbe peggio dell'attrito di chiedere un replacement
- **Esempio file**: `src/pages/Dashboard/Styles/StyleDeleteDrawer.tsx`
- **Contratto drawer**: carica all'apertura `listSchedulesUsing<Entità>()` (skip se `usage_count === 0`), mostra Select replacement obbligatorio se `isUsed`, lista regole impattate (informativa, non bloccante), bottone "Conferma Eliminazione" disabled finché replacement non scelto. Caso speciale: se entità è `is_system` (es. stile predefinito tenant) → blocco totale con messaggio dedicato, niente replacement
- **Contratto service**: `deleteX(id, tenantId, replacementId?)` esegue se necessario `UPDATE schedule_layout SET x_id=replacementId` prima del DELETE. CASCADE su tabelle figlie (es. `style_versions`). Race condition teorica accettata (insert tra SELECT e UPDATE/DELETE)
- **UX rationale**: l'utente non è bloccato e non perde regole. Sceglie come riassegnare in un colpo solo.

## Quando applicare quale pattern: regola pratica

1. **Esamina le FK inbound sull'entità** (via MCP `list_tables` o `information_schema`).
2. **Tutte CASCADE → Pattern B**.
3. **Almeno una NO ACTION/RESTRICT** + entità unica → **Pattern A**.
4. **Almeno una NO ACTION/RESTRICT** + entità sostituibile (puoi semanticamente swappare con un'altra istanza) → **Pattern C**.

Se hai dubbi: il default sicuro è **Pattern B** (cleanup automatico), perché informa senza bloccare. Solo se l'entità è SEMPRE strettamente unica e l'utente vorrebbe ripensare la regola, vale Pattern A.

## Anti-pattern noti

- **NON** usare Pattern A per entità sostituibili — è UX inferiore (es. usare blocco per Style sarebbe attrito artificiale).
- **NON** usare Pattern B se le FK sono NO ACTION (causerà `23503` silente in produzione, drawer informativo che mostra count ma non blocca → DELETE fallisce con errore generico).
- **NON** usare Pattern C per entità non sostituibili — è semanticamente sbagliato chiedere "scegli un altro Catalogo per le regole" perché ogni Catalogo è un set unico.
