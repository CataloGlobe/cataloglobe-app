-- =============================================================================
-- CG-09: tenant_id delle tabelle di sede uguale al tenant della sede (trigger).
-- =============================================================================
--
-- Funzione e motivazione: 20260930150400_cg09_enforce_activity_tenant_fn.
--
-- Tabelle: tutte le tabelle base con activity_id + tenant_id (information_schema
-- su staging, 2026-09-30), tranne stories che ha già la FK composta
-- (20260928120000). Righe incoerenti su staging e prod: 0 (forensi batch 0),
-- quindi nessuna riga esistente viene bloccata.
--
-- UPDATE OF activity_id, tenant_id: gli update che non toccano le due colonne
-- (cambi di stato, note, orari) non pagano la lettura.
--
-- Ordine con reservations_link_guest (BEFORE, nome precedente in ordine
-- alfabetico, scatta prima): se questo trigger rifiuta, lo statement fallisce
-- e l'upsert in reservation_guests viene annullato con lui. La funzione del
-- link, in più, ricava già il tenant dalla sede (file successivo della serie 202609301507xx).
--
-- La funzione è solo di trigger: nessun EXECUTE per i ruoli client.
-- Idempotente: DROP TRIGGER IF EXISTS prima di ogni CREATE.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.enforce_activity_tenant_match() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.activity_addons;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.activity_addons
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.activity_closures;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.activity_closures
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.activity_group_members;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.activity_group_members
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.activity_hours;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.activity_hours
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.analytics_events;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.analytics_events
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.customer_sessions;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.customer_sessions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.order_groups;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.order_groups
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.orders;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.print_jobs;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.print_jobs
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.print_reprints;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.print_reprints
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.printers;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.printers
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.product_availability_overrides;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.product_availability_overrides
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.reservation_guest_notes;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.reservation_guest_notes
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.reservation_tables;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.reservation_tables
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.reservations;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.reservations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.reviews;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.seating_reservations;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.seating_reservations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.seating_tables;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.seating_tables
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.seatings;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.seatings
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.support_tickets;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.support_tickets
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.table_combination_groups;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.table_combination_groups
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.table_zones;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.table_zones
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.tables;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.tables
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();

DROP TRIGGER IF EXISTS trg_enforce_activity_tenant ON public.tenant_membership_activities;
CREATE TRIGGER trg_enforce_activity_tenant
    BEFORE INSERT OR UPDATE OF activity_id, tenant_id ON public.tenant_membership_activities
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_match();
