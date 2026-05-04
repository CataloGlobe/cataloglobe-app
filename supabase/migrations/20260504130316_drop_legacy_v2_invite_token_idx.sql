-- Cleanup: drop indice legacy v2_invite_token_idx duplicato.
--
-- Canonico tenant_memberships_invite_token_idx (UNIQUE) copre lo stesso predicato:
--   btree (invite_token) WHERE invite_token IS NOT NULL
-- v2_invite_token_idx è non-UNIQUE su stessa colonna+predicato → ridondante.
--
-- NB: NON viene droppato v2_unique_pending_invites — quello è un indice UNIQUE
-- vivo che enforce "1 invito pending per (tenant_id, lower(invited_email))".

BEGIN;

DROP INDEX IF EXISTS public.v2_invite_token_idx;

COMMIT;
