-- =============================================================================
-- Informativa privacy prenotazioni: indirizzo a cui il cliente esercita i
-- propri diritti presso la sede.
-- =============================================================================
--
-- Chi prenota presso una sede affida i propri dati ALLA SEDE: e' il locale il
-- titolare del trattamento, CataloGlobe e' responsabile ex art. 28. L'informativa
-- pubblica che il cliente legge prima di prenotare deve quindi indicare un
-- recapito del locale a cui rivolgersi per accesso, rettifica, cancellazione.
--
-- ── Perche' una colonna dedicata e non un campo esistente ───────────────────
-- Le email che la sede ha gia' non servono a questo scopo:
--
--   * `activities.email_public` e' il contatto commerciale mostrato in vetrina,
--     spesso una casella prenotazioni o info presidiata dalla sala.
--   * `activities.reservation_notification_emails` e' una lista di DESTINATARI
--     DI ALLERT operativi (chi viene avvisato di una nuova prenotazione). Puo'
--     contenere piu' indirizzi, anche personali dei membri del team: pubblicarli
--     in un'informativa sarebbe esattamente il contrario del suo scopo.
--
-- Un canale per l'esercizio dei diritti dell'interessato e' una cosa terza, e va
-- scelto consapevolmente dal ristoratore. Da qui il campo separato.
--
-- ── Nullable per scelta, con fallback all'owner ─────────────────────────────
-- NULL = "non l'ho compilato", ed e' il caso maggioritario atteso. L'informativa
-- in quel caso ripiega sull'email dell'owner del tenant
-- (`tenants.owner_user_id` -> `auth.users.email`, leggibile solo con
-- service_role lato edge). Cosi' chi non tocca nulla ha comunque un'informativa
-- valida con un recapito che funziona, e chi ha un canale privacy dedicato lo
-- dichiara. Nessun NOT NULL: renderebbe la compilazione un prerequisito per
-- salvare qualunque impostazione della sede.
--
-- Il fallback owner NON e' replicato in questa colonna: resta risolto a
-- runtime. Copiarlo qui produrrebbe un valore che si sgancia silenziosamente il
-- giorno che l'owner cambia email.
--
-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Nessun impatto: colonna su `activities`, gia' coperta dalle policy esistenti.
-- La lettura pubblica passa dall'edge function `resolve-public-catalog` con
-- service_role, che decide cosa esporre; il campo NON va nel payload del
-- catalogo, solo in quello dell'informativa.
-- =============================================================================

ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS reservation_privacy_contact_email text NULL;

COMMENT ON COLUMN public.activities.reservation_privacy_contact_email IS
    'Email a cui i clienti che hanno prenotato scrivono per esercitare i diritti GDPR (accesso, rettifica, cancellazione), pubblicata nell''informativa privacy prenotazioni della sede. NULL = fallback all''email dell''owner del tenant, risolto a runtime. NON e'' il contatto commerciale (email_public) ne'' un destinatario di allert (reservation_notification_emails).';
