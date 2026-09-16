# Piano — dominio prenotazioni al completo

Base: audit orizzontale del 10/09 + rapporto FASE 0 (`docs/verifica-prenotazioni-fase0.md`).
Orizzonte: tre settimane, quindici giorni lavorativi.

---

## Cosa ha cambiato il rapporto

Tre cose, in ordine di peso.

**Il promemoria funziona ma non è affidabile, ed è peggio che se non funzionasse.**
Tre invii riusciti e almeno un candidato saltato in silenzio. Un guasto totale lo
scopri il primo giorno; uno intermittente non lo scopri mai — e nessuno degli
strumenti che abbiamo oggi lo segnala. Il promemoria sale in cima al piano, e non da
solo: insieme al modo di accorgersene.

**"Cron succeeded" non ha mai voluto dire "la funzione è partita".**
`net.http_post` è asincrona: mette in coda la richiesta e torna subito. Il blocco `DO`
finisce con successo qualunque cosa risponda l'Edge — 401, timeout, 500. La riga
`succeeded` nel log del cron dice solo che la chiamata è stata accodata. È un errore di
metodo mio nel prompt della FASE 0, e va corretto ovunque useremo di nuovo quel
criterio.

**La funzione deployata non è la funzione che sta nel repository.**
`send-reservation-reminders` è alla versione 8 del 30/08 23:54, cinque minuti dopo il
commit `6dc85a4b`. Ma il 31/08 due commit — `413db373` e `bf0f2f3b` — hanno modificato
`reservationEmails.ts` e `emailLang.ts`, che quella funzione importa, e da allora non è
stata ridistribuita. Nel repository non ci sono workflow CI né script di deploy: le
Edge Function si pubblicano a mano, una per una. Quindi su staging gira codice di dieci
giorni fa, e **leggere il repository per spiegare il comportamento osservato significa
leggere codice diverso da quello in esecuzione**.

Non spiega da solo il promemoria mancato — le modifiche riguardano la lingua, non la
selezione delle righe. Ma apre una domanda più larga: quali altre funzioni su staging
stanno girando su una copia vecchia dei moduli condivisi. Con il deploy manuale, una
modifica a `_shared/` non ridistribuisce nulla di ciò che la usa.

**La retention non sarà verificabile aspettando.**
I dati più vecchi sono di giugno 2026 e la soglia è 36 mesi: non c'è nulla da cancellare
fino al 2029. Il job gira ogni notte in modalità distruttiva senza aver mai avuto un
solo caso da trattare. L'unica prova ottenibile è un'invocazione manuale in dry-run,
che è il comportamento di default della funzione. Quindici minuti, e va fatta.

Fuori tema ma da segnare: **6 sedi su 8 hanno `reservation_capacity` a NULL**, comprese
quelle di test. Senza capienza non esiste conferma automatica e i limiti non mordono.
Se non la compilano nemmeno le vostre sedi di prova, non la compilerà il primo
ristoratore: è un problema di onboarding, non di codice.

---

## FASE 0-bis — Perché quel promemoria non è partito

**Costo**: mezza giornata. **Sola lettura.**

**Prima di tutto**: la funzione in esecuzione è la v8 del 30/08, non `HEAD`. Qualunque
lettura di codice in questa fase va fatta su `git show 6dc85a4b` — l'ultimo commit
compreso nel deploy — e non sui file come stanno adesso.

E una verifica che vale per tutto il dominio: confrontare `updated_at` di ogni Edge
Function delle prenotazioni con la data dell'ultimo commit che tocca la funzione **o un
modulo `_shared/` che importa**. Dice quante altre girano vecchie.

Poi quattro strade, in quest'ordine, e ci si ferma alla prima che risponde.

1. **Log della Edge Function** attorno al 09/09 16:00 UTC (`get_logs`, che è fra le
   letture consentite). Dice se la funzione è stata invocata e con quale esito. È la
   strada più diretta, e la retention dei log su Supabase è breve: **va tentata per
   prima e subito**, prima che scada.
2. **`net._http_response`** per la richiesta di quel cron. Stessa informazione dal lato
   del chiamante. Attenzione: pg_net cancella le risposte dopo poche ore, quindi è
   probabile che sia già sparita. Se è vuota non è una risposta, è un buco.
3. **Lo stato del tenant e della sede** al momento buono. La funzione scarta le righe
   la cui sede non è `active`, che hanno il promemoria disattivato, o il cui tenant ha
   un `subscription_status` fuori da `{active, trialing, past_due}`. Il flag e la sede
   sono già stati esclusi dalla FASE 0; **il tenant no**, ed è l'unico filtro rimasto
   non verificato. Da guardare anche la cronologia: l'8/09 la sottoscrizione era
   valida — l'avviso di nuova prenotazione è arrivato, e `submit-reservation` applica
   la stessa allowlist — quindi se è cambiata, è cambiata fra l'8 e il 9.
4. **La riga stessa**: `customer_email` presente e non vuota. La funzione salta chi non
   ha un'email utilizzabile. Improbabile (l'indirizzo del cliente compare nell'avviso
   ricevuto dal locale), ma costa una query.

**Fermata**: causa identificata, oppure le ipotesi ancora in piedi con la query che le
separa. Nessuna correzione in questa fase.

---

## FASE 1 — Promemoria affidabile e osservabile

**Costo**: 1,5–2 giorni. Dipende da 0-bis.

La correzione da sola non basta, e non per scrupolo: se il difetto è intermittente,
senza uno strumento che lo veda **non potremo dire nemmeno di averlo risolto**.
Continueremmo a guardare lo stesso `succeeded` che ci ha ingannati questa volta.

- La correzione che 0-bis avrà indicato.
- Un registro delle esecuzioni: quando, per quale data, quanti candidati trovati,
  quanti inviati, quanti saltati e **per quale motivo**, quanti falliti in consegna.
  Una riga per esecuzione. È la differenza fra sapere e sperare.
- Il motivo visibile dove serve, cioè sulla prenotazione: "promemoria inviato alle
  18:00" oppure "non inviato — abbonamento della sede non attivo". Oggi il drawer
  mostra solo la conferma del cliente, e il silenzio del promemoria è indistinguibile
  da un promemoria mai dovuto.
- Il fallimento di consegna dopo la rivendicazione resta perdita, non duplicato: la
  scelta è giusta. Ma ora la perdita si vede.

**Fermata**: script di verifica o giro in browser, testi UI rivisti, poi commit.

---

## FASE 2 — Il servizio: arrivato e concluso

**Costo**: 4–5 giorni. È la fase grossa.

`seated` e `completed` esistono nel `CHECK` dal 15 giugno e non li scrive nessuno.
Il motore di assegnazione tavoli considera già `seated` come stato che occupa: il
codice aspetta un fatto che non accade.

- Le due transizioni nella matrice condivisa, con i test che la matrice ha già.
- `seated_at` e `completed_at` valorizzati; la durata reale diventa misurabile e smette
  di essere sempre `reservation_duration_minutes` presunta.
- La vista di servizio: la schermata che l'host tiene aperta all'ingresso. Oggi non
  esiste, ed è la conseguenza diretta dell'assenza di `seated`.
- Effetti sul motore tavoli e sui conflitti: da verificare, non da assumere.

Sblocca anche l'aggancio con gli ordini, che però resta fuori da queste tre settimane.

**Fermata**: Playwright obbligatorio (tocca il motore tavoli), testi rivisti, commit.

---

## FASE 3 — Modifica, calendario, orari

**Costo**: 2–3 giorni. Tre cose indipendenti, un solo diff perché toccano gli stessi file.

- **Email di modifica.** Oggi il locale sposta data, ora o coperti e il cliente non lo
  sa. È il buco più grosso delle comunicazioni.
- **Il calendario che segue la modifica.** L'`.ics` usa `METHOD:PUBLISH`, UID stabile e
  **nessun `SEQUENCE`**: un allegato aggiornato con lo stesso UID non viene trattato
  come versione più recente, e il calendario del cliente resta sull'orario vecchio.
  Da decidere: introdurre `SEQUENCE`, o dichiarare che l'allegato è uno scatto singolo
  e non rimandarlo. E la disdetta oggi non manda alcun `.ics`, quindi **chi annulla si
  tiene l'appuntamento in agenda**: serve `STATUS:CANCELLED`.
- **`place_online_reservation` non valida gli orari di apertura.** Un chiamante diretto
  della RPC prenota a locale chiuso. Il caso realistico è il modulo aperto in cache
  mentre il ristoratore cambia gli orari. Insieme ai test su `availability.ts`, che
  oggi non ne ha nessuno.

**Fermata**: migration create e ferme, `db push` tuo. Test prima del commit.

---

## FASE 4 — Fasce di servizio

**Costo**: 3–4 giorni. **Decisione da prendere prima di iniziare la 3.**

Nessun sistema affermato modella il turno come una modalità: è un *servizio*, cioè una
finestra oraria che porta con sé le proprie impostazioni. Oggi CataloGlobe ha un solo
turno implicito per sede, lungo tutto il giorno, con intervallo, durata, pacing e
capienza in colonne di `activities`. Un locale che a pranzo gira in 45 minuti e a cena
in 120 non sa dirlo, e non è un caso di nicchia.

- `reservation_shifts` per sede: giorni, finestra oraria, e i parametri che oggi stanno
  sulla sede — intervallo, durata, pacing, capienza.
- Ci entrano anche **preavviso minimo**, **coperti massimi online** e **orizzonte**, che
  erano una fase a sé: sono campi del servizio, non della sede.
- Il resolver sceglie il turno per data e ora. Il motore di capienza e pacing **non
  cambia**: legge i parametri dal turno invece che dalla sede.
- `reservation_availability_mode` si elimina in ogni caso: non è una modalità.

**Perché prima della 3**: se si aggiungono campi di configurazione a `activities` ora,
si sposteranno fra due settimane. O i turni si fanno, o quei campi non si fanno.

**Se si decide di non farla**: resta solo la rimozione della colonna, mezza giornata, e
si liberano tre giorni e mezzo per la 5 e per il margine.

---

## FASE 5 — I due gesti che mancano all'host

**Costo**: 1–2 giorni.

- **Ricerca per nome o telefono** nell'elenco. "Ha chiamato Rossi" oggi si risolve a
  occhio. È il gesto più frequente del servizio.
- **Nota interna del locale** sulla singola prenotazione, su colonna propria. Oggi
  `notes` è il campo del cliente, e scriverci sopra è il modo di perdere un'allergia.

---

## Fuori dalle tre settimane

Aggancio prenotazione ↔ sessione QR (integrazione fra domini, e va costruito sulla
tavolata). Marcatura no-show automatica. Deposito o carta a garanzia. Modifica autonoma
del cliente. Ritenzione configurabile e percorso di accesso/cancellazione dati nel
prodotto. Riepilogo post-invio nella lingua del cliente. Sezione Prenotazioni in
`CLAUDE.md` — da scrivere comunque prima di aprire, ma non è sviluppo.

---

## In parallelo, senza sviluppo

- **Dry-run della retention**, manuale, e lettura del summary. Quindici minuti, ed è
  l'unica prova ottenibile prima del 2029 su un job che gira ogni notte in modalità
  distruttiva.
- **Nomina a responsabile del trattamento** verso il ristoratore. Non è codice ed è
  l'unica voce dell'audit il cui tempo non dipende da noi: va avviata adesso.
- **La capienza a NULL su 6 sedi su 8.** Da guardare come problema di onboarding.

---

## Il conto

| Fase | Giorni |
|---|---|
| 0-bis diagnosi | 0,5 |
| 1 promemoria | 1,5–2 |
| 2 servizio | 4–5 |
| 3 modifica/calendario/orari | 2–3 |
| 4 fasce di servizio | 3–4 · oppure 0,5 se si rimuove |
| 5 ricerca e nota interna | 1–2 |

**Con i turni: 12,5–16,5 giorni.** Quindici disponibili: ci sta, senza margine.
**Senza i turni: 10–13 giorni.** Ci sta con margine.

Il margine, se serve, esce dalla 5 prima che dalla 2. La 2 è quella che non si può
tagliare: è la sola fase che riguarda com'è fatto il prodotto, non come è rifinito.
