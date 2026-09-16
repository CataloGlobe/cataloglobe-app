# La tavolata — documento di modello

Decisioni da prendere prima di scrivere codice. Nessuna implementazione qui.
Base: ricognizione in sola lettura del dominio ordini, 10/09.

---

## 1. `order_groups` non è la tavolata

Verificato, non supposto:

```sql
CREATE TABLE public.order_groups (
  ...
  table_id uuid NOT NULL REFERENCES public.tables(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at timestamptz,
  ...
);
CREATE INDEX idx_order_groups_open ON public.order_groups (table_id, status)
  WHERE status = 'open';
```

Un tavolo solo, obbligatorio. Gli indici lo dicono anche nei commenti: *"which group
is currently open on this table?"* e, su `customer_sessions.order_group_id`,
*"members of a shared bill"*.

Quindi `order_groups` è **il conto aperto su un tavolo**, condiviso fra i commensali di
quel tavolo. Risolve "quattro persone allo stesso tavolo, un conto solo". Non risolve
"una tavolata su due tavoli". Copre metà del concetto, e la metà che non copre è
esattamente quella che ci serve.

Ha però la forma giusta: ciclo aperto → chiuso, aggrega sessioni, aggrega ordini. Non
va buttato, va messo sotto qualcosa.

## 2. Perché la tavolata è un'entità a sé, e non un `order_groups` generalizzato

La strada più economica sarebbe togliere il vincolo su `table_id` e trasformare
`order_groups` in N:N sui tavoli. La scarto per un motivo che vale più del risparmio:

**Una tavolata deve esistere anche dove nessuno ordina dal QR.** Un ristorante che usa
le prenotazioni e stampa i menù non apre mai un `order_group`, ma ha comunque bisogno
di "arrivato", "seduto", "tavolo occupato fino alle 22", "servizio concluso". Se
l'unità operativa vive dentro il dominio ordini, tutta la vista di sala dipende da un
modulo che quel cliente non ha comprato.

Quindi: **la tavolata è l'unità di sala; il conto è ciò che la tavolata produce se il
locale usa gli ordini.**

## 3. Il modello

**`seatings`** — la tavolata.
Un gruppo di persone che occupa uno o più tavoli in una finestra di tempo.
`tenant_id`, `activity_id`, `party_size`, `opened_at`, `closed_at`, `status`
(`aperta` | `chiusa`), `opened_by_user_id`.

**`seating_tables`** — i tavoli realmente occupati. N:N.
È il **fatto**. `reservation_tables` resta il **piano**: la proposta del motore o la
decisione dell'operatore *prima* del servizio. All'arrivo la tavolata eredita i tavoli
pianificati, e da quel momento l'occupazione si legge da qui.

Tenerli separati non è pignoleria: sono due domande diverse — "dove pensavamo di
metterli" e "dove sono" — e il giorno che divergono (arrivano in sei invece che in
quattro) serve poterlo dire.

**`seating_reservations`** — le prenotazioni che quella tavolata onora. N:N, opzionale.
Vedi decisione D2.

**`order_groups`** — acquisisce `seating_id`. Un conto aperto per tavolata.
`table_id` smette di essere il padrone e diventa storico.

**`customer_sessions.current_table_id`** resta: dice quale QR ha scansionato il
commensale, che è un'informazione di servizio utile. Ma la sessione entra nel conto
**della tavolata**, non del tavolo — ed è qui che il conto spezzato si ricompone.

**`orders.table_id`** resta obbligatorio e non si tocca. La comanda in cucina vuole
sapere il tavolo, anche dentro una tavolata unita.

> **La tavolata unifica il conto, non il servizio.**

**`reservations.status`**: `seated` e `completed` restano nella colonna per le
analitiche, ma **li scrive il ciclo della tavolata**. La sorgente di verità è la
tavolata; la prenotazione la rispecchia. Altrimenti abbiamo due stati che possono
divergere e nessun modo di sapere quale ha ragione.

## 4. Le decisioni

Ognuna con la mia raccomandazione. Se non obietti, procedo così.

**D1 — Una tavolata può cambiare tavoli durante il servizio?**
Sì: si spostano, arriva gente, si accosta un tavolo in più.
*Raccomandazione*: sì, sostituendo le righe di `seating_tables` senza storico nella
prima versione. Lo storico degli spostamenti è un'analitica, non un requisito di sala,
e si aggiunge dopo senza rifare nulla.

**D2 — Due prenotazioni distinte possono formare una sola tavolata?**
Due coppie che si conoscono, un tavolone.
*Raccomandazione*: sì, e questa è **l'unica decisione cara da rimandare**. Un
`reservation_id` singolo su `seatings` costa zero oggi e una migration dolorosa dopo;
la tabella N:N costa mezza giornata adesso. La farei subito anche se l'interfaccia per
usarla arriva più tardi.

**D3 — Il conto è sempre uno per tavolata?**
*Raccomandazione*: sì di default, uno per tavolata. La separazione del conto ("noi
paghiamo a parte") è una funzione vera ma è un'altra cosa, e va progettata quando ci
arriviamo — non anticipata con un modello ambiguo adesso.

**D4 — Chi apre una tavolata?**
*Raccomandazione*: entrambi. L'operatore con "arrivato" sulla prenotazione; e il
cliente che scansiona un QR dove non c'è nessuna tavolata aperta ne apre una implicita,
di un tavolo solo. Senza questo, il walk-in che ordina dal QR smette di funzionare — ed
è metà dei coperti di un locale.

**D5 — Chi chiude una tavolata?**
Oggi esiste `close_table_with_resolution`, che chiude gli ordini aperti, i gruppi e le
sessioni di un tavolo.
*Raccomandazione*: diventa la chiusura della **tavolata**, che a cascata libera tutti i
suoi tavoli. La logica di risoluzione degli ordini pendenti c'è già e non va riscritta,
va solo cambiato il perimetro da tavolo a tavolata.

**D6 — Cosa succede alle tavolate aperte a fine serata?**
Nessuno preme "libera tavolo" alle due di notte, sempre.
*Raccomandazione*: chiusura automatica a fine giornata operativa, usando
`get_operative_day_bounds` che esiste già nel dominio scheduling. Con una traccia di
"chiusa automaticamente", perché una tavolata chiusa dal sistema e una chiusa
dall'operatore non sono lo stesso dato.

## 5. L'ordine del lavoro, rivisto

La tavolata sale da fase finale a fondamenta. Tutto ciò che riguarda il servizio ci si
appoggia sopra, e va costruito dopo di lei — non prima e poi riadattato.

**BLOCCO 0 — Igiene.** Indipendente da tutto, si fa subito e in parallelo.
Diagnosi del promemoria · promemoria affidabile e osservabile · dry-run della retention ·
allineamento dei deploy delle Edge Function (il disallineamento su `_shared/` va chiuso
prima di costruirci sopra, non dopo).

**BLOCCO 1 — Il modello.** Questo documento più le sei decisioni. Nessun codice.

**BLOCCO 2 — La tavolata.** Entità, ciclo di vita, migrazione dell'assegnazione tavoli
dal piano al fatto. "Arrivato", "seduto", "concluso" costruiti sulla tavolata. Vista di
servizio: la schermata che l'host tiene aperta all'ingresso.

**BLOCCO 3 — L'aggancio QR.** Sessioni e conto sulla tavolata invece che sul tavolo.
Il QR del tavolo 5 accostato al 4 risolve alla stessa tavolata e allo stesso conto.
La prenotazione diventa tavolata all'arrivo.

**BLOCCO 4 — Canale e configurazione.** Fasce di servizio (`reservation_shifts`) con
dentro preavviso minimo, coperti massimi e orizzonte. Email di modifica, `.ics`
coerente con `SEQUENCE` e `STATUS:CANCELLED`, validazione degli orari di apertura in
`place_online_reservation` — scritta una volta sola, nella forma definitiva.

**BLOCCO 5 — Rifinitura operativa.** Ricerca per nome e telefono. Nota interna del
locale. Chiusura dei no-show. Storico ed export. Blocco manuale di uno slot.

**In parallelo, senza sviluppo.** Nomina a responsabile del trattamento verso il
ristoratore. Sezione Prenotazioni in `CLAUDE.md`. La capienza a NULL su sei sedi su
otto, che è un problema di onboarding.

---

## 6. Cosa resta da guardare prima del BLOCCO 2

Due cose che non ho verificato e che il primo prompt di implementazione deve chiudere,
in ricognizione:

- **`v_tables_with_state`** — la view che alimenta la vista tavoli oggi. Deriva lo
  stato dal tavolo; con la tavolata deve derivarlo dalla tavolata. Quanto è invasivo.
- **`resolve-table`** e il JWT del cliente — la sessione porta `current_table_id`.
  Se il conto passa alla tavolata, va deciso se il token cambia forma o se basta la
  risoluzione lato server. Il token è firmato con `CUSTOMER_JWT_SECRET` e cambiarne il
  contenuto invalida le sessioni in corso: va saputo prima, non scoperto in produzione.
