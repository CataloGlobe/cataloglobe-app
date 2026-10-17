-- =============================================================================
-- Test — multi menù: conversione delle regole layout (20261017120000, 20261017120100)
--
-- Verifica, sui dati dell'ambiente (staging):
--   - ogni layout con un menù è diventata `menu` (stesso id, replace, catalogo in
--     schedule_menu) con una gemella `style` uguale (stato, sedi, fasce, periodo,
--     nome, stile in schedule_style); senza menù è diventata `style` spenta
--   - non restano righe di schedule_layout delle regole convertite; restano
--     solo le layout bozza (senza riga)
--   - in ogni sede l'ordine di oggi (compareLayoutToday) delle regole che possono
--     vincere (accese, non scadute) è uguale a quello per on_air_since dalla più
--     nuova, per i menù e per gli stili (con un ciclo la migration si ferma)
--
-- Uso: tutto in una transazione. Fra la parte «prima» e i controlli va
-- incollato il contenuto delle due migration. Finisce con RAISE EXCEPTION
-- «ESITO: …», che annulla tutto. Provato il 2026-10-17 su staging, con la
-- versione di prima e con quella di oggi (dopo aver rimesso le layout
-- dall'archivio): 25 regole, 18 sedi, 0 cicli, errori: {}.
-- =============================================================================

-- Prima: l'ordine di oggi per sede, lo stato delle regole, le bozze.
BEGIN;
CREATE TEMP TABLE zq AS
SELECT a.id act,s.tenant_id,s.id rule,
row_number()OVER(PARTITION BY a.id ORDER BY
(CASE WHEN s.apply_to_all THEN 0 WHEN EXISTS(SELECT 1 FROM schedule_targets t WHERE t.schedule_id=s.id AND t.target_type='activity' AND t.target_id=a.id)THEN 2 ELSE 1 END)DESC,
((CASE WHEN s.start_at IS NOT NULL OR s.end_at IS NOT NULL THEN 4 ELSE 0 END)+(CASE WHEN s.time_from IS NOT NULL AND s.time_to IS NOT NULL THEN 2 ELSE 0 END)+(CASE WHEN coalesce(cardinality(s.days_of_week),0)>0 THEN 1 ELSE 0 END))DESC,
s.priority,s.created_at,s.id)k
FROM schedules s JOIN schedule_layout sl ON sl.schedule_id=s.id AND sl.catalog_id IS NOT NULL
JOIN activities a ON a.tenant_id=s.tenant_id
WHERE s.rule_type='layout' AND s.enabled AND(s.end_at IS NULL OR s.end_at>now())AND NOT(s.time_mode='window' AND s.start_at IS NOT NULL AND s.end_at IS NULL)AND(s.apply_to_all
OR EXISTS(SELECT 1 FROM schedule_targets t WHERE t.schedule_id=s.id AND t.target_type='activity' AND t.target_id=a.id)
OR EXISTS(SELECT 1 FROM schedule_targets t JOIN activity_group_members g ON g.group_id=t.target_id WHERE t.schedule_id=s.id AND t.target_type='activity_group' AND g.activity_id=a.id));
CREATE TEMP TABLE zb AS SELECT s.id,s.tenant_id,s.enabled,s.apply_to_all,s.time_mode,s.days_of_week,s.time_from,s.time_to,s.start_at,s.end_at,s.name,
(SELECT count(*)FROM schedule_targets t WHERE t.schedule_id=s.id)nt,(SELECT count(*)FROM schedule_slots x WHERE x.schedule_id=s.id)ns
FROM schedules s JOIN schedule_layout sl ON sl.schedule_id=s.id WHERE s.rule_type='layout';
CREATE TEMP TABLE zd AS SELECT count(*)dn FROM schedules s WHERE s.rule_type='layout' AND NOT EXISTS(SELECT 1 FROM schedule_layout sl WHERE sl.schedule_id=s.id);

-- Qui: contenuto di 20261017120000_multimenu_conversion_archive.sql
-- e di 20261017120100_multimenu_convert_layouts.sql.

-- Controlli.
DO $t$
DECLARE e text[] :='{}'; n int; c int; cyc int; acts int;
BEGIN
SELECT count(*)INTO n FROM zb;
SELECT count(*)INTO c FROM schedule_multimenu_conversion;
IF c<>n THEN e:=e||format('archivio %s su %s',c,n); END IF;
IF EXISTS(SELECT 1 FROM zb b JOIN schedule_multimenu_conversion m ON m.schedule_id=b.id JOIN schedules s ON s.id=b.id
WHERE(m.became='menu' AND(s.rule_type<>'menu' OR s.overlap_mode<>'replace' OR NOT EXISTS(SELECT 1 FROM schedule_menu x WHERE x.schedule_id=s.id AND x.catalog_id=m.catalog_id)))
OR(m.became='style' AND(s.rule_type<>'style' OR s.enabled OR NOT EXISTS(SELECT 1 FROM schedule_style x WHERE x.schedule_id=s.id AND x.style_id=m.style_id))))THEN e:=e||'menu o style sbagliati'::text; END IF;
IF EXISTS(SELECT 1 FROM zb b JOIN schedule_multimenu_conversion m ON m.schedule_id=b.id AND m.became='menu'
LEFT JOIN schedules g ON g.id=m.style_rule_id
WHERE g.id IS NULL OR g.rule_type<>'style' OR g.overlap_mode<>'replace' OR g.on_air_since<>m.on_air_since_after
OR(g.enabled,g.apply_to_all,g.time_mode,g.days_of_week,g.time_from,g.time_to,g.start_at,g.end_at,g.name)IS DISTINCT FROM(b.enabled,b.apply_to_all,b.time_mode,b.days_of_week,b.time_from,b.time_to,b.start_at,b.end_at,b.name)
OR NOT EXISTS(SELECT 1 FROM schedule_style x WHERE x.schedule_id=g.id AND x.style_id=m.style_id)
OR(SELECT count(*)FROM schedule_targets t WHERE t.schedule_id=g.id)<>b.nt
OR(SELECT count(*)FROM schedule_slots x WHERE x.schedule_id=g.id)<>b.ns
OR(SELECT count(*)FROM schedule_slots x WHERE x.schedule_id=b.id)<>b.ns)THEN e:=e||'gemella sbagliata'::text; END IF;
IF EXISTS(SELECT 1 FROM schedule_layout sl JOIN zb b ON b.id=sl.schedule_id)THEN e:=e||'righe layout rimaste'::text; END IF;
IF(SELECT count(*)FROM schedules s WHERE s.rule_type='layout')<>(SELECT dn FROM zd)THEN e:=e||'layout rimaste oltre le bozze'::text; END IF;
SELECT count(*)INTO cyc FROM schedule_multimenu_conversion WHERE in_cycle;
SELECT count(DISTINCT act)INTO acts FROM zq;
IF EXISTS(
SELECT 1 FROM(SELECT q.act,q.rule,q.k,row_number()OVER(PARTITION BY q.act ORDER BY s.on_air_since DESC,s.id)k2
FROM zq q JOIN schedules s ON s.id=q.rule)z
WHERE z.k<>z.k2 AND NOT EXISTS(SELECT 1 FROM schedule_multimenu_conversion m JOIN zq q2 ON q2.rule=m.schedule_id WHERE m.in_cycle AND q2.act=z.act))THEN e:=e||'ordine dei menù diverso'::text; END IF;
IF EXISTS(
SELECT 1 FROM(SELECT q.act,q.k,row_number()OVER(PARTITION BY q.act ORDER BY g.on_air_since DESC,g.id)k2
FROM zq q JOIN schedule_multimenu_conversion m ON m.schedule_id=q.rule JOIN schedules g ON g.id=m.style_rule_id)z
WHERE z.k<>z.k2 AND NOT EXISTS(SELECT 1 FROM schedule_multimenu_conversion m JOIN zq q2 ON q2.rule=m.schedule_id WHERE m.in_cycle AND q2.act=z.act))THEN e:=e||'ordine degli stili diverso'::text; END IF;
RAISE EXCEPTION 'ESITO: % regole,% sedi confrontate,% cicli,errori: %(annullato)',n,acts,cyc,e;
END $t$;
