# BLOCCO 2 · FASE 2.2 — Il ciclo di vita della tavolata

Lo schema della 2.1 è applicato su staging: `seatings`, `seating_tables`,
`seating_reservations`, `order_groups.seating_id`.

**Crei le migration e ti fermi.** Non eseguirle: `db push` lo faccio io.
Nessun commit, nessun `git add`. Working tree condiviso con sessioni parallele.

## Cosa si costruisce qui

Le quattro operazioni che fanno vivere una tavolata, e lo specchio che tengono sulla
prenotazione. **Nessuna UI** (arriva nella 2.3) e **nessun contatto con il dominio
ordini** (arriva nel BLOCCO 3): questa fase è additiva e non cambia il comportamento di
nulla che esista già.

## Il principio

**La tavolata è la sorgente di verità dell'occupazione; la prenotazione la
rispecchia.** `reservations.seated_at` e `completed_at` esistono dal 15 giugno e non li
scrive nessuno: da qui in poi li scrive il ciclo della tavolata, mai la mano
dell'operatore per conto proprio. Due stati che possono divergere senza che si sappia
quale ha ragione sono peggio di uno stato solo.

## Prima di scrivere

Modello per le RPC: `20260907170000_set_reservation_tables.sql` e le sue compagne
(`..._revoke_public_anon`, `..._revoke_service_role`, `..._grant_authenticated`).
Stesso stile: `SECURITY DEFINER`, gate interno
`has_permission('<perm>', activity_id)`, `42501` unico per "non esiste" e "non
autorizzato", `22023` per input non valido.

**Vincolo di forma**: una migration che contiene `CREATE FUNCTION` insieme a
`GRANT`/`REVOKE` fallisce con 42601 su `db push`. Un file per funzione, file separati
per revoche e grant, come nelle migration del 7 settembre.

Verifica anche una cosa prima di procedere: il trigger
`assign_tables_for_reservation` scatta su INSERT e su cambio di data/ora/coperti.
**Non deve scattare su un cambio di solo `status`.** Se scattasse, mettere una
prenotazione a `seated` rifarebbe la proposta tavoli — e la proposta non c'entra più
niente una volta che la gente è seduta. Se il trigger è più largo di così, fermati e
dimmelo prima di scrivere altro.

---

## Le quattro RPC

### 1. `open_seating_for_reservation(p_reservation_id uuid)`

L'ospite è arrivato.

- Crea la tavolata su `(tenant_id, activity_id)` della prenotazione, `status='open'`,
  `party_size` = quello della prenotazione, `opened_by_user_id` dal default `auth.uid()`.
- **Eredita i tavoli pianificati**: copia in `seating_tables` i `table_id` presenti in
  `reservation_tables` per quella prenotazione. Se non ce n'è nessuno (il motore non
  ha trovato niente, o è una sede senza tavoli) la tavolata nasce **senza tavoli** e
  non è un errore: l'host li assegnerà con la RPC 3. Una tavolata senza tavoli è un
  fatto normale in un locale che non gestisce la sala nel sistema.
- Collega la prenotazione via `seating_reservations`.
- Porta la prenotazione a `status='seated'` e valorizza `seated_at`.
- Ammessa **solo** da `confirmed`. Da `pending` no: non si fa sedere qualcuno la cui
  richiesta il locale non ha ancora accettato — e se è arrivato lo stesso, l'host
  conferma prima, che è un gesto che già esiste.
- **Idempotente**: se la prenotazione ha già una tavolata aperta, restituisce quella
  senza crearne una seconda. Due tavolate per la stessa prenotazione sono un dato
  rotto, e il doppio clic esiste.
- Ritorna la riga di `seatings`.
- Errori: `42501` (inesistente / non autorizzata), `22023` (stato non ammesso, con il
  motivo).

### 2. `open_walkin_seating(p_activity_id uuid, p_table_ids uuid[], p_party_size int)`

Arriva gente senza prenotazione. È metà dei coperti di un locale, non un caso di bordo.

- Crea la tavolata senza alcun collegamento a prenotazioni.
- `p_table_ids` può essere vuoto (si siedono e il tavolo si decide dopo).
- `p_party_size` può essere NULL.
- Verifica che i tavoli appartengano alla sede — ma **non** che siano liberi: la doppia
  occupazione si mostra, non si impedisce.

### 3. `set_seating_tables(p_seating_id uuid, p_table_ids uuid[])`

Sostituisce i tavoli occupati. Serve sia ad assegnarli la prima volta sia a spostare la
tavolata durante il servizio.

- Sostituzione secca, senza storico degli spostamenti: lo storico è un'analitica e si
  aggiunge dopo senza rifare niente.
- Array vuoto ammesso (una tavolata può restare senza tavoli).
- Solo su tavolata `open`. Su una chiusa → `22023`.
- Nessuna verifica di libertà dei tavoli.

### 4. `close_seating(p_seating_id uuid, p_reason text)`

Il servizio è finito.

- `status='closed'`, `closed_at=now()`, `closed_reason` = `'operator'` o `'auto'`.
- Le righe di `seating_tables` **non si cancellano**: l'occupazione si deriva
  dallo stato della tavolata, esattamente come `reservation_tables` non si cancella al
  cambio di stato della prenotazione. Stessa regola, stesso motivo — lo storico di chi
  sedeva dove va conservato.
- Le prenotazioni collegate che sono in `seated` passano a `completed` con
  `completed_at`. Quelle in altri stati si lasciano stare.
- Idempotente: chiudere una tavolata già chiusa non è un errore e non sposta i
  timestamp.
- **Non tocca ordini né conti**: `order_groups.seating_id` esiste ma nessuno lo scrive
  ancora. Il collegamento è roba del BLOCCO 3.

---

## Il ritorno indietro

Serve una quinta operazione, e va detta esplicitamente perché è la più facile da
dimenticare: **l'host che preme "arrivato" sul nome sbagliato.**

### 5. `undo_seating(p_seating_id uuid)`

- Solo su tavolata `open` **e senza conti collegati** (in questa fase la condizione è
  banalmente vera, ma scrivila lo stesso: nel BLOCCO 3 diventerà la guardia vera).
- Cancella la tavolata e le sue righe ponte — qui sì, perché non è mai esistita
  davvero: è un errore di battitura, non un fatto di sala.
- Riporta le prenotazioni collegate da `seated` a `confirmed`, azzerando `seated_at`.

La differenza fra `undo_seating` e `close_seating` è quella fra "non è successo" e "è
finito", e le due cose non vanno mai collassate in un bottone solo.

---

## Effetti sulla matrice delle transizioni

`_shared/reservationTransitions.ts` va aggiornato, ma **con attenzione**: le azioni di
`respond-reservation` non devono acquisire `seated`.

- `cancel` e `mark_no_show` restano ammessi **solo da `confirmed`**, non da `seated`.
  Annullare o marcare come assente qualcuno che è seduto al tavolo non ha senso, e
  lasciarlo passare significa dati che si contraddicono.
- `seated` e `completed` **non entrano** in `ACTION_TO_STATUS`: non sono azioni
  dell'endpoint admin, sono conseguenze del ciclo della tavolata.
- Il commento in testa al file oggi dice che `seated` e `completed` non hanno
  scrittore. Da adesso ce l'hanno, ed è il ciclo della tavolata: aggiornalo, perché
  quel commento è la prima cosa che legge chi arriva dopo.

Aggiungi i test corrispondenti alla suite esistente.

---

## Vincoli

- Migration nuove, mai modificare le esistenti.
- Un file per funzione; revoke e grant in file propri.
- Gate `has_permission('seatings.manage', activity_id)` su tutte e cinque.
- `REVOKE` da `public`, `anon` e `service_role`; `GRANT` solo ad `authenticated`.
- Nessun service layer TypeScript, nessuna UI, nessun tocco al dominio ordini.
- Non rigenerare `database.types.ts`.

## Chiusura

Elenca i file creati con una riga a testa, più le modifiche a
`reservationTransitions.ts` e ai test, e **fermati**. Non applicare, non passare alla
2.3.

Se durante la scrittura emerge che una delle cinque operazioni ha bisogno di una
decisione di prodotto che qui non è scritta, **fermati e chiedi** invece di sceglierla:
le decisioni si prendono prima, mai durante.
