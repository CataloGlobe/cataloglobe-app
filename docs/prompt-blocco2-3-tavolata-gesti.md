# BLOCCO 2 · FASE 2.3 — Tipi, service layer e i gesti dell'arrivo

Le cinque RPC della 2.2 sono applicate su staging.

**Nessun commit, nessun `git add`.** Working tree condiviso con sessioni parallele.
Nessuna migration in questa fase: è tutto TypeScript.

## Cosa si costruisce

Il minimo che rende la tavolata usabile da un operatore: **"Arrivato"**, **"Servizio
concluso"**, **"Annulla arrivo"** sul drawer della prenotazione.

La vista di servizio — la schermata che l'host tiene aperta all'ingresso — è la 2.4.
La chiusura automatica di fine giornata è la 2.5. Qui non si fanno.

## 1. Tipi

`src/types/seating.ts`, nuovo. `Seating`, `SeatingTable`, `SeatingReservation`.

Commenta il significato dei NULL come si fa in `src/types/reservation.ts`, che è lo
standard di questo progetto:

- `party_size` NULL = **ignoto**, non zero. Una tavolata nasce spesso prima che si
  sappia in quanti sono.
- `closed_at` NULL = aperta.
- `closed_reason` distingue la chiusura dell'operatore da quella del sistema: due fatti
  diversi che sembrano uguali a schema.
- `opened_by_user_id` NULL = aperta senza un utente dietro.

In `src/types/reservation.ts` aggiungi a `V2Reservation` le due colonne che esistono
da giugno e che il tipo non ha mai esposto: `seated_at` e `completed_at`. Scrivi cosa
significa il loro NULL e **chi le scrive** — il ciclo della tavolata, mai l'operatore
direttamente.

## 2. Service layer

`src/services/supabase/seatings.ts`, nuovo. Modello: la sezione "Assegnazione tavoli"
in fondo a `src/services/supabase/reservations.ts` — stesso mapping degli errori RPC
(`42501` → "Operazione non autorizzata", `22023` → messaggio del server), stessa forma
delle firme.

Le cinque scritture: `openSeatingForReservation`, `openWalkinSeating`,
`setSeatingTables`, `closeSeating`, `undoSeating`.

Più le letture che servono al drawer:

- `getSeatingForReservation(reservationId, tenantId)` — la tavolata **aperta**
  collegata, o `null`. Via `seating_reservations` con embed su `seatings`.
- `listSeatingTables(seatingId, tenantId)` — con il tavolo embeddato, come fa
  `listReservationTablesForReservations`: etichetta, `deleted_at`, zona.

Tenant filter difensivo sui SELECT, come ovunque nel progetto.

## 3. Le etichette dei due stati nuovi

`src/utils/reservationStatusMeta.ts` non conosce `seated` e `completed`.

- `seated` → **"Al tavolo"**
- `completed` → **"Servita"**

Non "Seduta" e non "Completata": la prima descrive una postura invece di uno stato del
servizio, la seconda è la traduzione del nome della colonna, non una parola che un
cameriere direbbe. **Fammele rivedere prima del commit** insieme al resto dei testi.

## 4. I gesti nel drawer

In `ReservationDetailDrawer`, nel footer dove già vivono le azioni.

| Stato | Azioni |
|---|---|
| `confirmed` | **Arrivato** (primaria) · Annulla · Non presentato |
| `seated` | **Servizio concluso** (primaria) · Annulla arrivo (secondaria) |
| `completed` | nessuna — terminale |

Gate: `canDoOnActivity(perms, 'seatings.manage', activityId)`. Senza permesso, i
bottoni non si disegnano — come già fanno le azioni esistenti.

### Tre cose che vanno fatte così e non altrimenti

**"Arrivato" è immediato, NON differito.** Le azioni esistenti passano da
`useDeferredCommit` con cinque secondi di annullamento. Qui no: in sala, un tavolo che
risulta libero per cinque secondi dopo che l'host ha premuto "arrivato" è un tavolo che
qualcun altro può assegnare. L'annullamento c'è già ed è un gesto esplicito
(`undo_seating`), che è anche più onesto di una finestra che scade da sola.

**"Annulla arrivo" e "Servizio concluso" sono due cose diverse** e non vanno mai
avvicinate nel layout fino a sembrare varianti. La prima dice "non è successo" e
cancella; la seconda dice "è finito" e conserva. Metti la distanza visiva che serve.

**Il badge del tavolo continua a mostrare il PIANO**, cioè `reservation_tables`, anche
dopo l'arrivo. Mostrare i tavoli reali della tavolata è giusto, ma è la 2.4 —
richiede di caricarli in lista e di distinguere le due fonti nell'interfaccia, e
farlo a metà qui produrrebbe una schermata che a volte dice una cosa e a volte l'altra
senza spiegare perché.

## 5. L'agenda

`ReservationsAgenda` ha un insieme `TERMINAL` con `declined` e `cancelled`, nascosti
dietro un toggle.

`completed` **non** ci va. Vale lo stesso ragionamento già scritto nel file per
`no_show`: rifiutata e annullata sono decisioni prese *prima* del servizio e una volta
prese non interessano più; una tavolata servita è invece com'è andata la serata, e
resta in vista.

`seated` ovviamente resta visibile.

## 6. Test

- Il service layer: mapping degli errori 42501 e 22023, e `getSeatingForReservation`
  che ritorna `null` invece di lanciare quando non c'è tavolata.
- Le etichette dei due stati nuovi in `reservationStatusMeta`.
- La logica che decide quali bottoni mostrare per stato e permesso, estratta in una
  funzione pura e testata lì — non annidata nel JSX. Stesso criterio di
  `reminderStatus.ts`: se è una regola, si testa.

## Chiusura

`npm run test` verde e `tsc` pulito. Elenca i file toccati e i testi italiani da
rivedere, e **fermati**. Nessun commit.

Se emerge una decisione di prodotto che qui non è scritta, fermati e chiedi invece di
sceglierla.
