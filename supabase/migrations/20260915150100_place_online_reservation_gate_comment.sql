-- =============================================================================
-- place_online_reservation — dove NON vive il cancello su orari e preavviso
-- =============================================================================
-- BLOCCO 4 · FASE 4.1. Nessun cambio al corpo (20260907160700): si registra
-- nel catalogo, dove un futuro secondo chiamante la troverà, la divisione dei
-- controlli.
--
-- Dentro la RPC, sotto advisory lock: capienza e pacing — sono i due gate che
-- competono con gli altri submit concorrenti e vanno decisi in serie.
--
-- FUORI dalla RPC, nella Edge `submit-reservation` prima della chiamata:
-- orari di apertura e chiusure straordinarie, orario sulla griglia, preavviso
-- minimo, orizzonte (`isReservationTimeBookable`,
-- supabase/functions/_shared/openingHours.ts). Non c'è TOCTOU reale: gli
-- orari di una sede non cambiano nel millisecondo fra controllo e insert. La
-- RPC è GRANT solo a service_role e ha un chiamante solo; chi ne aggiunge un
-- secondo deve ripetere quel cancello o accettare di saltarlo.
-- =============================================================================

COMMENT ON FUNCTION public.place_online_reservation(
    uuid, date, time, int, text, text, text, text, text
) IS
    'Inserimento atomico di una prenotazione online: pacing e capienza sotto '
    'advisory lock per sede. NON controlla orari di apertura, chiusure, '
    'griglia, preavviso minimo né orizzonte: quel cancello vive nella Edge '
    'submit-reservation (isReservationTimeBookable, _shared/openingHours.ts) '
    'prima della chiamata. Un secondo chiamante deve ripeterlo.';
