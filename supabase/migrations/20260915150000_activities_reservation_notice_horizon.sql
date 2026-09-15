-- =============================================================================
-- activities — preavviso minimo e orizzonte della prenotazione online
-- =============================================================================
-- BLOCCO 4 · FASE 4.1. Due parametri del cancello server-side che decide se un
-- istante è prenotabile online (`isReservationTimeBookable`, Edge
-- `submit-reservation`):
--
--   reservation_min_notice_minutes  — quanti minuti prima, al minimo, si può
--                                     prenotare. 0 = fino all'istante stesso.
--                                     Lo stesso confronto copre «ora già
--                                     passata»: non è un vincolo a parte.
--   reservation_horizon_days        — quanti giorni avanti, oggi compreso, si
--                                     può prenotare. 90 = il numero che il
--                                     picker pubblico aveva cablato
--                                     (`RESERVATION_HORIZON_DAYS`).
--
-- I default riproducono ESATTAMENTE il comportamento di oggi: nessuna sede
-- cambia. Nessuna UI in questa fase (arriva alla 4.3 con i turni).
--
-- Invariante del blocco: il vincolo chiude il canale online, mai l'operatore.
-- Queste colonne NON vengono lette da `createReservation` (INSERT diretto del
-- pannello) né dal form admin.
-- =============================================================================

ALTER TABLE public.activities
    ADD COLUMN reservation_min_notice_minutes smallint NOT NULL DEFAULT 0
        CONSTRAINT activities_reservation_min_notice_check
        CHECK (reservation_min_notice_minutes >= 0 AND reservation_min_notice_minutes <= 10080),
    ADD COLUMN reservation_horizon_days smallint NOT NULL DEFAULT 90
        CONSTRAINT activities_reservation_horizon_check
        CHECK (reservation_horizon_days >= 1 AND reservation_horizon_days <= 365);
