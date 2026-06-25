# FASE 1-bis (read-only) — `description_hash` è davvero indietro?

> Verifica DB su staging per decidere: fix badge cosmetico vs sync colonna.
> Tenant San Pietro `bbf43337-…`, prodotto **Parmigiana di Melanzane** (`842859e2-c35f-434e-8eca-c94da0b6a265`).
> Solo lettura. Data: 2026-06-25.

---

## Esito secco del gate

**`column_is_stale = FALSE`.** La colonna `description_hash` **coincide** con l'hash del testo live, e tutte le righe traduzione sono fresche. → **NON** è il caso "sync colonna". Il fix corretto **non** è sincronizzare la colonna (è già sincronizzata).

---

## Parte A — Dati DB

### A1/A2 — colonna vs testo live vs righe

| campo | valore |
|---|---|
| `description` | `Melanzane, salsa pomodoro, fiordilatte, Parmigiano Reggiano DOP, basilico, olio Evo` |
| `description_hash` (colonna) | `82315b21…f46d86bf` |
| `live_hash` = `sha256(lower(btrim(description)))` | `82315b21…f46d86bf` |
| **`col_matches_live`** | **TRUE** ✅ |

Righe `translations` (entity=product, field=description):

| lang | status | source_hash | `row_eq_col` |
|---|---|---|---|
| de | **auto** | `82315b…` | TRUE |
| en | **auto** | `82315b…` | TRUE |
| es | **auto** | `82315b…` | TRUE |
| fr | **auto** | `82315b…` | TRUE |

> **Non esiste alcuna riga `manual`/`overridden`** per questo prodotto/campo. Français è oggi **`auto`, fresca, allineata** alla colonna. La query A1 originale (join su `status='manual'`) non torna righe perché la riga manuale **non c'è più**.

La normalizzazione SQL (`lower(btrim(...))` + sha256, via `extensions.digest`) combacia con `computeFieldHash` TS (`sha256(text.trim().toLowerCase())`) — confermato dal match esatto `col = live = 82315b…`.

### A3 — job: la colonna segue gli edit

Storia `translation_jobs.source_hash` (DESC):

| created_at | hash | = col? |
|---|---|---|
| 18:11 (de/en/es/fr, done) | `82315b…` | **TRUE** |
| 17:34–17:36 (de/fr/en/es, done) | `c4932b…` | false |
| 17:15–17:19 (done) | `82315b…` | TRUE |

→ La descrizione è stata cambiata avanti/indietro (`82315b → c4932b → 82315b`). La **colonna segue sempre l'ultima versione** (ora `82315b`, = batch 18:11). Prova diretta che il percorso di scrittura **persiste** `description_hash` ad ogni edit. Nessun job pending residuo: tutti `done` al hash corrente.

---

## Parte B — Percorso di scrittura (codice)

`updateProduct` (`src/services/supabase/products.ts:447-451`):
```ts
if (descriptionInData) {                       // "description" in data
    updatePayload.description = data.description ?? null;
    descriptionHash = await computeFieldHash(data.description ?? null);
    (updatePayload as Record<string, unknown>).description_hash = descriptionHash;  // SEMPRE scritta
}
```
- La colonna è ricalcolata+scritta **ogni volta** che il payload include `description` — **non** condizionata ad altri campi.
- Editor inline tab (`handleSaveSource` → `updateProduct({ description })`) e textarea Scheda (`handleSaveInformation` → `updateProduct({ name, description })`): entrambi includono `description` → `descriptionInData=true` → colonna aggiornata.
- L'enqueue (`enqueueWithSilentError`) usa lo **stesso** `descriptionHash` locale; i job nascono col nuovo hash, che è anche quello scritto in colonna (confermato da A3: job 18:11 = col).

**Nessun percorso trovato che lasci `description_hash` indietro** nei flussi normali (inline/Scheda). Coerente con `col_matches_live=TRUE` e con la colonna che insegue ogni toggle del testo.

---

## Parte C — Impatto su Lingue

`get_stale_translations(...)` non eseguibile via MCP (`42501`: SECURITY DEFINER con guard `get_my_tenant_ids()`, il ruolo MCP non è membro). Replicata la sua classificazione manualmente: la RPC marca `fresh` quando `t.source_hash = description_hash` (col). Con i dati attuali (tutte le righe `source_hash = col`, nessun job pending) → **tutte fresh, zero stale** per questo prodotto. **Lingue NON è fuorviante oggi**: con colonna allineata, RPC e badge concordano col vero stato (tutto tradotto).

---

## Conclusione + raccomandazione FASE 2

### Cosa dice il DB
Allo stato attuale **non c'è alcuna discrepanza**: colonna = live, 4 righe auto fresche, nessun manuale, nessuno stale. Il badge neutro **"Tradotto in 4 lingue" è CORRETTO**. La riga Français manuale "Da rivedere" vista in FASE 1 **non esiste più**: è stata **revertita** (il job `fr` delle 18:11 è la ri-traduzione post-revert → FR ora `auto` fresca).

### Quindi il sintomo FASE 1 era transitorio
La divergenza "tab=Da rivedere / badge=neutro" era uno **snapshot a metà flusso**, non un disallineamento di colonna. Con colonna allineata (provato), il badge per una manuale **realmente** stale conterebbe `staleCount≥1` → ambra: non potrebbe restare neutro. Perciò il neutro osservato corrispondeva a uno stato in cui **la riga manuale non era (più) stale rispetto alla colonna** — cioè il **tab** mostrava un residuo "Da rivedere" non aggiornato (poll non ancora arrivato / revert in corso), mentre badge e DB erano già coerenti.

### Gate → raccomandazione
Per la regola del gate (`column_is_stale=false` → "riapri FASE 1 sul calcolo"):
- **Non** fare il fix di sync colonna: la colonna è già sincronizzata in ogni scrittura.
- **Non** serve nemmeno il band-aid badge-local: per i dati reali il badge calcola corretto.
- **Azione consigliata prima di toccare codice**: ri-osservare **live** ora (stesso prodotto). Atteso: tab e Scheda **entrambi** "Tradotto/Automatica", nessun "Da rivedere". Se il sintomo **non si ripresenta** → era transitorio, **nessun fix necessario**. Se **si ripresenta**, catturare lo snapshot DB **nell'istante esatto** (A1/A2) per vedere se in quel momento `col_matches_live=false` o se esiste una riga manuale con `source_hash ≠ col`: solo allora si decide tra sync-colonna e fix-calcolo.

### Nota collaterale (divergenza di predicato, non causa di questo sintomo)
`staleCount` del badge conta **solo** `manual`/`overridden` (`translationStatus.ts:134-138`), mentre tab e RPC marcano stale **qualunque** status (anche `auto`) quando `source_hash ≠ col` e nessun job pending. Caso limite reale: un `auto` rimasto indietro **senza** job pending (es. `enqueueWithSilentError` ha ingoiato un errore) → tab/RPC "Da rivedere", badge **non** lo conta (né stale né done) → badge mostrerebbe wrapper vuoto. Non è la causa del caso Parmigiana (era una manuale, ora revertita), ma è una reale incoerenza badge↔tab/RPC da tenere presente se in futuro emerge un auto-stale orfano di job.

**Decisione**: gate = colonna allineata → niente sync colonna; verificare se il sintomo è ancora riproducibile prima di qualsiasi fix.
