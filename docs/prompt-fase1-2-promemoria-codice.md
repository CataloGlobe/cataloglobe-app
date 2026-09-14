# FASE 1.2 — Promemoria affidabile e osservabile

Le colonne e la tabella della 1.1 sono già applicate su staging.
**Nessun commit, nessun `git add`.** Working tree condiviso con sessioni parallele
sulla stampa delle comande: non toccarlo.

## Il fatto da correggere

Il 09/09 la funzione ha trovato un candidato, ha tentato il claim atomico
(`UPDATE ... WHERE reminder_sent_at IS NULL`) e ha ricevuto un `504 Gateway Timeout`
dal gateway PostgREST. Il ramo `if (claimError)` ha incrementato `failed` ed è passato
oltre. Nessun ritentativo, cron una volta al giorno, promemoria perso per sempre. Gli
unici `skipped_*` erano tutti a zero: nessun filtro aveva scartato la riga.

## Il principio che regge tutta la correzione

**Il claim è idempotente, quindi ritentare è sicuro.** Se il PATCH andato in timeout
fosse in realtà arrivato a destinazione, un secondo tentativo troverebbe
`reminder_sent_at` valorizzato e non rivendicherebbe nulla. Se non fosse arrivato,
rivendica e manda. In nessuno dei due casi si può inviare due volte.

È la proprietà che la migration del 29/08 aveva già costruito e che nessuno stava
sfruttando.

## Prima di scrivere

Leggi la funzione **come è deployata**, non come sta in `HEAD`: `git show 413db373` è
il commit corrispondente alla versione 8 in esecuzione. Poi guarda le differenze con
`HEAD` — sono due commit di lingua, che vanno comunque ridistribuiti.

Guarda anche `_shared/sendReservationReminders.test.ts`: la suite esistente va estesa,
non riscritta.

---

## 1. Ritentativo del claim

Nella funzione `send-reservation-reminders`:

- Il claim ritenta fino a **3 tentativi**, con backoff breve (es. 200ms, 600ms).
- **Ritenta solo gli errori di trasporto**: timeout, 5xx, errori di rete. Un errore
  applicativo di PostgREST (permessi, colonna inesistente, payload malformato) non è
  transitorio e ritentarlo è solo tempo perso: fallisce subito.
- **Zero righe restituite NON è un errore.** Significa che la riga è già stata
  rivendicata — dal tentativo precedente, o da un'altra passata. Si salta in silenzio
  e non si conta come `failed`. Sbagliare questo punto è il modo più facile di
  trasformare la correzione in un doppio invio contato come successo.

Su fallimento definitivo del claim, **best-effort e mai bloccante**, scrivi sulla riga:
`reminder_attempts = reminder_attempts + 1`, `reminder_failed_at = now()`,
`reminder_last_error = <messaggio>`. Se anche questa scrittura fallisce, si prosegue:
la diagnostica non deve mai far cadere la passata.

## 2. Fallimento dell'invio dopo il claim

Resta una perdita, non un doppione: è una scelta deliberata e **non va cambiata**.
Ma ora si registra. Stessa terna di colonne, stesso best-effort.

Attenzione a cosa significa lo stato risultante: `reminder_sent_at` valorizzato **e**
`reminder_failed_at` valorizzato = "rivendicata ma non consegnata". La UI deve saperlo
dire, vedi punto 5. Non tentare di annullare il claim.

## 3. Il registro delle esecuzioni

`reservation_reminder_runs`, scritta con `service_role`.

- **INSERT all'inizio** della passata, con `target_date`, `trigger_source`,
  `started_at`. Non alla fine: una passata che va in crash a metà deve lasciare una
  traccia con `finished_at` NULL, ed è proprio il caso che vogliamo vedere.
- **UPDATE alla fine** con `finished_at`, `candidates`, `sent`, `failed`, `skipped`
  (jsonb per motivo), `errors` (jsonb).
- `trigger_source`: `'cron'` se il body della richiesta contiene `{"source":"cron"}`,
  altrimenti `'manual'`. Il caso ambiguo va su `manual` di proposito — è
  l'invocazione a mano quella che si fa di fretta e senza dichiararsi.
- **`errors` non deve MAI contenere email o numeri di telefono.** Solo
  `reservation_id` e messaggio, e al massimo i primi 20. Il `reservation_id` basta a
  risalire al resto. La diagnosi della 0-bis ci ha appena mostrato quanta gente legge
  i log.
- Tetto anche sulla dimensione: se `skipped` o `errors` crescono oltre il ragionevole,
  tronca e dillo dentro il jsonb.

Nota transitoria: finché il cron non è aggiornato (punto 4), le passate automatiche
si registreranno come `manual`. È corretto e si sistema da solo al push.

## 4. Tre occasioni invece di una — migration, da creare e fermarsi

File nuovo, `unschedule` + `cron.schedule` sul modello di
`20260829120001_reservation_reminders_cron.sql`.

- Schedula a `'0 16,17,18,19 * * *'`.
- Guardia: passa se l'ora di Roma è **18, 19 o 20** (invece della sola 18). Le quattro
  ore UTC coprono l'unione di CET e CEST; ne passano esattamente tre al giorno tutto
  l'anno.
- Body `'{"source":"cron"}'::jsonb`.
- Il commento in testa deve spiegare **perché tre passate non producono doppioni**:
  è l'idempotenza del claim, non un caso fortunato. Chi legge fra sei mesi deve poterlo
  capire senza ricostruirlo.

Effetto collaterale voluto: una prenotazione confermata alle 19:30 per domani riceve il
promemoria alle 20 invece di non riceverlo affatto.

**Crea il file e fermati lì per quello: `db push` lo faccio io.** Il codice dei punti
1-3 e 5 invece completalo.

## 5. Lo stato visibile sulla prenotazione

Nel drawer di dettaglio (`ReservationDetailDrawer`), accanto alla conferma del cliente
che c'è già. Cinque casi, e ognuno deve dire una cosa diversa:

- **inviato** — `reminder_sent_at` valorizzato, nessun fallimento.
- **rivendicato ma non consegnato** — entrambi valorizzati. È il caso raro e va detto
  in chiaro, non nascosto sotto "inviato".
- **non inviato** — `reminder_failed_at` valorizzato, `reminder_sent_at` NULL, con il
  motivo.
- **in attesa** — è candidata ma l'ora non è ancora arrivata.
- **non previsto** — la sede ha il promemoria disattivato, o lo stato non è
  `confirmed`, o la data è passata senza che fosse candidata.

Nessun colore d'allarme sui casi normali: il colore segnala solo l'eccezione, e
"in attesa" e "non previsto" non sono eccezioni.

I testi italiani **me li fai rivedere prima del commit**.

Aggiorna `V2Reservation` in `src/types/reservation.ts` con le tre colonne, commentando
cosa significa il NULL di ciascuna come per le colonne esistenti.

## 6. Test

Estendi `_shared/sendReservationReminders.test.ts`:

- il classificatore degli errori: quali ritenta e quali no;
- zero righe dal claim → salto silenzioso, **non** `failed`;
- claim che fallisce due volte e riesce alla terza → un solo invio;
- fallimento dopo il claim → `sent` non incrementato, riga marcata, nessun secondo
  invio;
- forma del riepilogo scritto nel registro, incluso il fatto che `errors` non contenga
  email né telefoni.

## Chiusura

`npm run test` verde e `tsc` pulito prima di dirmi che è finita.

Poi elenca: file toccati, la migration creata e non applicata, e **le tre Edge Function
da ridistribuire** — `send-reservation-reminders`, `respond-reservation`,
`cancel-reservation-public` — che sono vecchie rispetto al repo per
`_shared/emailLang.ts`.

Nessun commit. I testi italiani li rivedo io.
