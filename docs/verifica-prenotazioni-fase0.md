okei p# FASE 0 — Ricognizione stato reale dominio prenotazioni

**Ambiente**: staging `lxeawrpjfphgdspueiag`, sola lettura via MCP `supabase-staging` + Supabase CLI. Produzione non toccata.

## Riassunto (3 righe)

- **Funzionante**: entrambi i cron job (`send-reservation-reminders`, `purge-reservation-data`) sono `active`, girano regolarmente e ogni run risulta `succeeded`; entrambe le Edge Function sono deployate e attive; tutti e 4 i secret del vault esistono; il promemoria ha effettivamente funzionato almeno 3 volte su dati reali (26/08–08/09).
- **Deployato ma con esito incerto/parziale**: almeno un candidato certo (prenotazione San Pietro per il 2026-09-10, confermata l'08/09 ore 20:58, quindi ben prima del cutoff del 09/09 ore 18:00) NON ha ricevuto il promemoria pur essendo il cron del 09/09 ore 16:00 UTC terminato con `succeeded` — la funzione non è quindi affidabile al 100%, anche se non è "mai partita".
- **Non verificabile in questa fase**: la causa del mancato invio per quel singolo caso (serve leggere il codice/log della function, esplicitamente fuori scope qui) e lo stato del job di retention (`purge-reservation-data`) per mancanza di dati storici con cui incrociare gli esiti (nessuna query di verifica dati richiesta per il punto 2, solo esito cron — che è `succeeded` tutti i giorni disponibili).

---

## 1 — I due job cron

Entrambi presenti, `active = true`:

| jobname                      | schedule        | active |
| ---------------------------- | --------------- | ------ |
| `send-reservation-reminders` | `0 16,17 * * *` | true   |
| `purge-reservation-data`     | `15 4 * * *`    | true   |

Run history (ultimi giorni, 03/09–10/09): **tutte le esecuzioni `succeeded`**, per entrambi i job, ogni giorno disponibile. Nessun `failed`, nessun job saltato.

Nota sul doppio slot 16/17 UTC di `send-reservation-reminders`: entrambi gli slot risultano `succeeded` ogni giorno con `return_message: "DO"` — coerente con la guardia descritta (un run reale + un run vuoto in pochi ms). Non si può distinguere dal solo `job_run_details` quale dei due abbia effettivamente chiamato l'Edge Function (il `return_message` del blocco `DO` è identico in entrambi i casi); per questo il punto 3 va verificato sui dati, non sul cron log.

## 2 — Nomi secret nel vault

Tutti e 4 presenti:

- `reservation_reminders_url` ✅ (created 2026-08-29)
- `reservation_reminders_secret` ✅ (created 2026-08-29)
- `purge_reservation_data_url` ✅ (created 2026-09-03)
- `reservation_retention_secret` ✅ (created 2026-09-03)

Nessuno mancante → l'ipotesi "il job esce con NOTICE senza chiamare nulla per secret mancante" **è esclusa**.

## 3 — Il promemoria: partito? c'era qualcosa da mandare?

Conteggio globale su `reservations` (27 righe totali, dal 2026-06-16 al 2026-09-08 per la creazione, ma con date prenotazione fino al 2026-09-10):

- `con_promemoria` (`reminder_sent_at IS NOT NULL`) = **3**
- `con_conferma_presenza` (`guest_confirmed_at IS NOT NULL`) = **1**

**Non è uno zero**: ci sono stati candidati e la funzione ha effettivamente inviato promemoria almeno 3 volte, su dati reali:

| prenotazione                | data                                          | confermata entro cutoff giorno-prima 18:00? | reminder_sent_at                                                                                               |
| --------------------------- | --------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 4e0436f1 (2026-08-30 20:00) | creata 28/08, confirmed prima del 29/08 18:00 | sì                                          | **08-29 16:00:03 UTC** (18:00 Roma) ✅                                                                         |
| e942bd05 (2026-08-31 20:00) | creata 29/08, confirmed prima del 30/08 18:00 | sì                                          | **08-30 15:17:37 UTC** ✅ (+ `guest_confirmed_at` valorizzato: il cliente ha anche cliccato conferma presenza) |
| 42ec8603 (2026-09-04 20:00) | creata 02/09, confirmed prima del 03/09 18:00 | sì                                          | **09-03 16:00:03 UTC** (18:00 Roma) ✅                                                                         |

**Un quarto candidato però NON ha ricevuto il promemoria**, pur essendo un caso analogo ai tre sopra:

| prenotazione                           | data                                             | dettaglio                                                                                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `620f854c-8860-4a5e-b244-7650a61edcb5` | San Pietro, 2026-09-10 11:45, `status=confirmed` | creata 08/09 20:56, confermata 08/09 20:58 — ampiamente prima del cutoff 09/09 18:00. `reminder_sent_at = NULL`. Il cron `send-reservation-reminders` del 09/09 16:00 UTC (= 18:00 Roma) risulta `succeeded` nel punto 1. |

Le altre righe nella finestra 30/08–10/09 non sono candidati validi (o non `confirmed` entro il proprio cutoff, o confermate lo stesso giorno della prenotazione — nessun cron intermedio a cui essere candidate, es. 894ae489 e b382a308 del 31/08).

**Conclusione punto 3**: non siamo nel caso "zero candidati mai capitati" — il promemoria **ha funzionato** almeno 3 volte su dati reali. Ma non è **affidabile al 100%**: esiste almeno 1 candidato verificato (San Pietro, 09-10) con cron `succeeded` e nessun promemoria inviato. La causa di questo singolo miss non è determinabile dai soli dati — richiede lettura codice/log, esplicitamente fuori scope di questa fase.

Nota aggiuntiva emersa (non richiesta esplicitamente ma rilevante per chi leggerà il rapporto): `send-reservation-reminders` è alla versione **8**, deployata il 2026-08-30 23:54:37. I 3 invii riusciti sopra includono 2 avvenuti **prima** di quel deploy (con una versione precedente della function) e 1 avvenuto **dopo** (09-03, riuscito). Il miss del 09-09 è quindi successivo al deploy della v8, così come l'unico successo post-deploy — non permette da solo di imputare il problema al deploy stesso.

## 4 — Configurazione sedi con prenotazioni attive

8 sedi con `enable_reservations = true`. Tutte hanno `reservation_reminder_enabled = true` (inclusa San Pietro — **esclude** l'ipotesi che il miss del punto 3 sia dovuto al flag disattivato). Tutte hanno `reservation_availability_mode = 'continua'` — **nessuna** sede con `'turni'` (nessuna anomalia rilevata su questo campo).

`reservation_capacity` NULL su 6/8 sedi: ALEX'S TEST e San Pietro hanno un valore (2 e 8), le altre 6 (LOLLO'S TEST, McDonald's Garbagnate, McDonald's Varedo, Sede TEST AI, Toast To Coast - Bicocca, Wizard Setup) sono NULL.

San Pietro (la sede del candidato mancato al punto 3): `reservation_reminder_enabled=true`, `reservation_capacity=8`, `n_email_avviso=1`, `ha_email_privacy=false`.

## 5 — Variabili ambiente Edge Function + deploy

`supabase secrets list`: entrambi i nomi presenti — `RESERVATION_REMINDERS_SECRET` ✅, `RESERVATION_RETENTION_SECRET` ✅.

`supabase functions list`:

| function                     | status | version | updated_at (UTC)    |
| ---------------------------- | ------ | ------- | ------------------- |
| `send-reservation-reminders` | ACTIVE | 8       | 2026-08-30 23:54:37 |
| `purge-reservation-data`     | ACTIVE | 5       | 2026-09-04 09:19:20 |

Entrambe deployate e attive. CLI autenticata correttamente, nessun blocco.

---

**Fine rapporto. Nessuna correzione proposta, nessun file aperto oltre queste query, nessuna migration, nessun commit.**
