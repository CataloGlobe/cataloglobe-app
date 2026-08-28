-- =============================================================================
-- CataloGlobe V2 — Test funzionali RLS: superficie di lettura del ruolo `anon`
--
-- Verifica l'effetto della migration
-- 20260828140000_drop_anon_public_read_tenant_scoped.sql:
--   * le 4 tabelle TENANT-SCOPED non devono piu' restituire nulla ad `anon`
--   * le 2 lookup di PIATTAFORMA devono continuare a restituire righe
--     (`allergens` e' letta dalla pagina pubblica con la anon key)
--
-- NON e' una migration. Non vive in supabase/migrations/ e non viene applicato
-- da `supabase db push`.
--
-- ── DOVE ESEGUIRLO ──────────────────────────────────────────────────────────
-- Supabase Studio → SQL Editor, sul progetto STAGING (lxeawrpjfphgdspueiag).
-- NON su produzione. Va eseguito DOPO l'apply della migration.
--
-- NON e' eseguibile via MCP: quella connessione usa `supabase_read_only_user`,
-- che ha rolbypassrls = true — con bypassrls attivo RLS non viene nemmeno
-- valutata e ogni esito sarebbe un falso verde.
-- Nello SQL Editor la sessione e' `postgres`, membro di `anon`:
-- `SET LOCAL ROLE anon` PERDE bypassrls, quindi RLS viene applicata per
-- davvero. Stessa tecnica di supabase/dev/support_rls_tests.sql.
--
-- ── SICUREZZA ───────────────────────────────────────────────────────────────
-- Sola lettura, e comunque tutto dentro un unico BEGIN … ROLLBACK.
-- Se interrompi a meta', esegui `ROLLBACK;` a mano prima di altro.
--
-- ── PRE-REQUISITO DATI ──────────────────────────────────────────────────────
-- Il DB deve contenere almeno una riga per ciascuna delle 6 tabelle, altrimenti
-- i casi a→d darebbero verde per il motivo sbagliato (0 righe perche' la
-- tabella e' vuota, non perche' RLS blocca). Il caso `precondizioni` lo
-- verifica esplicitamente PRIMA di passare a `anon`.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _esiti (
    ordine   int,
    caso     text,
    atteso   text,
    ottenuto text,
    verdetto text
);

-- Obbligatorio: dopo `SET LOCAL ROLE anon` la sessione perde i privilegi di
-- `postgres` e non puo' piu' scrivere nella temp table — l'INSERT del primo
-- caso fallirebbe con `permission denied for table _esiti`. Il GRANT va qui,
-- prima di qualunque cambio di ruolo.
GRANT INSERT, SELECT ON _esiti TO anon;

-- ── Precondizione: come `postgres` (bypassrls) tutte e 6 le tabelle hanno dati
INSERT INTO _esiti
SELECT
    0,
    'precondizioni — tutte le 6 tabelle non vuote (letto come postgres)',
    'tutte > 0',
    format(
        'ing=%s, p_ing=%s, p_all=%s, p_char_ass=%s, all=%s, char=%s',
        c.ing, c.p_ing, c.p_all, c.p_char_ass, c.all_, c.char_
    ),
    CASE
        WHEN LEAST(c.ing, c.p_ing, c.p_all, c.p_char_ass, c.all_, c.char_) > 0
            THEN 'OK'
        ELSE 'KO — test non significativo, popolare la tabella vuota'
    END
FROM (
    SELECT
        (SELECT count(*) FROM public.ingredients)                        AS ing,
        (SELECT count(*) FROM public.product_ingredients)                AS p_ing,
        (SELECT count(*) FROM public.product_allergens)                  AS p_all,
        (SELECT count(*) FROM public.product_characteristic_assignments) AS p_char_ass,
        (SELECT count(*) FROM public.allergens)                          AS all_,
        (SELECT count(*) FROM public.product_characteristics)            AS char_
) c;

-- =============================================================================
-- Da qui in poi: ruolo `anon`, RLS applicata.
-- =============================================================================
SET LOCAL ROLE anon;

-- ── a) ingredients — anagrafica tenant-scoped: nessuna riga visibile ────────
INSERT INTO _esiti
SELECT 1, 'a) anon SELECT ingredients', '0 righe', n::text,
       CASE WHEN n = 0 THEN 'OK' ELSE 'KO — policy anon ancora presente' END
FROM (SELECT count(*) AS n FROM public.ingredients) q;

-- ── b) product_ingredients — join tenant-scoped ─────────────────────────────
INSERT INTO _esiti
SELECT 2, 'b) anon SELECT product_ingredients', '0 righe', n::text,
       CASE WHEN n = 0 THEN 'OK' ELSE 'KO — policy anon ancora presente' END
FROM (SELECT count(*) AS n FROM public.product_ingredients) q;

-- ── c) product_allergens — join tenant-scoped ───────────────────────────────
INSERT INTO _esiti
SELECT 3, 'c) anon SELECT product_allergens', '0 righe', n::text,
       CASE WHEN n = 0 THEN 'OK' ELSE 'KO — policy anon ancora presente' END
FROM (SELECT count(*) AS n FROM public.product_allergens) q;

-- ── d) product_characteristic_assignments — join tenant-scoped ──────────────
INSERT INTO _esiti
SELECT 4, 'd) anon SELECT product_characteristic_assignments', '0 righe', n::text,
       CASE WHEN n = 0 THEN 'OK' ELSE 'KO — policy anon ancora presente' END
FROM (SELECT count(*) AS n FROM public.product_characteristic_assignments) q;

-- ── e) allergens — lookup di piattaforma: DEVE restare leggibile ────────────
--     Regressione critica: la sheet allergeni pubblica la legge con anon key
--     (src/pages/PublicCollectionPage/PublicCollectionPage.tsx:267).
INSERT INTO _esiti
SELECT 5, 'e) anon SELECT allergens (lookup piattaforma)', '> 0 righe', n::text,
       CASE WHEN n > 0 THEN 'OK' ELSE 'KO — pagina pubblica rotta' END
FROM (SELECT count(*) AS n FROM public.allergens) q;

-- ── f) product_characteristics — lookup di piattaforma: resta leggibile ─────
INSERT INTO _esiti
SELECT 6, 'f) anon SELECT product_characteristics (lookup piattaforma)', '> 0 righe', n::text,
       CASE WHEN n > 0 THEN 'OK' ELSE 'KO — legenda caratteristiche rotta' END
FROM (SELECT count(*) AS n FROM public.product_characteristics) q;

RESET ROLE;

-- ── g) nessuna policy anon residua con USING(true) su tabella tenant-scoped ─
INSERT INTO _esiti
SELECT 7,
       'g) policy anon USING(true) residue sulle 4 tabelle',
       'nessuna',
       COALESCE(string_agg(tablename || '.' || policyname, ', '), '(nessuna)'),
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'KO — DROP non applicato' END
FROM pg_policies
WHERE schemaname = 'public'
  AND 'anon' = ANY(roles)
  AND tablename IN (
      'ingredients',
      'product_ingredients',
      'product_allergens',
      'product_characteristic_assignments'
  );

-- ── h) le policy `authenticated` delle 4 tabelle sono ancora al loro posto ──
--     Il DROP non deve aver toccato la dashboard.
INSERT INTO _esiti
SELECT 8,
       'h) policy authenticated SELECT sulle 4 tabelle',
       '4 tabelle coperte',
       count(DISTINCT tablename)::text || ' tabelle',
       CASE WHEN count(DISTINCT tablename) = 4 THEN 'OK' ELSE 'KO — dashboard a rischio' END
FROM pg_policies
WHERE schemaname = 'public'
  AND 'authenticated' = ANY(roles)
  AND cmd = 'SELECT'
  AND tablename IN (
      'ingredients',
      'product_ingredients',
      'product_allergens',
      'product_characteristic_assignments'
  );

-- =============================================================================
-- ESITO. `verdetto` deve essere OK su TUTTE le righe.
-- =============================================================================
SELECT ordine, caso, atteso, ottenuto, verdetto
FROM _esiti
ORDER BY ordine;

ROLLBACK;
