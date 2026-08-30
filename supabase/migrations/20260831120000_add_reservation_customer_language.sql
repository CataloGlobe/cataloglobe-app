-- =========================================
-- RESERVATIONS — lingua scelta dal cliente
-- =========================================
-- La pagina pubblica parla cinque lingue (it, en, fr, de, es); le email
-- transazionali al cliente parlavano solo italiano. Questa colonna e' il
-- pezzo che mancava: registra in che lingua il cliente stava leggendo quando
-- ha premuto "Prenota", e le email (ricevuta, conferma, promemoria, esito) +
-- le stringhe dell'allegato .ics vengono rese in quella lingua.
--
-- Le email alla SEDE restano italiane in ogni caso: il destinatario e' il
-- ristoratore, la dashboard e' solo italiana. Questa colonna non le riguarda.
--
-- NULLABLE, SENZA DEFAULT — deliberato. I due fatti sono diversi:
--   NULL  = non lo sappiamo. Prenotazione inserita a mano dall'admin (il
--           ristoratore non sa in che lingua pensa il cliente, e inventarlo
--           sarebbe peggio che ammettere di non saperlo), oppure riga
--           anteriore a questa migration.
--   'it'  = il cliente ha SCELTO italiano.
-- Un DEFAULT 'it' appiattirebbe i due casi e brucerebbe per sempre la
-- possibilita' di sapere quante prenotazioni arrivano in lingua straniera.
-- Il fallback a italiano vive nel codice che rende l'email, non nello schema.
--
-- NESSUN CHECK e NESSUNA FK a supported_languages — deliberato anche questo.
--   - La FK ammetterebbe tutte e 33 le lingue del catalogo traduzioni, cioe'
--     28 valori che le email non sanno comunque rendere: darebbe una garanzia
--     che non e' quella che serve.
--   - Un CHECK sulle cinque lingue di oggi trasformerebbe l'aggiunta di una
--     sesta lingua UI in una migration, e soprattutto farebbe FALLIRE una
--     scrittura per un valore inatteso. Una prenotazione non si perde per la
--     lingua in cui e' stata presa.
-- Il valore e' validato di forma lato Edge (minuscolo, 2-5 lettere, altrimenti
-- NULL) e ricondotto a italiano al momento di comporre l'email quando non e'
-- una delle cinque supportate. Un 'pt' salvato resta un dato onesto: dice che
-- qualcuno ha prenotato leggendo in portoghese, anche se l'email era italiana.
--
-- SCRITTURA: come per `customer_phone_e164`, l'INSERT resta di
-- `place_online_reservation` (RPC intatta) e il valore arriva con un UPDATE
-- mirato best-effort subito dopo, emesso da `submit-reservation`. Se
-- quell'UPDATE fallisce la colonna resta NULL e l'email parte in italiano:
-- nessuna prenotazione viene persa per una lingua.
--
-- NESSUN BACKFILL: le righe esistenti sono state prese quando il dato non
-- veniva raccolto. NULL e' la loro descrizione corretta.
--
-- NESSUN INDICE: l'unico consumo previsto e' l'aggregato analitico su volumi
-- da poche migliaia di righe per tenant, gia' filtrato per tenant/activity.
--
-- Solo ALTER TABLE + COMMENT: nessuna CREATE FUNCTION, nessun GRANT/REVOKE,
-- quindi sicura per un `supabase db push` in singolo file.

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS customer_language text NULL;

COMMENT ON COLUMN public.reservations.customer_language IS
    'Codice lingua (ISO 639-1, minuscolo) in cui il cliente stava leggendo la pagina pubblica al momento del submit. Determina la lingua delle email al cliente e delle stringhe dell''.ics; le email alla sede restano italiane. NULL = lingua ignota (inserimento manuale da dashboard, o riga anteriore alla migration 20260831120000): NON e'' sinonimo di ''it''. Nessun DEFAULT e nessun CHECK per scelta: il fallback a italiano e'' applicato dal codice che compone l''email.';
