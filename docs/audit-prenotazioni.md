# Audit orizzontale — dominio Prenotazioni

CataloGlobe · staging `lxeawrpjfphgdspueiag` · ramo `staging` · HEAD `ce910ae4`
Sola lettura del codice. Nessuna verifica su database o ambiente.

---

## 0. Come leggere le tre colonne

Hai chiesto tre stati: assente, implementato, implementato **e verificato dal vivo**.
Dal codice posso stabilire con certezza i primi due. Il terzo **non è ricavabile da un
repository**: nessun file dice che un'email è arrivata davvero in una casella, che un
cron ha svegliato una funzione, che un segreto esiste nel vault. Fingere di saperlo
sarebbe il difetto esatto che la terza colonna esiste per evitare.

Quindi la terza colonna qui vale **"coperto da test automatico"**, che è il massimo che
il codice può testimoniare da solo, ed è meno di quello che ti serve. Tutto ciò che
richiede una prova sul campo è raccolto nella **§9, Registro di verifica**: è la lista
che va eseguita, e finché non lo è, il dominio non ha una terza colonna vera.

Legenda:

- **Assente** — non esiste codice che lo faccia.
- **Impl.** — il codice c'è e regge la lettura, ma il percorso non ha né test né prova sul campo.
- **Test** — esiste un test automatico che esercita quel percorso (unit, non end-to-end).
- **Da verificare** — il percorso dipende da configurazione d'ambiente (segreti, cron, DNS
  del mittente) che il repository non può confermare.

---

## 1. Dove vive il dominio

| Strato | Elementi |
|---|---|
| Schema | `reservations`, `reservation_tables`, `reservation_guests`, `table_combination_groups`, 3 view ospiti, ~55 migration del dominio |
| RPC | `place_online_reservation`, `get_reservation_day_availability`, `assign_tables_for_reservation`, `set_reservation_tables`, `reset_reservation_tables_to_system`, `reassign_activity_tables`, `analytics_reservations_{overview,trend,hourly}` |
| Edge | `submit-reservation`, `reservation-availability`, `respond-reservation`, `cancel-reservation-public`, `confirm-reservation-attendance`, `send-reservation-reminders`, `purge-reservation-data`, `resolve-reservation-privacy` |
| Shared edge | `reservationTransitions`, `reservationEmails`, `reservationEmailCopy`, `reservationToken`, `reservationIcs`, `reservationCancellation`, `reservationRetention`, `reservationAlertRecipients` |
| Cron | `send-reservation-reminders` (16 e 17 UTC, guardia su Roma=18), `purge-reservation-data` (04:15 UTC) |
| Frontend pubblico | `src/pages/ReservationPage/*`, `ReservationPrivacyPage`, ingresso dal `MoreSheet` del menu |
| Frontend admin | `src/pages/Dashboard/Reservations/*`, `Guests/*`, `Operativita/Attivita/tabs/ActivityReservationsTab` |
| Servizi | `reservations.ts` (807 righe), `reservationGuests.ts`, `reservationPrivacy.ts` |

Osservazione a margine: **`CLAUDE.md` non ha una sezione Prenotazioni.** Ordini e
pagina pubblica ce l'hanno, questo dominio no. È il pezzo di codice più giovane e più
denso del progetto e l'unico senza regole scritte — vale la pena colmarlo prima di
aprire ai clienti, non dopo.

---

## 2. Modulo pubblico

Route `/:slug/prenota` e `/:slug/:lang/prenota`.

| Voce | Stato | Nota |
|---|---|---|
| Ingresso dal menu pubblico | Impl. | Solo dalla voce "Prenota" del `MoreSheet`, condizionata a `enable_reservations`. Nessun punto d'ingresso in evidenza sulla pagina. |
| Data (orizzonte 90 giorni) | Test | `RESERVATION_HORIZON_DAYS = 90`, giorni chiusi esclusi da orari + `activity_closures`. |
| Ora (griglia da pacing) | Test | Passo = `reservation_pacing_slot_minutes`; ancorata all'apertura; coda oltre mezzanotte gestita; slot già passati marcati `past`. |
| Coperti | Impl. | Picker; limite server 1–50. |
| Nome, telefono, email | Impl. | Tutti obbligatori. Telefono validato solo per lunghezza cifre (min/max), non per forma. |
| Note libere | Impl. | Max 500 caratteri, contatore visibile. |
| Disponibilità prima del submit | Impl. | Edge `reservation-availability` marca gli slot pieni. Fail-open per scelta: un errore rete lascia la griglia ottimista. |
| Consenso privacy | Impl. | **Nessuna checkbox.** Frase con link all'informativa della sede (`/:slug/privacy-prenotazioni`). Vedi §7. |
| Lingua | Impl. | 5 lingue; la scelta finisce in `reservations.customer_language` e decide la lingua delle email al cliente. |
| Schermata post-invio | Impl. | Due esiti: "Prenotazione confermata" (auto) o "Richiesta inviata" (pending), con riepilogo. |
| Riepilogo post-invio nella lingua giusta | **Assente** | `SuccessRecap` passa `locale="it-IT"` fisso. Difetto già annotato nel codice: un cliente inglese vede la data in italiano subito dopo aver prenotato in inglese. |
| Modifica della prenotazione dal cliente | **Assente** | Il cliente può solo disdire. Per spostarsi di mezz'ora deve disdire e rifare. |
| Scelta sala / zona | **Assente** | — |
| Occasione, seggiolone, accessibilità, allergie strutturate | **Assente** | Tutto confluisce nelle note libere. |
| Deposito / carta a garanzia | **Assente** | Nessun aggancio a Stripe sul dominio prenotazioni. |
| Aggiungi al calendario in pagina | **Assente** | L'`.ics` arriva solo via email e solo su prenotazione confermata. |

**Gate applicati al submit**, nell'ordine: rate limit (15/min per slug, 40/h per IP) →
sede esistente → `status='active'` → `enable_reservations` → abbonamento in
`{active, trialing, past_due}` → feature di piano `table_reservation` → RPC
`place_online_reservation` sotto advisory lock (capienza, poi pacing).

**Difetto minore rilevato**: `submit-reservation` calcola "oggi" con
`todayUtcIsoDate()`. Fra mezzanotte e le 02:00 italiane la data di ieri passa la
validazione `DATE_IN_PAST`. Effetto pratico quasi nullo (la griglia non la propone),
ma è la stessa classe di errore che avete già corretto altrove sul fuso.

---

## 3. Ciclo di vita

Il `CHECK` del DB ammette **sette** stati. Il prodotto ne guida **cinque**.

| Stato | Chi lo scrive | Stato |
|---|---|---|
| `pending` | `place_online_reservation` (default) | Test |
| `confirmed` | RPC in auto-conferma · `respond-reservation` (confirm) · `createReservation` (sempre) · `undo_no_show` | Test |
| `declined` | `respond-reservation` (decline) | Test |
| `cancelled` | `respond-reservation` (cancel) · `cancel-reservation-public` | Test |
| `no_show` | `respond-reservation` (mark_no_show) | Test |
| `seated` | **nessuno** | **Assente** |
| `completed` | **nessuno** | **Assente** |

### Transizioni esistenti

| Azione | Da → A | Chi |
|---|---|---|
| `confirm` | pending → confirmed | admin |
| `decline` | pending → declined | admin |
| `cancel` | confirmed → cancelled | admin |
| `mark_no_show` | confirmed → no_show | admin |
| `undo_no_show` | no_show → confirmed | admin |
| `cancel_by_customer` | pending \| confirmed → cancelled | link firmato |

La matrice vive in un solo file (`_shared/reservationTransitions.ts`), condivisa fra
endpoint admin e endpoint cliente, con test che asserisce il rifiuto di
`cancel_by_customer` sul canale admin. Il vincolo viaggia **dentro** l'`UPDATE`
(`status IN (...)`), quindi due scritture concorrenti non producono doppia transizione
né doppia email. Questa parte è fatta bene e non la toccherei.

### Transizioni che non esistono

- **Arrivato / seduto.** Non c'è. `seated_at` è una colonna che nessuno scrive. Il
  motore di assegnazione tavoli *considera* `seated` come stato occupante — cioè il
  codice è già scritto per un fatto che non accade mai.
- **Servizio concluso.** `completed_at` idem. Nessun tempo di permanenza reale è
  misurabile: la durata è sempre e solo `reservation_duration_minutes` presunta.
- **Annullamento da `pending` lato admin.** L'admin usa `decline`. Vocabolario diverso,
  effetto diverso sul cliente (riceve "rifiutata", non "annullata").
- **Riapertura** di una `cancelled` o `declined`. Sono terminali. Un cliente che
  richiama dopo aver disdetto va reinserito a mano — e la prenotazione perde le
  proprie assegnazioni tavolo per sempre, non le ritrova.
- **Marcatura no-show automatica.** Le prenotazioni confermate di ieri restano
  `confirmed` per sempre se nessuno le tocca. Lo storico si sporca da solo.

### Nell'interfaccia

Inbox e agenda espongono confirm/decline su `pending`, cancel/no-show su `confirmed`,
undo su `no_show`, con **finestra di annullamento di 5 secondi** (`useDeferredCommit`)
prima che la chiamata parta davvero. Le prenotazioni sono in `supabase_realtime`, e
l'hook `useReservationsRealtime` aggiorna la lista senza refresh.

---

## 4. Comunicazioni

**Canale unico: email, via Resend.** Nessun SMS, nessun WhatsApp, in nessun punto del
sistema.

| Comunicazione | Innesco | Destinatario | Stato |
|---|---|---|---|
| Ricevuta "richiesta ricevuta" | submit, esito `pending` | cliente | Test · **Da verificare** |
| Conferma automatica | submit, esito `confirmed` | cliente | Test · **Da verificare** |
| Conferma manuale | `respond-reservation` confirm | cliente | Test · **Da verificare** |
| Esito negativo (rifiutata / annullata dal locale) | `respond-reservation` decline/cancel | cliente | Test · **Da verificare** |
| Avviso nuova prenotazione | submit | sede | Test · **Da verificare** |
| Avviso disdetta del cliente | `cancel-reservation-public` | sede | Test · **Da verificare** |
| Promemoria la sera prima, 18:00 | cron | cliente | Test · **Da verificare** |
| Notifica in-app nuova prenotazione | submit | chi ha `reservations.manage` | Impl. |
| Notifica in-app disdetta | `cancel-reservation-public` | idem | Impl. |
| Disdetta autonoma del cliente | link firmato HMAC nell'email | — | Test |
| Conferma di presenza del cliente | link firmato nel promemoria | — | Test |
| **Avviso di modifica** (il locale sposta data/ora/coperti) | — | — | **Assente** |
| **Promemoria alla sede** del servizio del giorno | — | — | **Assente** |
| **Sollecito sulle pending non gestite** | — | — | **Assente** |

Dettagli che contano:

- **Allegato calendario** solo su prenotazione confermata, mai sulla ricevuta — scelta
  giusta e già motivata nel codice (una richiesta rifiutata lascerebbe un appuntamento
  fantasma).
- **Destinatari dell'avviso alla sede**: `activities.reservation_notification_emails`,
  un invio separato per indirizzo; se vuoto, fallback sull'email dell'owner del tenant.
- **Lingua**: cliente in 5 lingue, sede sempre in italiano.
- **Silenzi voluti**: no-show, annullamento del no-show e disdetta del cliente non
  generano email al cliente. Condivido, e non lo rimetterei in discussione.
- **Il promemoria perde, non duplica**: la riga viene rivendicata con
  `UPDATE ... WHERE reminder_sent_at IS NULL` *prima* dell'invio. Se Resend fallisce
  dopo, quel promemoria è perso. Verso giusto, ma **nessuno se ne accorge**: non
  esiste un log persistente né un contatore. Vedi §10.
- **Modifica silenziosa**: `updateReservation` cambia data, ora e coperti senza
  avvisare nessuno. È il buco più grosso di questa sezione. Il cliente ha in mano
  un'email e un `.ics` che dicono un'altra ora.

### Dipendenze d'ambiente che il codice non può confermare

| Variabile / segreto | Se manca |
|---|---|
| `RESEND_API_KEY` + dominio mittente verificato | Nessuna email parte. Silenzioso: i fallimenti sono solo `console.error`. |
| `APP_URL` | Le email partono **senza** link di disdetta e conferma. Solo un `console.warn`. |
| `RESERVATION_TOKEN_SECRET` | Token non firmabili → email senza link; verifiche in errore. |
| `RESERVATION_REMINDERS_SECRET` + vault `reservation_reminders_url` / `_secret` | **Il cron esce con un NOTICE e non chiama nulla.** Nessun promemoria, nessun errore visibile. |
| `RESERVATION_RETENTION_SECRET` + vault `purge_reservation_data_url` / `reservation_retention_secret` | Il purge non gira. Idem, silenzioso. |

Sono cinque punti in cui una funzione completa e testata **non fa nulla** senza che
niente lo segnali. È esattamente la categoria che intendevi con la terza colonna.

---

## 5. Configurazione della sede

Tutto in `/business/:id/locations/:activityId?tab=reservations`, tranne la capienza che
sta nel tab *Sala*.

| Impostazione | Tipo | Default | Semantica |
|---|---|---|---|
| `enable_reservations` | bool | `false` | Mostra il modulo sulla pagina pubblica. |
| `reservation_capacity` | int null | `null` | Coperti massimi contemporanei. `null` = nessun limite. Vive nel tab Sala. |
| `reservation_duration_minutes` | int | `120` | Durata presunta di una prenotazione, 15–600. Alimenta capienza, conflitti tavolo e `.ics`. |
| `reservation_confirmation_mode` | `manuale` \| `auto` | `manuale` | `auto` richiede capienza impostata (CHECK a livello DB). |
| `reservation_overbooking_form` | `hard` \| `soft` | `hard` | `hard` = il canale online rifiuta oltre capienza; `soft` = accetta ma lascia `pending`. |
| `reservation_pacing_slot_minutes` | 15 \| 30 \| 60 | `15` | Ampiezza del secchiello **e** passo degli orari proposti al cliente. |
| `reservation_pacing_max_covers` | int null | `null` | Coperti per fascia. Vuoto = nessun limite. |
| `reservation_pacing_max_bookings` | int null | `null` | Prenotazioni per fascia. Vuoto = nessun limite. |
| `reservation_cancellation_cutoff_minutes` | int | `120` | Quanto prima il cliente può ancora disdire da solo. Max 10080 (7 giorni). |
| `reservation_reminder_enabled` | bool | `true` | Acceso di default per scelta dichiarata. |
| `reservation_notification_emails` | text[] | `{}` | Destinatari dell'avviso. Vuoto = owner del tenant. |
| `reservation_privacy_contact_email` | text null | `null` | Pubblicata nell'informativa. Vuoto = email personale dell'owner, con avviso in UI. |
| `reservation_availability_mode` | `turni` \| `continua` | `continua` | **Colonna morta.** Nessuna UI, nessuna lettura nel motore. Vedi sotto. |

Prerequisiti mostrati in cima al tab: orari di apertura configurati, capienza
impostata, ragione sociale presente. Buona idea, già in produzione.

**Il buco di configurazione più grosso è `turni`.** La colonna esiste dal 7 giugno con
un `CHECK` a due valori e non è mai stata implementata: nessun campo, nessun ramo nel
motore, un solo commento in una migration di settembre che dice "identica in modalità
turni e continua". Un numero enorme di ristoranti italiani lavora a due turni fissi
(20:00 e 22:15) e li vende come tali. Oggi CataloGlobe non sa esprimerlo: si può solo
approssimare con il pacing, che è una leva diversa e non comunica al cliente che il
tavolo va liberato.

**Non configurabile**, e ciascuna di queste è una domanda che il primo ristoratore fa:

- Preavviso minimo (oggi si può prenotare per fra dieci minuti).
- Orizzonte massimo diverso da 90 giorni.
- Coperti massimi per prenotazione online diversi da 50 (i gruppi grossi si gestiscono
  al telefono, ovunque).
- Giorni o fasce in cui le prenotazioni si chiudono pur restando aperti.
- Durata diversa per dimensione del gruppo (un tavolo da 8 non sta 120 minuti).
- Capienza per zona invece che per sede.
- Testo libero della sede nell'email di conferma.

---

## 6. Operatività

Pagina `/business/:id/reservations`, gate di piano `table_reservation` (Pro).

| Funzione | Stato | Nota |
|---|---|---|
| Inbox delle `pending` | Impl. | Separazione fra richieste ancora vive e richieste già scadute rispetto a oggi. |
| Agenda giorno / settimana | Impl. | Terminali (`declined`, `cancelled`) dietro un toggle; `no_show` resta visibile per scelta. |
| Scope multi-sede + "Tutte le sedi" | Impl. | `useSedeScope`. |
| Filtro canale (online / a mano) | Impl. | — |
| Aggiornamento realtime | Impl. | `useReservationsRealtime`. |
| Creazione manuale | Impl. | Status forzato `confirmed`, `source='manual'`, operatore tracciato da `auth.uid()`. Picker su orari e chiusure della sede. |
| Avvisi non bloccanti su capienza e pacing in inserimento manuale | Impl. | Coerente con l'invariante "i vincoli chiudono l'online, mai l'operatore". |
| Riconoscimento cliente esistente dal telefono | Impl. | Mostra il profilo ospite mentre si scrive. |
| Modifica di una prenotazione | Impl. | Solo dati. Lo stato non è modificabile da qui. **Nessuna email.** |
| Assegnazione tavoli: badge, conflitti, tre gesti | Impl. | Lavoro delle ultime sessioni. Conflitti calcolati client-side. |
| Rubrica clienti `/guests` | Impl. | Storico visite, no-show, note del locale, tag. |
| Analitiche prenotazioni | Impl. | Overview, trend, distribuzione oraria, card "prossime", foglio Excel. |
| **Ricerca per nome o telefono** | **Assente** | Nessun campo di ricerca nell'elenco. "Ha chiamato Rossi, cerca la sua prenotazione" oggi si fa a occhio. |
| **Vista di servizio / arrivi** | **Assente** | Conseguenza diretta dell'assenza di `seated`. Non c'è la schermata che l'host tiene aperta all'ingresso. |
| **Nota interna del locale sulla singola prenotazione** | **Assente** | `notes` è il campo del cliente e la modifica lo sovrascrive. Le note del locale esistono solo sul profilo ospite, cioè valgono per sempre e non per quella sera. |
| **Stampa o export della lista del giorno** | **Assente** | — |
| **Storico / archivio consultabile** | **Assente** | L'agenda naviga per data; non c'è un elenco filtrabile del passato. |
| **Blocco manuale di uno slot** (evento privato, tavolo fuori uso) | **Assente** | — |

---

## 7. Dati e legale

**Confermo che tengo dentro questo perimetro, e ti consiglio di non toglierlo.** Non è
zelo: qui il titolare del trattamento è il ristoratore e CataloGlobe è responsabile ex
art. 28 — un contratto che nel prodotto oggi non esiste da nessuna parte. È l'unica
voce dell'audit che può fermare una vendita a valle, e l'unica che non si sistema con
una fase di sviluppo.

**Cosa si conserva di un cliente**: nome, email, telefono grezzo e forma canonica
E.164, note libere, lingua, data/ora/coperti, canale, operatore che l'ha inserita,
timestamp di promemoria e conferma presenza. In più un **profilo ospite**
(`reservation_guests`) creato automaticamente da trigger sul numero E.164, con nome,
email, note del locale e tag, che sopravvive alla singola prenotazione e aggrega lo
storico visite fra le sedi del tenant. L'IP di chi prenota non viene conservato: entra
solo, in forma hash, nel contatore di rate limit.

| Voce | Stato | Nota |
|---|---|---|
| Informativa privacy per sede | Impl. | `/:slug/privacy-prenotazioni`, resa da `resolve-reservation-privacy`. Il titolare nominato è la sede, non CataloGlobe — corretto. |
| Degrado onesto senza ragione sociale | Impl. | L'informativa non si pubblica e mostra un avviso invece di nominare il soggetto sbagliato. |
| Consenso nel modulo | Impl. | Nessuna checkbox: frase informativa + link. Difendibile (base giuridica: esecuzione del contratto), ma è una **scelta legale che va messa per iscritto**, non lasciata implicita nel codice. |
| Conservazione 36 mesi | Impl. · **Da verificare** | `purge-reservation-data`: anonimizza le prenotazioni con `[dato rimosso]` e cancella i profili scaduti. Ordine anonimizza→cancella non invertibile (un UPDATE su profilo cancellato lo farebbe rinascere dal trigger). Ben fatto e ben testato. |
| Il purge gira davvero | **Da verificare** | Cron 04:15 UTC, corpo `{"dry_run": false}`, dipende da due segreti di vault creati a mano. |
| Ritenzione configurabile per tenant | **Assente** | 36 mesi cablati in una costante Deno. |
| Accesso / cancellazione su richiesta dell'interessato | **Assente** | L'informativa dà un indirizzo email al locale. Nessun percorso nel prodotto: il ristoratore che riceve la richiesta non ha un bottone. |
| Export dei dati di un ospite | **Assente** | — |
| Nomina a responsabile (DPA) verso il ristoratore | **Assente** | Non risulta nel prodotto né nei documenti legali del repo. |
| Registro dei trattamenti / informativa sui sub-responsabili (Resend, Supabase) | **Assente** | — |

---

## 8. Multi-sede e permessi

| Permesso | Scope | owner | admin | manager | staff | viewer |
|---|---|---|---|---|---|---|
| `reservations.read` | sede | ✔ | ✔ | ✔ | ✔ | ✔ |
| `reservations.manage` | sede | ✔ | ✔ | ✔ | ✔ | — |
| `guests.read` | sede | ✔ | ✔ | ✔ | — | — |
| `guests.manage` | sede | ✔ | ✔ | ✔ | — | — |

RLS attiva su `reservations`, `reservation_tables`, `reservation_guests`, con policy
`has_permission('<perm>', activity_id)`. Le tre view ospiti sono `security_invoker`, e
la rubrica esclude i profili senza visite visibili al chiamante: un manager di una sola
sede non sfoglia i clienti delle altre. Le RPC operatore sono `SECURITY DEFINER` con
gate interno e collassano "non esiste" e "non autorizzato" su un unico `42501`.

Punti da guardare:

- **`staff` può gestire tutto**: confermare, rifiutare, annullare, marcare no-show. È
  l'unico ruolo operativo, quindi oggi non c'è alternativa, ma vale la pena decidere
  se un cameriere debba poter rifiutare una richiesta.
- **La configurazione del canale** è gated da `canWrite` sulla sede, non da un permesso
  proprio: chi può modificare la sede può cambiare capienza, pacing e cutoff.
- **`guests.*` è dichiarato scope `activity`** ma la rubrica è di fatto per tenant, con
  il filtro delegato alle view. Funziona, ma la semantica del permesso e quella del
  dato non coincidono. Da chiarire prima che qualcuno ci costruisca sopra.
- **Nessun permesso dedicato alle impostazioni prenotazioni** distinto da quello sedi.

---

## 9. Registro di verifica — la terza colonna, da riempire

Queste sono le prove che il codice non può darmi. Ordinate per quanto costa scoprirle
tardi. Sede di prova: San Pietro su staging.

1. **Il cron dei promemoria esiste ed è passato almeno una volta.**
   `SELECT * FROM cron.job WHERE jobname='send-reservation-reminders';` +
   `SELECT * FROM cron.job_run_details ... ORDER BY start_time DESC LIMIT 10;`
   Poi: i due segreti nel vault esistono, e `RESERVATION_REMINDERS_SECRET` è impostata
   sulla funzione **con lo stesso valore**. Se i valori divergono la funzione risponde
   401 e il cron non se ne accorge.
2. **Un promemoria è arrivato davvero in una casella.** Prenotazione confermata per
   domani su San Pietro, invocazione manuale della funzione con l'header corretto,
   email ricevuta, e `reminder_sent_at` valorizzato.
3. **Le sette email partono e sono leggibili.** Una per template, su un client reale
   (Gmail web + iOS Mail): ricevuta, conferma auto, conferma manuale, esito negativo,
   avviso sede, avviso disdetta, promemoria. Con dominio mittente verificato e link
   cliccabili.
4. **`APP_URL` è impostata su staging e produzione.** Senza, tutte le email escono
   senza link di disdetta e conferma, con un solo `console.warn` a dirlo. È il modo più
   probabile in cui questa funzione risulta rotta al primo cliente.
5. **Il link firmato di disdetta funziona end-to-end**, incluso il caso oltre cutoff
   (deve mostrare il telefono della sede) e il doppio clic (idempotente).
6. **Il link di conferma presenza** valorizza `guest_confirmed_at` e compare in agenda.
7. **`.ics` importabile** in Google Calendar e Apple Calendar, con orario e durata giusti.
8. **Il purge è stato eseguito almeno una volta in dry-run** e il summary è stato letto.
   Il cron è schedulato in **modalità distruttiva**: è l'unico punto del sistema che
   cancella dati di persone.
9. **Le notifiche in-app arrivano** al campanello dei membri con `reservations.manage`.
10. **Il gate di piano**: un tenant `base` non vede la voce e non può prenotare via Edge.
11. **Una prenotazione via chiamata diretta alla RPC a locale chiuso** — la prova del
    difetto noto su `place_online_reservation`.
12. **I permessi**, con un utente per ruolo: `viewer` non vede i bottoni e prende 42501
    se forza; `staff` non entra nella rubrica.

---

## 10. Cosa manca per "completo", ordinato per quanto è vincolante

### A — Blocca l'apertura ai clienti

1. **Il registro di verifica §9.** Non è sviluppo, è la differenza fra "c'è" e
   "funziona". Va fatto per primo perché può cambiare la lista che segue.
2. **Ciclo di vita del servizio: arrivato e concluso.** Senza `seated`/`completed` non
   esiste vista di servizio, non esiste tempo di permanenza reale, e le prenotazioni di
   ieri restano `confirmed` in eterno. È anche il presupposto dell'aggancio con gli
   ordini. Il motore tavoli lo considera già: il codice aspetta uno stato che nessuno
   scrive.
3. **Email di modifica.** Il locale sposta la prenotazione e il cliente non lo sa. Il
   cliente ha in mano un `.ics` che dice un altro orario. Non si apre a un ristoratore
   con questo dentro.
4. **Turni.** La modalità dichiarata a schema e mai implementata. Un ristorante a due
   turni oggi non può descrivere il proprio servizio. Se decidi di non farla entro
   l'apertura, va **tolta dallo schema**, non lasciata come promessa muta.
5. **Preavviso minimo.** Si può prenotare per fra dieci minuti. Il primo ristoratore lo
   scopre il primo venerdì sera.
6. **Ricerca per nome o telefono.** Il gesto più frequente dell'host.
7. **Validazione degli orari di apertura in `place_online_reservation`** + test su
   `availability.ts`. Già censita da te; la confermo in questa fascia, non più in basso:
   il caso del modulo in cache è realistico e la RPC è chiamabile direttamente.
8. **La nomina a responsabile del trattamento verso il ristoratore.** Non è codice, ma
   è un blocco all'apertura tanto quanto gli altri. Lo metto qui perché va avviato ora,
   non perché occupi tempo di sviluppo.

### B — Il ristoratore lo chiede entro la prima settimana

9. Nota interna del locale sulla singola prenotazione, distinta da quella del cliente.
10. Marcatura no-show automatica, o quantomeno un sollecito sulle confermate scadute.
11. Coperti massimi online configurabili e orizzonte diverso da 90 giorni.
12. Blocco manuale di uno slot o di una giornata (evento privato, chiusura improvvisa).
13. Stampa o export della lista del giorno.
14. Riepilogo del servizio alla sede la mattina o la sera prima.
15. Riapertura di una prenotazione annullata.
16. Riepilogo post-invio nella lingua del cliente (difetto già annotato nel codice).

### C — Vero valore, ma non serve a dire "completo"

17. Aggancio prenotazione ↔ sessione QR. **Concordo con la tua lettura**: è integrazione
    fra due domini, non completamento delle prenotazioni, e va costruito sulla tavolata,
    non sul tavolo. Fuori dalle tre settimane.
18. Deposito o carta a garanzia.
19. Modifica autonoma della prenotazione da parte del cliente.
20. Durata variabile per dimensione del gruppo; capienza per zona.
21. Ritenzione configurabile; percorso di accesso/cancellazione dati nel prodotto.
22. SMS o WhatsApp.
23. Sezione Prenotazioni in `CLAUDE.md`.

---

## 11. Stima onesta

**Cosa sta in tre settimane**: tutto il gruppo A, se il registro di verifica non fa
emergere sorprese, più tre o quattro voci del gruppo B.

Il conto, per fasi come le lavorate voi:

| Fase | Contenuto | Peso |
|---|---|---|
| 0 | Registro di verifica §9 | 1–2 giorni, quasi tutto tuo, poco mio |
| 1 | `seated` / `completed` + vista di servizio | 4–5 giorni. La fase grossa: schema, transizioni, matrice, UI, effetti sul motore tavoli |
| 2 | Email di modifica + validazione orari nella RPC + test `availability.ts` | 2–3 giorni |
| 3 | Turni | 4–5 giorni, **oppure 0,5 giorni per rimuovere la colonna** |
| 4 | Preavviso minimo, coperti max, orizzonte | 1–2 giorni, una sola passata sulla configurazione |
| 5 | Ricerca + nota interna + no-show automatico | 2–3 giorni |

Sono 14–20 giorni lavorativi con la fase 3 fatta davvero, 10–15 con la fase 3 rimossa.
Le tre settimane ci stanno **solo se la fase 3 si decide subito**, in un verso o
nell'altro. È la decisione di prodotto che pesa di più su questo calendario, ed è la
prima che ti chiederei.

Cosa non ci sta, e non dovrebbe provarci: l'aggancio con gli ordini, il deposito, la
modifica dal cliente. E i debiti minori che hai già censito, che restano dove li hai
messi — dentro il diff della prima fase che passa da quel codice.

**Una cosa che non era nella tua lista e che metterei prima di tutto il resto**: cinque
punti di questo dominio — Resend, `APP_URL`, il segreto dei token, i due segreti del
cron — sono configurazioni la cui assenza produce silenzio, non errore. Una funzione
completa, testata e ben scritta che non fa nulla, e nessuno che lo sappia. Il primo
promemoria mancato non lo scoprirai tu: lo scoprirà un cliente che non si presenta.

---

## 12. Sul perimetro che mi hai chiesto di confermare

Lo tengo dentro, per la ragione detta in §7: è l'unica sezione dell'audit che non si
chiude scrivendo codice, e quindi l'unica il cui tempo di attraversamento non dipende
da noi. La conservazione a 36 mesi e l'informativa per sede sono già fatte, e fatte
bene. Quello che manca — la nomina a responsabile, e mettere per iscritto la scelta di
non usare una checkbox di consenso — va avviato in parallelo alle tre settimane, non
dopo.

---

*Fine audit. Nessuna soluzione proposta, per come avevamo detto. Il piano lo ricaviamo
da qui.*
