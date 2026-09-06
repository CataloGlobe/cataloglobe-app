-- =============================================================================
-- Retention prenotazioni: 24 → 36 mesi (solo commenti)
-- =============================================================================
--
-- Il periodo di conservazione dichiarato nell'informativa privacy prenotazioni
-- passa da 24 a 36 mesi. Motivo: il ciclo stagionale. Un locale turistico vede
-- lo stesso cliente una volta l'anno, e con due anni basta che ne salti uno per
-- perdere tutto lo storico; tre anni coprono quel caso restando proporzionati
-- alla finalita' dichiarata, cioe' riconoscere il cliente che torna.
--
-- ── Perche' una migration per due commenti ─────────────────────────────────
-- La soglia NON e' nel database: `list_expired_reservation_guests` e
-- `list_expired_orphan_reservations` ricevono `p_cutoff` gia' calcolata, e il
-- numero di mesi vive in `RETENTION_MONTHS` dentro `purge-reservation-data`.
-- Quindi qui non cambia nessun comportamento: cambia solo la descrizione delle
-- due funzioni, che oggi dichiara "retention 24 mesi" e da questo commit
-- direbbe il falso a chi ispeziona lo schema.
--
-- I commenti stanno nella migration `20260903160000`, gia' applicata: non si
-- modifica una migration esistente, e riscrivere quel file non aggiornerebbe
-- comunque il `COMMENT ON` gia' materializzato nel database. Da qui questo file.
--
-- Nessun DDL sulle funzioni: firma, corpo e privilegi restano quelli della
-- migration originale.
-- =============================================================================

COMMENT ON FUNCTION public.list_expired_reservation_guests(date, integer) IS
  'Profili rubrica la cui ultima prenotazione e'' anteriore a p_cutoff. Usata da purge-reservation-data (retention 36 mesi).';

COMMENT ON FUNCTION public.list_expired_orphan_reservations(date, integer) IS
  'Prenotazioni senza profilo, anteriori a p_cutoff e non gia'' anonimizzate. Usata da purge-reservation-data (retention 36 mesi).';
