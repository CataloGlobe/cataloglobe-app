# FASE 0 — Ricognizione dello stato reale del dominio prenotazioni

**Sola lettura. Nessuna scrittura, nessuna migration, nessun commit, nessun `git add`.**
Il working tree contiene lavoro in corso di sessioni parallele sulla stampa delle
comande: non toccarlo e non metterlo in stage.

Ambiente: staging `lxeawrpjfphgdspueiag` via MCP `supabase-staging` (sola lettura).
La produzione (`qomnpzerhbtstbnwxnqc`) NON va toccata in questa fase.

## Obiettivo

Stabilire se il **promemoria della sera prima** ha mai funzionato, e se il job di
**retention** è mai girato. Sono le due sole funzioni del dominio il cui stato reale
non è ancora noto.

## Cosa è già stato verificato — non ricontrollarlo

Dalla casella del titolare risultano ricevute, su dati reali fra il 26 agosto e l'8
settembre: gli avvisi "Nuova richiesta di prenotazione", un "Nuova prenotazione
confermata" (variante auto-conferma) e un "Prenotazione annullata dal cliente".

Da cui è già accertato, e **non va reindagato**:

- Resend funziona e il dominio mittente è verificato.
- `APP_URL` e `RESERVATION_TOKEN_SECRET` sono impostate e coerenti: l'unica via che il
  cliente ha per annullare da solo è il link firmato nell'email, e quel giro è
  riuscito almeno una volta end-to-end.
- `submit-reservation`, `cancel-reservation-public` e la risoluzione dei destinatari
  dell'avviso sono deployate e funzionanti.

Resta ignoto solo ciò che passa da pg_cron.

## Non leggere altro

Il codice è già stato letto: non aprire i file del dominio per capire cosa fanno.
Se una query o un comando non è eseguibile con gli strumenti che hai, **fermati e
dillo**; non cercare una strada alternativa e non dedurre la risposta dal codice.

---

## 1 — I due job

```sql
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;

SELECT j.jobname, d.status, d.start_time, d.end_time, d.return_message
FROM cron.job_run_details d
JOIN cron.job j USING (jobid)
WHERE j.jobname IN ('send-reservation-reminders', 'purge-reservation-data')
ORDER BY d.start_time DESC
LIMIT 30;
```

Riporta: i due job esistono, sono `active`, e con quale esito hanno girato.

Attenzione a non leggere come guasto una cosa normale: `send-reservation-reminders` è
schedulato **due volte al giorno** (16 e 17 UTC) e una delle due esce sempre in pochi
millisecondi senza chiamare nulla. È la guardia che lascia passare solo l'esecuzione in
cui a Roma sono le 18.

## 2 — I segreti del vault (solo i NOMI, mai i valori)

```sql
SELECT name, created_at FROM vault.secrets ORDER BY name;
```

Servono quattro nomi: `reservation_reminders_url`, `reservation_reminders_secret`,
`purge_reservation_data_url`, `reservation_retention_secret`.

**Non usare `vault.decrypted_secrets`. Non stampare mai un valore, nemmeno parziale.**

Se manca anche uno solo dei primi due, il job dei promemoria esce con un NOTICE senza
chiamare nulla: è la spiegazione più probabile di uno zero al punto 3, e va detta come
conclusione, non come dettaglio.

## 3 — Il promemoria: è mai partito, e c'era qualcosa da mandare?

Due domande distinte, e la seconda serve a non sbagliare la prima.

```sql
SELECT
  count(*)                                               AS totali,
  count(*) FILTER (WHERE reminder_sent_at   IS NOT NULL) AS con_promemoria,
  count(*) FILTER (WHERE guest_confirmed_at IS NOT NULL) AS con_conferma_presenza,
  min(created_at), max(created_at)
FROM reservations;
```

```sql
-- La funzione promemoria è in produzione dal 30 agosto circa.
-- Ogni riga che risultava 'confirmed' entro le 18:00 del giorno PRIMA della
-- propria data era un candidato: doveva ricevere il promemoria.
SELECT id, reservation_date, reservation_time, status, source,
       created_at, updated_at, reminder_sent_at, guest_confirmed_at
FROM reservations
WHERE reservation_date >= DATE '2026-08-30'
ORDER BY reservation_date, reservation_time;
```

**Come si legge, e non saltare questo passaggio.** `con_promemoria = 0` da solo NON
dimostra che il promemoria sia rotto: se nessuna prenotazione confermata è mai caduta
il giorno dopo un'esecuzione del cron, quello zero è corretto e la funzione non ha mai
avuto occasione di girare. Confronta le due query e dichiara quale dei due casi è:

- **ci sono stati candidati e `reminder_sent_at` è NULL su tutti** → il promemoria non
  funziona, e il punto 1 o il punto 2 dicono perché;
- **non ci sono mai stati candidati** → la funzione è ancora non verificabile dai dati,
  e serve una prova costruita apposta (la faccio io a mano, non serve che la prepari).

## 4 — Configurazione delle sedi che accettano prenotazioni

```sql
SELECT id, name, slug, status, enable_reservations, reservation_reminder_enabled,
       reservation_capacity, reservation_duration_minutes,
       reservation_confirmation_mode, reservation_overbooking_form,
       reservation_availability_mode,
       reservation_pacing_slot_minutes, reservation_pacing_max_covers,
       reservation_pacing_max_bookings, reservation_cancellation_cutoff_minutes,
       cardinality(reservation_notification_emails) AS n_email_avviso,
       (reservation_privacy_contact_email IS NOT NULL) AS ha_email_privacy
FROM activities
WHERE enable_reservations = true
ORDER BY name;
```

Tre cose in particolare: se `reservation_reminder_enabled` fosse `false` su San Pietro,
spiegherebbe da sola uno zero al punto 3; se esistesse una sede con
`reservation_availability_mode = 'turni'` sarebbe un'anomalia, perché nessuna UI scrive
quel valore; e quante sedi hanno `reservation_capacity` a NULL.

## 5 — Variabili d'ambiente delle Edge Function (solo i NOMI)

```
supabase secrets list --project-ref lxeawrpjfphgdspueiag
supabase functions list --project-ref lxeawrpjfphgdspueiag
```

Interessano due nomi soltanto: `RESERVATION_REMINDERS_SECRET` e
`RESERVATION_RETENTION_SECRET`. Gli altri sono già accertati.
Dalla seconda: `send-reservation-reminders` e `purge-reservation-data` sono deployate,
e a quale data.

Se la CLI non è autenticata, fermati e dillo: non aggirare con altro.

---

## 6 — Chiusura

Scrivi il rapporto in `docs/verifica-prenotazioni-fase0.md`, con in testa **tre righe
secche**: cosa risulta funzionante, cosa risulta deployato ma mai eseguito, cosa non è
stato possibile verificare e perché.

**Poi fermati.** Non proporre correzioni, non aprire file per capire come sistemare,
non creare migration, non toccare il vault. Le decisioni si prendono dopo aver letto
il rapporto.
