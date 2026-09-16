# FASE 0-bis — Perché un promemoria non è partito

**Sola lettura. Nessuna correzione, nessuna migration, nessun commit, nessun `git add`.**
Il working tree ha lavoro in corso di sessioni parallele sulla stampa delle comande:
non toccarlo, non metterlo in stage.

Ambiente: staging `lxeawrpjfphgdspueiag`, MCP `supabase-staging` in sola lettura.

## Il fatto da spiegare

Prenotazione `620f854c-8860-4a5e-b244-7650a61edcb5`, sede San Pietro, per il
**2026-09-10 alle 11:45**. Creata l'08/09 alle 20:56, confermata alle 20:58 — quindi
`confirmed` ben prima delle 18:00 del 09/09, che è il momento in cui il promemoria per
il giorno dopo viene inviato. `reminder_sent_at` è rimasto NULL.

Era un candidato valido: il flag `reservation_reminder_enabled` della sede è `true` e
la sede non è sospesa (verificato in FASE 0).

## Due premesse che cambiano il modo di cercare

**1. Il codice in esecuzione non è `HEAD`.** La funzione deployata è la **versione 8 del
30/08 23:54**, che corrisponde al commit `6dc85a4b`. I due commit successivi del 31/08
(`413db373`, `bf0f2f3b`) hanno toccato `_shared/reservationEmails.ts` e
`_shared/emailLang.ts`, che la funzione importa, ma non è stata ridistribuita.
**Qualsiasi lettura di codice in questa fase va fatta su `git show 6dc85a4b:<file>`**,
non sui file come stanno adesso.

**2. "Cron succeeded" non dice nulla sull'esecuzione.** `net.http_post` è asincrona:
accoda la richiesta e ritorna subito, quindi il blocco `DO` chiude con successo che
l'Edge risponda 200, 401, 500 o non risponda affatto. L'esito registrato in FASE 0 non
è una prova che la funzione sia partita. **Non usarlo come tale.**

## Le strade, in quest'ordine

Ci si ferma alla prima che risponde. Se una non è percorribile con gli strumenti che
hai, **dillo e passa oltre**: non improvvisare un'alternativa.

### 1. I log della Edge Function — PRIMA DI TUTTO, sono deperibili

`get_logs` sul servizio edge-function, finestra attorno al **2026-09-09 16:00 UTC**
(le 18:00 di Roma). Cerchi: la funzione è stata invocata? con quale codice di risposta?
compaiono le sue righe di log — quante righe candidate ha trovato, quali ha scartato?

La ritenzione dei log è breve e la finestra è di ieri: **è la prima cosa da provare, e
se non ci arriva va detto subito**. Se lo strumento non copre quella finestra, riportalo
come tale — il Logs Explorer della dashboard arriva più indietro, ma lo apre Lorenzo,
non tu.

### 2. `net._http_response`

La risposta HTTP vista dal lato del chiamante, per la richiesta partita da quel cron.
Attenzione: pg_net cancella le risposte dopo poche ore, quindi è probabile che non ci
sia più. **Una tabella vuota non è una risposta, è un buco**: dillo così.

### 3. Lo stato del tenant

È l'unico filtro della funzione rimasto non verificato. La funzione scarta le righe il
cui tenant ha `subscription_status` fuori da `{active, trialing, past_due}`.

```sql
SELECT t.id, t.subscription_status, t.trial_until, t.deleted_at, t.updated_at
FROM tenants t
JOIN activities a ON a.tenant_id = t.id
WHERE a.name ILIKE '%San Pietro%';
```

Da leggere con attenzione al tempo: l'8/09 la sottoscrizione era valida — l'avviso di
nuova prenotazione è arrivato, e `submit-reservation` applica la **stessa** allowlist.
Quindi se oggi risulta fuori allowlist, è cambiata fra l'8 e il 9, e `updated_at` o
`trial_until` lo dicono. Se invece è dentro l'allowlist, questa strada è chiusa.

### 4. La riga stessa

```sql
SELECT id, activity_id, reservation_date, reservation_time, party_size,
       customer_email, customer_language, status, source,
       created_at, updated_at, reminder_sent_at, guest_confirmed_at
FROM reservations
WHERE id = '620f854c-8860-4a5e-b244-7650a61edcb5';
```

La funzione salta chi non ha un'email utilizzabile (non vuota, con una chiocciola).
Improbabile — l'indirizzo del cliente compariva nell'avviso ricevuto dal locale — ma
costa una query e chiude l'ipotesi.

## In più: quanto è vecchio il resto

Indipendente dal caso singolo, e da riportare comunque.

Per ognuna delle otto Edge Function del dominio prenotazioni — `submit-reservation`,
`reservation-availability`, `respond-reservation`, `cancel-reservation-public`,
`confirm-reservation-attendance`, `send-reservation-reminders`,
`purge-reservation-data`, `resolve-reservation-privacy` — confronta l'`updated_at` di
`supabase functions list` con la data dell'ultimo commit che tocca **la funzione o un
modulo `_shared/` che importa**.

Serve a sapere quante altre stanno girando su una copia vecchia del codice condiviso.
Con il deploy manuale, una modifica a `_shared/` non ridistribuisce niente di ciò che
la usa, e questo è il primo caso in cui ce ne accorgiamo.

## Chiusura

Aggiungi il risultato in coda a `docs/verifica-prenotazioni-fase0.md`, come sezione
"FASE 0-bis". In testa: **la causa**, oppure le ipotesi ancora in piedi con la query o
il log che le separa. E la tabella del disallineamento fra deploy e repository.

**Poi fermati.** Nessuna correzione, nessuna migration, nessun redeploy — nemmeno se la
causa è ovvia e il rimedio è di una riga. La correzione è la fase dopo, e prima va
decisa insieme.
