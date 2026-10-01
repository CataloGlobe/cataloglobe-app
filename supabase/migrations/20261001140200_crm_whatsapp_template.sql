-- =============================================================================
-- CRM interno (Fase 0): testo iniziale del messaggio WhatsApp pronto
-- =============================================================================
-- Approvato da Alex il 2026-10-01. Lo manda Alex a mano, come Alessandro di
-- CataloGlobe; {nome} e {locale} li riempie /admin. Si cambia da /admin
-- (Impostazioni): questa migration scrive solo se il testo è ancora vuoto.
-- =============================================================================

UPDATE public.crm_settings
SET whatsapp_template = E'Ciao {nome}, sono Alessandro di CataloGlobe.\nHo visto la richiesta che hai lasciato per {locale}, grazie!\n\nTi scrivo per capire cosa ti serve (menù digitale, prenotazioni, ordini al tavolo) e mostrarti come funziona in una breve chiamata.\n\nQuando ti è più comodo sentirci?'
WHERE id = true AND whatsapp_template IS NULL;
