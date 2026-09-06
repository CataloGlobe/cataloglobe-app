-- =============================================================================
-- Stampanti cloud Sunmi — identificativo "negozio" per sede (`sunmi_shop_id`).
-- =============================================================================
--
-- L'API Sunmi OpenAPI lega ogni stampante a uno `shop_id` che DEVE essere un
-- intero (campo `shop_id: number` nel body di bindShop/unbindShop/onlineStatus).
-- Lo `shop_id` e' un identificativo NOSTRO, non assegnato da Sunmi: Sunmi lo
-- accetta opaco e lo usa solo per raggruppare i dispositivi.
--
-- ── Perche' sulla sede e non sulla stampante ────────────────────────────────
-- Una sede puo' avere piu' stampanti (cucina, bar, pizzeria) che condividono lo
-- stesso "negozio" Sunmi. Il negozio Sunmi e' quindi 1:1 con la sede, mentre le
-- stampanti sono N:1 con la sede (tabella `printers`, migration successiva).
--
-- ── Perche' una sequence dedicata e non un hash dell'uuid ───────────────────
-- Gli uuid delle sedi non entrano in un intero; un hash troncato avrebbe
-- rischio di collisione e non sarebbe leggibile nei log Sunmi. Una sequence
-- bigint garantisce unicita' globale e valori stabili nel tempo.
--
-- ── Assegnazione LAZY ───────────────────────────────────────────────────────
-- La colonna nasce NULL per tutte le sedi. Viene valorizzata solo al primo
-- binding di una stampante (edge function `sunmi-bind-printer`), tramite la
-- funzione `assign_sunmi_shop_id` (migration successiva). Cosi' le sedi che non
-- usano stampanti non consumano id e non compaiono mai lato Sunmi.
--
-- ── Unicita' ────────────────────────────────────────────────────────────────
-- Indice UNIQUE parziale-friendly: piu' NULL sono ammessi (sedi senza
-- stampanti), un valore non-NULL puo' appartenere a una sola sede.
--
-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Nessun impatto: colonna su `activities`, coperta dalle policy esistenti. La
-- scrittura avviene solo con service_role dall'edge function.
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS public.activities_sunmi_shop_id_seq
    AS bigint
    START WITH 1000
    INCREMENT BY 1
    NO CYCLE;

COMMENT ON SEQUENCE public.activities_sunmi_shop_id_seq IS
    'Progressivo per activities.sunmi_shop_id. Parte da 1000 per evitare id a 1-2 cifre facilmente confondibili con altri contatori nei log Sunmi.';

ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS sunmi_shop_id bigint NULL;

CREATE UNIQUE INDEX IF NOT EXISTS activities_sunmi_shop_id_key
    ON public.activities (sunmi_shop_id);

COMMENT ON COLUMN public.activities.sunmi_shop_id IS
    'Identificativo "negozio" usato con l''API Sunmi (bindShop/unbindShop/onlineStatus). Intero perche'' l''API lo richiede numerico. Nostro, non di Sunmi. NULL finche'' la sede non collega la prima stampante (assegnato lazy da assign_sunmi_shop_id). Una sede = un negozio Sunmi; piu'' stampanti condividono lo stesso shop_id.';
