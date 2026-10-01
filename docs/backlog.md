# Backlog — bug e debiti da fare

Bug e debiti trovati durante altri lavori, da prendere in un lotto a sé. Non sono fix in corso. Quando uno viene fatto, si toglie da qui con riferimento al commit.

## Test e2e

### E2E contro Supabase locale invece di staging — priorità alta

- **Cosa:** E2E contro Supabase locale (`supabase start`) invece di staging. Priorità alta dopo l'incidente Disk IO del 01/10.
- **Perché:** il 30/09–01/10 suite complete ripetute da più sessioni (451 test, 25–37 richieste per apertura di pagina) hanno esaurito il Disk IO di staging. Nel frattempo vale `scripts/e2e.sh` (branch `chore/e2e-guard`): una run alla volta, solo spec singole, `--workers=1`.

## Pagina pubblica — ordini dal tavolo

Trovati il 01/10/2026 durante il test manuale S7 del batch 2 sicurezza (staging, San Pietro, Tavolo 1).

### 1. Il toast di errore finisce sotto il carrello

- **Cosa succede:** con il carrello aperto (`PublicSheet`), un errore mostrato come toast resta dietro il pannello: il cliente non lo vede.
- **Causa:** `--z-toast: 50` (`src/styles/_theme.scss`) contro `z-index: 900` di `PublicSheet` (`src/components/PublicCollectionView/PublicSheet/PublicSheet.module.scss`, righe 6 e 32).
- **Da decidere:** alzare il toast sopra il foglio, oppure non usare toast dentro la pagina pubblica. `CollectionView` per `ORDERING_CLOSED` usa già un feedback inline, «no toast su questa pagina pubblica» (`CollectionView.tsx` ~1601): verificare quale percorso mostra ancora un toast.

### 2. Sede chiusa: il carrello lo scopre solo all'invio

- **Cosa succede:** fuori orario il cliente compone l'ordine, preme «Invia ordine» e solo allora riceve «Il locale è chiuso» da `submit-order` (`ORDERING_CLOSED`).
- **Atteso:** il carrello sa prima che la sede è chiusa, disabilita «Invia ordine» e lo dice inline: «Locale chiuso, ordini dalle …» con il prossimo orario di apertura.
- **Note:** la regola lato server resta com'è (è quella giusta e l'ultima parola la ha lei). Il controllo lato client usa gli stessi orari e chiusure (`activity_hours`, `activity_closures`) che legge `submit-order` (~riga 580). Attenzione alla regola orari duplicata già esistente per le prenotazioni (tre file `⚠️ SYNC`): non aggiungerne una quarta copia, valutare un modulo condiviso.

### 3. Etichetta delle opzioni nel carrello senza spazio

- **Cosa succede:** «Bottiglia+ Media» invece di «Bottiglia + Media».
- **Causa:** in `OrderingSheet.tsx` (~riga 389) il formato e i supplementi sono due `<span>` affiancati senza spazio né `gap`; i supplementi sono resi come `+ ${a.name}`.
- **Fix probabile:** `gap` su `.itemMeta` oppure separatore esplicito tra formato e supplementi.

## Debito tecnico

### `deno check` di `submit-order` fallisce (TS2345)

- **Errore:** `_shared/customerJwt.ts:90`, `Argument of type 'CustomerJwtPayload' is not assignable to parameter of type 'Payload'. Index signature for type 'string' is missing in type 'CustomerJwtPayload'.` (djwt v3.0.2, `create(...)`).
- **Stato:** presente da prima del batch 2 (file fermo al 21/07/2026, identico su origin/main). Il deploy non fa type check, quindi la funzione gira; blocca però il passo `deno check` dei runbook.
- **Fix probabile:** index signature su `CustomerJwtPayload` o cast al tipo `Payload` di djwt nel punto della firma.
