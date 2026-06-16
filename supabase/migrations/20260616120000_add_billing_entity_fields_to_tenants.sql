-- =============================================================================
-- Anagrafica intestatario fattura sul tenant (Fiscozen onboarding).
-- legal_name, vat_number, fiscal_code, pec e i campi indirizzo legale
-- (address, street_number, postal_code, city, province, country) ESISTONO GIA'
-- (migration 20260518095654_add_legal_fields_to_tenants): non ricrearli qui.
-- Tutte le colonne sono nullable: dati raccolti nello step "Dati di fatturazione"
-- del wizard CreateBusinessWizard.
-- =============================================================================

ALTER TABLE public.tenants
    ADD COLUMN legal_entity_type text
        CHECK (legal_entity_type IN ('societa', 'professionista', 'associazione')),
    ADD COLUMN first_name text,
    ADD COLUMN last_name text,
    ADD COLUMN codice_destinatario text;
