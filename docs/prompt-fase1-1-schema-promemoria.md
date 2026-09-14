# FASE 1.1 — Schema per il promemoria osservabile

**Crei le migration e ti fermi.** Non eseguirle: `db push` lo faccio io.
Nessun commit, nessun `git add`. Working tree condiviso con sessioni parallele sulla
stampa delle comande: non toccarlo.

## Perché

Diagnosi della FASE 0-bis: il 09/09 il claim atomico del promemoria ha preso un
`504 Gateway Timeout` sul PATCH, il ramo `if (claimError)` ha incrementato `failed` ed
è passato oltre. Nessun ritentativo, cron una volta al giorno, promemoria perso per
sempre — e l'unica traccia era una riga di `console.log` che nessuno legge.

Il codice si corregge nella 1.2. Qui si costruisce **il modo di accorgersene**: senza,
non potremmo nemmeno dire di aver risolto, perché continueremmo a guardare lo stesso
`succeeded` del cron che non ha mai voluto dire niente.

Due domande devono avere risposta a colpo d'occhio: *"il promemoria ha funzionato
stasera?"* e *"questa prenotazione l'ha ricevuto?"*. Servono due cose diverse.

## Prima di scrivere

Guarda `20260829120000_add_reservation_reminder_columns.sql` — è la migration che ha
introdotto `reminder_sent_at`, e i suoi commenti spiegano l'invariante del claim.
Resta valida: qui si aggiunge accanto, non si cambia.

Segui il pattern delle migration di creazione tabella del progetto (transazionali,
tabella + indici + trigger + permessi + RLS in un file). Il vincolo "un file = un
comando" riguarda le migration che mescolano `CREATE FUNCTION` con `GRANT`/`REVOKE`:
qui non ce ne sono.

## I due file

### 1. `reservations_reminder_diagnostics.sql`

`ALTER TABLE public.reservations`, tre colonne:

- `reminder_attempts int NOT NULL DEFAULT 0` — quante volte ci abbiamo provato.
- `reminder_failed_at timestamptz NULL` — quando l'ultimo tentativo è fallito.
  NULL non significa "riuscito": significa "mai fallito", e su una riga con
  `reminder_sent_at` NULL vuol dire che non era un candidato.
- `reminder_last_error text NULL` — il motivo, in chiaro, dell'ultimo fallimento.

`COMMENT ON COLUMN` su tutte e tre, nello stile della migration del 29/08: dicono cosa
significa il NULL, che è la parte che si dimentica.

**Non toccare `reminder_sent_at`** e non cambiare l'indice parziale esistente
`idx_reservations_reminder_pending`: il claim resta quello che è.

### 2. `create_reservation_reminder_runs.sql`

Tabella `public.reservation_reminder_runs` — una riga per esecuzione della funzione.

- `id`, `tenant_id` **NON serve**: la funzione gira con `service_role` su tutte le sedi
  e una passata non appartiene a un tenant. Questa è l'eccezione, dichiarala nel
  commento in testa al file così nessuno la legge come una dimenticanza.
- `target_date date NOT NULL` — la data per cui si mandava.
- `started_at timestamptz NOT NULL DEFAULT now()`, `finished_at timestamptz NULL`
- `trigger_source text NOT NULL CHECK (trigger_source IN ('cron','manual'))`
  — l'invio riuscito del 30/08 alle 17:17 era un'invocazione a mano, e non poterlo
  distinguere ci ha fatto contare tre successi del cron quando erano due.
- `candidates int NOT NULL DEFAULT 0`, `sent int NOT NULL DEFAULT 0`,
  `failed int NOT NULL DEFAULT 0`
- `skipped jsonb NOT NULL DEFAULT '{}'::jsonb` — il dettaglio per motivo
  (`subscription`, `venue_inactive`, `reminder_disabled`, `no_email`, …). JSONB e non
  colonne: i motivi cambieranno, e non voglio una migration per ognuno.
- `errors jsonb NOT NULL DEFAULT '[]'::jsonb` — al massimo i primi N errori, con
  `reservation_id` e messaggio. **Mai indirizzi email, mai numeri di telefono.**
- `created_at`

Indice su `(target_date DESC)` e su `(started_at DESC)`.

RLS: abilitata. Scrive solo `service_role` (che bypassa). In lettura: chi ha
`reservations.read` **su almeno una sede** — usa `has_permission_any_activity`, che
esiste già. Nessuna policy di insert/update/delete per `authenticated`: questa tabella
è un registro, non un dato modificabile.

## Vincoli

- Migration nuove, mai modificare le esistenti.
- `DROP POLICY` sempre con `IF EXISTS`.
- Nessuna modifica di comportamento: nessuno scrive ancora in queste colonne e in
  questa tabella. Il codice arriva nella 1.2.
- Non rigenerare `database.types.ts`.

## Chiusura

Elenca i due file con una riga a testa e **fermati**. Non applicare, non proporre la
1.2, non toccare la Edge Function.
