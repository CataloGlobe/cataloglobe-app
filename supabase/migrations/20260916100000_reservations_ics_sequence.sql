-- =============================================================================
-- reservations.ics_sequence — la versione dell'evento nel calendario del cliente
-- =============================================================================
-- BLOCCO 4 · FASE 4.2. RFC 5546: un evento pubblicato con METHOD:PUBLISH si
-- aggiorna con un altro PUBLISH e si annulla con CANCEL, PURCHÉ il client
-- possa capire quale copia è la più recente. Lo fa con SEQUENCE: stesso UID,
-- numero più alto = versione che vince. Senza, la conferma e il promemoria
-- (stesso UID, DTSTART diverso dopo uno spostamento) sono indistinguibili e
-- un client che rispetta la specifica può ignorare l'aggiornamento.
--
-- Parte da 0 (la conferma iniziale). Si incrementa SOLO per i cambiamenti che
-- invalidano l'evento: data/ora (DTSTART/DTEND) e annullamento/rifiuto
-- (STATUS). L'incremento è un trigger BEFORE UPDATE (20260916100100..100500):
-- avviene nella STESSA transazione del cambio, per qualunque scrittore. Un
-- SEQUENCE che resta indietro rispetto al DTSTART è peggio di nessun SEQUENCE.
-- =============================================================================

ALTER TABLE public.reservations
    ADD COLUMN ics_sequence integer NOT NULL DEFAULT 0;
