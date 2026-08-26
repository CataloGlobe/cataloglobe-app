-- =============================================================================
-- CataloGlobe V2 — Test funzionali RLS del supporto (casi a → k)
--
-- NON e' una migration. Non vive in supabase/migrations/ e non viene applicato
-- da `supabase db push`.
--
-- ── DOVE ESEGUIRLO ──────────────────────────────────────────────────────────
-- Supabase Studio → SQL Editor, sul progetto STAGING (lxeawrpjfphgdspueiag).
-- NON su produzione.
--
-- NON e' eseguibile via MCP: quella connessione usa `supabase_read_only_user`,
-- che (1) non puo' fare SET ROLE authenticated, (2) e' in transazione
-- read-only, (3) ha rolbypassrls = true — con bypassrls attivo RLS non viene
-- nemmeno valutata e ogni esito sarebbe un falso verde.
-- Nello SQL Editor la sessione e' `postgres`, membro di `authenticated`:
-- `SET LOCAL ROLE authenticated` PERDE bypassrls, quindi RLS viene applicata
-- per davvero. E' la stessa tecnica usata per platform_admins.
--
-- ── SICUREZZA ───────────────────────────────────────────────────────────────
-- Tutto dentro un unico BEGIN … ROLLBACK: nessuna riga sopravvive.
-- Se interrompi a meta', esegui `ROLLBACK;` a mano prima di altro.
--
-- ── CAST (utenti staging, verificati al 2026-08-27) ─────────────────────────
--   A = b1f8bed2-0d66-4217-af78-6cfe3a43cbf3  owner tenant 7bab4e9d… (cliente)
--   B = 9c40f5c7-cde3-44ee-a01e-c58cb8ef0d66  owner tenant f89f8777… (altro tenant)
--   P = 3009c324-b37d-4ae9-ac95-7560b34a4a4c  platform admin
-- A e B NON sono platform admin: verificato contro public.platform_admins.
-- Fosse altrimenti i casi b/f darebbero verde per il motivo sbagliato.
-- Se gli id non esistono piu', rigenerali con le query in coda al file.
-- =============================================================================

BEGIN;

-- Risultati raccolti qui. L'esito atteso e' scritto accanto: la colonna
-- `verdetto` deve essere OK su TUTTE le righe.
CREATE TEMP TABLE _esiti (
    ordine  int,
    caso    text,
    atteso  text,
    ottenuto text
) ON COMMIT DROP;

-- `authenticated` deve poter scrivere nella temp table, altrimenti i DO block
-- impersonati non possono registrare il proprio esito.
GRANT ALL ON _esiti TO authenticated;

-- Id fissi per poterli referenziare fra un caso e l'altro.
--   ticket A  = aaaa0000-…  ·  messaggi = mmmm0…
CREATE TEMP TABLE _ids (k text primary key, v uuid) ON COMMIT DROP;
INSERT INTO _ids VALUES
  ('ticket_a', 'aaaa0000-0000-4000-8000-000000000001'),
  ('user_a',   'b1f8bed2-0d66-4217-af78-6cfe3a43cbf3'),
  ('tenant_a', '7bab4e9d-63a9-41da-b90e-a3d7fb734d8a'),
  ('act_a',    '3c4aba28-6f55-4605-8244-6b2475263b3e'),
  ('user_b',   '9c40f5c7-cde3-44ee-a01e-c58cb8ef0d66'),
  ('tenant_b', 'f89f8777-daf6-4006-aeda-4314f2921860'),
  ('act_b',    'd02b594c-4f51-4fd1-8849-2b87496764da'),
  ('user_p',   '3009c324-b37d-4ae9-ac95-7560b34a4a4c');
GRANT SELECT ON _ids TO authenticated;

-- =============================================================================
-- CASO a — cliente A apre un ticket sul PROPRIO tenant.
-- Atteso: riesce · status 'open' · created_by = A · created_at timbrato a now()
--         nonostante l'INSERT ne passi uno del 2020 (trigger BEFORE INSERT).
-- =============================================================================
RESET ROLE;
SET LOCAL request.jwt.claims = '{"sub":"b1f8bed2-0d66-4217-af78-6cfe3a43cbf3","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_status text; v_by uuid; v_created timestamptz; v_last timestamptz;
BEGIN
    INSERT INTO public.support_tickets
        (id, tenant_id, activity_id, subject, status, created_by, created_at, last_message_at)
    VALUES
        ('aaaa0000-0000-4000-8000-000000000001',
         '7bab4e9d-63a9-41da-b90e-a3d7fb734d8a',
         '3c4aba28-6f55-4605-8244-6b2475263b3e',
         'TEST RLS — richiesta di prova',
         'open',
         auth.uid(),
         '2020-01-01T00:00:00Z',    -- backdate tentato
         '2020-01-01T00:00:00Z');   -- backdate tentato

    SELECT status, created_by, created_at, last_message_at
      INTO v_status, v_by, v_created, v_last
      FROM public.support_tickets WHERE id='aaaa0000-0000-4000-8000-000000000001';

    INSERT INTO _esiti VALUES (1, 'a — A apre ticket sul proprio tenant',
        'insert ok · open · created_by=A · created_at≈now (backdate ignorato)',
        format('insert ok · %s · created_by_ok=%s · created_at_e_now=%s · last_message_at_e_now=%s',
               v_status,
               (v_by = auth.uid()),
               (v_created > now() - interval '1 minute'),
               (v_last    > now() - interval '1 minute')));
EXCEPTION WHEN others THEN
    INSERT INTO _esiti VALUES (1, 'a — A apre ticket sul proprio tenant',
        'insert ok', format('FALLITO: %s %s', SQLSTATE, SQLERRM));
END $$;

-- =============================================================================
-- CASO b — cliente A apre un ticket su un tenant ALTRUI. Atteso: 42501.
-- =============================================================================
DO $$
BEGIN
    INSERT INTO public.support_tickets (tenant_id, subject, created_by)
    VALUES ('f89f8777-daf6-4006-aeda-4314f2921860', 'TEST RLS — cross-tenant', auth.uid());
    INSERT INTO _esiti VALUES (2, 'b — A apre ticket su tenant di B',
        '42501', 'RIUSCITO ← FUGA CROSS-TENANT');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _esiti VALUES (2, 'b — A apre ticket su tenant di B', '42501', '42501 respinto');
WHEN others THEN
    INSERT INTO _esiti VALUES (2, 'b — A apre ticket su tenant di B', '42501',
        format('altro errore: %s %s', SQLSTATE, SQLERRM));
END $$;

-- =============================================================================
-- CASO c — A apre sul proprio tenant ma aggancia una sede di B. Atteso: 42501.
-- La FK garantisce che la sede esista, non che sia sua: lo chiude l'EXISTS
-- nella WITH CHECK.
-- =============================================================================
DO $$
BEGIN
    INSERT INTO public.support_tickets (tenant_id, activity_id, subject, created_by)
    VALUES ('7bab4e9d-63a9-41da-b90e-a3d7fb734d8a',
            'd02b594c-4f51-4fd1-8849-2b87496764da',   -- sede di B
            'TEST RLS — activity altrui', auth.uid());
    INSERT INTO _esiti VALUES (3, 'c — A aggancia activity_id di B',
        '42501', 'RIUSCITO ← activity cross-tenant accettata');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _esiti VALUES (3, 'c — A aggancia activity_id di B', '42501', '42501 respinto');
WHEN others THEN
    INSERT INTO _esiti VALUES (3, 'c — A aggancia activity_id di B', '42501',
        format('altro errore: %s %s', SQLSTATE, SQLERRM));
END $$;

-- =============================================================================
-- CASO d — A scrive un messaggio author_kind='platform'.
-- Atteso: 42501. E' l'attacco di impersonazione del supporto CataloGlobe.
-- =============================================================================
DO $$
BEGIN
    INSERT INTO public.support_messages (ticket_id, body, author_user_id, author_kind)
    VALUES ('aaaa0000-0000-4000-8000-000000000001',
            'Sono il supporto CataloGlobe, mi servono le tue credenziali.',
            auth.uid(), 'platform');
    INSERT INTO _esiti VALUES (4, 'd — A forgia author_kind=platform',
        '42501', 'RIUSCITO ← IMPERSONAZIONE SUPPORTO');
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _esiti VALUES (4, 'd — A forgia author_kind=platform', '42501', '42501 respinto');
WHEN others THEN
    INSERT INTO _esiti VALUES (4, 'd — A forgia author_kind=platform', '42501',
        format('altro errore: %s %s', SQLSTATE, SQLERRM));
END $$;

-- Messaggio legittimo del cliente, serve ai casi successivi.
DO $$
BEGIN
    INSERT INTO public.support_messages (ticket_id, body, author_user_id, author_kind)
    VALUES ('aaaa0000-0000-4000-8000-000000000001', 'Primo messaggio cliente.',
            auth.uid(), 'customer');
    INSERT INTO _esiti VALUES (5, 'd2 — A scrive author_kind=customer',
        'insert ok', 'insert ok');
EXCEPTION WHEN others THEN
    INSERT INTO _esiti VALUES (5, 'd2 — A scrive author_kind=customer',
        'insert ok', format('FALLITO: %s %s', SQLSTATE, SQLERRM));
END $$;

-- =============================================================================
-- CASO h — A tenta UPDATE sul ticket. Atteso: 0 righe (nessun errore: la
-- USING della sola policy UPDATE non seleziona alcuna riga per lui).
-- CASO i/1 — A tenta DELETE del ticket. Atteso: 0 righe (RESTRICTIVE false).
-- CASO i/2 — A tenta UPDATE di un messaggio. Atteso: 0 righe.
-- =============================================================================
DO $$
DECLARE n_upd int; n_del int; n_msg int;
BEGIN
    UPDATE public.support_tickets SET status='closed'
     WHERE id='aaaa0000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS n_upd = ROW_COUNT;

    DELETE FROM public.support_tickets
     WHERE id='aaaa0000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS n_del = ROW_COUNT;

    UPDATE public.support_messages SET body='alterato'
     WHERE ticket_id='aaaa0000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS n_msg = ROW_COUNT;

    INSERT INTO _esiti VALUES (6, 'h/i — A: update ticket, delete ticket, update messaggio',
        '0 · 0 · 0', format('%s · %s · %s', n_upd, n_del, n_msg));
EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _esiti VALUES (6, 'h/i — A: update ticket, delete ticket, update messaggio',
        '0 · 0 · 0', '42501 respinto (equivalente: nessuna scrittura)');
END $$;

-- =============================================================================
-- CASO f — utente B legge i ticket. Atteso: 0 righe.
-- =============================================================================
RESET ROLE;
SET LOCAL request.jwt.claims = '{"sub":"9c40f5c7-cde3-44ee-a01e-c58cb8ef0d66","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE n_t int; n_m int;
BEGIN
    SELECT count(*) INTO n_t FROM public.support_tickets
     WHERE id='aaaa0000-0000-4000-8000-000000000001';
    SELECT count(*) INTO n_m FROM public.support_messages
     WHERE ticket_id='aaaa0000-0000-4000-8000-000000000001';
    INSERT INTO _esiti VALUES (7, 'f — B legge ticket e messaggi di A',
        '0 · 0', format('%s · %s', n_t, n_m));
END $$;

-- =============================================================================
-- CASO g — platform admin P legge i ticket di TUTTI i tenant. Atteso: li vede.
-- CASO e — P scrive author_kind='platform'. Atteso: riesce.
-- CASO i/3 — P tenta DELETE del ticket. Atteso: 0 righe (la RESTRICTIVE vale
--            anche per lui: i ticket non si cancellano, per nessuno).
-- =============================================================================
RESET ROLE;
SET LOCAL request.jwt.claims = '{"sub":"3009c324-b37d-4ae9-ac95-7560b34a4a4c","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE n_t int; n_del int;
BEGIN
    SELECT count(*) INTO n_t FROM public.support_tickets
     WHERE id='aaaa0000-0000-4000-8000-000000000001';
    INSERT INTO _esiti VALUES (8, 'g — P legge il ticket di un tenant non suo',
        '1', n_t::text);

    INSERT INTO public.support_messages (ticket_id, body, author_user_id, author_kind)
    VALUES ('aaaa0000-0000-4000-8000-000000000001', 'Risposta del supporto.',
            auth.uid(), 'platform');
    INSERT INTO _esiti VALUES (9, 'e — P scrive author_kind=platform',
        'insert ok', 'insert ok');

    DELETE FROM public.support_tickets
     WHERE id='aaaa0000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS n_del = ROW_COUNT;
    INSERT INTO _esiti VALUES (10, 'i/3 — P tenta DELETE del ticket', '0', n_del::text);
EXCEPTION WHEN others THEN
    INSERT INTO _esiti VALUES (9, 'e/g/i3 — blocco platform admin',
        'insert ok', format('FALLITO: %s %s', SQLSTATE, SQLERRM));
END $$;

-- =============================================================================
-- CASO j — riapertura automatica.
-- P chiude il ticket → A scrive → il ticket deve tornare 'open', closed_at
-- NULL, last_message_at aggiornato. E' il trigger AFTER INSERT SECURITY
-- DEFINER: A non ha UPDATE sul ticket, quindi senza trigger resterebbe chiuso.
-- =============================================================================
DO $$
BEGIN
    UPDATE public.support_tickets
       SET status='closed', closed_at=now()
     WHERE id='aaaa0000-0000-4000-8000-000000000001';
END $$;

RESET ROLE;
SET LOCAL request.jwt.claims = '{"sub":"b1f8bed2-0d66-4217-af78-6cfe3a43cbf3","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_status text; v_closed timestamptz; v_last timestamptz;
BEGIN
    INSERT INTO public.support_messages (ticket_id, body, author_user_id, author_kind)
    VALUES ('aaaa0000-0000-4000-8000-000000000001',
            'Il problema si ripresenta.', auth.uid(), 'customer');

    SELECT status, closed_at, last_message_at INTO v_status, v_closed, v_last
      FROM public.support_tickets WHERE id='aaaa0000-0000-4000-8000-000000000001';

    INSERT INTO _esiti VALUES (11, 'j — messaggio cliente su ticket chiuso',
        'open · closed_at NULL · last_message_at≈now',
        format('%s · closed_at_null=%s · last_message_at_e_now=%s',
               v_status, (v_closed IS NULL), (v_last > now() - interval '1 minute')));
EXCEPTION WHEN others THEN
    INSERT INTO _esiti VALUES (11, 'j — messaggio cliente su ticket chiuso',
        'open', format('FALLITO: %s %s', SQLSTATE, SQLERRM));
END $$;

-- =============================================================================
-- CASO k — un messaggio del PLATFORM ADMIN su ticket chiuso NON deve riaprirlo.
-- =============================================================================
RESET ROLE;
SET LOCAL request.jwt.claims = '{"sub":"3009c324-b37d-4ae9-ac95-7560b34a4a4c","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_status text; v_closed_prima timestamptz; v_closed_dopo timestamptz; v_last timestamptz;
BEGIN
    UPDATE public.support_tickets SET status='closed', closed_at=now()
     WHERE id='aaaa0000-0000-4000-8000-000000000001';
    SELECT closed_at INTO v_closed_prima FROM public.support_tickets
     WHERE id='aaaa0000-0000-4000-8000-000000000001';

    INSERT INTO public.support_messages (ticket_id, body, author_user_id, author_kind)
    VALUES ('aaaa0000-0000-4000-8000-000000000001',
            'Chiudiamo pure, buona giornata.', auth.uid(), 'platform');

    SELECT status, closed_at, last_message_at INTO v_status, v_closed_dopo, v_last
      FROM public.support_tickets WHERE id='aaaa0000-0000-4000-8000-000000000001';

    INSERT INTO _esiti VALUES (12, 'k — messaggio platform su ticket chiuso',
        'closed · closed_at invariato · last_message_at≈now',
        format('%s · closed_at_invariato=%s · last_message_at_e_now=%s',
               v_status, (v_closed_dopo = v_closed_prima),
               (v_last > now() - interval '1 minute')));
EXCEPTION WHEN others THEN
    INSERT INTO _esiti VALUES (12, 'k — messaggio platform su ticket chiuso',
        'closed', format('FALLITO: %s %s', SQLSTATE, SQLERRM));
END $$;

-- =============================================================================
-- CASO extra — i messaggi NON sono retrodatabili (trigger BEFORE INSERT su
-- support_messages). Senza, si altera l'ordine apparente del thread.
-- =============================================================================
DO $$
DECLARE v_created timestamptz;
BEGIN
    INSERT INTO public.support_messages (ticket_id, body, author_user_id, author_kind, created_at)
    VALUES ('aaaa0000-0000-4000-8000-000000000001', 'Messaggio con data forzata.',
            auth.uid(), 'platform', '2020-01-01T00:00:00Z')
    RETURNING created_at INTO v_created;

    INSERT INTO _esiti VALUES (13, 'extra — created_at messaggio retrodatato',
        'created_at≈now (backdate ignorato)',
        format('created_at_e_now=%s', (v_created > now() - interval '1 minute')));
EXCEPTION WHEN others THEN
    INSERT INTO _esiti VALUES (13, 'extra — created_at messaggio retrodatato',
        'created_at≈now', format('FALLITO: %s %s', SQLSTATE, SQLERRM));
END $$;

-- =============================================================================
-- RISULTATI
-- =============================================================================
RESET ROLE;
SELECT ordine, caso, atteso, ottenuto FROM _esiti ORDER BY ordine;

-- =============================================================================
-- NIENTE VIENE SCRITTO. Se questa riga non gira, esegui ROLLBACK; a mano.
-- =============================================================================
ROLLBACK;

-- =============================================================================
-- Rigenerare il cast se gli id non esistono piu':
--
-- -- due tenant con owner che NON e' platform admin, ciascuno con una sede
-- SELECT t.id AS tenant_id, t.owner_user_id,
--        (SELECT a.id FROM public.activities a
--          WHERE a.tenant_id = t.id ORDER BY a.created_at LIMIT 1) AS activity_id
--   FROM public.tenants t
--  WHERE t.deleted_at IS NULL
--    AND t.owner_user_id IS NOT NULL
--    AND t.owner_user_id NOT IN (SELECT user_id FROM public.platform_admins)
--    AND EXISTS (SELECT 1 FROM public.activities a WHERE a.tenant_id = t.id)
--  LIMIT 5;
--
-- -- un platform admin che non sia owner dei due tenant scelti
-- SELECT user_id FROM public.platform_admins;
-- =============================================================================
