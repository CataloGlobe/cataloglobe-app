# BLOCCO 2 · FASE 2.8 — Ricognizione prima della chiusura automatica

**Questa fase non scrive codice.** Niente migration, niente TypeScript, nessun commit.
Si legge, si riporta, ci si ferma. La 2.8 vera si scrive dopo, con in mano quello che
trovi qui.

Il motivo è dichiarato: la chiusura automatica di fine giornata ha bisogno di sapere
quando finisce la giornata, e quella definizione dipende da come sono modellati gli
orari di apertura delle sedi — che non abbiamo mai guardato. Costruire prima di sapere
è come abbiamo perso tempo con pg_net.

## Cosa deve risolvere la 2.8

Su staging c'è una tavolata aperta **da più di due giorni**. Nessuno l'ha chiusa, e
nessuno la chiuderà: `close_seating` esiste solo come gesto dell'operatore. Un locale
vero lascerà aperte le tavolate ogni sera in cui qualcuno si distrae, e la schermata
Servizio diventa inutile nel giro di una settimana.

La soglia giusta non è una durata — "più di X ore" è arbitrario — ma un fatto:
**ancora aperta dopo la chiusura del locale.** Da lì nasce anche il segnale visivo
sulla tavolata troppo vecchia, che abbiamo rinviato apposta.

## Le domande

Rispondi con quello che trovi nel codice e nel DB, non con quello che sarebbe
ragionevole. Se una risposta non c'è, dillo.

### 1. Gli orari di apertura

- Dove vivono? Tabella, colonne, oppure JSONB — e con quale forma esatta.
- Sono per giorno della settimana? Si possono avere **più fasce** nello stesso giorno
  (pranzo e cena)? Esistono chiusure straordinarie o eccezioni per data?
- C'è già un helper — SQL o TypeScript — che risponde a "il locale è aperto alle T?"
  oppure "a che ora chiude il giorno D?" Se sì, dove, e chi lo usa.

### 2. Il fuso e la mezzanotte

- Gli orari sono locali o UTC? Esiste un fuso **per sede**, o `RESERVATION_TIMEZONE`
  (`Europe/Rome`) è cablato per tutti?
- Cosa succede a un locale che chiude **dopo la mezzanotte** — un bar alle 2, un club
  alle 4? Il modello sa rappresentarlo, o una chiusura all'una si scrive come `01:00`
  del giorno stesso e quindi "prima" dell'apertura?

Questa è la domanda che può far saltare l'idea: se il modello non distingue la
**giornata di servizio** dal giorno di calendario, "chiudere le tavolate a fine
giornata" chiuderebbe la sala nel mezzo del servizio. Guardala bene.

### 3. Le sedi senza orari

Quante sedi su staging hanno gli orari **vuoti o incompleti**? Sappiamo già che la
capienza è NULL su 6 sedi su 8: se anche gli orari sono spesso vuoti, la chiusura
automatica avrebbe bisogno di un comportamento dichiarato per quel caso, e non si può
inventare dopo.

### 4. Il cron

- Come gira oggi la pianificazione in questo progetto? Solo il job dei promemoria via
  `pg_net` verso una Edge Function, o esiste già un precedente di job **in SQL puro**?
- Cosa c'è configurato: estensioni, vault, segreti, e con quale ruolo girano i job.

Ti anticipo dove pendo, così sai cosa verificare: **SQL puro, senza Edge Function.**
Chiudere tavolate è lavoro interamente dentro il database — nessuna email, nessuna
chiamata esterna — e `pg_net` è asincrono, cioè esattamente il meccanismo che nella
FASE 1 ha nascosto un errore per giorni. Dimmi se qualcosa lo impedisce.

### 5. Il permesso

Le cinque RPC del ciclo hanno `REVOKE` da `service_role` e `GRANT` solo ad
`authenticated`. Un job di cron con che ruolo girerebbe, e quel ruolo potrebbe
chiamare `close_seating`? Se no, serve una funzione propria — e voglio sapere **cosa
esattamente** la separa dalle cinque: chi può chiamarla, e come si impedisce che
diventi una porta di servizio per chiudere tavolate altrui.

### 6. Chi ha chiuso

`close_seating` accetta già `closed_reason` con `'operator'` e `'auto'`, e nessuno
scrive mai `'auto'`. Verifica che il vincolo lo ammetta davvero e che
`opened_by_user_id`/`closed_*` non abbiano `NOT NULL` che una chiusura senza utente
violerebbe.

## Chiusura

Un rapporto, una sezione per domanda, con i riferimenti ai file e alle righe dove hai
guardato. **Nessuna proposta di implementazione**: le decisioni le prendiamo dopo,
sulla base di quello che hai trovato. Se una domanda si rivela mal posta perché il
modello è diverso da come me lo immagino, dimmelo — è il risultato più utile che
questa ricognizione possa dare.
