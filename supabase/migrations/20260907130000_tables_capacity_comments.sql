-- ============================================================================
-- Solo COMMENT: chiarisce due semantiche che lo schema da solo non racconta.
-- Nessun cambiamento strutturale. Le migration precedenti non si toccano.
-- ============================================================================

-- 1. Transitivita' dentro il gruppo di accostamento.
COMMENT ON TABLE public.table_combination_groups IS
    'Gruppi di tavoli fisicamente accostabili. Distinto da table_zones (area operativa): la zona e'' dove si serve, il gruppo e'' cosa si accosta. '
    'SEMANTICA: stesso gruppo = TUTTI i tavoli del gruppo sono accostabili fra loro, a coppie e in combinazione (relazione transitiva, non una catena ordinata). '
    'La precisione dipende da quanto il ristoratore tiene PICCOLI i gruppi: in una fila di sei tavoli dichiarati come un solo gruppo, il modello considera accostabili anche il primo e l''ultimo, che fisicamente non lo sono. '
    'Gruppi piccoli e locali ("Fila finestra", "Isola centrale") = modello fedele; un gruppo unico per tutta la sala = modello che manda il cameriere a spostare mobili. '
    'tables.combination_group_id NULL = tavolo non accostabile ad alcunche'' (default sicuro, opt-in).';

-- 2. Capienza sconosciuta: seats NULL e max_seats NULL insieme.
COMMENT ON COLUMN public.tables.max_seats IS
    'Capienza massima aggiungendo sedie. NULL = nessuna sedia in piu'': il tetto e'' seats. '
    'Il tetto effettivo e'' COALESCE(max_seats, seats). Se ANCHE seats e'' NULL il tetto e'' NULL: capienza SCONOSCIUTA, non "illimitata". '
    'Un tavolo a capienza sconosciuta non e'' assegnabile automaticamente a nessuna prenotazione (il motore non puo'' sapere se il gruppo ci sta) e va escluso dai candidati, non trattato come tavolo grande. '
    'Resta assegnabile a mano dal ristoratore, che il tavolo lo vede. Stesso caso per la somma dei posti mappati mostrata nelle impostazioni: un tavolo senza posti non contribuisce al totale.';

COMMENT ON COLUMN public.tables.min_seats IS
    'Capienza minima assegnabile: sotto questo numero il tavolo non va proposto (evita la coppia al tavolo da otto). '
    'NULL = nessun minimo, il tavolo accetta qualsiasi gruppo che ci stia. Pavimento effettivo: COALESCE(min_seats, 1).';

COMMENT ON COLUMN public.tables.seats IS
    'Posti nell''apparecchiatura normale del tavolo. Campo principale di capienza: unico letto dal dominio ordini, base del tetto e della somma posti mappati. '
    'NULL = capienza non dichiarata (vedi max_seats).';
