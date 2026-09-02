-- =============================================================================
-- RUBRICA CLIENTI — view derivate (storico + aggregati + elenco)
-- =============================================================================
-- Qui vive tutto cio' che e' CALCOLATO dalle prenotazioni. Nessun contatore
-- e' materializzato: `no_show` e' reversibile per design, e un contatore
-- scritto a mano diverge alla prima marcatura corretta.
--
-- SICUREZZA — il punto delicato di questa fase.
-- Il profilo e' dell'azienda (tenant), le prenotazioni sono della sede
-- (activity, RLS via has_permission('reservations.read', activity_id)). Senza
-- precauzioni, aprire un profilo mostrerebbe a un manager di Comasina le
-- visite fatte a Garbagnate: dati di un'altra sede, a cui non ha accesso.
--
-- Le view sono `security_invoker = on`: le policy di `reservations` vengono
-- valutate con l'identita' di CHI LEGGE, riga per riga. Il filtro non e'
-- riscritto qui e non puo' quindi divergere dalla policy.
--   ⚠️ `security_invoker = on` NON e' un dettaglio di stile: senza, la view
--   girerebbe con i privilegi del proprietario e leggerebbe TUTTE le
--   prenotazioni di tutte le sedi. Regression test:
--   supabase/tests/reservation_guests_rls.test.sql (test 3).
--
-- CONSEGUENZA VOLUTA E DA MOSTRARE IN UI: i conteggi sono relativi a chi
-- guarda. Sullo stesso profilo l'owner puo' leggere "7 visite" e un manager
-- mono-sede "3 visite". Non e' un bug: e' l'unica lettura onesta possibile per
-- chi non ha accesso alle altre sedi. L'interfaccia deve dire "nelle tue sedi",
-- non "in totale".
--
-- File separato dalla tabella: `DROP VIEW` + `CREATE VIEW` nello stesso file di
-- una CREATE TABLE fa fallire `supabase db push` con 42601.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Storico visite — una riga per prenotazione agganciata a un profilo
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_reservation_guest_visits;
CREATE VIEW public.v_reservation_guest_visits
WITH (security_invoker = on) AS
SELECT
  r.id               AS reservation_id,
  r.guest_id,
  r.tenant_id,
  r.activity_id,
  a.name             AS activity_name,
  r.reservation_date,
  r.reservation_time,
  r.party_size,
  r.status,
  -- Note scritte DAL CLIENTE su quella prenotazione ("allergico alle spezie").
  -- Restano qui, accanto alla visita a cui si riferiscono: non confluiscono
  -- mai in reservation_guests.venue_notes, che ha un altro autore.
  r.notes            AS guest_notes,
  r.source,
  r.created_at
FROM public.reservations r
-- LEFT JOIN e non INNER: `activities` ha una RLS propria (activity.read). Un
-- ruolo con reservations.read ma senza activity.read perderebbe le righe con
-- un INNER JOIN — una visita sparirebbe dallo storico per un permesso che non
-- c'entra. Meglio la visita senza nome sede che nessuna visita.
LEFT JOIN public.activities a ON a.id = r.activity_id
WHERE r.guest_id IS NOT NULL;

COMMENT ON VIEW public.v_reservation_guest_visits IS
  'Storico visite per profilo ospite. security_invoker: filtrata riga per riga dalla RLS di reservations, quindi mostra solo le sedi su cui il caller ha reservations.read.';

-- -----------------------------------------------------------------------------
-- 2. Aggregati per profilo
-- -----------------------------------------------------------------------------
-- Aggrega la view 1, quindi eredita lo stesso filtro per sede. `visible_*` nel
-- nome per ricordare a chi scrive UI che questi numeri dipendono da chi legge.
DROP VIEW IF EXISTS public.v_reservation_guest_stats;
CREATE VIEW public.v_reservation_guest_stats
WITH (security_invoker = on) AS
SELECT
  g.id        AS guest_id,
  g.tenant_id,
  COUNT(v.reservation_id)                                          AS visible_visits,
  COUNT(v.reservation_id) FILTER (WHERE v.status = 'confirmed')    AS visible_confirmed,
  COUNT(v.reservation_id) FILTER (WHERE v.status = 'no_show')      AS visible_no_shows,
  COUNT(v.reservation_id) FILTER (WHERE v.status = 'cancelled')    AS visible_cancelled,
  MIN(v.reservation_date)                                          AS first_visit_date,
  MAX(v.reservation_date)                                          AS last_visit_date,
  COUNT(DISTINCT v.activity_id)                                    AS visible_activities
FROM public.reservation_guests g
LEFT JOIN public.v_reservation_guest_visits v ON v.guest_id = g.id
GROUP BY g.id, g.tenant_id;

COMMENT ON VIEW public.v_reservation_guest_stats IS
  'Aggregati per profilo, calcolati (mai materializzati: no_show e'' reversibile). I conteggi sono relativi alle sedi visibili al caller — prefisso visible_.';

-- -----------------------------------------------------------------------------
-- 3. Elenco rubrica
-- -----------------------------------------------------------------------------
-- Cio' che la pagina "Clienti" legge. Il filtro `visible_visits > 0` non e'
-- cosmetico: senza, un manager di una sola sede vedrebbe elencati clienti che
-- non ha mai servito — nomi e telefoni di un'altra sede, senza nemmeno una
-- visita a giustificarli.
DROP VIEW IF EXISTS public.v_reservation_guests_directory;
CREATE VIEW public.v_reservation_guests_directory
WITH (security_invoker = on) AS
SELECT
  g.id,
  g.tenant_id,
  g.phone_e164,
  g.display_name,
  g.email,
  g.venue_notes,
  g.tags,
  s.visible_visits,
  s.visible_no_shows,
  s.first_visit_date,
  s.last_visit_date,
  s.visible_activities,
  g.created_at,
  g.updated_at
FROM public.reservation_guests g
JOIN public.v_reservation_guest_stats s ON s.guest_id = g.id
WHERE s.visible_visits > 0;

COMMENT ON VIEW public.v_reservation_guests_directory IS
  'Elenco rubrica clienti. Esclude i profili senza alcuna visita visibile al caller.';
